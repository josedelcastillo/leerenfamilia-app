import type { Feedback } from '../shared/api.ts';
import type { QueuedItem } from '../shared/sync-queue.ts';

export interface ThreadItem {
  readonly id: string;
  readonly type: string;
  readonly channel: string;
  readonly text: string;
  readonly status: string;
  readonly createdAt: string;
  readonly replies: Feedback['replies'];
  readonly pending: boolean;
}

/**
 * Merges the thread the server has with the messages still queued on the device. The client id is
 * the join key, so a message that has just synced stops showing as pending instead of appearing
 * twice.
 *
 * Kept apart from the component so it can be tested with `node --test`, which cannot parse JSX.
 */
export function mergeThread(
  stored: readonly Feedback[],
  queued: readonly QueuedItem[],
): ThreadItem[] {
  const merged = new Map<string, ThreadItem>();

  for (const item of queued) {
    if (item.kind !== 'feedback') continue;
    merged.set(item.clientId, {
      id: item.clientId,
      type: String(item.payload['type'] ?? 'consulta'),
      channel: 'pwa',
      text: String(item.payload['text'] ?? ''),
      status: 'abierto',
      createdAt: String(item.payload['createdAt'] ?? item.queuedAt),
      replies: [],
      pending: true,
    });
  }

  for (const feedback of stored) {
    merged.set(feedback.id, { ...feedback, pending: false });
  }

  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
