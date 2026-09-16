type ProfileRecord = Record<string, unknown> | null | undefined;

export type MissingProfileField = {
  key: "organizationType" | "companyName" | "techStack" | "serviceCategories" | "yearsExperience" | "certifications" | "pastContracts";
  weight: number;
};

export type ProfileCompleteness = {
  score: number;
  earnedWeight: number;
  totalWeight: number;
  missingFields: MissingProfileField[];
};

type Field = MissingProfileField & { complete: (profile: ProfileRecord) => boolean; applies: (profile: ProfileRecord) => boolean };

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const hasItems = (value: unknown) => Array.isArray(value) && value.length > 0;
const hasNonNegativeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * A transparent, matching-focused score.  It intentionally does not mutate a
 * profile or participate in matching: it only tells vendors which declared
 * capabilities would make future matching more useful.
 */
const fields: Field[] = [
  { key: "organizationType", weight: 10, applies: () => true, complete: (profile) => profile?.organizationType === "company" || profile?.organizationType === "freelancer" },
  { key: "companyName", weight: 10, applies: (profile) => profile?.organizationType !== "freelancer", complete: (profile) => hasText(profile?.companyName) },
  { key: "techStack", weight: 25, applies: () => true, complete: (profile) => hasItems(profile?.techStack) },
  { key: "serviceCategories", weight: 20, applies: () => true, complete: (profile) => hasItems(profile?.serviceCategories) },
  { key: "yearsExperience", weight: 15, applies: () => true, complete: (profile) => hasNonNegativeNumber(profile?.yearsExperience) },
  { key: "certifications", weight: 10, applies: () => true, complete: (profile) => hasItems(profile?.certifications) },
  { key: "pastContracts", weight: 10, applies: () => true, complete: (profile) => hasItems(profile?.pastContracts) },
];

export function computeProfileCompleteness(profile: ProfileRecord): ProfileCompleteness {
  const applicable = fields.filter((field) => field.applies(profile));
  const missingFields = applicable.filter((field) => !field.complete(profile)).map(({ key, weight }) => ({ key, weight }));
  const totalWeight = applicable.reduce((total, field) => total + field.weight, 0);
  const earnedWeight = totalWeight - missingFields.reduce((total, field) => total + field.weight, 0);
  return { score: totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0, earnedWeight, totalWeight, missingFields };
}
