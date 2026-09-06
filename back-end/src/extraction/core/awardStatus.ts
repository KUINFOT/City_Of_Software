/**
 * Award-status classifier for Thai government procurement announcements.
 *
 * Port of `award_status.py` from the extraction research project. The point
 * of this module: tell apart announcements where a contractor has ALREADY
 * been chosen from ones still looking for a company.
 *
 * Classification is by Thai keyword in the announcement title, checked in
 * PRIORITY ORDER — the order is load-bearing, not cosmetic:
 *
 *   - `cancelled` first, because "ยกเลิกประกาศประกวดราคา" (cancelled bidding
 *     announcement) would otherwise match `bidding_open`.
 *   - `awarded` before anything else mentioning ประกวดราคา, because a winner
 *     announcement usually names the bidding method in passing.
 *   - `price_reference` before `bidding_open`, because price-disclosure titles
 *     almost always contain "ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์" as a modifier.
 *     (This exact collision was found on ITD's listing.)
 *
 * Do not reorder RULES without re-checking those three cases.
 */

import type { AwardStage, StageSignal, StageVerdict } from '../types';

/** Checked in this order; first match wins. */
const RULES: ReadonlyArray<readonly [AwardStage, readonly string[]]> = [
  // Cancellations first — see note above.
  ['cancelled', ['ยกเลิก']],
  // Winner announcements. "สาระสำคัญในสัญญา" is the standard post-award
  // contract disclosure, so a signed contract exists. Matched on the full
  // phrase, never bare "สัญญา", so "ร่างสัญญา" (draft contract) is not
  // mistaken for an award.
  ['awarded', ['ผู้ชนะ', 'ผลผู้ชนะ', 'ผู้ได้รับการคัดเลือก', 'สาระสำคัญในสัญญา', 'คู่สัญญา']],
  // Draft / public-comment stage — the clearest "still looking" signal.
  [
    'draft_tor',
    [
      'ร่างขอบเขตของงาน', 'ร่างขอบเขตงาน', 'ขอบเขตของงาน', 'ขอบเขตงาน',
      'TOR', 'ประชาพิจารณ์', 'ประชาวิจารณ์', 'แสดงความคิดเห็น',
      'ร่างประกาศ', 'ร่างเอกสาร', 'ร่างสัญญา', 'วิจารณ์',
    ],
  ],
  // Technical specification sheet — issued while still seeking bidders.
  ['spec', ['คุณลักษณะเฉพาะ']],
  // Procurement plan — published before anything is open.
  ['plan', ['แผนการจัดซื้อ', 'แผนการจัดจ้าง', 'เผยแพร่แผน']],
  // Reference price / budget disclosure. Must stay BEFORE bidding_open.
  ['price_reference', ['ราคากลาง', 'ตารางแสดงวงเงิน', 'บก.06', 'บก.01']],
  // Live invitation to bid.
  ['bidding_open', ['ประกวดราคา', 'เชิญชวน', 'สอบราคา', 'ประมูล', 'e-bidding', 'e-Bidding']],
];

export const STAGE_LABELS: Record<AwardStage, string> = {
  plan: 'procurement plan (nothing open yet)',
  draft_tor: 'draft TOR / public comment — PRE-AWARD',
  spec: 'technical specification — PRE-AWARD',
  price_reference: 'reference price disclosure',
  bidding_open: 'bidding open, accepting bids — PRE-AWARD',
  awarded: 'winner announced — AWARDED',
  cancelled: 'cancelled',
  other: 'unclassified',
};

/** Stages where a vendor can still act — the whole reason this platform exists. */
export const PRE_AWARD_STAGES: ReadonlySet<AwardStage> = new Set<AwardStage>([
  'draft_tor',
  'spec',
  'bidding_open',
]);

/**
 * Classify one announcement title.
 *
 * `isAwarded` is deliberately `boolean | null`, never a plain boolean:
 * `null` means "the title didn't say", which is a different fact from
 * "confirmed not awarded". Collapsing the two silently mislabels the ~65%
 * of direct-appointment (วิธีเฉพาะเจาะจง) announcements that legally skip
 * the public bidding stage and so never state one.
 */
export function classify(title: string, signal: StageSignal = 'title_keyword'): StageVerdict {
  const text = title ?? '';
  for (const [stage, keywords] of RULES) {
    if (keywords.some((kw) => text.includes(kw))) {
      return {
        stage,
        stageLabel: STAGE_LABELS[stage],
        isAwarded: stage === 'awarded',
        signal,
      };
    }
  }
  return { stage: 'other', stageLabel: STAGE_LABELS.other, isAwarded: null, signal };
}

/**
 * Build a stage verdict from a source that publishes an authoritative status
 * code of its own (only eGP BMA2 has one). Kept separate from `classify()`
 * so the `signal` field records that this was never a keyword guess.
 */
export function fromAuthoritative(
  stage: AwardStage,
  isAwarded: boolean | null
): StageVerdict {
  return { stage, stageLabel: STAGE_LABELS[stage], isAwarded, signal: 'authoritative' };
}

/** Count rows per stage — used for run summaries and the ScrapeJob record. */
export function tallyStages(verdicts: ReadonlyArray<StageVerdict>): Record<AwardStage, number> {
  const counts = Object.fromEntries(
    (Object.keys(STAGE_LABELS) as AwardStage[]).map((s) => [s, 0])
  ) as Record<AwardStage, number>;
  for (const v of verdicts) counts[v.stage] += 1;
  return counts;
}

/** How many of these are stages a vendor can still bid on. */
export function countPreAward(verdicts: ReadonlyArray<StageVerdict>): number {
  return verdicts.filter((v) => PRE_AWARD_STAGES.has(v.stage)).length;
}
