import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate } from '../../src/domain/dates.ts';
import { createFeedback } from '../../src/domain/feedback.ts';
import type { LogEntry } from '../../src/domain/log-entry.ts';
import { buildDashboard } from '../../src/handlers/admin/dashboard.ts';
import type { FamilyRecord, ProgramSummary } from '../../src/handlers/admin/ports.ts';

const TODAY = isoDate('2026-10-06');
const PROGRAM: ProgramSummary = {
  programId: 'piloto-2026', programWeeks: 8, templateName: 'nplp_semana',
  languageCode: 'es', replyTemplateName: 'nplp_respuesta',
};

function entry(date: string, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    clientId: `c-${date}-${Math.random()}`, date: isoDate(date), kind: 'lectura', minutes: 5,
    resourceId: null, note: 'texto privado de la familia', loggedBy: 'principal', declaredBy: null,
    ...overrides,
  };
}

function family(familyId: string, anchor: string, overrides: Partial<FamilyRecord> = {}): FamilyRecord {
  return {
    familyId, programId: PROGRAM.programId, status: 'activa', anchorDate: isoDate(anchor),
    babyName: `Bebé ${familyId}`, freeTextNotesAuthorized: false,
    caregivers: [{ msisdn: '+51987654321', role: 'principal', optIn: true, lastInboundAt: null, relation: null }],
    logEntries: [], feedback: [], deliveredIsoWeeks: [], lastAccessAt: null,
    ...overrides,
  };
}

// fam-1 entered in week 1 of the pilot and logged twice this week (programme week 3).
// fam-2 entered a week later and logged once, in its first week, then nothing.
// fam-3 entered today.
const FAMILIES = [
  family('fam-1', '2026-09-15', {
    logEntries: [entry('2026-10-05'), entry('2026-10-05', { loggedBy: 'secundario' })],
    freeTextNotesAuthorized: true,
  }),
  family('fam-2', '2026-09-22', {
    logEntries: [entry('2026-09-23')],
    feedback: [createFeedback({ id: 'fb-1', type: 'consulta', channel: 'pwa', text: '¿Y el kit?', createdAt: '2026-10-01T10:00:00.000Z' })],
  }),
  family('fam-3', '2026-10-06'),
];

describe('tablero del piloto (D-026)', () => {
  test('cuenta registradas, activas en 7 días y registros de la semana', () => {
    const d = buildDashboard(FAMILIES, PROGRAM, TODAY);
    assert.equal(d.registradas, 3);
    assert.equal(d.activasEstaSemana, 1);
    assert.equal(d.registrosSemana, 2);
    assert.equal(d.registrosTotales, 3);
  });

  test('"sin registros en 7 días" solo cuenta familias que ya llevan una semana', () => {
    // fam-3 entered today: it has not had a chance to log, and flagging it would be noise.
    assert.equal(buildDashboard(FAMILIES, PROGRAM, TODAY).sinRegistros7Dias, 1);
  });

  test('la semana del piloto se cuenta desde la primera familia y no pasa del programa', () => {
    assert.equal(buildDashboard(FAMILIES, PROGRAM, TODAY).semanaPiloto, 4);
    assert.equal(buildDashboard(FAMILIES, PROGRAM, isoDate('2027-03-01')).semanaPiloto, 8);
  });

  test('sin familias, todo en cero y semana 0', () => {
    const d = buildDashboard([], PROGRAM, TODAY);
    assert.equal(d.semanaPiloto, 0);
    assert.equal(d.registradas, 0);
    assert.deepEqual(d.consentimientoNotas, { autorizan: 0, de: 0 });
  });

  test('la participación por semana usa la definición de resumen.csv', () => {
    const d = buildDashboard(FAMILIES, PROGRAM, TODAY);
    assert.deepEqual(d.participacionPorSemana[0], { semana: 1, alcanzaron: 3, activas: 1 });
    assert.deepEqual(d.participacionPorSemana[2], { semana: 3, alcanzaron: 2, activas: 1 });
    assert.equal(d.participacionPorSemana.length, 8);
  });

  test('cuenta los hogares donde registran los dos cuidadores', () => {
    assert.equal(buildDashboard(FAMILIES, PROGRAM, TODAY).ambosCuidadores, 1);
  });

  test('cuenta el consentimiento de notas y los mensajes sin responder', () => {
    const d = buildDashboard(FAMILIES, PROGRAM, TODAY);
    assert.deepEqual(d.consentimientoNotas, { autorizan: 1, de: 3 });
    assert.equal(d.mensajesSinResponder, 1);
  });

  test('no lleva texto libre ni nombres: solo agregados', () => {
    const serialized = JSON.stringify(buildDashboard(FAMILIES, PROGRAM, TODAY));
    assert.equal(serialized.includes('texto privado'), false);
    assert.equal(serialized.includes('Bebé'), false);
    assert.equal(serialized.includes('kit'), false);
  });

  test('una familia de baja cuenta como registrada, pero no como "sin registros en 7 días"', () => {
    const conBaja = [...FAMILIES, family('fam-4', '2026-09-15', { status: 'baja' })];
    const d = buildDashboard(conBaja, PROGRAM, TODAY);
    assert.equal(d.registradas, 4);
    assert.equal(d.consentimientoNotas.de, 4);
    assert.equal(d.sinRegistros7Dias, 1, 'fam-4 opted out: it is not the team\'s pending work');
  });
});
