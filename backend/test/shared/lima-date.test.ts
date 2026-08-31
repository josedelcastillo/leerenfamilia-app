import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { limaDate } from '../../src/shared/lima-date.ts';

describe('limaDate', () => {
  test('a late-night enrolment in Lima belongs to that day, not the next', () => {
    // 23:00 in Lima is 04:00 UTC the following day. Using the UTC date would shift this family's
    // programme week by one for the whole eight weeks.
    assert.equal(limaDate(new Date('2026-09-16T04:00:00.000Z')), '2026-09-15');
    assert.equal(limaDate(new Date('2026-09-16T04:59:59.000Z')), '2026-09-15');
  });

  test('the Lima day rolls over at 05:00 UTC', () => {
    assert.equal(limaDate(new Date('2026-09-16T05:00:00.000Z')), '2026-09-16');
  });

  test('midday agrees with the UTC date', () => {
    assert.equal(limaDate(new Date('2026-09-15T17:00:00.000Z')), '2026-09-15');
  });

  test('handles month and year boundaries', () => {
    assert.equal(limaDate(new Date('2027-01-01T04:00:00.000Z')), '2026-12-31');
    assert.equal(limaDate(new Date('2026-09-01T04:30:00.000Z')), '2026-08-31');
  });

  test('returns a validated calendar date', () => {
    assert.match(limaDate(new Date('2026-02-28T12:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
  });
});
