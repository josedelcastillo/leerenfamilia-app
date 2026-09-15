import { useEffect, useState } from 'react';
import { api } from '../shared/api.ts';
import type { QueuedItem, QueuedKind } from '../shared/sync-queue.ts';
import { consentPayload, effectiveNotesConsent, suppressionPayload } from './privacidad.ts';

/**
 * Screen 6. The switch changes the notes consent through the offline queue (D-025); revoking hides
 * every note already sent, because the manager-side filter is on read (rule 8). The erasure button
 * sends a fixed request to the inbox until the endpoint exists (D-027).
 */
export function Privacidad({
  pendingItems,
  enqueue,
  onBack,
}: {
  pendingItems: readonly QueuedItem[];
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  onBack: () => void;
}) {
  const [server, setServer] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    api.listLog().then((response) => setServer(response.notesAuthorized)).catch(() => undefined);
  }, []);

  const authorized = effectiveNotesConsent(server, pendingItems);

  async function toggle() {
    if (authorized === null) return;
    await enqueue('consentimiento', consentPayload(crypto.randomUUID(), !authorized, new Date()));
  }

  async function requestErasure() {
    await enqueue('feedback', suppressionPayload(crypto.randomUUID(), new Date()));
    setConfirming(false);
    setRequested(true);
  }

  const explanation =
    authorized === null
      ? 'Lo verás cuando haya señal.'
      : authorized
        ? 'Activado. Si lo desactivas, el equipo deja de ver tus notas, también las que ya enviaste. Siguen guardadas para ti.'
        : 'Desactivado. El equipo ve cuántas veces y cuánto tiempo registras, nunca lo que escribes.';

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <h1 className="titular titular--actividad">Tus datos</h1>
        <p className="lectura lectura--suave">
          Guardamos lo mínimo para acompañarte durante las ocho semanas. Nada se comparte con nadie más.
        </p>
        <p className="placeholder-note">Texto pendiente de revisión legal.</p>
        <dl className="filas-datos">
          <div>
            <dt>Qué guardamos</dt>
            <dd>Tu número, el nombre y la fecha de nacimiento de tu bebé, la semana en que entraste y cada actividad que registras.</dd>
          </div>
          <div>
            <dt>Quién lo ve</dt>
            <dd>El equipo de Leer en Familia. Cada vez que alguien abre tu ficha queda registrado.</dd>
          </div>
          <div>
            <dt>Hasta cuándo</dt>
            <dd>Hasta que termine el piloto. Puedes pedir que borremos todo cuando quieras.</dd>
          </div>
        </dl>
        <div className="interruptor-caja">
          <button type="button" role="switch" className="interruptor" aria-checked={authorized === true}
                  disabled={authorized === null} onClick={toggle}
                  aria-labelledby="notas-titulo" aria-describedby="notas-explica">
            <span className="interruptor__perilla" />
          </button>
          <div>
            <p id="notas-titulo" className="interruptor__titulo">El equipo puede leer mis notas</p>
            <p id="notas-explica" className="meta">{explanation}</p>
          </div>
        </div>
      </div>

      <div className="pantalla__accion">
        {requested ? (
          <p className="nota-caja" role="status">Recibimos tu pedido. El equipo te escribirá para confirmarlo.</p>
        ) : confirming ? (
          <>
            <p className="meta">Esto pide al equipo que borre lo que registraste y tus datos de contacto.</p>
            <button type="button" className="btn btn--secundario" onClick={requestErasure}>Sí, pedir que borren mis datos</button>
            <button type="button" className="btn-texto" onClick={() => setConfirming(false)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn btn--secundario" onClick={() => setConfirming(true)}>
            Pedir que borren mis datos
          </button>
        )}
      </div>
    </section>
  );
}
