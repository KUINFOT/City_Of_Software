import { Request, Response, NextFunction } from 'express';
import { AgencyModel } from '../models/Agency';
import { extractionConfig } from '../extraction/core/config';
import { parseAnalyticsFilters } from '../analytics/analyticsFilters';
import { compareBudgets } from '../analytics/budgetComparison';
import { summarizeAgencyFrequency } from '../analytics/agencyFrequency';
import { loadBudgetRows, loadFrequencyRows } from '../analytics/analyticsQueries';

/**
 * EP-06 pricing analytics (UC-12; US-032/US-033). Read-only aggregates over
 * reviewed TORs. Gated by `requireAuthenticated` in the route: these are
 * derived figures, not a published record, so they sit behind sign-in like the
 * rest of the vendor workspace rather than being public like GET /api/tors.
 */

/**
 * GET /api/analytics/budgets?agencyId&projectType&yearFrom&yearTo — the
 * historical budgets of one comparable set (FR-ANL-01, FR-ANL-04).
 */
export async function getBudgetComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = parseAnalyticsFilters(req.query);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { filters } = parsed;

    let agencyName: string | null = null;
    if (filters.agencyId) {
      const agency = await AgencyModel.findById(filters.agencyId).select('name').lean();
      if (!agency) {
        res.status(404).json({ error: 'Agency not found' });
        return;
      }
      agencyName = agency.name;
    }

    const rows = await loadBudgetRows(filters);
    res.json({
      filters: {
        agencyId: filters.agencyId ?? null,
        agencyName,
        projectType: filters.projectType ?? null,
        yearFrom: filters.yearFrom ?? null,
        yearTo: filters.yearTo ?? null,
      },
      ...compareBudgets(rows, extractionConfig.outlierMinComparableN),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/agency-frequency?projectType&yearFrom&yearTo — how often
 * each agency procures and at what typical size (FR-ANL-01). Takes no agency
 * filter: the report is the comparison across agencies.
 */
export async function getAgencyFrequency(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = parseAnalyticsFilters(req.query);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { projectType, yearFrom, yearTo } = parsed.filters;

    const rows = await loadFrequencyRows({ projectType, yearFrom, yearTo });
    res.json({
      filters: { projectType: projectType ?? null, yearFrom: yearFrom ?? null, yearTo: yearTo ?? null },
      ...summarizeAgencyFrequency(rows, extractionConfig.outlierMinComparableN, { yearFrom, yearTo }),
      basis: 'nominal_unadjusted' as const,
    });
  } catch (err) {
    next(err);
  }
}
