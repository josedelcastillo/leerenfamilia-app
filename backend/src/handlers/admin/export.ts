import type { IsoDate } from '../../domain/dates.ts';
import type { Feedback } from '../../domain/feedback.ts';
import type { LogEntry } from '../../domain/log-entry.ts';
import {
  cohortIndicators,
  familyIndicators,
  OBJETIVO_PRIMERA_RESPUESTA_HORAS,
  UMBRAL_FAMILIA_ADHERENTE,
  UMBRAL_SEMANA_ACTIVA,
  type FamilyIndicatorInput,
  type FamilyIndicators,
} from '../../domain/indicators.ts';
import { programWeek } from '../../domain/schedule.ts';
import { toCsv, type CsvColumn } from '../../shared/csv.ts';

export const DATASETS = ['resumen', 'familias', 'bitacora', 'envios', 'feedback', 'auditoria'] as const;
export type Dataset = (typeof DATASETS)[number];

export function isDataset(value: string): value is Dataset {
  return (DATASETS as readonly string[]).includes(value);
}

export interface AuditRow {
  readonly at: string;
  readonly gestorSub: string;
  readonly gestorEmail: string;
  readonly action: string;
  readonly familyId: string | null;
  readonly detail?: string;
}

export interface ExportBundle {
  readonly cutoff: IsoDate;
  readonly programWeeks: number;
  readonly families: readonly FamilyIndicatorInput[];
  readonly logEntriesByFamily: ReadonlyMap<string, readonly LogEntry[]>;
  readonly feedbackByFamily: ReadonlyMap<string, readonly Feedback[]>;
  readonly audit: readonly AuditRow[];
  /** True when the family consented to managers reading the free text of their notes. */
  readonly notesAuthorized: ReadonlyMap<string, boolean>;
}

function round(value: number | null, decimals = 3): string {
  return value === null ? '' : value.toFixed(decimals);
}

/**
 * Every export is pseudonymised: no phone number, no baby name, no caregiver name.
 *
 * `familia_id` is a UUID that only this platform can resolve back to a person — which is what lets
 * the ONG act on a finding. It is a pseudonym, not anonymisation: under Ley 29733 these files are
 * still personal data and have to be handled as such. That is stated in docs/tratamiento-datos.md,
 * not left for the reader to work out.
 */
export function buildCsv(dataset: Dataset, bundle: ExportBundle): string {
  const perFamily = bundle.families.map((input) =>
    familyIndicators(input, bundle.cutoff, bundle.programWeeks),
  );

  switch (dataset) {
    case 'resumen':
      return resumenCsv(perFamily, bundle);
    case 'familias':
      return familiasCsv(perFamily);
    case 'bitacora':
      return bitacoraCsv(bundle);
    case 'envios':
      return enviosCsv(bundle);
    case 'feedback':
      return feedbackCsv(bundle);
    case 'auditoria':
      return auditoriaCsv(bundle);
  }
}

/** Key/value rather than one very wide row: an evaluator reads this one top to bottom. */
function resumenCsv(perFamily: readonly FamilyIndicators[], bundle: ExportBundle): string {
  const cohort = cohortIndicators(perFamily, bundle.families, bundle.programWeeks);

  const rows: Array<{ indicador: string; valor: string; nota: string }> = [
    { indicador: 'corte', valor: bundle.cutoff, nota: 'Fecha hasta la que se calcula todo' },
    { indicador: 'semanas_programa', valor: String(bundle.programWeeks), nota: '' },
    { indicador: 'familias', valor: String(cohort.familias), nota: '' },
    { indicador: 'familias_activas', valor: String(cohort.familiasActivas), nota: '' },
    { indicador: 'cuidadores_inscritos', valor: String(cohort.cuidadoresInscritos), nota: '' },
    { indicador: 'familias_con_baja', valor: String(cohort.familiasConBaja), nota: '' },
    { indicador: 'tasa_baja', valor: round(cohort.tasaBaja), nota: 'familias con baja / familias' },
    {
      indicador: 'adherencia_promedio', valor: round(cohort.adherenciaPromedio),
      nota: 'promedio de (semanas activas / semanas transcurridas) por familia',
    },
    { indicador: 'adherencia_mediana', valor: round(cohort.adherenciaMediana), nota: '' },
    {
      indicador: 'proporcion_familias_adherentes', valor: round(cohort.proporcionAdherentes),
      nota: `familias con adherencia >= ${UMBRAL_FAMILIA_ADHERENTE} (umbral PROPUESTO)`,
    },
    {
      indicador: 'umbral_semana_activa', valor: String(UMBRAL_SEMANA_ACTIVA),
      nota: 'entradas de bitácora mínimas para contar la semana como activa (PROPUESTO)',
    },
    { indicador: 'entradas_bitacora', valor: String(cohort.entradasTotales), nota: '' },
    { indicador: 'minutos_bitacora', valor: String(cohort.minutosTotales), nota: '' },
    { indicador: 'entradas_lectura', valor: String(cohort.entradasPorTipo.lectura), nota: '' },
    { indicador: 'entradas_cancion', valor: String(cohort.entradasPorTipo.cancion), nota: '' },
    { indicador: 'entradas_juego', valor: String(cohort.entradasPorTipo.juego), nota: '' },
    { indicador: 'entradas_conversacion', valor: String(cohort.entradasPorTipo.conversacion), nota: '' },
    { indicador: 'envios_realizados', valor: String(cohort.enviosRealizados), nota: '' },
    { indicador: 'tasa_entrega', valor: round(cohort.tasaEntrega), nota: 'entregados / enviados' },
    { indicador: 'tasa_lectura', valor: round(cohort.tasaLectura), nota: 'leídos / entregados' },
    { indicador: 'mensajes_facturables', valor: String(cohort.mensajesFacturables), nota: 'según Meta' },
    { indicador: 'feedback_total', valor: String(cohort.feedbackTotal), nota: '' },
    { indicador: 'feedback_abierto', valor: String(cohort.feedbackAbierto), nota: 'sin responder al corte' },
    {
      indicador: 'proporcion_feedback_whatsapp', valor: round(cohort.proporcionFeedbackPorWhatsapp),
      nota: 'cuánto del canal bidireccional entra por WhatsApp y no por la app',
    },
    { indicador: 'primera_respuesta_mediana_horas', valor: round(cohort.primeraRespuestaMedianaHoras, 1), nota: '' },
    { indicador: 'primera_respuesta_p90_horas', valor: round(cohort.primeraRespuestaP90Horas, 1), nota: '' },
    {
      indicador: 'respuestas_dentro_del_objetivo', valor: round(cohort.respuestasDentroDelObjetivo),
      nota: `objetivo ${OBJETIVO_PRIMERA_RESPUESTA_HORAS} h (PROPUESTO: el modelo operativo no define plazo)`,
    },
  ];

  for (const [category, count] of Object.entries(cohort.mensajesPorCategoria)) {
    rows.push({ indicador: `mensajes_categoria_${category}`, valor: String(count), nota: 'categoría de precio de Meta' });
  }
  for (const week of cohort.retencionPorSemana) {
    rows.push({
      indicador: `retencion_semana_${String(week.semana).padStart(2, '0')}`,
      valor: round(week.tasa),
      nota: `${week.activas} activas de ${week.alcanzaron} que llegaron a la semana`,
    });
  }

  const columns: CsvColumn<{ indicador: string; valor: string; nota: string }>[] = [
    { header: 'indicador', value: (row) => row.indicador },
    { header: 'valor', value: (row) => row.valor },
    { header: 'nota', value: (row) => row.nota },
  ];
  return toCsv(columns, rows);
}

function familiasCsv(perFamily: readonly FamilyIndicators[]): string {
  const columns: CsvColumn<FamilyIndicators>[] = [
    { header: 'familia_id', value: (f) => f.familyId },
    { header: 'clinica', value: (f) => f.clinic },
    { header: 'estado', value: (f) => f.status },
    { header: 'fecha_ancla', value: (f) => f.anchorDate },
    { header: 'semanas_transcurridas', value: (f) => f.semanasTranscurridas },
    { header: 'semanas_activas', value: (f) => f.semanasActivas },
    { header: 'adherencia', value: (f) => round(f.adherencia) },
    { header: 'es_adherente', value: (f) => (f.esAdherente ? 1 : 0) },
    { header: 'semana_baja', value: (f) => f.semanaBaja ?? '' },
    { header: 'cuidadores', value: (f) => f.cuidadores },
    { header: 'cuidadores_con_opt_in', value: (f) => f.cuidadoresConOptIn },
    { header: 'entradas_bitacora', value: (f) => f.entradas },
    { header: 'dias_distintos', value: (f) => f.diasDistintos },
    { header: 'dias_con_lectura', value: (f) => f.diasConLectura },
    { header: 'minutos_totales', value: (f) => f.minutosTotales },
    { header: 'entradas_lectura', value: (f) => f.entradasPorTipo.lectura },
    { header: 'entradas_cancion', value: (f) => f.entradasPorTipo.cancion },
    { header: 'entradas_juego', value: (f) => f.entradasPorTipo.juego },
    { header: 'entradas_conversacion', value: (f) => f.entradasPorTipo.conversacion },
    { header: 'entradas_cuidador_principal', value: (f) => f.entradasCuidadorPrincipal },
    { header: 'entradas_cuidador_secundario', value: (f) => f.entradasCuidadorSecundario },
    { header: 'envios_realizados', value: (f) => f.enviosRealizados },
    { header: 'envios_entregados', value: (f) => f.enviosEntregados },
    { header: 'envios_leidos', value: (f) => f.enviosLeidos },
    { header: 'mensajes_facturables', value: (f) => f.mensajesFacturables },
    { header: 'feedback_total', value: (f) => f.feedbackTotal },
    { header: 'feedback_abierto', value: (f) => f.feedbackAbierto },
    { header: 'feedback_por_whatsapp', value: (f) => f.feedbackPorWhatsapp },
  ];
  return toCsv(columns, perFamily);
}

interface BitacoraRow {
  familyId: string;
  clinic: string;
  anchorDate: IsoDate;
  week: number;
  entry: LogEntry;
  noteIncluded: boolean;
}

/**
 * The granular file. One row per entry is what an evaluator actually wants: it allows any
 * aggregation the summary did not anticipate, which is the whole reason this file exists.
 *
 * The free text of a note is included only for families that authorised it. A column stating
 * whether it was withheld is more honest than an empty cell that could mean either thing.
 */
function bitacoraCsv(bundle: ExportBundle): string {
  const rows: BitacoraRow[] = [];
  for (const family of bundle.families) {
    const authorized = bundle.notesAuthorized.get(family.familyId) === true;
    for (const entry of bundle.logEntriesByFamily.get(family.familyId) ?? []) {
      rows.push({
        familyId: family.familyId,
        clinic: family.clinic,
        anchorDate: family.anchorDate,
        week: programWeek(family.anchorDate, entry.date),
        entry,
        noteIncluded: authorized,
      });
    }
  }
  rows.sort((a, b) => a.familyId.localeCompare(b.familyId) || a.entry.date.localeCompare(b.entry.date));

  const columns: CsvColumn<BitacoraRow>[] = [
    { header: 'familia_id', value: (r) => r.familyId },
    { header: 'clinica', value: (r) => r.clinic },
    { header: 'fecha', value: (r) => r.entry.date },
    { header: 'semana_programa', value: (r) => r.week },
    { header: 'tipo_actividad', value: (r) => r.entry.kind },
    { header: 'minutos', value: (r) => r.entry.minutes },
    { header: 'registrado_por', value: (r) => r.entry.loggedBy },
    { header: 'recurso', value: (r) => r.entry.resourceId ?? '' },
    { header: 'tiene_nota', value: (r) => (r.entry.note === null ? 0 : 1) },
    { header: 'nota_autorizada', value: (r) => (r.noteIncluded ? 1 : 0) },
    { header: 'nota', value: (r) => (r.noteIncluded ? (r.entry.note ?? '') : '') },
  ];
  return toCsv(columns, rows);
}

interface EnvioRow {
  familyId: string;
  isoWeek: string;
  week: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  billable: number;
  categories: string;
}

function enviosCsv(bundle: ExportBundle): string {
  const rows: EnvioRow[] = [];
  for (const family of bundle.families) {
    for (const delivery of family.deliveries) {
      rows.push({
        familyId: family.familyId,
        isoWeek: delivery.isoWeek,
        week: delivery.week,
        sent: delivery.sent,
        delivered: delivery.delivered,
        read: delivery.read,
        failed: delivery.failed,
        billable: delivery.billable,
        categories: Object.entries(delivery.categories).map(([k, v]) => `${k}:${v}`).join(' '),
      });
    }
  }
  rows.sort((a, b) => a.familyId.localeCompare(b.familyId) || a.week - b.week);

  const columns: CsvColumn<EnvioRow>[] = [
    { header: 'familia_id', value: (r) => r.familyId },
    { header: 'semana_iso', value: (r) => r.isoWeek },
    { header: 'semana_programa', value: (r) => r.week },
    { header: 'enviados', value: (r) => r.sent },
    { header: 'entregados', value: (r) => r.delivered },
    { header: 'leidos', value: (r) => r.read },
    { header: 'fallidos', value: (r) => r.failed },
    { header: 'facturables', value: (r) => r.billable },
    { header: 'categorias_precio', value: (r) => r.categories },
  ];
  return toCsv(columns, rows);
}

interface FeedbackRow {
  familyId: string;
  feedback: Feedback;
  horasPrimeraRespuesta: string;
}

/**
 * The text of the family's own question is included: it is what they wrote to the programme with
 * the expectation of a reply, and the qualitative findings of the pilot live in it. The reply text
 * is not — the count and the timing are what the evaluation needs, and every extra copy of a
 * conversation is another place it can leak.
 */
function feedbackCsv(bundle: ExportBundle): string {
  const rows: FeedbackRow[] = [];
  for (const family of bundle.families) {
    for (const item of bundle.feedbackByFamily.get(family.familyId) ?? []) {
      const first = item.replies[0];
      const hours = first === undefined
        ? ''
        : ((Date.parse(first.at) - Date.parse(item.createdAt)) / 3_600_000).toFixed(1);
      rows.push({ familyId: family.familyId, feedback: item, horasPrimeraRespuesta: hours });
    }
  }
  rows.sort((a, b) => a.feedback.createdAt.localeCompare(b.feedback.createdAt));

  const columns: CsvColumn<FeedbackRow>[] = [
    { header: 'familia_id', value: (r) => r.familyId },
    { header: 'creado', value: (r) => r.feedback.createdAt },
    { header: 'canal', value: (r) => r.feedback.channel },
    { header: 'tipo', value: (r) => r.feedback.type },
    { header: 'estado', value: (r) => r.feedback.status },
    { header: 'respuestas', value: (r) => r.feedback.replies.length },
    { header: 'horas_primera_respuesta', value: (r) => r.horasPrimeraRespuesta },
    { header: 'texto_familia', value: (r) => r.feedback.text },
  ];
  return toCsv(columns, rows);
}

/** The access log, which is the counterpart of the access itself (encargo §8). */
function auditoriaCsv(bundle: ExportBundle): string {
  const columns: CsvColumn<AuditRow>[] = [
    { header: 'momento', value: (r) => r.at },
    { header: 'gestor_sub', value: (r) => r.gestorSub },
    { header: 'gestor_correo', value: (r) => r.gestorEmail },
    { header: 'accion', value: (r) => r.action },
    { header: 'familia_id', value: (r) => r.familyId ?? '' },
    { header: 'detalle', value: (r) => r.detail ?? '' },
  ];
  return toCsv(columns, [...bundle.audit].sort((a, b) => a.at.localeCompare(b.at)));
}
