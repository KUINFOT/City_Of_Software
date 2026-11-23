import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { EmailVerificationModel } from '../models/EmailVerification';
import { PasswordResetModel } from '../models/PasswordReset';
import { VendorOnboardingModel } from '../models/VendorOnboarding';
import { VendorProfileModel } from '../models/VendorProfile';
import { SessionModel } from '../models/Session';
import { OAuthLoginModel } from '../models/OAuthLogin';
import { OAuthOnboardingModel } from '../models/OAuthOnboarding';
import { OAuthAccountLinkModel } from '../models/OAuthAccountLink';
import { env } from '../config/env';
import { hashVerificationToken, issuePasswordResetEmail, issuePendingRegistrationEmail, issueVerificationEmail } from '../services/email-verification.service';
import { hashPassword, verifyPassword } from '../services/password.service';
import { screenPassword } from '../services/password-breach.service';
import { createSessionId, createSessionToken, readSessionToken, sessionIdleExpiresAt } from '../services/session.service';
import { PendingRegistration, readPendingRegistrationToken } from '../services/pending-registration.service';
import { buildVendorProfileUpdate, upsertVendorProfile } from './vendorProfile.controller';
import { logSecurityEvent } from '../middleware/securityLog';
import { createGoogleAuthorizationUrl, googleOAuthIsConfigured, isValidGoogleOAuthState, readGoogleIdentity } from '../services/google-oauth.service';
import { createHmac, randomBytes } from 'node:crypto';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const REGISTERABLE_ROLES = new Set(['vendor', 'reviewer']);
const COMMON_PASSWORDS = new Set(['password', 'password123', '1234567890', 'qwertyuiop', 'cityofsoftware']);
const RESET_MESSAGE = 'If an account exists for this email, a password reset link has been sent.';
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown): string {
  return readText(value).toLowerCase();
}

function isEmail(value: string): boolean {
  if (value.length > 254 || value.includes(' ')) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return Boolean(local) && dot > 0 && dot < domain.length - 1 && !domain.startsWith('.') && !domain.endsWith('.');
}

async function passwordScreeningError(password: string): Promise<{ status: 400 | 503; error: string } | null> {
  const result = await screenPassword(password);
  if (result === 'accepted') return null;
  if (result === 'rejected') return { status: 400, error: 'Choose a password that has not appeared in a known data breach.' };
  return { status: 503, error: 'Password security check is temporarily unavailable. Please try again later.' };
}

type RegistrationInput = Omit<PendingRegistration, 'passwordHash' | 'profile'> & { password: string };

function readRegistrationInput(body: Record<string, unknown>): RegistrationInput | null {
  const name = readText(body.name);
  const organization = readText(body.organization);
  const email = normalizeEmail(body.email);
  const phone = readText(body.phone);
  const password = typeof body.password === 'string' ? body.password : '';
  const role = readText(body.role) || 'vendor';
  if (!name || !organization || !phone || !isEmail(email) || password.length < 10 || COMMON_PASSWORDS.has(password.toLowerCase()) || !REGISTERABLE_ROLES.has(role)) return null;
  return { name, organization, email, phone, password, role: role as 'vendor' | 'reviewer' };
}

async function sendPendingRegistration(input: RegistrationInput, profile?: Record<string, unknown>): Promise<void> {
  const existing = await UserModel.findOne({ email: input.email }).select({ emailVerified: 1 });
  if (existing?.emailVerified) throw new Error('An account with this email already exists. Please sign in instead.');
  await issuePendingRegistrationEmail(input.email, {
    name: input.name,
    organization: input.organization,
    email: input.email,
    phone: input.phone,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    ...(profile ? { profile } : {}),
  });
}

function publicUser(user: { _id: { toString(): string }; name: string; email: string; organization?: string | null; role: string; phone?: string | null; status: string }) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    organization: user.organization ?? '',
    role: user.role,
    phone: user.phone ?? '',
    status: user.status,
  };
}

function readGoogleCallbackValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A keyed lookup digest for high-entropy, short-lived Google flow values. */
function deriveGoogleFlowKey(value: string): string {
  return createHmac('sha256', env.authSecret).update(value).digest('hex');
}

function readBearerToken(header: string | undefined): string | null {
  if (!header || header.length <= 7 || header.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const token = header.slice(7).trim();
  return token || null;
}

function googleLoginRedirect(res: Response, result: 'denied' | 'invalid' | 'unavailable' | 'not_registered' | 'link_required'): void {
  const url = new URL('/login', env.appUrl);
  url.searchParams.set('oauth', result);
  res.redirect(302, url.toString());
}

function googleLinkRedirect(res: Response, result: 'linked' | 'denied' | 'expired' | 'conflict' | 'unavailable'): void {
  const url = new URL('/settings', env.appUrl);
  url.searchParams.set('google', result);
  res.redirect(302, url.toString());
}

function googleOnboardingRedirect(res: Response, onboardingToken: string): void {
  const url = new URL('/oauth-onboarding', env.appUrl);
  // Fragments are not sent to the app server, request logs, or referrers.
  url.hash = new URLSearchParams({ onboarding: onboardingToken }).toString();
  res.redirect(302, url.toString());
}

type GoogleOnboardingInput = { name: string; organization: string; phone: string; role: 'vendor' | 'reviewer' };

function readGoogleOnboardingInput(body: Record<string, unknown>): GoogleOnboardingInput | null {
  const name = readText(body.name);
  const organization = readText(body.organization);
  const phone = readText(body.phone);
  const role = readText(body.role);
  if (!name || !organization || !phone || (role !== 'vendor' && role !== 'reviewer')) return null;
  return { name, organization, phone, role };
}

function createSessionResponse(user: { _id: { toString(): string }; role: string; sessionVersion: number; lastLoginAt?: Date | null }, now: Date) {
  const sessionId = createSessionId();
  return SessionModel.create({ userId: user._id.toString(), sessionId, lastActivityAt: now, expiresAt: sessionIdleExpiresAt(now) })
    .then(() => createSessionToken({ userId: user._id.toString(), role: user.role as 'vendor' | 'reviewer' | 'admin', sessionId, sessionVersion: user.sessionVersion }));
}

/** GET /api/auth/google — send the browser to Google without exposing the client secret. */
export function beginGoogleLogin(req: Request, res: Response): void {
  if (!googleOAuthIsConfigured()) {
    logSecurityEvent('auth.google_login_unavailable', req);
    googleLoginRedirect(res, 'unavailable');
    return;
  }
  res.redirect(302, createGoogleAuthorizationUrl());
}

/** POST /api/auth/google/link — create a one-use link state for the active app session. */
export async function beginGoogleLink(req: Request, res: Response): Promise<void> {
  if (!googleOAuthIsConfigured()) {
    res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
    return;
  }
  const authUser = (req as AuthenticatedRequest).authUser;
  const bearer = readBearerToken(req.header('authorization'));
  const session = bearer ? readSessionToken(bearer) : null;
  if (!session || session.sub !== authUser.id) {
    res.status(401).json({ error: 'Please sign in again before connecting Google.' });
    return;
  }
  const user = await UserModel.findById(authUser.id).select('googleSubject sessionVersion');
  if (!user) {
    res.status(401).json({ error: 'Please sign in again before connecting Google.' });
    return;
  }
  if (user.googleSubject) {
    res.status(409).json({ error: 'A Google account is already connected to this account.' });
    return;
  }

  const state = randomBytes(32).toString('base64url');
  await OAuthAccountLinkModel.create({
    stateHash: deriveGoogleFlowKey(state),
    userId: user._id,
    sessionId: session.sid,
    sessionVersion: user.sessionVersion,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  logSecurityEvent('auth.google_link_started', req, { actorId: authUser.id });
  res.json({ authorizationUrl: createGoogleAuthorizationUrl(state) });
}

/** GET /api/auth/google/link-status — exposes only whether a provider is connected. */
export async function getGoogleLinkStatus(req: Request, res: Response): Promise<void> {
  const authUser = (req as AuthenticatedRequest).authUser;
  const user = await UserModel.findById(authUser.id).select('googleSubject').lean();
  res.json({ linked: Boolean(user?.googleSubject) });
}

/** GET /api/auth/google/callback — verify Google, then issue a one-time handoff in the URL fragment. */
export async function completeGoogleCallback(req: Request, res: Response): Promise<void> {
  if (!googleOAuthIsConfigured()) {
    googleLoginRedirect(res, 'unavailable');
    return;
  }
  const state = readGoogleCallbackValue(req.query.state);
  const code = readGoogleCallbackValue(req.query.code);
  const linkRequest = state
    ? await OAuthAccountLinkModel.findOne({ stateHash: deriveGoogleFlowKey(state), usedAt: null, expiresAt: { $gt: new Date() } }).lean()
    : null;
  if (readGoogleCallbackValue(req.query.error) || !code || (!linkRequest && !isValidGoogleOAuthState(state))) {
    logSecurityEvent('auth.google_login_failed', req, { reason: 'invalid_callback' });
    if (linkRequest) googleLinkRedirect(res, 'denied');
    else googleLoginRedirect(res, 'denied');
    return;
  }

  const identity = await readGoogleIdentity(code);
  if (!identity) {
    logSecurityEvent('auth.google_login_failed', req, { reason: 'invalid_identity' });
    if (linkRequest) googleLinkRedirect(res, 'denied');
    else googleLoginRedirect(res, 'denied');
    return;
  }
  if (linkRequest) {
    const consumedLink = await OAuthAccountLinkModel.findOneAndUpdate(
      { _id: linkRequest._id, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!consumedLink) {
      googleLinkRedirect(res, 'expired');
      return;
    }
    const activeSession = await SessionModel.exists({
      userId: consumedLink.userId,
      sessionId: consumedLink.sessionId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    const targetUser = activeSession ? await UserModel.findById(consumedLink.userId) : null;
    if (!targetUser || targetUser.status !== 'active' || targetUser.sessionVersion !== consumedLink.sessionVersion) {
      googleLinkRedirect(res, 'expired');
      return;
    }
    const existingGoogleOwner = await UserModel.findOne({ googleSubject: identity.subject }).select('_id');
    if (existingGoogleOwner && existingGoogleOwner._id.toString() !== targetUser._id.toString()) {
      logSecurityEvent('auth.google_link_failed', req, { actorId: targetUser._id.toString(), reason: 'provider_already_linked' });
      googleLinkRedirect(res, 'conflict');
      return;
    }
    targetUser.googleSubject = identity.subject;
    if (!targetUser.avatarUrl && identity.avatarUrl) targetUser.avatarUrl = identity.avatarUrl;
    await targetUser.save();
    logSecurityEvent('auth.google_link_succeeded', req, { actorId: targetUser._id.toString() });
    googleLinkRedirect(res, 'linked');
    return;
  }

  // `sub` is the provider identity. A matching email is NOT enough to add a
  // new authentication method; the account owner must connect it from Settings.
  const user = await UserModel.findOne({ googleSubject: identity.subject });
  if (!user) {
    const localAccount = await UserModel.exists({ email: identity.email });
    if (localAccount) {
      logSecurityEvent('auth.google_login_failed', req, { reason: 'link_required' });
      googleLoginRedirect(res, 'link_required');
      return;
    }
    const onboardingToken = randomBytes(32).toString('base64url');
    await OAuthOnboardingModel.create({
      tokenHash: deriveGoogleFlowKey(onboardingToken),
      googleSubject: identity.subject,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    logSecurityEvent('auth.google_onboarding_started', req);
    googleOnboardingRedirect(res, onboardingToken);
    return;
  }
  if (!user.emailVerified || user.status !== 'active' || (user.googleSubject && user.googleSubject !== identity.subject)) {
    logSecurityEvent('auth.google_login_failed', req, { reason: 'account_not_eligible' });
    googleLoginRedirect(res, 'not_registered');
    return;
  }

  if (!user.googleSubject) user.googleSubject = identity.subject;
  if (!user.avatarUrl && identity.avatarUrl) user.avatarUrl = identity.avatarUrl;
  user.lastLoginAt = new Date();
  await user.save();

  const handoffToken = randomBytes(32).toString('base64url');
  await OAuthLoginModel.create({
    tokenHash: deriveGoogleFlowKey(handoffToken),
    userId: user._id,
    expiresAt: new Date(Date.now() + 60_000),
  });
  logSecurityEvent('auth.google_login_succeeded', req, { actorId: user._id.toString() });
  const url = new URL('/login', env.appUrl);
  url.hash = new URLSearchParams({ google_login: handoffToken }).toString();
  res.redirect(302, url.toString());
}

/** POST /api/auth/google/complete — exchange the one-time OAuth handoff for an app session. */
export async function completeGoogleLogin(req: Request, res: Response): Promise<void> {
  const handoffToken = readGoogleCallbackValue(req.body?.token);
  if (!handoffToken) {
    res.status(400).json({ error: 'The Google sign-in request is invalid or has expired.' });
    return;
  }
  const handoff = await OAuthLoginModel.findOneAndUpdate(
    { tokenHash: deriveGoogleFlowKey(handoffToken), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!handoff) {
    res.status(400).json({ error: 'The Google sign-in request is invalid or has expired.' });
    return;
  }
  const user = await UserModel.findById(handoff.userId);
  if (!user || user.status !== 'active' || !user.emailVerified) {
    res.status(403).json({ error: 'This account is not available for sign-in.' });
    return;
  }
  const now = new Date();
  user.lastLoginAt = now;
  await user.save();
  const token = await createSessionResponse(user, now);
  res.json({ user: publicUser(user), token });
}

/** Reads verified claims without consuming the one-time registration capability. */
export async function getGoogleOnboardingDetails(req: Request, res: Response): Promise<void> {
  const onboardingToken = readGoogleCallbackValue(req.body?.token);
  const onboarding = onboardingToken
    ? await OAuthOnboardingModel.findOne({ tokenHash: deriveGoogleFlowKey(onboardingToken), usedAt: null, expiresAt: { $gt: new Date() } }).lean()
    : null;
  if (!onboarding) {
    res.status(400).json({ error: 'The Google registration request is invalid or has expired.' });
    return;
  }
  res.json({ name: onboarding.name, email: onboarding.email, avatarUrl: onboarding.avatarUrl || '' });
}

/** Completes app-specific profile fields for a verified Google identity. */
export async function completeGoogleOnboarding(req: Request, res: Response): Promise<void> {
  const onboardingToken = readGoogleCallbackValue(req.body?.token);
  const input = readGoogleOnboardingInput(req.body as Record<string, unknown>);
  if (!onboardingToken || !input) {
    res.status(400).json({ error: 'Name, organisation, phone number, and account role are required.' });
    return;
  }
  const onboarding = await OAuthOnboardingModel.findOneAndUpdate(
    { tokenHash: deriveGoogleFlowKey(onboardingToken), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!onboarding) {
    res.status(400).json({ error: 'The Google registration request is invalid or has expired.' });
    return;
  }
  const existing = await UserModel.findOne({ $or: [{ googleSubject: onboarding.googleSubject }, { email: onboarding.email }] });
  if (existing) {
    res.status(409).json({ error: 'An account using this Google identity or email already exists. Please sign in instead.' });
    return;
  }
  // Password authentication remains unavailable until a dedicated set-password
  // flow exists. This random value is never returned or stored in plain text.
  const user = await UserModel.create({
    ...input,
    email: onboarding.email,
    googleSubject: onboarding.googleSubject,
    avatarUrl: onboarding.avatarUrl || '',
    passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
    emailVerified: true,
    status: 'active',
  });
  const now = new Date();
  user.lastLoginAt = now;
  await user.save();
  const token = await createSessionResponse(user, now);
  logSecurityEvent('auth.google_onboarding_completed', req, { actorId: user._id.toString() });
  res.status(201).json({ user: publicUser(user), token });
}

/** POST /api/auth/register — email a reviewer registration link without persisting the account. */
export async function register(req: Request, res: Response): Promise<void> {
  const input = readRegistrationInput(req.body as Record<string, unknown>);
  if (!input) {
    res.status(400).json({ error: 'Please provide a name, organization, phone number, valid email, a non-common password of at least 10 characters, and valid account role.' });
    return;
  }
  const screeningError = await passwordScreeningError(input.password);
  if (screeningError) {
    res.status(screeningError.status).json({ error: screeningError.error });
    return;
  }
  if (input.role === 'vendor') {
    // This first step deliberately performs a read-only availability check:
    // the vendor draft itself remains in the browser until email verification.
    const existing = await UserModel.findOne({ email: input.email }).select({ emailVerified: 1 });
    if (existing?.emailVerified) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
      return;
    }
    res.status(200).json({ message: 'Continue with the vendor qualification profile before verification.', nextStep: 'vendor_onboarding' });
    return;
  }
  try {
    await sendPendingRegistration(input);
    res.status(202).json({ message: 'Check your email to verify your address and finish creating your account.', nextStep: 'verify_email' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
      return;
    }
    throw error;
  }
}

/** POST /api/auth/complete-vendor-onboarding — validate the US-003 draft, then send a no-database verification link. */
export async function completeVendorOnboarding(req: Request, res: Response): Promise<void> {
  const input = readRegistrationInput(req.body.registration as Record<string, unknown>);
  if (!input || input.role !== 'vendor') {
    res.status(400).json({ error: 'Your account details are missing or invalid. Please return to registration.' });
    return;
  }
  const screeningError = await passwordScreeningError(input.password);
  if (screeningError) {
    res.status(screeningError.status).json({ error: screeningError.error });
    return;
  }
  try {
    const profile = buildVendorProfileUpdate(req.body.profile as Record<string, unknown>);
    await sendPendingRegistration(input, profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Please check the vendor profile details.';
    res.status(message.includes('already exists') ? 409 : 400).json({ error: message });
    return;
  }
  res.json({ message: 'Check your email to verify your address and finish creating your account.', email: input.email });
}

/** POST /api/auth/resend-verification — issue a fresh verification link. */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail(req.body.email);
  if (!isEmail(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const user = await UserModel.findOne({ email });
  if (!user || user.emailVerified) {
    res.json({ message: 'If this account needs verification, a new email has been sent.' });
    return;
  }
  const latest = await EmailVerificationModel.findOne({ userId: user._id, usedAt: null }).sort({ sentAt: -1 });
  if (latest && Date.now() - latest.sentAt.getTime() < 60_000) {
    res.status(429).json({ error: 'Please wait one minute before requesting another verification email.' });
    return;
  }

  await issueVerificationEmail(user._id.toString(), user.email);
  res.json({ message: 'If this account needs verification, a new email has been sent.' });
}

/** POST /api/auth/verify-email — consume a single-use verification token from the browser fragment. */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const token = readText(req.body.token);
  if (!token) {
    res.status(400).json({ error: 'This verification link is invalid or expired.' });
    return;
  }

  const pendingRegistration = readPendingRegistrationToken(token);
  if (pendingRegistration) {
    const existing = await UserModel.findOne({ email: pendingRegistration.email });
    if (existing?.emailVerified) {
      res.status(400).json({ error: 'This verification link is invalid or expired.' });
      return;
    }
    // Accounts created by the old flow but never verified are safe to replace:
    // the new verified registration is the source of truth.
    if (existing) {
      await Promise.all([
        EmailVerificationModel.deleteMany({ userId: existing._id }),
        VendorOnboardingModel.deleteMany({ userId: existing._id }),
        VendorProfileModel.deleteMany({ userId: existing._id }),
      ]);
      await UserModel.deleteOne({ _id: existing._id });
    }
    const user = await UserModel.create({
      name: pendingRegistration.name,
      organization: pendingRegistration.organization,
      email: pendingRegistration.email,
      phone: pendingRegistration.phone,
      role: pendingRegistration.role,
      passwordHash: pendingRegistration.passwordHash,
      emailVerified: true,
      status: 'active',
    });
    if (pendingRegistration.role === 'vendor' && pendingRegistration.profile) {
      await upsertVendorProfile(user._id.toString(), pendingRegistration.profile);
    }
    res.json({ message: 'Your email address has been verified.' });
    return;
  }

  const verification = await EmailVerificationModel.findOneAndUpdate(
    { tokenHash: hashVerificationToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!verification) {
    res.status(400).json({ error: 'This verification link is invalid or expired.' });
    return;
  }

  await UserModel.findByIdAndUpdate(verification.userId, { $set: { emailVerified: true, status: 'active' } });
  res.json({ message: 'Your email address has been verified.' });
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail(req.body.email);
  if (isEmail(email)) {
    const user = await UserModel.findOne({ email });
    if (user && user.emailVerified) {
      const latest = await PasswordResetModel.findOne({ userId: user._id, usedAt: null }).sort({ sentAt: -1 });
      if (!latest || Date.now() - latest.sentAt.getTime() >= RESET_REQUEST_COOLDOWN_MS) {
        try {
          await issuePasswordResetEmail(user._id.toString(), user.email);
        } catch (error) {
          // Do not let a delivery outage turn this endpoint into an account
          // enumeration oracle. Operational logs still retain the failure.
          console.error('[password reset] delivery failed', error);
        }
      }
    }
  }
  res.json({ message: RESET_MESSAGE });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const token = readText(req.body.token); const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!token || password.length < 10 || COMMON_PASSWORDS.has(password.toLowerCase())) { res.status(400).json({ error: 'Choose a non-common password of at least 10 characters.' }); return; }
  const screeningError = await passwordScreeningError(password);
  if (screeningError) {
    res.status(screeningError.status).json({ error: screeningError.error });
    return;
  }
  const reset = await PasswordResetModel.findOneAndUpdate({ tokenHash: hashVerificationToken(token), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true });
  if (!reset) { res.status(400).json({ error: 'This password reset link is invalid or expired.' }); return; }
  const now = new Date();
  await Promise.all([
    UserModel.findByIdAndUpdate(reset.userId, { $set: { passwordHash: await hashPassword(password) }, $inc: { sessionVersion: 1 } }),
    SessionModel.updateMany({ userId: reset.userId, revokedAt: null }, { $set: { revokedAt: now } }),
  ]);
  res.json({ message: 'Your password has been reset. You can now sign in.' });
}

/** POST /api/auth/logout — revoke the current server-side session immediately. */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = readBearerToken(req.header('authorization'));
  const session = token ? readSessionToken(token) : null;
  if (session) {
    await SessionModel.updateOne(
      { userId: session.sub, sessionId: session.sid, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  logSecurityEvent('auth.logout', req, { actorId: session?.sub });
  // Deliberately idempotent: the browser can always complete local logout.
  res.status(204).end();
}

/** POST /api/auth/login — validate credentials against MongoDB. */
export async function login(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!isEmail(email) || !password) {
    logSecurityEvent('auth.login_failed', req, { reason: 'invalid_input' });
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = await UserModel.findOne({ email });
  const now = new Date();
  if (user?.loginLockedUntil && user.loginLockedUntil > now) {
    logSecurityEvent('auth.login_failed', req, { actorId: user._id.toString(), reason: 'account_locked' });
    res.status(429).json({ error: 'Too many failed sign-in attempts. Please try again in 15 minutes.' });
    return;
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    if (user) {
      const failedAttempts = user.loginLockedUntil && user.loginLockedUntil <= now ? 1 : (user.failedLoginAttempts ?? 0) + 1;
      const lockUntil = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(now.getTime() + LOGIN_LOCK_MS) : null;
      await UserModel.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: failedAttempts, loginLockedUntil: lockUntil } });
      if (lockUntil) {
        logSecurityEvent('auth.login_failed', req, { actorId: user._id.toString(), reason: 'account_locked' });
        res.status(429).json({ error: 'Too many failed sign-in attempts. Please try again in 15 minutes.' });
        return;
      }
    }
    logSecurityEvent('auth.login_failed', req, { reason: 'invalid_credentials' });
    res.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }
  if (user.status === 'suspended') {
    logSecurityEvent('auth.login_failed', req, { actorId: user._id.toString(), reason: 'suspended' });
    res.status(403).json({ error: 'This account has been suspended. Please contact an administrator.' });
    return;
  }
  if (!user.emailVerified) {
    logSecurityEvent('auth.login_failed', req, { actorId: user._id.toString(), reason: 'email_unverified' });
    res.status(403).json({ error: 'Please verify your email address before signing in.', code: 'EMAIL_NOT_VERIFIED' });
    return;
  }

  user.lastLoginAt = now;
  user.failedLoginAttempts = 0;
  user.loginLockedUntil = null;
  await user.save();
  const token = await createSessionResponse(user, now);
  logSecurityEvent('auth.login_succeeded', req, { actorId: user._id.toString() });
  res.json({ user: publicUser(user), token });
}
