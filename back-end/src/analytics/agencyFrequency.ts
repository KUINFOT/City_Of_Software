/**
 * Procurement frequency and typical project size per agency (FR-ANL-01;
 * US-033).
 *
 * Pure aggregation, like budgetComparison.ts; the rows come from
 * `analyticsQueries.ts`. Two rules shape the numbers:
 *
 *   - Frequency needs a date. A record whose announcement date was never
 *     extracted cannot be placed in a year, so it is left out of every figure
 *     for its agency and counted in `excludedNoDate`, not guessed into a year.
 *   - Every agency is divided by the SAME window. A per-agency span (first to
 *     last year seen) would make an agency with one old record look as busy as
 *     one with one recent record, and would make rates incomparable across
 *     agencies, which is the point of this report. The window is the requested
 *     year range, or the span of years present in the data when none is given.
 *
 * Derived figures (a rate, a typical size) below the minimum comparable-set
 * size (TBD-02) are returned as null with the matching `...Sufficient` flag
 * false. The raw counts are always returned: a count is a fact, a rate
 * computed from two records is not.
 */

import { summarizeBudgets, isExtractableBudget } from './budgetComparison';

export interface FrequencyRow {
  agencyId: string;
  agencyName: string;
  /** Calendar year of the announcement, or null when the date was never extracted. */
  year: number | null;
  amountThb?: number | null;
}

export interface AgencyFrequency {
  agencyId: string;
  agencyName: string;
  /** Dated procurements: what the rate is built from. */
  procurementCount: number;
  excludedNoDate: number;
  activeYears: number;
  /** null when `procurementCount` is below the minimum comparable-set size. */
  procurementsPerYear: number | null;
  frequencySufficient: boolean;
  /** Dated procurements that also have an extractable budget: what the typical size is built from. */
  budgetedCount: number;
  excludedNoBudget: number;
  /** null when `budgetedCount` is below the minimum comparable-set size. */
  typicalBudgetThb: number | null;
  q1Thb: number | null;
  q3Thb: number | null;
  sizeSufficient: boolean;
}

export interface FrequencyWindow {
  fromYear: number;
  toYear: number;
  /** Inclusive year count the rates are divided by; at least 1. */
  years: number;
}

export interface AgencyFrequencyReport {
  minComparableN: number;
  /** null when there is no dated record and no explicit range to measure against. */
  window: FrequencyWindow | null;
  agencies: AgencyFrequency[];
  totals: { agencyCount: number; procurementCount: number; excludedNoDate: number };
}

export interface FrequencyRange {
  yearFrom?: number | null;
  yearTo?: number | null;
}

export function summarizeAgencyFrequency(
  rows: FrequencyRow[],
  minComparableN: number,
  range: FrequencyRange = {}
): AgencyFrequencyReport {
  const minimum = Math.max(1, minComparableN);

  const byAgency = new Map<string, { agencyName: string; rows: FrequencyRow[] }>();
  for (const row of rows) {
    const entry = byAgency.get(row.agencyId);
    if (entry) entry.rows.push(row);
    else byAgency.set(row.agencyId, { agencyName: row.agencyName, rows: [row] });
  }

  const observedYears = rows.flatMap((row) => (row.year == null ? [] : [row.year]));
  const fromYear = range.yearFrom ?? (observedYears.length > 0 ? Math.min(...observedYears) : undefined);
  const toYear = range.yearTo ?? (observedYears.length > 0 ? Math.max(...observedYears) : undefined);
  const window: FrequencyWindow | null =
    fromYear === undefined || toYear === undefined
      ? null
      : { fromYear, toYear, years: Math.max(1, toYear - fromYear + 1) };

  const agencies: AgencyFrequency[] = [...byAgency.entries()].map(([agencyId, { agencyName, rows: agencyRows }]) => {
    const dated = agencyRows.filter((row) => row.year != null);
    const budgets = dated.flatMap((row) => (isExtractableBudget(row.amountThb) ? [row.amountThb] : []));

    const frequencySufficient = window !== null && dated.length >= minimum;
    const sizeSufficient = budgets.length >= minimum;
    const size = sizeSufficient ? summarizeBudgets(budgets) : null;

    return {
      agencyId,
      agencyName,
      procurementCount: dated.length,
      excludedNoDate: agencyRows.length - dated.length,
      activeYears: new Set(dated.map((row) => row.year)).size,
      procurementsPerYear: frequencySufficient && window ? dated.length / window.years : null,
      frequencySufficient,
      budgetedCount: budgets.length,
      excludedNoBudget: dated.length - budgets.length,
      typicalBudgetThb: size?.medianThb ?? null,
      q1Thb: size?.q1Thb ?? null,
      q3Thb: size?.q3Thb ?? null,
      sizeSufficient,
    };
  });

  agencies.sort((a, b) => b.procurementCount - a.procurementCount || a.agencyName.localeCompare(b.agencyName, 'th'));

  return {
    minComparableN: minimum,
    window,
    agencies,
    totals: {
      agencyCount: agencies.length,
      procurementCount: agencies.reduce((sum, agency) => sum + agency.procurementCount, 0),
      excludedNoDate: agencies.reduce((sum, agency) => sum + agency.excludedNoDate, 0),
    },
  };
}
