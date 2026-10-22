import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAnalyticsFilters } from './analyticsFilters';

const VALID_ID = '64b7f0c2a1b2c3d4e5f60718';

describe('parseAnalyticsFilters', () => {
  it('accepts an empty query as "no filters"', () => {
    assert.deepEqual(parseAnalyticsFilters({}), { ok: true, filters: {} });
  });

  it('accepts every filter together', () => {
    const result = parseAnalyticsFilters({ agencyId: VALID_ID, projectType: 'web_application', yearFrom: '2022', yearTo: '2025' });
    assert.deepEqual(result, { ok: true, filters: { agencyId: VALID_ID, projectType: 'web_application', yearFrom: 2022, yearTo: 2025 } });
  });

  it('treats blank values as absent', () => {
    assert.deepEqual(parseAnalyticsFilters({ agencyId: '', projectType: '  ', yearFrom: '' }), { ok: true, filters: {} });
  });

  it('takes the first value when a parameter is repeated', () => {
    const result = parseAnalyticsFilters({ projectType: ['it_system', 'other'] });
    assert.deepEqual(result, { ok: true, filters: { projectType: 'it_system' } });
  });

  it('rejects an agency id that is not an ObjectId', () => {
    assert.equal(parseAnalyticsFilters({ agencyId: 'nope' }).ok, false);
    assert.equal(parseAnalyticsFilters({ agencyId: { $ne: null } }).ok, false);
  });

  it('rejects an unknown project type', () => {
    assert.equal(parseAnalyticsFilters({ projectType: 'hardware' }).ok, false);
  });

  it('rejects years that are not whole, plausible Gregorian years', () => {
    assert.equal(parseAnalyticsFilters({ yearFrom: '2025.5' }).ok, false);
    assert.equal(parseAnalyticsFilters({ yearFrom: 'abc' }).ok, false);
    assert.equal(parseAnalyticsFilters({ yearTo: '1999' }).ok, false);
    // A Buddhist-era year typed by mistake must fail loudly, not match nothing.
    assert.equal(parseAnalyticsFilters({ yearFrom: '2568' }).ok, false);
  });

  it('rejects a range that ends before it starts, and allows a single-year range', () => {
    assert.equal(parseAnalyticsFilters({ yearFrom: '2025', yearTo: '2024' }).ok, false);
    assert.equal(parseAnalyticsFilters({ yearFrom: '2025', yearTo: '2025' }).ok, true);
  });
});
