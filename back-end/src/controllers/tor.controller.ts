import { Request, Response, NextFunction } from 'express';
import { TorModel } from '../models/Tor';
import { DocumentModel } from '../models/Document';
import { VendorProfileModel } from '../models/VendorProfile';
import { EXTRACTED_FIELD_KEYS, FIELD_TO_TOR_PATH } from '../extraction/core/fieldSchema';
import { extractionConfig } from '../extraction/core/config';
import { computeKeyDates } from '../analytics/keyDates';
import { matchQualifications } from '../matching/qualificationMatch';
import { computeMatchReasons } from '../matching/matchReasons';
import { createDocumentAccessToken } from '../services/documentAccess.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * The only Tor-facing read endpoints in this codebase today. Deliberately
 * minimal — full search/filter/sort (FR-REP-*) is a separate epic. What's
 * here exists so US-018's per-field confidence caution and US-034's outlier
 * flag are actually retrievable over HTTP, nothing more.
 */

/** GET /api/tors — published records only, newest first. No filters/sort. */
export async function listTors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(toPositiveInt(req.query.limit) ?? 50, 200);
    // BR-03 enforced again here, not just at approve-time: a bug elsewhere
    // that leaves a record in the wrong status must never leak through the
    // one public read path.
    const records = await TorModel.find({ status: 'published' })
      .select('title agencyName budget.amountThb timeline.submissionDeadline lifecycle.stage createdAt')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(records);
  } catch (err) {
    next(err);
  }
}

/** GET /api/tors/:id — full detail, with per-field confidence and outlier flag. */
export async function getTor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await TorModel.findOne({ _id: req.params.id, status: 'published' }).lean();
    if (!record) {
      // Deliberately the same 404 whether the id doesn't exist or exists but
      // isn't published — this endpoint must not reveal that an unpublished
      // record exists at all.
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    const fields: Record<string, { value: unknown; confidence: number; caution: boolean }> = {};
    for (const key of EXTRACTED_FIELD_KEYS) {
      const value = getByPath(record, FIELD_TO_TOR_PATH[key]);
      const confidence = record.extraction?.fieldConfidence
        ? mapGet(record.extraction.fieldConfidence, key)
        : 0;
      fields[key] = { value: value ?? null, confidence, caution: confidence < extractionConfig.reviewThreshold };
    }

    res.json({
      _id: record._id,
      title: record.title,
      agencyName: record.agencyName,
      status: record.status,
      lifecycle: record.lifecycle,
      timeline: record.timeline,
      // US-016/FR-REP-04: "source address ... and import method" — the rest
      // of provenance (the document list itself) is a separate call, GET
      // /api/tors/:id/documents, so this response doesn't have to carry raw
      // storage keys.
      source: record.source ?? null,
      documentCount: record.documentIds?.length ?? 0,
      // US-019/FR-REP-07: computed here, not left to the client, so "within
      // seven days" has exactly one definition across every consumer.
      keyDates: computeKeyDates(record.timeline, new Date(), extractionConfig.keyDateUrgentWithinDays),
      // US-017: the structured fields a qualification-match check needs.
      // `fields.qualificationRequirements` above only carries the raw text.
      qualifications: record.qualifications ?? null,
      // US-018 AC2: every AI-generated summary is labelled machine-generated
      // and non-authoritative — stated on every response, not left implicit.
      summaryAi: record.summaryAi
        ? { ...record.summaryAi, machineGenerated: true, authoritative: false }
        : null,
      fields,
      overallConfidence: record.extraction?.overallConfidence ?? 0,
      // FR-ANL-07: an outlier flag is a statistical signal, never a finding
      // of wrongdoing — stated alongside the flag on every response.
      outlier: record.outlier
        ? {
            isOutlier: record.outlier.isOutlier,
            reason: record.outlier.reason,
            comparableCount: record.outlier.comparableCount,
            deviationPct: record.outlier.deviationPct,
            basis: {
              agencyId: record.outlier.basisAgencyId,
              projectType: record.outlier.basisProjectType,
              year: record.outlier.basisYear,
            },
            signal: 'This is a statistical signal for further inquiry, not a finding of wrongdoing.',
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tors/:id/documents — US-016: the original source document(s)
 * backing a published TOR, each with a signed, time-limited retrieval link.
 * Same BR-03 published-only guard as `getTor`, for the same reason — a
 * document belonging to an unpublished record must never leak through here.
 */
export async function listTorDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tor = await TorModel.findOne({ _id: req.params.id, status: 'published' })
      .select('documentIds')
      .lean();
    if (!tor) {
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    const docs = await DocumentModel.find({ _id: { $in: tor.documentIds ?? [] } })
      .select('originalName mimeType size origin createdAt')
      .lean();

    res.json({
      documents: docs.map((doc) => ({
        _id: doc._id,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        sourceUrl: doc.origin?.sourceUrl ?? null,
        label: doc.origin?.label ?? null,
        capturedAt: doc.origin?.downloadedAt ?? doc.createdAt,
        // null when there are no stored bytes to fetch — SCRUM-16's "handle
        // unavailable original document" case, mirroring getDocumentFile's
        // own 404 for the same condition rather than handing out a dead link.
        // Relative to the API base (no leading /api) — callers already
        // prepend their own base URL, which itself ends in /api (see
        // front-end/lib/auth-api.ts's apiBaseUrl convention).
        fileUrl: doc.origin?.storageKey
          ? `/documents/${doc._id}/file?token=${createDocumentAccessToken(String(doc._id)).token}`
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tors/:id/qualification-match — US-017/FR-NOT-02. Vendor-only
 * (gated by requireVendor in the route); a guest gets 401 from the
 * middleware and the frontend shows the registration prompt instead
 * (UC-03 extension 5a) rather than calling this at all.
 */
export async function getQualificationMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tor = await TorModel.findOne({ _id: req.params.id, status: 'published' })
      .select('qualifications')
      .lean();
    if (!tor) {
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    const authUser = (req as AuthenticatedRequest).authUser;
    const vendorProfile = await VendorProfileModel.findOne({ userId: authUser.id }).lean();

    res.json(matchQualifications(tor.qualifications, vendorProfile));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tors/:id/match-reasons — EP-04 SCRUM-100/101. Live-computed
 * on-demand for the TOR detail page, mirroring getQualificationMatch's
 * pattern exactly (published-only guard, vendor-only via requireVendor).
 * The stored, snapshotted version of these reasons lives on Notification
 * rows created at stage-transition time (see notifications/dispatch.ts) —
 * this endpoint answers the same question live, for a TOR that may not have
 * triggered a notification (e.g. the vendor's profile changed since).
 */
export async function getMatchReasons(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tor = await TorModel.findOne({ _id: req.params.id, status: 'published' })
      .select('technologies projectType budget.amountThb agencyId agencyName')
      .lean();
    if (!tor) {
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    const authUser = (req as AuthenticatedRequest).authUser;
    const vendorProfile = await VendorProfileModel.findOne({ userId: authUser.id }).lean();

    res.json(computeMatchReasons(tor, vendorProfile));
  } catch (err) {
    next(err);
  }
}

/** Read a dotted path ("timeline.announcementDate") off a plain object. */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, segment) => {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    return (cursor as Record<string, unknown>)[segment];
  }, obj);
}

/** `.lean()` may hand back a Map or a plain object depending on driver
 *  version — accept either rather than assuming one. */
function mapGet(value: unknown, key: string): number {
  if (value instanceof Map) return value.get(key) ?? 0;
  if (value && typeof value === 'object') return (value as Record<string, number>)[key] ?? 0;
  return 0;
}

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
