import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { gcpConfig } from '../config/gcpConfig';
import { extractText } from './documentAI.service';

// These tests exercise the dev-mode fallback branch. This repo's .env now
// carries real GCP credentials (wired up once the pipeline moved past dev-
// mode), so gcpConfig.projectId is forced back to '' for this suite's
// duration and restored after — the "dedicated dev-mode override" this
// comment used to say wasn't needed yet. `gcpConfig` is a plain object (its
// `as const` typing is compile-time only), so mutating this shared
// instance's property is enough to change what documentAI.service.ts itself
// sees.
describe('documentAI.service — dev-mode fallback (no GCP credentials)', () => {
  const realProjectId = gcpConfig.projectId;
  before(() => {
    (gcpConfig as { projectId: string }).projectId = '';
  });
  after(() => {
    (gcpConfig as { projectId: string }).projectId = realProjectId;
  });

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
