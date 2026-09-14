/**
 * Signed, expiring access tokens for retrieving an original document
 * (US-016/FR-REP-04: "shall offer retrieval of the original document").
 *
 * Same HMAC-SHA256 + base64url + constant-time-compare construction as
 * session.service.ts's session tokens, reusing `env.authSecret` — there is
 * no separate secret to provision, and a document-access token already
 * carries its own short TTL, so the blast radius of a compromised secret is
 * the same either way. Deliberately NOT a session token: it authorizes one
 * document id only, not a signed-in identity, so a link can be handed to a
 * vendor without also handing them a session.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

interface DocumentAccessPayload {
  documentId: string;
  exp: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function sign(encodedPayload: string): string {
  return createHmac('sha256', env.authSecret).update(encodedPayload).digest('base64url');
}

export function createDocumentAccessToken(
  documentId: string,
  ttlMs: number = DEFAULT_TTL_MS
): { token: string; expiresAt: number } {
  const payload: DocumentAccessPayload = { documentId, exp: Date.now() + ttlMs };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${encodedPayload}.${sign(encodedPayload)}`, expiresAt: payload.exp };
}

/** Returns null for malformed, expired, or tampered tokens. */
export function readDocumentAccessToken(token: string): DocumentAccessPayload | null {
  const [encodedPayload, signature, ...extra] = token.split('.');
  if (!encodedPayload || !signature || extra.length) return null;

  const expected = Buffer.from(sign(encodedPayload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const value: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<DocumentAccessPayload>;
    if (typeof payload.documentId !== 'string' || typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
      return null;
    }
    return payload as DocumentAccessPayload;
  } catch {
    return null;
  }
}
