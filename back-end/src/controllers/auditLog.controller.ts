import { Request, Response, NextFunction } from 'express';
import { AuditLogModel } from '../models/AuditLog';

/**
 * GET /api/audit-log — US-045: "any published value can be traced to its
 * origin." Every write this platform makes to a Tor — approve, reject,
 * supersede, a manual field correction, or a manual import — already writes
 * an `AuditLog` entry with a real before/after (see review.controller.ts).
 * This is the read side that actually makes that trail usable: filterable by
 * entity or actor, newest first. An AI-written value's origin is traced the
 * same way a scraped listing's is — through `GET /api/extraction/ai-jobs`
 * (or `/jobs` for the crawl itself) — deliberately not duplicated in here;
 * this collection only ever records actions a person took.
 */
export async function listAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.entityId) filter.entityId = String(req.query.entityId);
    if (req.query.entityType) filter.entityType = String(req.query.entityType);
    if (req.query.actorId) filter.actorId = String(req.query.actorId);
    if (req.query.action) filter.action = String(req.query.action);

    const limit = Math.min(toPositiveInt(req.query.limit) ?? 50, 200);
    const entries = await AuditLogModel.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json(entries);
  } catch (err) {
    next(err);
  }
}

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
