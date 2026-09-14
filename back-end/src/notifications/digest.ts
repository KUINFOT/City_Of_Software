/**
 * Daily-digest dispatch (SCRUM-97): consolidates every `queued` Notification
 * for a `daily_digest`-frequency vendor into one email, run on a schedule
 * (see scheduler/index.ts). Instant-frequency vendors never appear here —
 * their emails already went out inline when the Notification row was
 * created (see notifications/dispatch.ts).
 */

import { NotificationModel } from '../models/Notification';
import { VendorProfileModel } from '../models/VendorProfile';
import { UserModel } from '../models/User';
import { TorModel } from '../models/Tor';
import { sendEmail } from '../services/email.service';
import { renderDigestEmail } from './templates';
import type { Logger } from '../extraction/core/logger';

export interface DigestResult {
  vendorsChecked: number;
  vendorsNotified: number;
  notificationsSent: number;
}

export async function runDigestDispatch(logger?: Logger): Promise<DigestResult> {
  const result: DigestResult = { vendorsChecked: 0, vendorsNotified: 0, notificationsSent: 0 };

  const digestVendors = await VendorProfileModel.find({ 'notificationPrefs.frequency': 'daily_digest' })
    .select('userId')
    .lean();

  for (const vendor of digestVendors) {
    result.vendorsChecked += 1;

    const queued = await NotificationModel.find({ userId: vendor.userId, status: 'queued' }).lean();
    if (queued.length === 0) continue;

    const user = await UserModel.findById(vendor.userId).select('email status').lean();
    if (!user?.email || user.status !== 'active') continue;

    const tors = await TorModel.find({ _id: { $in: queued.map((n) => n.torId) } })
      .select('title agencyName')
      .lean();
    const torById = new Map(tors.map((t) => [String(t._id), t]));

    const mapped = queued.map((n) => {
      const tor = torById.get(String(n.torId));
      return tor ? { torId: n.torId, torTitle: tor.title, agencyName: tor.agencyName } : null;
    });
    const items = mapped.filter((item): item is NonNullable<typeof item> => item !== null);
    if (items.length === 0) continue;

    const notificationIds = queued.map((n) => n._id);
    try {
      const { subject, text, html } = renderDigestEmail(items);
      await sendEmail({ to: user.email, subject, text, html });
      await NotificationModel.updateMany({ _id: { $in: notificationIds } }, { $set: { status: 'sent', sentAt: new Date() } });
      result.vendorsNotified += 1;
      result.notificationsSent += items.length;
    } catch (err) {
      await NotificationModel.updateMany({ _id: { $in: notificationIds } }, { $set: { status: 'failed' } });
      logger?.warn(`digest email failed for vendor ${vendor.userId}: ${(err as Error).message}`);
    }
  }

  logger?.info(
    `digest dispatch: checked ${result.vendorsChecked} digest vendor(s), sent to ${result.vendorsNotified}, ` +
      `${result.notificationsSent} notification(s) included`
  );
  return result;
}
