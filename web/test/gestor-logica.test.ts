import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Dashboard, FamilyRow } from '../src/gestor/api.ts';
import { daysSince, limaToday, rangoSemana, shortId, whenLabel } from '../src/gestor/tiempo.ts';
import { caregiversLabel, estadoFamilia, filterRows, lastEntryLabel } from '../src/gestor/familias-estado.ts';
import { auditRow } from '../src/gestor/auditoria.ts';
import { MAILTO_MAX, mailtoHref, participationBars, reportPlainText, reportSummary } from '../src/gestor/reporte.ts';

function row(overrides: Partial<FamilyRow> = {}): FamilyRow {
  return {
    familyId: 'a1b2c3d4-0000', babyName: 'Mateo', status: 'activa', programWeek: 3, finished: false,
    logEntriesLast7Days: 2, minutesLast7Days: 10, lastActivityAt: null, openFeedback: 0,
    caregiversOptedIn: 1, deliveries: 2, lastEntryDate: '2026-09-13', totalEntries: 5,
    caregivers: [{ role: 'principal', relation: 'mama', optIn: true }], ...overrides,
  };
}

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    corte: '2026-09-09', programWeeks: 8, semanaPiloto: 5, registradas: 41, activasEstaSemana: 33,
    registrosSemana: 89, registrosTotales: 112, ambosCuidadores: 18, sinRegistros7Dias: 8,
    mensajesSinResponder: 3, consentimientoNotas: { autorizan: 29, de: 41 },
    participacionPorSemana: [1, 2, 3, 4, 5, 6, 7, 8].map((semana) => ({ semana, alcanzaron: semana <= 5 ? 41 : 0, activas: semana <= 5 ? 30 : 0 })),
    ...overrides,
  };
}

describe('tiempo (hora de Lima, sin horario de verano)', () => {
  test('limaToday resta cinco horas', () => {
    assert.equal(limaToday(new Date('2026-09-15T03:00:00.000Z')), '2026-09-14');
  });
  test('whenLabel: hoy, ayer o fecha corta, con hora de Lima', () => {
    assert.equal(whenLabel('2026-09-14T14:14:00.000Z', '2026-09-14'), 'Hoy 09:14');
    assert.equal(whenLabel('2026-09-13T22:48:00.000Z', '2026-09-14'), 'Ayer 17:48');
    assert.equal(whenLabel('2026-09-11T16:05:00.000Z', '2026-09-14'), '11 sep 11:05');
  });
  test('daysSince, rangoSemana y shortId', () => {
    assert.equal(daysSince('2026-09-12T10:00:00.000Z', '2026-09-14'), 2);
    assert.equal(rangoSemana('2026-09-09'), '3 al 9 de septiembre de 2026');
    assert.equal(rangoSemana('2026-09-03'), '28 de agosto al 3 de septiembre de 2026');
    assert.equal(shortId('a1b2c3d4-0000'), 'F-A1B2C3');
  });
  test('rangoSemana incluye el año de inicio cuando la semana cruza el 1 de enero', () => {
    assert.equal(rangoSemana('2026-01-03'), '28 de diciembre de 2025 al 3 de enero de 2026');
  });
});

describe('estado de una familia', () => {
  test('activa, en pausa, sin activar, de baja', () => {
    assert.equal(estadoFamilia(row()), 'activa');
    assert.equal(estadoFamilia(row({ logEntriesLast7Days: 0 })), 'en_pausa');
    assert.equal(estadoFamilia(row({ logEntriesLast7Days: 0, totalEntries: 0 })), 'sin_activar');
    assert.equal(estadoFamilia(row({ status: 'baja' })), 'de_baja');
  });
  test('cuidadores por relación, con el rol si no la declararon', () => {
    assert.equal(caregiversLabel(row().caregivers), 'Mamá');
    assert.equal(caregiversLabel([
      { role: 'principal', relation: null, optIn: true },
      { role: 'secundario', relation: 'papa', optIn: true },
    ]), 'Principal, Papá');
  });
  test('último registro', () => {
    assert.equal(lastEntryLabel(null, '2026-09-14'), 'Sin registros');
    assert.equal(lastEntryLabel('2026-09-14', '2026-09-14'), 'Hoy');
    assert.equal(lastEntryLabel('2026-09-13', '2026-09-14'), 'Hace 1 día');
    assert.equal(lastEntryLabel('2026-09-05', '2026-09-14'), 'Hace 9 días');
  });
  test('filtra por texto, semana y estado', () => {
    const rows = [row(), row({ familyId: 'b', babyName: 'Luz', programWeek: 1, logEntriesLast7Days: 0 })];
    assert.equal(filterRows(rows, { query: 'luz', semana: null, estado: null }).length, 1);
    assert.equal(filterRows(rows, { query: '', semana: 3, estado: null }).length, 1);
    assert.equal(filterRows(rows, { query: '', semana: null, estado: 'en_pausa' })[0]?.babyName, 'Luz');
  });
});

describe('auditoría', () => {
  test('una exportación se marca en alerta y dice qué se exportó', () => {
    const r = auditRow({ gestorSub: 's', gestorEmail: 'maria.p@leerenfamilia.pe', action: 'exportar_datos', familyId: null, at: '2026-09-14T14:02:00.000Z', detail: 'bitacora' }, '2026-09-14');
    assert.deepEqual(r, { cuando: 'Hoy 09:02', quien: 'maria.p', que: 'Bitácora completa', accion: 'Exportar', alerta: true });
  });
  test('abrir una ficha nombra a la familia por su id corto', () => {
    const r = auditRow({ gestorSub: 's', gestorEmail: 'jose.d@x.pe', action: 'ver_detalle_familia', familyId: 'a1b2c3d4-0000', at: '2026-09-13T22:48:00.000Z' }, '2026-09-14');
    assert.equal(r.que, 'Familia F-A1B2C3');
    assert.equal(r.alerta, false);
  });
});

describe('reporte semanal', () => {
  test('barras: pasadas, la actual en coral, futuras vacías', () => {
    const bars = participationBars(dashboard());
    assert.equal(bars.length, 8);
    assert.equal(bars[4]?.estado, 'actual');
    assert.equal(bars[0]?.estado, 'pasada');
    assert.equal(bars[5]?.estado, 'futura');
    assert.equal(bars[0]?.porcentaje, 73);
  });
  test('el resumen solo afirma lo que los datos dicen', () => {
    const text = reportSummary(dashboard());
    assert.match(text, /33 de las 41 familias registradas leyeron al menos una vez esta semana\./);
    assert.match(text, /89 registros en los últimos 7 días, una media de 2,7 por familia activa\./);
    assert.match(text, /3 mensajes de familias esperan respuesta\./);
    assert.equal(/kit/i.test(text), false, 'no hay datos de kits, así que no los menciona');
  });
  test('sin familias no divide por cero', () => {
    assert.equal(reportSummary(dashboard({ registradas: 0, activasEstaSemana: 0, registrosSemana: 0, mensajesSinResponder: 0 })), 'Todavía no hay familias registradas en el piloto.');
  });
  test('el texto plano incluye las observaciones y el pie de privacidad', () => {
    const text = reportPlainText(dashboard(), 'Entregas en el control\n\nMás lecturas de noche', new Date('2026-09-10T15:00:00.000Z'));
    assert.match(text, /- Entregas en el control\n- Más lecturas de noche/);
    assert.match(text, /no contiene notas de familias sin consentimiento/);
  });
  test('mailtoHref no toca un cuerpo corto', () => {
    const href = mailtoHref('Reporte semanal', 'Cuerpo corto');
    assert.equal(href, `mailto:?subject=${encodeURIComponent('Reporte semanal')}&body=${encodeURIComponent('Cuerpo corto')}`);
  });
  test('mailtoHref recorta un cuerpo largo para no exceder MAILTO_MAX', () => {
    const href = mailtoHref('Reporte semanal', 'x'.repeat(5000));
    assert.ok(href.length <= MAILTO_MAX, `href.length fue ${href.length}`);
    assert.match(decodeURIComponent(href), /Resumen recortado: use "Copiar resumen como texto" para el texto completo\./);
  });
  test('el pie de página usa la fecha de Lima, no la UTC', () => {
    // 2026-09-10T01:00:00.000Z is 2026-09-09 20:00 in Lima; the report must not say "10 de septiembre".
    const text = reportPlainText(dashboard(), '', new Date('2026-09-10T01:00:00.000Z'));
    assert.match(text, /Generado el 9 de septiembre de 2026/);
  });
});
