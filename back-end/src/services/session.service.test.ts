import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readSessionToken } from './session.service';

test('session tokens are signed and contain only the expected session claims', () => {
  const token = createSessionToken({ userId: '507f1f77bcf86cd799439011', role: 'admin', sessionVersion: 3 });
  const payload = readSessionToken(token);

  assert.deepEqual({ sub: payload?.sub, role: payload?.role, sv: payload?.sv }, { sub: '507f1f77bcf86cd799439011', role: 'admin', sv: 3 });
  assert.ok((payload?.exp ?? 0) > Date.now());
});

test('tampering with a signed session token invalidates it', () => {
  const token = createSessionToken({ userId: '507f1f77bcf86cd799439011', role: 'vendor', sessionVersion: 0 });
  assert.equal(readSessionToken(`${token.slice(0, -1)}x`), null);
});
