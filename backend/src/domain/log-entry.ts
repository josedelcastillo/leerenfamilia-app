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

export interface LogEntryInput {
  /** Generated on the device. It is what makes a queued retry safe to replay. */
  readonly clientId: string;
  readonly date: string;
  readonly kind: string;
  readonly minutes: number;
  readonly resourceId?: string | null;
  readonly note?: string | null;
  readonly loggedBy: string;
}

export interface LogEntry {
  readonly clientId: string;
  readonly date: IsoDate;
  readonly kind: LogActivityKind;
  readonly minutes: number;
  readonly resourceId: string | null;
  /**
   * Free text from the caregiver. Sensitive: it describes the domestic routine of a household with
   * a newborn. A manager only sees it when the family authorised it in the consent — the flag lives
   * on the family, and this field is filtered on read, never dropped on write.
   */
  readonly note: string | null;
  readonly loggedBy: LoggedBy;
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

  if (!Number.isInteger(input.minutes) || input.minutes < MIN_MINUTES || input.minutes > MAX_MINUTES) {
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

  return {
    clientId: input.clientId.trim(),
    date,
    kind: input.kind as LogActivityKind,
    minutes: input.minutes,
    resourceId,
    note: note === '' ? null : note,
    loggedBy: input.loggedBy,
  };
}

export interface LogSummary {
  readonly entries: number;
  readonly totalMinutes: number;
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

  for (const entry of entries) {
    byKind[entry.kind] += 1;
    totalMinutes += entry.minutes;
    days.add(entry.date);
  }

  return { entries: entries.length, totalMinutes, byKind, distinctDays: days.size };
}
