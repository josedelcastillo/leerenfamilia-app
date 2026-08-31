import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate } from '../../src/domain/dates.ts';
import {
  DEFAULT_ANCHOR_POLICY,
  DEFAULT_PROGRAM_WEEKS,
  hasFinished,
  programWeek,
  resolveAnchorDate,
  unlockedWeeks,
} from '../../src/domain/schedule.ts';

const ENROLLED = isoDate('2026-09-15');
const BORN = isoDate('2026-08-25'); // three weeks earlier

describe('resolveAnchorDate', () => {
  test('uses the enrolment date under the pilot policy', () => {
    assert.equal(
      resolveAnchorDate('enrollment_date', { enrollmentDate: ENROLLED, birthDate: BORN }),
      ENROLLED,
    );
  });

  test('uses the birth date when a program is configured that way', () => {
    assert.equal(
      resolveAnchorDate('birth_date', { enrollmentDate: ENROLLED, birthDate: BORN }),
      BORN,
    );
  });

  test('the pilot default is the enrolment date (D-003)', () => {
    assert.equal(DEFAULT_ANCHOR_POLICY, 'enrollment_date');
    assert.equal(
      resolveAnchorDate(DEFAULT_ANCHOR_POLICY, { enrollmentDate: ENROLLED, birthDate: BORN }),
      ENROLLED,
    );
  });
});

describe('programWeek', () => {
  test('the anchor day itself is week 1', () => {
    assert.equal(programWeek(ENROLLED, ENROLLED), 1);
  });

  test('week 1 spans seven days, day 6 included', () => {
    for (let day = 0; day <= 6; day += 1) {
      assert.equal(programWeek(ENROLLED, addDays(ENROLLED, day)), 1, `day ${day}`);
    }
  });

  test('day 7 starts week 2', () => {
    assert.equal(programWeek(ENROLLED, addDays(ENROLLED, 7)), 2);
  });

  test('every boundary from week 1 to week 9 lands where it should', () => {
    for (let week = 1; week <= 9; week += 1) {
      const firstDay = (week - 1) * 7;
      assert.equal(programWeek(ENROLLED, addDays(ENROLLED, firstDay)), week);
      assert.equal(programWeek(ENROLLED, addDays(ENROLLED, firstDay + 6)), week);
    }
  });

  test('day 55 is the last day of week 8 and day 56 is past the program', () => {
    assert.equal(programWeek(ENROLLED, addDays(ENROLLED, 55)), 8);
    assert.equal(programWeek(ENROLLED, addDays(ENROLLED, 56)), 9);
  });

  test('returns zero or less before the anchor instead of throwing', () => {
    // A timezone slip in the scheduler must skip a family, never crash the whole run.
    assert.equal(programWeek(ENROLLED, addDays(ENROLLED, -1)), 0);
    assert.equal(programWeek(ENROLLED, addDays(ENROLLED, -7)), 0);
    assert.equal(programWeek(ENROLLED, addDays(ENROLLED, -8)), -1);
  });

  test('two families enrolled on different days are in different weeks on the same day', () => {
    // The whole point of D-003: the calendar does not drive the program, the anchor does.
    const early = isoDate('2026-09-01');
    const late = isoDate('2026-09-22');
    const today = isoDate('2026-10-06');
    assert.equal(programWeek(early, today), 6);
    assert.equal(programWeek(late, today), 3);
  });
});

describe('hasFinished', () => {
  test('week 8 is still inside the default program and week 9 is not', () => {
    assert.equal(DEFAULT_PROGRAM_WEEKS, 8);
    assert.equal(hasFinished(8), false);
    assert.equal(hasFinished(9), true);
  });

  test('respects a program configured with a different length', () => {
    assert.equal(hasFinished(9, 12), false);
    assert.equal(hasFinished(13, 12), true);
  });
});

describe('unlockedWeeks', () => {
  test('opens everything up to the current week', () => {
    assert.deepEqual(unlockedWeeks(1), [1]);
    assert.deepEqual(unlockedWeeks(3), [1, 2, 3]);
  });

  test('never opens past the end of the program', () => {
    assert.deepEqual(unlockedWeeks(8), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(unlockedWeeks(12), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('opens nothing before the program starts', () => {
    assert.deepEqual(unlockedWeeks(0), []);
    assert.deepEqual(unlockedWeeks(-3), []);
  });

  test('a family that finished keeps access to every week', () => {
    // Content stays readable after week 8; only the weekly sends stop.
    assert.equal(unlockedWeeks(20).length, DEFAULT_PROGRAM_WEEKS);
  });
});
