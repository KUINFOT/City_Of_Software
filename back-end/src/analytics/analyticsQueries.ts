/**
 * Database reads for the pricing/frequency analytics (EP-06). Selects the
 * comparable set; the aggregation itself lives in budgetComparison.ts and
 * agencyFrequency.ts so it can be tested without a database.
 *
 * Which records count as "history": reviewed ones only (`published`, plus
 * `closed` for a deadline-passed record that stays searchable). That is
 * narrower than the outlier job, which takes everything not rejected
 * (procurementStats.ts): unreviewed `discovered`/`pending_review` records
 * have unconfirmed budgets, and `superseded` ones are duplicates of a record
 * already in the set, so counting them would double-count a project. `archived`
 * is left out too: it is where a record set aside after publication goes, and
 * a figure shown to a vendor should not rest on something we withdrew.
 */

import { TorModel } from '../models/Tor';
import type { BudgetRow } from './budgetComparison';
import type { FrequencyRow } from './agencyFrequency';
import type { AnalyticsFilters } from './analyticsFilters';

export const HISTORICAL_STATUSES = ['published', 'closed'] as const;

function buildFilter(filters: AnalyticsFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { status: { $in: [...HISTORICAL_STATUSES] } };
  if (filters.agencyId) query.agencyId = filters.agencyId;
  if (filters.projectType) query.projectType = filters.projectType;

  // The announcement year, in UTC like the outlier job's bucketing and like
  // core/thaiDate.ts, which stores every date at midnight UTC.
  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
    const range: Record<string, Date> = {};
    if (filters.yearFrom !== undefined) range.$gte = new Date(Date.UTC(filters.yearFrom, 0, 1));
    if (filters.yearTo !== undefined) range.$lt = new Date(Date.UTC(filters.yearTo + 1, 0, 1));
    query['timeline.announcementDate'] = range;
  }
  return query;
}

function yearOf(date: Date | null | undefined): number | null {
  return date ? new Date(date).getUTCFullYear() : null;
}

/** The comparable set for one selection, thin rows only: this can be thousands of records. */
export async function loadBudgetRows(filters: AnalyticsFilters): Promise<BudgetRow[]> {
  const records = await TorModel.find(buildFilter(filters))
    .select('budget.amountThb timeline.announcementDate')
    .lean();
  return records.map((record) => ({
    amountThb: record.budget?.amountThb ?? null,
    year: yearOf(record.timeline?.announcementDate),
  }));
}

export async function loadFrequencyRows(filters: AnalyticsFilters): Promise<FrequencyRow[]> {
  const records = await TorModel.find(buildFilter(filters))
    .select('agencyId agencyName budget.amountThb timeline.announcementDate')
    .lean();
  return records.map((record) => ({
    agencyId: String(record.agencyId),
    agencyName: record.agencyName,
    amountThb: record.budget?.amountThb ?? null,
    year: yearOf(record.timeline?.announcementDate),
  }));
}
