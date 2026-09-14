import { Request, Response, NextFunction } from 'express';
import { ScrapeJobModel } from '../models/ScrapeJob';
import { ExtractionJobModel } from '../models/ExtractionJob';
import { runSource, SOURCES, SOURCE_IDS, getSource } from '../extraction';
import type { RunOptions } from '../extraction';
import { classifySourceHealth, type RecentRunSummary } from '../extraction/core/sourceHealth';
import { extractionConfig } from '../extraction/core/config';

/** How many of a source's most recent runs to look at when rolling up health. */
const RECENT_RUNS_FOR_HEALTH = 5;

/**
 * GET /api/extraction/health — US-044: per-source adapter health, so a
 * broken or silently-stale source shows up on an admin dashboard before a
 * vendor notices a listing page has gone quiet. Classification rules live in
 * core/sourceHealth.ts (pure, unit-tested); this just supplies its recent
 * ScrapeJob history per source.
 */
export async function getSourcesHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const today = new Date();
    const results = await Promise.all(
      SOURCE_IDS.map(async (id) => {
        const source = SOURCES[id];
        const jobs = await ScrapeJobModel.find({ sourceId: id })
          .sort({ startedAt: -1 })
          .limit(RECENT_RUNS_FOR_HEALTH)
          .select('status startedAt newestAnnouncedAt torsFound errors')
          .lean();

        const runs: RecentRunSummary[] = jobs.map((job) => ({
          status: (job.status ?? 'running') as RecentRunSummary['status'],
          hadErrors: (job.errors?.length ?? 0) > 0,
          startedAt: job.startedAt ?? new Date(0),
          newestAnnouncedAt: job.newestAnnouncedAt ?? null,
          torsFound: job.torsFound ?? 0,
        }));

        const health = classifySourceHealth(runs, {
          blocked: source.compliance.tosStatus === 'prohibited',
          today,
          staleAfterDays: extractionConfig.staleAfterDays,
        });

        return {
          sourceId: source.id,
          label: source.label,
          labelEn: source.labelEn,
          tosStatus: source.compliance.tosStatus,
          ...health,
        };
      })
    );

    res.json(results);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/extraction/sources — the registry, as data.
 *
 * Compliance is part of the response, not a footnote: an admin UI showing a
 * "Run" button for eGP BMA2 without showing that its Terms of Service forbid
 * crawling would be actively misleading.
 */
export function listSources(_req: Request, res: Response): void {
  res.json(
    SOURCE_IDS.map((id) => {
      const source = SOURCES[id];
      return {
        id: source.id,
        label: source.label,
        labelEn: source.labelEn,
        homepage: source.homepage,
        listingUrl: source.listingUrl,
        agency: source.agency,
        stageSignal: source.stageSignal,
        compliance: source.compliance,
        defaults: source.defaults,
        caveats: source.caveats,
      };
    })
  );
}

/**
 * POST /api/extraction/sources/:id/run — trigger a run.
 *
 * Runs synchronously today. A full DEPA pull with attachments takes minutes,
 * so this is the first thing to move behind a queue when the admin UI lands —
 * see the "Scheduling" section of docs/extraction-pipeline.md.
 */
export async function triggerRun(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const source = getSource(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const options: RunOptions = {
      trigger: 'api',
      dryRun: body.dryRun === true,
      withAttachments: body.withAttachments === true,
      withDetail: body.withDetail !== false,
      preAwardOnly: body.preAwardOnly === true,
      keywords: Array.isArray(body.keywords) ? (body.keywords as string[]) : [],
      maxPages: toPositiveInt(body.maxPages),
      maxRecords: toPositiveInt(body.maxRecords),
      budgetYearBe: toPositiveInt(body.budgetYearBe),
      // Source-specific knobs (DGA category, MOC cid, BMA announce codes).
      // Whitelisted to strings/numbers so a request body can't smuggle an
      // object into an adapter's option lookup.
      params: toParams(body.params),
    };

    // The ToS override is accepted over the API but never defaulted: both an
    // approver and a reason must be supplied, and both are written to the job
    // record so the decision stays attributable.
    const override = body.overrideTosBlock as
      | { approvedBy?: string; reason?: string }
      | undefined;
    if (override?.approvedBy && override?.reason) {
      options.overrideTosBlock = {
        approvedBy: String(override.approvedBy),
        reason: String(override.reason),
      };
    }

    if (source.compliance.tosStatus === 'prohibited' && !options.overrideTosBlock) {
      res.status(409).json({
        error: 'Source is blocked by its Terms of Service.',
        detail: source.compliance.tosNote,
        remedy:
          'Supply overrideTosBlock: { approvedBy, reason } to proceed — after getting the ' +
          "agency's sign-off.",
      });
      return;
    }

    const result = await runSource(source.id, options);
    res.status(result.status === 'skipped' ? 409 : 200).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /api/extraction/jobs — run history, newest first. */
export async function listJobs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.sourceId) filter.sourceId = String(req.query.sourceId);
    if (req.query.status) filter.status = String(req.query.status);

    const limit = Math.min(toPositiveInt(req.query.limit) ?? 50, 200);
    const jobs = await ScrapeJobModel.find(filter).sort({ startedAt: -1 }).limit(limit);
    res.json(jobs);
  } catch (err) {
    next(err);
  }
}

/** GET /api/extraction/jobs/:id — one run, in full. */
export async function getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await ScrapeJobModel.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Scrape job not found' });
      return;
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/extraction/ai-jobs — AI extraction run history, newest first.
 * Mirrors listJobs/getJob's shape for ScrapeJob, but for ExtractionJob —
 * gives visibility into parked/failed extractions (NFR-REL-03) without
 * building a full pipeline-health view.
 */
export async function listAiJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.torId) filter.torId = String(req.query.torId);
    if (req.query.status) filter.status = String(req.query.status);

    const limit = Math.min(toPositiveInt(req.query.limit) ?? 50, 200);
    const jobs = await ExtractionJobModel.find(filter).sort({ startedAt: -1 }).limit(limit);
    res.json(jobs);
  } catch (err) {
    next(err);
  }
}

/** GET /api/extraction/ai-jobs/:id — one extraction attempt, in full. */
export async function getAiJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await ExtractionJobModel.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Extraction job not found' });
      return;
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
}

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toParams(value: unknown): Record<string, string | number> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' || typeof raw === 'number') out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
