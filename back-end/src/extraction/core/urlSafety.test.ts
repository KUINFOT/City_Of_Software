import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeExternalUrl, isPublicAddress, UnsafeExternalUrlError } from './urlSafety';
import { HttpClient } from './httpClient';

describe('outbound URL safety', () => {
  it('rejects private, loopback, link-local, and documentation addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.1.1',
      '100.64.0.1',
      '192.0.2.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '2001:db8::1',
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it('allows normal public IPv4 and IPv6 addresses', () => {
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  });

  it('rejects unsafe schemes, credential-bearing URLs, local hosts, and arbitrary ports', async () => {
    const publicResolver = async () => ['93.184.216.34'];
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com/file',
      'http://user:pass@example.com/',
      'http://localhost/',
      'http://example.com:8080/',
    ]) {
      await assert.rejects(() => assertSafeExternalUrl(url, publicResolver), UnsafeExternalUrlError);
    }
  });

  it('rejects a hostname when any DNS answer is non-public', async () => {
    await assert.rejects(
      () => assertSafeExternalUrl('https://documents.example/', async () => ['93.184.216.34', '10.0.0.7']),
      /non-public address/
    );
  });

  it('accepts a public HTTPS destination on its standard port', async () => {
    const url = await assertSafeExternalUrl('https://documents.example/report.pdf', async () => ['93.184.216.34']);
    assert.equal(url.hostname, 'documents.example');
  });

  it('validates redirect destinations before making the next request', async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(input.toString());
      return new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/admin' },
      });
    }) as typeof fetch;

    try {
      const client = new HttpClient({ respectRobots: false, delayMs: 0, maxRetries: 0 });
      await assert.rejects(() => client.getText('https://8.8.8.8/listing'), UnsafeExternalUrlError);
      assert.deepEqual(requests, ['https://8.8.8.8/listing']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
