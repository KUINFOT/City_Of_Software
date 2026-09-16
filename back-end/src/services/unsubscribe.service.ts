/**
 * Signed, one-click unsubscribe tokens (SCRUM-102/103, FR-NOT-06).
 *
 * Same HMAC-SHA256 + base64url + constant-time-compare construction as
 * session.service.ts and documentAccess.service.ts, reusing `env.authSecret`.
 * Deliberately non-expiring, unlike a document-access token: an unsubscribe
 * link sitting in an old, unread email must still work whenever it's finally
 * opened — that's the whole point of the feature. The worst case of a link
 * leaking is someone unsubscribing a vendor from email (a nuisance,
 * reversible from Settings), not a data exposure, so no TTL is a reasonable
 * trade here.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

interface UnsubscribePayload {
  userId: string;
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', env.authSecret).update(encodedPayload).digest('base64url');
}

export function createUnsubscribeToken(userId: string): string {
  const payload: UnsubscribePayload = { userId };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

/** Returns null for malformed or tampered tokens. */
export function readUnsubscribeToken(token: string): UnsubscribePayload | null {
  const [encodedPayload, signature, ...extra] = token.split('.');
  if (!encodedPayload || !signature || extra.length) return null;

  const expected = Buffer.from(sign(encodedPayload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const value: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<UnsubscribePayload>;
    if (typeof payload.userId !== 'string') return null;
    return payload as UnsubscribePayload;
  } catch {
    return null;
  }
}
