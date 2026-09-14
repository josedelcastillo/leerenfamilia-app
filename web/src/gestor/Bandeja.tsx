import { useCallback, useEffect, useState } from 'react';
import { gestorApi, type InboxItem } from './api.ts';

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

  const load = useCallback((estado: string) => {
    setItems(null);
    gestorApi.bandeja(estado)
      .then((response) => setItems(response.mensajes))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  useEffect(() => load(filter), [filter, load]);

  if (error !== null) return <p className="banner banner--error">{error}</p>;

  return (
    <section>
      <h2>Bandeja</h2>
      <p className="small muted">
        Un solo lugar para lo que llega por la app y por WhatsApp. Los más antiguos primero.
      </p>

      <div className="toolbar" role="group" aria-label="Filtrar por estado">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {items === null && <p className="muted">Cargando…</p>}
      {items !== null && items.length === 0 && (
        <p className="card card--muted">Nada pendiente aquí.</p>
      )}
      {items?.map((item) => (
        <Mensaje key={item.feedback.id} item={item} onChanged={() => load(filter)} />
      ))}
    </section>
  );
}

function Mensaje({ item, onChanged }: { item: InboxItem; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await gestorApi.responder(item.familyId, item.feedback.id, text);
      // The reply is saved even when the notification fails, and the manager needs to know which
      // of the two happened.
      setNotice(
        outcome.notified
          ? `Respondido y avisado por WhatsApp (${outcome.channel}).`
          : `Respuesta guardada, pero no se pudo avisar por WhatsApp: ${outcome.reason ?? 'sin detalle'}.`,
      );
      setText('');
      onChanged();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card">
      <div className="entry__head">
        <span>
          <strong>{item.babyName || item.familyId}</strong>{' '}
          <span className="pill pill--quiet">{item.feedback.channel === 'whatsapp' ? 'WhatsApp' : 'App'}</span>{' '}
          <span className="pill pill--quiet">{TYPE_LABEL[item.feedback.type] ?? item.feedback.type}</span>
        </span>
        <span className={item.feedback.status === 'abierto' ? 'pill pill--alert' : 'pill pill--ok'}>
          {item.feedback.status}
        </span>
      </div>
      <p className="small muted">{new Date(item.feedback.createdAt).toLocaleString('es-PE')}</p>
      <p>{item.feedback.text}</p>

      {item.feedback.replies.map((entry, index) => (
        <div key={index} className="thread">
          <p className="small muted">Respondido el {new Date(entry.at).toLocaleString('es-PE')}</p>
          <p>{entry.text}</p>
        </div>
      ))}

      {item.feedback.status !== 'cerrado' && (
        <form onSubmit={reply}>
          <label htmlFor={`resp-${item.feedback.id}`} className="small">
            {item.feedback.replies.length === 0 ? 'Responder' : 'Agregar otra respuesta'}
          </label>
          <textarea
            id={`resp-${item.feedback.id}`}
            value={text}
            required
            maxLength={1000}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="toolbar">
            <button type="submit" className="btn" disabled={busy || text.trim() === ''}>
              Responder
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => void gestorApi.cerrar(item.familyId, item.feedback.id).then(onChanged)}
            >
              Cerrar
            </button>
          </div>
          {item.feedback.replies.length > 0 && (
            <p className="small muted">
              Las respuestas no se editan: esta se agrega a la anterior y la familia ve las dos.
            </p>
          )}
        </form>
      )}

      {notice !== null && <p className="banner banner--pending small">{notice}</p>}
    </article>
  );
}
