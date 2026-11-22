import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationToken, hashVerificationToken, resetUrl, verificationUrl } from './email-verification.service';

test('verification tokens are random and only their hash is persisted', () => {
  const first = createVerificationToken();
  const second = createVerificationToken();

  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashVerificationToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
});

test('email action links keep one-use tokens out of the query string', () => {
  const token = 'one-use-token';
  for (const url of [verificationUrl(token), resetUrl(token)]) {
    const parsed = new URL(url);
    assert.equal(parsed.search, '');
    assert.equal(new URLSearchParams(parsed.hash.slice(1)).get('token'), token);
  }
});
