/**
 * The extracted-field vocabulary — a single source of truth shared by the
 * Vertex AI prompt, the Tor schema's `extraction.fieldConfidence` map, the
 * ExtractionJob record, and the TOR read endpoint's per-field response.
 *
 * NFR-MNT-05 requires the field schema to be versioned so that any published
 * record can be traced to the exact extraction behaviour that produced it —
 * `EXTRACTION_PROMPT_VERSION` is that version marker. Bump it by hand
 * whenever the prompt, the model, or this key list changes in a way that
 * would make an old record's stored confidence/values incomparable to a new
 * one's.
 */

/** Covers FR-EXT-02's field list exactly. Order is documentation only. */
export const EXTRACTED_FIELD_KEYS = [
  'title',
  'agency',
  'referenceNumber',
  'procurementMethod',
  'description',
  'requiredTechnologies',
  'deliverables',
  'timelineCommentClose',
  'timelineClarificationMeeting',
  'timelineSubmissionDeadline',
  'timelineAnnouncement',
  'qualificationRequirements',
  'evaluationCriteria',
  'budget',
  'keyRisks',
  'estimatedComplexity',
] as const;

export type ExtractedFieldKey = (typeof EXTRACTED_FIELD_KEYS)[number];

/**
 * Bump on any change to the prompt, model choice, or the key list above.
 * Semantic-ish versioning is a convention here, not an enforced contract.
 */
export const EXTRACTION_PROMPT_VERSION = 'v1.0.0';

/**
 * One field's extracted value plus how it was arrived at.
 *
 * `value` is `null` rather than a guess when the model didn't find it —
 * the same "absent stays absent" discipline the scrape pipeline already
 * follows for budgets and dates (see core/thaiDate.ts). `evidence` is the
 * verbatim source-text span the model claims supports `value`; it exists
 * specifically so `core/grounding.ts` can verify the claim rather than trust
 * it, per FR-EXT-09/NFR-DAT-03.
 */
export interface FieldExtraction<T = unknown> {
  value: T | null;
  confidence: number;
  evidence: string | null;
}

export interface StructuredExtractionResult {
  fields: Record<ExtractedFieldKey, FieldExtraction>;
  /** FR-EXT-03's standardised natural-language summary. Empty when it
   *  failed the same grounding check every structured field gets — see
   *  gemini.service.ts's groundAndScore. */
  summary: string;
  /** The model's own confidence in `summary`, zeroed out by groundAndScore
   *  when the summary doesn't ground — mirrors a FieldExtraction's
   *  `confidence`, just without a matching value/evidence pair since a
   *  free-text summary isn't a single field. */
  summaryConfidence: number;
  /** FR-EXT-04 — the document's dominant language, as actually observed. */
  language: 'th' | 'en' | 'mixed';
  /** Recomputed by the caller from kept-field confidence; never trusted
   *  verbatim from the model — see gemini.service.ts. */
  overallConfidence: number;
  /** Field keys the model returned but which failed grounding and were
   *  discarded (FR-EXT-09). Includes the literal string `'summary'` when
   *  the free-text summary itself was discarded for the same reason. */
  discardedFields: string[];
  /** Only set by extractFromDocument's multimodal path: the model's own
   *  transcription of the document it read directly, which every field's
   *  evidence is grounded against instead of a separate OCR pass — see
   *  that function's doc comment for why. Undefined for the OCR-text path,
   *  where the caller already has its own source text (Document.extractedText
   *  keeps whichever of the two actually produced this result). */
  transcription?: string;
}

/**
 * Where each extracted field's VALUE actually lives on a Tor document.
 * `extraction.fieldConfidence` (keyed by the same `ExtractedFieldKey`) holds
 * the CONFIDENCE half of the pair; this holds the dotted path to the value
 * half. Read by the TOR read endpoint (controllers/tor.controller.ts) to
 * pair a value with its confidence for the per-field response US-018 needs.
 * `pipeline/aiExtraction.ts`'s write side targets these same paths — kept
 * here as the single source of truth so the two never drift apart.
 */
export const FIELD_TO_TOR_PATH: Record<ExtractedFieldKey, string> = {
  title: 'title',
  agency: 'agencyName',
  referenceNumber: 'referenceNumber',
  procurementMethod: 'procurementMethod',
  description: 'description',
  requiredTechnologies: 'technologies',
  deliverables: 'deliverables',
  timelineCommentClose: 'timeline.commentPeriodEnd',
  timelineClarificationMeeting: 'timeline.clarificationMeetingDate',
  timelineSubmissionDeadline: 'timeline.submissionDeadline',
  timelineAnnouncement: 'timeline.announcementDate',
  qualificationRequirements: 'qualifications.rawText',
  evaluationCriteria: 'evaluationCriteria',
  budget: 'budget.amountThb',
  keyRisks: 'keyRisks',
  estimatedComplexity: 'estimatedComplexity',
};

/** An all-null result — the safe default when no field could be assessed. */
export function emptyExtraction(summary: string, language: StructuredExtractionResult['language'] = 'en'): StructuredExtractionResult {
  const fields = Object.fromEntries(
    EXTRACTED_FIELD_KEYS.map((key) => [key, { value: null, confidence: 0, evidence: null }])
  ) as Record<ExtractedFieldKey, FieldExtraction>;
  return { fields, summary, summaryConfidence: 0, language, overallConfidence: 0, discardedFields: [] };
}
