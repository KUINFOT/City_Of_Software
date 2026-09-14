/**
 * Qualification-requirement matching (US-017/FR-NOT-02, SRS UC-03 step
 * 5/5a/5b).
 *
 * Compares a Tor's structured `qualifications` (Tor.ts) against a vendor's
 * self-declared `VendorProfile`. Three dimensions, each scored independently
 * — a Tor rarely states all three, and a vendor profile rarely declares
 * every field either, so "not applicable" and "can't tell" are kept
 * distinct from "falls short":
 *
 *   - `met`          the vendor's declared value clears the stated threshold
 *   - `not_met`      it's declared, but doesn't clear the threshold — the
 *                     `gap` names exactly how (UC-03 extension 5b)
 *   - `undetermined` the Tor states a requirement but the vendor profile
 *                     doesn't declare the corresponding value — never
 *                     guessed as either met or not_met
 *
 * A requirement dimension the Tor doesn't state at all is left out of the
 * result entirely — there is nothing to check it against.
 *
 * FR-VEN-01 ("no eligibility decision made by the system") is a hard
 * constraint on this module's OUTPUT, not just its prose: nothing here ever
 * returns or implies "eligible"/"ineligible"/"disqualified". `overallStatus`
 * is a rollup of per-requirement facts, not a verdict.
 */

export type RequirementStatus = 'met' | 'not_met' | 'undetermined';

export type RequirementType = 'certification' | 'contract_value' | 'experience_years';

export interface RequirementResult {
  type: RequirementType;
  /** What the Tor states, as printed (e.g. a certification name, or "500,000 THB"). */
  required: string;
  /** What the vendor's profile declares for this dimension, or null if undeclared. */
  declared: string | null;
  status: RequirementStatus;
  /** Set only when status is 'not_met' — names the specific shortfall. */
  gap: string | null;
}

export type OverallMatchStatus = 'all_met' | 'gaps_found' | 'undetermined' | 'no_requirements';

export interface QualificationMatchResult {
  requirements: RequirementResult[];
  overallStatus: OverallMatchStatus;
}

export interface TorQualificationsLike {
  minContractValueThb?: number | null;
  requiredCertifications?: string[] | null;
  requiredExperienceYears?: number | null;
}

export interface VendorProfileLike {
  certifications?: Array<{ name?: string | null }> | null;
  totalContractValueThb?: number | null;
  yearsExperience?: number | null;
}

function formatThb(amount: number): string {
  return `${new Intl.NumberFormat('th-TH').format(amount)} THB`;
}

function matchCertification(name: string, profile: VendorProfileLike | null): RequirementResult {
  if (!profile) {
    return { type: 'certification', required: name, declared: null, status: 'undetermined', gap: null };
  }
  const declaredNames = (profile.certifications ?? [])
    .map((c) => c.name)
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  const held = declaredNames.find((n) => n.trim().toLowerCase() === name.trim().toLowerCase());

  if (held) {
    return { type: 'certification', required: name, declared: held, status: 'met', gap: null };
  }
  return {
    type: 'certification',
    required: name,
    declared: declaredNames.length > 0 ? declaredNames.join(', ') : null,
    status: 'not_met',
    gap: `ต้องมีใบรับรอง "${name}" ซึ่งยังไม่พบในโปรไฟล์ที่แจ้งไว้`,
  };
}

function matchContractValue(minThb: number, profile: VendorProfileLike | null): RequirementResult {
  const required = formatThb(minThb);
  if (!profile || profile.totalContractValueThb == null) {
    return { type: 'contract_value', required, declared: null, status: 'undetermined', gap: null };
  }
  const declaredValue = profile.totalContractValueThb;
  const declared = formatThb(declaredValue);
  if (declaredValue >= minThb) {
    return { type: 'contract_value', required, declared, status: 'met', gap: null };
  }
  return {
    type: 'contract_value',
    required,
    declared,
    status: 'not_met',
    gap: `ต้องมีมูลค่าสัญญาสะสมอย่างน้อย ${required} แต่โปรไฟล์แจ้งไว้ ${declared}`,
  };
}

function matchExperienceYears(minYears: number, profile: VendorProfileLike | null): RequirementResult {
  const required = `${minYears} ปี`;
  if (!profile || profile.yearsExperience == null) {
    return { type: 'experience_years', required, declared: null, status: 'undetermined', gap: null };
  }
  const declaredYears = profile.yearsExperience;
  const declared = `${declaredYears} ปี`;
  if (declaredYears >= minYears) {
    return { type: 'experience_years', required, declared, status: 'met', gap: null };
  }
  return {
    type: 'experience_years',
    required,
    declared,
    status: 'not_met',
    gap: `ต้องมีประสบการณ์อย่างน้อย ${required} แต่โปรไฟล์แจ้งไว้ ${declared}`,
  };
}

export function matchQualifications(
  qualifications: TorQualificationsLike | null | undefined,
  vendorProfile: VendorProfileLike | null
): QualificationMatchResult {
  const requirements: RequirementResult[] = [];

  for (const name of qualifications?.requiredCertifications ?? []) {
    if (name && name.trim()) requirements.push(matchCertification(name, vendorProfile));
  }
  if (qualifications?.minContractValueThb != null) {
    requirements.push(matchContractValue(qualifications.minContractValueThb, vendorProfile));
  }
  if (qualifications?.requiredExperienceYears != null) {
    requirements.push(matchExperienceYears(qualifications.requiredExperienceYears, vendorProfile));
  }

  if (requirements.length === 0) {
    return { requirements, overallStatus: 'no_requirements' };
  }
  if (requirements.some((r) => r.status === 'not_met')) {
    return { requirements, overallStatus: 'gaps_found' };
  }
  if (requirements.some((r) => r.status === 'undetermined')) {
    return { requirements, overallStatus: 'undetermined' };
  }
  return { requirements, overallStatus: 'all_met' };
}
