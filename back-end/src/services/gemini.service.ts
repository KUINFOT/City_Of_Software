import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { gcpConfig } from '../config/gcpConfig';
import { verifyGrounding } from '../extraction/core/grounding';
import {
  EXTRACTED_FIELD_KEYS,
  EXTRACTION_PROMPT_VERSION,
  emptyExtraction,
  type ExtractedFieldKey,
  type FieldExtraction,
  type StructuredExtractionResult,
} from '../extraction/core/fieldSchema';

/**
 * Lazily-constructed, memoized client. Built once per process rather than
 * once per call — `extractStructuredFields` is invoked once per document in
 * a batch sweep (pipeline/aiExtraction.ts), and re-doing client/auth setup
 * for every document in that loop would be pure waste.
 *
 * `enterprise: true` (rather than the older, still-accepted `vertexai: true`)
 * is the Google Gen AI SDK's own recommended flag for routing through the
 * Gemini Enterprise Agent Platform (the April 2026 rebrand of Vertex AI) —
 * the underlying REST surface and GCP project/location config are unchanged,
 * only the SDK package (`@google-cloud/vertexai` → `@google/genai`, the
 * former having been removed after its June 2026 deprecation deadline) and
 * this flag name are new.
 */
let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      enterprise: true,
      project: gcpConfig.projectId,
      location: gcpConfig.vertexLocation,
    });
  }
  return client;
}

/**
 * Generates an AI summary of text using Gemini, via the Gemini Enterprise
 * Agent Platform.
 *
 * ⚠️ STUB fallback when GCP_PROJECT_ID is unset — see extractStructuredFields
 * below for why an empty-credentials environment must stay usable rather
 * than throwing.
 */
export async function summarize(text: string): Promise<string> {
  if (!gcpConfig.projectId) {
    const preview = text.slice(0, 120);
    const ellipsis = text.length > 120 ? '…' : '';
    return (
      `[stub] AI summary placeholder. Source text preview: "${preview}${ellipsis}". ` +
      'Set GCP_PROJECT_ID and VERTEX_AI_MODEL to enable real summaries.'
    );
  }

  const response = await getClient().models.generateContent({
    model: gcpConfig.vertexModel,
    contents: `Summarize the following document concisely:\n\n${text}`,
  });
  return response.text ?? '';
}

/**
 * Structured field extraction (FR-EXT-02/03/05/06/09).
 *
 * Every non-null field the model returns is passed through
 * `verifyGrounding` against the source text before being trusted — a field
 * whose claimed evidence doesn't actually appear in the document is
 * discarded outright (FR-EXT-09/NFR-DAT-03), never partially credited.
 *
 * `overallConfidence` in the returned result is RECOMPUTED here, never
 * trusted verbatim from the model: it is the average confidence of the
 * fields that survived grounding, scaled by what fraction of the full field
 * set survived. A record that had most of its fields discarded for lacking
 * grounding cannot still claim high overall confidence just because the
 * handful of fields that did survive happened to score well — this is what
 * makes the confidence-gated review routing (core/reviewRouting.ts)
 * trustworthy rather than gameable by a partially-hallucinated extraction.
 *
 * Falls back to `emptyExtraction()` — every field null, zero confidence —
 * whenever GCP_PROJECT_ID is unset. This is the SAFE default: zero
 * confidence always routes to `pending_review` (see reviewRouting.ts), so an
 * environment with no GCP credentials at all can never accidentally
 * auto-publish anything.
 */
export async function extractStructuredFields(
  sourceText: string,
  opts: { language?: 'th' | 'en' } = {}
): Promise<StructuredExtractionResult> {
  if (!gcpConfig.projectId) {
    return emptyExtraction(
      '[stub] Structured extraction placeholder. Set GCP_PROJECT_ID and VERTEX_AI_MODEL to enable ' +
        'real field extraction.',
      opts.language ?? 'en'
    );
  }

  const response = await getClient().models.generateContent({
    model: gcpConfig.vertexModel,
    contents: buildPrompt(sourceText),
    config: {
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema(),
    },
  });

  const parsed = parseModelOutput(response.text ?? '{}');

  return groundAndScore(sourceText, parsed);
}

interface RawFieldOutput {
  value: unknown;
  confidence: number;
  evidence: string | null;
}

interface RawModelOutput {
  fields: Record<string, RawFieldOutput>;
  summary: string;
  /** Verbatim source-text quotes backing the summary's claims — the same
   *  evidence contract as a field's `evidence`, just one-to-many since a
   *  summary makes several claims at once. */
  summaryEvidence: string[];
  summaryConfidence: number;
  language: 'th' | 'en' | 'mixed';
}

function parseModelOutput(raw: string): RawModelOutput {
  try {
    const obj = JSON.parse(raw) as Partial<RawModelOutput>;
    return {
      fields: obj.fields ?? {},
      summary: obj.summary ?? '',
      summaryEvidence: Array.isArray(obj.summaryEvidence)
        ? obj.summaryEvidence.filter((quote): quote is string => typeof quote === 'string')
        : [],
      summaryConfidence: typeof obj.summaryConfidence === 'number' ? obj.summaryConfidence : 0,
      language: obj.language ?? 'mixed',
    };
  } catch {
    // A model that fails to return valid JSON has effectively found
    // nothing we can trust — every field is null rather than guessed.
    return { fields: {}, summary: '', summaryEvidence: [], summaryConfidence: 0, language: 'mixed' };
  }
}

/** Applies the FR-EXT-09 grounding check and recomputes overall confidence. */
function groundAndScore(sourceText: string, raw: RawModelOutput): StructuredExtractionResult {
  const fields = {} as Record<ExtractedFieldKey, FieldExtraction>;
  const discardedFields: string[] = [];
  const keptConfidences: number[] = [];

  for (const key of EXTRACTED_FIELD_KEYS) {
    const candidate = raw.fields[key];
    if (!candidate || candidate.value == null) {
      fields[key] = { value: null, confidence: 0, evidence: null };
      continue;
    }

    if (!verifyGrounding(sourceText, candidate.evidence)) {
      discardedFields.push(key);
      fields[key] = { value: null, confidence: 0, evidence: null };
      continue;
    }

    const confidence = clamp01(candidate.confidence);
    fields[key] = { value: candidate.value, confidence, evidence: candidate.evidence };
    keptConfidences.push(confidence);
  }

  const overallConfidence =
    keptConfidences.length === 0
      ? 0
      : (keptConfidences.reduce((a, b) => a + b, 0) / keptConfidences.length) *
        (keptConfidences.length / EXTRACTED_FIELD_KEYS.length);

  // FR-EXT-09 applies to the free-text summary exactly as it does to every
  // structured field above — a claim not traceable to the source text is
  // not published, no matter how fluent it reads. This was previously the
  // one place in the pipeline that skipped the grounding check entirely:
  // every structured field got discarded when ungrounded, but `summary`
  // was written straight through, so a hallucinated summary could (and
  // did) reach a published record even when every individual field
  // correctly came back empty. Every quote in `summaryEvidence` must
  // independently appear in the source — one bad quote discards the whole
  // summary, same as a field never gets partial credit for a claim that's
  // half-grounded.
  const summaryGrounded =
    raw.summary.trim().length > 0 &&
    raw.summaryEvidence.length > 0 &&
    raw.summaryEvidence.every((quote) => verifyGrounding(sourceText, quote));
  if (!summaryGrounded) discardedFields.push('summary');

  return {
    fields,
    summary: summaryGrounded ? raw.summary : '',
    summaryConfidence: summaryGrounded ? clamp01(raw.summaryConfidence) : 0,
    language: raw.language,
    overallConfidence,
    discardedFields,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function buildPrompt(sourceText: string): string {
  return [
    `You are extracting structured fields from a Thai government procurement document ` +
      `(a Terms of Reference / TOR announcement). Prompt schema version: ${EXTRACTION_PROMPT_VERSION}.`,
    '',
    'Rules, all mandatory:',
    '- Never invent a value that is not stated in the text. If a field is not present, return null for it.',
    '- For every non-null field, quote the EXACT verbatim source text (in its original language) that supports it as "evidence". A value without matching evidence will be discarded.',
    '- Assign each field your own confidence in [0,1] reflecting how certain you are the value is correct and complete.',
    '- Normalise "budget" to a THB amount. If the source uses a Buddhist Era year anywhere relevant to a date field, convert it to the Gregorian calendar (subtract 543).',
    '- Report "language" for the document overall as "th", "en", or "mixed".',
    '- Write "summary" as a concise, standardised natural-language summary of the document. Never state a ' +
      'specific number, name, date, or amount in the summary unless it is stated in the text — if you cannot ' +
      'verify a detail, describe the document in more general terms instead of inventing the specific.',
    '- For "summary", also supply "summaryEvidence": 2-5 EXACT verbatim quotes from the source text that ' +
      'together support every specific claim in the summary. A summary whose claims are not backed by ' +
      'matching quotes will be discarded entirely, so do not include a quote unless it genuinely appears in ' +
      'the text above.',
    '- Assign "summaryConfidence" in [0,1] the same way as a field\'s confidence, reflecting how certain you ' +
      'are the summary is both accurate and complete.',
    '',
    'Document text:',
    '"""',
    sourceText,
    '"""',
  ].join('\n');
}

/** JSON schema for the model's structured response, built from the single
 *  field-key source of truth in core/fieldSchema.ts. */
function buildResponseSchema(): Schema {
  const fieldSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      value: { type: Type.STRING, nullable: true },
      confidence: { type: Type.NUMBER },
      evidence: { type: Type.STRING, nullable: true },
    },
    required: ['confidence'],
  };

  const fieldsProperties = Object.fromEntries(
    EXTRACTED_FIELD_KEYS.map((key) => [key, fieldSchema])
  ) as Record<ExtractedFieldKey, Schema>;

  return {
    type: Type.OBJECT,
    properties: {
      fields: { type: Type.OBJECT, properties: fieldsProperties },
      summary: { type: Type.STRING },
      summaryEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
      summaryConfidence: { type: Type.NUMBER },
      language: { type: Type.STRING, enum: ['th', 'en', 'mixed'] },
    },
    required: ['fields', 'summary', 'summaryEvidence', 'summaryConfidence', 'language'],
  };
}
