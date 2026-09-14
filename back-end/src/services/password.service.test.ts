import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from './password.service';

test('hashPassword creates a verifiable, salted hash', async () => {
  const password = 'correct-horse-battery-staple';
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword('wrong-password', firstHash), false);
});
