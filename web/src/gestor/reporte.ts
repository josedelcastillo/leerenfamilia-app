import type { Dashboard } from './api.ts';
import { fechaLarga, limaToday, rangoSemana } from './tiempo.ts';

export interface Bar {
  semana: number;
  activas: number;
  /** Share of the families that reached the week, 0–100. */
  porcentaje: number;
  estado: 'pasada' | 'actual' | 'futura';
}

export function participationBars(d: Dashboard): Bar[] {
  return d.participacionPorSemana.map(({ semana, alcanzaron, activas }) => ({
    semana,
    activas,
    porcentaje: alcanzaron === 0 ? 0 : Math.round((activas / alcanzaron) * 100),
    estado: semana === d.semanaPiloto ? 'actual' : semana > d.semanaPiloto ? 'futura' : 'pasada',
  }));
}

const decimal = (value: number) => value.toFixed(1).replace('.', ',');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Only sentences the data supports. No trend claims ("estable", "creciendo") and nothing about kits:
 * the platform has no kit data (D-026), and a report that sounds sure of something it cannot know
 * is worse than a shorter one.
 */
export function reportSummary(d: Dashboard): string {
  if (d.registradas === 0) return 'Todavía no hay familias registradas en el piloto.';
  const sentences = [
    `${d.activasEstaSemana} de las ${d.registradas} familias registradas leyeron al menos una vez esta semana.`,
  ];
  if (d.registrosSemana > 0) {
    const media = d.activasEstaSemana === 0 ? '' : `, una media de ${decimal(d.registrosSemana / d.activasEstaSemana)} por familia activa`;
    sentences.push(`Hubo ${d.registrosSemana} ${plural(d.registrosSemana, 'registro', 'registros')} en los últimos 7 días${media}.`);
  }
  if (d.mensajesSinResponder > 0) {
    sentences.push(`${d.mensajesSinResponder} ${plural(d.mensajesSinResponder, 'mensaje de familia espera', 'mensajes de familias esperan')} respuesta.`);
  }
  return sentences.join(' ');
}

export const PRIVACY_FOOTER = 'Incluye solo datos agregados; no contiene notas de familias sin consentimiento.';

export function observationLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

export function reportPlainText(d: Dashboard, observaciones: string, generado: Date): string {
  const lines = [
    'Reporte semanal de implementación',
    `Nacidos para Leer Perú, semana ${d.semanaPiloto} de ${d.programWeeks} — ${rangoSemana(d.corte)}`,
    '',
    reportSummary(d),
    '',
    `Familias activas: ${d.activasEstaSemana}`,
    `Registros en 7 días: ${d.registrosSemana}`,
    `Hogares con los dos cuidadores: ${d.ambosCuidadores}`,
  ];
  const obs = observationLines(observaciones);
  if (obs.length > 0) lines.push('', 'Observaciones de campo:', ...obs.map((line) => `- ${line}`));
  lines.push('', `Generado el ${fechaLarga(limaToday(generado))}. ${PRIVACY_FOOTER}`);
  return lines.join('\n');
}

/** Some mail clients truncate `mailto:` URLs past this length. */
export const MAILTO_MAX = 1900;

const TRUNCATION_NOTICE = '\n\n[Resumen recortado: use "Copiar resumen como texto" para el texto completo.]';

/**
 * Builds a `mailto:` URL, cutting the plain body (before encoding, so multi-byte characters do not
 * distort the budget) when it would push the encoded URL past MAILTO_MAX. The full text is always
 * available via "Copiar resumen como texto"; this just keeps the mail client from silently losing
 * the tail of a long report with free-text observations.
 */
export function mailtoHref(subject: string, body: string): string {
  const build = (b: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`;
  const full = build(body);
  if (full.length <= MAILTO_MAX) return full;

  let lo = 0;
  let hi = body.length;
  let best = TRUNCATION_NOTICE;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = body.slice(0, mid) + TRUNCATION_NOTICE;
    if (build(candidate).length <= MAILTO_MAX) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return build(best);
}
