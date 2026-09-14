import { isoWeek, type IsoDate } from './dates.ts';
import { canReceiveMessages, type Caregiver } from './opt-in.ts';
import type { Msisdn } from './msisdn.ts';
import { DEFAULT_PROGRAM_WEEKS, hasFinished, programWeek } from './schedule.ts';

export type FamilyStatus = 'activa' | 'baja' | 'suprimida';

export interface FamilySendState {
  readonly familyId: string;
  readonly status: FamilyStatus;
  /** Resolved at enrolment and never recomputed. See docs/decisiones.md D-003. */
  readonly anchorDate: IsoDate;
  readonly caregivers: readonly Caregiver[];
  /** ISO week identifiers already delivered, the idempotency record for `(family_id, iso_week)`. */
  readonly deliveredIsoWeeks: readonly string[];
}

/**
 * Why a family was skipped. These are not just log lines: the operating model (§5.4) requires a
 * weekly implementation report, and "how many families got nothing this week and why" is the
 * substance of it.
 */
export type SkipReason =
  | 'familia_inactiva'
  | 'aun_no_inicia'
  | 'programa_finalizado'
  | 'ya_enviado_esta_semana'
  | 'sin_cuidadores_con_opt_in';

export type SendDecision =
  | { readonly send: true; readonly week: number; readonly isoWeek: string; readonly recipients: readonly Msisdn[] }
  | { readonly send: false; readonly reason: SkipReason };

/**
 * Whether a family is due its weekly message today, and to which caregivers.
 *
 * Idempotency lives here rather than in the scheduler: EventBridge retries, and Lambda can be
 * invoked more than once for the same trigger. A second run in the same ISO week must produce
 * `ya_enviado_esta_semana`, never a second charged message.
 */
export function decideWeeklySend(
  family: FamilySendState,
  today: IsoDate,
  programWeeks = DEFAULT_PROGRAM_WEEKS,
): SendDecision {
  if (family.status !== 'activa') {
    return { send: false, reason: 'familia_inactiva' };
  }

  const week = programWeek(family.anchorDate, today);
  if (week < 1) {
    return { send: false, reason: 'aun_no_inicia' };
  }
  if (hasFinished(week, programWeeks)) {
    return { send: false, reason: 'programa_finalizado' };
  }

  const currentIsoWeek = isoWeek(today);
  if (family.deliveredIsoWeeks.includes(currentIsoWeek)) {
    return { send: false, reason: 'ya_enviado_esta_semana' };
  }

  const recipients = family.caregivers.filter(canReceiveMessages).map((c) => c.msisdn);
  if (recipients.length === 0) {
    return { send: false, reason: 'sin_cuidadores_con_opt_in' };
  }

  return { send: true, week, isoWeek: currentIsoWeek, recipients };
}
