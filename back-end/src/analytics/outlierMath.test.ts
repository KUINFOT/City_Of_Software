import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyOutlier, computeIqrBounds, deviationFromMedianPct } from './outlierMath';

describe('computeIqrBounds', () => {
  it('matches a hand-calculated small dataset', () => {
    // Sorted: 10, 20, 30, 40, 50 — Q1=20, Q3=40 (linear-interpolation quartiles), IQR=20.
    const bounds = computeIqrBounds([50, 10, 30, 20, 40], 1.5);
    assert.equal(bounds.median, 30);
    assert.equal(bounds.q1, 20);
    assert.equal(bounds.q3, 40);
    assert.equal(bounds.iqr, 20);
    assert.equal(bounds.lowerBound, 20 - 1.5 * 20); // -10
    assert.equal(bounds.upperBound, 40 + 1.5 * 20); // 70
  });

  it('handles a single-value set without dividing by zero', () => {
    const bounds = computeIqrBounds([1_000_000], 1.5);
    assert.equal(bounds.median, 1_000_000);
    assert.equal(bounds.iqr, 0);
    assert.equal(bounds.lowerBound, 1_000_000);
    assert.equal(bounds.upperBound, 1_000_000);
  });

  it('throws on an empty array — callers must apply the minimum-N gate first', () => {
    assert.throws(() => computeIqrBounds([], 1.5));
  });

  it('is order-independent (does not mutate or rely on input order)', () => {
    const a = computeIqrBounds([5, 1, 4, 2, 3], 1.5);
    const b = computeIqrBounds([1, 2, 3, 4, 5], 1.5);
    assert.deepEqual(a, b);
  });
});

describe('classifyOutlier', () => {
  const bounds = computeIqrBounds([10, 20, 30, 40, 50], 1.5); // [-10, 70]

  it('classifies a value inside the fences as not an outlier', () => {
    assert.equal(classifyOutlier(30, bounds), false);
    assert.equal(classifyOutlier(69, bounds), false);
  });

  it('classifies a value outside the fences as an outlier', () => {
    assert.equal(classifyOutlier(71, bounds), true);
    assert.equal(classifyOutlier(-11, bounds), true);
  });

  it('treats the exact fence boundary as still within range', () => {
    assert.equal(classifyOutlier(70, bounds), false);
    assert.equal(classifyOutlier(-10, bounds), false);
  });
});

describe('deviationFromMedianPct', () => {
  it('computes a signed percent deviation', () => {
    assert.equal(deviationFromMedianPct(150, 100), 50);
    assert.equal(deviationFromMedianPct(50, 100), -50);
    assert.equal(deviationFromMedianPct(100, 100), 0);
  });

  it('does not divide by zero when the median itself is zero', () => {
    assert.equal(deviationFromMedianPct(0, 0), 0);
    assert.equal(deviationFromMedianPct(100, 0), Infinity);
  });
});
