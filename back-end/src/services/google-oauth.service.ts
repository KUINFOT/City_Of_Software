import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';

const STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export type GoogleIdentity = { subject: string; email: string; name: string; avatarUrl: string };

export function googleOAuthIsConfigured(): boolean {
  return Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret && env.googleOAuthRedirectUri);
}

function sign(value: string): string {
  return createHmac('sha256', env.authSecret).update(value).digest('base64url');
}

/** Creates a signed, short-lived state parameter to bind the callback to this app. */
export function createGoogleOAuthState(now = Date.now()): string {
  const value = `${now}.${randomBytes(32).toString('base64url')}`;
  return `${value}.${sign(value)}`;
}

/** Reject malformed, tampered, and expired OAuth state values. */
export function isValidGoogleOAuthState(state: string, now = Date.now()): boolean {
  const [issuedAtText, nonce, signature, ...extra] = state.split('.');
  if (!issuedAtText || !nonce || !signature || extra.length || !/^\d+$/.test(issuedAtText)) return false;
  const issuedAt = Number(issuedAtText);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now || now - issuedAt > STATE_TTL_MS) return false;
  const expected = Buffer.from(sign(`${issuedAtText}.${nonce}`));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createGoogleAuthorizationUrl(): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.googleOAuthClientId,
    redirect_uri: env.googleOAuthRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: createGoogleOAuthState(),
    // Forces Google to show a chooser when several accounts are active. No
    // refresh token is requested because this feature only authenticates users.
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/** Exchanges an authorization code server-side and verifies the Google ID token. */
export async function readGoogleIdentity(code: string): Promise<GoogleIdentity | null> {
  if (!googleOAuthIsConfigured()) return null;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleOAuthClientId,
      client_secret: env.googleOAuthClientSecret,
      redirect_uri: env.googleOAuthRedirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const token = (await tokenResponse.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!tokenResponse.ok || !token || typeof token.id_token !== 'string') return null;

  try {
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: token.id_token, audience: env.googleOAuthClientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true || !payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) return null;
    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name?.trim() || payload.email,
      avatarUrl: typeof payload.picture === 'string' ? payload.picture : '',
    };
  } catch {
    return null;
  }
}
