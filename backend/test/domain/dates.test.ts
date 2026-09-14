import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, isoDate, isoWeek } from '../../src/domain/dates.ts';
import { DomainError } from '../../src/domain/errors.ts';

describe('isoDate', () => {
  test('accepts a well-formed calendar date', () => {
    assert.equal(isoDate('2026-09-01'), '2026-09-01');
  });

  test('accepts a real leap day', () => {
    assert.equal(isoDate('2024-02-29'), '2024-02-29');
  });

  test('rejects a leap day in a non-leap year', () => {
    assert.throws(() => isoDate('2026-02-29'), (e: unknown) => e instanceof DomainError && e.code === 'invalid_date');
  });

  test('rejects a day that does not exist in the month', () => {
    assert.throws(() => isoDate('2026-04-31'), DomainError);
    assert.throws(() => isoDate('2026-02-30'), DomainError);
  });

  test('rejects out-of-range months and days', () => {
    assert.throws(() => isoDate('2026-13-01'), DomainError);
    assert.throws(() => isoDate('2026-00-10'), DomainError);
    assert.throws(() => isoDate('2026-01-00'), DomainError);
  });

  test('rejects anything that is not exactly YYYY-MM-DD', () => {
    for (const bad of ['2026-9-1', '01/09/2026', '2026-09-01T00:00:00Z', '', 'ayer', '2026-09-01 ']) {
      assert.throws(() => isoDate(bad), DomainError, `expected rejection of ${JSON.stringify(bad)}`);
    }
  });
});

describe('daysBetween', () => {
  test('is zero for the same day', () => {
    assert.equal(daysBetween(isoDate('2026-09-01'), isoDate('2026-09-01')), 0);
  });

  test('counts forward and backward symmetrically', () => {
    assert.equal(daysBetween(isoDate('2026-09-01'), isoDate('2026-09-08')), 7);
    assert.equal(daysBetween(isoDate('2026-09-08'), isoDate('2026-09-01')), -7);
  });

  test('crosses month and year boundaries', () => {
    assert.equal(daysBetween(isoDate('2026-08-31'), isoDate('2026-09-01')), 1);
    assert.equal(daysBetween(isoDate('2026-12-31'), isoDate('2027-01-01')), 1);
    assert.equal(daysBetween(isoDate('2026-01-01'), isoDate('2027-01-01')), 365);
  });

  test('counts the extra day in a leap year', () => {
    assert.equal(daysBetween(isoDate('2024-01-01'), isoDate('2025-01-01')), 366);
  });
});

describe('addDays', () => {
  test('moves forward across a month boundary', () => {
    assert.equal(addDays(isoDate('2026-08-31'), 1), '2026-09-01');
  });

  test('moves backward', () => {
    assert.equal(addDays(isoDate('2026-09-01'), -1), '2026-08-31');
  });

  test('round-trips with daysBetween for a full program', () => {
    const start = isoDate('2026-09-01');
    for (let offset = 0; offset <= 56; offset += 1) {
      assert.equal(daysBetween(start, addDays(start, offset)), offset);
    }
  });
});

describe('isoWeek', () => {
  // Reference values taken from Python's datetime.date.isocalendar(), not from memory.
  const vectors: ReadonlyArray<readonly [string, string]> = [
    ['2026-01-01', '2026-W01'], // Thursday, so week 1 of its own year
    ['2026-01-04', '2026-W01'],
    ['2026-01-05', '2026-W02'],
    ['2025-12-28', '2025-W52'],
    ['2025-12-29', '2026-W01'], // Monday belonging to the next ISO year
    ['2026-08-31', '2026-W36'],
    ['2026-09-01', '2026-W36'],
    ['2026-11-02', '2026-W45'],
    ['2026-12-31', '2026-W53'], // 2026 is a 53-week ISO year
    ['2027-01-01', '2026-W53'], // still the previous ISO year
    ['2027-01-03', '2026-W53'],
    ['2027-01-04', '2027-W01'],
    ['2020-12-31', '2020-W53'],
    ['2021-01-01', '2020-W53'],
    ['2024-02-29', '2024-W09'],
  ];

  for (const [date, expected] of vectors) {
    test(`${date} is ${expected}`, () => {
      assert.equal(isoWeek(isoDate(date)), expected);
    });
  }

  test('is constant across the seven days of one week', () => {
    const monday = isoDate('2026-11-02');
    const weeks = new Set(
      Array.from({ length: 7 }, (_, offset) => isoWeek(addDays(monday, offset))),
    );
    assert.deepEqual([...weeks], ['2026-W45']);
  });

  test('changes on Monday, not on Sunday', () => {
    assert.equal(isoWeek(isoDate('2026-11-08')), '2026-W45'); // Sunday
    assert.equal(isoWeek(isoDate('2026-11-09')), '2026-W46'); // Monday
  });

  test('always pads the week number to two digits', () => {
    assert.equal(isoWeek(isoDate('2026-01-05')), '2026-W02');
  });
});
