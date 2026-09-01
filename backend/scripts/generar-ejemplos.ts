/**
 * Generates the sample CSVs in docs/ejemplos/ from synthetic data.
 *
 * The point of these files is that they exist **before** the pilot runs. Once families are enrolled
 * the column set is frozen by what was captured, and nobody can reconstruct week-3 adherence for a
 * family that already finished. An evaluator who reviews these now can still ask for a column.
 *
 * Runs with no AWS credentials and no network:
 *
 *   node backend/scripts/generar-ejemplos.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { addDays, isoDate, isoWeek, type IsoDate } from '../src/domain/dates.ts';
import { createFeedback, type Feedback } from '../src/domain/feedback.ts';
import type { LogActivityKind, LogEntry } from '../src/domain/log-entry.ts';
import type { DeliverySummary, FamilyIndicatorInput } from '../src/domain/indicators.ts';
import { DATASETS, buildCsv, type AuditRow, type ExportBundle } from '../src/handlers/admin/export.ts';

const OUT = new URL('../../docs/ejemplos/', import.meta.url).pathname;
const CUTOFF = isoDate('2026-11-24');
const PROGRAM_WEEKS = 8;

/** Deterministic pseudo-random, so regenerating the samples produces an identical diff. */
let seed = 20260901;
function random(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick<T>(values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

const KINDS: readonly LogActivityKind[] = ['lectura', 'lectura', 'lectura', 'cancion', 'juego', 'conversacion'];

/**
 * Twelve families rather than fifty: enough to show every shape the data takes, few enough that an
 * evaluator can read the file. The shapes are what matter — the family that never logs anything is
 * the one that breaks naive averages.
 */
const PROFILES = [
  { id: 'ej-01', enrolledWeeksAgo: 12, adherence: 1.0,  note: 'constante de principio a fin' },
  { id: 'ej-02', enrolledWeeksAgo: 11, adherence: 0.75, note: 'buena, con huecos' },
  { id: 'ej-03', enrolledWeeksAgo: 10, adherence: 0.5,  note: 'justo en el umbral' },
  { id: 'ej-04', enrolledWeeksAgo: 10, adherence: 0.0,  note: 'nunca registró nada' },
  { id: 'ej-05', enrolledWeeksAgo: 9,  adherence: 0.25, note: 'arrancó y se apagó' },
  { id: 'ej-06', enrolledWeeksAgo: 8,  adherence: 0.875, note: 'muy activa' },
  { id: 'ej-07', enrolledWeeksAgo: 7,  adherence: 0.4,  optOutWeek: 4, note: 'se dio de baja en la semana 4' },
  { id: 'ej-08', enrolledWeeksAgo: 6,  adherence: 0.6,  note: 'dos cuidadores repartiéndose' },
  { id: 'ej-09', enrolledWeeksAgo: 4,  adherence: 0.75, note: 'ingresó tarde, va bien' },
  { id: 'ej-10', enrolledWeeksAgo: 3,  adherence: 0.33, note: 'ingresó tarde, poca actividad' },
  { id: 'ej-11', enrolledWeeksAgo: 2,  adherence: 1.0,  note: 'recién ingresada' },
  { id: 'ej-12', enrolledWeeksAgo: 1,  adherence: 0.0,  note: 'ingresó esta semana' },
] as const;

const families: FamilyIndicatorInput[] = [];
const logsByFamily = new Map<string, LogEntry[]>();
const feedbackByFamily = new Map<string, Feedback[]>();
const notesAuthorized = new Map<string, boolean>();
const audit: AuditRow[] = [];

for (const [index, profile] of PROFILES.entries()) {
  const anchorDate = addDays(CUTOFF, -profile.enrolledWeeksAgo * 7) as IsoDate;
  const weeksElapsed = Math.min(profile.enrolledWeeksAgo, PROGRAM_WEEKS);
  const twoCaregivers = index % 3 === 0;
  // Roughly half the families authorise notes, which is what makes the withheld case visible.
  const authorized = index % 2 === 1;
  notesAuthorized.set(profile.id, authorized);

  const logEntries: LogEntry[] = [];
  const deliveries: DeliverySummary[] = [];
  const optOutWeek = 'optOutWeek' in profile ? profile.optOutWeek : null;

  for (let week = 1; week <= weeksElapsed; week += 1) {
    if (optOutWeek !== null && week > optOutWeek) break;

    if (random() < profile.adherence) {
      const sessions = 1 + Math.floor(random() * 3);
      for (let session = 0; session < sessions; session += 1) {
        const dayOffset = (week - 1) * 7 + Math.floor(random() * 7);
        const kind = pick(KINDS);
        logEntries.push({
          clientId: `${profile.id}-s${week}-${session}`,
          date: addDays(anchorDate, dayOffset),
          kind,
          minutes: pick([5, 5, 10, 10, 15, 20, 30]),
          resourceId: `s${String(week).padStart(2, '0')}-${kind}`,
          note: authorized && random() < 0.3 ? 'Nota de ejemplo escrita por el cuidador' : null,
          loggedBy: twoCaregivers && random() < 0.4 ? 'secundario' : 'principal',
        });
      }
    }

    const recipients = twoCaregivers ? 2 : 1;
    const delivered = random() < 0.95 ? recipients : recipients - 1;
    deliveries.push({
      isoWeek: isoWeek(addDays(anchorDate, (week - 1) * 7)),
      week,
      sent: recipients,
      delivered,
      read: random() < 0.7 ? delivered : 0,
      failed: recipients - delivered,
      billable: delivered,
      // Mostly utility; the marketing rows are what a reconciliation would flag as a price surprise.
      categories: random() < 0.85 ? { utility: delivered } : { marketing: delivered },
    });
  }

  const feedback: Feedback[] = [];
  const questions = Math.floor(random() * 3);
  for (let n = 0; n < questions; n += 1) {
    const createdAt = new Date(
      Date.parse(`${addDays(anchorDate, Math.floor(random() * weeksElapsed * 7))}T14:00:00.000Z`),
    ).toISOString();
    const base = createFeedback({
      id: `${profile.id}-fb${n}`,
      type: pick(['consulta', 'consulta', 'pedido', 'comentario', 'problema'] as const),
      channel: random() < 0.6 ? 'whatsapp' : 'pwa',
      text: 'Texto de ejemplo escrito por la familia.',
      createdAt,
    });

    if (random() < 0.75) {
      const hours = pick([2, 5, 18, 26, 40, 72]);
      feedback.push({
        ...base,
        status: 'respondido',
        replies: [{
          text: 'Respuesta de ejemplo del equipo.',
          gestorSub: pick(['gestor-a', 'gestor-b']),
          at: new Date(Date.parse(createdAt) + hours * 3_600_000).toISOString(),
        }],
      });
    } else {
      feedback.push(base);
    }
  }

  logsByFamily.set(profile.id, logEntries);
  feedbackByFamily.set(profile.id, feedback);

  families.push({
    familyId: profile.id,
    clinic: 'CLINICA-EJEMPLO',
    status: optOutWeek === null ? 'activa' : 'baja',
    anchorDate,
    enrolledAt: `${anchorDate}T10:00:00.000Z`,
    caregivers: [
      {
        role: 'principal',
        optIn: optOutWeek === null,
        optOutAt: optOutWeek === null ? null : `${addDays(anchorDate, optOutWeek * 7)}T09:00:00.000Z`,
        lastInboundAt: null,
      },
      ...(twoCaregivers
        ? [{ role: 'secundario' as const, optIn: optOutWeek === null, optOutAt: null, lastInboundAt: null }]
        : []),
    ],
    logEntries,
    deliveries,
    feedback,
  });

  audit.push({
    at: `${addDays(anchorDate, 3)}T15:30:00.000Z`,
    gestorSub: pick(['gestor-a', 'gestor-b']),
    gestorEmail: 'ejemplo@leerenfamilia.pe',
    action: 'ver_detalle_familia',
    familyId: profile.id,
  });
}

audit.push({
  at: `${CUTOFF}T09:00:00.000Z`,
  gestorSub: 'gestor-a',
  gestorEmail: 'ejemplo@leerenfamilia.pe',
  action: 'exportar_datos',
  familyId: null,
  detail: 'familias',
});

const bundle: ExportBundle = {
  cutoff: CUTOFF,
  programWeeks: PROGRAM_WEEKS,
  families,
  logEntriesByFamily: logsByFamily,
  feedbackByFamily: feedbackByFamily,
  audit,
  notesAuthorized,
};

await mkdir(OUT, { recursive: true });
for (const dataset of DATASETS) {
  await writeFile(`${OUT}${dataset}.csv`, buildCsv(dataset, bundle), 'utf8');
}

console.log(`Escritos ${DATASETS.length} CSV de ejemplo en docs/ejemplos/`);
console.log(`${families.length} familias sintéticas, corte ${CUTOFF}.`);
console.log('Estos archivos son para que el evaluador critique las columnas ANTES del piloto.');
