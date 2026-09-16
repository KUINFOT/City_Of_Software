import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVendorProfileUpdate } from './vendorProfile.controller';

test('vendor profile normalises capabilities and derives total contract value', () => {
  const profile = buildVendorProfileUpdate({
    organizationType: 'company',
    companyName: '  City Software Co.  ',
    techStack: ['React', ' React ', 'Node.js'],
    serviceCategories: ['Data platform'],
    yearsExperience: 7,
    teamSize: 12,
    certifications: [{ name: ' ISO 27001 ', issuer: 'TISI' }],
    pastContracts: [
      { projectTitle: 'Open data portal', agencyName: 'BMA', contractValueThb: 1_200_000, year: 2025 },
      { projectTitle: 'Citizen app', contractValueThb: 800_000 },
    ],
  });

  assert.deepEqual(profile.techStack, ['React', 'Node.js']);
  assert.equal(profile.companyName, 'City Software Co.');
  assert.equal(profile.totalContractValueThb, 2_000_000);
  assert.deepEqual(profile.certifications, [{ name: 'ISO 27001', issuer: 'TISI' }]);
});

test('vendor profile requires a capability for future matching', () => {
  assert.throws(
    () => buildVendorProfileUpdate({ organizationType: 'freelancer', companyName: '', techStack: [], serviceCategories: [] }),
    /at least one technology or service category/
  );
});

test('vendor profile rejects incomplete past contracts', () => {
  assert.throws(
    () => buildVendorProfileUpdate({ organizationType: 'freelancer', techStack: ['Flutter'], pastContracts: [{ projectTitle: '', contractValueThb: -1 }] }),
    /past contract/i
  );
});
