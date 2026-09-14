import type { ItemResult } from '../../shared/sync-queue.ts';

/**
 * Connection and sync state, always visible. A caregiver who writes an entry with no signal has to
 * be able to see that it was kept, not guess.
 */
export function Estado({
  online,
  pending,
  rejected,
  onDismiss,
}: {
  online: boolean;
  pending: number;
  rejected: readonly ItemResult[];
  onDismiss: () => void;
}) {
  return (
    <div aria-live="polite">
      {!online && (
        <p className="banner banner--offline">
          <span aria-hidden="true">📵</span>
          Sin conexión. Lo que registres se guarda en tu celular y se envía solo cuando vuelva la señal.
        </p>
      )}
      {pending > 0 && (
        <p className="banner banner--pending">
          <span aria-hidden="true">⏳</span>
          {pending === 1
            ? '1 registro pendiente de sincronizar'
            : `${pending} registros pendientes de sincronizar`}
        </p>
      )}
      {rejected.length > 0 && (
        <div className="banner banner--error">
          <div>
            <strong>No se pudieron guardar {rejected.length} registro(s).</strong>
            <ul className="small">
              {rejected.map((item) => (
                <li key={item.clientId}>{item.error ?? 'Error desconocido'}</li>
              ))}
            </ul>
            <button type="button" className="chip" onClick={onDismiss}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
