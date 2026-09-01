import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendQueued } from './api.ts';
import { IndexedDbQueueStorage } from './idb-storage.ts';
import { SyncQueue, type ItemResult, type QueuedKind } from './sync-queue.ts';

export interface SyncState {
  readonly online: boolean;
  readonly pending: number;
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
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState<readonly ItemResult[]>([]);

  const flush = useCallback(async () => {
    if (!navigator.onLine) {
      setPending(await queue.pendingCount());
      return;
    }
    const report = await queue.flush(sendQueued);
    setPending(report.pending);
    if (report.rejected.length > 0) {
      setRejected((current) => [...current, ...report.rejected]);
    }
  }, [queue]);

  const enqueue = useCallback(
    async (kind: QueuedKind, payload: Record<string, unknown>) => {
      const clientId = await queue.enqueue(kind, payload);
      setPending(await queue.pendingCount());
      void flush();
      return clientId;
    },
    [queue, flush],
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
    pending,
    rejected,
    enqueue,
    flush,
    dismissRejected: () => setRejected([]),
  };
}
