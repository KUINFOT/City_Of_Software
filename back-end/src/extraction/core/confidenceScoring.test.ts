import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeOverallConfidence } from './confidenceScoring';
import { CORE_FIELD_KEYS, EXTRACTED_FIELD_KEYS, type ExtractedFieldKey } from './fieldSchema';

function fromRecord(record: Partial<Record<ExtractedFieldKey, number>>): (key: ExtractedFieldKey) => number {
  return (key) => record[key] ?? 0;
}

describe('computeOverallConfidence', () => {
  test('is 0 when nothing was found at all', () => {
    const result = computeOverallConfidence(fromRecord({}), EXTRACTED_FIELD_KEYS);
    assert.equal(result, 0);
  });

  test('all core fields found at 1.0, nothing optional found, scores 1.0', () => {
    const record: Partial<Record<ExtractedFieldKey, number>> = {};
    for (const key of CORE_FIELD_KEYS) record[key] = 1;
    const result = computeOverallConfidence(fromRecord(record), EXTRACTED_FIELD_KEYS);
    assert.equal(result, 1);
  });

  test('a legitimately-absent optional field no longer caps confidence', () => {
    // Every core field grounded well; every optional field genuinely absent
    // (not in this document type) — should still read as a strong record,
    // not be dragged down by fields that were never going to be there.
    const record: Partial<Record<ExtractedFieldKey, number>> = {};
    for (const key of CORE_FIELD_KEYS) record[key] = 0.9;
    const result = computeOverallConfidence(fromRecord(record), EXTRACTED_FIELD_KEYS);
    assert.equal(result, 0.9);
  });

  test('losing one CORE field costs more than losing one optional field', () => {
    const full: Partial<Record<ExtractedFieldKey, number>> = {};
    for (const key of EXTRACTED_FIELD_KEYS) full[key] = 1;

    const missingOneCore = { ...full, [CORE_FIELD_KEYS[0]]: 0 };
    const missingOneOptional = { ...full, keyRisks: 0 };

    const scoreMissingCore = computeOverallConfidence(fromRecord(missingOneCore), EXTRACTED_FIELD_KEYS);
    const scoreMissingOptional = computeOverallConfidence(fromRecord(missingOneOptional), EXTRACTED_FIELD_KEYS);

    assert.ok(
      scoreMissingCore < scoreMissingOptional,
      'losing one core field should hurt more than losing one optional field'
    );
  });

  test('finding an optional field still helps the average, not just core ones', () => {
    const coreOnly: Partial<Record<ExtractedFieldKey, number>> = {};
    for (const key of CORE_FIELD_KEYS) coreOnly[key] = 0.6;
    const withoutBonus = computeOverallConfidence(fromRecord(coreOnly), EXTRACTED_FIELD_KEYS);

    const coreAndOneOptional = { ...coreOnly, keyRisks: 1 };
    const withBonus = computeOverallConfidence(fromRecord(coreAndOneOptional), EXTRACTED_FIELD_KEYS);

    assert.ok(withBonus > withoutBonus, 'an extra grounded optional field should raise the average');
  });
});
