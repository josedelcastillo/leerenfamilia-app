import type { IsoDate } from '../../domain/dates.ts';
import { DomainError } from '../../domain/errors.ts';
import { parseLogEntry, type LogEntry, type LoggedBy } from '../../domain/log-entry.ts';
import type { FamilyContext, FamilyStore, ResourceAccess } from '../family-ports.ts';

export type SyncItem =
  | { readonly clientId: string; readonly kind: 'bitacora'; readonly [key: string]: unknown }
  | { readonly clientId: string; readonly kind: 'acceso'; readonly [key: string]: unknown };

export interface ItemResult {
  readonly clientId: string;
  readonly status: 'ok' | 'rechazado' | 'error';
  readonly error?: string;
}

/**
 * Accepts a batch, because this is what the offline queue flushes.
 *
 * Two properties matter more than throughput. Each item is idempotent on its client-generated id,
 * so a flush that dies halfway can be replayed whole. And each item is reported individually, so
 * the device dequeues exactly what landed and keeps the rest — one malformed entry must not strand
 * a week of a family's log.
 */
export async function applySync(
  store: FamilyStore,
  context: FamilyContext,
  principalMsisdn: string,
  items: readonly SyncItem[],
  today: IsoDate,
  receivedAt: Date,
): Promise<ItemResult[]> {
  // Taken from the verified token, never from the request body: the device does not get to decide
  // whether it was the mother or the father who logged the entry.
  const role: LoggedBy =
    context.caregivers.find((c) => c.msisdn === principalMsisdn)?.role ?? 'principal';

  const results: ItemResult[] = [];

  for (const item of items) {
    try {
      if (item.kind === 'bitacora') {
        const entry = parseLogEntry(
          {
            clientId: item.clientId,
            date: String(item['date']),
            kind: String(item['kind_actividad']),
            minutes: Number(item['minutes']),
            resourceId: typeof item['resourceId'] === 'string' ? item['resourceId'] : null,
            note: typeof item['note'] === 'string' ? item['note'] : null,
            loggedBy: role,
          },
          today,
        );
        await store.putLogEntry(context.familyId, entry, receivedAt);
      } else if (item.kind === 'acceso') {
        const access: ResourceAccess = {
          clientId: item.clientId,
          resourceId: String(item['resourceId']),
          week: Number(item['week']),
          at: String(item['at']),
        };
        if (access.resourceId === '' || !Number.isFinite(access.week)) {
          throw new DomainError('invalid_log_entry', 'Acceso incompleto');
        }
        await store.putAccess(context.familyId, access, principalMsisdn);
      } else {
        throw new DomainError('invalid_log_entry', `Tipo desconocido: ${String(item['kind'])}`);
      }
      results.push({ clientId: item.clientId, status: 'ok' });
    } catch (error) {
      // A rejected item is the device's fault and will never succeed, so it reports `rechazado` and
      // the queue drops it. An `error` is ours, and the device keeps it to retry.
      const rejected = error instanceof DomainError;
      results.push({
        clientId: item.clientId,
        status: rejected ? 'rechazado' : 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export interface OwnLogResponse {
  readonly entries: readonly LogEntry[];
}

/**
 * The family's own log, newest first.
 *
 * The free-text notes come back in full. The consent flag governs what a *manager* may read, never
 * what the family sees of what it wrote itself.
 */
export async function listOwnLog(
  store: FamilyStore,
  context: FamilyContext,
): Promise<OwnLogResponse> {
  const entries = await store.listLogEntries(context.familyId);
  return {
    entries: [...entries].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
