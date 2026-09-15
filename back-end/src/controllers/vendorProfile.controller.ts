import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { VendorProfileModel } from '../models/VendorProfile';
import { readUnsubscribeToken } from '../services/unsubscribe.service';
import { env } from '../config/env';

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

/** Same shape as `list()`, additionally filtered to valid Mongo ObjectId strings. */
function objectIdList(value: unknown): string[] {
  return list(value).filter((id) => isValidObjectId(id));
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
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

/** GET /api/vendor-profiles/:userId — read one vendor's self-declared profile. */
export async function getVendorProfile(req: Request, res: Response): Promise<void> {
  const profile = await VendorProfileModel.findOne({ userId: req.params.userId });
  res.json({ profile });
}

/** PUT /api/vendor-profiles/:userId — create or update self-declared matching data. */
/** Reused by the authenticated settings page and the pre-verification vendor onboarding flow. */
export function buildVendorProfileUpdate(body: Record<string, unknown>) {
  const organizationType = body.organizationType === 'freelancer' ? 'freelancer' : body.organizationType === 'company' ? 'company' : '';
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
  if (!organizationType || (organizationType === 'company' && !companyName)) {
    throw new Error('Choose an organisation type and provide a company name when applicable.');
  }

  const update = {
    organizationType,
    companyName: organizationType === 'company' ? companyName : '',
    techStack: list(body.techStack),
    serviceCategories: list(body.serviceCategories),
    yearsExperience: numberOrUndefined(body.yearsExperience),
    teamSize: numberOrUndefined(body.teamSize),
    certifications: Array.isArray(body.certifications)
      ? (body.certifications as Array<{ name?: unknown; issuer?: unknown }>).filter((item) => typeof item?.name === 'string').map((item) => ({ name: (item.name as string).trim(), issuer: typeof item.issuer === 'string' ? item.issuer.trim() : '' }))
      : [],
    totalContractValueThb: numberOrUndefined(body.totalContractValueThb) ?? 0,
  } as Record<string, unknown>;

  const frequency = notificationFrequencyOrUndefined(
    (body.notificationPrefs as Record<string, unknown> | undefined)?.frequency
  );
  if (frequency) update['notificationPrefs.frequency'] = frequency;

  // SCRUM-98: a vendor's followed-agencies/keywords watchlist, distinct from
  // the profile-capability fields above.
  const interests = body.interests as Record<string, unknown> | undefined;
  if (interests) {
    update['interests.agencyIds'] = objectIdList(interests.agencyIds);
    update['interests.keywords'] = list(interests.keywords);
  }

  return update;
}

export async function upsertVendorProfile(userId: string, body: Record<string, unknown>) {
  const update = buildVendorProfileUpdate(body);
  return VendorProfileModel.findOneAndUpdate(
    { userId },
    { $set: update, $setOnInsert: { userId } },
    { new: true, upsert: true, runValidators: true }
  );
}

/** PUT /api/vendor-profiles/:userId — create or update self-declared matching data. */
export async function saveVendorProfile(req: Request, res: Response): Promise<void> {
  try {
    const profile = await upsertVendorProfile(req.params.userId, req.body as Record<string, unknown>);
    res.json({ profile });
  } catch (error) {
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
