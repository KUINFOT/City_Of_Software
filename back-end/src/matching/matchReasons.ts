/**
 * Match-reasons engine (US-024/FR-NOT-01, EP-04 SCRUM-100/101).
 *
 * Answers "why was this TOR surfaced to this vendor" — a different question
 * from qualificationMatch.ts's "does this vendor clear the TOR's stated
 * requirements." This engine compares a TOR's own scrape-derived fields
 * (technologies, projectType, budget, agency) against a vendor's declared
 * interests, independent of any qualification threshold.
 *
 * Same "absent stays absent" discipline as qualificationMatch.ts and
 * procurementStats.ts: a dimension with nothing to compare (the TOR doesn't
 * state it, or the vendor never declared an interest) is simply skipped, not
 * treated as a match or a miss.
 *
 * Score is an equal-weighted fraction of the dimensions that matched, out of
 * the 5 checked — a placeholder convention (no existing weighting scheme in
 * the codebase to follow) that VendorProfile.notificationPrefs.minMatchScore
 * is already shaped to consume, open to future tuning.
 *
 * The `agency` and `keyword` dimensions below are SCRUM-98/99's "followed
 * agencies and keywords... in ADDITION to profile matching" — a vendor's
 * explicit watchlist (interests.agencyIds/keywords), independent of the
 * technology/project-type/budget dimensions derived from their own declared
 * capabilities.
 */

export type MatchReasonType = 'technology' | 'project_type' | 'budget' | 'agency' | 'keyword';

export interface MatchReason {
  type: MatchReasonType;
  label: string;
  detail: string;
}

export interface MatchReasonsResult {
  score: number;
  reasons: MatchReason[];
}

export interface TorMatchLike {
  title?: string | null;
  technologies?: string[] | null;
  projectType?: string | null;
  budget?: { amountThb?: number | null } | null;
  agencyId?: unknown;
  agencyName?: string | null;
}

export interface VendorMatchProfileLike {
  techStack?: string[] | null;
  interests?: {
    projectTypes?: string[] | null;
    technologies?: string[] | null;
    budgetRange?: { minThb?: number | null; maxThb?: number | null } | null;
    agencyIds?: unknown[] | null;
    keywords?: string[] | null;
  } | null;
}

const PROJECT_TYPE_LABEL: Record<string, string> = {
  web_application: 'เว็บแอปพลิเคชัน',
  mobile_application: 'แอปพลิเคชันมือถือ',
  it_system: 'ระบบไอที',
  other: 'อื่นๆ',
};

const DIMENSION_COUNT = 5;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function formatThb(amount: number): string {
  return `${new Intl.NumberFormat('th-TH').format(amount)} บาท`;
}

function matchTechnology(tor: TorMatchLike, profile: VendorMatchProfileLike | null): MatchReason | null {
  const torTechs = (tor.technologies ?? []).filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  if (torTechs.length === 0 || !profile) return null;

  const vendorTechs = new Set(
    [...(profile.techStack ?? []), ...(profile.interests?.technologies ?? [])]
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map(norm)
  );
  if (vendorTechs.size === 0) return null;

  const overlap = torTechs.filter((t) => vendorTechs.has(norm(t)));
  if (overlap.length === 0) return null;

  return {
    type: 'technology',
    label: 'เทคโนโลยีที่ตรงกัน',
    detail: `โครงการนี้ต้องการ ${overlap.join(', ')} ซึ่งตรงกับเทคโนโลยีที่คุณระบุไว้ในโปรไฟล์`,
  };
}

function matchProjectType(tor: TorMatchLike, profile: VendorMatchProfileLike | null): MatchReason | null {
  const projectType = tor.projectType;
  const interested = profile?.interests?.projectTypes ?? [];
  if (!projectType || interested.length === 0) return null;

  const matched = interested.some((p) => typeof p === 'string' && norm(p) === norm(projectType));
  if (!matched) return null;

  return {
    type: 'project_type',
    label: 'ประเภทโครงการที่สนใจ',
    detail: `ตรงกับประเภทโครงการที่คุณติดตาม (${PROJECT_TYPE_LABEL[projectType] ?? projectType})`,
  };
}

function matchBudget(tor: TorMatchLike, profile: VendorMatchProfileLike | null): MatchReason | null {
  const amount = tor.budget?.amountThb;
  const range = profile?.interests?.budgetRange;
  if (amount == null || !range || (range.minThb == null && range.maxThb == null)) return null;

  const min = range.minThb ?? 0;
  const max = range.maxThb ?? Number.POSITIVE_INFINITY;
  if (amount < min || amount > max) return null;

  return {
    type: 'budget',
    label: 'งบประมาณอยู่ในช่วงที่สนใจ',
    detail: `งบประมาณโดยประมาณ ${formatThb(amount)} อยู่ในช่วงที่คุณระบุไว้`,
  };
}

function matchAgency(tor: TorMatchLike, profile: VendorMatchProfileLike | null): MatchReason | null {
  const agencyIds = profile?.interests?.agencyIds ?? [];
  if (!tor.agencyId || agencyIds.length === 0) return null;

  const torAgencyId = String(tor.agencyId);
  const matched = agencyIds.some((id) => String(id) === torAgencyId);
  if (!matched) return null;

  return {
    type: 'agency',
    label: 'หน่วยงานที่ติดตาม',
    detail: `${tor.agencyName ?? 'หน่วยงานนี้'} อยู่ในรายชื่อหน่วยงานที่คุณติดตาม`,
  };
}

function matchKeyword(tor: TorMatchLike, profile: VendorMatchProfileLike | null): MatchReason | null {
  const title = tor.title;
  const keywords = (profile?.interests?.keywords ?? []).filter(
    (k): k is string => typeof k === 'string' && k.trim().length > 0
  );
  if (!title || keywords.length === 0) return null;

  const haystack = norm(title);
  const matched = keywords.filter((k) => haystack.includes(norm(k)));
  if (matched.length === 0) return null;

  return {
    type: 'keyword',
    label: 'คำสำคัญที่ติดตาม',
    detail: `ชื่อโครงการมีคำว่า "${matched.join('", "')}" ซึ่งอยู่ในรายการคำสำคัญที่คุณติดตาม`,
  };
}

export function computeMatchReasons(
  tor: TorMatchLike,
  vendorProfile: VendorMatchProfileLike | null
): MatchReasonsResult {
  const reasons = [matchTechnology, matchProjectType, matchBudget, matchAgency, matchKeyword]
    .map((dimension) => dimension(tor, vendorProfile))
    .filter((reason): reason is MatchReason => reason !== null);

  return { score: reasons.length / DIMENSION_COUNT, reasons };
}
