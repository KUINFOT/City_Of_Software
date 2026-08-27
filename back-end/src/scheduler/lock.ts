/**
 * Overlapping-run protection (SRS Section 7.3, Software Interfaces —
 * Scheduler: "Invokes crawl, extraction, match and digest jobs on
 * configured schedules, with overlapping-run protection so that a slow run
 * is never started twice concurrently.")
 *
 * A plain in-memory `Set` is sufficient and race-free here because Node is
 * single-threaded — there is no window between "check if key is running"
 * and "mark it running" that another call can interleave into.
 *
 * Flagged limitation, not built: this lock is per-process. It says nothing
 * across multiple app instances. If this service is ever deployed with more
 * than one instance, this needs replacing with a DB-backed lock (e.g. a
 * `findOneAndUpdate` on a small collection with an expiry) — no such
 * multi-instance infrastructure exists in this repo today (no
 * docker-compose, no orchestration config), so that replacement is out of
 * scope here.
 */

import type { Logger } from '../extraction/core/logger';

const running = new Set<string>();

export type LockOutcome = 'ran' | 'skipped';

export async function withLock(key: string, fn: () => Promise<void>, logger?: Logger): Promise<LockOutcome> {
  if (running.has(key)) {
    logger?.warn(`skipped "${key}" — a previous run is still in progress`);
    return 'skipped';
  }
  running.add(key);
  try {
    await fn();
    return 'ran';
  } finally {
    running.delete(key);
  }
}

/** Exposed for tests only — not part of the module's operational surface. */
export function isRunning(key: string): boolean {
  return running.has(key);
}
