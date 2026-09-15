import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_LABEL,
  colaHeadline,
  entryDetail,
  formatClock,
  pendingLabel,
  progressHeadline,
  relativeDay,
} from '../src/app/formato.ts';

describe('relativeDay', () => {
  test('hoy, ayer, día de la semana y fecha', () => {
    assert.equal(relativeDay('2026-09-14', '2026-09-14'), 'Hoy');
    assert.equal(relativeDay('2026-09-13', '2026-09-14'), 'Ayer');
    assert.equal(relativeDay('2026-09-09', '2026-09-14'), 'Miércoles');
    assert.equal(relativeDay('2026-09-01', '2026-09-14'), '1 de septiembre');
  });
});

describe('progressHeadline', () => {
  test('dice cuántas en cuántas semanas, sin metas ni porcentajes', () => {
    assert.equal(progressHeadline(14, 5), 'lecturas registradas en 5 semanas');
    assert.equal(progressHeadline(3, 1), 'lecturas registradas esta semana');
    assert.equal(progressHeadline(1, 1), 'lectura registrada esta semana');
    assert.equal(progressHeadline(1, 3), 'lectura registrada en 3 semanas');
  });
});

describe('entryDetail', () => {
  test('quién y cuánto, si se dijo; el tipo si no es lectura', () => {
    assert.equal(entryDetail({ kind: 'lectura', declaredBy: 'mama', minutes: 5 }), 'Mamá, 5 minutos');
    assert.equal(entryDetail({ kind: 'lectura', declaredBy: null, minutes: null }), 'Lectura');
    assert.equal(entryDetail({ kind: 'cancion', declaredBy: 'papa', minutes: null }), 'Canción · Papá');
    assert.equal(entryDetail({ kind: 'lectura', declaredBy: null, minutes: 1 }), '1 minuto');
  });
});

describe('cola', () => {
  test('pendingLabel y colaHeadline en singular y plural', () => {
    assert.equal(pendingLabel(1), '1 registro por enviar');
    assert.equal(pendingLabel(3), '3 registros por enviar');
    assert.equal(colaHeadline(0), 'No tienes registros esperando señal.');
    assert.equal(colaHeadline(1), 'Tienes 1 registro esperando señal.');
    assert.equal(colaHeadline(3), 'Tienes 3 registros esperando señal.');
  });
});

describe('formatClock', () => {
  test('minutos y segundos para el reproductor', () => {
    assert.equal(formatClock(38), '0:38');
    assert.equal(formatClock(112.4), '1:52');
    assert.equal(formatClock(Number.NaN), '0:00');
  });
});

test('KIND_LABEL cubre los cuatro tipos', () => {
  assert.deepEqual(Object.keys(KIND_LABEL).sort(), ['cancion', 'conversacion', 'juego', 'lectura']);
});
