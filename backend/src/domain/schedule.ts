import { daysBetween, type IsoDate } from './dates.ts';

/**
 * Which date the program week counts from. See docs/decisiones.md D-003: the pilot anchors to the
 * enrolment date, and `birth_date` stays available for later programs.
 *
 * The policy belongs to the program. The *resolved* date is stored on the family and never
 * recomputed, so changing the policy cannot reinterpret a cohort that has already run.
 */
export type ScheduleAnchorPolicy = 'enrollment_date' | 'birth_date';

export const DEFAULT_ANCHOR_POLICY: ScheduleAnchorPolicy = 'enrollment_date';
export const DEFAULT_PROGRAM_WEEKS = 8;

export interface AnchorCandidates {
  readonly enrollmentDate: IsoDate;
  readonly birthDate: IsoDate;
}

/** Resolved once, at enrolment. Callers persist the result alongside the policy that produced it. */
export function resolveAnchorDate(
  policy: ScheduleAnchorPolicy,
  candidates: AnchorCandidates,
): IsoDate {
  return policy === 'birth_date' ? candidates.birthDate : candidates.enrollmentDate;
}

/**
 * The family's program week on a given day. Week 1 is the anchor day itself and the six days
 * after it. Returns zero or less when `today` precedes the anchor, which callers treat as
 * "has not started" rather than as an error — a scheduler with a timezone slip should skip a
 * family, not crash the run.
 */
export function programWeek(anchorDate: IsoDate, today: IsoDate): number {
  return Math.floor(daysBetween(anchorDate, today) / 7) + 1;
}

export function hasFinished(week: number, programWeeks = DEFAULT_PROGRAM_WEEKS): boolean {
  return week > programWeeks;
}

/**
 * Weeks the family may read today: everything from week 1 up to the current one, capped at the
 * program length. Future weeks stay hidden; past weeks stay open, so a family that enrols late or
 * falls behind can still catch up on what it missed.
 */
export function unlockedWeeks(week: number, programWeeks = DEFAULT_PROGRAM_WEEKS): number[] {
  const highest = Math.min(week, programWeeks);
  if (highest < 1) {
    return [];
  }
  return Array.from({ length: highest }, (_, index) => index + 1);
}
