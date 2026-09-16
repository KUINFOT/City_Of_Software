export type TorStatusValue = 'discovered' | 'extracting' | 'pending_review' | 'published' | 'rejected' | 'superseded' | 'closed' | 'archived';

export type KeyDateKey =
  | 'announcementDate'
  | 'commentPeriodStart'
  | 'commentPeriodEnd'
  | 'clarificationMeetingDate'
  | 'submissionDeadline'
  | 'contractStartDate'
  | 'contractEndDate';

export type KeyDate = {
  key: KeyDateKey;
  date: string | null;
  daysRemaining: number | null;
  isPast: boolean;
  isUrgent: boolean;
};

export type TorQualifications = {
  minContractValueThb?: number | null;
  requiredCertifications?: string[] | null;
  requiredExperienceYears?: number | null;
  items?: string[] | null;
} | null;

export type TorSource = {
  sourceUrl?: string | null;
  importMethod: 'scrape' | 'manual';
  discoveredAt?: string | null;
} | null;

export type TorField = { value: unknown; confidence: number; caution: boolean };

export type TorOutlier = {
  isOutlier: boolean | null;
  reason: string | null;
  comparableCount: number;
  deviationPct?: number | null;
  basis: { agencyId?: string | null; projectType?: string | null; year?: number | null };
  signal: string;
} | null;

export type TorAgencyContact = { address: string | null; email: string | null; phone: string | null } | null;

/** GET /api/tors's row shape — deliberately thinner than TorDetail, matching
 *  that endpoint's own `.select()` (see tor.controller.ts's listTors). */
export type TorSummary = {
  _id: string;
  title: string;
  agencyName: string;
  // Nested paths Mongoose's .select() projected — each parent key is
  // dropped from the response entirely (not sent as {}) on any record
  // where nothing under it was actually set, so every one of these is
  // genuinely optional, not just its leaf values.
  budget?: { amountThb: number | null } | null;
  timeline?: { submissionDeadline: string | null };
  lifecycle?: { stage: string };
  createdAt: string;
};

export type TorDetail = {
  _id: string;
  title: string;
  agencyName: string;
  agencyContact: TorAgencyContact;
  status: TorStatusValue;
  projectType: string | null;
  lifecycle: { stage: string; stageLabel?: string | null; isAwarded: boolean | null };
  timeline: Record<string, string | null | undefined>;
  source: TorSource;
  documentCount: number;
  keyDates: KeyDate[];
  qualifications: TorQualifications;
  summaryAi: { text: string; model?: string | null; generatedAt?: string | null; confidence?: number | null; machineGenerated: true; authoritative: false } | null;
  fields: Record<string, TorField>;
  overallConfidence: number;
  outlier: TorOutlier;
};

export type TorDocument = {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  sourceUrl: string | null;
  label: string | null;
  capturedAt: string;
  fileUrl: string | null;
};

export type RequirementStatus = 'met' | 'not_met' | 'undetermined';
export type RequirementResult = {
  type: 'certification' | 'contract_value' | 'experience_years';
  required: string;
  declared: string | null;
  status: RequirementStatus;
  gap: string | null;
};
export type QualificationMatchResult = {
  requirements: RequirementResult[];
  overallStatus: 'all_met' | 'gaps_found' | 'undetermined' | 'no_requirements';
};

export type MatchReasonType = 'technology' | 'project_type' | 'budget' | 'agency' | 'keyword';
export type MatchReason = { type: MatchReasonType; label: string; detail: string };
export type MatchReasonsResult = { score: number; reasons: MatchReason[] };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error(payload?.error ?? 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
  return payload;
}

export function getTor(id: string): Promise<TorDetail> {
  return request(`/tors/${id}`);
}

/** GET /api/tors — published records only, newest first (BR-03). No
 *  server-side search/filter yet, so the browse page fetches the max page
 *  size and filters client-side — fine at today's record counts. */
export function listTors(limit = 200): Promise<TorSummary[]> {
  return request(`/tors?limit=${limit}`);
}

export async function getTorDocuments(id: string): Promise<TorDocument[]> {
  const result = await request<{ documents: TorDocument[] }>(`/tors/${id}/documents`);
  return result.documents;
}

export function getQualificationMatch(id: string, token: string): Promise<QualificationMatchResult> {
  return request(`/tors/${id}/qualification-match`, { headers: { Authorization: `Bearer ${token}` } });
}

export function getMatchReasons(id: string, token: string): Promise<MatchReasonsResult> {
  return request(`/tors/${id}/match-reasons`, { headers: { Authorization: `Bearer ${token}` } });
}
