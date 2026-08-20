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

export const extractionConfig = {
  /** Where downloaded attachments land. See pipeline/storage.ts. */
  storageDir: process.env.EXTRACTION_STORAGE_DIR || './storage',
  /** Minimum gap between requests to one host. */
  delayMs: Math.max(MIN_DELAY_MS, num('EXTRACTION_DELAY_MS', MIN_DELAY_MS)),
  timeoutMs: num('EXTRACTION_TIMEOUT_MS', 30_000),
  maxRetries: num('EXTRACTION_MAX_RETRIES', 3),
  /** Sent on every outbound request. Must stay honest and contactable. */
  userAgent: process.env.EXTRACTION_USER_AGENT || DEFAULT_USER_AGENT,
} as const;

export type ExtractionConfig = typeof extractionConfig;
