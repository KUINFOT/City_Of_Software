/**
 * Query-string parsing for the pricing/frequency analytics endpoints. Pure so
 * the validation rules are testable without Express or a database.
 */

export const ANALYTICS_PROJECT_TYPES = ['web_application', 'mobile_application', 'it_system', 'other'] as const;
export type AnalyticsProjectType = (typeof ANALYTICS_PROJECT_TYPES)[number];

export interface AnalyticsFilters {
  agencyId?: string;
  projectType?: AnalyticsProjectType;
  /** Inclusive calendar years (Gregorian), matched against the announcement date. */
  yearFrom?: number;
  yearTo?: number;
}

export type FilterParseResult = { ok: true; filters: AnalyticsFilters } | { ok: false; error: string };

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Read one query parameter. Absent and blank are the same ("no filter"), but a
 * value that is not text (`?agencyId[$ne]=x` parses to an object) is invalid:
 * silently dropping it would answer a malformed request with the whole corpus.
 */
function readParam(query: Record<string, unknown>, key: string): { value?: string; invalid: boolean } {
  const raw = Array.isArray(query[key]) ? (query[key] as unknown[])[0] : query[key];
  if (raw === undefined || raw === null) return { invalid: false };
  if (typeof raw !== 'string') return { invalid: true };
  const trimmed = raw.trim();
  return trimmed === '' ? { invalid: false } : { value: trimmed, invalid: false };
}

function parseYear(value: string, name: string): { year?: number; error?: string } {
  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return { error: `${name} must be a Gregorian year between ${MIN_YEAR} and ${MAX_YEAR}.` };
  }
  return { year };
}

export function parseAnalyticsFilters(query: Record<string, unknown>): FilterParseResult {
  const filters: AnalyticsFilters = {};

  const params = {
    agencyId: readParam(query, 'agencyId'),
    projectType: readParam(query, 'projectType'),
    yearFrom: readParam(query, 'yearFrom'),
    yearTo: readParam(query, 'yearTo'),
  };
  for (const [name, param] of Object.entries(params)) {
    if (param.invalid) return { ok: false, error: `${name} must be a single text value.` };
  }

  const { agencyId, projectType } = params;
  if (agencyId.value !== undefined) {
    if (!/^[0-9a-f]{24}$/i.test(agencyId.value)) return { ok: false, error: 'agencyId is not a valid id.' };
    filters.agencyId = agencyId.value;
  }

  if (projectType.value !== undefined) {
    if (!(ANALYTICS_PROJECT_TYPES as readonly string[]).includes(projectType.value)) {
      return { ok: false, error: `projectType must be one of: ${ANALYTICS_PROJECT_TYPES.join(', ')}.` };
    }
    filters.projectType = projectType.value as AnalyticsProjectType;
  }

  let yearFrom: number | undefined;
  let yearTo: number | undefined;
  if (params.yearFrom.value !== undefined) {
    const parsed = parseYear(params.yearFrom.value, 'yearFrom');
    if (parsed.error) return { ok: false, error: parsed.error };
    yearFrom = parsed.year;
  }
  if (params.yearTo.value !== undefined) {
    const parsed = parseYear(params.yearTo.value, 'yearTo');
    if (parsed.error) return { ok: false, error: parsed.error };
    yearTo = parsed.year;
  }
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) {
    return { ok: false, error: 'yearFrom must not be after yearTo.' };
  }
  if (yearFrom !== undefined) filters.yearFrom = yearFrom;
  if (yearTo !== undefined) filters.yearTo = yearTo;

  return { ok: true, filters };
}
