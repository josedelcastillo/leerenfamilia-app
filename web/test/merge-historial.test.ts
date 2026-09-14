import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { LogEntry } from '../src/shared/api.ts';
import type { QueuedItem } from '../src/shared/sync-queue.ts';
import { mergeHistorial } from '../src/app/components/historial.ts';
import { mergeThread } from '../src/app/mensajes-thread.ts';

function stored(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    clientId: 'a', date: '2026-09-19', kind: 'lectura', minutes: 10,
    resourceId: null, note: null, loggedBy: 'principal', ...overrides,
  };
}

function queued(clientId: string, payload: Record<string, unknown>): QueuedItem {
  return {
    clientId,
    kind: 'bitacora',
    payload: { clientId, date: '2026-09-20', kind_actividad: 'cancion', minutes: 5, ...payload },
    queuedAt: '2026-09-20T14:00:00.000Z',
    attempts: 0,
  };
}

describe('mergeHistorial', () => {
  test('muestra lo del servidor y lo que sigue en cola', () => {
    const entries = mergeHistorial([stored()], [queued('b', {})]);
    assert.deepEqual(entries.map((e) => e.clientId), ['b', 'a']);
    assert.equal(entries[0]?.pending, true);
    assert.equal(entries[1]?.pending, false);
  });

  test('ordena de la fecha más nueva a la más vieja', () => {
    const entries = mergeHistorial(
      [stored({ clientId: 'vieja', date: '2026-09-01' }), stored({ clientId: 'nueva', date: '2026-09-19' })],
      [],
    );
    assert.deepEqual(entries.map((e) => e.clientId), ['nueva', 'vieja']);
  });

  test('no duplica una entrada que ya sincronizó pero sigue en la cola', () => {
    // There is a window where the flush landed and the queue has not dropped the item yet.
    const entries = mergeHistorial([stored({ clientId: 'a' })], [queued('a', {})]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.pending, false, 'gana la copia del servidor');
  });

  test('ignora lo que está en cola y no es bitácora', () => {
    const feedback: QueuedItem = {
      clientId: 'fb', kind: 'feedback', payload: { text: 'hola' },
      queuedAt: '2026-09-20T14:00:00.000Z', attempts: 0,
    };
    const acceso: QueuedItem = {
      clientId: 'ac', kind: 'acceso', payload: { resourceId: 'semana-03' },
      queuedAt: '2026-09-20T14:00:00.000Z', attempts: 0,
    };
    assert.deepEqual(mergeHistorial([], [feedback, acceso]), []);
  });

  test('conserva nota y recurso de una entrada en cola', () => {
    const entries = mergeHistorial([], [queued('b', { note: 'le gustó', resourceId: 's03-lectura' })]);
    assert.equal(entries[0]?.note, 'le gustó');
    assert.equal(entries[0]?.resourceId, 's03-lectura');
  });

  test('sin nada devuelve una lista vacía', () => {
    assert.deepEqual(mergeHistorial([], []), []);
  });
});

describe('mergeThread', () => {
  const feedback = {
    id: 'f1', type: 'consulta', channel: 'whatsapp' as const, text: '¿A qué distancia?',
    status: 'respondido' as const, createdAt: '2026-09-18T10:00:00.000Z',
    replies: [{ text: 'A unos 30 cm.', gestorSub: 'g1', at: '2026-09-18T14:00:00.000Z' }],
  };

  function queuedFeedback(clientId: string, createdAt: string): QueuedItem {
    return {
      clientId,
      kind: 'feedback',
      payload: { clientId, type: 'pedido', text: 'sin enviar todavía', createdAt },
      queuedAt: createdAt,
      attempts: 0,
    };
  }

  test('trae el hilo del servidor con sus respuestas', () => {
    const thread = mergeThread([feedback], []);
    assert.equal(thread.length, 1);
    assert.equal(thread[0]?.replies.length, 1);
    assert.equal(thread[0]?.replies[0]?.text, 'A unos 30 cm.');
    assert.equal(thread[0]?.pending, false);
  });

  test('marca como pendiente lo que todavía no salió del celular', () => {
    const thread = mergeThread([], [queuedFeedback('q1', '2026-09-20T10:00:00.000Z')]);
    assert.equal(thread[0]?.pending, true);
    assert.equal(thread[0]?.status, 'abierto');
    assert.equal(thread[0]?.text, 'sin enviar todavía');
  });

  test('no duplica un mensaje que ya sincronizó', () => {
    const thread = mergeThread([{ ...feedback, id: 'q1' }], [queuedFeedback('q1', feedback.createdAt)]);
    assert.equal(thread.length, 1);
    assert.equal(thread[0]?.pending, false);
  });

  test('ordena del más nuevo al más viejo', () => {
    const thread = mergeThread(
      [feedback],
      [queuedFeedback('q1', '2026-09-20T10:00:00.000Z')],
    );
    assert.deepEqual(thread.map((item) => item.id), ['q1', 'f1']);
  });

  test('ignora lo que está en cola y no es feedback', () => {
    const log: QueuedItem = {
      clientId: 'l1', kind: 'bitacora', payload: {}, queuedAt: '2026-09-20T10:00:00.000Z', attempts: 0,
    };
    assert.deepEqual(mergeThread([], [log]), []);
  });
});
