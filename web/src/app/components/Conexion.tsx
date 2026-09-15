import { pendingLabel } from '../formato.ts';

/**
 * Connection state, shown only when there is something to say. Colour, word and position carry it;
 * no emoji. A rejected entry gets a plain sentence, never the raw error (handoff: "errores sin
 * disculpa").
 */
export function Conexion({
  online,
  pending,
  rejected,
  onDismiss,
  onOpenCola,
}: {
  online: boolean;
  pending: number;
  rejected: number;
  onDismiss: () => void;
  onOpenCola: () => void;
}) {
  if (online && pending === 0 && rejected === 0) return null;

  return (
    <div className="estado" aria-live="polite">
      {(!online || pending > 0) && (
        <button type="button" className="estado__fila" onClick={onOpenCola}>
          <span className={`punto ${online ? 'punto--morado' : 'punto--alerta'}`} aria-hidden="true" />
          {online ? 'Enviando' : 'Sin conexión'}
          {pending > 0 && ` · ${pendingLabel(pending)}`}
        </button>
      )}
      {rejected > 0 && (
        <div className="aviso-error" role="alert">
          <p>
            {rejected === 1 ? 'Un registro no se pudo guardar.' : `${rejected} registros no se pudieron guardar.`}{' '}
            Si vuelve a pasar, escríbenos en Mensajes.
          </p>
          <button type="button" className="enlace" onClick={onDismiss}>Entendido</button>
        </div>
      )}
    </div>
  );
}
