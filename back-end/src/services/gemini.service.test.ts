import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { gcpConfig } from '../config/gcpConfig';
import { EXTRACTED_FIELD_KEYS } from '../extraction/core/fieldSchema';
import { decideRouting } from '../extraction/core/reviewRouting';
import { extractStructuredFields, summarize } from './gemini.service';

// Forces the dev-mode fallback path deterministically, regardless of
// whether the environment running this suite has a real GCP_PROJECT_ID
// configured (this repo's own .env does, once the pipeline was wired up to
// real credentials) — restored afterward so it never leaks into another
// suite. `gcpConfig` is a plain object (its `as const` typing is
// compile-time only), so mutating this shared instance's property is enough
// to change what gemini.service.ts itself sees.
describe('gemini.service — dev-mode fallback (no GCP credentials)', () => {
  const realProjectId = gcpConfig.projectId;
  before(() => {
    (gcpConfig as { projectId: string }).projectId = '';
  });
  after(() => {
    (gcpConfig as { projectId: string }).projectId = realProjectId;
  });

  it('summarize() returns a placeholder rather than throwing', async () => {
    const summary = await summarize('some document text');
    assert.ok(summary.includes('[stub]'));
  });

  it('extractStructuredFields() returns every field null at zero confidence — the safe default', async () => {
    const result = await extractStructuredFields('some document text');
    assert.equal(result.overallConfidence, 0);
    assert.equal(result.discardedFields.length, 0);
    for (const key of EXTRACTED_FIELD_KEYS) {
      assert.equal(result.fields[key].value, null);
      assert.equal(result.fields[key].confidence, 0);
    }
  });

  it('reports a language even with no credentials configured', async () => {
    const result = await extractStructuredFields('text', { language: 'th' });
    assert.equal(result.language, 'th');
  });

  it('the safe default always routes to pending_review, even with auto-publish enabled', async () => {
    const result = await extractStructuredFields('text');
    const routing = decideRouting(result.overallConfidence, {
      reviewThreshold: 0.75,
      autoPublishThreshold: 0.92,
      autoPublishEnabled: true,
    });
    assert.equal(routing, 'pending_review');
  });
});
