export type VendorProfile = {
  organizationType: 'company' | 'freelancer';
  companyName: string;
  techStack: string[];
  serviceCategories: string[];
  yearsExperience?: number;
  teamSize?: number;
  certifications: { name: string; issuer: string }[];
  pastContracts: { agencyName: string; projectTitle: string; contractValueThb: number; year?: number }[];
  totalContractValueThb?: number;
  profileVersion?: number;
  updatedAt?: string;
};

export type ProfileCompleteness = {
  score: number;
  earnedWeight: number;
  totalWeight: number;
  missingFields: { key: "organizationType" | "companyName" | "techStack" | "serviceCategories" | "yearsExperience" | "certifications" | "pastContracts"; weight: number }[];
};

export type VendorProfileResult = { profile: VendorProfile | null; completeness: ProfileCompleteness };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function profileRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error ?? 'Unable to save the profile.');
  return payload;
}

export async function getVendorProfile(userId: string, token: string): Promise<VendorProfileResult> {
  return profileRequest<VendorProfileResult>(`/vendor-profiles/${userId}`, token);
}

export async function saveVendorProfile(userId: string, token: string, profile: VendorProfile): Promise<VendorProfileResult> {
  return profileRequest<VendorProfileResult>(`/vendor-profiles/${userId}`, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...profile, expectedVersion: profile.profileVersion }) });
}
