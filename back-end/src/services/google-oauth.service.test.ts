import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleAuthorizationUrl, createGoogleOAuthState, isValidGoogleOAuthState } from './google-oauth.service';

test('Google OAuth state is signed and valid only for its short lifetime', async () => {
  const issuedAt = 1_700_000_000_000;
  const state = await createGoogleOAuthState(issuedAt);

  assert.equal(await isValidGoogleOAuthState(state, issuedAt + 60_000), true);
  assert.equal(await isValidGoogleOAuthState(`${state}x`, issuedAt + 60_000), false);
  assert.equal(await isValidGoogleOAuthState(state, issuedAt + 10 * 60_000 + 1), false);
});

test('Google authorization URL preserves an opaque state for an authenticated account-link flow', async () => {
  const url = new URL(await createGoogleAuthorizationUrl('single-use-link-state'));
  assert.equal(url.searchParams.get('state'), 'single-use-link-state');
});
