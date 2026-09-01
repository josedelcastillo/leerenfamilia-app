/**
 * The offline write queue.
 *
 * The reading log and feedback are writes, and the families this pilot serves will be without a
 * signal a good part of the time. Without a local queue, an entry logged at 2am with no bars is
 * simply lost — and since the log is the primary source of the pilot's indicators, every lost
 * entry is a hole in the final report.
 *
 * The policy lives here, separate from IndexedDB, so it can be tested without a browser.
 */

export type QueuedKind = 'bitacora' | 'acceso' | 'feedback';

export interface QueuedItem {
  /** Generated on the device. This is what makes a replayed flush safe. */
  readonly clientId: string;
  readonly kind: QueuedKind;
  readonly payload: Record<string, unknown>;
  readonly queuedAt: string;
  readonly attempts: number;
}

export interface ItemResult {
  readonly clientId: string;
  readonly status: 'ok' | 'rechazado' | 'error';
  readonly error?: string;
}

export interface QueueStorage {
  add(item: QueuedItem): Promise<void>;
  all(): Promise<QueuedItem[]>;
  remove(clientIds: readonly string[]): Promise<void>;
  bumpAttempts(clientIds: readonly string[]): Promise<void>;
}

export type SyncSender = (items: readonly QueuedItem[]) => Promise<readonly ItemResult[]>;

export interface FlushReport {
  readonly attempted: number;
  readonly synced: number;
  /** Items the server will never accept. Dropped from the queue and surfaced to the caregiver. */
  readonly rejected: readonly ItemResult[];
  readonly pending: number;
  readonly skipped: boolean;
}

/** One flush sends at most this many items, matching the API's batch limit. */
export const MAX_BATCH = 50;

/**
 * A poison item that keeps failing must not block the queue forever. After this many attempts it
 * is dropped and reported, rather than retried on every visibility change for the rest of the pilot.
 */
export const MAX_ATTEMPTS = 10;

export class SyncQueue {
  readonly #storage: QueueStorage;
  readonly #newId: () => string;
  readonly #now: () => Date;
  #flushing = false;

  constructor(storage: QueueStorage, options: { newId?: () => string; now?: () => Date } = {}) {
    this.#storage = storage;
    this.#newId = options.newId ?? (() => crypto.randomUUID());
    this.#now = options.now ?? (() => new Date());
  }

  /** Returns the client id, so the UI can render the entry optimistically and track its state. */
  async enqueue(kind: QueuedKind, payload: Record<string, unknown>): Promise<string> {
    const clientId = String(payload['clientId'] ?? this.#newId());
    await this.#storage.add({
      clientId,
      kind,
      payload: { ...payload, clientId },
      queuedAt: this.#now().toISOString(),
      attempts: 0,
    });
    return clientId;
  }

  async pendingCount(): Promise<number> {
    return (await this.#storage.all()).length;
  }

  /**
   * Sends what is queued and reconciles the results.
   *
   * `ok` and `rechazado` both leave the queue: the first succeeded, the second never will, and
   * keeping it would retry a malformed entry forever. `error` stays, because it is our fault and a
   * later attempt may work.
   */
  async flush(send: SyncSender): Promise<FlushReport> {
    if (this.#flushing) {
      // A visibility change and an `online` event can fire together; one flush at a time.
      return { attempted: 0, synced: 0, rejected: [], pending: await this.pendingCount(), skipped: true };
    }
    this.#flushing = true;

    try {
      const queued = await this.#storage.all();
      if (queued.length === 0) {
        return { attempted: 0, synced: 0, rejected: [], pending: 0, skipped: false };
      }

      const exhausted = queued.filter((item) => item.attempts >= MAX_ATTEMPTS);
      const batch = queued.filter((item) => item.attempts < MAX_ATTEMPTS).slice(0, MAX_BATCH);

      const rejected: ItemResult[] = exhausted.map((item) => ({
        clientId: item.clientId,
        status: 'rechazado',
        error: `No se pudo sincronizar después de ${MAX_ATTEMPTS} intentos`,
      }));
      const drop = exhausted.map((item) => item.clientId);
      let synced = 0;

      if (batch.length > 0) {
        let results: readonly ItemResult[];
        try {
          results = await send(batch);
        } catch {
          // The whole request failed — no signal, or the server is down. Nothing is lost: every
          // item stays queued and its attempt count goes up.
          await this.#storage.bumpAttempts(batch.map((item) => item.clientId));
          if (drop.length > 0) await this.#storage.remove(drop);
          return {
            attempted: batch.length,
            synced: 0,
            rejected,
            pending: await this.pendingCount(),
            skipped: false,
          };
        }

        const byId = new Map(results.map((result) => [result.clientId, result]));
        const retry: string[] = [];

        for (const item of batch) {
          const result = byId.get(item.clientId);
          if (result === undefined || result.status === 'error') {
            retry.push(item.clientId);
          } else if (result.status === 'ok') {
            drop.push(item.clientId);
            synced += 1;
          } else {
            drop.push(item.clientId);
            rejected.push(result);
          }
        }

        if (retry.length > 0) await this.#storage.bumpAttempts(retry);
      }

      if (drop.length > 0) await this.#storage.remove(drop);

      return { attempted: batch.length, synced, rejected, pending: await this.pendingCount(), skipped: false };
    } finally {
      this.#flushing = false;
    }
  }
}
