/**
 * Scheduler settings, read from the environment.
 *
 * Own `dotenv.config()` call for the same reason `extraction/core/config.ts`
 * and `config/gcpConfig.ts` have one: nothing here should require
 * `MONGODB_URI` just to be read (e.g. by a future test of the cron
 * expressions themselves).
 *
 * Per-agency cadence follows docs/extraction-pipeline.md's documented
 * suggestions: MOL/DGA/MOC/ITD daily (MOL and MOC both publish
 * public-comment windows that run only 3-6 days — anything less frequent
 * risks missing a live one entirely), DEPA weekly (the whole archive is one
 * page load; new rows are infrequent).
 */

import cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const cronConfig = {
  /**
   * Deliberately OFF by default. A local `npm run dev` must not silently
   * start crawling live government websites in the background just because
   * the server started — this has to be turned on with intent, in the
   * deployed environment's own configuration.
   */
  enabled: process.env.SCHEDULER_ENABLED === 'true',

  dga: optional('CRON_DGA', '0 2 * * *'),
  mol: optional('CRON_MOL', '0 3 * * *'),
  moc: optional('CRON_MOC', '0 4 * * *'),
  itd: optional('CRON_ITD', '0 5 * * *'),
  depa: optional('CRON_DEPA', '0 6 * * 1'),
  extractionSweep: optional('CRON_EXTRACTION_SWEEP', '*/30 * * * *'),
  analytics: optional('CRON_ANALYTICS', '0 7 * * *'),
} as const;

export type CronConfig = typeof cronConfig;

/**
 * Validate every configured expression up front. An invalid cron string
 * must fail loudly at boot, not silently never fire — the latter is far
 * harder to notice than a startup crash.
 */
export function validateCronConfig(): void {
  const entries: Array<[string, string]> = [
    ['CRON_DGA', cronConfig.dga],
    ['CRON_MOL', cronConfig.mol],
    ['CRON_MOC', cronConfig.moc],
    ['CRON_ITD', cronConfig.itd],
    ['CRON_DEPA', cronConfig.depa],
    ['CRON_EXTRACTION_SWEEP', cronConfig.extractionSweep],
    ['CRON_ANALYTICS', cronConfig.analytics],
  ];
  for (const [name, expression] of entries) {
    if (!cron.validate(expression)) {
      throw new Error(`Invalid cron expression for ${name}: "${expression}"`);
    }
  }
}
