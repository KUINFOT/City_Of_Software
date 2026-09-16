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
import { createUnsubscribeToken } from '../services/unsubscribe.service';
import { env } from '../config/env';
import { renderStageNotificationEmail, type StageNotificationType } from './templates';
import type { Logger } from '../extraction/core/logger';

/** SCRUM-102: every dispatched email carries this vendor's own unsubscribe link. */
function unsubscribeUrl(userId: Types.ObjectId): string {
  return `${env.publicApiUrl}/vendor-profiles/unsubscribe?token=${createUnsubscribeToken(String(userId))}`;
}

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
    const { subject, text, html } = renderStageNotificationEmail(tor, type, reasons, unsubscribeUrl(userId), { referencesEarlierAlert });
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

    // SCRUM-103: an unsubscribed vendor (channels excludes 'email') never
    // enters the queued-for-email pool — its row is created already 'sent'
    // via in_app, since that's the only delivery that will actually happen.
    // `channels` defaults to ['email','in_app'] on the schema, so absence of
    // the field (an old profile predating this feature) still means "wants
    // email," not "opted out."
    const wantsEmail = profile.notificationPrefs?.channels?.includes('email') !== false;

    let row;
    try {
      row = await NotificationModel.create({
        userId: profile.userId,
        torId: tor._id,
        type,
        matchScore: score,
        reasons,
        relatedNotificationId,
        channel: wantsEmail ? 'email' : 'in_app',
        status: wantsEmail ? 'queued' : 'sent',
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) continue; // already notified this vendor for this TOR/stage
      logger?.warn(`notification create failed for vendor ${profile.userId} / TOR ${tor._id}: ${(err as Error).message}`);
      continue;
    }

    result.notified += 1;

    if (wantsEmail && profile.notificationPrefs?.frequency !== 'daily_digest') {
      void dispatchEmail(row._id as Types.ObjectId, profile.userId as Types.ObjectId, tor, type, reasons, relatedNotificationId != null, logger);
    }
  }

  return result;
}
