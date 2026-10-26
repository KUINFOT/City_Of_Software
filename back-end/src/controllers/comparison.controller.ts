import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { BookmarkModel } from '../models/Bookmark';
import { TorModel } from '../models/Tor';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const MINIMUM_SELECTION = 2;
const MAXIMUM_SELECTION = 4;

class ComparisonInputError extends Error {}

/**
 * POST /api/comparisons/preview
 *
 * A comparison is deliberately computed rather than persisted. It reflects
 * the vendor's current shortlist, and it cannot be used to read an arbitrary
 * (or no-longer-saved) TOR by guessing an id.
 */
export async function previewComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const torIds = readTorIds((req.body as Record<string, unknown> | undefined)?.torIds);
    const { authUser } = req as AuthenticatedRequest;
    const objectIds = torIds.map((id) => new Types.ObjectId(id));

    const savedIds = await BookmarkModel.distinct('torId', {
      userId: authUser.id,
      torId: { $in: objectIds },
    });
    const savedIdSet = new Set(savedIds.map(String));
    if (savedIdSet.size !== torIds.length) {
      // One generic response prevents this endpoint from becoming an oracle
      // for unpublished TORs or someone else's shortlist.
      res.status(404).json({ error: 'One or more saved TORs were not found.' });
      return;
    }

    const records = await TorModel.find({ _id: { $in: objectIds }, status: 'published' })
      .select('title agencyName budget timeline.projectDurationDays timeline.contractStartDate timeline.contractEndDate timeline.submissionDeadline technologies qualifications evaluationCriteria deliverables source.sourceUrl source.discoveredAt')
      .lean();
    const byId = new Map(records.map((record) => [String(record._id), record]));
    if (byId.size !== torIds.length) {
      res.status(404).json({ error: 'One or more saved TORs were not found.' });
      return;
    }

    // MongoDB does not promise $in ordering. Preserve the selection order so
    // the columns always match the order the vendor selected on the dashboard.
    res.json({ tors: torIds.map((id) => toComparisonTor(byId.get(id)!)) });
  } catch (err) {
    if (err instanceof ComparisonInputError) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}

function readTorIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ComparisonInputError('torIds must be an array.');
  if (value.length < MINIMUM_SELECTION) throw new ComparisonInputError('Select at least 2 TORs to compare.');
  if (value.length > MAXIMUM_SELECTION) throw new ComparisonInputError('You can compare at most 4 TORs at once.');
  if (!value.every((id) => typeof id === 'string' && Types.ObjectId.isValid(id))) {
    throw new ComparisonInputError('Each TOR id must be valid.');
  }
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) throw new ComparisonInputError('Choose each TOR only once.');
  return ids;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

type ComparisonSourceTor = {
  _id: unknown;
  title: string;
  agencyName: string;
  budget?: { amountThb?: number | null; isEstimated?: boolean | null; vatBasis?: 'inclusive' | 'exclusive' | 'unstated' | null } | null;
  timeline?: { projectDurationDays?: number | null; contractStartDate?: Date | null; contractEndDate?: Date | null; submissionDeadline?: Date | null } | null;
  technologies?: unknown;
  qualifications?: {
    minContractValueThb?: number | null;
    requiredCertifications?: unknown;
    requiredExperienceYears?: number | null;
    items?: unknown;
  } | null;
  evaluationCriteria?: Array<{ criterion?: string | null; weightPercent?: number | null }> | null;
  deliverables?: unknown;
  source?: { sourceUrl?: string | null; discoveredAt?: Date | null } | null;
};

function toComparisonTor(record: ComparisonSourceTor) {
  return {
    _id: String(record._id),
    title: record.title,
    agencyName: record.agencyName,
    budget: record.budget
      ? {
          amountThb: record.budget.amountThb ?? null,
          isEstimated: record.budget.isEstimated ?? true,
          vatBasis: record.budget.vatBasis ?? 'unstated',
        }
      : null,
    timeline: {
      projectDurationDays: record.timeline?.projectDurationDays ?? null,
      contractStartDate: record.timeline?.contractStartDate ?? null,
      contractEndDate: record.timeline?.contractEndDate ?? null,
      submissionDeadline: record.timeline?.submissionDeadline ?? null,
    },
    technologies: stringList(record.technologies),
    qualifications: record.qualifications
      ? {
          minContractValueThb: record.qualifications.minContractValueThb ?? null,
          requiredCertifications: stringList(record.qualifications.requiredCertifications),
          requiredExperienceYears: record.qualifications.requiredExperienceYears ?? null,
          items: stringList(record.qualifications.items),
        }
      : null,
    evaluationCriteria: Array.isArray(record.evaluationCriteria)
      ? record.evaluationCriteria
          .filter((criterion) => typeof criterion?.criterion === 'string' && criterion.criterion.trim().length > 0)
          .map((criterion) => ({ criterion: criterion.criterion!, weightPercent: criterion.weightPercent ?? null }))
      : [],
    deliverables: stringList(record.deliverables),
    source: record.source
      ? { sourceUrl: record.source.sourceUrl ?? null, discoveredAt: record.source.discoveredAt ?? null }
      : null,
  };
}

export const comparisonLimits = { minimum: MINIMUM_SELECTION, maximum: MAXIMUM_SELECTION } as const;
