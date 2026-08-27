/**
 * Cross-record duplicate-candidate scoring (FR-EXT-08 / NFR-DAT-05).
 *
 * Deliberately separate from `core/fingerprint.ts`. That module's
 * `identityKey`/`contentHash`/`groupRepublications` answer "is this the same
 * announcement I already scraped, from the same source, in the same run" —
 * an upsert and same-batch-republication problem. This module answers a
 * different question: "does this newly-created TOR look like a DIFFERENT
 * TOR that already exists in the corpus" — potentially from a different
 * source, a different crawl run, weeks apart. Never auto-merges; only scores
 * candidates for a human to resolve (see pipeline/duplicateCheck.ts).
 */

import { normalizeTitle } from './fingerprint';

/** Character trigrams of a normalised string, e.g. "abcd" -> {abc, bcd}. */
function trigrams(text: string): Set<string> {
  const padded = `  ${text} `; // pad so short strings still yield trigrams
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/**
 * Jaccard similarity over character trigrams, [0,1].
 *
 * Chosen over a pure edit-distance measure because Thai has no word
 * boundaries to split on (the same reason the repository's planned search
 * index avoids whitespace tokenisation) — trigrams work directly on the
 * character stream and need no language-specific segmentation. Zero new
 * dependencies, consistent with this codebase's existing in-house-algorithm
 * style (see fingerprint.ts, thaiDate.ts).
 */
export function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const gramsA = trigrams(normA);
  const gramsB = trigrams(normB);
  let intersection = 0;
  for (const g of gramsA) if (gramsB.has(g)) intersection += 1;
  const union = gramsA.size + gramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** [0,1], or null when either side is missing — never a guessed proximity. */
export function budgetProximity(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 1;
  return Math.max(0, 1 - Math.abs(a - b) / max);
}

/** Absolute days between two dates, or null when either is missing. */
export function dateProximityDays(a: Date | null | undefined, b: Date | null | undefined): number | null {
  if (!a || !b) return null;
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/** Converts a day gap to a [0,1] closeness score; further than `horizonDays` scores 0. */
function proximityScore(days: number | null, horizonDays: number): number | null {
  if (days == null) return null;
  return Math.max(0, 1 - days / horizonDays);
}

export interface DuplicateSignals {
  titleA: string;
  titleB: string;
  sameAgency: boolean;
  sameReferenceNumber: boolean;
  budgetA: number | null | undefined;
  budgetB: number | null | undefined;
  dateA: Date | null | undefined;
  dateB: Date | null | undefined;
}

export interface DuplicateScore {
  score: number;
  titleSimilarity: number;
  sameAgency: boolean;
  sameReferenceNumber: boolean;
  budgetProximity: number | null;
  dateProximityDays: number | null;
}

/** How many days apart still counts as "proximate" for scoring purposes. */
const DATE_PROXIMITY_HORIZON_DAYS = 30;

/**
 * Weighted combination of the FR-EXT-08 signals: title similarity, agency,
 * reference number, budget and date proximity.
 *
 * Base weights: 0.5 title, 0.2 same agency, 0.15 same reference number,
 * 0.15 budget proximity. When budget is unavailable on either side, its
 * weight is folded into title similarity instead of just being dropped —
 * dropping it would silently deflate the score for the (common) case where
 * one listing simply doesn't publish a budget, making a real duplicate look
 * less certain purely because of a missing field neither side controls.
 * Date proximity is a bonus signal on top (not weighted into the base 1.0),
 * since two genuinely different procurements can easily share a date.
 */
export function computeDuplicateScore(signals: DuplicateSignals): DuplicateScore {
  const sim = titleSimilarity(signals.titleA, signals.titleB);
  const budgetProx = budgetProximity(signals.budgetA, signals.budgetB);
  const dateDays = dateProximityDays(signals.dateA, signals.dateB);
  const dateProx = proximityScore(dateDays, DATE_PROXIMITY_HORIZON_DAYS);

  const titleWeight = budgetProx == null ? 0.65 : 0.5;
  const budgetWeight = budgetProx == null ? 0 : 0.15;

  let score =
    titleWeight * sim +
    0.2 * (signals.sameAgency ? 1 : 0) +
    0.15 * (signals.sameReferenceNumber ? 1 : 0) +
    budgetWeight * (budgetProx ?? 0);

  // Date proximity nudges the score without dominating it — a small bonus,
  // capped so it alone can never push an otherwise-weak match over threshold.
  if (dateProx != null) score += 0.05 * dateProx;

  return {
    score: Math.min(1, score),
    titleSimilarity: sim,
    sameAgency: signals.sameAgency,
    sameReferenceNumber: signals.sameReferenceNumber,
    budgetProximity: budgetProx,
    dateProximityDays: dateDays,
  };
}
