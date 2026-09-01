import type { QueuedItem, QueueStorage } from './sync-queue.ts';

/**
 * IndexedDB implementation of the queue's storage.
 *
 * IndexedDB rather than localStorage because these are structured records, there can be many of
 * them, and writing them needs a transaction — localStorage is a synchronous string store and would
 * block the UI thread on every entry.
 *
 * Everything here is plumbing. The policy that decides what stays and what goes lives in
 * `sync-queue.ts`, where it can be tested without a browser.
 */
const DB_NAME = 'nplp';
const DB_VERSION = 1;
const STORE = 'cola';

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

export class IndexedDbQueueStorage implements QueueStorage {
  #db: Promise<IDBDatabase> | null = null;

  #open(): Promise<IDBDatabase> {
    this.#db ??= openDatabase();
    return this.#db;
  }

  async #transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T> | T,
  ): Promise<T> {
    const db = await this.#open();
    const transaction = db.transaction(STORE, mode);
    const result = await run(transaction.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Transacción abortada'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Transacción falló'));
    });
    return result;
  }

  async add(item: QueuedItem): Promise<void> {
    await this.#transaction('readwrite', (store) => promisify(store.put(item)));
  }

  async all(): Promise<QueuedItem[]> {
    return this.#transaction('readonly', (store) =>
      promisify(store.getAll() as IDBRequest<QueuedItem[]>),
    );
  }

  async remove(clientIds: readonly string[]): Promise<void> {
    await this.#transaction('readwrite', async (store) => {
      await Promise.all(clientIds.map((id) => promisify(store.delete(id))));
    });
  }

  async bumpAttempts(clientIds: readonly string[]): Promise<void> {
    await this.#transaction('readwrite', async (store) => {
      for (const id of clientIds) {
        const existing = await promisify(store.get(id) as IDBRequest<QueuedItem | undefined>);
        if (existing !== undefined) {
          await promisify(store.put({ ...existing, attempts: existing.attempts + 1 }));
        }
      }
    });
  }
}
