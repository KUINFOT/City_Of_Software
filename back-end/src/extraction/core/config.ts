/**
 * Extraction settings, read from the environment.
 *
 * Kept separate from `src/config/env.ts` for one reason: that module throws on
 * import when `MONGODB_URI` is missing, by design. The extraction pipeline has
 * a dry-run mode that parses a site and writes nothing, and that mode should
 * not need a database connection string to start. Nothing here is required —
 * every setting has a working default.
 *
 * `src/config/env.ts` re-exports this object, so there is still exactly one
 * definition of each value.
 */

import dotenv from 'dotenv';

// Safe to call more than once: dotenv never overwrites a variable that is
// already set, so whichever module loads first wins and the other is a no-op.
dotenv.config();

const DEFAULT_USER_AGENT =
  'city-of-software-procurement-bot/1.0 (+https://github.com/KUINFOT/City_Of_Software; contact via repository owner)';

/**
 * Floor on the per-host request delay. Every source in the registry is
 * crawled politely, and a robots.txt asking for a longer crawl-delay raises
 * this further — but nothing lowers it below one second.
 */
const MIN_DELAY_MS = 1000;

function num(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Like `num`, but accepts an explicit `0` rather than treating it as unset.
 * `num`'s `parsed > 0` check is correct for values where zero is nonsensical
 * (a 0ms crawl delay, a 0ms timeout) — but wrong for a value where zero is a
 * legitimate, deliberate choice (e.g. "no grace period, route immediately"),
 * where it would otherwise silently substitute the fallback for an operator's
 * explicit override with no error. Only negative values and non-numbers fall
 * back here.
 */
function numAllowZero(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const extractionConfig = {
  /** Where downloaded attachments land. See pipeline/storage.ts. */
  storageDir: process.env.EXTRACTION_STORAGE_DIR || './storage',
  /** Minimum gap between requests to one host. */
  delayMs: Math.max(MIN_DELAY_MS, num('EXTRACTION_DELAY_MS', MIN_DELAY_MS)),
  timeoutMs: num('EXTRACTION_TIMEOUT_MS', 30_000),
  maxRetries: num('EXTRACTION_MAX_RETRIES', 3),
  /** Sent on every outbound request. Must stay honest and contactable. */
  userAgent: process.env.EXTRACTION_USER_AGENT || DEFAULT_USER_AGENT,
  /**
   * How many days old the newest announcement a source has ever shown us can
   * get before that source counts as "stale" (US-044's per-source health
   * signal, core/sourceHealth.ts). Shared with `pipeline/runner.ts`'s
   * `warnIfStale` log check, so the two never drift onto two different
   * definitions of "old".
   */
  staleAfterDays: num('SOURCE_STALE_AFTER_DAYS', 60),

  // --- AI extraction & review routing (FR-EXT-05, BR-03, TBD-01) ---------

  /** Below this overall confidence, a record always goes to pending_review. */
  reviewThreshold: num('EXTRACTION_REVIEW_THRESHOLD', 0.75),
  /**
   * Auto-publish is OFF by default. TBD-01 (an open issue in the approved
   * SRS, unresolved by the project's Data & AI engineer) states plainly:
   * "The conservative default is manual review for every record." This must
   * be flipped on deliberately, in configuration, never assumed.
   */
  autoPublishEnabled: process.env.EXTRACTION_AUTO_PUBLISH_ENABLED === 'true',
  /** Second, stricter gate a record must ALSO clear before auto-publishing. */
  autoPublishThreshold: num('EXTRACTION_AUTO_PUBLISH_THRESHOLD', 0.92),
  /** Automatic retries before a failed document is parked (NFR-REL-03). */
  maxAttempts: num('EXTRACTION_MAX_ATTEMPTS', 3),
  /** Documents processed per extraction-sweep run — bounds run time and cost. */
  sweepBatchSize: num('EXTRACTION_SWEEP_BATCH_SIZE', 20),
  /** Grace period before a TOR with zero attachments is routed to review anyway. */
  doclessGraceHours: numAllowZero('EXTRACTION_DOCLESS_GRACE_HOURS', 24),
  /** Rough per-document AI cost estimate in THB (FR-EXT-10/NFR-PER-06) — a
   *  placeholder until real GCP billing data exists to calibrate it. */
  estCostPerDocThb: num('EXTRACTION_EST_COST_PER_DOC_THB', 2),

  // --- Duplicate detection (FR-EXT-08, NFR-DAT-05) -----------------------

  /**
   * Minimum combined similarity score to link a candidate as a suspected
   * duplicate. Deliberately permissive (favours recall): FR-EXT-08 forbids
   * auto-merging, so a false positive only costs an admin a extra click,
   * while a missed true duplicate is the failure NFR-DAT-05 (>=95% recall)
   * actually measures. Unvalidated against a seeded set — see TBD-02.
   */
  duplicateMatchThreshold: num('DUPLICATE_MATCH_THRESHOLD', 0.65),

  // --- Outlier analytics (FR-ANL-04/05, TBD-02) --------------------------

  /** Tukey's-fence multiplier on the IQR. 1.5 is the standard default. */
  outlierIqrMultiplier: num('OUTLIER_IQR_MULTIPLIER', 1.5),
  /** Below this many comparable records, suppress the flag (FR-ANL-05). */
  outlierMinComparableN: num('OUTLIER_MIN_COMPARABLE_N', 5),
} as const;

export type ExtractionConfig = typeof extractionConfig;
