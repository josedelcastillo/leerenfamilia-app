import { useRef, useState } from 'react';
import type { ActivityKind, DeclaredBy } from '../shared/api.ts';
import type { QueuedKind } from '../shared/sync-queue.ts';
import { todayLocal } from './formato.ts';
import { KIND_COPY, MINUTE_OPTIONS, WHO_OPTIONS, detailsPayload, firstTapPayload } from './registro-rapido.ts';

export function RegistroRapido({
  kind,
  resourceId,
  week,
  relation,
  initial,
  pendingIds,
  enqueue,
  discard,
  onDone,
}: {
  kind: ActivityKind;
  resourceId: string | null;
  week: number | null;
  /** What this caregiver declared at activation. Preselects "who", but is only saved if they save. */
  relation: DeclaredBy | null;
  /** The entry already logged by a one-tap button elsewhere, or null to ask first. */
  initial: Record<string, unknown> | null;
  pendingIds: ReadonlySet<string>;
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  discard: (clientId: string) => Promise<boolean>;
  onDone: () => void;
}) {
  const [entry, setEntry] = useState<Record<string, unknown> | null>(initial);
  const [who, setWho] = useState<DeclaredBy | null>(relation);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const copy = KIND_COPY[kind];
  // `busy` drives the disabled state but only takes effect on the next render; a very fast double
  // tap can land both calls before that happens. This ref blocks the second one immediately.
  const running = useRef(false);

  async function register() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const payload = firstTapPayload({ clientId: crypto.randomUUID(), date: todayLocal(), kind, resourceId });
      await enqueue('bitacora', payload);
      setEntry(payload);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  async function saveDetails() {
    if (entry === null || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await enqueue('bitacora', detailsPayload(entry, { minutes, declaredBy: who, note }));
      onDone();
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  async function undo() {
    if (entry === null) return;
    if (await discard(String(entry['clientId']))) {
      setEntry(null);
      setNotice(null);
    } else {
      setNotice('Este registro ya se envió y queda en tu bitácora.');
    }
  }

  if (entry === null) {
    return (
      <section className="pantalla">
        <div className="pantalla__cuerpo">
          <button type="button" className="volver" onClick={onDone}>Volver</button>
          {week !== null && <p className="meta">Semana {week}</p>}
          <h1 className="titular titular--registro">{copy.pregunta}</h1>
          <p className="lectura">Un toque y listo. Lo demás es opcional y lo puedes dejar después.</p>
        </div>
        <div className="pantalla__accion">
          <button type="button" className="btn btn--registrar" disabled={busy} onClick={register}>
            {copy.boton}
          </button>
        </div>
      </section>
    );
  }

  const pending = pendingIds.has(String(entry['clientId']));

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <p className="confirmado" role="status">
          <span className="confirmado__check" aria-hidden="true">✓</span>
          {copy.confirmado}
        </p>
        {pending ? (
          <p className="banda-estado">
            <span className="punto" aria-hidden="true" />
            Guardado en tu teléfono. Se envía solo cuando haya señal.
          </p>
        ) : (
          <p className="sincronizado">Sincronizado</p>
        )}

        <hr className="filete" />

        <div className="opcionales">
          <p className="subtitulo">Si quieres, cuéntanos más</p>
          <div className="chips chips--fila" role="group" aria-label="Quién lo hizo">
            {WHO_OPTIONS.map((option) => (
              <button key={option.value} type="button" className="chip" aria-pressed={who === option.value}
                      onClick={() => setWho(who === option.value ? null : option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="chips chips--fila" role="group" aria-label="Cuánto rato">
            {MINUTE_OPTIONS.map((option) => (
              <button key={option.value} type="button" className="chip" aria-pressed={minutes === option.value}
                      onClick={() => setMinutes(minutes === option.value ? null : option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <label className="visually-hidden" htmlFor="nota">Nota</label>
          <textarea id="nota" value={note} maxLength={1000} placeholder="Una nota para ti, si te nace"
                    onChange={(event) => setNote(event.target.value)} />
          <p className="meta meta--chica">El equipo solo lee tus notas si lo autorizaste.</p>
          {pending && <button type="button" className="enlace" onClick={undo}>Deshacer este registro</button>}
          {notice !== null && <p className="meta" role="status">{notice}</p>}
        </div>
      </div>

      <div className="pantalla__accion">
        <button type="button" className="btn" disabled={busy} onClick={saveDetails}>Guardar y volver</button>
        <button type="button" className="btn-texto" onClick={onDone}>Listo, nada más</button>
      </div>
    </section>
  );
}
