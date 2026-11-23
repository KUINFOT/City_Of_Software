import { randomBytes, timingSafeEqual, webcrypto } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';

const STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export type GoogleIdentity = { subject: string; email: string; name: string; avatarUrl: string };

export function googleOAuthIsConfigured(): boolean {
  return Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret && env.googleOAuthRedirectUri);
}

async function sign(value: string): Promise<string> {
  const key = await webcrypto.subtle.importKey(
    'raw',
    Buffer.from(env.authSecret, 'utf8'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await webcrypto.subtle.sign('HMAC', key, Buffer.from(value, 'utf8'));
  return Buffer.from(signature).toString('base64url');
}

/** Creates a signed, short-lived state parameter to bind the callback to this app. */
export async function createGoogleOAuthState(now = Date.now()): Promise<string> {
  const value = `${now}.${randomBytes(32).toString('base64url')}`;
  return `${value}.${await sign(value)}`;
}

/** Reject malformed, tampered, and expired OAuth state values. */
export async function isValidGoogleOAuthState(state: string, now = Date.now()): Promise<boolean> {
  const [issuedAtText, nonce, signature, ...extra] = state.split('.');
  if (!issuedAtText || !nonce || !signature || extra.length || !/^\d+$/.test(issuedAtText)) return false;
  const issuedAt = Number(issuedAtText);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now || now - issuedAt > STATE_TTL_MS) return false;
  const expected = Buffer.from(await sign(`${issuedAtText}.${nonce}`));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function createGoogleAuthorizationUrl(state?: string): Promise<string> {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.googleOAuthClientId,
    redirect_uri: env.googleOAuthRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: state ?? await createGoogleOAuthState(),
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
