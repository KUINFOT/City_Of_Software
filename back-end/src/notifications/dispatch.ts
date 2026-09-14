/**
 * Vendor fan-out for a stage-notification event (SCRUM-91/93/94).
 *
 * Scans every vendor profile, scores each against the TOR via
 * matchReasons.ts, and creates one Notification row per vendor that matched
 * on at least one dimension. Dedupe (SCRUM-93) leans entirely on
 * Notification's unique (userId, torId, type) index: a `create()` that hits
 * the duplicate key simply means this vendor was already notified for this
 * TOR at this stage, so it's treated as "already handled," not an error.
 *
 * Notification-row creation is cheap and stays inline/synchronous. The
 * actual email send is fire-and-forget (see `void dispatchEmail(...)`) so a
 * slow or failing SMTP/Resend call can never stall the scrape run that
 * triggered this.
 */

import { Types } from 'mongoose';
import { NotificationModel } from '../models/Notification';
import { UserModel } from '../models/User';
import { VendorProfileModel } from '../models/VendorProfile';
import { computeMatchReasons, type MatchReason } from '../matching/matchReasons';
import { sendEmail } from '../services/email.service';
import { renderStageNotificationEmail, type StageNotificationType } from './templates';
import type { Logger } from '../extraction/core/logger';

export interface TorForNotification {
  _id: Types.ObjectId;
  title: string;
  agencyName: string;
  technologies?: string[] | null;
  projectType?: string | null;
  budget?: { amountThb?: number | null } | null;
  agencyId?: unknown;
}

export interface NotifyResult {
  candidates: number;
  notified: number;
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

async function dispatchEmail(
  notificationId: Types.ObjectId,
  userId: Types.ObjectId,
  tor: TorForNotification,
  type: StageNotificationType,
  reasons: MatchReason[],
  referencesEarlierAlert: boolean,
  logger?: Logger
): Promise<void> {
  try {
    const user = await UserModel.findById(userId).select('email status').lean();
    if (!user?.email || user.status !== 'active') {
      await NotificationModel.updateOne({ _id: notificationId }, { $set: { status: 'failed' } });
      return;
    }
    const { subject, text, html } = renderStageNotificationEmail(tor, type, reasons, { referencesEarlierAlert });
    await sendEmail({ to: user.email, subject, text, html });
    await NotificationModel.updateOne({ _id: notificationId }, { $set: { status: 'sent', sentAt: new Date() } });
  } catch (err) {
    await NotificationModel.updateOne({ _id: notificationId }, { $set: { status: 'failed' } });
    logger?.warn(`email dispatch failed for notification ${notificationId}: ${(err as Error).message}`);
  }
}

export async function notifyMatchingVendors(
  tor: TorForNotification,
  type: StageNotificationType,
  logger?: Logger
): Promise<NotifyResult> {
  const result: NotifyResult = { candidates: 0, notified: 0 };

  const cursor = VendorProfileModel.find({})
    .select('userId techStack interests notificationPrefs')
    .lean()
    .cursor();

  for await (const profile of cursor) {
    const { score, reasons } = computeMatchReasons(tor, profile);
    if (reasons.length === 0) continue;
    result.candidates += 1;

    let relatedNotificationId: Types.ObjectId | null = null;
    if (type === 'announcement_stage') {
      const prior = await NotificationModel.findOne({
        userId: profile.userId,
        torId: tor._id,
        type: 'comment_stage',
      })
        .select('_id')
        .lean();
      relatedNotificationId = (prior?._id as Types.ObjectId | undefined) ?? null;
    }

    let row;
    try {
      row = await NotificationModel.create({
        userId: profile.userId,
        torId: tor._id,
        type,
        matchScore: score,
        reasons,
        relatedNotificationId,
        channel: 'email',
        status: 'queued',
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) continue; // already notified this vendor for this TOR/stage
      logger?.warn(`notification create failed for vendor ${profile.userId} / TOR ${tor._id}: ${(err as Error).message}`);
      continue;
    }

    result.notified += 1;

    if (profile.notificationPrefs?.frequency !== 'daily_digest') {
      void dispatchEmail(row._id as Types.ObjectId, profile.userId as Types.ObjectId, tor, type, reasons, relatedNotificationId != null, logger);
    }
  }

  return result;
}
