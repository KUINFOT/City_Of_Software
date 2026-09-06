/**
 * Regression tests for the parsing core.
 *
 * Uses Node's built-in test runner (`node --test`), so there is no test
 * framework dependency to install. Run with `npm test`.
 *
 * Scope is deliberate: every case here is either a rule the playbook calls out
 * or a bug that actually shipped and was caught during the port. This file is
 * not trying to be exhaustive — it is trying to stop known failures coming
 * back, because all of them were silent rather than loud.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classify, PRE_AWARD_STAGES } from './awardStatus';
import {
  beToCe,
  parseThaiCurrency,
  parseThaiDate,
  parseThaiDateRange,
  splitLeadingThaiDate,
  windowStatus,
} from './thaiDate';
import { canonicalUrl, groupRepublications, normalizeTitle, stripBoilerplateAttachments } from './fingerprint';
import { isPdfUrl } from './html';
import type { RawListing } from '../types';

/* ------------------------------------------------------------- classifier */

describe('award-status classifier', () => {
  it('checks cancellations before bidding, so a cancelled tender is not "open"', () => {
    assert.equal(classify('ยกเลิกประกาศประกวดราคาจ้างก่อสร้าง').stage, 'cancelled');
  });

  it('checks winners before bidding, since awards name the bidding method', () => {
    assert.equal(
      classify('ประกาศผู้ชนะการเสนอราคา จ้างที่ปรึกษา ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์').stage,
      'awarded'
    );
  });

  it('checks price disclosures before bidding — the ITD collision', () => {
    // These titles almost always name the bidding method in passing.
    assert.equal(
      classify('ราคากลางจ้างจัดกิจกรรม ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)').stage,
      'price_reference'
    );
  });

  it('does not mistake a DRAFT contract for a signed one', () => {
    assert.equal(classify('ร่างสัญญาจ้างพัฒนาระบบ').stage, 'draft_tor');
    assert.equal(classify('สาระสำคัญในสัญญาจ้างพัฒนาระบบ').stage, 'awarded');
  });

  it('reports an unmatched title as unknown, never as "not awarded"', () => {
    const verdict = classify('จ้างเหมาบริการโดยวิธีเฉพาะเจาะจง');
    assert.equal(verdict.stage, 'other');
    // The distinction the whole pipeline rests on.
    assert.equal(verdict.isAwarded, null);
    assert.notEqual(verdict.isAwarded, false);
  });

  it('marks only awarded as awarded, and keeps other matched stages false', () => {
    assert.equal(classify('ประกาศผู้ชนะ').isAwarded, true);
    assert.equal(classify('ร่างขอบเขตของงาน (TOR)').isAwarded, false);
  });

  it('records the signal strength it was given', () => {
    assert.equal(classify('ราคากลาง').signal, 'title_keyword');
    assert.equal(classify('ราคากลาง', 'doc_type').signal, 'doc_type');
  });

  it('treats only draft_tor, spec and bidding_open as actionable', () => {
    assert.deepEqual([...PRE_AWARD_STAGES].sort(), ['bidding_open', 'draft_tor', 'spec']);
  });
});

/* ------------------------------------------------------------------ dates */

describe('Thai date parsing', () => {
  it('converts Buddhist Era to CE', () => {
    assert.equal(beToCe(2569), 2026);
    assert.equal(beToCe(2026), 2026); // already CE, left alone
    assert.equal(beToCe(69), 2026); // 2-digit short BE
  });

  it('parses the Thai long form', () => {
    assert.equal(parseThaiDate('18 สิงหาคม 2569')?.toISOString().slice(0, 10), '2026-08-18');
  });

  it('parses the Thai abbreviated form with a CE year (DEPA)', () => {
    assert.equal(parseThaiDate('14 ส.ค. 2026')?.toISOString().slice(0, 10), '2026-08-14');
  });

  it('parses the English 2-digit-BE form — DGA publishes every row this way', () => {
    // Regression: a Thai-only parser returned null here, which silently
    // disabled the freshness check for the entire DGA source.
    assert.equal(parseThaiDate('27 Jul 69')?.toISOString().slice(0, 10), '2026-07-27');
    assert.equal(parseThaiDate('17 Oct 68')?.toISOString().slice(0, 10), '2025-10-17');
  });

  it('parses numeric and Thai-numeral forms', () => {
    assert.equal(parseThaiDate('19/08/2569')?.toISOString().slice(0, 10), '2026-08-19');
    assert.equal(parseThaiDate('๑๘ สิงหาคม ๒๕๖๙')?.toISOString().slice(0, 10), '2026-08-18');
  });

  it('returns null rather than inventing a date', () => {
    assert.equal(parseThaiDate(''), null);
    assert.equal(parseThaiDate('ไม่ระบุ'), null);
    assert.equal(parseThaiDate(undefined), null);
  });

  it('rejects impossible and implausible dates', () => {
    assert.equal(parseThaiDate('31 กุมภาพันธ์ 2569'), null); // no such day
    assert.equal(parseThaiDate('1 มกราคม 3000'), null); // out of range
  });

  it('splits a leading date off ITD packed anchor text', () => {
    const { dateText, rest } = splitLeadingThaiDate('26 มิถุนายน 2569 ราคากลาง จ้างจัดกิจกรรม');
    assert.equal(dateText, '26 มิถุนายน 2569');
    assert.equal(rest, 'ราคากลาง จ้างจัดกิจกรรม');
  });

  it('parses money, and distinguishes absent from zero', () => {
    assert.equal(parseThaiCurrency('1,500,000.00 บาท'), 1500000);
    assert.equal(parseThaiCurrency('ไม่ระบุ'), null);
  });
});

/* ---------------------------------------------------------- date ranges */

describe('comment-window ranges (MOC states these inside the title)', () => {
  it('parses a same-month range', () => {
    const r = parseThaiDateRange('...ระหว่างวันที่ 19 - 24 ส.ค. 2569');
    assert.ok(r);
    assert.equal(r.start.toISOString().slice(0, 10), '2026-08-19');
    assert.equal(r.end.toISOString().slice(0, 10), '2026-08-24');
  });

  it('tolerates the ragged spacing MOC actually publishes', () => {
    const r = parseThaiDateRange('...ระหว่างวันที่ 24 -29 มิ.ย. 69 และประกาศราคากลาง');
    assert.ok(r);
    assert.equal(r.start.toISOString().slice(0, 10), '2026-06-24');
    assert.equal(r.end.toISOString().slice(0, 10), '2026-06-29');
  });

  it('parses a cross-month range', () => {
    const r = parseThaiDateRange('ระหว่างวันที่ 28 ส.ค. - 3 ก.ย. 2569');
    assert.ok(r);
    assert.equal(r.start.toISOString().slice(0, 10), '2026-08-28');
    assert.equal(r.end.toISOString().slice(0, 10), '2026-09-03');
  });

  it('handles a range that wraps the new year', () => {
    const r = parseThaiDateRange('ระหว่างวันที่ 28 ธ.ค. - 3 ม.ค. 2569');
    assert.ok(r);
    assert.equal(r.start.toISOString().slice(0, 10), '2025-12-28');
    assert.equal(r.end.toISOString().slice(0, 10), '2026-01-03');
  });

  it('returns null rather than half a range', () => {
    assert.equal(parseThaiDateRange('ขอเชิญร่วมแสดงความคิดเห็น'), null);
  });
});

describe('window status', () => {
  const today = new Date('2026-08-20T00:00:00Z');
  const d = (s: string) => new Date(`${s}T00:00:00Z`);

  it('classifies open, upcoming and closed', () => {
    assert.equal(windowStatus(d('2026-08-19'), d('2026-08-24'), today), 'open');
    assert.equal(windowStatus(d('2026-08-25'), d('2026-08-30'), today), 'upcoming');
    assert.equal(windowStatus(d('2026-08-10'), d('2026-08-15'), today), 'closed');
    assert.equal(windowStatus(null, null, today), 'unknown');
  });

  it('counts the first and last day as open (inclusive bounds)', () => {
    assert.equal(windowStatus(d('2026-08-20'), d('2026-08-24'), today), 'open');
    assert.equal(windowStatus(d('2026-08-15'), d('2026-08-20'), today), 'open');
  });
});

/* ------------------------------------------------------------ identity */

describe('identity and de-duplication', () => {
  const listing = (over: Partial<RawListing>): RawListing => ({
    sourceId: 'itd',
    title: 'จ้างพัฒนาระบบ',
    detailUrl: 'https://example.go.th/a',
    stage: classify('ร่างขอบเขตของงาน'),
    attachments: [],
    ...over,
  });

  it('ignores cache-busting query strings when comparing URLs', () => {
    assert.equal(
      canonicalUrl('https://a.go.th/f.pdf?ver=2&timestamp=9'),
      canonicalUrl('http://a.go.th/f.pdf/')
    );
  });

  it('normalises whitespace and punctuation in titles', () => {
    assert.equal(normalizeTitle('จ้าง  พัฒนา (ระบบ)'), normalizeTitle('จ้าง พัฒนา ระบบ'));
  });

  it('drops an attachment that appears on every row of a batch', () => {
    // DGA links a site-wide policy PDF from every announcement's sidebar.
    const batch = [0, 1, 2].map((i) =>
      listing({
        title: `row ${i}`,
        attachments: [
          { url: 'https://a.go.th/policy.pdf' },
          { url: `https://a.go.th/tor-${i}.pdf` },
        ],
      })
    );
    stripBoilerplateAttachments(batch);
    assert.deepEqual(
      batch.map((l) => l.attachments.map((a) => a.url)),
      [
        ['https://a.go.th/tor-0.pdf'],
        ['https://a.go.th/tor-1.pdf'],
        ['https://a.go.th/tor-2.pdf'],
      ]
    );
  });

  it('leaves a single-row batch untouched — nothing to compare against', () => {
    const batch = [listing({ attachments: [{ url: 'https://a.go.th/only.pdf' }] })];
    stripBoilerplateAttachments(batch);
    assert.equal(batch[0].attachments.length, 1);
  });

  it('collapses the same notice reposted per sub-department (MOC)', () => {
    const date = new Date('2026-08-19T00:00:00Z');
    const rows = ['dept-a', 'dept-b', 'dept-c'].map((slug) =>
      listing({ detailUrl: `https://feed.example/${slug}`, announcedAt: date })
    );
    const { kept, duplicates } = groupRepublications(rows);
    assert.equal(kept.length, 1);
    assert.equal(duplicates.length, 2);
  });

  it('does NOT merge a TOR with its price disclosure — the ITD regression', () => {
    // Same project, same day, same title (ITD strips the doc type out of the
    // title). Merging these discarded the draft_tor row, which is the only
    // one a vendor can act on.
    const date = new Date('2026-06-26T00:00:00Z');
    const rows = [
      listing({
        detailUrl: 'https://itd/26062026-2/',
        announcedAt: date,
        docTypeLabel: 'รายละเอียดขอบเขตของงาน (TOR)',
        stage: classify('รายละเอียดขอบเขตของงาน (TOR)', 'doc_type'),
      }),
      listing({
        detailUrl: 'https://itd/26062026-3/',
        announcedAt: date,
        docTypeLabel: 'ราคากลาง',
        stage: classify('ราคากลาง', 'doc_type'),
      }),
    ];
    const { kept, duplicates } = groupRepublications(rows);
    assert.equal(kept.length, 2);
    assert.equal(duplicates.length, 0);
  });
});

/* ------------------------------------------------------------------ urls */

describe('PDF detection', () => {
  it('matches on the path, so a query string does not hide a real PDF', () => {
    // The 8MB draft announcement on dft.go.th was missed by naive matching.
    assert.equal(isPdfUrl('https://dft.go.th/a.pdf?ver=1&timestamp=2'), true);
    assert.equal(isPdfUrl('https://dft.go.th/a.PDF'), true);
    assert.equal(isPdfUrl('https://dft.go.th/a.html'), false);
  });
});
