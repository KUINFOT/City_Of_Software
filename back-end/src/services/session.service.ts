import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

type SessionRole = 'vendor' | 'reviewer' | 'admin';
type SessionPayload = { sub: string; role: SessionRole; sid: string; sv: number; exp: number };

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;

function sign(encodedPayload: string): string {
  return createHmac('sha256', env.authSecret).update(encodedPayload).digest('base64url');
}

export function createSessionId(): string {
  return randomUUID();
}

export function sessionIdleExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_IDLE_MS);
}

export function createSessionToken(input: { userId: string; role: SessionRole; sessionId: string; sessionVersion: number }): string {
  const payload: SessionPayload = { sub: input.userId, role: input.role, sid: input.sessionId, sv: input.sessionVersion, exp: Date.now() + SESSION_DURATION_MS };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

/** Returns null for malformed, expired, or tampered tokens. */
export function readSessionToken(token: string): SessionPayload | null {
  const [encodedPayload, signature, ...extra] = token.split('.');
  if (!encodedPayload || !signature || extra.length) return null;

  const expected = Buffer.from(sign(encodedPayload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const value: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<SessionPayload>;
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !['vendor', 'reviewer', 'admin'].includes(String(payload.role)) || !Number.isInteger(payload.sv) || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
