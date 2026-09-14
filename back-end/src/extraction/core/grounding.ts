/**
 * Grounding check for AI-extracted fields (FR-EXT-09 / NFR-DAT-03).
 *
 * "No field is published that is not supported by content in the source
 * document" is not optional and not a matter of degree — a field either
 * traces to something the document actually says, or it is discarded and
 * logged. This module is the check that decides which.
 *
 * The model is asked to return, alongside every field value, a verbatim
 * `evidence` quote from the source text. This does not verify that the
 * MODEL'S INTERPRETATION of that quote is correct (that's what confidence
 * scoring and human review are for) — it only verifies that the quote
 * itself actually appears in the document, so a value cannot be published
 * on the strength of text the model invented outright.
 */

import { normalizeTitle } from './fingerprint';

/**
 * Does `evidence` actually appear in `sourceText`?
 *
 * Both sides are run through the same whitespace/punctuation/case
 * normalisation `fingerprint.ts` already uses for title matching, so
 * cosmetic differences (a line break mid-sentence, inconsistent spacing
 * around punctuation) don't fail a genuine quote. A `null` or empty
 * evidence string never grounds anything — the caller is expected to treat
 * a field with no evidence as ungrounded regardless of its claimed value.
 */
export function verifyGrounding(sourceText: string | null | undefined, evidence: string | null | undefined): boolean {
  if (!evidence || !evidence.trim()) return false;
  const haystack = normalizeTitle(sourceText ?? '');
  const needle = normalizeTitle(evidence);
  if (!needle) return false;
  return haystack.includes(needle);
}
