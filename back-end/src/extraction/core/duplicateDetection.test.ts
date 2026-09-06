import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  budgetProximity,
  computeDuplicateScore,
  dateProximityDays,
  titleSimilarity,
} from './duplicateDetection';

describe('titleSimilarity', () => {
  it('scores identical titles at 1', () => {
    assert.equal(titleSimilarity('จ้างพัฒนาระบบสารสนเทศ', 'จ้างพัฒนาระบบสารสนเทศ'), 1);
  });

  it('scores unrelated titles near 0', () => {
    const score = titleSimilarity(
      'จ้างพัฒนาระบบสารสนเทศเพื่อการบริหารจัดการ',
      'ซื้อครุภัณฑ์คอมพิวเตอร์สำหรับสำนักงาน'
    );
    assert.ok(score < 0.3, `expected a low score, got ${score}`);
  });

  it('scores a real MOC republication pair (same notice, different sub-department feed) highly', () => {
    // Both rows carried this exact title in the real MOC feed, reposted per
    // sub-department — same phenomenon core/fingerprint.ts collapses
    // within one crawl run; here it's the cross-run/cross-record case.
    const title =
      'ขอเชิญร่วมแสดงความคิดเห็นต่อ(ร่าง) ประกาศ และร่างเอกสารประกวดราคาซื้อโครงการปรับปรุงห้องประชุม ' +
      '701, 702 ชั้น 7 และห้องประชุม 802 ชั้น 8 อาคารกรมการค้าต่างประเทศ ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์';
    assert.equal(titleSimilarity(title, title), 1);
  });

  it('handles empty strings without throwing', () => {
    assert.equal(titleSimilarity('', ''), 1);
    assert.equal(titleSimilarity('something', ''), 0);
  });
});

describe('budgetProximity / dateProximityDays — null-safety', () => {
  it('returns null when either budget is missing', () => {
    assert.equal(budgetProximity(1000, null), null);
    assert.equal(budgetProximity(undefined, 1000), null);
  });

  it('scores identical budgets at 1 and far-apart budgets near 0', () => {
    assert.equal(budgetProximity(1_000_000, 1_000_000), 1);
    const far = budgetProximity(100, 1_000_000)!;
    assert.ok(far < 0.01, `expected near-zero, got ${far}`);
  });

  it('returns null when either date is missing', () => {
    assert.equal(dateProximityDays(new Date(), null), null);
  });

  it('computes the absolute day gap', () => {
    const a = new Date('2026-08-01T00:00:00Z');
    const b = new Date('2026-08-04T00:00:00Z');
    assert.equal(dateProximityDays(a, b), 3);
  });
});

describe('computeDuplicateScore', () => {
  it('scores a clear duplicate (same agency, same reference, near-identical title, close budget/date) highly', () => {
    const result = computeDuplicateScore({
      titleA: 'จ้างพัฒนาระบบสารสนเทศเพื่อการบริหารจัดการองค์กร ประจำปีงบประมาณ 2569',
      titleB: 'จ้างพัฒนาระบบสารสนเทศเพื่อการบริหารจัดการองค์กร ประจำปีงบประมาณ 2569',
      sameAgency: true,
      sameReferenceNumber: true,
      budgetA: 1_500_000,
      budgetB: 1_520_000,
      dateA: new Date('2026-08-01T00:00:00Z'),
      dateB: new Date('2026-08-02T00:00:00Z'),
    });
    assert.ok(result.score > 0.9, `expected a high score, got ${result.score}`);
  });

  it('scores a clear non-duplicate (different agency, unrelated title, no shared reference) low', () => {
    const result = computeDuplicateScore({
      titleA: 'จ้างพัฒนาระบบสารสนเทศเพื่อการบริหารจัดการองค์กร',
      titleB: 'ซื้อครุภัณฑ์ยานพาหนะสำหรับหน่วยงานภูมิภาค',
      sameAgency: false,
      sameReferenceNumber: false,
      budgetA: 1_500_000,
      budgetB: 8_000_000,
      dateA: new Date('2026-01-01T00:00:00Z'),
      dateB: new Date('2026-08-01T00:00:00Z'),
    });
    assert.ok(result.score < 0.3, `expected a low score, got ${result.score}`);
  });

  it('folds the budget weight into title similarity when budget is missing on either side, rather than just dropping it', () => {
    const withBudget = computeDuplicateScore({
      titleA: 'จ้างพัฒนาระบบ A',
      titleB: 'จ้างพัฒนาระบบ A',
      sameAgency: true,
      sameReferenceNumber: false,
      budgetA: 1_000_000,
      budgetB: 1_000_000,
      dateA: null,
      dateB: null,
    });
    const withoutBudget = computeDuplicateScore({
      titleA: 'จ้างพัฒนาระบบ A',
      titleB: 'จ้างพัฒนาระบบ A',
      sameAgency: true,
      sameReferenceNumber: false,
      budgetA: null,
      budgetB: null,
      dateA: null,
      dateB: null,
    });
    // Missing budget on both sides should not make an otherwise-identical
    // pair score noticeably lower than the same pair WITH matching budgets.
    assert.ok(
      Math.abs(withBudget.score - withoutBudget.score) < 0.05,
      `expected comparable scores, got ${withBudget.score} vs ${withoutBudget.score}`
    );
    assert.equal(withoutBudget.budgetProximity, null);
  });

  it('never exceeds a score of 1', () => {
    const result = computeDuplicateScore({
      titleA: 'exact match',
      titleB: 'exact match',
      sameAgency: true,
      sameReferenceNumber: true,
      budgetA: 100,
      budgetB: 100,
      dateA: new Date(),
      dateB: new Date(),
    });
    assert.ok(result.score <= 1);
  });
});
