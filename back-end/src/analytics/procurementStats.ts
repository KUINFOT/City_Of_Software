/**
 * Budget-outlier analysis and the `ProcurementStat` materialized view
 * (FR-ANL-01–07).
 *
 * Operates entirely on scrape-derived fields (`budget.amountThb`,
 * `projectType`, `agencyId`, `timeline.announcementDate`) — no AI extraction
 * is required for this to run, and it can be exercised end-to-end against
 * data the scrape pipeline already produces today.
 *
 * "Absent stays absent" applies here exactly as it does in the scrape
 * pipeline (core/thaiDate.ts): a Tor missing budget, project type, or an
 * announcement date is EXCLUDED from its bucket and counted, never silently
 * folded into an "other" group that would make the comparison meaningless
 * (FR-ANL-06). `normalize.ts` deliberately leaves `projectType` unset rather
 * than default it to `'other'` for exactly this reason — this module
 * respects that by treating a missing projectType as "can't compare," not as
 * a same-bucket member.
 */

import { TorModel } from '../models/Tor';
import { ProcurementStatModel } from '../models/ProcurementStat';
import { extractionConfig } from '../extraction/core/config';
import { classifyOutlier, computeIqrBounds, deviationFromMedianPct } from './outlierMath';
import type { Logger } from '../extraction/core/logger';

interface BucketMember {
  torId: string;
  budget: number;
}

export interface OutlierAnalysisResult {
  analyzed: number;
  excludedNoBudget: number;
  excludedNoProjectType: number;
  excludedNoYear: number;
  groupsEvaluated: number;
  groupsInsufficientData: number;
  outliersFlagged: number;
}

/**
 * Re-derive `ProcurementStat` and every Tor's `outlier.*` fields from
 * scratch. Not incremental — the comparable set for a Tor can change every
 * time a new record is ingested, so a full recompute is the only way to keep
 * every flag consistent with the current corpus. Intended to run on a
 * schedule (see scheduler/), not per-request.
 */
export async function runOutlierAnalysis(logger?: Logger): Promise<OutlierAnalysisResult> {
  const result: OutlierAnalysisResult = {
    analyzed: 0,
    excludedNoBudget: 0,
    excludedNoProjectType: 0,
    excludedNoYear: 0,
    groupsEvaluated: 0,
    groupsInsufficientData: 0,
    outliersFlagged: 0,
  };

  // Rejected records were never legitimate procurements in the first place
  // (BR-06 non-software, or an admin's explicit rejection) — they must not
  // pull the comparable set in either direction.
  const cursor = TorModel.find({ status: { $ne: 'rejected' } })
    .select('agencyId projectType budget.amountThb timeline.announcementDate')
    .lean()
    .cursor();

  const buckets = new Map<string, { agencyId: string; projectType: string; year: number; members: BucketMember[] }>();

  for await (const tor of cursor) {
    result.analyzed += 1;

    const amount = tor.budget?.amountThb;
    if (amount == null) {
      result.excludedNoBudget += 1;
      await TorModel.updateOne(
        { _id: tor._id },
        { $set: { 'outlier.isOutlier': null, 'outlier.reason': 'no_budget', 'outlier.evaluatedAt': new Date() } }
      );
      continue;
    }

    const projectType = tor.projectType;
    if (!projectType) {
      result.excludedNoProjectType += 1;
      await TorModel.updateOne(
        { _id: tor._id },
        { $set: { 'outlier.isOutlier': null, 'outlier.reason': 'no_project_type', 'outlier.evaluatedAt': new Date() } }
      );
      continue;
    }

    const announced = tor.timeline?.announcementDate;
    if (!announced) {
      result.excludedNoYear += 1;
      await TorModel.updateOne(
        { _id: tor._id },
        { $set: { 'outlier.isOutlier': null, 'outlier.reason': 'no_year', 'outlier.evaluatedAt': new Date() } }
      );
      continue;
    }

    const year = new Date(announced).getUTCFullYear();
    const agencyId = String(tor.agencyId);
    const key = `${agencyId}|${projectType}|${year}`;
    const bucket = buckets.get(key) ?? { agencyId, projectType, year, members: [] };
    bucket.members.push({ torId: String(tor._id), budget: amount });
    buckets.set(key, bucket);
  }

  const now = new Date();

  for (const bucket of buckets.values()) {
    result.groupsEvaluated += 1;
    const budgets = bucket.members.map((m) => m.budget);
    const count = budgets.length;

    if (count < extractionConfig.outlierMinComparableN) {
      result.groupsInsufficientData += 1;
      await TorModel.updateMany(
        { _id: { $in: bucket.members.map((m) => m.torId) } },
        {
          $set: {
            'outlier.isOutlier': null,
            'outlier.reason': 'insufficient_comparables',
            'outlier.basisAgencyId': bucket.agencyId,
            'outlier.basisProjectType': bucket.projectType,
            'outlier.basisYear': bucket.year,
            'outlier.comparableCount': count,
            'outlier.evaluatedAt': now,
          },
        }
      );
      continue;
    }

    const bounds = computeIqrBounds(budgets, extractionConfig.outlierIqrMultiplier);
    const outlierIds: string[] = [];

    for (const member of bucket.members) {
      const isOutlier = classifyOutlier(member.budget, bounds);
      if (isOutlier) outlierIds.push(member.torId);

      await TorModel.updateOne(
        { _id: member.torId },
        {
          $set: {
            'outlier.isOutlier': isOutlier,
            'outlier.reason': isOutlier ? 'outlier' : 'within_range',
            'outlier.basisAgencyId': bucket.agencyId,
            'outlier.basisProjectType': bucket.projectType,
            'outlier.basisYear': bucket.year,
            'outlier.comparableCount': count,
            'outlier.deviationPct': deviationFromMedianPct(member.budget, bounds.median),
            'outlier.evaluatedAt': now,
          },
        }
      );
    }

    result.outliersFlagged += outlierIds.length;

    const sum = budgets.reduce((a, b) => a + b, 0);
    await ProcurementStatModel.updateOne(
      { agencyId: bucket.agencyId, projectType: bucket.projectType, year: bucket.year },
      {
        $set: {
          count,
          avgBudgetThb: sum / count,
          medianBudgetThb: bounds.median,
          minBudgetThb: Math.min(...budgets),
          maxBudgetThb: Math.max(...budgets),
          outlierTorIds: outlierIds,
        },
      },
      { upsert: true }
    );
  }

  logger?.info(
    `outlier analysis: analyzed ${result.analyzed}, ${result.groupsEvaluated} group(s), ` +
      `${result.groupsInsufficientData} insufficient-data, ${result.outliersFlagged} outlier(s) flagged ` +
      `(excluded: ${result.excludedNoBudget} no-budget, ${result.excludedNoProjectType} no-project-type, ` +
      `${result.excludedNoYear} no-year)`
  );

  return result;
}
