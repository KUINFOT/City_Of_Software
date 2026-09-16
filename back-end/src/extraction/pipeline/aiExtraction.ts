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
import { PDFDocument } from 'pdf-lib';
import { DocumentModel } from '../../models/Document';
import { ExtractionJobModel } from '../../models/ExtractionJob';
import { TorModel } from '../../models/Tor';
import { extractText } from '../../services/documentAI.service';
import { canReadDirectly, extractFromDocument, extractStructuredFields } from '../../services/gemini.service';
import {
  EXTRACTED_FIELD_KEYS,
  EXTRACTION_PROMPT_VERSION,
  type ExtractedFieldKey,
  type FieldExtraction,
  type StructuredExtractionResult,
} from '../core/fieldSchema';
import { asComplexity, asDate, asNumber, asString, asStringArray } from '../core/fieldCoercion';
import { decideRouting, type RoutingDecision } from '../core/reviewRouting';
import { extractionConfig } from '../core/config';
import { gcpConfig } from '../../config/gcpConfig';
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

  // EXTRACTION_MAX_DOCUMENTS: a temporary dev-environment hard ceiling (see
  // core/config.ts) — 0 means no limit. Independent of the crawler's own
  // cap in pipeline/attachments.ts: this one bounds the SWEEP specifically,
  // so a backlog that already existed before the cap was set (or one that
  // built up from a source outside this app's control) still can't make an
  // unbounded number of AI-extraction calls.
  let effectiveBatchSize = batchSize;
  if (extractionConfig.maxDocuments > 0) {
    const alreadyProcessed = await DocumentModel.countDocuments({ status: { $ne: 'uploaded' } });
    const budgetRemaining = Math.max(0, extractionConfig.maxDocuments - alreadyProcessed);
    if (budgetRemaining === 0) {
      logger.warn(
        `extraction sweep skipped — EXTRACTION_MAX_DOCUMENTS=${extractionConfig.maxDocuments} already reached ` +
          `(${alreadyProcessed} documents already processed)`
      );
    }
    effectiveBatchSize = Math.min(batchSize, budgetRemaining);
  }

  const documents = await DocumentModel.find({ status: 'uploaded' })
    .sort({ createdAt: 1 })
    .limit(effectiveBatchSize);

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
  const rawDocument = { buffer, mimeType: document.mimeType };

  // PRIMARY path: Gemini reads the raw document directly whenever it's a
  // type/size it can (see canReadDirectly). Document AI is skipped
  // entirely here — not just for grounding — because it was found
  // (2026-09-15) to reliably produce corrupted text for this project's
  // real documents (see extractFromDocument's own doc comment), so there's
  // nothing useful left for it to contribute, and skipping it saves a real
  // API call. Falls back to the OCR-text path only for what Gemini can't
  // read directly (docx/xlsx, or an oversized file).
  let structured: StructuredExtractionResult;
  let extractedText: string;
  let pageCount: number;
  let ocrUsed: boolean;
  let ocrConfidence: number;

  if (canReadDirectly(rawDocument)) {
    structured = await extractFromDocument(rawDocument, {});
    extractedText = structured.transcription ?? '';
    pageCount = await countPagesLocally(buffer, document.mimeType);
    ocrUsed = false;
    ocrConfidence = 0;
  } else {
    const ocr = await extractText(buffer, document.mimeType);
    structured = await extractStructuredFields(ocr.text, {});
    extractedText = ocr.text;
    pageCount = ocr.pageCount;
    ocrUsed = ocr.ocrUsed;
    ocrConfidence = ocr.confidence;
  }
  const processingTimeMs = Date.now() - started;

  // A TOR's documents are swept independently, often minutes or days apart,
  // so routing has to reflect what the TOR knows ACROSS all of them — not
  // just whatever this one document happened to find. See rollUpForTor.
  const rollup = await rollUpForTor(document.torId, structured);

  const job = await ExtractionJobModel.create({
    documentId: document._id,
    torId: document.torId,
    status: 'success',
    finishedAt: new Date(),
    modelVersion: extractModelVersionLabel(),
    promptVersion: EXTRACTION_PROMPT_VERSION,
    ocrUsed,
    language: structured.language,
    // This job's own isolated confidence — an honest record of what THIS
    // attempt found, distinct from the TOR-level rollup below.
    overallConfidence: structured.overallConfidence,
    fieldConfidence: fieldConfidenceMap(structured.fields),
    discardedFields: structured.discardedFields.map((field) => ({ field, reason: 'not grounded in source text' })),
    processingTimeMs,
    estimatedCostThb: extractionConfig.estCostPerDocThb,
    routedTo: rollup.routing,
  });

  await applyExtractionToTor(document.torId, structured, rollup, document._id as Types.ObjectId);

  await DocumentModel.updateOne(
    { _id: document._id },
    {
      $set: {
        status: 'extracted',
        extractedText,
        summary: structured.summary,
        'metadata.pageCount': pageCount,
        'metadata.confidence': ocrConfidence,
        'extraction.lastAttemptAt': new Date(),
      },
      $inc: { 'extraction.attempts': 1 },
    }
  );

  logger.info(
    `extracted document ${document._id} -> Tor ${document.torId}: this document's confidence ` +
      `${structured.overallConfidence.toFixed(2)}, TOR's combined confidence ${rollup.overallConfidence.toFixed(2)}, ` +
      `routed ${rollup.routing}`
  );

  return rollup.routing;
}

function extractModelVersionLabel(): string {
  // Reads gcpConfig rather than process.env directly, so this label can
  // never drift from the model actually used by gemini.service.ts's own
  // client construction — two independently hardcoded fallbacks here and
  // in gcpConfig.ts previously disagreed (gemini-2.0-flash vs the real
  // working default), which this single-source-of-truth read prevents.
  return gcpConfig.vertexModel;
}

/** Page count for the multimodal path, which never calls Document AI (the
 *  usual source of this number) — cheap and local rather than paying for an
 *  API call just to learn a page count. Only PDFs have a real notion of
 *  "pages" among the multimodal-capable types; every image is one page. */
async function countPagesLocally(buffer: Buffer, mimeType: string): Promise<number> {
  if (mimeType !== 'application/pdf') return 1;
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return pdf.getPageCount();
}

function fieldConfidenceMap(fields: Record<ExtractedFieldKey, FieldExtraction>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [key, field] of Object.entries(fields) as Array<[ExtractedFieldKey, FieldExtraction]>) {
    map.set(key, field.confidence);
  }
  return map;
}

/** `.lean()` may hand back a Map or a plain object for a Map-typed path,
 *  depending on driver version — accept either (mirrors tor.controller.ts's
 *  own mapGet, reading the same field for the same reason). */
function mapGet(value: unknown, key: string): number {
  if (value instanceof Map) return value.get(key) ?? 0;
  if (value && typeof value === 'object') return (value as Record<string, number>)[key] ?? 0;
  return 0;
}

export interface TorRollup {
  /** Per field: the higher of what the TOR already had and what this
   *  document just found — never lower than either. */
  fieldConfidence: Map<ExtractedFieldKey, number>;
  overallConfidence: number;
  routing: RoutingDecision;
  correctedFields: Set<string>;
  /** Whether THIS document's summary is the one that should end up on the
   *  Tor — true only when it's grounded (confidence > 0) and at least ties
   *  the Tor's existing summary. An ungrounded summary never wins, even
   *  against a TOR with no summary yet, so a bad summary simply leaves the
   *  Tor without one rather than publishing a hallucination. */
  summaryWins: boolean;
}

/**
 * Rolls one document's extraction into the TOR's ACCUMULATED per-field
 * confidence, rather than letting whichever document the sweep happens to
 * process last silently overwrite what an earlier, better document already
 * established — a document with no budget section shouldn't be able to
 * erase a budget an earlier document grounded well just by running later.
 *
 * `overallConfidence` — and therefore the publish/review routing decision —
 * is recomputed from this MERGED map using the same formula as
 * gemini.service.ts's groundAndScore, so a TOR whose several attachments
 * together cover the full field set is judged on that combined picture, not
 * on whichever single document the sweep happened to process most recently.
 */
async function rollUpForTor(torId: Types.ObjectId, structured: StructuredExtractionResult): Promise<TorRollup> {
  const tor = await TorModel.findById(torId)
    .select('extraction.humanCorrectedFields extraction.fieldConfidence summaryAi.confidence')
    .lean();

  const correctedFields = new Set<string>(tor?.extraction?.humanCorrectedFields ?? []);
  const priorFieldConfidence = tor?.extraction?.fieldConfidence;

  const fieldConfidence = new Map<ExtractedFieldKey, number>();
  for (const key of EXTRACTED_FIELD_KEYS) {
    fieldConfidence.set(key, Math.max(mapGet(priorFieldConfidence, key), structured.fields[key].confidence));
  }

  const kept = [...fieldConfidence.values()].filter((c) => c > 0);
  const overallConfidence =
    kept.length === 0 ? 0 : (kept.reduce((a, b) => a + b, 0) / kept.length) * (kept.length / EXTRACTED_FIELD_KEYS.length);

  const priorSummaryConfidence = tor?.summaryAi?.confidence ?? 0;
  const summaryWins = structured.summaryConfidence > 0 && structured.summaryConfidence >= priorSummaryConfidence;

  return {
    fieldConfidence,
    overallConfidence,
    routing: decideRouting(overallConfidence, extractionConfig),
    correctedFields,
    summaryWins,
  };
}

/**
 * Write extracted field values onto the Tor.
 *
 * Three guards apply to every write in here:
 *  - NFR-DAT-06: a field key present in `extraction.humanCorrectedFields` is
 *    never overwritten, even though no editor exists yet to populate that
 *    array — the guard is defensive, wired ahead of the feature that needs it.
 *  - A field is only written when this document's own confidence for it
 *    matches the TOR's rolled-up (best-so-far) confidence from `rollup` —
 *    i.e. this document is actually the one that produced the winning
 *    value. A worse document processed after a better one must not clobber
 *    it just because it happened to run more recently.
 *  - The model's structured-output schema represents every field value as a
 *    string (Gemini's schema support doesn't cleanly express "string OR
 *    number OR array" as a union), so array/number-shaped fields below are
 *    parsed best-effort from that string and simply skipped, never guessed,
 *    when parsing doesn't produce something usable.
 */
async function applyExtractionToTor(
  torId: Types.ObjectId,
  structured: StructuredExtractionResult,
  rollup: TorRollup,
  documentId: Types.ObjectId
): Promise<void> {
  const corrected = rollup.correctedFields;
  const value = (key: ExtractedFieldKey) => structured.fields[key]?.value;
  // Fields this document actually contributed the (tied-or-better) merged
  // confidence for — everything else keeps whatever the TOR already had.
  const writable = new Set(
    EXTRACTED_FIELD_KEYS.filter(
      (key) => !corrected.has(key) && structured.fields[key].confidence >= rollup.fieldConfidence.get(key)!
    )
  );

  const set: Record<string, unknown> = {
    status: rollup.routing,
    'extraction.overallConfidence': rollup.overallConfidence,
    'extraction.fieldConfidence': rollup.fieldConfidence,
    'extraction.modelVersion': extractModelVersionLabel(),
    'extraction.promptVersion': EXTRACTION_PROMPT_VERSION,
    'extraction.language': structured.language,
    'extraction.discardedFields': structured.discardedFields,
    'extraction.lastProcessedAt': new Date(),
    'extraction.lastDocumentId': documentId,
  };

  // Written only when this document's summary actually grounded (see
  // gemini.service.ts's groundAndScore) AND ties-or-beats whatever summary
  // the Tor already has — never unconditionally, which was the bug: every
  // structured field already went through this exact gate, but `summaryAi`
  // was written straight through regardless of grounding, so a fluent
  // hallucination could reach a published record even when every
  // individual field correctly came back empty (confirmed live: a Ministry
  // of Labour computer-equipment TOR whose summary confidently described an
  // unrelated water-distribution project's budget and deadline — numbers
  // that appeared nowhere in the source document). When this document's
  // summary doesn't win, the Tor's existing summaryAi (possibly none at
  // all) is left untouched rather than overwritten with an empty one.
  if (rollup.summaryWins) {
    set['summaryAi.text'] = structured.summary;
    set['summaryAi.model'] = extractModelVersionLabel();
    set['summaryAi.generatedAt'] = new Date();
    set['summaryAi.confidence'] = structured.summaryConfidence;
  }

  assignIfWritable(set, writable, 'referenceNumber', 'referenceNumber', asString(value('referenceNumber')));
  assignIfWritable(set, writable, 'description', 'description', asString(value('description')));
  assignIfWritable(set, writable, 'requiredTechnologies', 'technologies', asStringArray(value('requiredTechnologies')));
  assignIfWritable(set, writable, 'deliverables', 'deliverables', asStringArray(value('deliverables')));
  assignIfWritable(set, writable, 'keyRisks', 'keyRisks', asStringArray(value('keyRisks')));
  assignIfWritable(set, writable, 'estimatedComplexity', 'estimatedComplexity', asComplexity(value('estimatedComplexity')));
  assignIfWritable(set, writable, 'budget', 'budget.amountThb', asNumber(value('budget')));
  assignIfWritable(
    set,
    writable,
    'qualificationRequirements',
    'qualifications.rawText',
    asString(value('qualificationRequirements'))
  );
  // evaluationCriteria's real shape is a structured array ({criterion,
  // weightPercent}); the model's flat-string schema can only responsibly
  // supply the raw text, so it's stored as a single unweighted criterion
  // rather than fabricating a breakdown the source text may not actually give.
  const rawCriteria = asString(value('evaluationCriteria'));
  if (rawCriteria && writable.has('evaluationCriteria')) {
    set.evaluationCriteria = [{ criterion: rawCriteria, weightPercent: undefined }];
  }

  assignIfWritable(set, writable, 'timelineCommentClose', 'timeline.commentPeriodEnd', asDate(value('timelineCommentClose')));
  assignIfWritable(
    set,
    writable,
    'timelineClarificationMeeting',
    'timeline.clarificationMeetingDate',
    asDate(value('timelineClarificationMeeting'))
  );
  assignIfWritable(
    set,
    writable,
    'timelineSubmissionDeadline',
    'timeline.submissionDeadline',
    asDate(value('timelineSubmissionDeadline'))
  );
  assignIfWritable(set, writable, 'timelineAnnouncement', 'timeline.announcementDate', asDate(value('timelineAnnouncement')));

  // Allows pending_review, not just discovered/extracting: a TOR's second or
  // third document must still be able to refine it while a human reviewer
  // has it queued — previously this guard excluded pending_review, which
  // meant only the FIRST document ever processed for a TOR could reach it at
  // all; every later document for the same TOR ran (OCR + Gemini cost and
  // all) and then had its result silently discarded right here. Only a
  // genuinely terminal status (published and beyond) blocks further writes,
  // per NFR-REL-06 in the docstring above.
  await TorModel.updateOne(
    { _id: torId, status: { $in: ['discovered', 'extracting', 'pending_review'] } },
    { $set: set }
  );
}

function assignIfWritable(
  target: Record<string, unknown>,
  writable: Set<string>,
  fieldKey: string,
  torPath: string,
  value: unknown
): void {
  if (value === undefined || value === null || !writable.has(fieldKey)) return;
  target[torPath] = value;
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
