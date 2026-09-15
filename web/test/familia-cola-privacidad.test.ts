import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { QueuedItem } from '../src/shared/sync-queue.ts';
import { describeQueued, visibleQueue } from '../src/app/cola.ts';
import {
  CONSENT_TEXT_VERSION,
  SUPPRESSION_REQUEST_TEXT,
  consentPayload,
  displayedNotesConsent,
  effectiveNotesConsent,
  suppressionPayload,
} from '../src/app/privacidad.ts';

function item(kind: QueuedItem['kind'], payload: Record<string, unknown>, queuedAt = '2026-09-14T08:00:00.000Z'): QueuedItem {
  return { clientId: String(payload['clientId'] ?? kind), kind, payload, queuedAt, attempts: 0 };
}

describe('cola visible para la familia', () => {
  test('oculta los registros de acceso, que la familia nunca hizo a mano', () => {
    const visible = visibleQueue([item('acceso', { clientId: 'a' }), item('bitacora', { clientId: 'b' })]);
    assert.deepEqual(visible.map((i) => i.clientId), ['b']);
  });

  test('describe cada ítem en palabras', () => {
    const today = '2026-09-14';
    assert.deepEqual(
      describeQueued(item('bitacora', { kind_actividad: 'lectura', minutes: 5, date: '2026-09-14' }), today),
      { titulo: 'Lectura, 5 minutos', cuando: 'Hoy' },
    );
    assert.deepEqual(
      describeQueued(item('bitacora', { kind_actividad: 'cancion', minutes: null, date: '2026-09-13' }), today),
      { titulo: 'Canción', cuando: 'Ayer' },
    );
    assert.equal(describeQueued(item('feedback', { createdAt: '2026-09-13T20:00:00.000Z' }), today).titulo, 'Mensaje al equipo');
    assert.equal(describeQueued(item('consentimiento', { at: '2026-09-14T08:00:00.000Z' }), today).titulo, 'Cambio de privacidad');
  });
});

describe('privacidad', () => {
  test('el estado efectivo es el último cambio en cola, o el del servidor', () => {
    assert.equal(effectiveNotesConsent(true, []), true);
    assert.equal(effectiveNotesConsent(null, []), null);
    const queued = [
      item('consentimiento', { clientId: 'a', notesAuthorized: false }, '2026-09-14T08:00:00.000Z'),
      item('consentimiento', { clientId: 'b', notesAuthorized: true }, '2026-09-14T09:00:00.000Z'),
    ];
    assert.equal(effectiveNotesConsent(false, queued), true);
  });

  describe('lo que muestra el interruptor', () => {
    const revoke = [item('consentimiento', { clientId: 'r', notesAuthorized: false })];

    test('un cambio en cola gana sobre todo lo demás', () => {
      assert.equal(displayedNotesConsent(true, revoke, true, true), false);
      assert.equal(displayedNotesConsent(true, revoke, null, false), false);
    });

    test('con la cola vacía y la relectura pendiente, muestra lo último que eligió la familia', () => {
      // The change synced and left the queue, but the server value in hand is from before it.
      assert.equal(displayedNotesConsent(true, [], false, false), false);
    });

    test('con la cola vacía y el valor del servidor ya releído, manda el servidor', () => {
      // The server is the truth: an older change it ignored (D-025) shows the switch flip back.
      assert.equal(displayedNotesConsent(true, [], false, true), true);
    });

    test('si la familia no cambió nada, muestra el servidor', () => {
      assert.equal(displayedNotesConsent(true, [], null, false), true);
      assert.equal(displayedNotesConsent(null, [], null, false), null);
    });
  });

  test('el cambio lleva fecha, versión del texto y el valor nuevo', () => {
    assert.deepEqual(consentPayload('c', false, new Date('2026-09-14T08:00:00.000Z')), {
      clientId: 'c', notesAuthorized: false, at: '2026-09-14T08:00:00.000Z', version: CONSENT_TEXT_VERSION,
    });
  });

  test('el pedido de borrado es un feedback de tipo pedido con texto fijo (D-027)', () => {
    const payload = suppressionPayload('p', new Date('2026-09-14T08:00:00.000Z'));
    assert.equal(payload['type'], 'pedido');
    assert.equal(payload['text'], SUPPRESSION_REQUEST_TEXT);
  });
});
