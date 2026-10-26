/** Mirrors back-end/src/controllers/analytics.controller.ts (EP-06). */

export type BudgetBand = { fromThb: number; toThb: number | null; count: number };

export type BudgetSummary = {
  minThb: number;
  q1Thb: number;
  medianThb: number;
  q3Thb: number;
  maxThb: number;
  meanThb: number;
};

export type YearBudget = { year: number; recordCount: number; sufficient: boolean; medianThb: number | null };

export type BudgetComparison = {
  filters: { agencyId: string | null; agencyName: string | null; projectType: string | null; yearFrom: number | null; yearTo: number | null };
  /** Records with an extractable budget: what every figure is built from. */
  recordCount: number;
  excludedNoBudget: number;
  minComparableN: number;
  sufficient: boolean;
  summary: BudgetSummary | null;
  distribution: BudgetBand[] | null;
  undatedRecordCount: number;
  byYear: YearBudget[];
  basis: "nominal_unadjusted";
};

export type AgencyFrequency = {
  agencyId: string;
  agencyName: string;
  procurementCount: number;
  excludedNoDate: number;
  activeYears: number;
  procurementsPerYear: number | null;
  frequencySufficient: boolean;
  budgetedCount: number;
  excludedNoBudget: number;
  typicalBudgetThb: number | null;
  q1Thb: number | null;
  q3Thb: number | null;
  sizeSufficient: boolean;
};

export type AgencyFrequencyReport = {
  filters: { projectType: string | null; yearFrom: number | null; yearTo: number | null };
  minComparableN: number;
  window: { fromYear: number; toYear: number; years: number } | null;
  agencies: AgencyFrequency[];
  totals: { agencyCount: number; procurementCount: number; excludedNoDate: number };
  basis: "nominal_unadjusted";
};

/** Empty string means "no filter", matching a blank <select>. */
export type AnalyticsQuery = { agencyId?: string; projectType?: string; yearFrom?: string; yearTo?: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error(payload?.error ?? "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  return payload;
}

export function toQueryString(query: AnalyticsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function getBudgetComparison(query: AnalyticsQuery, token: string): Promise<BudgetComparison> {
  return request(`/analytics/budgets${toQueryString(query)}`, token);
}

/** The frequency report compares agencies, so it takes no agency filter. */
export function getAgencyFrequency(query: Omit<AnalyticsQuery, "agencyId">, token: string): Promise<AgencyFrequencyReport> {
  return request(`/analytics/agency-frequency${toQueryString(query)}`, token);
}
