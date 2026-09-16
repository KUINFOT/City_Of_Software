import { VendorProfile } from "./vendor-profile";

export type RegistrationDraft = {
  name: string;
  organization: string;
  email: string;
  password: string;
  phone: string;
  role: "vendor" | "official";
  accepted: boolean;
};

export const REGISTRATION_DRAFT_KEY = "city-of-software-registration-draft";
export const VENDOR_PROFILE_DRAFT_KEY = "city-of-software-vendor-profile-draft";

export const blankRegistrationDraft: RegistrationDraft = { name: "", organization: "", email: "", password: "", phone: "", role: "vendor", accepted: true };
export const blankVendorProfile: VendorProfile = { organizationType: "company", companyName: "", techStack: [], serviceCategories: [], certifications: [], pastContracts: [] };

function readDraft<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as T | null;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function readRegistrationDraft(): RegistrationDraft {
  return { ...blankRegistrationDraft, ...readDraft(REGISTRATION_DRAFT_KEY, blankRegistrationDraft) };
}

export function readVendorProfileDraft(): VendorProfile {
  return { ...blankVendorProfile, ...readDraft(VENDOR_PROFILE_DRAFT_KEY, blankVendorProfile) };
}
