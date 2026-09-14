import { isoDate, type IsoDate } from '../domain/dates.ts';

/**
 * The pilot's calendar timezone. Peru observes no DST, but going through `Intl` rather than
 * subtracting five hours keeps this correct if the platform is ever used somewhere that does.
 */
export const PILOT_TIMEZONE = 'America/Lima';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PILOT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Converts an instant to the calendar date it falls on in Lima.
 *
 * This is the boundary the domain layer depends on: a family enrolled at 23:00 in Lima is enrolled
 * *that* day, even though in UTC it is already the next one. Getting this wrong shifts every
 * family's programme week by one for the whole eight weeks.
 */
export function limaDate(instant: Date): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return isoDate(formatter.format(instant));
}
