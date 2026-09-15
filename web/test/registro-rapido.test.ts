import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_COPY,
  MINUTE_OPTIONS,
  WHO_OPTIONS,
  detailsPayload,
  firstTapPayload,
} from '../src/app/registro-rapido.ts';

describe('registro en un toque', () => {
  const first = firstTapPayload({ clientId: 'x', date: '2026-09-14', kind: 'lectura', resourceId: null });

  test('el primer toque no pide ni inventa nada opcional', () => {
    assert.deepEqual(first, {
      clientId: 'x', date: '2026-09-14', kind_actividad: 'lectura',
      minutes: null, resourceId: null, note: null, declaredBy: null,
    });
  });

  test('los detalles reescriben la misma entrada: mismo clientId y misma fecha', () => {
    const details = detailsPayload(first, { minutes: 5, declaredBy: 'papa', note: '  nos miró  ' });
    assert.equal(details['clientId'], 'x');
    assert.equal(details['date'], '2026-09-14');
    assert.equal(details['minutes'], 5);
    assert.equal(details['declaredBy'], 'papa');
    assert.equal(details['note'], 'nos miró');
  });

  test('una nota vacía queda en null', () => {
    assert.equal(detailsPayload(first, { minutes: null, declaredBy: null, note: '   ' })['note'], null);
  });

  test('las opciones son las del diseño', () => {
    assert.deepEqual(MINUTE_OPTIONS.map((o) => o.label), ['2 min', '5 min', '10+ min']);
    assert.deepEqual(WHO_OPTIONS.map((o) => o.label), ['Mamá', 'Papá', 'Otra']);
    assert.equal(KIND_COPY.lectura.boton, 'Registrar lectura');
    assert.equal(KIND_COPY.cancion.hecho, 'Ya la cantamos');
  });
});
