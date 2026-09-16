import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { VendorProfileModel } from '../models/VendorProfile';
import { computeProfileCompleteness } from '../services/vendor-profile-completeness.service';
import { readUnsubscribeToken } from '../services/unsubscribe.service';
import { env } from '../config/env';

const MAX_LIST_ITEMS = 30;
const MAX_CERTIFICATIONS = 20;
const MAX_CONTRACTS = 20;

export class ProfileVersionConflictError extends Error {}

type Certification = { name: string; issuer: string };
type PastContract = { agencyName: string; projectTitle: string; contractValueThb: number; year?: number };

export type VendorProfileUpdate = {
  organizationType: 'company' | 'freelancer';
  companyName: string;
  techStack: string[];
  serviceCategories: string[];
  yearsExperience?: number;
  teamSize?: number;
  certifications: Certification[];
  pastContracts: PastContract[];
  totalContractValueThb: number;
};

function readText(value: unknown, maxLength = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function list(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_LIST_ITEMS) throw new Error(`${label} can contain at most ${MAX_LIST_ITEMS} items.`);
  return [...new Set(value.map((item) => readText(item)).filter(Boolean))];
}

/** Same shape as `list()`, additionally filtered to valid Mongo ObjectId strings. */
function objectIdList(value: unknown, label: string): string[] {
  return list(value, label).filter((id) => isValidObjectId(id));
}

function optionalNumber(value: unknown, label: string, minimum: number, maximum = 1_000_000_000): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

/**
 * Only `frequency` is wired through today (EP-04 SCRUM-96 only asks for an
 * instant-vs-daily-digest choice). `notificationPrefs.channels`/
 * `minMatchScore` already exist on the VendorProfile schema for future use
 * but have no settings-page UI yet, so they're deliberately not accepted
 * here — silently accepting fields nothing can set from the UI would just
 * invite drift between what the API allows and what a user can express.
 */
function notificationFrequencyOrUndefined(value: unknown): 'instant' | 'daily_digest' | undefined {
  return value === 'instant' || value === 'daily_digest' ? value : undefined;
}

function certifications(value: unknown): Certification[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_CERTIFICATIONS) throw new Error(`Certifications can contain at most ${MAX_CERTIFICATIONS} items.`);
  return value.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const name = readText(record.name);
    if (!name) throw new Error('Each certification needs a name.');
    return { name, issuer: readText(record.issuer) };
  });
}

function pastContracts(value: unknown): PastContract[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_CONTRACTS) throw new Error(`Past contracts can contain at most ${MAX_CONTRACTS} items.`);
  const currentYear = new Date().getUTCFullYear() + 1;
  return value.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const projectTitle = readText(record.projectTitle);
    const contractValueThb = optionalNumber(record.contractValueThb, 'Past contract value', 0);
    const year = optionalNumber(record.year, 'Past contract year', 1900, currentYear);
    if (!projectTitle || contractValueThb === undefined) throw new Error('Each past contract needs a title and a non-negative value.');
    return { agencyName: readText(record.agencyName), projectTitle, contractValueThb, ...(year === undefined ? {} : { year }) };
  });
}

/** Validates and normalises self-declared CAPABILITY values before they enter profile history. */
export function buildVendorProfileUpdate(body: Record<string, unknown>): VendorProfileUpdate {
  const organizationType = body.organizationType === 'freelancer' ? 'freelancer' : body.organizationType === 'company' ? 'company' : null;
  const companyName = readText(body.companyName);
  const techStack = list(body.techStack, 'Technology stack');
  const serviceCategories = list(body.serviceCategories, 'Service categories');
  if (!organizationType || (organizationType === 'company' && !companyName)) throw new Error('Choose an organisation type and provide a company name when applicable.');
  if (!techStack.length && !serviceCategories.length) throw new Error('Add at least one technology or service category for matching.');
  const contracts = pastContracts(body.pastContracts);
  return {
    organizationType,
    companyName: organizationType === 'company' ? companyName : '',
    techStack,
    serviceCategories,
    yearsExperience: optionalNumber(body.yearsExperience, 'Years of experience', 0, 100),
    teamSize: optionalNumber(body.teamSize, 'Team size', 1, 1_000_000),
    certifications: certifications(body.certifications),
    pastContracts: contracts,
    totalContractValueThb: contracts.reduce((total, contract) => total + contract.contractValueThb, 0),
  };
}

/**
 * SCRUM-96's notification-frequency choice and SCRUM-98's followed-
 * agencies/keywords watchlist, kept OUT of `VendorProfileUpdate` and its
 * version history on purpose: neither is a fact about the vendor's
 * capabilities that a past match should stay pinned to (the way techStack or
 * yearsExperience is) — they're delivery/tracking settings that should just
 * take effect going forward, so they're written as plain dotted-path `$set`s
 * alongside the versioned update rather than inside its snapshot.
 */
function buildAuxiliaryUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  const frequency = notificationFrequencyOrUndefined(
    (body.notificationPrefs as Record<string, unknown> | undefined)?.frequency
  );
  if (frequency) update['notificationPrefs.frequency'] = frequency;

  const interests = body.interests as Record<string, unknown> | undefined;
  if (interests) {
    update['interests.agencyIds'] = objectIdList(interests.agencyIds, 'Followed agencies');
    update['interests.keywords'] = list(interests.keywords, 'Followed keywords');
  }

  return update;
}

function isSameUpdate(current: Record<string, unknown>, next: VendorProfileUpdate): boolean {
  return JSON.stringify({
    organizationType: current.organizationType,
    companyName: current.companyName ?? '',
    techStack: current.techStack ?? [],
    serviceCategories: current.serviceCategories ?? [],
    yearsExperience: current.yearsExperience,
    teamSize: current.teamSize,
    certifications: current.certifications ?? [],
    pastContracts: current.pastContracts ?? [],
    totalContractValueThb: current.totalContractValueThb ?? 0,
  }) === JSON.stringify(next);
}

function snapshot(profile: VendorProfileUpdate): VendorProfileUpdate {
  return JSON.parse(JSON.stringify(profile)) as VendorProfileUpdate;
}

function readExpectedVersion(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error('Profile version is invalid. Reload the profile and try again.');
  return value as number;
}

/** GET /api/vendor-profiles/:userId — returns the current declared capability set. */
export async function getVendorProfile(req: Request, res: Response): Promise<void> {
  const profile = await VendorProfileModel.findOne({ userId: req.params.userId }).lean();
  res.json({ profile, completeness: computeProfileCompleteness(profile) });
}

/**
 * Creates or updates the current profile and appends an immutable snapshot.
 * Matching jobs can store `profileVersion`, so an edit only affects jobs run
 * after its effective timestamp rather than rewriting historical matches.
 * Auxiliary settings (notification frequency, followed agencies/keywords)
 * are written alongside but outside that version history — see
 * `buildAuxiliaryUpdate`.
 */
export async function upsertVendorProfile(userId: string, body: Record<string, unknown>) {
  const update = buildVendorProfileUpdate(body);
  const auxiliary = buildAuxiliaryUpdate(body);
  const expectedVersion = readExpectedVersion(body.expectedVersion);
  const current = await VendorProfileModel.findOne({ userId }).lean() as (Record<string, unknown> & { profileVersion?: number; profileHistory?: unknown[]; updatedAt?: Date }) | null;
  const effectiveAt = new Date();

  if (!current) {
    return VendorProfileModel.create({
      userId,
      ...update,
      ...auxiliary,
      profileVersion: 1,
      profileHistory: [{ version: 1, effectiveAt, profile: snapshot(update) }],
    });
  }

  const currentVersion = current.profileVersion ?? 1;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) throw new ProfileVersionConflictError('This profile changed in another session. Reload it before saving your changes.');

  if (isSameUpdate(current, update)) {
    if (Object.keys(auxiliary).length === 0) return current;
    // Capability fields are unchanged, but a setting (frequency/watchlist)
    // still needs writing — no new version, no snapshot, just the aux $set.
    return VendorProfileModel.findOneAndUpdate({ userId }, { $set: auxiliary }, { new: true, runValidators: true });
  }

  const currentSnapshot: VendorProfileUpdate = {
    organizationType: current.organizationType === 'freelancer' ? 'freelancer' : 'company',
    companyName: typeof current.companyName === 'string' ? current.companyName : '',
    techStack: Array.isArray(current.techStack) ? current.techStack as string[] : [],
    serviceCategories: Array.isArray(current.serviceCategories) ? current.serviceCategories as string[] : [],
    ...(typeof current.yearsExperience === 'number' ? { yearsExperience: current.yearsExperience } : {}),
    ...(typeof current.teamSize === 'number' ? { teamSize: current.teamSize } : {}),
    certifications: Array.isArray(current.certifications) ? current.certifications as Certification[] : [],
    pastContracts: Array.isArray(current.pastContracts) ? current.pastContracts as PastContract[] : [],
    totalContractValueThb: typeof current.totalContractValueThb === 'number' ? current.totalContractValueThb : 0,
  };
  const nextVersion = currentVersion + 1;
  const history = Array.isArray(current.profileHistory) && current.profileHistory.length
    ? [{ version: nextVersion, effectiveAt, profile: snapshot(update) }]
    : [{ version: currentVersion, effectiveAt: current.updatedAt ?? effectiveAt, profile: snapshot(currentSnapshot) }, { version: nextVersion, effectiveAt, profile: snapshot(update) }];
  const profile = await VendorProfileModel.findOneAndUpdate(
    { userId, $or: [{ profileVersion: current.profileVersion }, { profileVersion: { $exists: false } }] },
    { $set: { ...update, ...auxiliary, profileVersion: nextVersion }, $push: { profileHistory: { $each: history } } },
    { new: true, runValidators: true }
  );
  if (!profile) throw new ProfileVersionConflictError('This profile changed in another session. Reload it before saving your changes.');
  return profile;
}

/** PUT /api/vendor-profiles/:userId — persist a self-declared, versioned profile update. */
export async function saveVendorProfile(req: Request, res: Response): Promise<void> {
  try {
    const profile = await upsertVendorProfile(req.params.userId, req.body as Record<string, unknown>);
    const serializable = profile as unknown as { toObject?: () => Record<string, unknown> };
    res.json({ profile, completeness: computeProfileCompleteness(typeof serializable.toObject === 'function' ? serializable.toObject() : profile as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof ProfileVersionConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save the vendor profile.' });
  }
}

/**
 * GET /api/vendor-profiles/unsubscribe?token=... — SCRUM-102/103: a one-click
 * link opened straight from an email, no session required. Removes 'email'
 * from notificationPrefs.channels only — 'in_app' stays, so this stops
 * delivery without disabling the account (FR-NOT-06), and takes effect
 * immediately for the next dispatch since dispatch.ts/digest.ts read this
 * field fresh on every run.
 */
export async function unsubscribeByToken(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  const payload = token ? readUnsubscribeToken(token) : null;

  const redirect = (status: 'unsubscribed' | 'invalid') => {
    const url = new URL('/unsubscribed', env.appUrl);
    url.searchParams.set('status', status);
    res.redirect(302, url.toString());
  };

  if (!payload) {
    redirect('invalid');
    return;
  }

  await VendorProfileModel.updateOne({ userId: payload.userId }, { $pull: { 'notificationPrefs.channels': 'email' } });
  redirect('unsubscribed');
}
