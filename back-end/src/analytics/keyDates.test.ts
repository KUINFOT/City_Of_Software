import assert from 'node:assert/strict';
import test from 'node:test';
import { computeKeyDates } from './keyDates';

const TODAY = new Date('2026-09-14T00:00:00.000Z');

test('a null timeline field produces a null entry, never a guess', () => {
  const [announcement] = computeKeyDates({}, TODAY, 7);
  assert.equal(announcement.key, 'announcementDate');
  assert.equal(announcement.date, null);
  assert.equal(announcement.daysRemaining, null);
  assert.equal(announcement.isPast, false);
  assert.equal(announcement.isUrgent, false);
});

test('a future date outside the urgent window is neither past nor urgent', () => {
  const dates = computeKeyDates({ submissionDeadline: new Date('2026-10-14T00:00:00.000Z') }, TODAY, 7);
  const deadline = dates.find((d) => d.key === 'submissionDeadline')!;
  assert.equal(deadline.daysRemaining, 30);
  assert.equal(deadline.isPast, false);
  assert.equal(deadline.isUrgent, false);
});

test('exactly at the urgent-window boundary counts as urgent (inclusive)', () => {
  const dates = computeKeyDates({ submissionDeadline: new Date('2026-09-21T00:00:00.000Z') }, TODAY, 7);
  const deadline = dates.find((d) => d.key === 'submissionDeadline')!;
  assert.equal(deadline.daysRemaining, 7);
  assert.equal(deadline.isUrgent, true);
  assert.equal(deadline.isPast, false);
});

test('one day past the urgent window is not urgent', () => {
  const dates = computeKeyDates({ submissionDeadline: new Date('2026-09-22T00:00:00.000Z') }, TODAY, 7);
  const deadline = dates.find((d) => d.key === 'submissionDeadline')!;
  assert.equal(deadline.daysRemaining, 8);
  assert.equal(deadline.isUrgent, false);
});

test('a date in the past is flagged isPast and never isUrgent', () => {
  const dates = computeKeyDates({ submissionDeadline: new Date('2026-09-01T00:00:00.000Z') }, TODAY, 7);
  const deadline = dates.find((d) => d.key === 'submissionDeadline')!;
  assert.equal(deadline.daysRemaining, -13);
  assert.equal(deadline.isPast, true);
  assert.equal(deadline.isUrgent, false);
});

test('today itself (0 days remaining) is past-tense-free and urgent', () => {
  const dates = computeKeyDates({ submissionDeadline: TODAY }, TODAY, 7);
  const deadline = dates.find((d) => d.key === 'submissionDeadline')!;
  assert.equal(deadline.daysRemaining, 0);
  assert.equal(deadline.isPast, false);
  assert.equal(deadline.isUrgent, true);
});

test('returns all seven key-date slots in a stable order, even when the timeline is empty', () => {
  const dates = computeKeyDates(undefined, TODAY, 7);
  assert.deepEqual(
    dates.map((d) => d.key),
    [
      'announcementDate',
      'commentPeriodStart',
      'commentPeriodEnd',
      'clarificationMeetingDate',
      'submissionDeadline',
      'contractStartDate',
      'contractEndDate',
    ]
  );
});

test('an invalid Date value is treated the same as absent', () => {
  const dates = computeKeyDates({ submissionDeadline: new Date('not a date') }, TODAY, 7);
  const deadline = dates.find((d) => d.key === 'submissionDeadline')!;
  assert.equal(deadline.date, null);
  assert.equal(deadline.daysRemaining, null);
});
