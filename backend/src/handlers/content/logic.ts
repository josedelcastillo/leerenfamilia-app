import type { IsoDate } from '../../domain/dates.ts';
import { programWeek, unlockedWeeks } from '../../domain/schedule.ts';
import type { WeekContent } from '../../content/weeks.ts';
import type { FamilyContext, FamilyStore } from '../family-ports.ts';

export interface ContentResponse {
  readonly babyName: string;
  readonly currentWeek: number;
  readonly programWeeks: number;
  readonly finished: boolean;
  readonly weeks: readonly WeekContent[];
}

/**
 * Weeks 1 to the current one, capped at the programme length. Future weeks are not returned at all
 * rather than returned and hidden in the UI: a family should not be able to read next week's
 * activity by opening the network tab, and past weeks stay open so a family that fell behind can
 * catch up.
 */
export async function getContent(
  store: FamilyStore,
  context: FamilyContext,
  today: IsoDate,
): Promise<ContentResponse> {
  const week = programWeek(context.anchorDate, today);
  const visible = unlockedWeeks(week, context.programWeeks);
  const weeks = visible.length === 0 ? [] : await store.getWeeks(context.programId, visible);

  return {
    babyName: context.babyName,
    currentWeek: week,
    programWeeks: context.programWeeks,
    finished: week > context.programWeeks,
    weeks: weeks.slice().sort((a, b) => a.week - b.week),
  };
}
