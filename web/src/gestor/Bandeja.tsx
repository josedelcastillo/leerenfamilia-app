import { useCallback, useEffect, useState } from 'react';
import { gestorApi, type InboxItem } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { daysSince, fechaLarga, limaToday, shortId } from './tiempo.ts';

const FILTERS = [
  { value: 'abierto', label: 'Sin responder' },
  { value: 'respondido', label: 'Respondidos' },
  { value: 'cerrado', label: 'Cerrados' },
  { value: 'todos', label: 'Todos' },
] as const;

const TYPE_LABEL: Record<string, string> = {
  consulta: 'Consulta', comentario: 'Comentario', pedido: 'Pedido', problema: 'Problema',
};

export function Bandeja() {
  const [filter, setFilter] = useState<string>('abierto');
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; isError: boolean } | null>(null);

  // The initial/filter load shows "Cargando…"; a reload after answering or closing a message keeps
  // the current list on screen so the list does not blank out (and every Mensaje unmount) under it.
  const load = useCallback((estado: string, opts: { reset: boolean }) => {
    if (opts.reset) setItems(null);
    setError(null);
    gestorApi.bandeja(estado)
      .then((response) => setItems(response.mensajes))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  useEffect(() => {
    setOutcome(null);
    load(filter, { reset: true });
  }, [filter, load]);

  return (
    <>
      <Cabecera titulo="Bandeja" subtitulo="Lo que llega por la app y por WhatsApp, lo más antiguo primero">
        <div className="g-chips" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((option) => (
            <button key={option.value} type="button" className="g-chip" aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}>
              {option.label}{filter === option.value && items !== null ? ` ${items.length}` : ''}
            </button>
          ))}
        </div>
      </Cabecera>
      <div className="g-cuerpo">
        {error !== null && <p className="g-error" role="alert">{error}</p>}
        {outcome !== null && (
          <p className={outcome.isError ? 'g-error' : 'g-aviso-ok'} role={outcome.isError ? 'alert' : 'status'}>
            {outcome.text}
          </p>
        )}
        {items === null && error === null && <p className="g-faint">Cargando…</p>}
        {items !== null && items.length === 0 && <p className="g-faint">Nada pendiente aquí.</p>}
        {items?.map((item) => (
          <Mensaje key={item.feedback.id} item={item}
                   onChanged={() => load(filter, { reset: false })}
                   onOutcome={(text, isError = false) => setOutcome({ text, isError })} />
        ))}
        <p className="g-faint">Las respuestas no se editan: cada una se agrega a la anterior y la familia ve las dos.</p>
      </div>
    </>
  );
}

function Mensaje({ item, onChanged, onOutcome }: {
  item: InboxItem;
  onChanged: () => void;
  onOutcome: (message: string, isError?: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const today = limaToday(new Date());
  const open = item.feedback.status === 'abierto';
  const age = daysSince(item.feedback.createdAt, today);

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const outcome = await gestorApi.responder(item.familyId, item.feedback.id, text);
      // The reply is saved even when the notification fails; the manager needs to know which happened.
      onOutcome(outcome.notified
        ? `Respondido y avisado por WhatsApp (${outcome.channel}).`
        : `Respuesta guardada, pero no se pudo avisar por WhatsApp: ${outcome.reason ?? 'sin detalle'}.`);
      setText('');
      onChanged();
    } catch (cause) {
      onOutcome(cause instanceof Error ? cause.message : 'Error', true);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setClosing(true);
    try {
      await gestorApi.cerrar(item.familyId, item.feedback.id);
      onChanged();
    } catch (cause) {
      onOutcome(cause instanceof Error ? cause.message : 'No se pudo cerrar', true);
    } finally {
      setClosing(false);
    }
  }

  return (
    <article className={open ? 'g-mensaje g-mensaje--abierto' : 'g-mensaje'}>
      <div className="g-mensaje__cabecera">
        <div className="g-mensaje__quien">
          <strong>{item.babyName || shortId(item.familyId)}</strong>
          <span className={item.feedback.channel === 'whatsapp' ? 'g-pill g-pill--canal' : 'g-pill'}>
            {item.feedback.channel === 'whatsapp' ? 'WhatsApp' : 'App'}
          </span>
          <span className="g-pill">{TYPE_LABEL[item.feedback.type] ?? item.feedback.type}</span>
        </div>
        {open
          ? <span className="g-alerta">Sin responder, {age === 1 ? '1 día' : `${age} días`}</span>
          : <span className="g-ok">{item.feedback.status === 'cerrado' ? 'Cerrado' : 'Respondido'}</span>}
      </div>
      <p className="g-prosa">“{item.feedback.text}”</p>

      {item.feedback.replies.map((entry, index) => (
        <div key={index} className="g-respuesta">
          Respondido el {fechaLarga(limaToday(new Date(entry.at)))}: {entry.text}
        </div>
      ))}

      {item.feedback.status !== 'cerrado' && (
        <form onSubmit={reply} className="g-respuesta-form">
          <label className="visually-hidden" htmlFor={`resp-${item.feedback.id}`}>
            {item.feedback.replies.length === 0 ? 'Responder' : 'Agregar otra respuesta'}
          </label>
          <textarea id={`resp-${item.feedback.id}`} value={text} required maxLength={1000}
                    placeholder={item.feedback.replies.length === 0 ? 'Tu respuesta' : 'Agregar otra respuesta'}
                    onChange={(event) => setText(event.target.value)} />
          <div className="g-botones">
            <button type="submit" className="g-btn g-btn--primario g-btn--chico" disabled={busy || closing || text.trim() === ''}>Responder</button>
            <button type="button" className="g-btn g-btn--chico" disabled={busy || closing} onClick={() => void close()}>
              {closing ? 'Cerrando…' : 'Cerrar'}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
