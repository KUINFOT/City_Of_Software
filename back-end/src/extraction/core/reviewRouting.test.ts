import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decideRouting } from './reviewRouting';

const baseCfg = { reviewThreshold: 0.75, autoPublishThreshold: 0.92 };

describe('decideRouting (BR-03 / TBD-01)', () => {
  it('routes to pending_review below the review threshold, regardless of auto-publish settings', () => {
    assert.equal(decideRouting(0.5, { ...baseCfg, autoPublishEnabled: false }), 'pending_review');
    assert.equal(decideRouting(0.5, { ...baseCfg, autoPublishEnabled: true }), 'pending_review');
  });

  it("routes to pending_review above both thresholds when auto-publish is the DEFAULT (disabled) — proves TBD-01's conservative default in code", () => {
    assert.equal(decideRouting(0.99, { ...baseCfg, autoPublishEnabled: false }), 'pending_review');
  });

  it('only publishes when explicitly enabled AND above both thresholds', () => {
    assert.equal(decideRouting(0.95, { ...baseCfg, autoPublishEnabled: true }), 'published');
  });

  it('does not publish when enabled but only above the review threshold, not the stricter auto-publish one', () => {
    assert.equal(decideRouting(0.8, { ...baseCfg, autoPublishEnabled: true }), 'pending_review');
  });

  it('is defensive against a misconfigured auto-publish threshold below the review threshold', () => {
    // If autoPublishThreshold were ever set lower than reviewThreshold, the
    // stricter (review) threshold must still govern.
    const misconfigured = { reviewThreshold: 0.9, autoPublishThreshold: 0.5, autoPublishEnabled: true };
    assert.equal(decideRouting(0.6, misconfigured), 'pending_review');
    assert.equal(decideRouting(0.95, misconfigured), 'published');
  });

  it('treats a score exactly at both thresholds as clearing them (inclusive bounds)', () => {
    assert.equal(decideRouting(0.92, { ...baseCfg, autoPublishEnabled: true }), 'published');
  });

  it('isAwarded: true blocks auto-publish even at a perfect score', () => {
    assert.equal(decideRouting(1, { ...baseCfg, autoPublishEnabled: true }, true), 'pending_review');
  });

  it('isAwarded: false or null does not block an otherwise-publishable record', () => {
    assert.equal(decideRouting(0.95, { ...baseCfg, autoPublishEnabled: true }, false), 'published');
    assert.equal(decideRouting(0.95, { ...baseCfg, autoPublishEnabled: true }, null), 'published');
  });
});
