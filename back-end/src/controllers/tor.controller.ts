import { Request, Response, NextFunction } from 'express';
import { TorModel } from '../models/Tor';
import { EXTRACTED_FIELD_KEYS, FIELD_TO_TOR_PATH } from '../extraction/core/fieldSchema';
import { extractionConfig } from '../extraction/core/config';

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
