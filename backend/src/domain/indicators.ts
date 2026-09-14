import { daysBetween, type IsoDate } from './dates.ts';
import type { Feedback } from './feedback.ts';
import type { LogActivityKind, LogEntry } from './log-entry.ts';
import { programWeek } from './schedule.ts';
import type { FamilyStatus } from './eligibility.ts';

/**
 * The pilot's indicators.
 *
 * These exist because the operating model v1.0 has none: it lists sources of information, and the
 * proposal promises the clinic "frequency of shared reading" and "active participation" with no
 * numerator, denominator or target. Everything below is a **draft for Leer en Familia and the
 * evaluator to correct**, not a settled definition. See docs/indicadores.md.
 *
 * Every threshold is a named constant precisely so that changing one is a line, not a redesign.
 */

/** A week counts as active when the family logged at least this many entries in it. PROPOSAL. */
export const UMBRAL_SEMANA_ACTIVA = 1;

/** A family counts as adherent at this share of active weeks or above. PROPOSAL. */
export const UMBRAL_FAMILIA_ADHERENTE = 0.5;

/**
 * Target time to first reply, in hours. PROPOSAL — the operating model defines no SLA at all
 * (hallazgo 11 of docs/00-entendimiento.md). Measuring it is what makes the absence visible.
 */
export const OBJETIVO_PRIMERA_RESPUESTA_HORAS = 48;

export interface DeliverySummary {
  readonly isoWeek: string;
  readonly week: number;
  readonly sent: number;
  readonly delivered: number;
  readonly read: number;
  readonly failed: number;
  readonly billable: number;
  /** Meta's own pricing categories, kept verbatim: `utility`, `marketing`, `service`… */
  readonly categories: Readonly<Record<string, number>>;
}

export interface FamilyIndicatorInput {
  readonly familyId: string;
  readonly clinic: string;
  readonly status: FamilyStatus;
  readonly anchorDate: IsoDate;
  readonly enrolledAt: string;
  readonly caregivers: ReadonlyArray<{
    readonly role: 'principal' | 'secundario';
    readonly optIn: boolean;
    readonly optOutAt: string | null;
    readonly lastInboundAt: number | null;
  }>;
  readonly logEntries: readonly LogEntry[];
  readonly deliveries: readonly DeliverySummary[];
  readonly feedback: readonly Feedback[];
}

export interface FamilyIndicators {
  readonly familyId: string;
  readonly clinic: string;
  readonly status: FamilyStatus;
  readonly anchorDate: IsoDate;
  readonly semanasTranscurridas: number;
  readonly semanasActivas: number;
  /** `semanasActivas / semanasTranscurridas`, or null before the programme starts. */
  readonly adherencia: number | null;
  readonly esAdherente: boolean;
  readonly semanaBaja: number | null;
  readonly cuidadores: number;
  readonly cuidadoresConOptIn: number;
  readonly entradas: number;
  readonly diasDistintos: number;
  readonly minutosTotales: number;
  readonly entradasPorTipo: Readonly<Record<LogActivityKind, number>>;
  readonly diasConLectura: number;
  readonly entradasCuidadorPrincipal: number;
  readonly entradasCuidadorSecundario: number;
  readonly enviosRealizados: number;
  readonly enviosEntregados: number;
  readonly enviosLeidos: number;
  readonly mensajesFacturables: number;
  readonly feedbackTotal: number;
  readonly feedbackAbierto: number;
  readonly feedbackPorWhatsapp: number;
  /** Hours from each question to its first reply. Empty when nothing has been answered. */
  readonly horasPrimeraRespuesta: readonly number[];
}

const EMPTY_BY_KIND: Record<LogActivityKind, number> = {
  lectura: 0, cancion: 0, juego: 0, conversacion: 0,
};

function hoursBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000;
}

export function familyIndicators(
  input: FamilyIndicatorInput,
  cutoff: IsoDate,
  programWeeks: number,
): FamilyIndicators {
  const rawWeek = programWeek(input.anchorDate, cutoff);
  // Weeks the family has actually been in the programme, never more than the programme is long.
  const semanasTranscurridas = Math.max(0, Math.min(rawWeek, programWeeks));

  const entriesByWeek = new Map<number, LogEntry[]>();
  const byKind: Record<LogActivityKind, number> = { ...EMPTY_BY_KIND };
  const days = new Set<string>();
  const readingDays = new Set<string>();
  let minutos = 0;
  let principal = 0;
  let secundario = 0;

  for (const entry of input.logEntries) {
    const week = programWeek(input.anchorDate, entry.date);
    const bucket = entriesByWeek.get(week);
    if (bucket === undefined) entriesByWeek.set(week, [entry]);
    else bucket.push(entry);

    byKind[entry.kind] += 1;
    days.add(entry.date);
    if (entry.kind === 'lectura') readingDays.add(entry.date);
    minutos += entry.minutes;
    if (entry.loggedBy === 'secundario') secundario += 1;
    else principal += 1;
  }

  let semanasActivas = 0;
  for (let week = 1; week <= semanasTranscurridas; week += 1) {
    if ((entriesByWeek.get(week)?.length ?? 0) >= UMBRAL_SEMANA_ACTIVA) {
      semanasActivas += 1;
    }
  }

  const adherencia = semanasTranscurridas === 0 ? null : semanasActivas / semanasTranscurridas;

  // The earliest opt-out among the caregivers marks when the family stopped hearing from us.
  const optOutDates = input.caregivers
    .map((caregiver) => caregiver.optOutAt)
    .filter((at): at is string => at !== null)
    .sort();
  const firstOptOut = optOutDates[0];
  const semanaBaja =
    firstOptOut === undefined || input.caregivers.some((c) => c.optIn)
      ? null
      : Math.max(1, Math.floor(daysBetween(input.anchorDate, firstOptOut.slice(0, 10) as IsoDate) / 7) + 1);

  const horasPrimeraRespuesta = input.feedback
    .map((item) => {
      const first = item.replies[0];
      return first === undefined ? null : hoursBetween(item.createdAt, first.at);
    })
    .filter((hours): hours is number => hours !== null && Number.isFinite(hours) && hours >= 0);

  return {
    familyId: input.familyId,
    clinic: input.clinic,
    status: input.status,
    anchorDate: input.anchorDate,
    semanasTranscurridas,
    semanasActivas,
    adherencia,
    esAdherente: adherencia !== null && adherencia >= UMBRAL_FAMILIA_ADHERENTE,
    semanaBaja,
    cuidadores: input.caregivers.length,
    cuidadoresConOptIn: input.caregivers.filter((c) => c.optIn).length,
    entradas: input.logEntries.length,
    diasDistintos: days.size,
    minutosTotales: minutos,
    entradasPorTipo: byKind,
    diasConLectura: readingDays.size,
    entradasCuidadorPrincipal: principal,
    entradasCuidadorSecundario: secundario,
    enviosRealizados: input.deliveries.reduce((total, d) => total + d.sent, 0),
    enviosEntregados: input.deliveries.reduce((total, d) => total + d.delivered, 0),
    enviosLeidos: input.deliveries.reduce((total, d) => total + d.read, 0),
    mensajesFacturables: input.deliveries.reduce((total, d) => total + d.billable, 0),
    feedbackTotal: input.feedback.length,
    feedbackAbierto: input.feedback.filter((f) => f.status === 'abierto').length,
    feedbackPorWhatsapp: input.feedback.filter((f) => f.channel === 'whatsapp').length,
    horasPrimeraRespuesta,
  };
}

export interface CohortIndicators {
  readonly familias: number;
  readonly familiasActivas: number;
  readonly familiasConBaja: number;
  readonly tasaBaja: number | null;
  readonly cuidadoresInscritos: number;
  readonly adherenciaPromedio: number | null;
  readonly adherenciaMediana: number | null;
  readonly familiasAdherentes: number;
  readonly proporcionAdherentes: number | null;
  /** Share of families reaching each week that logged something in it. */
  readonly retencionPorSemana: ReadonlyArray<{ semana: number; alcanzaron: number; activas: number; tasa: number | null }>;
  readonly entradasTotales: number;
  readonly minutosTotales: number;
  readonly entradasPorTipo: Readonly<Record<LogActivityKind, number>>;
  readonly enviosRealizados: number;
  readonly tasaEntrega: number | null;
  readonly tasaLectura: number | null;
  readonly mensajesFacturables: number;
  readonly mensajesPorCategoria: Readonly<Record<string, number>>;
  readonly feedbackTotal: number;
  readonly feedbackAbierto: number;
  readonly proporcionFeedbackPorWhatsapp: number | null;
  readonly primeraRespuestaMedianaHoras: number | null;
  readonly primeraRespuestaP90Horas: number | null;
  readonly respuestasDentroDelObjetivo: number | null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank: with a handful of families, interpolation invents precision that is not there.
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function cohortIndicators(
  families: readonly FamilyIndicators[],
  inputs: readonly FamilyIndicatorInput[],
  programWeeks: number,
): CohortIndicators {
  const byKind: Record<LogActivityKind, number> = { ...EMPTY_BY_KIND };
  const byCategory: Record<string, number> = {};

  for (const family of families) {
    for (const kind of Object.keys(byKind) as LogActivityKind[]) {
      byKind[kind] += family.entradasPorTipo[kind];
    }
  }
  for (const input of inputs) {
    for (const delivery of input.deliveries) {
      for (const [category, count] of Object.entries(delivery.categories)) {
        byCategory[category] = (byCategory[category] ?? 0) + count;
      }
    }
  }

  const adherences = families
    .map((family) => family.adherencia)
    .filter((value): value is number => value !== null);

  // Retention per week. Only families that actually reached a week belong in its denominator:
  // counting a family that enrolled last week as "lost" in week 8 would be nonsense, and with
  // staggered enrolment (D-003) most of the cohort has not reached the later weeks yet.
  const weeksReached = new Map(families.map((family) => [family.familyId, family.semanasTranscurridas]));
  const activeWeeksByFamily = new Map<string, Set<number>>();
  for (const input of inputs) {
    const weeks = new Set<number>();
    const counts = new Map<number, number>();
    for (const entry of input.logEntries) {
      const week = programWeek(input.anchorDate, entry.date);
      counts.set(week, (counts.get(week) ?? 0) + 1);
    }
    for (const [week, count] of counts) {
      if (count >= UMBRAL_SEMANA_ACTIVA) weeks.add(week);
    }
    activeWeeksByFamily.set(input.familyId, weeks);
  }

  const retencionPorSemana = Array.from({ length: programWeeks }, (_, index) => {
    const semana = index + 1;
    let alcanzaron = 0;
    let activas = 0;
    for (const [familyId, reached] of weeksReached) {
      if (reached < semana) continue;
      alcanzaron += 1;
      if (activeWeeksByFamily.get(familyId)?.has(semana) === true) activas += 1;
    }
    return { semana, alcanzaron, activas, tasa: ratio(activas, alcanzaron) };
  });

  const responseHours = families.flatMap((family) => family.horasPrimeraRespuesta);
  const enviados = families.reduce((total, f) => total + f.enviosRealizados, 0);
  const entregados = families.reduce((total, f) => total + f.enviosEntregados, 0);
  const leidos = families.reduce((total, f) => total + f.enviosLeidos, 0);
  const feedbackTotal = families.reduce((total, f) => total + f.feedbackTotal, 0);

  return {
    familias: families.length,
    familiasActivas: families.filter((f) => f.status === 'activa').length,
    familiasConBaja: families.filter((f) => f.semanaBaja !== null).length,
    tasaBaja: ratio(families.filter((f) => f.semanaBaja !== null).length, families.length),
    cuidadoresInscritos: families.reduce((total, f) => total + f.cuidadores, 0),
    adherenciaPromedio:
      adherences.length === 0 ? null : adherences.reduce((a, b) => a + b, 0) / adherences.length,
    adherenciaMediana: percentile(adherences, 0.5),
    familiasAdherentes: families.filter((f) => f.esAdherente).length,
    proporcionAdherentes: ratio(families.filter((f) => f.esAdherente).length, families.length),
    retencionPorSemana,
    entradasTotales: families.reduce((total, f) => total + f.entradas, 0),
    minutosTotales: families.reduce((total, f) => total + f.minutosTotales, 0),
    entradasPorTipo: byKind,
    enviosRealizados: enviados,
    tasaEntrega: ratio(entregados, enviados),
    tasaLectura: ratio(leidos, entregados),
    mensajesFacturables: families.reduce((total, f) => total + f.mensajesFacturables, 0),
    mensajesPorCategoria: byCategory,
    feedbackTotal,
    feedbackAbierto: families.reduce((total, f) => total + f.feedbackAbierto, 0),
    proporcionFeedbackPorWhatsapp: ratio(
      families.reduce((total, f) => total + f.feedbackPorWhatsapp, 0),
      feedbackTotal,
    ),
    primeraRespuestaMedianaHoras: percentile(responseHours, 0.5),
    primeraRespuestaP90Horas: percentile(responseHours, 0.9),
    respuestasDentroDelObjetivo: ratio(
      responseHours.filter((hours) => hours <= OBJETIVO_PRIMERA_RESPUESTA_HORAS).length,
      responseHours.length,
    ),
  };
}
