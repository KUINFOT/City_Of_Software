/**
 * The single confidence formula shared by a document's own extraction
 * (gemini.service.ts's groundAndScore) and a TOR's cross-document rollup
 * (aiExtraction.ts's rollUpForTor) — extracted here so the two can never
 * drift onto different scales.
 */

import { CORE_FIELD_KEYS, type ExtractedFieldKey } from './fieldSchema';

/**
 * = avg(confidence of every field, core or optional, that was found and
 *   grounded) × (core fields found and grounded / total core fields)
 *
 * The average rewards accuracy across everything the model actually found.
 * The coverage term only checks `CORE_FIELD_KEYS` — the handful of facts a
 * real procurement document essentially always states — so a field outside
 * that set being legitimately absent (no clarification meeting, no stated
 * risks section, ...) no longer caps every record's confidence the way
 * requiring all sixteen fields did.
 *
 * `confidenceOf` is a plain accessor rather than a Map/Record directly so
 * both call sites — one holding `Record<ExtractedFieldKey, FieldExtraction>`,
 * the other a `Map<ExtractedFieldKey, number>` — can pass their own shape in
 * without either one reshaping data just to call this.
 */
export function computeOverallConfidence(
  confidenceOf: (key: ExtractedFieldKey) => number,
  allKeys: readonly ExtractedFieldKey[]
): number {
  const kept = allKeys.map(confidenceOf).filter((c) => c > 0);
  if (kept.length === 0) return 0;
  const average = kept.reduce((a, b) => a + b, 0) / kept.length;

  const coreFound = CORE_FIELD_KEYS.filter((key) => confidenceOf(key) > 0).length;
  const coverage = coreFound / CORE_FIELD_KEYS.length;

  return average * coverage;
}
