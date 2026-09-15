import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../shared/api.ts';
import type { QueuedItem, QueuedKind } from '../shared/sync-queue.ts';
import { consentPayload, displayedNotesConsent, effectiveNotesConsent, suppressionPayload } from './privacidad.ts';

/**
 * Screen 6. The switch changes the notes consent through the offline queue (D-025); revoking hides
 * every note already sent, because the manager-side filter is on read (rule 8). The erasure button
 * sends a fixed request to the inbox until the endpoint exists (D-027).
 *
 * The server value is read again whenever a change leaves the queue, so after a sync the screen shows
 * what the server kept — not what it said when the screen opened.
 */
export function Privacidad({
  pendingItems,
  syncedAt,
  enqueue,
  onBack,
}: {
  pendingItems: readonly QueuedItem[];
  syncedAt: number;
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  onBack: () => void;
}) {
  const [server, setServer] = useState<boolean | null>(null);
  // The last value the family chose, and whether the server has been read since that change synced.
  const [lastChoice, setLastChoice] = useState<boolean | null>(null);
  const [serverFresh, setServerFresh] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  // `busy` drives the disabled state but only takes effect on the next render; a very fast double
  // tap can land both calls before that happens. This ref blocks the second one immediately.
  const running = useRef(false);

  const queuedChoice = effectiveNotesConsent(null, pendingItems);
  const hasQueued = queuedChoice !== null;
  // Read by `load` when a request starts: a read begun while a change is still queued predates it.
  const queuedNow = useRef(hasQueued);
  queuedNow.current = hasQueued;
  // Bumped on every new choice, so a read that started before it never counts as fresh.
  const choiceSeq = useRef(0);
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);

  const load = useCallback(() => {
    const id = ++requestSeq.current;
    const choice = choiceSeq.current;
    const startedClean = !queuedNow.current;
    api
      .listLog()
      .then((response) => {
        // An older read that answers late must not overwrite a newer one.
        if (id < appliedSeq.current) return;
        appliedSeq.current = id;
        setServer(response.notesAuthorized);
        if (startedClean && choice === choiceSeq.current) setServerFresh(true);
      })
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  // Every change the family makes passes through the queue, including one left from an earlier visit.
  useEffect(() => {
    if (queuedChoice === null) return;
    choiceSeq.current += 1;
    setLastChoice(queuedChoice);
    setServerFresh(false);
  }, [queuedChoice]);

  // Read the server again after a sync, and whenever the change leaves the queue for any reason — a
  // rejected change leaves too, and then the server never took it.
  const seen = useRef({ syncedAt, hasQueued });
  useEffect(() => {
    const before = seen.current;
    seen.current = { syncedAt, hasQueued };
    if (syncedAt !== before.syncedAt || (before.hasQueued && !hasQueued)) load();
  }, [syncedAt, hasQueued, load]);

  const authorized = displayedNotesConsent(server, pendingItems, lastChoice, serverFresh);

  async function toggle() {
    if (authorized === null || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await enqueue('consentimiento', consentPayload(crypto.randomUUID(), !authorized, new Date()));
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  async function requestErasure() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await enqueue('feedback', suppressionPayload(crypto.randomUUID(), new Date()));
      setConfirming(false);
      setRequested(true);
    } finally {
      setBusy(false);
      running.current = false;
    }
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
                  disabled={authorized === null || busy} onClick={toggle}
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
            <button type="button" className="btn btn--secundario" disabled={busy} onClick={requestErasure}>Sí, pedir que borren mis datos</button>
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
