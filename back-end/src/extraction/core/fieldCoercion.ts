/**
 * Best-effort parsers from a raw field value to its typed Tor-storage shape.
 *
 * Shared by two write paths that must agree on exactly what counts as a
 * usable value: the AI extraction sweep (pipeline/aiExtraction.ts, coercing
 * a Gemini string response) and the admin field-correction endpoint
 * (controllers/review.controller.ts, coercing a value typed into a form).
 * Neither guesses — a value that doesn't parse is left `undefined` and the
 * caller must decide what "no usable value" means for it (skip the write,
 * reject the request, etc.), never silently substitute a default.
 */

import type { ExtractedFieldKey } from './fieldSchema';

export function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function asComplexity(value: unknown): 'low' | 'medium' | 'high' | undefined {
  if (typeof value !== 'string') return undefined;
  const lower = value.trim().toLowerCase();
  return lower === 'low' || lower === 'medium' || lower === 'high' ? lower : undefined;
}

/** Best-effort array parse: try JSON first, fall back to a delimited split. */
export function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const cleaned = value.map(String).map((v) => v.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  }
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

const STRING_FIELDS: ReadonlySet<ExtractedFieldKey> = new Set([
  'title',
  'agency',
  'referenceNumber',
  'procurementMethod',
  'description',
  'qualificationRequirements',
  // The Tor's real shape is a structured array ({criterion, weightPercent}) —
  // both write paths can only responsibly accept the raw text (see
  // aiExtraction.ts's applyExtractionToTor), so this stays a plain string
  // here too; the caller wraps it into that shape before writing.
  'evaluationCriteria',
]);
const ARRAY_FIELDS: ReadonlySet<ExtractedFieldKey> = new Set([
  'requiredTechnologies',
  'deliverables',
  'keyRisks',
]);
const DATE_FIELDS: ReadonlySet<ExtractedFieldKey> = new Set([
  'timelineCommentClose',
  'timelineClarificationMeeting',
  'timelineSubmissionDeadline',
  'timelineAnnouncement',
]);

/**
 * Per-field coercion keyed by the `EXTRACTED_FIELD_KEYS` vocabulary
 * (core/fieldSchema.ts) — the same 16 fields the AI extraction sweep writes,
 * so a human correction and an AI-written value are never distinguishable by
 * shape once they land on the Tor. Returns `undefined` when `raw` doesn't
 * parse into anything usable for that field's type.
 */
export function coerceFieldValue(key: ExtractedFieldKey, raw: unknown): unknown {
  if (key === 'budget') return asNumber(raw);
  if (key === 'estimatedComplexity') return asComplexity(raw);
  if (DATE_FIELDS.has(key)) return asDate(raw);
  if (ARRAY_FIELDS.has(key)) return asStringArray(raw);
  if (STRING_FIELDS.has(key)) return asString(raw);
  return undefined;
}
