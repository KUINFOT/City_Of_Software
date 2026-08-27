import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EXTRACTED_FIELD_KEYS } from '../extraction/core/fieldSchema';
import { decideRouting } from '../extraction/core/reviewRouting';
import { extractStructuredFields, summarize } from './gemini.service';

// Same rationale as documentAI.service.test.ts: GCP_PROJECT_ID is unset in
// this repo's .env, so these exercise the real (and currently only
// testable) fallback path.
describe('gemini.service — dev-mode fallback (no GCP credentials)', () => {
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
