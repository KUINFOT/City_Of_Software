/**
 * Historical-budget comparison (FR-ANL-01, FR-ANL-04; US-032).
 *
 * Pure aggregation over an already-selected comparable set (same agency,
 * project type and period). Selecting the set is `analyticsQueries.ts`'s job;
 * this module only decides what can honestly be said about it, so the rules
 * below are unit-testable without a database:
 *
 *   - A record without an extractable budget is EXCLUDED from every figure and
 *     counted in `excludedNoBudget`, never folded in as zero (the same
 *     "absent stays absent" rule procurementStats.ts applies to outliers).
 *   - Every figure rests on `recordCount`, which is returned with it.
 *   - Below the minimum comparable-set size (TBD-02, the same setting the
 *     outlier flag uses) the set is labelled insufficient and NO figure is
 *     returned, not a figure with a caveat attached.
 *   - Amounts are nominal as announced: no inflation adjustment, no VAT
 *     normalisation. The response states this on every reply (`basis`).
 */

import { percentile } from './outlierMath';

/**
 * Upper edges (exclusive) of the distribution bands, in THB. Fixed rather
 * than derived from the data so two selections can be read side by side:
 * bands that moved with the data would make "5 projects in the middle band"
 * mean something different for every agency.
 */
export const BUDGET_BAND_EDGES_THB = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000] as const;

export interface BudgetRow {
  amountThb?: number | null;
  /** Calendar year of the announcement, or null when the date was never extracted. */
  year?: number | null;
}

export interface BudgetBand {
  fromThb: number;
  /** null for the open-ended top band. */
  toThb: number | null;
  count: number;
}

export interface BudgetSummary {
  minThb: number;
  q1Thb: number;
  medianThb: number;
  q3Thb: number;
  maxThb: number;
  meanThb: number;
}

export interface YearBudget {
  year: number;
  recordCount: number;
  sufficient: boolean;
  /** null when this year alone is below the minimum comparable-set size. */
  medianThb: number | null;
}

export interface BudgetComparison {
  /** Records that have an extractable budget: what every figure below is built from. */
  recordCount: number;
  /** Records in the selection that were left out because they have no extractable budget. */
  excludedNoBudget: number;
  minComparableN: number;
  sufficient: boolean;
  summary: BudgetSummary | null;
  distribution: BudgetBand[] | null;
  /** Counted in `recordCount` but absent from `byYear`, because their date was never extracted. */
  undatedRecordCount: number;
  byYear: YearBudget[];
  basis: 'nominal_unadjusted';
}

/** Finite and positive. A 0 or negative "budget" is a parse artefact, not a price. */
export function isExtractableBudget(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Throws on an empty array, like computeIqrBounds: apply the minimum-N gate first. */
export function summarizeBudgets(budgets: number[]): BudgetSummary {
  if (budgets.length === 0) throw new Error('summarizeBudgets requires at least one value');
  const sorted = [...budgets].sort((a, b) => a - b);
  return {
    minThb: sorted[0],
    q1Thb: percentile(sorted, 0.25),
    medianThb: percentile(sorted, 0.5),
    q3Thb: percentile(sorted, 0.75),
    maxThb: sorted[sorted.length - 1],
    meanThb: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

/** Counts per fixed band; a budget exactly on an edge belongs to the band above it. */
export function bandBudgets(budgets: number[]): BudgetBand[] {
  const lowers = [0, ...BUDGET_BAND_EDGES_THB];
  return lowers.map((fromThb, index) => {
    const toThb = index < BUDGET_BAND_EDGES_THB.length ? BUDGET_BAND_EDGES_THB[index] : null;
    const count = budgets.filter((budget) => budget >= fromThb && (toThb === null || budget < toThb)).length;
    return { fromThb, toThb, count };
  });
}

export function compareBudgets(rows: BudgetRow[], minComparableN: number): BudgetComparison {
  // A minimum of 0 or less would call an empty set sufficient and make
  // summarizeBudgets throw, so an empty set is never sufficient.
  const minimum = Math.max(1, minComparableN);
  const budgets: number[] = [];
  const perYear = new Map<number, number[]>();
  let excludedNoBudget = 0;
  let undatedRecordCount = 0;

  for (const row of rows) {
    if (!isExtractableBudget(row.amountThb)) {
      excludedNoBudget += 1;
      continue;
    }
    budgets.push(row.amountThb);
    if (row.year == null) {
      undatedRecordCount += 1;
      continue;
    }
    const bucket = perYear.get(row.year);
    if (bucket) bucket.push(row.amountThb);
    else perYear.set(row.year, [row.amountThb]);
  }

  const sufficient = budgets.length >= minimum;

  const byYear: YearBudget[] = [...perYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, yearBudgets]) => {
      const yearSufficient = yearBudgets.length >= minimum;
      return {
        year,
        recordCount: yearBudgets.length,
        sufficient: yearSufficient,
        medianThb: yearSufficient ? summarizeBudgets(yearBudgets).medianThb : null,
      };
    });

  return {
    recordCount: budgets.length,
    excludedNoBudget,
    minComparableN: minimum,
    sufficient,
    summary: sufficient ? summarizeBudgets(budgets) : null,
    distribution: sufficient ? bandBudgets(budgets) : null,
    undatedRecordCount,
    byYear,
    basis: 'nominal_unadjusted',
  };
}
