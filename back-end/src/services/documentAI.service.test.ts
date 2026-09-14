import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractText } from './documentAI.service';

// These tests exercise the dev-mode fallback branch, which is also this
// repo's actual current state: GCP_PROJECT_ID is unset in .env, so
// gcpConfig.projectId === '' for every run of this suite, matching the
// condition documentAI.service.ts checks. If a future environment sets real
// GCP credentials before running tests, these assertions would need a
// dedicated dev-mode override — not attempted here, since there is nothing
// in this repo to test the real GCP path against anyway.
describe('documentAI.service — dev-mode fallback (no GCP credentials)', () => {
  it('returns zero confidence, never a guessed value', async () => {
    const result = await extractText(Buffer.from('hello'), 'application/pdf');
    assert.equal(result.confidence, 0);
    assert.ok(result.text.includes('[stub]'));
  });

  it('derives ocrUsed from the mime type', async () => {
    const pdf = await extractText(Buffer.from('x'), 'application/pdf');
    assert.equal(pdf.ocrUsed, true);

    const plain = await extractText(Buffer.from('x'), 'text/plain');
    assert.equal(plain.ocrUsed, false);

    const image = await extractText(Buffer.from('x'), 'image/jpeg');
    assert.equal(image.ocrUsed, true);
  });

  it('reports a page count so downstream code never divides by zero', async () => {
    const result = await extractText(Buffer.from('x'), 'application/pdf');
    assert.equal(result.pageCount, 1);
  });
});
