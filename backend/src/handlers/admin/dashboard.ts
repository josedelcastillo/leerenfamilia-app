import { daysBetween, type IsoDate } from '../../domain/dates.ts';
import { cohortIndicators, familyIndicators, type FamilyIndicatorInput } from '../../domain/indicators.ts';
import { programWeek } from '../../domain/schedule.ts';
import { withinLastDays } from './logic.ts';
import type { FamilyRecord, ProgramSummary } from './ports.ts';

export interface Dashboard {
  readonly corte: IsoDate;
  readonly programWeeks: number;
  /** Weeks since the first family entered, capped at the programme length. 0 before anyone did. */
  readonly semanaPiloto: number;
  readonly registradas: number;
  /** Families with at least one entry in the last 7 days. */
  readonly activasEstaSemana: number;
  readonly registrosSemana: number;
  readonly registrosTotales: number;
  /** Households where both the principal and the secondary caregiver have logged. */
  readonly ambosCuidadores: number;
  /** Active families at least a week in, with nothing logged in the last 7 days. */
  readonly sinRegistros7Dias: number;
  readonly mensajesSinResponder: number;
  readonly consentimientoNotas: { readonly autorizan: number; readonly de: number };
  readonly participacionPorSemana: ReadonlyArray<{
    readonly semana: number;
    readonly alcanzaron: number;
    readonly activas: number;
  }>;
}

function toIndicatorInput(family: FamilyRecord): FamilyIndicatorInput {
  return {
    familyId: family.familyId,
    clinic: '',
    status: family.status,
    anchorDate: family.anchorDate,
    enrolledAt: '',
    caregivers: family.caregivers.map((caregiver) => ({
      role: caregiver.role,
      optIn: caregiver.optIn,
      optOutAt: null,
      lastInboundAt: caregiver.lastInboundAt,
    })),
    logEntries: family.logEntries,
    deliveries: [],
    feedback: family.feedback,
  };
}

/**
 * The pilot board and the weekly report (D-026). Aggregates only, like the family list: no free
 * text and no names, so it needs neither a consent check nor an audit entry.
 *
 * Participation per week comes from `cohortIndicators`, the definition resumen.csv uses, so the
 * board and the exported summary cannot disagree. Kits and pre-enrolment outreach are not in the
 * data model; the board says so instead of showing a number.
 */
export function buildDashboard(
  families: readonly FamilyRecord[],
  program: ProgramSummary,
  today: IsoDate,
): Dashboard {
  const inputs = families.map(toIndicatorInput);
  const perFamily = inputs.map((input) => familyIndicators(input, today, program.programWeeks));
  const cohort = cohortIndicators(perFamily, inputs, program.programWeeks);

  const recent = families.map((family) => withinLastDays(family.logEntries, today, 7));
  const firstAnchor = [...families].map((f) => f.anchorDate).sort()[0];
  const semanaPiloto = firstAnchor === undefined
    ? 0
    : Math.max(0, Math.min(programWeek(firstAnchor, today), program.programWeeks));

  return {
    corte: today,
    programWeeks: program.programWeeks,
    semanaPiloto,
    registradas: families.length,
    activasEstaSemana: recent.filter((entries) => entries.length > 0).length,
    registrosSemana: recent.reduce((total, entries) => total + entries.length, 0),
    registrosTotales: cohort.entradasTotales,
    ambosCuidadores: families.filter((family) =>
      family.logEntries.some((e) => e.loggedBy === 'principal') &&
      family.logEntries.some((e) => e.loggedBy === 'secundario'),
    ).length,
    sinRegistros7Dias: families.filter((family, index) =>
      family.status === 'activa' &&
      daysBetween(family.anchorDate, today) >= 7 &&
      recent[index]!.length === 0,
    ).length,
    mensajesSinResponder: cohort.feedbackAbierto,
    consentimientoNotas: {
      autorizan: families.filter((family) => family.freeTextNotesAuthorized).length,
      de: families.length,
    },
    participacionPorSemana: cohort.retencionPorSemana.map(({ semana, alcanzaron, activas }) => ({
      semana,
      alcanzaron,
      activas,
    })),
  };
}
