import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { asString, asNumber, asDate, asComplexity, asStringArray, coerceFieldValue } from './fieldCoercion';
import { EXTRACTED_FIELD_KEYS } from './fieldSchema';

describe('asString', () => {
  test('trims and keeps a real string', () => {
    assert.equal(asString('  hello  '), 'hello');
  });
  test('rejects whitespace-only and non-strings', () => {
    assert.equal(asString('   '), undefined);
    assert.equal(asString(42), undefined);
    assert.equal(asString(null), undefined);
  });
});

describe('asNumber', () => {
  test('parses a plain number', () => {
    assert.equal(asNumber(1500000), 1500000);
  });
  test('strips thousands separators and whitespace from a string', () => {
    assert.equal(asNumber('1,500,000'), 1500000);
    assert.equal(asNumber(' 42 '), 42);
  });
  test('rejects non-numeric input', () => {
    assert.equal(asNumber('not a number'), undefined);
    assert.equal(asNumber(NaN), undefined);
    assert.equal(asNumber(null), undefined);
  });
});

describe('asDate', () => {
  test('parses an ISO date string', () => {
    const d = asDate('2026-12-01');
    assert.ok(d instanceof Date);
    assert.equal(d?.toISOString().slice(0, 10), '2026-12-01');
  });
  test('passes through a valid Date instance', () => {
    const input = new Date('2026-01-01');
    assert.equal(asDate(input), input);
  });
  test('rejects an invalid date string, an invalid Date, and empty input', () => {
    assert.equal(asDate('not a date'), undefined);
    assert.equal(asDate(new Date('not a date')), undefined);
    assert.equal(asDate(''), undefined);
    assert.equal(asDate(undefined), undefined);
  });
});

describe('asComplexity', () => {
  test('accepts the three known values, case-insensitively', () => {
    assert.equal(asComplexity('Low'), 'low');
    assert.equal(asComplexity('MEDIUM'), 'medium');
    assert.equal(asComplexity('high'), 'high');
  });
  test('rejects anything else', () => {
    assert.equal(asComplexity('extreme'), undefined);
    assert.equal(asComplexity(3), undefined);
  });
});

describe('asStringArray', () => {
  test('passes through a real array, trimming and dropping empties', () => {
    assert.deepEqual(asStringArray([' a ', 'b', '']), ['a', 'b']);
  });
  test('parses a JSON array string', () => {
    assert.deepEqual(asStringArray('["a","b"]'), ['a', 'b']);
  });
  test('falls back to a delimiter split when not JSON', () => {
    assert.deepEqual(asStringArray('a, b; c\nd'), ['a', 'b', 'c', 'd']);
  });
  test('rejects empty/non-string, non-array input', () => {
    assert.equal(asStringArray(''), undefined);
    assert.equal(asStringArray('   '), undefined);
    assert.equal(asStringArray(42), undefined);
  });
});

describe('coerceFieldValue', () => {
  test('routes every one of the 16 extracted-field keys to a usable coercer', () => {
    const sample: Record<string, unknown> = {
      title: 'A title',
      agency: 'An agency',
      referenceNumber: 'REF-1',
      procurementMethod: 'e_bidding',
      description: 'A description',
      requiredTechnologies: 'React, Node.js',
      deliverables: 'Design doc; Source code',
      timelineCommentClose: '2026-06-01',
      timelineClarificationMeeting: '2026-06-05',
      timelineSubmissionDeadline: '2026-06-15',
      timelineAnnouncement: '2026-05-01',
      qualificationRequirements: 'ISO 9001 certified',
      evaluationCriteria: 'Technical merit 70%, price 30%',
      budget: '1,500,000',
      keyRisks: 'Vendor lock-in, Thai-language support',
      estimatedComplexity: 'high',
    };
    for (const key of EXTRACTED_FIELD_KEYS) {
      const value = coerceFieldValue(key, sample[key]);
      assert.notEqual(value, undefined, `expected a coerced value for "${key}"`);
    }
  });

  test('is undefined for a value that fails its field-specific coercion', () => {
    assert.equal(coerceFieldValue('budget', 'not a number'), undefined);
    assert.equal(coerceFieldValue('estimatedComplexity', 'extreme'), undefined);
    assert.equal(coerceFieldValue('timelineAnnouncement', 'not a date'), undefined);
    assert.equal(coerceFieldValue('title', ''), undefined);
  });
});
