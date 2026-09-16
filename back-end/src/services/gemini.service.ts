import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { gcpConfig } from '../config/gcpConfig';
import { verifyGrounding } from '../extraction/core/grounding';
import { computeOverallConfidence } from '../extraction/core/confidenceScoring';
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
 * A raw document Gemini can read directly (multimodal). Only PDF/image mime
 * types are meaningful here — Gemini has no native document understanding
 * for a raw .docx/.xlsx the way it does for a PDF page image — and only up
 * to `MAX_INLINE_DOCUMENT_BYTES`, Gemini's practical inline-request ceiling.
 * `extractFromDocument` is the only thing that reads this; anything outside
 * either limit has to go through `extractStructuredFields`'s OCR-text path
 * instead (see aiExtraction.ts's `processDocument`, which decides which).
 */
export interface RawDocumentInput {
  buffer: Buffer;
  mimeType: string;
}

/** Gemini's inline-request size ceiling is ~20MB total including the
 *  base64-inflated payload (~4/3 of raw bytes) plus the prompt text — this
 *  leaves headroom under that rather than risking a request-too-large
 *  failure on an otherwise-fine document. */
const MAX_INLINE_DOCUMENT_BYTES = 14 * 1024 * 1024;

const MULTIMODAL_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

/**
 * Gemini 2.5 Flash's own ceiling (not raised further — this is the model's
 * actual limit, not a policy knob). Left unset, the SDK's implicit default
 * sits uncomfortably close to what a long multi-page Thai document's
 * transcription-plus-grounded-fields response actually needs: live-tested at
 * ~37,500 output tokens for a 44-page TOR, confirmed by replaying that exact
 * call (2026-09-16). Riding near an undocumented default risks the response
 * getting cut off mid-JSON on longer documents — see ModelOutputParseError's
 * comment for what that looks like when it happens.
 */
const MAX_OUTPUT_TOKENS = 65536;

export function canReadDirectly(document: RawDocumentInput): boolean {
  return MULTIMODAL_MIME_TYPES.has(document.mimeType) && document.buffer.length <= MAX_INLINE_DOCUMENT_BYTES;
}

/**
 * Structured field extraction from OCR'd text (FR-EXT-02/03/05/06/09) — the
 * fallback path for documents `extractFromDocument` can't read directly
 * (non-PDF/image mime types, or over Gemini's inline size limit).
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
    contents: buildPrompt({ multimodal: false, sourceText }),
    config: {
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema(),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  const parsed = parseModelOutput(response.text ?? '{}');

  return groundAndScore(sourceText, parsed);
}

/**
 * Structured field extraction reading the RAW document directly — the
 * PRIMARY path (see aiExtraction.ts's `processDocument`), not a fallback.
 *
 * Exists because Document AI's OCR was found (2026-09-15, live investigation)
 * to reliably produce corrupted, unreadable text for this project's actual
 * documents — 15/15 sampled across every source came back garbled, not an
 * occasional bad scan — while Gemini reading the identical raw PDF bytes
 * produced fluent, accurate, grammatically correct Thai. The likely cause is
 * a broken/non-standard font encoding embedded in these Thai government
 * PDFs (a known issue with the tooling that generates them): Document AI
 * appears to be trusting that broken encoding rather than genuinely OCR-ing
 * the rendered page, and no amount of downstream prompt or model tuning can
 * recover from OCR text that was never right to begin with.
 *
 * The one thing this can't do that the OCR-text path could: use an
 * independently-produced text to verify claims against. There's no
 * Document-AI-derived ground truth here at all — Document AI isn't called
 * for a document this function is used on. Instead, the model is asked to
 * produce its own `transcription` of what it read ALONGSIDE the structured
 * fields, and every field's evidence is grounded against THAT — same
 * `verifyGrounding` mechanism as the OCR path, just checking self-consistency
 * (does this field's claimed quote actually appear in what the model itself
 * transcribed?) rather than independent-source agreement. That's a strictly
 * weaker guarantee than checking against a second, unrelated source, and is
 * the acknowledged tradeoff of this path: it catches a model contradicting
 * its own reading, not a model confidently misreading a genuinely ambiguous
 * or damaged document. Given the alternative was grounding against text that
 * was reliably wrong 100% of the time, it's still a real improvement.
 *
 * The returned `transcription` is also what the caller should store as
 * `Document.extractedText` going forward — it's the accurate one.
 */
export async function extractFromDocument(
  document: RawDocumentInput,
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
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildPrompt({ multimodal: true }) },
          { inlineData: { mimeType: document.mimeType, data: document.buffer.toString('base64') } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema({ multimodal: true }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  const parsed = parseModelOutput(response.text ?? '{}');
  const scored = groundAndScore(parsed.transcription, parsed);
  return { ...scored, transcription: parsed.transcription };
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
  /** Only present when the multimodal schema asked for it (extractFromDocument) —
   *  '' otherwise, which groundAndScore never receives since the OCR path
   *  passes its own independent sourceText instead of this field. */
  transcription: string;
}

/**
 * Thrown when Gemini's response wasn't valid JSON — almost always a long
 * document's response getting cut off or malformed mid-generation (live-
 * confirmed 2026-09-16: 2 of 19 documents in one sweep, both 44+ pages, came
 * back this way). Deliberately a real thrown error, not a silent empty
 * result: this used to be swallowed into an all-null, zero-confidence
 * `StructuredExtractionResult` that looked exactly like a legitimate "found
 * nothing" extraction, which meant a transient parse failure permanently
 * poisoned the TOR (no field would ever again look "worse" than 0, so a
 * later good document's values could never lose to it, but the document
 * itself was marked 'extracted' and never retried). Throwing routes this
 * through aiExtraction.ts's normal per-document catch block instead, which
 * calls recordFailure and lets EXTRACTION_MAX_ATTEMPTS retry it like any
 * other transient failure.
 */
export class ModelOutputParseError extends Error {
  constructor(cause: unknown) {
    super(`Gemini response was not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ModelOutputParseError';
  }
}

function parseModelOutput(raw: string): RawModelOutput {
  let obj: Partial<RawModelOutput>;
  try {
    obj = JSON.parse(raw) as Partial<RawModelOutput>;
  } catch (err) {
    throw new ModelOutputParseError(err);
  }
  return {
    fields: obj.fields ?? {},
    summary: obj.summary ?? '',
    summaryEvidence: Array.isArray(obj.summaryEvidence)
      ? obj.summaryEvidence.filter((quote): quote is string => typeof quote === 'string')
      : [],
    summaryConfidence: typeof obj.summaryConfidence === 'number' ? obj.summaryConfidence : 0,
    language: obj.language ?? 'mixed',
    transcription: obj.transcription ?? '',
  };
}

/**
 * FR-EXT-09's verbatim-evidence grounding makes sense for a FACT a document
 * states (a budget figure, a deadline, a name) — but "estimatedComplexity"
 * isn't a fact the document states, it's a judgment the model forms FROM the
 * document (no real TOR ever contains a sentence saying "this project is
 * medium complexity" for the model to quote). Holding it to the same
 * verbatim-quote standard as every fact-field made it structurally
 * ungroundable: live-audited 2026-09-16, it sat at exactly 0% confidence
 * across every TOR ever processed — not "usually low," literally never once
 * grounded — which permanently cost every single record 1/16 of its
 * coverage score for a field that could never have passed in the first
 * place, regardless of extraction quality. Exempted here rather than
 * requiring evidence: the model's own confidence is trusted directly
 * (still clamped to [0,1]), the same way `overallConfidence` and the
 * publish/review routing decision are already model/system judgments rather
 * than grounded facts.
 */
const UNGROUNDABLE_JUDGMENT_FIELDS: ReadonlySet<ExtractedFieldKey> = new Set(['estimatedComplexity']);

/** Applies the FR-EXT-09 grounding check and recomputes overall confidence. */
function groundAndScore(sourceText: string, raw: RawModelOutput): StructuredExtractionResult {
  const fields = {} as Record<ExtractedFieldKey, FieldExtraction>;
  const discardedFields: string[] = [];

  for (const key of EXTRACTED_FIELD_KEYS) {
    const candidate = raw.fields[key];
    if (!candidate || candidate.value == null) {
      fields[key] = { value: null, confidence: 0, evidence: null };
      continue;
    }

    if (!UNGROUNDABLE_JUDGMENT_FIELDS.has(key) && !verifyGrounding(sourceText, candidate.evidence)) {
      discardedFields.push(key);
      fields[key] = { value: null, confidence: 0, evidence: null };
      continue;
    }

    const confidence = clamp01(candidate.confidence);
    fields[key] = { value: candidate.value, confidence, evidence: candidate.evidence };
  }

  const overallConfidence = computeOverallConfidence((key) => fields[key].confidence, EXTRACTED_FIELD_KEYS);

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

function buildPrompt(args: { multimodal: true } | { multimodal: false; sourceText: string }): string {
  const lines: Array<string | null> = [
    `You are extracting structured fields from a Thai government procurement document ` +
      `(a Terms of Reference / TOR announcement). Prompt schema version: ${EXTRACTION_PROMPT_VERSION}.`,
    '',
    'Rules, all mandatory:',
    args.multimodal
      ? '- First, transcribe the document\'s text as accurately and completely as you can into "transcription" — ' +
        'plain text, original language, in reading order. This is the record of what you actually read.'
      : null,
    '- Never invent a value that is not stated in the document. If a field is not present, return null for it.',
    '- "requiredTechnologies", "deliverables", "keyRisks", and "qualificationRequirements" each hold MULTIPLE ' +
      'distinct items, not one paraphrased sentence — put each separate item on its own line within that ' +
      'field\'s value. For "qualificationRequirements" specifically, mirror the document\'s own itemization ' +
      '(e.g. numbered clauses like 3.1, 3.2, 3.3) one requirement per line, in the original language, rather ' +
      'than summarising them together.',
    args.multimodal
      ? '- For every non-null field, quote the EXACT verbatim text (in its original language) that supports it ' +
        'as "evidence" — and that quote MUST appear verbatim within your own "transcription" above. A value ' +
        'without matching evidence will be discarded.'
      : '- For every non-null field, quote the EXACT verbatim source text (in its original language) that supports it as "evidence". A value without matching evidence will be discarded.',
    '- Exception: "estimatedComplexity" (low/medium/high) is YOUR judgment based on the project\'s described ' +
      'scope, not a fact the document states outright — no real document literally says "this is medium ' +
      'complexity". Give your best judgment and a confidence for it; it is not discarded for lacking a matching ' +
      'quote the way other fields are, so do not leave it null just because nothing in the text names a ' +
      'complexity level directly.',
    '- Assign each field your own confidence in [0,1] reflecting how certain you are the value is correct and complete.',
    '- Normalise "budget" to a THB amount. If the source uses a Buddhist Era year anywhere relevant to a date field, convert it to the Gregorian calendar (subtract 543).',
    '- Report "language" for the document overall as "th", "en", or "mixed".',
    '- Write "summary" in the document\'s OWN dominant language — Thai for a Thai document — never translate it ' +
      'into English. This applies even when the document mixes in English technical terms; match whatever ' +
      'language the document itself is mostly written in, the same as every field\'s "evidence" already must.',
    '- Write "summary" as a concise, standardised natural-language summary of the document. Never state a ' +
      'specific number, name, date, or amount in the summary unless it is stated in the text — if you cannot ' +
      'verify a detail, describe the document in more general terms instead of inventing the specific.',
    args.multimodal
      ? '- For "summary", also supply "summaryEvidence": 2-5 EXACT verbatim quotes, transcribed as plain text, ' +
        'that together support every specific claim in the summary. A summary whose claims are not backed by ' +
        'matching quotes will be discarded entirely, so do not include a quote unless it genuinely appears in ' +
        'the document.'
      : '- For "summary", also supply "summaryEvidence": 2-5 EXACT verbatim quotes from the source text that ' +
        'together support every specific claim in the summary. A summary whose claims are not backed by ' +
        'matching quotes will be discarded entirely, so do not include a quote unless it genuinely appears in ' +
        'the text above.',
    '- Assign "summaryConfidence" in [0,1] the same way as a field\'s confidence, reflecting how certain you ' +
      'are the summary is both accurate and complete.',
    '',
    ...(args.multimodal
      ? ['The document is attached below — read it directly (including tables and layout, not just running text).']
      : ['Document text:', '"""', args.sourceText, '"""']),
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

/** JSON schema for the model's structured response, built from the single
 *  field-key source of truth in core/fieldSchema.ts. `multimodal` adds the
 *  required "transcription" field extractFromDocument grounds evidence
 *  against — the OCR-text path has no use for it, since it already has its
 *  own independent source text. */
function buildResponseSchema(opts: { multimodal?: boolean } = {}): Schema {
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
      ...(opts.multimodal ? { transcription: { type: Type.STRING } } : {}),
      fields: { type: Type.OBJECT, properties: fieldsProperties },
      summary: { type: Type.STRING },
      summaryEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
      summaryConfidence: { type: Type.NUMBER },
      language: { type: Type.STRING, enum: ['th', 'en', 'mixed'] },
    },
    required: [
      ...(opts.multimodal ? ['transcription'] : []),
      'fields',
      'summary',
      'summaryEvidence',
      'summaryConfidence',
      'language',
    ],
  };
}
