import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationToken, hashVerificationToken } from './email-verification.service';

test('verification tokens are random and only their hash is persisted', () => {
  const first = createVerificationToken();
  const second = createVerificationToken();

  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashVerificationToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
});
