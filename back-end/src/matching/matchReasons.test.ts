import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeMatchReasons, type TorMatchLike, type VendorMatchProfileLike } from './matchReasons';

const tor: TorMatchLike = {
  title: 'ระบบเฝ้าระวังน้ำท่วมด้วยกล้อง CCTV',
  technologies: ['React', 'Node.js'],
  projectType: 'web_application',
  budget: { amountThb: 5_000_000 },
  agencyId: 'agency-1',
  agencyName: 'สำนักงานเขตสาทร',
};

describe('computeMatchReasons — no vendor profile', () => {
  test('returns no reasons and score 0', () => {
    const result = computeMatchReasons(tor, null);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.score, 0);
  });
});

describe('computeMatchReasons — full match', () => {
  test('matches on all five dimensions and scores 1', () => {
    const profile: VendorMatchProfileLike = {
      techStack: ['react', 'express'],
      interests: {
        projectTypes: ['web_application'],
        technologies: ['node.js'],
        budgetRange: { minThb: 1_000_000, maxThb: 10_000_000 },
        agencyIds: ['agency-1'],
        keywords: ['น้ำท่วม'],
      },
    };
    const result = computeMatchReasons(tor, profile);
    assert.equal(result.score, 1);
    assert.deepEqual(
      result.reasons.map((r) => r.type).sort(),
      ['agency', 'budget', 'keyword', 'project_type', 'technology']
    );
  });
});

describe('computeMatchReasons — keyword', () => {
  test('matches when a followed keyword appears in the TOR title', () => {
    const profile: VendorMatchProfileLike = { interests: { keywords: ['CCTV'] } };
    const result = computeMatchReasons(tor, profile);
    assert.ok(result.reasons.some((r) => r.type === 'keyword'));
  });

  test('matches case-insensitively', () => {
    const profile: VendorMatchProfileLike = { interests: { keywords: ['cctv'] } };
    const result = computeMatchReasons(tor, profile);
    assert.ok(result.reasons.some((r) => r.type === 'keyword'));
  });

  test('does not match when no followed keyword appears in the title', () => {
    const profile: VendorMatchProfileLike = { interests: { keywords: ['ถนน'] } };
    const result = computeMatchReasons(tor, profile);
    assert.ok(!result.reasons.some((r) => r.type === 'keyword'));
  });

  test('leaves keyword uncompared when the TOR has no title', () => {
    const profile: VendorMatchProfileLike = { interests: { keywords: ['CCTV'] } };
    const result = computeMatchReasons({ ...tor, title: null }, profile);
    assert.ok(!result.reasons.some((r) => r.type === 'keyword'));
  });
});

describe('computeMatchReasons — technology', () => {
  test('matches case-insensitively across techStack and interests.technologies', () => {
    const profile: VendorMatchProfileLike = { techStack: ['REACT'] };
    const result = computeMatchReasons(tor, profile);
    assert.ok(result.reasons.some((r) => r.type === 'technology'));
  });

  test('no overlap produces no technology reason', () => {
    const profile: VendorMatchProfileLike = { techStack: ['php', 'laravel'] };
    const result = computeMatchReasons(tor, profile);
    assert.ok(!result.reasons.some((r) => r.type === 'technology'));
  });
});

describe('computeMatchReasons — project type', () => {
  test('a project type the TOR does not state is left uncompared, not treated as a miss', () => {
    const profile: VendorMatchProfileLike = { interests: { projectTypes: ['web_application'] } };
    const result = computeMatchReasons({ ...tor, projectType: null }, profile);
    assert.ok(!result.reasons.some((r) => r.type === 'project_type'));
  });
});

describe('computeMatchReasons — budget', () => {
  test('matches with only minThb set on the range', () => {
    const profile: VendorMatchProfileLike = { interests: { budgetRange: { minThb: 1_000_000 } } };
    const result = computeMatchReasons(tor, profile);
    assert.ok(result.reasons.some((r) => r.type === 'budget'));
  });

  test('matches with only maxThb set on the range', () => {
    const profile: VendorMatchProfileLike = { interests: { budgetRange: { maxThb: 10_000_000 } } };
    const result = computeMatchReasons(tor, profile);
    assert.ok(result.reasons.some((r) => r.type === 'budget'));
  });

  test('a TOR budget outside the declared range does not match', () => {
    const profile: VendorMatchProfileLike = { interests: { budgetRange: { minThb: 10_000_000, maxThb: 20_000_000 } } };
    const result = computeMatchReasons(tor, profile);
    assert.ok(!result.reasons.some((r) => r.type === 'budget'));
  });

  test('a TOR with no budget amount is left uncompared', () => {
    const profile: VendorMatchProfileLike = { interests: { budgetRange: { minThb: 0, maxThb: 10_000_000 } } };
    const result = computeMatchReasons({ ...tor, budget: null }, profile);
    assert.ok(!result.reasons.some((r) => r.type === 'budget'));
  });
});

describe('computeMatchReasons — agency', () => {
  test('matches by id equality regardless of underlying type (ObjectId-like vs string)', () => {
    const profile: VendorMatchProfileLike = { interests: { agencyIds: [{ toString: () => 'agency-1' }] } };
    const result = computeMatchReasons(tor, profile);
    assert.ok(result.reasons.some((r) => r.type === 'agency'));
  });

  test('a TOR with no agencyId is left uncompared', () => {
    const profile: VendorMatchProfileLike = { interests: { agencyIds: ['agency-1'] } };
    const result = computeMatchReasons({ ...tor, agencyId: undefined }, profile);
    assert.ok(!result.reasons.some((r) => r.type === 'agency'));
  });
});

describe('computeMatchReasons — score', () => {
  test('is an equal-weighted fraction of the matched dimensions', () => {
    const profile: VendorMatchProfileLike = { techStack: ['react'] };
    const result = computeMatchReasons(tor, profile);
    assert.equal(result.score, 0.2);
  });
});
