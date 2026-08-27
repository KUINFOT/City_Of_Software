/**
 * Budget-outlier statistics (FR-ANL-04–07).
 *
 * Method: Tukey's fences on the interquartile range, not a mean/standard-
 * deviation z-score. Procurement budgets are heavily right-skewed — they
 * span orders of magnitude within one agency, and a handful of very large
 * contracts can drag a mean (and a stddev built from it) far enough that a
 * z-score stops meaning much. The IQR is computed from the middle 50% of the
 * distribution, so it stays stable in the presence of the very outliers it's
 * being used to detect.
 *
 * The margin (`k`, the IQR multiplier) and the minimum comparable-set size
 * are both genuinely unresolved by the project as of the approved SRS
 * (Appendix C, TBD-02: "Fix the outlier margin and the minimum
 * comparable-set size... once the volume of historical records is known").
 * The defaults here (`k = 1.5`, the standard Tukey convention; min N = 5)
 * are sane starting points, not validated ones — both are exposed as
 * `extractionConfig.outlierIqrMultiplier`/`outlierMinComparableN` so they
 * can be tuned without a redeploy (NFR-MNT-04) once real data exists to
 * tune them against.
 */

export interface IqrBounds {
  q1: number;
  q3: number;
  iqr: number;
  median: number;
  lowerBound: number;
  upperBound: number;
}

/** Linear-interpolation percentile — matches the common "Tukey hinges" convention closely enough for this purpose. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Compute IQR bounds over a comparable set of budgets.
 * Throws on an empty array — callers must apply the minimum-N gate
 * (FR-ANL-05) before calling this, not after.
 */
export function computeIqrBounds(budgets: number[], k: number): IqrBounds {
  if (budgets.length === 0) {
    throw new Error('computeIqrBounds requires at least one value');
  }
  const sorted = [...budgets].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  return {
    q1,
    q3,
    iqr,
    median: percentile(sorted, 0.5),
    lowerBound: q1 - k * iqr,
    upperBound: q3 + k * iqr,
  };
}

export function classifyOutlier(budget: number, bounds: IqrBounds): boolean {
  return budget < bounds.lowerBound || budget > bounds.upperBound;
}

/** FR-ANL-04's "magnitude of the deviation" — signed percent distance from the median. */
export function deviationFromMedianPct(budget: number, median: number): number {
  if (median === 0) return budget === 0 ? 0 : Infinity;
  return ((budget - median) / median) * 100;
}
