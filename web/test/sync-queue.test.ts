import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTEMPTS,
  MAX_BATCH,
  SyncQueue,
  type ItemResult,
  type QueuedItem,
  type QueueStorage,
} from '../src/shared/sync-queue.ts';

class MemoryStorage implements QueueStorage {
  items = new Map<string, QueuedItem>();

  async add(item: QueuedItem): Promise<void> {
    this.items.set(item.clientId, item);
  }
  async all(): Promise<QueuedItem[]> {
    return [...this.items.values()];
  }
  async remove(clientIds: readonly string[]): Promise<void> {
    for (const id of clientIds) this.items.delete(id);
  }
  async bumpAttempts(clientIds: readonly string[]): Promise<void> {
    for (const id of clientIds) {
      const item = this.items.get(id);
      if (item !== undefined) this.items.set(id, { ...item, attempts: item.attempts + 1 });
    }
  }
}

const NOW = new Date('2026-09-20T14:00:00.000Z');
let storage: MemoryStorage;
let ids: number;

beforeEach(() => {
  storage = new MemoryStorage();
  ids = 0;
});

function queue(): SyncQueue {
  return new SyncQueue(storage, { newId: () => `uuid-${++ids}`, now: () => NOW });
}

const allOk: (items: readonly QueuedItem[]) => Promise<ItemResult[]> = async (items) =>
  items.map((item) => ({ clientId: item.clientId, status: 'ok' }));

describe('enqueue', () => {
  test('stores the entry with a device-generated id', async () => {
    const q = queue();
    const id = await q.enqueue('bitacora', { minutes: 10 });
    assert.equal(id, 'uuid-1');
    assert.equal(await q.pendingCount(), 1);
    assert.equal(storage.items.get('uuid-1')?.payload['clientId'], 'uuid-1');
  });

  test('keeps a client id the caller already generated', async () => {
    // The UI renders optimistically with the id it made, and the queue must not renumber it.
    const id = await queue().enqueue('bitacora', { clientId: 'ya-existe', minutes: 5 });
    assert.equal(id, 'ya-existe');
  });

  test('re-enqueuing the same id replaces rather than duplicates', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'a', minutes: 5 });
    await q.enqueue('bitacora', { clientId: 'a', minutes: 8 });
    assert.equal(await q.pendingCount(), 1);
    assert.equal(storage.items.get('a')?.payload['minutes'], 8);
  });
});

describe('flush', () => {
  test('empties the queue when everything is accepted', async () => {
    const q = queue();
    await q.enqueue('bitacora', { minutes: 10 });
    await q.enqueue('bitacora', { minutes: 5 });

    const report = await q.flush(allOk);
    assert.equal(report.synced, 2);
    assert.equal(report.pending, 0);
  });

  test('does nothing when there is nothing queued', async () => {
    const report = await queue().flush(async () => {
      throw new Error('no debería llamarse');
    });
    assert.deepEqual(report, { attempted: 0, synced: 0, rejected: [], pending: 0, skipped: false });
  });

  test('keeps everything when the request itself fails', async () => {
    // No signal, or the server is down. Nothing may be lost here.
    const q = queue();
    await q.enqueue('bitacora', { minutes: 10 });

    const report = await q.flush(async () => {
      throw new TypeError('Failed to fetch');
    });
    assert.equal(report.synced, 0);
    assert.equal(report.pending, 1);
    assert.equal(storage.items.get('uuid-1')?.attempts, 1);
  });

  test('a later flush succeeds and clears what was held', async () => {
    const q = queue();
    await q.enqueue('bitacora', { minutes: 10 });
    await q.flush(async () => {
      throw new Error('sin señal');
    });

    const report = await q.flush(allOk);
    assert.equal(report.synced, 1);
    assert.equal(report.pending, 0);
  });

  test('drops what the server rejects and reports it', async () => {
    // A rejected item will never be accepted; retrying it forever would block the queue.
    const q = queue();
    await q.enqueue('bitacora', { minutes: 99999 });

    const report = await q.flush(async (items) =>
      items.map((item) => ({ clientId: item.clientId, status: 'rechazado', error: 'duración inválida' })),
    );
    assert.equal(report.synced, 0);
    assert.equal(report.pending, 0);
    assert.equal(report.rejected.length, 1);
    assert.equal(report.rejected[0]?.error, 'duración inválida');
  });

  test('keeps items the server errored on, and clears the ones it accepted', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'a', minutes: 10 });
    await q.enqueue('bitacora', { clientId: 'b', minutes: 10 });
    await q.enqueue('bitacora', { clientId: 'c', minutes: 10 });

    const report = await q.flush(async () => [
      { clientId: 'a', status: 'ok' },
      { clientId: 'b', status: 'error', error: 'dynamo caído' },
      { clientId: 'c', status: 'ok' },
    ]);

    assert.equal(report.synced, 2);
    assert.equal(report.pending, 1);
    assert.deepEqual([...storage.items.keys()], ['b']);
  });

  test('keeps an item the server did not mention at all', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'a', minutes: 10 });
    await q.enqueue('bitacora', { clientId: 'b', minutes: 10 });

    const report = await q.flush(async () => [{ clientId: 'a', status: 'ok' }]);
    assert.equal(report.pending, 1);
    assert.deepEqual([...storage.items.keys()], ['b']);
  });

  test('sends at most one batch at a time', async () => {
    const q = queue();
    for (let i = 0; i < MAX_BATCH + 10; i += 1) {
      await q.enqueue('bitacora', { clientId: `id-${i}`, minutes: 5 });
    }

    let sentSize = 0;
    const report = await q.flush(async (items) => {
      sentSize = items.length;
      return items.map((item) => ({ clientId: item.clientId, status: 'ok' }));
    });

    assert.equal(sentSize, MAX_BATCH);
    assert.equal(report.synced, MAX_BATCH);
    assert.equal(report.pending, 10);
  });

  test('gives up on a poison item instead of retrying it forever', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'veneno', minutes: 10 });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await q.flush(async () => {
        throw new Error('siempre falla');
      });
    }
    assert.equal(await q.pendingCount(), 1, 'todavía en cola');

    const report = await q.flush(allOk);
    assert.equal(report.pending, 0, 'se descarta');
    assert.equal(report.rejected.length, 1);
    assert.match(report.rejected[0]?.error ?? '', new RegExp(String(MAX_ATTEMPTS)));
  });

  test('an exhausted item does not stop the healthy ones from syncing', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'veneno', minutes: 10 });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await q.flush(async () => {
        throw new Error('falla');
      });
    }
    await q.enqueue('bitacora', { clientId: 'sana', minutes: 10 });

    const report = await q.flush(allOk);
    assert.equal(report.synced, 1);
    assert.equal(report.rejected.length, 1);
    assert.equal(report.pending, 0);
  });

  test('does not run two flushes at once', async () => {
    // `online` and `visibilitychange` can fire together; a double flush would double-send.
    const q = queue();
    await q.enqueue('bitacora', { minutes: 10 });

    let inFlight = 0;
    let maxConcurrent = 0;
    const slow: (items: readonly QueuedItem[]) => Promise<ItemResult[]> = async (items) => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return items.map((item) => ({ clientId: item.clientId, status: 'ok' }));
    };

    const [first, second] = await Promise.all([q.flush(slow), q.flush(slow)]);
    assert.equal(maxConcurrent, 1);
    assert.equal(Number(first?.skipped) + Number(second?.skipped), 1, 'una de las dos se saltó');
  });

  test('releases the lock even when the sender throws', async () => {
    const q = queue();
    await q.enqueue('bitacora', { minutes: 10 });
    await q.flush(async () => {
      throw new Error('falla');
    });
    const report = await q.flush(allOk);
    assert.equal(report.skipped, false);
    assert.equal(report.synced, 1);
  });
});
