export type VendorProfile = {
  organizationType: 'company' | 'freelancer';
  companyName: string;
  techStack: string[];
  serviceCategories: string[];
  yearsExperience?: number;
  teamSize?: number;
  certifications: { name: string; issuer: string }[];
  totalContractValueThb?: number;
  notificationPrefs?: { frequency: "instant" | "daily_digest" };
  interests?: { agencyIds: string[]; keywords: string[] };
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function profileRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error ?? 'Unable to save the profile.');
  return payload;
}

export async function getVendorProfile(userId: string): Promise<VendorProfile | null> {
  const result = await profileRequest<{ profile: VendorProfile | null }>(`/vendor-profiles/${userId}`);
  return result.profile;
}

export async function saveVendorProfile(userId: string, profile: VendorProfile): Promise<VendorProfile> {
  const result = await profileRequest<{ profile: VendorProfile }>(`/vendor-profiles/${userId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  return result.profile;
}
