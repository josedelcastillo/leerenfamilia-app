import type { ActivityKind, DeclaredBy } from '../shared/api.ts';

/**
 * Every sentence the family screens build from data. Kept apart so it can be tested with
 * `node --test`, and so the voice stays in one place: second person, no diminutives, and nothing
 * that reads as a deficit — no streaks, no goals, no counters that go down (handoff §Interacciones).
 */

export const KIND_LABEL: Record<ActivityKind, string> = {
  lectura: 'Lectura',
  cancion: 'Canción',
  juego: 'Juego',
  conversacion: 'Conversación',
};

export const DECLARED_LABEL: Record<DeclaredBy, string> = {
  mama: 'Mamá',
  papa: 'Papá',
  otra: 'Otra persona',
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** The device's own calendar date, which is what a caregiver means by "today". */
export function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** Log entries carry a day, not a time, so this is as precise as the data allows. */
export function relativeDay(date: string, today: string): string {
  const days = Math.round((utc(today).getTime() - utc(date).getTime()) / 86_400_000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  const d = utc(date);
  if (days > 1 && days < 7) return DIAS[d.getUTCDay()]!;
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function progressHeadline(total: number, weeks: number): string {
  const noun = total === 1 ? 'lectura registrada' : 'lecturas registradas';
  return weeks <= 1 ? `${noun} esta semana` : `${noun} en ${weeks} semanas`;
}

export function entryDetail(entry: {
  kind: string;
  declaredBy: DeclaredBy | null;
  minutes: number | null;
}): string {
  const parts: string[] = [];
  if (entry.declaredBy !== null) parts.push(DECLARED_LABEL[entry.declaredBy]);
  if (entry.minutes !== null) parts.push(entry.minutes === 1 ? '1 minuto' : `${entry.minutes} minutos`);
  const who = parts.join(', ');
  const kind = KIND_LABEL[entry.kind as ActivityKind] ?? entry.kind;
  if (entry.kind === 'lectura') return who === '' ? kind : who;
  return who === '' ? kind : `${kind} · ${who}`;
}

export function pendingLabel(count: number): string {
  return count === 1 ? '1 registro por enviar' : `${count} registros por enviar`;
}

export function colaHeadline(count: number): string {
  if (count === 0) return 'No tienes registros esperando señal.';
  return count === 1 ? 'Tienes 1 registro esperando señal.' : `Tienes ${count} registros esperando señal.`;
}

export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
