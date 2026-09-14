import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { EmailVerificationModel } from '../models/EmailVerification';
import { PasswordResetModel } from '../models/PasswordReset';
import { createPendingRegistrationToken, PendingRegistration } from './pending-registration.service';

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
  if (env.gmailUser && env.gmailAppPassword) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.gmailUser,
        pass: env.gmailAppPassword.replace(/\s/g, ''),
      },
    });
    await transporter.sendMail({
      from: `City of Software <${env.gmailUser}>`,
      to: email,
      subject: 'Verify your City of Software email address',
      text: `Welcome to City of Software. Verify your email address: ${url}\n\nThis link expires in 24 hours.`,
      html: `<p>Welcome to City of Software.</p><p><a href="${url}">Verify your email address</a></p><p>This link expires in 24 hours.</p>`,
    });
    return;
  }
  if (!env.resendApiKey || !env.emailFrom) {
    if (env.nodeEnv === 'production') throw new Error('Email delivery is not configured.');
    console.info(`[email verification] Development link for ${email}: ${url}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [email],
      subject: 'Verify your City of Software email address',
      html: `<p>Welcome to City of Software.</p><p><a href="${url}">Verify your email address</a></p><p>This link expires in 24 hours.</p>`,
    }),
  });
  if (!response.ok) throw new Error('Email delivery provider rejected the verification email.');
}

async function deliverPasswordResetEmail(email: string, token: string): Promise<void> {
  const url = resetUrl(token);
  const message = 'Reset your City of Software password';
  if (env.gmailUser && env.gmailAppPassword) {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: env.gmailUser, pass: env.gmailAppPassword.replace(/\s/g, '') } });
    await transporter.sendMail({ from: `City of Software <${env.gmailUser}>`, to: email, subject: message, text: `Reset your password: ${url}\n\nThis link expires in 1 hour.`, html: `<p><a href="${url}">Reset your password</a></p><p>This link expires in 1 hour.</p>` });
    return;
  }
  if (env.nodeEnv === 'production') throw new Error('Email delivery is not configured.');
  console.info(`[password reset] Development link for ${email}: ${url}`);
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
