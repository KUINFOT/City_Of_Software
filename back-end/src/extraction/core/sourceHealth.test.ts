import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifySourceHealth, type RecentRunSummary } from './sourceHealth';

const TODAY = new Date('2026-08-31T00:00:00Z');
const OPTS = { blocked: false, today: TODAY, staleAfterDays: 60 };

function run(overrides: Partial<RecentRunSummary>): RecentRunSummary {
  return {
    status: 'success',
    hadErrors: false,
    startedAt: TODAY,
    newestAnnouncedAt: TODAY,
    torsFound: 10,
    ...overrides,
  };
}

describe('classifySourceHealth', () => {
  test('a blocked source is reported as "blocked", never as broken, even with no runs', () => {
    const h = classifySourceHealth([], { ...OPTS, blocked: true });
    assert.equal(h.health, 'blocked');
    assert.equal(h.neverRun, true);
  });

  test('a blocked source stays "blocked" even if it was run under an override', () => {
    const h = classifySourceHealth([run({ status: 'failed', hadErrors: true })], { ...OPTS, blocked: true });
    assert.equal(h.health, 'blocked');
  });

  test('a source that has never run is "unknown"', () => {
    const h = classifySourceHealth([], OPTS);
    assert.equal(h.health, 'unknown');
    assert.equal(h.neverRun, true);
  });

  test('a clean, fresh, error-free run is "healthy"', () => {
    const h = classifySourceHealth([run({})], OPTS);
    assert.equal(h.health, 'healthy');
    assert.equal(h.isStale, false);
    assert.equal(h.consecutiveErrorRuns, 0);
  });

  test('a stale newest-announcement date is flagged, even with a clean run', () => {
    const old = new Date(TODAY.getTime() - 90 * 86_400_000);
    const h = classifySourceHealth([run({ newestAnnouncedAt: old })], OPTS);
    assert.equal(h.health, 'stale');
    assert.equal(h.isStale, true);
    assert.equal(h.staleDays, 90);
  });

  test('one erroring run alone is "error" but does not need two to say so', () => {
    const h = classifySourceHealth([run({ status: 'partial', hadErrors: true })], OPTS);
    assert.equal(h.health, 'error');
    assert.equal(h.consecutiveErrorRuns, 1);
  });

  test('two or more consecutive erroring runs count a real streak', () => {
    const runs = [
      run({ status: 'partial', hadErrors: true, startedAt: new Date('2026-08-31') }),
      run({ status: 'partial', hadErrors: true, startedAt: new Date('2026-08-30') }),
      run({ status: 'success', hadErrors: false, startedAt: new Date('2026-08-29') }),
    ];
    const h = classifySourceHealth(runs, OPTS);
    assert.equal(h.consecutiveErrorRuns, 2);
    assert.equal(h.health, 'error');
  });

  test('a clean run breaks the error streak, even with older failures behind it', () => {
    const runs = [
      run({ status: 'success', hadErrors: false, startedAt: new Date('2026-08-31') }),
      run({ status: 'partial', hadErrors: true, startedAt: new Date('2026-08-30') }),
    ];
    const h = classifySourceHealth(runs, OPTS);
    assert.equal(h.consecutiveErrorRuns, 0);
    assert.equal(h.health, 'healthy');
  });

  test('a skipped run neither breaks nor extends the error streak', () => {
    const runs = [
      run({ status: 'skipped', hadErrors: false, startedAt: new Date('2026-08-31') }),
      run({ status: 'partial', hadErrors: true, startedAt: new Date('2026-08-30') }),
      run({ status: 'partial', hadErrors: true, startedAt: new Date('2026-08-29') }),
    ];
    const h = classifySourceHealth(runs, OPTS);
    assert.equal(h.consecutiveErrorRuns, 2);
  });

  test('rows found but zero parseable dates flags formatSuspected, and outranks staleness', () => {
    const h = classifySourceHealth([run({ torsFound: 12, newestAnnouncedAt: null })], OPTS);
    assert.equal(h.formatSuspected, true);
    assert.equal(h.health, 'format_suspected');
  });

  test('zero rows found and zero dates is not format-suspected — nothing to have a date at all', () => {
    const h = classifySourceHealth([run({ torsFound: 0, newestAnnouncedAt: null })], OPTS);
    assert.equal(h.formatSuspected, false);
  });

  test('lastSuccessAt looks past a recent failed run to the last real success', () => {
    const runs = [
      run({ status: 'failed', hadErrors: true, startedAt: new Date('2026-08-31'), newestAnnouncedAt: null }),
      run({ status: 'success', hadErrors: false, startedAt: new Date('2026-08-20'), newestAnnouncedAt: new Date('2026-08-19') }),
    ];
    const h = classifySourceHealth(runs, OPTS);
    assert.equal(h.lastSuccessAt?.toISOString(), new Date('2026-08-20').toISOString());
    assert.equal(h.newestAnnouncedAt?.toISOString(), new Date('2026-08-19').toISOString());
  });
});
