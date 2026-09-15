import type { QueuedItem } from '../shared/sync-queue.ts';
import { KIND_LABEL, relativeDay } from './formato.ts';
import type { ActivityKind } from '../shared/api.ts';

/**
 * What the family sees of its queue. Resource accesses are queued too, but the family never made
 * one by hand; counting them would show "1 registro por enviar" for something nobody wrote.
 */
export function visibleQueue(items: readonly QueuedItem[]): QueuedItem[] {
  return items.filter((item) => item.kind !== 'acceso');
}

export function describeQueued(item: QueuedItem, today: string): { titulo: string; cuando: string } {
  const p = item.payload;
  switch (item.kind) {
    case 'bitacora': {
      const kind = KIND_LABEL[String(p['kind_actividad']) as ActivityKind] ?? 'Registro';
      const minutes = typeof p['minutes'] === 'number' ? `, ${p['minutes']} minutos` : '';
      return { titulo: `${kind}${minutes}`, cuando: relativeDay(String(p['date'] ?? today), today) };
    }
    case 'feedback':
      return { titulo: 'Mensaje al equipo', cuando: relativeDay(String(p['createdAt'] ?? item.queuedAt).slice(0, 10), today) };
    case 'consentimiento':
      return { titulo: 'Cambio de privacidad', cuando: relativeDay(String(p['at'] ?? item.queuedAt).slice(0, 10), today) };
    default:
      return { titulo: 'Registro', cuando: relativeDay(item.queuedAt.slice(0, 10), today) };
  }
}
