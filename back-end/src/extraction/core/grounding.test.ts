import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { verifyGrounding } from './grounding';

describe('grounding check (FR-EXT-09 / NFR-DAT-03)', () => {
  const source = 'งบประมาณ 1,500,000 บาท สำหรับโครงการพัฒนาระบบสารสนเทศ ประจำปี 2569';

  it('passes on an exact substring', () => {
    assert.equal(verifyGrounding(source, 'งบประมาณ 1,500,000 บาท'), true);
  });

  it('passes on a whitespace/punctuation-normalised variant', () => {
    // Real-world OCR/model output rarely matches byte-for-byte — extra
    // spacing and a stray comma must not fail a genuine quote.
    assert.equal(verifyGrounding(source, 'งบประมาณ  1500000  บาท'), true);
  });

  it('fails on text that does not appear in the source', () => {
    assert.equal(verifyGrounding(source, 'งบประมาณ 9,999,999 บาท'), false);
  });

  it('fails on null or empty evidence, regardless of a claimed value', () => {
    assert.equal(verifyGrounding(source, null), false);
    assert.equal(verifyGrounding(source, ''), false);
    assert.equal(verifyGrounding(source, '   '), false);
  });

  it('fails against empty source text', () => {
    assert.equal(verifyGrounding('', 'anything'), false);
    assert.equal(verifyGrounding(undefined, 'anything'), false);
  });
});
