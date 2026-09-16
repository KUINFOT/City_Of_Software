import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';

export type PendingRegistration = {
  name: string;
  organization: string;
  email: string;
  phone: string;
  role: 'vendor' | 'reviewer';
  passwordHash: string;
  profile?: Record<string, unknown>;
};

type PendingRegistrationPayload = PendingRegistration & { exp: number };

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const CIPHER = 'aes-256-gcm';

function encryptionKey(): Buffer {
  return createHash('sha256').update(env.authSecret).digest();
}

/**
 * Encrypts the registration data for a short-lived email link. The draft is
 * never persisted in MongoDB; AES-GCM also makes a tampered link invalid.
 */
export function createPendingRegistrationToken(registration: PendingRegistration): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, encryptionKey(), iv);
  const payload: PendingRegistrationPayload = { ...registration, exp: Date.now() + TOKEN_TTL_MS };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

/** Returns null for expired, malformed, or tampered links. */
export function readPendingRegistrationToken(token: string): PendingRegistrationPayload | null {
  try {
    const source = Buffer.from(token, 'base64url');
    // Base64URL permits several text spellings for the same final byte. Accept
    // only the exact canonical encoding we issue, so any character change to a
    // link is rejected before attempting decryption.
    if (source.length <= 28 || source.toString('base64url') !== token) return null;
    const iv = source.subarray(0, 12);
    const tag = source.subarray(12, 28);
    const encrypted = source.subarray(28);
    const decipher = createDecipheriv(CIPHER, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const value: unknown = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<PendingRegistrationPayload>;
    if (typeof payload.name !== 'string' || typeof payload.organization !== 'string' || typeof payload.email !== 'string' || typeof payload.phone !== 'string' || (payload.role !== 'vendor' && payload.role !== 'reviewer') || typeof payload.passwordHash !== 'string' || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    if (payload.profile !== undefined && (typeof payload.profile !== 'object' || payload.profile === null || Array.isArray(payload.profile))) return null;
    return payload as PendingRegistrationPayload;
  } catch {
    return null;
  }
}
