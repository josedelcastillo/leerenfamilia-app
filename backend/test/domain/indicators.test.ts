import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate } from '../../src/domain/dates.ts';
import { createFeedback, type Feedback } from '../../src/domain/feedback.ts';
import type { LogEntry } from '../../src/domain/log-entry.ts';
import {
  OBJETIVO_PRIMERA_RESPUESTA_HORAS,
  UMBRAL_FAMILIA_ADHERENTE,
  UMBRAL_SEMANA_ACTIVA,
  cohortIndicators,
  familyIndicators,
  type DeliverySummary,
  type FamilyIndicatorInput,
} from '../../src/domain/indicators.ts';

const ANCHOR = isoDate('2026-09-01');
const CUTOFF = isoDate('2026-10-27'); // week 9 — the whole programme is behind us
const WEEKS = 8;

function entryOnWeek(week: number, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    clientId: `c-${week}-${Math.random()}`,
    date: addDays(ANCHOR, (week - 1) * 7),
    kind: 'lectura',
    minutes: 10,
    resourceId: null,
    note: null,
    loggedBy: 'principal',
    ...overrides,
  };
}

function delivery(week: number, overrides: Partial<DeliverySummary> = {}): DeliverySummary {
  return {
    isoWeek: `2026-W${String(35 + week).padStart(2, '0')}`,
    week,
    sent: 1, delivered: 1, read: 1, failed: 0, billable: 1,
    categories: { utility: 1 },
    ...overrides,
  };
}

function input(overrides: Partial<FamilyIndicatorInput> = {}): FamilyIndicatorInput {
  return {
    familyId: 'fam-1',
    clinic: 'CLINICA-DEMO',
    status: 'activa',
    anchorDate: ANCHOR,
    enrolledAt: '2026-09-01T10:00:00.000Z',
    caregivers: [{ role: 'principal', optIn: true, optOutAt: null, lastInboundAt: null }],
    logEntries: [],
    deliveries: [],
    feedback: [],
    ...overrides,
  };
}

describe('adherencia por familia', () => {
  test('una familia sin registros tiene adherencia cero, no nula', () => {
    const result = familyIndicators(input(), CUTOFF, WEEKS);
    assert.equal(result.semanasTranscurridas, 8);
    assert.equal(result.semanasActivas, 0);
    assert.equal(result.adherencia, 0);
    assert.equal(result.esAdherente, false);
  });

  test('una semana cuenta como activa con una sola entrada', () => {
    assert.equal(UMBRAL_SEMANA_ACTIVA, 1);
    const result = familyIndicators(input({ logEntries: [entryOnWeek(1)] }), CUTOFF, WEEKS);
    assert.equal(result.semanasActivas, 1);
    assert.equal(result.adherencia, 1 / 8);
  });

  test('varias entradas en la misma semana cuentan como una semana activa', () => {
    // Three entries on one week is not the same adherence as one entry on three weeks.
    const result = familyIndicators(
      input({ logEntries: [entryOnWeek(1), entryOnWeek(1), entryOnWeek(1)] }), CUTOFF, WEEKS);
    assert.equal(result.entradas, 3);
    assert.equal(result.semanasActivas, 1);
  });

  test('una familia adherente supera el umbral propuesto', () => {
    assert.equal(UMBRAL_FAMILIA_ADHERENTE, 0.5);
    const cuatro = familyIndicators(
      input({ logEntries: [1, 2, 3, 4].map((w) => entryOnWeek(w)) }), CUTOFF, WEEKS);
    assert.equal(cuatro.adherencia, 0.5);
    assert.equal(cuatro.esAdherente, true);

    const tres = familyIndicators(
      input({ logEntries: [1, 2, 3].map((w) => entryOnWeek(w)) }), CUTOFF, WEEKS);
    assert.equal(tres.esAdherente, false);
  });

  test('el denominador es lo que la familia lleva, no las 8 semanas', () => {
    // With staggered enrolment (D-003) most families have not reached week 8 yet, and counting
    // weeks that have not happened as missed would understate every recent family.
    const semana3 = addDays(ANCHOR, 14);
    const result = familyIndicators(input({ logEntries: [entryOnWeek(1), entryOnWeek(2)] }), semana3, WEEKS);
    assert.equal(result.semanasTranscurridas, 3);
    assert.equal(result.adherencia, 2 / 3);
  });

  test('el denominador nunca pasa de la duración del programa', () => {
    const result = familyIndicators(input(), addDays(ANCHOR, 200), WEEKS);
    assert.equal(result.semanasTranscurridas, 8);
  });

  test('adherencia nula antes de que el programa empiece', () => {
    const result = familyIndicators(input(), addDays(ANCHOR, -1), WEEKS);
    assert.equal(result.semanasTranscurridas, 0);
    assert.equal(result.adherencia, null);
    assert.equal(result.esAdherente, false);
  });
});

describe('detalle de la bitácora', () => {
  test('separa días distintos de número de entradas', () => {
    const sameDay = { date: addDays(ANCHOR, 3) };
    const result = familyIndicators(input({
      logEntries: [entryOnWeek(1, sameDay), entryOnWeek(1, sameDay), entryOnWeek(2)],
    }), CUTOFF, WEEKS);
    assert.equal(result.entradas, 3);
    assert.equal(result.diasDistintos, 2);
  });

  test('cuenta días con lectura, que es la métrica prometida a la clínica', () => {
    const result = familyIndicators(input({
      logEntries: [
        entryOnWeek(1, { kind: 'lectura' }),
        entryOnWeek(2, { kind: 'cancion' }),
        entryOnWeek(3, { kind: 'lectura' }),
      ],
    }), CUTOFF, WEEKS);
    assert.equal(result.diasConLectura, 2);
    assert.equal(result.entradasPorTipo.lectura, 2);
    assert.equal(result.entradasPorTipo.cancion, 1);
  });

  test('distingue quién de los dos cuidadores registró', () => {
    // One of the few things the pilot can actually measure about the household.
    const result = familyIndicators(input({
      logEntries: [
        entryOnWeek(1, { loggedBy: 'principal' }),
        entryOnWeek(2, { loggedBy: 'secundario' }),
        entryOnWeek(3, { loggedBy: 'secundario' }),
      ],
    }), CUTOFF, WEEKS);
    assert.equal(result.entradasCuidadorPrincipal, 1);
    assert.equal(result.entradasCuidadorSecundario, 2);
  });

  test('suma minutos', () => {
    const result = familyIndicators(input({
      logEntries: [entryOnWeek(1, { minutes: 15 }), entryOnWeek(2, { minutes: 5 })],
    }), CUTOFF, WEEKS);
    assert.equal(result.minutosTotales, 20);
  });
});

describe('bajas', () => {
  test('registra en qué semana del programa se dio de baja la familia', () => {
    const result = familyIndicators(input({
      caregivers: [{ role: 'principal', optIn: false, optOutAt: '2026-09-16T10:00:00.000Z', lastInboundAt: null }],
    }), CUTOFF, WEEKS);
    assert.equal(result.semanaBaja, 3);
  });

  test('no marca baja si queda algún cuidador recibiendo mensajes', () => {
    const result = familyIndicators(input({
      caregivers: [
        { role: 'principal', optIn: true, optOutAt: null, lastInboundAt: null },
        { role: 'secundario', optIn: false, optOutAt: '2026-09-16T10:00:00.000Z', lastInboundAt: null },
      ],
    }), CUTOFF, WEEKS);
    assert.equal(result.semanaBaja, null);
    assert.equal(result.cuidadoresConOptIn, 1);
  });
});

describe('envíos y feedback', () => {
  test('suma envíos, entregas, lecturas y mensajes facturables', () => {
    const result = familyIndicators(input({
      deliveries: [delivery(1), delivery(2, { read: 0 }), delivery(3, { delivered: 0, read: 0, billable: 0 })],
    }), CUTOFF, WEEKS);
    assert.equal(result.enviosRealizados, 3);
    assert.equal(result.enviosEntregados, 2);
    assert.equal(result.enviosLeidos, 1);
    assert.equal(result.mensajesFacturables, 2);
  });

  test('mide horas hasta la primera respuesta', () => {
    const answered = createFeedback({
      id: 'f1', type: 'consulta', channel: 'whatsapp', text: 'x', createdAt: '2026-09-10T00:00:00.000Z',
    });
    const withReply: Feedback = {
      ...answered,
      status: 'respondido',
      replies: [
        { text: 'r1', gestorSub: 'g', at: '2026-09-11T00:00:00.000Z' },
        { text: 'r2', gestorSub: 'g', at: '2026-09-15T00:00:00.000Z' },
      ],
    };
    const result = familyIndicators(input({ feedback: [withReply] }), CUTOFF, WEEKS);
    // The first reply is what the family waited for; later corrections do not reset the clock.
    assert.deepEqual(result.horasPrimeraRespuesta, [24]);
  });

  test('un feedback sin responder no aporta tiempo de respuesta', () => {
    const open = createFeedback({ id: 'f1', type: 'consulta', channel: 'pwa', text: 'x', createdAt: '2026-09-10T00:00:00.000Z' });
    const result = familyIndicators(input({ feedback: [open] }), CUTOFF, WEEKS);
    assert.deepEqual(result.horasPrimeraRespuesta, []);
    assert.equal(result.feedbackAbierto, 1);
  });

  test('cuenta cuánto feedback entró por WhatsApp', () => {
    const result = familyIndicators(input({
      feedback: [
        createFeedback({ id: 'a', type: 'consulta', channel: 'whatsapp', text: 'x', createdAt: '2026-09-10T00:00:00.000Z' }),
        createFeedback({ id: 'b', type: 'pedido', channel: 'pwa', text: 'y', createdAt: '2026-09-11T00:00:00.000Z' }),
      ],
    }), CUTOFF, WEEKS);
    assert.equal(result.feedbackTotal, 2);
    assert.equal(result.feedbackPorWhatsapp, 1);
  });
});

describe('indicadores de la cohorte', () => {
  function cohort(inputs: FamilyIndicatorInput[], cutoff = CUTOFF) {
    const perFamily = inputs.map((i) => familyIndicators(i, cutoff, WEEKS));
    return cohortIndicators(perFamily, inputs, WEEKS);
  }

  test('una cohorte vacía no divide por cero', () => {
    const result = cohort([]);
    assert.equal(result.familias, 0);
    assert.equal(result.adherenciaPromedio, null);
    assert.equal(result.tasaEntrega, null);
    assert.equal(result.primeraRespuestaMedianaHoras, null);
    assert.equal(result.proporcionAdherentes, null);
  });

  test('promedia y calcula la mediana de la adherencia', () => {
    const result = cohort([
      input({ familyId: 'a', logEntries: [1, 2, 3, 4, 5, 6, 7, 8].map((w) => entryOnWeek(w)) }),
      input({ familyId: 'b', logEntries: [entryOnWeek(1), entryOnWeek(2), entryOnWeek(3), entryOnWeek(4)] }),
      input({ familyId: 'c' }),
    ]);
    assert.equal(result.familias, 3);
    assert.equal(result.adherenciaPromedio, (1 + 0.5 + 0) / 3);
    assert.equal(result.adherenciaMediana, 0.5);
    assert.equal(result.familiasAdherentes, 2);
  });

  test('la retención solo cuenta a las familias que llegaron a esa semana', () => {
    // With staggered enrolment most of the cohort has not reached the later weeks.
    const semana3 = addDays(ANCHOR, 14);
    const result = cohort([
      input({ familyId: 'vieja', logEntries: [entryOnWeek(1), entryOnWeek(2), entryOnWeek(3)] }),
      input({ familyId: 'nueva', anchorDate: semana3, logEntries: [] }),
    ], semana3);

    const semana1 = result.retencionPorSemana.find((r) => r.semana === 1);
    const semana3row = result.retencionPorSemana.find((r) => r.semana === 3);
    assert.equal(semana1?.alcanzaron, 2, 'las dos llegaron a la semana 1');
    assert.equal(semana1?.activas, 1);
    assert.equal(semana3row?.alcanzaron, 1, 'solo una llegó a la semana 3');
    assert.equal(semana3row?.tasa, 1);
  });

  test('una semana que nadie alcanzó tiene tasa nula, no cero', () => {
    // Zero would read as "everybody dropped out"; null reads as "no data yet", which is the truth.
    const result = cohort([input({ logEntries: [entryOnWeek(1)] })], addDays(ANCHOR, 3));
    assert.equal(result.retencionPorSemana.find((r) => r.semana === 5)?.tasa, null);
  });

  test('calcula tasas de entrega y de lectura', () => {
    const result = cohort([
      input({ familyId: 'a', deliveries: [delivery(1), delivery(2, { delivered: 0, read: 0 })] }),
      input({ familyId: 'b', deliveries: [delivery(1, { read: 0 })] }),
    ]);
    assert.equal(result.enviosRealizados, 3);
    assert.equal(result.tasaEntrega, 2 / 3);
    assert.equal(result.tasaLectura, 1 / 2);
  });

  test('agrupa mensajes por categoría de precio de Meta', () => {
    // Whether the template lands as utility or marketing is the difference in the invoice.
    const result = cohort([
      input({ familyId: 'a', deliveries: [delivery(1, { categories: { utility: 1 } })] }),
      input({ familyId: 'b', deliveries: [delivery(1, { categories: { marketing: 1 } })] }),
    ]);
    assert.deepEqual(result.mensajesPorCategoria, { utility: 1, marketing: 1 });
  });

  test('reporta mediana, p90 y cumplimiento del objetivo de respuesta', () => {
    const answered = (id: string, hours: number) => ({
      ...createFeedback({ id, type: 'consulta', channel: 'pwa', text: 'x', createdAt: '2026-09-10T00:00:00.000Z' }),
      status: 'respondido' as const,
      replies: [{ text: 'r', gestorSub: 'g', at: new Date(Date.parse('2026-09-10T00:00:00.000Z') + hours * 3600_000).toISOString() }],
    });

    const result = cohort([
      input({ familyId: 'a', feedback: [answered('f1', 2), answered('f2', 10)] }),
      input({ familyId: 'b', feedback: [answered('f3', 100)] }),
    ]);
    assert.equal(result.primeraRespuestaMedianaHoras, 10);
    assert.equal(result.primeraRespuestaP90Horas, 100);
    assert.equal(OBJETIVO_PRIMERA_RESPUESTA_HORAS, 48);
    assert.equal(result.respuestasDentroDelObjetivo, 2 / 3);
  });

  test('cuenta bajas y su tasa', () => {
    const result = cohort([
      input({ familyId: 'a' }),
      input({ familyId: 'b', caregivers: [{ role: 'principal', optIn: false, optOutAt: '2026-09-16T00:00:00.000Z', lastInboundAt: null }] }),
    ]);
    assert.equal(result.familiasConBaja, 1);
    assert.equal(result.tasaBaja, 0.5);
  });
});
