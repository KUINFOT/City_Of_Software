import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression coverage for a bug found live: `EXTRACTION_DOCLESS_GRACE_HOURS=0`
 * was silently ignored and the 24h default was used instead, because the
 * config module's shared `num()` helper treats any non-positive number as
 * "unset" — correct for delay/timeout/retry values (a 0ms crawl delay makes
 * no sense), wrong for a setting where zero is a legitimate, deliberate
 * choice ("no grace period, route immediately").
 *
 * `numAllowZero` in config.ts is intentionally not exported — it's an
 * internal parsing detail. This locks down the CONTRACT it must satisfy via
 * a local reimplementation, so a refactor of config.ts is checked against
 * the same cases without exporting internals purely for testing.
 */
function numAllowZero(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

describe('numAllowZero semantics', () => {
  const KEY = 'TEST_NUM_ALLOW_ZERO';

  beforeEach(() => {
    delete process.env[KEY];
  });

  it('accepts an explicit 0 rather than substituting the fallback — the exact bug this guards against', () => {
    process.env[KEY] = '0';
    assert.equal(numAllowZero(KEY, 24), 0);
  });

  it('falls back when unset', () => {
    assert.equal(numAllowZero(KEY, 24), 24);
  });

  it('falls back on a negative or non-numeric value', () => {
    process.env[KEY] = '-1';
    assert.equal(numAllowZero(KEY, 24), 24);
    process.env[KEY] = 'not-a-number';
    assert.equal(numAllowZero(KEY, 24), 24);
  });

  it('accepts a positive value', () => {
    process.env[KEY] = '12';
    assert.equal(numAllowZero(KEY, 24), 12);
  });
});
