import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeAgencyFrequency, type FrequencyRow } from './agencyFrequency';

const M = 1_000_000;
const row = (agencyId: string, year: number | null, amountThb?: number | null): FrequencyRow => ({
  agencyId,
  agencyName: `Agency ${agencyId}`,
  year,
  amountThb,
});

/** `n` dated rows for one agency, one per year from 2022, each worth `n_i` million. */
const dated = (agencyId: string, years: number[], amounts: number[] = years.map(() => M)) =>
  years.map((year, i) => row(agencyId, year, amounts[i]));

describe('summarizeAgencyFrequency (FR-ANL-01)', () => {
  it('divides every agency by the same window, so rates are comparable', () => {
    const rows = [...dated('a', [2022, 2022, 2023, 2024, 2025]), ...dated('b', [2025, 2025, 2025, 2025, 2025])];
    const report = summarizeAgencyFrequency(rows, 5);
    assert.deepEqual(report.window, { fromYear: 2022, toYear: 2025, years: 4 });
    const [a, b] = report.agencies;
    assert.equal(a.procurementsPerYear, 5 / 4);
    assert.equal(b.procurementsPerYear, 5 / 4);
    assert.equal(a.activeYears, 4);
    assert.equal(b.activeYears, 1);
  });

  it('uses the requested range as the window when one is given, even if the data is narrower', () => {
    const report = summarizeAgencyFrequency(dated('a', [2025, 2025, 2025]), 3, { yearFrom: 2023, yearTo: 2025 });
    assert.deepEqual(report.window, { fromYear: 2023, toYear: 2025, years: 3 });
    assert.equal(report.agencies[0].procurementsPerYear, 1);
  });

  it('fills an open-ended range from the data', () => {
    const report = summarizeAgencyFrequency(dated('a', [2021, 2024]), 1, { yearFrom: 2020 });
    assert.deepEqual(report.window, { fromYear: 2020, toYear: 2024, years: 5 });
  });

  it('returns null figures with an insufficient flag below the minimum, but still returns the counts', () => {
    const report = summarizeAgencyFrequency(dated('a', [2024, 2025], [M, 2 * M]), 5);
    const a = report.agencies[0];
    assert.equal(a.procurementCount, 2);
    assert.equal(a.budgetedCount, 2);
    assert.equal(a.frequencySufficient, false);
    assert.equal(a.procurementsPerYear, null);
    assert.equal(a.sizeSufficient, false);
    assert.equal(a.typicalBudgetThb, null);
    assert.equal(a.q1Thb, null);
  });

  it('reports a typical size from the median once there are enough budgets', () => {
    const report = summarizeAgencyFrequency(dated('a', [2021, 2022, 2023, 2024, 2025], [1 * M, 2 * M, 3 * M, 4 * M, 100 * M]), 5);
    const a = report.agencies[0];
    assert.equal(a.sizeSufficient, true);
    assert.equal(a.typicalBudgetThb, 3 * M);
    assert.equal(a.q1Thb, 2 * M);
    assert.equal(a.q3Thb, 4 * M);
  });

  it('leaves undated records out of every figure and counts them', () => {
    const rows = [...dated('a', [2024, 2025]), row('a', null, 9 * M), row('a', null, 9 * M)];
    const a = summarizeAgencyFrequency(rows, 1).agencies[0];
    assert.equal(a.procurementCount, 2);
    assert.equal(a.excludedNoDate, 2);
    assert.equal(a.budgetedCount, 2);
  });

  it('counts a dated record without a budget as a procurement but not toward typical size', () => {
    const rows = [row('a', 2024, M), row('a', 2025, null), row('a', 2025, 0)];
    const a = summarizeAgencyFrequency(rows, 1).agencies[0];
    assert.equal(a.procurementCount, 3);
    assert.equal(a.budgetedCount, 1);
    assert.equal(a.excludedNoBudget, 2);
    assert.equal(a.typicalBudgetThb, M);
  });

  it('ranks agencies by procurement count, then by name', () => {
    const rows = [...dated('c', [2025]), ...dated('b', [2025, 2025]), ...dated('a', [2025])];
    const report = summarizeAgencyFrequency(rows, 1);
    assert.deepEqual(report.agencies.map((agency) => agency.agencyId), ['b', 'a', 'c']);
    assert.deepEqual(report.totals, { agencyCount: 3, procurementCount: 4, excludedNoDate: 0 });
  });

  it('has no window, and no rates, when nothing is dated and no range was requested', () => {
    const report = summarizeAgencyFrequency([row('a', null, M)], 1);
    assert.equal(report.window, null);
    assert.equal(report.agencies[0].frequencySufficient, false);
    assert.equal(report.agencies[0].procurementsPerYear, null);
    assert.equal(report.agencies[0].excludedNoDate, 1);
  });

  it('returns an empty report for no rows', () => {
    const report = summarizeAgencyFrequency([], 5);
    assert.deepEqual(report.agencies, []);
    assert.equal(report.window, null);
  });
});
