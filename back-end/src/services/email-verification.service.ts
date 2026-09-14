import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { EmailVerificationModel } from '../models/EmailVerification';
import { PasswordResetModel } from '../models/PasswordReset';
import { createPendingRegistrationToken, PendingRegistration } from './pending-registration.service';
import { sendEmail } from './email.service';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashVerificationToken(token) };
}

function verificationUrl(token: string): string {
  return `${env.publicApiUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
}

function resetUrl(token: string): string { return `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`; }

async function deliverVerificationEmail(email: string, token: string): Promise<void> {
  const url = verificationUrl(token);
  await sendEmail({
    to: email,
    subject: 'Verify your City of Software email address',
    text: `Welcome to City of Software. Verify your email address: ${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to City of Software.</p><p><a href="${url}">Verify your email address</a></p><p>This link expires in 24 hours.</p>`,
  });
}

// Previously had no Resend fallback (Gmail-or-dev-log only), unlike
// deliverVerificationEmail — a Resend-only production config would silently
// fail every password reset. Routing through the shared sendEmail() fixes
// that as a side effect of removing the duplication.
async function deliverPasswordResetEmail(email: string, token: string): Promise<void> {
  const url = resetUrl(token);
  await sendEmail({
    to: email,
    subject: 'Reset your City of Software password',
    text: `Reset your password: ${url}\n\nThis link expires in 1 hour.`,
    html: `<p><a href="${url}">Reset your password</a></p><p>This link expires in 1 hour.</p>`,
  });
}

export async function issueVerificationEmail(userId: string, email: string): Promise<void> {
  const { token, tokenHash } = createVerificationToken();
  const now = new Date();
  await EmailVerificationModel.updateMany({ userId, usedAt: null }, { $set: { usedAt: now } });
  await EmailVerificationModel.create({
    userId,
    tokenHash,
    sentAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  });
  await deliverVerificationEmail(email, token);
}

/** Sends a registration link without creating any MongoDB documents. */
export async function issuePendingRegistrationEmail(email: string, registration: PendingRegistration): Promise<void> {
  await deliverVerificationEmail(email, createPendingRegistrationToken(registration));
}

export async function issuePasswordResetEmail(userId: string, email: string): Promise<void> {
  const { token, tokenHash } = createVerificationToken(); const now = new Date();
  await PasswordResetModel.updateMany({ userId, usedAt: null }, { $set: { usedAt: now } });
  await PasswordResetModel.create({ userId, tokenHash, sentAt: now, expiresAt: new Date(now.getTime() + 60 * 60 * 1000) });
  await deliverPasswordResetEmail(email, token);
}
