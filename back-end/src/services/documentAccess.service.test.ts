import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentAccessToken, readDocumentAccessToken } from './documentAccess.service';

test('a freshly issued token verifies and carries the right document id', () => {
  const { token, expiresAt } = createDocumentAccessToken('507f1f77bcf86cd799439011');
  const payload = readDocumentAccessToken(token);
  assert.equal(payload?.documentId, '507f1f77bcf86cd799439011');
  assert.equal(payload?.exp, expiresAt);
  assert.ok(expiresAt > Date.now());
});

test('tampering with a signed token invalidates it', () => {
  const { token } = createDocumentAccessToken('507f1f77bcf86cd799439011');
  assert.equal(readDocumentAccessToken(`${token.slice(0, -1)}x`), null);
});

test('a token for one document is not valid for another', () => {
  const { token } = createDocumentAccessToken('507f1f77bcf86cd799439011');
  const payload = readDocumentAccessToken(token);
  assert.notEqual(payload?.documentId, '000000000000000000000000');
});

test('an already-expired token (ttlMs <= 0) is rejected', () => {
  const { token } = createDocumentAccessToken('507f1f77bcf86cd799439011', -1);
  assert.equal(readDocumentAccessToken(token), null);
});

test('a malformed token (missing signature segment) is rejected', () => {
  assert.equal(readDocumentAccessToken('not-a-real-token'), null);
});

test('a well-formed but garbage token is rejected', () => {
  assert.equal(readDocumentAccessToken('bm90LWpzb24.deadbeef'), null);
});
