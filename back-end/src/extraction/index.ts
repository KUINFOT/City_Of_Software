/**
 * Public entry point for the extraction pipeline.
 *
 * Everything outside `src/extraction/` should import from here rather than
 * reaching into the internals, so adapters and pipeline stages stay free to
 * change shape.
 */

export { runSource, type RunDeps } from './pipeline/runner';
export { SOURCES, SOURCE_IDS, getSource, schedulableSources } from './registry';
export { classify, fromAuthoritative, PRE_AWARD_STAGES, STAGE_LABELS } from './core/awardStatus';
export { createLogger } from './core/logger';
export { LocalBlobStore, type BlobStore } from './pipeline/storage';
export type {
  AwardStage,
  CommentWindow,
  CommentWindowStatus,
  RawListing,
  RunOptions,
  RunResult,
  SourceDescriptor,
  SourceId,
  StageSignal,
  StageVerdict,
} from './types';

import { runSource } from './pipeline/runner';
import { schedulableSources } from './registry';
import { createLogger } from './core/logger';
import type { RunOptions, RunResult } from './types';
import type { RunDeps } from './pipeline/runner';

/**
 * Run every source that is cleared to run unattended.
 *
 * Sources run **sequentially**, not in parallel. Each one is rate-limited
 * against its own host anyway, so parallelism would buy little; running one
 * at a time keeps the outbound request pattern boring and keeps a failure in
 * one source from muddying another's job record.
 *
 * A source excluded here is excluded on purpose — eGP BMA2's Terms of Service
 * forbid crawling, so it never joins a scheduled sweep. Run it deliberately,
 * with an override, or not at all.
 */
export async function runAllSchedulable(
  options: RunOptions = {},
  deps: RunDeps = {}
): Promise<RunResult[]> {
  const logger = deps.logger ?? createLogger('extraction');
  const sources = schedulableSources();
  logger.info(`sweeping ${sources.length} schedulable source(s): ${sources.map((s) => s.id).join(', ')}`);

  const results: RunResult[] = [];
  for (const source of sources) {
    try {
      results.push(
        await runSource(source.id, { ...options, trigger: options.trigger ?? 'scheduled' }, { ...deps, logger })
      );
    } catch (err) {
      // A source that throws outright still shouldn't stop the sweep.
      logger.error(`source ${source.id} failed outright: ${(err as Error).message}`);
      results.push({
        sourceId: source.id,
        jobId: null,
        status: 'failed',
        found: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        attachmentsStored: 0,
        stageCounts: {
          plan: 0,
          draft_tor: 0,
          spec: 0,
          price_reference: 0,
          bidding_open: 0,
          awarded: 0,
          cancelled: 0,
          other: 0,
        },
        preAwardCount: 0,
        newestAnnouncedAt: null,
        errors: [(err as Error).message],
        startedAt: new Date(),
        finishedAt: new Date(),
      });
    }
  }
  return results;
}
