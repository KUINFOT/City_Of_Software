import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { matchQualifications } from './qualificationMatch';

describe('matchQualifications — no requirements stated', () => {
  test('a Tor with no qualifications at all rolls up to no_requirements', () => {
    const result = matchQualifications({}, { totalContractValueThb: 1_000_000, yearsExperience: 5 });
    assert.deepEqual(result.requirements, []);
    assert.equal(result.overallStatus, 'no_requirements');
  });

  test('null qualifications behaves the same as an empty object', () => {
    const result = matchQualifications(null, null);
    assert.equal(result.overallStatus, 'no_requirements');
  });
});

describe('matchQualifications — certifications', () => {
  test('a held certification matches case-insensitively', () => {
    const result = matchQualifications(
      { requiredCertifications: ['ISO 9001'] },
      { certifications: [{ name: 'iso 9001' }] }
    );
    assert.equal(result.requirements[0].status, 'met');
    assert.equal(result.overallStatus, 'all_met');
  });

  test('a missing certification is not_met with a named gap, never worded as disqualifying', () => {
    const result = matchQualifications(
      { requiredCertifications: ['ISO 27001'] },
      { certifications: [{ name: 'ISO 9001' }] }
    );
    assert.equal(result.requirements[0].status, 'not_met');
    assert.match(result.requirements[0].gap ?? '', /ISO 27001/);
    assert.doesNotMatch(result.requirements[0].gap ?? '', /disqualif|ineligible|ไม่มีสิทธิ/i);
    assert.equal(result.overallStatus, 'gaps_found');
  });

  test('no vendor profile at all is undetermined, never guessed as not_met', () => {
    const result = matchQualifications({ requiredCertifications: ['ISO 9001'] }, null);
    assert.equal(result.requirements[0].status, 'undetermined');
    assert.equal(result.requirements[0].gap, null);
    assert.equal(result.overallStatus, 'undetermined');
  });

  test('multiple required certifications are each scored independently', () => {
    const result = matchQualifications(
      { requiredCertifications: ['ISO 9001', 'ISO 27001'] },
      { certifications: [{ name: 'ISO 9001' }] }
    );
    assert.equal(result.requirements.length, 2);
    assert.equal(result.requirements[0].status, 'met');
    assert.equal(result.requirements[1].status, 'not_met');
  });
});

describe('matchQualifications — contract value threshold', () => {
  test('a declared value at or above the threshold is met', () => {
    const result = matchQualifications(
      { minContractValueThb: 500_000 },
      { totalContractValueThb: 500_000 }
    );
    assert.equal(result.requirements[0].status, 'met');
  });

  test('a declared value below the threshold is not_met with the shortfall named', () => {
    const result = matchQualifications(
      { minContractValueThb: 1_000_000 },
      { totalContractValueThb: 250_000 }
    );
    assert.equal(result.requirements[0].status, 'not_met');
    assert.match(result.requirements[0].gap ?? '', /1,000,000/);
    assert.match(result.requirements[0].gap ?? '', /250,000/);
  });

  test('a profile that never declares totalContractValueThb is undetermined', () => {
    const result = matchQualifications({ minContractValueThb: 1_000_000 }, {});
    assert.equal(result.requirements[0].status, 'undetermined');
  });
});

describe('matchQualifications — experience years', () => {
  test('meeting the required years is met', () => {
    const result = matchQualifications({ requiredExperienceYears: 3 }, { yearsExperience: 5 });
    assert.equal(result.requirements[0].status, 'met');
  });

  test('falling short is not_met with both numbers named', () => {
    const result = matchQualifications({ requiredExperienceYears: 5 }, { yearsExperience: 2 });
    assert.equal(result.requirements[0].status, 'not_met');
    assert.match(result.requirements[0].gap ?? '', /5 ปี/);
    assert.match(result.requirements[0].gap ?? '', /2 ปี/);
  });
});

describe('matchQualifications — overallStatus rollup', () => {
  test('all dimensions met rolls up to all_met', () => {
    const result = matchQualifications(
      { requiredCertifications: ['ISO 9001'], minContractValueThb: 100, requiredExperienceYears: 1 },
      { certifications: [{ name: 'ISO 9001' }], totalContractValueThb: 200, yearsExperience: 2 }
    );
    assert.equal(result.overallStatus, 'all_met');
  });

  test('any not_met dominates, even alongside a met and an undetermined dimension', () => {
    const result = matchQualifications(
      // cert -> met, contract value -> not_met (200 < 1000), experience -> undetermined (undeclared)
      { requiredCertifications: ['ISO 9001'], minContractValueThb: 1000, requiredExperienceYears: 5 },
      { certifications: [{ name: 'ISO 9001' }], totalContractValueThb: 200 }
    );
    assert.equal(result.overallStatus, 'gaps_found');
  });

  test('undetermined-only (no not_met) rolls up to undetermined, not all_met', () => {
    const result = matchQualifications(
      { requiredCertifications: ['ISO 9001'], minContractValueThb: 100 },
      { certifications: [{ name: 'ISO 9001' }] }
    );
    assert.equal(result.overallStatus, 'undetermined');
  });
});
