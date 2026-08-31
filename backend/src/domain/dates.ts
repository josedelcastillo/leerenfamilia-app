import { DomainError } from './errors.ts';

/**
 * A calendar date in `YYYY-MM-DD`, with no time and no zone.
 *
 * The program week is counted in calendar days in the pilot's timezone, not in elapsed instants.
 * A family enrolled at 23:00 in Lima is enrolled *that* day, even though it is already the next
 * day in UTC. Handlers convert "now" to a Lima calendar date at the edge; everything below this
 * line works on dates only and never reads a clock.
 */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Parses and validates a calendar date, rejecting well-formed but impossible dates like 2026-02-30. */
export function isoDate(value: string): IsoDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new DomainError('invalid_date', `Expected YYYY-MM-DD, received: ${value}`);
  }
  const [, year, month, day] = match as unknown as [string, string, string, string];
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const roundTrip = new Date(utc).toISOString().slice(0, 10);
  if (roundTrip !== value) {
    throw new DomainError('invalid_date', `Not a real calendar date: ${value}`);
  }
  return value as IsoDate;
}

function toUtcMillis(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/**
 * Whole days from `from` to `to`; negative when `to` precedes `from`.
 * Both ends are anchored at UTC midnight, so the result is exact regardless of month or year
 * boundaries. Peru observes no DST, but this arithmetic would survive it anyway.
 */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MS_PER_DAY);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMillis(date) + days * MS_PER_DAY).toISOString().slice(0, 10) as IsoDate;
}

/**
 * ISO-8601 week identifier, `YYYY-Www`. The year is the ISO week-numbering year, which is not
 * always the calendar year: 2027-01-01 belongs to 2026-W53.
 *
 * This is the idempotency key for the weekly send, so being off by one here would mean either a
 * duplicate charged message or a family that never hears from us that week.
 */
export function isoWeek(date: IsoDate): string {
  const thursday = new Date(toUtcMillis(date));
  // Shift to the Thursday of this week; the ISO year is whatever year that Thursday falls in.
  const dayIndex = (thursday.getUTCDay() + 6) % 7; // Monday = 0
  thursday.setUTCDate(thursday.getUTCDate() - dayIndex + 3);

  const isoYear = thursday.getUTCFullYear();

  // Week 1 is the week containing 4 January.
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayIndex + 3);

  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
