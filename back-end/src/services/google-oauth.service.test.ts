import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleOAuthState, isValidGoogleOAuthState } from './google-oauth.service';

test('Google OAuth state is signed and valid only for its short lifetime', () => {
  const issuedAt = 1_700_000_000_000;
  const state = createGoogleOAuthState(issuedAt);

  assert.equal(isValidGoogleOAuthState(state, issuedAt + 60_000), true);
  assert.equal(isValidGoogleOAuthState(`${state}x`, issuedAt + 60_000), false);
  assert.equal(isValidGoogleOAuthState(state, issuedAt + 10 * 60_000 + 1), false);
});
