/**
 * Dates for the manager, in Lima time. Peru has no daylight saving, so the offset is a constant;
 * using Intl here would make the output depend on the laptop's locale data.
 */
const LIMA_OFFSET_MS = -5 * 3_600_000;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = MESES.map((mes) => mes.slice(0, 3));

function lima(iso: string | Date): Date {
  return new Date((typeof iso === 'string' ? Date.parse(iso) : iso.getTime()) + LIMA_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayMs = (date: string) => Date.parse(`${date}T00:00:00.000Z`);

export function limaToday(now: Date): string {
  return lima(now).toISOString().slice(0, 10);
}

/** "Hoy 09:14", "Ayer 17:48", "11 sep 11:05". */
export function whenLabel(iso: string, today: string): string {
  const d = lima(iso);
  const date = d.toISOString().slice(0, 10);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const days = Math.round((dayMs(today) - dayMs(date)) / 86_400_000);
  if (days === 0) return `Hoy ${time}`;
  if (days === 1) return `Ayer ${time}`;
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]} ${time}`;
}

export function daysSince(iso: string, today: string): number {
  return Math.max(0, Math.round((dayMs(today) - dayMs(lima(iso).toISOString().slice(0, 10))) / 86_400_000));
}

export function fechaLarga(date: string): string {
  const d = new Date(dayMs(date));
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/**
 * The seven days ending on the cutoff: "3 al 9 de septiembre de 2026". When the week crosses a
 * year boundary the start needs its own year too, or "28 de diciembre al 3 de enero de 2026" reads
 * as if both dates were the same year.
 */
export function rangoSemana(corte: string): string {
  const end = new Date(dayMs(corte));
  const start = new Date(dayMs(corte) - 6 * 86_400_000);
  const startLabel = start.getUTCFullYear() !== end.getUTCFullYear()
    ? `${start.getUTCDate()} de ${MESES[start.getUTCMonth()]} de ${start.getUTCFullYear()}`
    : start.getUTCMonth() === end.getUTCMonth()
      ? `${start.getUTCDate()}`
      : `${start.getUTCDate()} de ${MESES[start.getUTCMonth()]}`;
  return `${startLabel} al ${fechaLarga(corte)}`;
}

/**
 * A short, pseudonymous handle for a family id: the list never shows phone numbers. 6 hex chars
 * (16^6 ≈ 16.7M buckets) instead of 4 (16^4 ≈ 65k): at 50 families a birthday-paradox collision is
 * ~1.8% with 4 chars, versus ~0.007% with 6 — low enough to not worry about in a 50-family pilot.
 */
export function shortId(familyId: string): string {
  return `F-${familyId.replace(/[^0-9a-z]/gi, '').slice(0, 6).toUpperCase()}`;
}
