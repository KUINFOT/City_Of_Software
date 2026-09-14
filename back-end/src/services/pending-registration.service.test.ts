import assert from 'node:assert/strict';
import test from 'node:test';
import { createPendingRegistrationToken, readPendingRegistrationToken } from './pending-registration.service';

test('pending registration token round-trips without exposing its email', () => {
  const token = createPendingRegistrationToken({ name: 'Demo Vendor', organization: 'Demo Co.', email: 'demo@example.com', phone: '+66 800000000', role: 'vendor', passwordHash: 'scrypt$hash', profile: { organizationType: 'freelancer' } });
  const result = readPendingRegistrationToken(token);

  assert.equal(token.includes('demo@example.com'), false);
  assert.equal(result?.email, 'demo@example.com');
  assert.equal(result?.profile?.organizationType, 'freelancer');
});

test('pending registration token rejects tampering', () => {
  const token = createPendingRegistrationToken({ name: 'Demo', organization: 'Demo Co.', email: 'demo@example.com', phone: '+66 800000000', role: 'reviewer', passwordHash: 'scrypt$hash' });
  assert.equal(readPendingRegistrationToken(`${token.slice(0, -1)}x`), null);
});
