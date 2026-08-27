/**
 * AI extraction sweep — turns stored source Documents into structured TOR
 * fields (US-038, FR-EXT-01–10; the confidence-gated publish decision for
 * US-039/BR-03).
 *
 * Deliberately a SEPARATE, independently-scheduled pass, not a step inside
 * `runSource()`. A single crawl run must stay fast — FR-ING-02 wants a daily
 * cadence and NFR-PER-07 forbids ingestion degrading user-facing search
 * latency — while a single document's OCR + structured extraction can
 * legitimately take up to 5 minutes (NFR-PER-03). Entangling the two would
 * make one slow extraction block an entire agency's crawl, and would
 * conflate two unrelated failure domains inside one `ScrapeJob` record.
 */

import { Types } from 'mongoose';
import { DocumentModel } from '../../models/Document';
import { ExtractionJobModel } from '../../models/ExtractionJob';
import { TorModel } from '../../models/Tor';
import { extractText } from '../../services/documentAI.service';
import { extractStructuredFields } from '../../services/gemini.service';
import { EXTRACTION_PROMPT_VERSION, type ExtractedFieldKey, type FieldExtraction } from '../core/fieldSchema';
import { decideRouting } from '../core/reviewRouting';
import { extractionConfig } from '../core/config';
import { createLogger, type Logger } from '../core/logger';
import { LocalBlobStore, type BlobStore } from './storage';

export interface ExtractionSweepResult {
  doclessRouted: number;
  processed: number;
  succeeded: number;
  failed: number;
  routedPublished: number;
  routedReview: number;
}

export interface ExtractionSweepOptions {
  batchSize?: number;
  store?: BlobStore;
  logger?: Logger;
}

export async function runExtractionSweep(
  options: ExtractionSweepOptions = {}
): Promise<ExtractionSweepResult> {
  const logger = options.logger ?? createLogger('extraction:ai-sweep');
  const store = options.store ?? new LocalBlobStore(extractionConfig.storageDir);
  const batchSize = options.batchSize ?? extractionConfig.sweepBatchSize;

  const result: ExtractionSweepResult = {
    doclessRouted: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    routedPublished: 0,
    routedReview: 0,
  };

  result.doclessRouted = await routeDoclessTors(logger);

  const documents = await DocumentModel.find({ status: 'uploaded' })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  for (const document of documents) {
    if ((document.extraction?.attempts ?? 0) >= extractionConfig.maxAttempts) {
      // Parked — already retried past the limit (NFR-REL-03). Not touched
      // again until an admin intervenes (no automatic path does that yet).
      continue;
    }

    result.processed += 1;
    try {
      const routing = await processDocument(document, store, logger);
      result.succeeded += 1;
      if (routing === 'published') result.routedPublished += 1;
      else result.routedReview += 1;
    } catch (err) {
      result.failed += 1;
      await recordFailure(document._id as Types.ObjectId, document.torId ?? null, (err as Error).message);
      logger.warn(`extraction failed for document ${document._id}: ${(err as Error).message}`);
    }
  }

  logger.info(
    `extraction sweep complete — docless routed ${result.doclessRouted}, processed ${result.processed}, ` +
      `succeeded ${result.succeeded}, failed ${result.failed}, published ${result.routedPublished}, ` +
      `to review ${result.routedReview}`
  );

  return result;
}

/**
 * BR-05: nothing may be published that isn't traceable to a stored source
 * document. A Tor with zero attachments can never legitimately auto-publish,
 * but it still shouldn't sit in `discovered` forever — after a grace window
 * (long enough for the same crawl run's attachment download to finish) it is
 * routed straight to `pending_review` for a human to attach a document or
 * reject it, with an explicit zero confidence rather than an unset one.
 */
async function routeDoclessTors(logger: Logger): Promise<number> {
  const cutoff = new Date(Date.now() - extractionConfig.doclessGraceHours * 3_600_000);
  const result = await TorModel.updateMany(
    {
      status: 'discovered',
      documentIds: { $size: 0 },
      'source.discoveredAt': { $lt: cutoff },
    },
    {
      $set: {
        status: 'pending_review',
        'extraction.overallConfidence': 0,
        'extraction.lastProcessedAt': new Date(),
      },
    }
  );
  const count = result.modifiedCount ?? 0;
  if (count > 0) {
    logger.info(`routed ${count} docless TOR(s) to review after the ${extractionConfig.doclessGraceHours}h grace window`);
  }
  return count;
}

/** Mongoose lean-vs-hydrated typing is intentionally loose here — only the
 *  fields this module touches are accessed. */
interface DocumentLike {
  _id: Types.ObjectId;
  torId?: Types.ObjectId | null;
  mimeType: string;
  origin?: { storageKey?: string | null } | null;
  extraction?: { attempts?: number } | null;
}

async function processDocument(document: DocumentLike, store: BlobStore, logger: Logger): Promise<'pending_review' | 'published'> {
  if (!document.torId) {
    throw new Error('document has no torId — cannot route its extraction result anywhere');
  }
  if (!document.origin?.storageKey) {
    throw new Error('document has no storageKey — bytes were never actually stored');
  }

  // Only mutate status if the Tor is still pre-extraction (NFR-REL-06's
  // terminal-state invariant): a Tor already published/rejected/superseded
  // by the time its document is processed must never be silently re-queued
  // or unpublished by a slow/duplicate sweep pass.
  await TorModel.updateOne({ _id: document.torId, status: 'discovered' }, { $set: { status: 'extracting' } });

  const started = Date.now();
  const buffer = await store.get(document.origin.storageKey);
  const ocr = await extractText(buffer, document.mimeType);
  const structured = await extractStructuredFields(ocr.text, {});
  const processingTimeMs = Date.now() - started;

  const routing = decideRouting(structured.overallConfidence, extractionConfig);

  const job = await ExtractionJobModel.create({
    documentId: document._id,
    torId: document.torId,
    status: 'success',
    finishedAt: new Date(),
    modelVersion: extractModelVersionLabel(),
    promptVersion: EXTRACTION_PROMPT_VERSION,
    ocrUsed: ocr.ocrUsed,
    language: structured.language,
    overallConfidence: structured.overallConfidence,
    fieldConfidence: fieldConfidenceMap(structured.fields),
    discardedFields: structured.discardedFields.map((field) => ({ field, reason: 'not grounded in source text' })),
    processingTimeMs,
    estimatedCostThb: extractionConfig.estCostPerDocThb,
    routedTo: routing,
  });

  await applyExtractionToTor(document.torId, structured, routing, document._id as Types.ObjectId, job._id as Types.ObjectId);

  await DocumentModel.updateOne(
    { _id: document._id },
    {
      $set: {
        status: 'extracted',
        extractedText: ocr.text,
        summary: structured.summary,
        'metadata.pageCount': ocr.pageCount,
        'metadata.confidence': ocr.confidence,
        'extraction.lastAttemptAt': new Date(),
      },
      $inc: { 'extraction.attempts': 1 },
    }
  );

  logger.info(
    `extracted document ${document._id} -> Tor ${document.torId}: confidence ${structured.overallConfidence.toFixed(2)}, routed ${routing}`
  );

  return routing;
}

function extractModelVersionLabel(): string {
  // Kept as a small indirection point: if model selection ever needs to be
  // read per-call (e.g. from a request) rather than from static config, this
  // is the one place to change.
  return process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash';
}

function fieldConfidenceMap(fields: Record<ExtractedFieldKey, FieldExtraction>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [key, field] of Object.entries(fields) as Array<[ExtractedFieldKey, FieldExtraction]>) {
    map.set(key, field.confidence);
  }
  return map;
}

/**
 * Write extracted field values onto the Tor.
 *
 * Two guards apply to every write in here:
 *  - NFR-DAT-06: a field key present in `extraction.humanCorrectedFields` is
 *    never overwritten, even though no editor exists yet to populate that
 *    array — the guard is defensive, wired ahead of the feature that needs it.
 *  - The model's structured-output schema represents every field value as a
 *    string (Gemini's schema support doesn't cleanly express "string OR
 *    number OR array" as a union), so array/number-shaped fields below are
 *    parsed best-effort from that string and simply skipped, never guessed,
 *    when parsing doesn't produce something usable.
 */
async function applyExtractionToTor(
  torId: Types.ObjectId,
  structured: Awaited<ReturnType<typeof extractStructuredFields>>,
  routing: 'pending_review' | 'published',
  documentId: Types.ObjectId,
  _jobId: Types.ObjectId
): Promise<void> {
  const tor = await TorModel.findById(torId).select('extraction.humanCorrectedFields status').lean();
  const corrected = new Set(tor?.extraction?.humanCorrectedFields ?? []);
  const value = (key: ExtractedFieldKey) => structured.fields[key]?.value;

  const set: Record<string, unknown> = {
    status: routing,
    'extraction.overallConfidence': structured.overallConfidence,
    'extraction.fieldConfidence': fieldConfidenceMap(structured.fields),
    'extraction.modelVersion': extractModelVersionLabel(),
    'extraction.promptVersion': EXTRACTION_PROMPT_VERSION,
    'extraction.language': structured.language,
    'extraction.discardedFields': structured.discardedFields,
    'extraction.lastProcessedAt': new Date(),
    'extraction.lastDocumentId': documentId,
    'summaryAi.text': structured.summary,
    'summaryAi.model': extractModelVersionLabel(),
    'summaryAi.generatedAt': new Date(),
    'summaryAi.confidence': structured.overallConfidence,
  };

  assignIfNotCorrected(set, corrected, 'referenceNumber', 'referenceNumber', asString(value('referenceNumber')));
  assignIfNotCorrected(set, corrected, 'description', 'description', asString(value('description')));
  assignIfNotCorrected(set, corrected, 'requiredTechnologies', 'technologies', asStringArray(value('requiredTechnologies')));
  assignIfNotCorrected(set, corrected, 'deliverables', 'deliverables', asStringArray(value('deliverables')));
  assignIfNotCorrected(set, corrected, 'keyRisks', 'keyRisks', asStringArray(value('keyRisks')));
  assignIfNotCorrected(set, corrected, 'estimatedComplexity', 'estimatedComplexity', asComplexity(value('estimatedComplexity')));
  assignIfNotCorrected(set, corrected, 'budget', 'budget.amountThb', asNumber(value('budget')));
  assignIfNotCorrected(
    set,
    corrected,
    'qualificationRequirements',
    'qualifications.rawText',
    asString(value('qualificationRequirements'))
  );
  // evaluationCriteria's real shape is a structured array ({criterion,
  // weightPercent}); the model's flat-string schema can only responsibly
  // supply the raw text, so it's stored as a single unweighted criterion
  // rather than fabricating a breakdown the source text may not actually give.
  const rawCriteria = asString(value('evaluationCriteria'));
  if (rawCriteria && !corrected.has('evaluationCriteria')) {
    set.evaluationCriteria = [{ criterion: rawCriteria, weightPercent: undefined }];
  }

  assignIfNotCorrected(set, corrected, 'timelineCommentClose', 'timeline.commentPeriodEnd', asDate(value('timelineCommentClose')));
  assignIfNotCorrected(
    set,
    corrected,
    'timelineClarificationMeeting',
    'timeline.clarificationMeetingDate',
    asDate(value('timelineClarificationMeeting'))
  );
  assignIfNotCorrected(
    set,
    corrected,
    'timelineSubmissionDeadline',
    'timeline.submissionDeadline',
    asDate(value('timelineSubmissionDeadline'))
  );
  assignIfNotCorrected(set, corrected, 'timelineAnnouncement', 'timeline.announcementDate', asDate(value('timelineAnnouncement')));

  await TorModel.updateOne({ _id: torId, status: { $in: ['discovered', 'extracting'] } }, { $set: set });
}

function assignIfNotCorrected(
  target: Record<string, unknown>,
  corrected: Set<string>,
  fieldKey: string,
  torPath: string,
  value: unknown
): void {
  if (value === undefined || value === null || corrected.has(fieldKey)) return;
  target[torPath] = value;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function asComplexity(value: unknown): 'low' | 'medium' | 'high' | undefined {
  if (typeof value !== 'string') return undefined;
  const lower = value.trim().toLowerCase();
  return lower === 'low' || lower === 'medium' || lower === 'high' ? lower : undefined;
}

/** Best-effort array parse: try JSON first, fall back to a delimited split. */
function asStringArray(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Not JSON — fall through to a delimiter split below.
  }
  const parts = value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

async function recordFailure(
  documentId: Types.ObjectId,
  torId: Types.ObjectId | null,
  message: string
): Promise<void> {
  await DocumentModel.updateOne(
    { _id: documentId },
    {
      $set: { status: 'error', 'extraction.lastAttemptAt': new Date(), 'extraction.lastError': message },
      $inc: { 'extraction.attempts': 1 },
    }
  );
  if (!torId) return; // ExtractionJob.torId is required — nothing to link a job to.
  await ExtractionJobModel.create({
    documentId,
    torId,
    status: 'failed',
    finishedAt: new Date(),
    errors: [message],
  }).catch(() => {
    // The Document's own error state above is the source of truth; a failed
    // ExtractionJob write here is a lost audit-trail nicety, not fatal.
  });
}
