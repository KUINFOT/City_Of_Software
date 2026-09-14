/**
 * Cross-record duplicate detection (FR-EXT-08 / NFR-DAT-05 / UC-17).
 *
 * Runs once, right after a Tor is first CREATED — never on an update or an
 * unchanged re-seen row, because a row already in the corpus isn't a
 * "candidate," it already is the corpus. This is deliberately separate from
 * `core/fingerprint.ts`'s same-batch republication collapsing: that handles
 * one crawl run seeing the same notice twice from one source; this handles a
 * brand-new record looking like a DIFFERENT record already sitting in Mongo,
 * possibly from weeks ago or a different source.
 *
 * Never merges anything automatically — FR-EXT-08 is explicit that suspected
 * duplicates are linked for admin review, not discarded or combined. See
 * controllers/review.controller.ts for the resolution step that eventually
 * turns a suspected duplicate into a confirmed `superseded` record.
 */

import { Types } from 'mongoose';
import { TorModel, type TorDoc } from '../../models/Tor';
import { computeDuplicateScore } from '../core/duplicateDetection';
import { extractionConfig } from '../core/config';
import type { Logger } from '../core/logger';

/** How far a candidate's budget/date may drift and still be worth scoring. */
const BUDGET_WINDOW_RATIO = 0.15;
const DATE_WINDOW_DAYS = 14;
const CANDIDATE_LIMIT = 50;

type NewTor = Pick<
  TorDoc,
  'title' | 'referenceNumber' | 'agencyId' | 'budget' | 'timeline'
> & { _id: Types.ObjectId };

interface CandidateProjection {
  _id: Types.ObjectId;
}

/**
 * Score a newly-created Tor against the wider corpus and record any
 * suspected duplicates on it. Errors are caught by the caller (`runner.ts`
 * already wraps each row's persistence in its own try/catch) — a failure
 * here must not lose the Tor that was just created.
 */
export async function checkForDuplicates(newTor: NewTor, logger: Logger): Promise<void> {
  const candidates = await findCandidates(newTor);
  if (candidates.length === 0) return;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      result: computeDuplicateScore({
        titleA: newTor.title,
        titleB: candidate.title ?? '',
        sameAgency: String(candidate.agencyId) === String(newTor.agencyId),
        sameReferenceNumber:
          !!newTor.referenceNumber && newTor.referenceNumber === candidate.referenceNumber,
        budgetA: newTor.budget?.amountThb,
        budgetB: candidate.budget?.amountThb,
        dateA: newTor.timeline?.announcementDate ?? null,
        dateB: candidate.timeline?.announcementDate ?? null,
      }),
    }))
    .filter(({ result }) => result.score >= extractionConfig.duplicateMatchThreshold);

  if (scored.length === 0) return;

  const detectedAt = new Date();
  const mergeCandidateIds = scored.map(({ candidate, result }) => ({
    torId: candidate._id,
    score: result.score,
    titleSimilarity: result.titleSimilarity,
    sameAgency: result.sameAgency,
    sameReferenceNumber: result.sameReferenceNumber,
    budgetProximity: result.budgetProximity,
    dateProximityDays: result.dateProximityDays,
    detectedAt,
  }));

  await TorModel.updateOne(
    { _id: newTor._id },
    { $set: { duplicateStatus: 'suspected', mergeCandidateIds } }
  );

  logger.info(
    `flagged ${scored.length} suspected duplicate candidate(s) for "${newTor.title.slice(0, 60)}"`
  );
}

/**
 * Indexed pre-filter: only fetch candidates specific enough to be worth the
 * (more expensive) trigram scoring. Falls back to agency-only, capped, when
 * neither a reference number nor a budget+date pair is available — the same
 * "absent data narrows the query, never blocks it" posture as the rest of
 * this pipeline.
 */
async function findCandidates(newTor: NewTor): Promise<
  Array<Pick<TorDoc, 'title' | 'referenceNumber' | 'agencyId' | 'budget' | 'timeline'> & CandidateProjection>
> {
  const or: Record<string, unknown>[] = [];

  if (newTor.referenceNumber) {
    or.push({ referenceNumber: newTor.referenceNumber });
  }

  const amount = newTor.budget?.amountThb;
  const announced = newTor.timeline?.announcementDate;
  if (amount != null && announced) {
    const low = amount * (1 - BUDGET_WINDOW_RATIO);
    const high = amount * (1 + BUDGET_WINDOW_RATIO);
    const dateLow = new Date(announced.getTime() - DATE_WINDOW_DAYS * 86_400_000);
    const dateHigh = new Date(announced.getTime() + DATE_WINDOW_DAYS * 86_400_000);
    or.push({
      'budget.amountThb': { $gte: low, $lte: high },
      'timeline.announcementDate': { $gte: dateLow, $lte: dateHigh },
    });
  }

  const filter: Record<string, unknown> = {
    _id: { $ne: newTor._id },
    agencyId: newTor.agencyId,
    status: { $ne: 'rejected' },
  };
  if (or.length > 0) filter.$or = or;

  return TorModel.find(filter)
    .select('title referenceNumber agencyId budget.amountThb timeline.announcementDate')
    .sort({ createdAt: -1 })
    .limit(CANDIDATE_LIMIT)
    .lean();
}
