import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EXTRACTED_FIELD_KEYS, EXTRACTION_PROMPT_VERSION, emptyExtraction } from './fieldSchema';

describe('extracted field schema', () => {
  it('has no duplicate keys', () => {
    assert.equal(new Set(EXTRACTED_FIELD_KEYS).size, EXTRACTED_FIELD_KEYS.length);
  });

  it('has no dotted keys — Mongoose Map keys cannot contain "."', () => {
    for (const key of EXTRACTED_FIELD_KEYS) {
      assert.ok(!key.includes('.'), `field key "${key}" contains a dot`);
    }
  });

  it('covers FR-EXT-02s field list exactly (16 fields)', () => {
    assert.equal(EXTRACTED_FIELD_KEYS.length, 16);
  });

  it('carries a prompt version marker', () => {
    assert.ok(EXTRACTION_PROMPT_VERSION.length > 0);
  });

  it('builds an all-null, zero-confidence result as the safe default', () => {
    const result = emptyExtraction('placeholder summary', 'th');
    assert.equal(result.overallConfidence, 0);
    assert.equal(result.language, 'th');
    assert.equal(result.discardedFields.length, 0);
    for (const key of EXTRACTED_FIELD_KEYS) {
      assert.equal(result.fields[key].value, null);
      assert.equal(result.fields[key].confidence, 0);
      assert.equal(result.fields[key].evidence, null);
    }
  });
});
