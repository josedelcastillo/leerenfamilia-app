import type { LogEntry } from '../../shared/api.ts';
import type { QueuedItem } from '../../shared/sync-queue.ts';

export interface HistorialEntry {
  readonly clientId: string;
  readonly date: string;
  readonly kind: string;
  readonly minutes: number;
  readonly note: string | null;
  readonly resourceId: string | null;
  readonly pending: boolean;
}

/**
 * Merges what the server has with what is still queued on the device, so an entry written with no
 * signal appears immediately and keeps appearing after the caregiver leaves the screen.
 *
 * The client id is the join key. During the window where a flush has landed but the queue has not
 * yet dropped the item, the same entry exists in both places; the server copy wins and the pending
 * badge disappears.
 *
 * Kept apart from the component so it can be tested with `node --test`, which cannot parse JSX.
 */
export function mergeHistorial(
  stored: readonly LogEntry[],
  queued: readonly QueuedItem[],
): HistorialEntry[] {
  const merged = new Map<string, HistorialEntry>();

  for (const item of queued) {
    if (item.kind !== 'bitacora') continue;
    const payload = item.payload;
    merged.set(item.clientId, {
      clientId: item.clientId,
      date: String(payload['date'] ?? ''),
      kind: String(payload['kind_actividad'] ?? ''),
      minutes: Number(payload['minutes'] ?? 0),
      note: typeof payload['note'] === 'string' ? payload['note'] : null,
      resourceId: typeof payload['resourceId'] === 'string' ? payload['resourceId'] : null,
      pending: true,
    });
  }

  for (const entry of stored) {
    merged.set(entry.clientId, {
      clientId: entry.clientId,
      date: entry.date,
      kind: entry.kind,
      minutes: entry.minutes,
      note: entry.note,
      resourceId: entry.resourceId,
      pending: false,
    });
  }

  return [...merged.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.clientId.localeCompare(b.clientId),
  );
}
