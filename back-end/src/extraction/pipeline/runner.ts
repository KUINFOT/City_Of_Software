/**
 * The run orchestrator: registry -> adapter -> normalize -> dedupe -> Mongo.
 *
 * A run has five phases, in this order, and the order matters:
 *
 *   1. **Gate.** Compliance is checked before a single request goes out. A
 *      source whose Terms of Service forbid crawling does not run without an
 *      attributed override, and the refusal is recorded as `skipped`, not
 *      `failed` — those are different facts.
 *   2. **Collect.** The adapter is consumed lazily up to `maxRecords`, with
 *      title/pre-award filters applied as rows arrive so the crawl stops as
 *      early as it can.
 *   3. **Batch cleanup.** Boilerplate attachments and republished duplicates
 *      can only be identified by looking at the whole batch at once, so this
 *      phase sits between collection and persistence rather than inside the
 *      adapters.
 *   4. **Persist.** Upsert on the stable identity key; skip writes entirely
 *      when the content hash is unchanged.
 *   5. **Report.** Including the freshness check — a run that returns 200 OK
 *      and plausible rows still tells you nothing until you compare the
 *      newest announcement date against today.
 */

import type { Types } from 'mongoose';
import { AgencyModel } from '../../models/Agency';
import { ScrapeJobModel } from '../../models/ScrapeJob';
import { TorModel } from '../../models/Tor';
import { countPreAward, tallyStages } from '../core/awardStatus';
import { groupRepublications, stripBoilerplateAttachments } from '../core/fingerprint';
import { extractionConfig } from '../core/config';
import { HttpClient } from '../core/httpClient';
import { createLogger, type Logger } from '../core/logger';
import { getSource } from '../registry';
import type {
  AdapterContext,
  AdapterOptions,
  RawListing,
  RunOptions,
  RunResult,
  SourceDescriptor,
  SourceId,
} from '../types';
import { normalize } from './normalize';
import { storeAttachments } from './attachments';
import { checkForDuplicates } from './duplicateCheck';
import { LocalBlobStore, type BlobStore } from './storage';
import { handleStageTransition } from '../../notifications/stageTransition';

const DEFAULT_OPTIONS: AdapterOptions = {
  maxPages: 3,
  maxRecords: 500,
  withDetail: true,
  preAwardOnly: false,
  keywords: [],
};

export interface RunDeps {
  logger?: Logger;
  store?: BlobStore;
  /** Storage root for the default local blob store. */
  storageRoot?: string;
}

/**
 * Refuses to run a source whose ToS prohibits crawling, unless an override
 * naming an approver and a reason is supplied.
 *
 * Written as a hard gate rather than a warning on purpose. eGP BMA2's
 * robots.txt permits exactly the paths its Terms of Service forbid — the two
 * documents disagree, and the ToS is the one that governs use. Making the
 * override explicit and attributable means the decision to accept that risk
 * is a person's, recorded on the job, and never an accident of configuration.
 */
function checkCompliance(
  source: SourceDescriptor,
  options: RunOptions
): { allowed: true } | { allowed: false; reason: string } {
  if (source.compliance.tosStatus !== 'prohibited') return { allowed: true };

  const override = options.overrideTosBlock;
  if (!override?.approvedBy || !override?.reason) {
    return {
      allowed: false,
      reason:
        `Source "${source.id}" is blocked: ${source.compliance.tosNote} ` +
        'To run it anyway, supply overrideTosBlock with approvedBy and reason — ' +
        'and get the agency\'s sign-off first.',
    };
  }
  return { allowed: true };
}

/** Ensure the source's agency exists, so TORs and jobs have an owner. */
async function ensureAgency(source: SourceDescriptor): Promise<Types.ObjectId> {
  const agency = await AgencyModel.findOneAndUpdate(
    { code: source.agency.code },
    {
      $setOnInsert: {
        code: source.agency.code,
        name: source.agency.name,
        nameEn: source.agency.nameEn,
        agencyType: source.agency.agencyType,
        websiteUrl: source.homepage,
        isActive: true,
      },
      // Recorded on every run so the Agency doc reflects the crawl's health
      // without a second lookup.
      $set: {
        'torSources.0.url': source.listingUrl,
        'torSources.0.method': 'scrape',
        'torSources.0.lastScrapedAt': new Date(),
      },
    },
    { upsert: true, new: true }
  );
  return agency._id as Types.ObjectId;
}

/** Consume the adapter, applying filters and the record cap as rows arrive. */
async function collect(
  source: SourceDescriptor,
  ctx: AdapterContext
): Promise<{ listings: RawListing[]; failed: boolean }> {
  const listings: RawListing[] = [];
  let failed = false;

  try {
    for await (const listing of source.adapter.collect(ctx)) {
      if (ctx.options.keywords.length > 0) {
        const haystack = `${listing.docTypeLabel ?? ''} ${listing.title}`;
        if (!ctx.options.keywords.some((kw) => haystack.includes(kw))) continue;
      }
      // `isAwarded === null` means the source didn't say. That is NOT a
      // pre-award record — keeping it here would quietly present guesses as
      // actionable tenders, which is exactly what nullable isAwarded exists
      // to prevent.
      if (ctx.options.preAwardOnly && listing.stage.isAwarded !== false) continue;

      listings.push(listing);
      if (listings.length >= ctx.options.maxRecords) break;
    }
  } catch (err) {
    // Partial results are still worth keeping: a crawl that dies on page 4
    // has three good pages, and dropping them helps nobody.
    failed = true;
    ctx.logger.error(`collection stopped early: ${(err as Error).message}`);
  }

  return { listings, failed };
}

export async function runSource(
  sourceId: SourceId | string,
  options: RunOptions = {},
  deps: RunDeps = {}
): Promise<RunResult> {
  const startedAt = new Date();
  const source = getSource(sourceId);
  const logger = (deps.logger ?? createLogger('extraction')).child(source.id);

  const base: RunResult = {
    sourceId: source.id,
    jobId: null,
    status: 'success',
    found: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    attachmentsStored: 0,
    stageCounts: tallyStages([]),
    preAwardCount: 0,
    newestAnnouncedAt: null,
    errors: [],
    startedAt,
    finishedAt: startedAt,
  };

  const gate = checkCompliance(source, options);
  if (!gate.allowed) {
    logger.warn(gate.reason);
    return { ...base, status: 'skipped', errors: [gate.reason], finishedAt: new Date() };
  }
  if (source.compliance.tosStatus === 'prohibited') {
    logger.warn(
      `running a ToS-prohibited source under override by ${options.overrideTosBlock?.approvedBy}: ` +
        `${options.overrideTosBlock?.reason}`
    );
  }

  // `delayMs` belongs to the HTTP client, not the adapter, so it is split off
  // rather than spread into the adapter options.
  const { delayMs: sourceDelayMs, ...sourceDefaults } = source.defaults;

  const resolved: AdapterOptions = {
    ...DEFAULT_OPTIONS,
    ...sourceDefaults,
    ...stripUndefined({
      maxPages: options.maxPages,
      maxRecords: options.maxRecords,
      withDetail: options.withDetail,
      preAwardOnly: options.preAwardOnly,
      keywords: options.keywords,
      budgetYearBe: options.budgetYearBe,
    }),
    params: { ...(sourceDefaults.params ?? {}), ...(options.params ?? {}) },
  };

  const ctx: AdapterContext = {
    http: new HttpClient({
      userAgent: extractionConfig.userAgent,
      // The configured floor wins over a source's own default, so a global
      // "slow down" is always effective.
      delayMs: Math.max(extractionConfig.delayMs, options.delayMs ?? sourceDelayMs ?? 0),
      timeoutMs: extractionConfig.timeoutMs,
      maxRetries: extractionConfig.maxRetries,
      logger,
    }),
    logger,
    today: options.today ?? new Date(),
    options: resolved,
  };

  logger.info(
    `starting run — maxPages=${resolved.maxPages} maxRecords=${resolved.maxRecords} ` +
      `withDetail=${resolved.withDetail} preAwardOnly=${resolved.preAwardOnly}` +
      (options.dryRun ? ' (dry run — nothing will be written)' : '')
  );

  const { listings, failed } = await collect(source, ctx);

  // --- batch cleanup: only possible with the whole run in hand -------------
  stripBoilerplateAttachments(listings);
  const { kept, duplicates } = groupRepublications(listings);
  if (duplicates.length > 0) {
    logger.info(
      `${duplicates.length} row(s) look like the same announcement republished ` +
        '(the CMS reposts one notice per sub-department) — keeping one of each'
    );
  }

  const stageCounts = tallyStages(kept.map((l) => l.stage));
  const preAwardCount = countPreAward(kept.map((l) => l.stage));
  const newestAnnouncedAt = kept.reduce<Date | null>((newest, listing) => {
    const date = listing.announcedAt ?? null;
    if (!date) return newest;
    return !newest || date > newest ? date : newest;
  }, null);

  if (options.dryRun) {
    const finishedAt = new Date();
    logger.info(`dry run complete — ${kept.length} record(s) parsed, nothing written`);
    warnIfStale(logger, newestAnnouncedAt, ctx.today);
    return {
      ...base,
      status: failed ? 'partial' : 'success',
      found: kept.length,
      stageCounts,
      preAwardCount,
      newestAnnouncedAt,
      errors: logger.collected,
      finishedAt,
    };
  }

  // --- persist -------------------------------------------------------------
  const agencyId = await ensureAgency(source);
  const job = await ScrapeJobModel.create({
    agencyId,
    sourceId: source.id,
    trigger: options.trigger ?? 'manual',
    startedAt,
    status: 'running',
    complianceOverride: options.overrideTosBlock
      ? { ...options.overrideTosBlock, tosStatus: source.compliance.tosStatus }
      : undefined,
  });

  const store =
    deps.store ??
    new LocalBlobStore(deps.storageRoot ?? extractionConfig.storageDir);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let attachmentsStored = 0;

  for (const listing of kept) {
    try {
      const upsert = normalize(listing, source, agencyId, new Date());

      const existing = await TorModel.findOne({ 'sourceRef.identityKey': upsert.identityKey })
        .select('_id sourceRef.contentHash status lifecycle.stage')
        .lean();

      let torId: Types.ObjectId;

      if (!existing) {
        // Merge at the dotted-key level, THEN flatten. Flattening first and
        // spreading would make the second object's `sourceRef` replace the
        // first's wholesale, silently dropping `sourceRef.firstSeenAt` and
        // `source.discoveredAt` from every newly created TOR.
        const doc = await TorModel.create(flatten({ ...upsert.setOnInsert, ...upsert.set }));
        torId = doc._id as Types.ObjectId;
        created += 1;

        // Only newly-created Tors are duplicate CANDIDATES — an updated or
        // unchanged row already is the corpus, not something to compare
        // against it. Failure here must not lose the Tor just created, so
        // it stays inside this row's own try/catch rather than aborting.
        await checkForDuplicates(doc, logger);
      } else {
        torId = existing._id as Types.ObjectId;
        const previousHash = (existing as { sourceRef?: { contentHash?: string } }).sourceRef
          ?.contentHash;
        if (previousHash === upsert.contentHash) {
          // Nothing changed — touch lastSeenAt only, so freshness monitoring
          // still works without rewriting the document.
          await TorModel.updateOne(
            { _id: torId },
            { $set: { 'sourceRef.lastSeenAt': upsert.set['sourceRef.lastSeenAt'] } }
          );
          unchanged += 1;
        } else {
          await TorModel.updateOne({ _id: torId }, { $set: upsert.set });
          updated += 1;

          // Stage-transition notifications (EP-04, SCRUM-91/94/95) — gated on
          // the record already being published (vendors must never learn
          // about a TOR still under review), and only when lifecycle.stage
          // actually changed. Its own try/catch: a notification failure must
          // not skip attachment storage below for this same listing.
          const previous = existing as { status?: string; lifecycle?: { stage?: string } };
          const nextStage = upsert.set['lifecycle.stage'] as string | undefined;
          if (previous.status === 'published' && nextStage && nextStage !== previous.lifecycle?.stage) {
            try {
              await handleStageTransition(torId, { from: previous.lifecycle?.stage ?? null, to: nextStage }, logger);
            } catch (err) {
              logger.warn(`stage-transition notification failed for "${listing.title.slice(0, 60)}": ${(err as Error).message}`);
            }
          }
        }
      }

      if (options.withAttachments && listing.attachments.length > 0) {
        const result = await storeAttachments(ctx, store, source.id, listing.attachments, {
          torId,
          agencyId,
        });
        attachmentsStored += result.stored;
        if (result.documentIds.length > 0) {
          await TorModel.updateOne(
            { _id: torId },
            { $addToSet: { documentIds: { $each: result.documentIds } } }
          );
        }
      }
    } catch (err) {
      // One bad row must not lose the rest of the run.
      logger.warn(`failed to persist "${listing.title.slice(0, 60)}": ${(err as Error).message}`);
    }
  }

  warnIfStale(logger, newestAnnouncedAt, ctx.today);

  const finishedAt = new Date();
  const errors = logger.collected;
  const status: RunResult['status'] = failed
    ? 'partial'
    : errors.length > 0
      ? 'partial'
      : 'success';

  await ScrapeJobModel.updateOne(
    { _id: job._id },
    {
      $set: {
        finishedAt,
        status,
        torsFound: kept.length,
        torsNew: created,
        torsUpdated: updated,
        torsUnchanged: unchanged,
        attachmentsStored,
        stageCounts,
        preAwardCount,
        newestAnnouncedAt,
        // Bounded: a pathological run should not write a megabyte of strings.
        errors: errors.slice(0, 100),
      },
    }
  );

  logger.info(
    `run complete — found ${kept.length}, new ${created}, updated ${updated}, ` +
      `unchanged ${unchanged}, pre-award ${preAwardCount}, attachments ${attachmentsStored}`
  );

  return {
    ...base,
    jobId: job._id as Types.ObjectId,
    status,
    found: kept.length,
    created,
    updated,
    unchanged,
    attachmentsStored,
    stageCounts,
    preAwardCount,
    newestAnnouncedAt,
    errors,
    finishedAt,
  };
}

/**
 * Playbook step 7: a 200 OK with real-looking rows proves nothing about
 * freshness. Check the newest date against today, every time.
 */
function warnIfStale(logger: Logger, newest: Date | null, today: Date): void {
  if (!newest) {
    logger.warn(
      'no announcement dates were parsed in this run — freshness cannot be verified, ' +
        'which usually means the date selector or format has changed'
    );
    return;
  }
  const ageDays = Math.floor((today.getTime() - newest.getTime()) / 86_400_000);
  if (ageDays < 0) {
    // An announcement dated in the future is almost never real: it means the
    // adapter picked up the wrong date field — typically a comment-period END
    // date quoted inside the title, rather than the publish date.
    logger.warn(
      `newest announcement is dated ${newest.toISOString().slice(0, 10)}, ` +
        `${-ageDays} day(s) in the FUTURE — the adapter is probably reading a ` +
        'deadline rather than a publish date'
    );
    return;
  }
  if (ageDays > extractionConfig.staleAfterDays) {
    logger.warn(
      `newest announcement is ${ageDays} days old (${newest.toISOString().slice(0, 10)}) — ` +
        'the source may have stopped publishing, or the crawl may be reading an archive'
    );
  } else {
    logger.info(`newest announcement: ${newest.toISOString().slice(0, 10)} (${ageDays} days old)`);
  }
}

/** Turn dotted-path keys into a plain object for `Model.create`. */
function flatten(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(source)) {
    const segments = path.split('.');
    let cursor = out;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = value;
  }
  return out;
}

function stripUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
