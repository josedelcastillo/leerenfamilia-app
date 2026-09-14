import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendQueued } from './api.ts';
import { IndexedDbQueueStorage } from './idb-storage.ts';
import { SyncQueue, type ItemResult, type QueuedItem, type QueuedKind } from './sync-queue.ts';

export interface SyncState {
  readonly online: boolean;
  readonly pending: number;
  /**
   * What is still queued. Screens merge these into the history they show, so an entry written with
   * no signal is visible immediately and stays visible after leaving the screen — the alternative
   * is a caregiver who writes something and cannot tell whether it was kept.
   */
  readonly pendingItems: readonly QueuedItem[];
  /** Increments when a flush lands something on the server, so screens can reload. */
  readonly syncedAt: number;
  readonly rejected: readonly ItemResult[];
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  flush: () => Promise<void>;
  dismissRejected: () => void;
}

/**
 * Wires the queue to the browser: flush when the connection comes back, and flush when the tab
 * becomes visible again.
 *
 * `visibilitychange` is the important one. A caregiver typically writes an entry, locks the phone,
 * and opens the app again hours later somewhere with signal — the `online` event may never fire in
 * between, because the browser was not running when the connection returned.
 */
export function useSync(): SyncState {
  const queue = useMemo(() => new SyncQueue(new IndexedDbQueueStorage()), []);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingItems, setPendingItems] = useState<readonly QueuedItem[]>([]);
  const [rejected, setRejected] = useState<readonly ItemResult[]>([]);
  const [syncedAt, setSyncedAt] = useState(0);

  const refresh = useCallback(async () => {
    setPendingItems(await queue.snapshot());
  }, [queue]);

  const flush = useCallback(async () => {
    if (!navigator.onLine) {
      await refresh();
      return;
    }
    const report = await queue.flush(sendQueued);
    await refresh();
    if (report.synced > 0) {
      // Bumped so screens know to reload their history: what was pending is now on the server.
      setSyncedAt(Date.now());
    }
    if (report.rejected.length > 0) {
      setRejected((current) => [...current, ...report.rejected]);
    }
  }, [queue, refresh]);

  const enqueue = useCallback(
    async (kind: QueuedKind, payload: Record<string, unknown>) => {
      const clientId = await queue.enqueue(kind, payload);
      await refresh();
      void flush();
      return clientId;
    },
    [queue, flush, refresh],
  );

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush();
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    void flush();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flush]);

  return {
    online,
    pending: pendingItems.length,
    pendingItems,
    syncedAt,
    rejected,
    enqueue,
    flush,
    dismissRejected: () => setRejected([]),
  };
}
