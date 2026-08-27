import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { TorModel } from '../models/Tor';
import { AuditLogModel } from '../models/AuditLog';

// TODO: add auth middleware (admin role) once it exists. Until then, every
// write endpoint below takes `actorId` explicitly in the request body as a
// stand-in for `req.user.id`, so the audit trail (FR-ADM-06) at least
// records SOMETHING attributable rather than nothing — but nothing here
// actually verifies the caller is who they claim to be.

/** GET /api/review/queue — FR-ADM-01: pending records, oldest first. */
export async function listReviewQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filter: Record<string, unknown> = { status: 'pending_review' };
    if (req.query.agencyId) filter.agencyId = String(req.query.agencyId);

    const limit = Math.min(toPositiveInt(req.query.limit) ?? 50, 200);
    const records = await TorModel.find(filter)
      .select('title agencyName status extraction.overallConfidence duplicateStatus timeline.submissionDeadline createdAt')
      .sort({ createdAt: 1 })
      .limit(limit);
    res.json(records);
  } catch (err) {
    next(err);
  }
}

/** GET /api/review/queue/:id — full record for the review editor. */
export async function getReviewRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await TorModel.findById(req.params.id).lean();
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    // Built as a loosely-typed response object on purpose: Mongoose Maps
    // don't serialise to JSON as plain objects on their own, and re-typing
    // the whole lean() result just to override one field isn't worth it.
    const response: Record<string, unknown> = { ...record };
    if (record.extraction) {
      response.extraction = {
        ...record.extraction,
        fieldConfidence: mapToObject(record.extraction.fieldConfidence),
      };
    }
    res.json(response);
  } catch (err) {
    next(err);
  }
}

/** POST /api/review/queue/:id/approve — FR-ADM-05: publish, and audit it. */
export async function approveRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { actorId } = req.body as { actorId?: string };
    if (!actorId) {
      res.status(400).json({ error: 'actorId is required' });
      return;
    }

    const record = await TorModel.findById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    if (record.status !== 'pending_review') {
      res.status(409).json({ error: `Record is "${record.status}", not pending_review` });
      return;
    }

    const before = { status: record.status };
    record.status = 'published';
    record.review!.extractionStatus = 'approved';
    record.review!.reviewedBy = new Types.ObjectId(actorId);
    record.review!.reviewedAt = new Date();
    await record.save();

    await AuditLogModel.create({
      actorId,
      action: 'tor.approve',
      entityType: 'tor',
      entityId: record._id,
      before,
      after: { status: 'published' },
      ipAddress: req.ip,
    });

    res.json(record);
  } catch (err) {
    next(err);
  }
}

/** POST /api/review/queue/:id/reject — FR-ADM-03: reject with a recorded reason. */
export async function rejectRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { actorId, reason } = req.body as { actorId?: string; reason?: string };
    if (!actorId) {
      res.status(400).json({ error: 'actorId is required' });
      return;
    }
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'reason is required to reject a record' });
      return;
    }

    const record = await TorModel.findById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    if (record.status !== 'pending_review') {
      res.status(409).json({ error: `Record is "${record.status}", not pending_review` });
      return;
    }

    const before = { status: record.status };
    record.status = 'rejected';
    record.review!.extractionStatus = 'rejected';
    record.review!.reviewedBy = new Types.ObjectId(actorId);
    record.review!.reviewedAt = new Date();
    record.review!.notes = reason;
    await record.save();

    await AuditLogModel.create({
      actorId,
      action: 'tor.reject',
      entityType: 'tor',
      entityId: record._id,
      before,
      after: { status: 'rejected', reason },
      ipAddress: req.ip,
    });

    res.json(record);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/review/queue/:id/supersede — US-040 AC2: resolve a confirmed
 * duplicate. The CURRENT record becomes `superseded`, pointing at
 * `targetTorId`, which remains the sole published record.
 */
export async function supersedeRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { actorId, targetTorId, reason } = req.body as {
      actorId?: string;
      targetTorId?: string;
      reason?: string;
    };
    if (!actorId) {
      res.status(400).json({ error: 'actorId is required' });
      return;
    }
    if (!targetTorId) {
      res.status(400).json({ error: 'targetTorId is required' });
      return;
    }
    if (targetTorId === req.params.id) {
      res.status(400).json({ error: 'A record cannot supersede itself' });
      return;
    }

    const [record, target] = await Promise.all([
      TorModel.findById(req.params.id),
      TorModel.findById(targetTorId).select('status').lean(),
    ]);
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    if (record.status !== 'pending_review') {
      res.status(409).json({ error: `Record is "${record.status}", not pending_review` });
      return;
    }
    if (!target) {
      res.status(404).json({ error: 'targetTorId does not exist' });
      return;
    }
    if (['rejected', 'superseded', 'archived'].includes(target.status)) {
      res.status(409).json({ error: `targetTorId is "${target.status}" and cannot be the surviving record` });
      return;
    }

    const before = { status: record.status };
    record.status = 'superseded';
    record.duplicateOf = new Types.ObjectId(targetTorId);
    record.duplicateStatus = 'confirmed';
    record.review!.reviewedBy = new Types.ObjectId(actorId);
    record.review!.reviewedAt = new Date();
    if (reason) record.review!.notes = reason;
    await record.save();

    await AuditLogModel.create({
      actorId,
      action: 'tor.supersede',
      entityType: 'tor',
      entityId: record._id,
      before,
      after: { status: 'superseded', duplicateOf: targetTorId },
      ipAddress: req.ip,
    });

    res.json(record);
  } catch (err) {
    next(err);
  }
}

/**
 * Normalises a `fieldConfidence` value to a plain object for JSON.
 * A `.lean()` query already flattens a Mongoose Map to a plain object at the
 * type level (though not always at the exact runtime type across driver
 * versions), while a hydrated document still exposes a real `Map` — this
 * accepts either so the helper stays correct regardless of which one a
 * caller passes.
 */
function mapToObject(value: unknown): Record<string, number> {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value as Record<string, number>;
}

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
