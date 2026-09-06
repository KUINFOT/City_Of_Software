/**
 * Rolls up a source's recent `ScrapeJob` history into one traffic-light
 * status for an admin dashboard (US-044: "so that I learn a source has
 * broken before vendors notice the silence").
 *
 * Pure and DB-free by design, like every other `core/` module — the
 * controller (`controllers/extraction.controller.ts`) does the Mongo query
 * and hands this the last few runs, newest first.
 */

/**
 * Mirrors `RunResult['status']` plus `'running'` — a `ScrapeJob` can be left
 * at `running` forever if the process died mid-crawl before it ever wrote a
 * final status, and that itself is a health signal this module must not
 * silently mistype away.
 */
export type RunStatus = 'success' | 'partial' | 'failed' | 'skipped' | 'running';

/** The slice of a ScrapeJob this module actually needs. */
export interface RecentRunSummary {
  status: RunStatus;
  hadErrors: boolean;
  startedAt: Date;
  newestAnnouncedAt: Date | null;
  torsFound: number;
}

export type HealthStatus = 'healthy' | 'stale' | 'error' | 'format_suspected' | 'blocked' | 'unknown';

export interface SourceHealth {
  neverRun: boolean;
  lastRunAt: Date | null;
  lastRunStatus: RunStatus | null;
  lastSuccessAt: Date | null;
  /** Newest announcement date the source has ever shown us, from its most
   *  recent non-skipped run. */
  newestAnnouncedAt: Date | null;
  staleDays: number | null;
  isStale: boolean;
  /** How many of the most recent runs, counting back from the latest,
   *  logged errors with no clean run in between. A `skipped` run (ToS
   *  gate, not a fetch attempt) doesn't break or extend this streak. */
  consecutiveErrorRuns: number;
  /** Rows were found but not one had a parseable announcement date — almost
   *  always means a selector broke, not that the site published nothing. */
  formatSuspected: boolean;
  health: HealthStatus;
}

export interface ClassifyOptions {
  /** ToS forbids running this source at all (e.g. eGP BMA2) — a deliberate
   *  choice, not a broken adapter, and must never be reported as one. */
  blocked: boolean;
  today: Date;
  staleAfterDays: number;
}

/** `runs` must be newest-first (the controller's `.sort({ startedAt: -1 })`). */
export function classifySourceHealth(runs: RecentRunSummary[], opts: ClassifyOptions): SourceHealth {
  if (opts.blocked) {
    return {
      neverRun: runs.length === 0,
      lastRunAt: runs[0]?.startedAt ?? null,
      lastRunStatus: runs[0]?.status ?? null,
      lastSuccessAt: null,
      newestAnnouncedAt: null,
      staleDays: null,
      isStale: false,
      consecutiveErrorRuns: 0,
      formatSuspected: false,
      health: 'blocked',
    };
  }

  if (runs.length === 0) {
    return {
      neverRun: true,
      lastRunAt: null,
      lastRunStatus: null,
      lastSuccessAt: null,
      newestAnnouncedAt: null,
      staleDays: null,
      isStale: false,
      consecutiveErrorRuns: 0,
      formatSuspected: false,
      health: 'unknown',
    };
  }

  const latest = runs[0];
  const lastSuccessful = runs.find((r) => r.status === 'success' || r.status === 'partial') ?? null;
  const newestAnnouncedAt = lastSuccessful?.newestAnnouncedAt ?? null;
  const staleDays = newestAnnouncedAt
    ? Math.floor((opts.today.getTime() - newestAnnouncedAt.getTime()) / 86_400_000)
    : null;
  const isStale = staleDays !== null && staleDays > opts.staleAfterDays;

  let consecutiveErrorRuns = 0;
  for (const run of runs) {
    if (run.status === 'skipped') continue;
    if (run.hadErrors || run.status === 'failed' || run.status === 'running') consecutiveErrorRuns += 1;
    else break;
  }

  const formatSuspected =
    latest.status !== 'skipped' && latest.torsFound > 0 && latest.newestAnnouncedAt === null;

  let health: HealthStatus;
  if (consecutiveErrorRuns >= 2) health = 'error';
  else if (formatSuspected) health = 'format_suspected';
  else if (isStale) health = 'stale';
  else if (latest.hadErrors || latest.status === 'failed' || latest.status === 'running') health = 'error';
  else health = 'healthy';

  return {
    neverRun: false,
    lastRunAt: latest.startedAt,
    lastRunStatus: latest.status,
    lastSuccessAt: lastSuccessful?.startedAt ?? null,
    newestAnnouncedAt,
    staleDays,
    isStale,
    consecutiveErrorRuns,
    formatSuspected,
    health,
  };
}
