import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BUDGET_BAND_EDGES_THB, bandBudgets, compareBudgets, summarizeBudgets } from './budgetComparison';

const M = 1_000_000;

describe('summarizeBudgets', () => {
  it('matches a hand-calculated small dataset', () => {
    // Sorted 1M..5M: Q1=2M, median=3M, Q3=4M (linear-interpolation quartiles), mean=3M.
    const summary = summarizeBudgets([5 * M, 1 * M, 3 * M, 2 * M, 4 * M]);
    assert.deepEqual(summary, { minThb: 1 * M, q1Thb: 2 * M, medianThb: 3 * M, q3Thb: 4 * M, maxThb: 5 * M, meanThb: 3 * M });
  });

  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    summarizeBudgets(input);
    assert.deepEqual(input, [3, 1, 2]);
  });

  it('throws on an empty array — callers must apply the minimum-N gate first', () => {
    assert.throws(() => summarizeBudgets([]));
  });
});

describe('bandBudgets', () => {
  it('puts a budget exactly on an edge in the band above it', () => {
    const bands = bandBudgets([99_999, 100_000]);
    assert.equal(bands[0].count, 1);
    assert.equal(bands[1].count, 1);
  });

  it('has an open-ended top band and accounts for every budget exactly once', () => {
    const budgets = [10_000, 250_000, 750_000, 2 * M, 7 * M, 20 * M, 80 * M, 900 * M];
    const bands = bandBudgets(budgets);
    assert.equal(bands.length, BUDGET_BAND_EDGES_THB.length + 1);
    assert.equal(bands[bands.length - 1].toThb, null);
    assert.equal(bands[bands.length - 1].count, 2);
    assert.equal(bands.reduce((sum, band) => sum + band.count, 0), budgets.length);
  });
});

describe('compareBudgets (FR-ANL-01 / FR-ANL-04)', () => {
  it('excludes records without an extractable budget and reports how many', () => {
    const rows = [
      { amountThb: 1 * M, year: 2025 },
      { amountThb: null, year: 2025 },
      { amountThb: undefined, year: 2025 },
      { amountThb: 0, year: 2025 },
      { amountThb: -5, year: 2025 },
      { amountThb: Number.NaN, year: 2025 },
      { amountThb: 3 * M, year: 2025 },
    ];
    const result = compareBudgets(rows, 2);
    assert.equal(result.recordCount, 2);
    assert.equal(result.excludedNoBudget, 5);
    assert.equal(result.summary?.medianThb, 2 * M);
  });

  it('labels a set below the minimum insufficient and returns no figure, only the count', () => {
    const result = compareBudgets([{ amountThb: 1 * M }, { amountThb: 2 * M }], 5);
    assert.equal(result.sufficient, false);
    assert.equal(result.recordCount, 2);
    assert.equal(result.summary, null);
    assert.equal(result.distribution, null);
  });

  it('treats a set of exactly the minimum size as sufficient (inclusive bound)', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => ({ amountThb: n * M }));
    const result = compareBudgets(rows, 5);
    assert.equal(result.sufficient, true);
    assert.ok(result.summary);
    assert.ok(result.distribution);
  });

  it('never calls an empty set sufficient, even with a nonsensical minimum', () => {
    const result = compareBudgets([], 0);
    assert.equal(result.sufficient, false);
    assert.equal(result.summary, null);
    assert.equal(result.minComparableN, 1);
  });

  it('breaks the set down by year, oldest first, gating each year on its own count', () => {
    const rows = [
      { amountThb: 1 * M, year: 2025 },
      { amountThb: 2 * M, year: 2025 },
      { amountThb: 3 * M, year: 2025 },
      { amountThb: 9 * M, year: 2023 },
    ];
    const result = compareBudgets(rows, 3);
    assert.deepEqual(result.byYear, [
      { year: 2023, recordCount: 1, sufficient: false, medianThb: null },
      { year: 2025, recordCount: 3, sufficient: true, medianThb: 2 * M },
    ]);
  });

  it('counts an undated record in the set but not in any year', () => {
    const rows = [
      { amountThb: 1 * M, year: 2025 },
      { amountThb: 2 * M, year: null },
      { amountThb: 3 * M },
    ];
    const result = compareBudgets(rows, 1);
    assert.equal(result.recordCount, 3);
    assert.equal(result.undatedRecordCount, 2);
    assert.equal(result.byYear.reduce((sum, year) => sum + year.recordCount, 0), 1);
  });

  it('states on every result that amounts are nominal and unadjusted', () => {
    assert.equal(compareBudgets([], 5).basis, 'nominal_unadjusted');
    assert.equal(compareBudgets([{ amountThb: M }], 1).basis, 'nominal_unadjusted');
  });
});
