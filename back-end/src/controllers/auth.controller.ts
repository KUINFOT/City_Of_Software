import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { EmailVerificationModel } from '../models/EmailVerification';
import { PasswordResetModel } from '../models/PasswordReset';
import { VendorOnboardingModel } from '../models/VendorOnboarding';
import { VendorProfileModel } from '../models/VendorProfile';
import { SessionModel } from '../models/Session';
import { env } from '../config/env';
import { hashVerificationToken, issuePasswordResetEmail, issuePendingRegistrationEmail, issueVerificationEmail } from '../services/email-verification.service';
import { hashPassword, verifyPassword } from '../services/password.service';
import { createSessionId, createSessionToken, readSessionToken, sessionIdleExpiresAt } from '../services/session.service';
import { PendingRegistration, readPendingRegistrationToken } from '../services/pending-registration.service';
import { buildVendorProfileUpdate, upsertVendorProfile } from './vendorProfile.controller';

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function verificationRedirect(res: Response, status: 'verified' | 'invalid'): void {
  const url = new URL('/verify-email', env.appUrl);
  url.searchParams.set('status', status);
  res.redirect(302, url.toString());
}

/** POST /api/auth/register — email a reviewer registration link without persisting the account. */
export async function register(req: Request, res: Response): Promise<void> {
  const input = readRegistrationInput(req.body as Record<string, unknown>);
  if (!input) {
    res.status(400).json({ error: 'Please provide a name, organization, phone number, valid email, a non-common password of at least 10 characters, and valid account role.' });
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

/** GET /api/auth/verify-email — consume a single-use verification link, then return to the app. */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const token = readText(req.query.token);
  if (!token) {
    verificationRedirect(res, 'invalid');
    return;
  }

  const pendingRegistration = readPendingRegistrationToken(token);
  if (pendingRegistration) {
    const existing = await UserModel.findOne({ email: pendingRegistration.email });
    if (existing?.emailVerified) {
      verificationRedirect(res, 'invalid');
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
    verificationRedirect(res, 'verified');
    return;
  }

  const verification = await EmailVerificationModel.findOneAndUpdate(
    { tokenHash: hashVerificationToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!verification) {
    verificationRedirect(res, 'invalid');
    return;
  }

  await UserModel.findByIdAndUpdate(verification.userId, { $set: { emailVerified: true, status: 'active' } });
  verificationRedirect(res, 'verified');
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
  const token = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = token ? readSessionToken(token) : null;
  if (session) {
    await SessionModel.updateOne(
      { userId: session.sub, sessionId: session.sid, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  // Deliberately idempotent: the browser can always complete local logout.
  res.status(204).end();
}

/** POST /api/auth/login — validate credentials against MongoDB. */
export async function login(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!isEmail(email) || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = await UserModel.findOne({ email });
  const now = new Date();
  if (user?.loginLockedUntil && user.loginLockedUntil > now) {
    res.status(429).json({ error: 'Too many failed sign-in attempts. Please try again in 15 minutes.' });
    return;
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    if (user) {
      const failedAttempts = user.loginLockedUntil && user.loginLockedUntil <= now ? 1 : (user.failedLoginAttempts ?? 0) + 1;
      const lockUntil = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(now.getTime() + LOGIN_LOCK_MS) : null;
      await UserModel.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: failedAttempts, loginLockedUntil: lockUntil } });
      if (lockUntil) {
        res.status(429).json({ error: 'Too many failed sign-in attempts. Please try again in 15 minutes.' });
        return;
      }
    }
    res.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }
  if (user.status === 'suspended') {
    res.status(403).json({ error: 'This account has been suspended. Please contact an administrator.' });
    return;
  }
  if (!user.emailVerified) {
    res.status(403).json({ error: 'Please verify your email address before signing in.', code: 'EMAIL_NOT_VERIFIED' });
    return;
  }

  user.lastLoginAt = now;
  user.failedLoginAttempts = 0;
  user.loginLockedUntil = null;
  await user.save();
  const sessionId = createSessionId();
  await SessionModel.create({ userId: user._id, sessionId, lastActivityAt: now, expiresAt: sessionIdleExpiresAt(now) });
  res.json({ user: publicUser(user), token: createSessionToken({ userId: user._id.toString(), role: user.role as 'vendor' | 'reviewer' | 'admin', sessionId, sessionVersion: user.sessionVersion }) });
}
