/**
 * Routes a published TOR's `lifecycle.stage` transition to the right
 * notification behaviour (SCRUM-91/94/95). Called from the extraction
 * pipeline's update branch (runner.ts) once per re-scrape that actually
 * changes stage on an already-published record — see that file for the
 * publish-gating and diffing.
 *
 * Stage -> behaviour mapping, and why: `lifecycle.stage` has no literal
 * "public_comment"/"announced"/"withdrawn" value, so this maps onto the
 * closest real signals available (see awardStatus.ts's own documentation of
 * `draft_tor` as "the clearest still looking signal"):
 *   - entering 'draft_tor'    -> comment-stage alert (SCRUM-91)
 *   - entering 'bidding_open' -> announcement-stage alert (SCRUM-94)
 *   - entering 'cancelled'    -> cancel queued alerts (SCRUM-95) — the only
 *     withdrawal signal a PUBLISHED TOR can actually produce today; a
 *     published TOR's platform `status` can never become
 *     superseded/rejected (review.controller.ts only allows those
 *     transitions from pending_review).
 */

import { Types } from 'mongoose';
import { TorModel } from '../models/Tor';
import { NotificationModel } from '../models/Notification';
import { notifyMatchingVendors, type TorForNotification } from './dispatch';
import type { Logger } from '../extraction/core/logger';

export interface StageChange {
  from?: string | null;
  to: string;
}

async function loadTorForNotification(torId: Types.ObjectId): Promise<TorForNotification | null> {
  const tor = await TorModel.findById(torId)
    .select('title agencyName agencyId technologies projectType budget.amountThb')
    .lean();
  if (!tor) return null;
  return tor as unknown as TorForNotification;
}

export async function handleStageTransition(torId: Types.ObjectId, change: StageChange, logger?: Logger): Promise<void> {
  if (change.to === 'draft_tor') {
    const tor = await loadTorForNotification(torId);
    if (!tor) return;
    const result = await notifyMatchingVendors(tor, 'comment_stage', logger);
    logger?.info(`comment-stage notification: TOR ${torId} matched ${result.candidates} vendor(s), notified ${result.notified}`);
    return;
  }

  if (change.to === 'bidding_open') {
    const tor = await loadTorForNotification(torId);
    if (!tor) return;
    const result = await notifyMatchingVendors(tor, 'announcement_stage', logger);
    logger?.info(`announcement-stage notification: TOR ${torId} matched ${result.candidates} vendor(s), notified ${result.notified}`);
    return;
  }

  if (change.to === 'cancelled') {
    const { modifiedCount } = await NotificationModel.updateMany(
      { torId, status: 'queued' },
      { $set: { status: 'cancelled' } }
    );
    if (modifiedCount > 0) {
      logger?.info(`cancelled ${modifiedCount} queued notification(s) for TOR ${torId} (lifecycle.stage -> cancelled)`);
    }
    return;
  }
}
