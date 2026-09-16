import assert from 'node:assert/strict';
import test from 'node:test';
import { computeProfileCompleteness } from './vendor-profile-completeness.service';

const completeCompany = {
  organizationType: 'company', companyName: 'Acme', techStack: ['React'], serviceCategories: ['Web'],
  yearsExperience: 4, certifications: [{ name: 'ISO' }], pastContracts: [{ projectTitle: 'Portal' }],
};

test('calculates 100 percent for a complete company profile', () => {
  const result = computeProfileCompleteness(completeCompany);
  assert.equal(result.score, 100);
  assert.deepEqual(result.missingFields, []);
});

test('does not require a company name for freelancers', () => {
  const result = computeProfileCompleteness({ ...completeCompany, organizationType: 'freelancer', companyName: '' });
  assert.equal(result.score, 100);
  assert.equal(result.totalWeight, 90);
});

test('identifies matching signals that are absent', () => {
  const result = computeProfileCompleteness({ organizationType: 'company', companyName: 'Acme', techStack: [], serviceCategories: [] });
  assert.ok(result.score < 100);
  assert.ok(result.missingFields.map((field) => field.key).includes('techStack'));
  assert.ok(result.missingFields.map((field) => field.key).includes('serviceCategories'));
  assert.ok(result.missingFields.map((field) => field.key).includes('yearsExperience'));
});
