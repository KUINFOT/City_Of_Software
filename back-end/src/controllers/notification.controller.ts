import { Request, Response, NextFunction } from 'express';
import { NotificationModel } from '../models/Notification';
import { TorModel } from '../models/Tor';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * GET /api/notifications — EP-04 SCRUM-101's dashboard source: this vendor's
 * own notification history (newest first), each row carrying the reasons
 * snapshotted at creation time. Vendor-gated by requireVendor in the route.
 */
export async function listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authUser = (req as AuthenticatedRequest).authUser;
    const limit = Math.min(toPositiveInt(req.query.limit) ?? 20, 100);

    const notifications = await NotificationModel.find({ userId: authUser.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const torIds = [...new Set(notifications.map((n) => String(n.torId)))];
    // Published-only, same BR-03 guard as every other Tor-facing read here —
    // a TOR that's since been unpublished must not leak through a stale
    // notification row.
    const tors = await TorModel.find({ _id: { $in: torIds }, status: 'published' })
      .select('title agencyName budget.amountThb timeline.submissionDeadline')
      .lean();
    const torById = new Map(tors.map((t) => [String(t._id), t]));

    const rows = notifications
      .map((n) => {
        const tor = torById.get(String(n.torId));
        if (!tor) return null;
        return {
          _id: n._id,
          torId: n.torId,
          torTitle: tor.title,
          agencyName: tor.agencyName,
          budgetThb: tor.budget?.amountThb ?? null,
          submissionDeadline: tor.timeline?.submissionDeadline ?? null,
          type: n.type,
          status: n.status,
          matchScore: n.matchScore ?? null,
          reasons: n.reasons ?? [],
          createdAt: n.createdAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    res.json({ notifications: rows });
  } catch (err) {
    next(err);
  }
}
