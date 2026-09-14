import { DomainError } from './errors.ts';
import { isoDate, type IsoDate } from './dates.ts';

/**
 * The reading log. This is not a product extra: it is the primary source of the pilot's indicators,
 * because the operating model has no indicator section and no baseline. It is designed so that the
 * output is a CSV an evaluator can analyse, not so that it looks good on screen.
 */
export type LogActivityKind = 'lectura' | 'cancion' | 'juego' | 'conversacion';

export const LOG_ACTIVITY_KINDS: readonly LogActivityKind[] = [
  'lectura',
  'cancion',
  'juego',
  'conversacion',
];

export type LoggedBy = 'principal' | 'secundario';

/**
 * Who the caregiver says did the activity. Self-reported and optional, and deliberately separate
 * from `loggedBy`: that one comes from the signed token and says whose phone logged the entry; this
 * one is what the family tells us. A father reading while the mother's phone logs is exactly the
 * case where the two differ (D-024).
 */
export type DeclaredBy = 'mama' | 'papa' | 'otra';

export const DECLARED_BY: readonly DeclaredBy[] = ['mama', 'papa', 'otra'];

export interface LogEntryInput {
  /** Generated on the device. It is what makes a queued retry safe to replay. */
  readonly clientId: string;
  readonly date: string;
  readonly kind: string;
  /** Null or absent when the family logged in one tap and did not say how long (D-024). */
  readonly minutes?: number | null;
  readonly resourceId?: string | null;
  readonly note?: string | null;
  readonly loggedBy: string;
  readonly declaredBy?: string | null;
}

export interface LogEntry {
  readonly clientId: string;
  readonly date: IsoDate;
  readonly kind: LogActivityKind;
  /** Null when not reported. Never defaulted: an invented duration would corrupt L2. */
  readonly minutes: number | null;
  readonly resourceId: string | null;
  /**
   * Free text from the caregiver. Sensitive: it describes the domestic routine of a household with
   * a newborn. A manager only sees it when the family authorised it in the consent — the flag lives
   * on the family, and this field is filtered on read, never dropped on write.
   */
  readonly note: string | null;
  readonly loggedBy: LoggedBy;
  readonly declaredBy: DeclaredBy | null;
}

/** A single session, not a whole day. Anything outside this is a typo or a misunderstanding. */
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 240;
export const MAX_NOTE_LENGTH = 1000;

function invalid(message: string): never {
  throw new DomainError('invalid_log_entry', message);
}

/**
 * Validates one entry. Rejects rather than coerces: a silently corrected duration would corrupt the
 * indicator it feeds, and nobody would ever find out.
 */
export function parseLogEntry(input: LogEntryInput, today: IsoDate): LogEntry {
  if (typeof input.clientId !== 'string' || input.clientId.trim() === '') {
    invalid('La entrada necesita un identificador generado en el dispositivo');
  }

  const date = isoDate(input.date);
  if (date > today) {
    // The queue can flush days late, but an entry cannot be logged for a day that has not happened.
    invalid(`La fecha ${date} está en el futuro`);
  }

  if (!LOG_ACTIVITY_KINDS.includes(input.kind as LogActivityKind)) {
    invalid(`Tipo de actividad no reconocido: ${String(input.kind)}`);
  }

  const minutes = input.minutes ?? null;
  if (
    minutes !== null &&
    (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES)
  ) {
    invalid(`La duración debe ser un número entero de ${MIN_MINUTES} a ${MAX_MINUTES} minutos`);
  }

  if (input.loggedBy !== 'principal' && input.loggedBy !== 'secundario') {
    invalid('Hay que indicar quién registró la entrada');
  }

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > MAX_NOTE_LENGTH) {
    invalid(`La nota no puede pasar de ${MAX_NOTE_LENGTH} caracteres`);
  }

  const resourceId = typeof input.resourceId === 'string' && input.resourceId !== ''
    ? input.resourceId
    : null;

  const declared = typeof input.declaredBy === 'string' ? input.declaredBy.trim() : '';
  if (declared !== '' && !DECLARED_BY.includes(declared as DeclaredBy)) {
    invalid(`Quién hizo la actividad no es una opción válida: ${declared}`);
  }

  return {
    clientId: input.clientId.trim(),
    date,
    kind: input.kind as LogActivityKind,
    minutes,
    resourceId,
    note: note === '' ? null : note,
    loggedBy: input.loggedBy,
    declaredBy: declared === '' ? null : (declared as DeclaredBy),
  };
}

export interface LogSummary {
  readonly entries: number;
  /** Sum of the durations that were reported. Entries without one add nothing (D-024). */
  readonly totalMinutes: number;
  readonly entriesWithMinutes: number;
  readonly byKind: Readonly<Record<LogActivityKind, number>>;
  readonly distinctDays: number;
}

/**
 * What a manager sees by default, and what the pilot reports on: aggregates and adherence, never
 * the free text.
 */
export function summarize(entries: readonly LogEntry[]): LogSummary {
  const byKind: Record<LogActivityKind, number> = {
    lectura: 0,
    cancion: 0,
    juego: 0,
    conversacion: 0,
  };
  const days = new Set<string>();
  let totalMinutes = 0;
  let entriesWithMinutes = 0;

  for (const entry of entries) {
    byKind[entry.kind] += 1;
    if (typeof entry.minutes === 'number') {
      totalMinutes += entry.minutes;
      entriesWithMinutes += 1;
    }
    days.add(entry.date);
  }

  return { entries: entries.length, totalMinutes, entriesWithMinutes, byKind, distinctDays: days.size };
}
