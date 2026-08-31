import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { TorModel } from '../models/Tor';
import { AgencyModel } from '../models/Agency';
import { DocumentModel } from '../models/Document';
import { AuditLogModel } from '../models/AuditLog';
import { LocalBlobStore } from '../extraction/pipeline/storage';
import { extractionConfig } from '../extraction/core/config';

/** Mirrors Tor.ts's `procurementMethod` enum — kept local since nothing else
 *  needs to validate against it at the API boundary. */
const PROCUREMENT_METHODS = ['e_bidding', 'selection', 'special_method', 'specific_method', 'other'] as const;

// TODO: add auth middleware (admin role) once it exists. Until then, every
// write endpoint below takes `actorId` explicitly in the request body as a
// stand-in for `req.user.id`, so the audit trail (FR-ADM-06) at least
// records SOMETHING attributable rather than nothing — but nothing here
// actually verifies the caller is who they claim to be.

/**
 * POST /api/review/tors — US-041: an admin manually creates a TOR with an
 * uploaded source document, for when an agency's own site changes shape (or
 * goes down) and the scraper can no longer reach it — vendors should not
 * lose visibility into that agency's opportunities just because its adapter
 * broke.
 *
 * Deliberately reuses the SAME downstream path a scraped TOR takes: the file
 * is written to the blob store and the Document is left at `status:
 * 'uploaded'`, exactly like `pipeline/attachments.ts` leaves one — so the
 * next extraction sweep (pipeline/aiExtraction.ts) OCRs it, extracts
 * structured fields (including the standardised summary, US-015) and routes
 * it through the same confidence gate (BR-03) as anything the crawler found.
 * There is no separate "manual" publish path to keep in sync with the real
 * one, and BR-05 ("nothing publishes without a source document") holds here
 * for the same reason it holds for a scraped TOR: `file` is required, not
 * optional.
 */
export async function createManualTor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, string | undefined>;
    const { actorId, agencyId, title } = body;

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use multipart form field "file".' });
      return;
    }
    if (!actorId) {
      res.status(400).json({ error: 'actorId is required' });
      return;
    }
    if (!agencyId) {
      res.status(400).json({ error: 'agencyId is required' });
      return;
    }
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (
      body.procurementMethod &&
      !PROCUREMENT_METHODS.includes(body.procurementMethod as (typeof PROCUREMENT_METHODS)[number])
    ) {
      res.status(400).json({ error: `procurementMethod must be one of: ${PROCUREMENT_METHODS.join(', ')}` });
      return;
    }

    let submissionDeadline: Date | undefined;
    if (body.submissionDeadline) {
      submissionDeadline = new Date(body.submissionDeadline);
      if (Number.isNaN(submissionDeadline.getTime())) {
        res.status(400).json({ error: 'submissionDeadline is not a valid date' });
        return;
      }
    }

    let budgetAmountThb: number | undefined;
    if (body.budgetAmountThb !== undefined && body.budgetAmountThb !== '') {
      budgetAmountThb = Number(body.budgetAmountThb);
      if (!Number.isFinite(budgetAmountThb)) {
        res.status(400).json({ error: 'budgetAmountThb must be a number' });
        return;
      }
    }

    const agency = await AgencyModel.findById(agencyId).select('name').lean();
    if (!agency) {
      res.status(404).json({ error: 'agencyId does not reference an existing agency' });
      return;
    }

    const tor = await TorModel.create({
      agencyId: agency._id,
      agencyName: agency.name,
      title: title.trim(),
      referenceNumber: body.referenceNumber || undefined,
      description: body.description || undefined,
      procurementMethod: body.procurementMethod as (typeof PROCUREMENT_METHODS)[number] | undefined,
      budget: budgetAmountThb !== undefined ? { amountThb: budgetAmountThb, isEstimated: true } : undefined,
      timeline: submissionDeadline ? { submissionDeadline } : undefined,
      status: 'discovered',
      // No `sourceRef` at all — that subdocument is scrape-only identity/dedup
      // metadata, and its upsert-key index is sparse specifically so a
      // manually created TOR (no scraped identity) doesn't collide on nulls.
      source: { importMethod: 'manual', discoveredAt: new Date() },
    });

    // Content-addressed, same as a scraped attachment — a second manual
    // upload of the same bytes costs no extra storage (see storage.ts).
    const store = new LocalBlobStore(extractionConfig.storageDir);
    const blob = await store.put('manual', req.file.originalname, req.file.buffer);

    const document = await DocumentModel.create({
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      // 'uploaded' — not run through OCR here — is what puts this document in
      // the extraction sweep's work queue (DocumentModel.find({status:
      // 'uploaded'}) in aiExtraction.ts), identically to a scraped attachment.
      status: 'uploaded',
      torId: tor._id,
      agencyId: agency._id,
      uploadedBy: new Types.ObjectId(actorId),
      origin: {
        label: 'Manually uploaded by admin',
        storageKey: blob.key,
        sha256: blob.sha256,
        downloadedAt: new Date(),
        insecureTransport: false,
      },
    });

    tor.documentIds.push(document._id as Types.ObjectId);
    await tor.save();

    await AuditLogModel.create({
      actorId,
      action: 'tor.import',
      entityType: 'tor',
      entityId: tor._id,
      before: null,
      after: { title: tor.title, agencyId: agency._id, documentId: document._id, importMethod: 'manual' },
      ipAddress: req.ip,
    });

    res.status(201).json({ tor, document });
  } catch (err) {
    next(err);
  }
}

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
