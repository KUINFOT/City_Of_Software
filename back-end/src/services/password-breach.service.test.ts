import assert from 'node:assert/strict';
import test from 'node:test';
import { isPasswordBreached, screenPassword } from './password-breach.service';

test('checks only a SHA-1 prefix and finds a breached password locally in the range response', async () => {
  let requestedUrl = '';
  let requestHeaders: HeadersInit | undefined;
  const breached = await isPasswordBreached('password', async (url, init) => {
    requestedUrl = url;
    requestHeaders = init?.headers;
    return new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:46658894\r\n', { status: 200 });
  });

  assert.equal(breached, true);
  assert.equal(requestedUrl, 'https://api.pwnedpasswords.com/range/5BAA6');
  assert.equal(new Headers(requestHeaders).get('add-padding'), 'true');
  assert.equal(new URL(requestedUrl).search, '');
  assert.equal(new URL(requestedUrl).pathname, '/range/5BAA6');
});

test('accepts an absent hash suffix and fails closed when the range service is unavailable', async () => {
  assert.equal(await isPasswordBreached('unique-password', async () => new Response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\n', { status: 200 })), false);
  assert.equal(await screenPassword('unique-password', async () => new Response('', { status: 503 })), 'unavailable');
});
