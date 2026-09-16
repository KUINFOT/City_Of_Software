/**
 * Wires the extraction pipeline, AI extraction sweep, and outlier analysis
 * to cron schedules (US-036).
 *
 * Every job's outcome is already durably recorded by an existing model —
 * `ScrapeJob` for a crawl, `ExtractionJob` for a document's AI extraction —
 * so US-036 AC2 ("the run's outcome, duration and item counts are
 * recorded") needs no new tracking here; this module is purely the trigger.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { runSource } from '../extraction/pipeline/runner';
import { runExtractionSweep } from '../extraction/pipeline/aiExtraction';
import { runOutlierAnalysis } from '../analytics/procurementStats';
import { runDigestDispatch } from '../notifications/digest';
import { schedulableSources } from '../extraction/registry';
import { createLogger } from '../extraction/core/logger';
import { cronConfig, validateCronConfig } from './cronConfig';
import { withLock } from './lock';
import type { SourceId } from '../extraction/types';

const logger = createLogger('scheduler');

/** Maps a registry source id to its own configured cron expression. */
const SOURCE_CRON: Partial<Record<SourceId, string>> = {
  dga: cronConfig.dga,
  mol: cronConfig.mol,
  moc: cronConfig.moc,
  itd: cronConfig.itd,
  depa: cronConfig.depa,
};

let tasks: ScheduledTask[] = [];

/**
 * Registers every crawl/extraction/analytics job on its configured
 * schedule. A no-op if `SCHEDULER_ENABLED` is not `'true'` — callers should
 * still call this unconditionally (it checks the flag itself) so `index.ts`
 * doesn't need its own copy of that logic.
 */
export function startScheduler(): void {
  if (!cronConfig.enabled) {
    logger.info('scheduler disabled (SCHEDULER_ENABLED is not "true") — no jobs registered');
    return;
  }
  if (tasks.length > 0) {
    logger.warn('startScheduler() called again while already running — ignoring');
    return;
  }

  validateCronConfig();

  for (const source of schedulableSources()) {
    const expression = SOURCE_CRON[source.id];
    if (!expression) {
      // A schedulable source the cron config doesn't yet know about — fail
      // loudly rather than silently never crawling it.
      throw new Error(`No cron expression configured for schedulable source "${source.id}"`);
    }
    tasks.push(
      cron.schedule(expression, () => {
        void withLock(
          `crawl:${source.id}`,
          () => runSource(source.id, { trigger: 'scheduled', withAttachments: true }).then(() => undefined),
          logger
        );
      })
    );
    logger.info(`registered crawl for "${source.id}" on schedule "${expression}"`);
  }

  tasks.push(
    cron.schedule(cronConfig.extractionSweep, () => {
      void withLock('extraction:sweep', () => runExtractionSweep().then(() => undefined), logger);
    })
  );
  logger.info(`registered the AI extraction sweep on schedule "${cronConfig.extractionSweep}"`);

  tasks.push(
    cron.schedule(cronConfig.analytics, () => {
      void withLock('analytics:outliers', () => runOutlierAnalysis(logger).then(() => undefined), logger);
    })
  );
  logger.info(`registered outlier analysis on schedule "${cronConfig.analytics}"`);

  tasks.push(
    cron.schedule(cronConfig.digest, () => {
      void withLock('notifications:digest', () => runDigestDispatch(logger).then(() => undefined), logger);
    })
  );
  logger.info(`registered daily-digest dispatch on schedule "${cronConfig.digest}"`);

  logger.info(`scheduler started — ${tasks.length} job(s) registered`);
}

/** Stops every registered job. Used by tests and by a clean server shutdown. */
export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks = [];
}
