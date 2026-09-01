import { useCallback, useEffect, useState } from 'react';
import { api, type Feedback } from '../shared/api.ts';
import type { QueuedItem, QueuedKind } from '../shared/sync-queue.ts';
import { mergeThread } from './mensajes-thread.ts';

const TYPES = [
  { value: 'consulta', label: 'Tengo una duda' },
  { value: 'comentario', label: 'Quiero comentar' },
  { value: 'pedido', label: 'Quiero pedir algo' },
  { value: 'problema', label: 'Algo no funciona' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  abierto: 'Esperando respuesta',
  respondido: 'Respondido',
  cerrado: 'Cerrado',
};

const TYPE_LABEL: Record<string, string> = {
  consulta: 'Duda', comentario: 'Comentario', pedido: 'Pedido', problema: 'Problema',
};

export function Mensajes({
  enqueue,
  pendingItems,
  syncedAt,
}: {
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  pendingItems: readonly QueuedItem[];
  syncedAt: number;
}) {
  const [stored, setStored] = useState<readonly Feedback[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [type, setType] = useState<string>('consulta');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .listFeedback()
      .then((response) => {
        setStored(response.feedback);
        setLoadFailed(false);
      })
      // Offline this fails; the queued messages carry the thread on their own.
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);
  // Reload once a flush has landed, so a message stops showing as pending and any reply appears.
  useEffect(() => {
    if (syncedAt > 0) load();
  }, [syncedAt, load]);

  const thread = mergeThread(stored, pendingItems);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim() === '') return;
    setBusy(true);
    try {
      await enqueue('feedback', {
        clientId: crypto.randomUUID(),
        type,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      });
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Mensajes</h1>
      <p className="muted small">
        Escríbenos lo que quieras: dudas, comentarios o pedidos. Te respondemos por aquí y por
        WhatsApp.
      </p>

      <form onSubmit={submit} className="card">
        <label id="tipo-msg">¿De qué se trata?</label>
        <div className="chips" role="group" aria-labelledby="tipo-msg">
          {TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={type === option.value}
              onClick={() => setType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label htmlFor="texto">Tu mensaje</label>
        <textarea
          id="texto"
          value={text}
          maxLength={2000}
          required
          onChange={(event) => setText(event.target.value)}
        />

        <button type="submit" className="btn" disabled={busy || text.trim() === ''}>
          Enviar
        </button>
      </form>

      <h2>Tus mensajes</h2>
      {loadFailed && (
        <p className="banner banner--offline small">
          No pudimos cargar tus mensajes anteriores. Abajo ves los que están guardados en este celular.
        </p>
      )}

      {thread.length === 0 && (
        <p className="card card--muted">
          Todavía no nos escribiste. Lo que mandes aparece acá con su respuesta.
        </p>
      )}

      {thread.map((item) => (
        <article key={item.id} className="card">
          <div className="entry__head">
            <span>
              <span className="tag">{TYPE_LABEL[item.type] ?? item.type}</span>{' '}
              {item.channel === 'whatsapp' && <span className="tag">WhatsApp</span>}
            </span>
            {item.pending
              ? <span className="tag tag--pending">Pendiente de enviar</span>
              : <span className={item.status === 'abierto' ? 'tag tag--pending' : 'tag tag--ok'}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>}
          </div>
          <p className="small muted">{new Date(item.createdAt).toLocaleString('es-PE')}</p>
          <p>{item.text}</p>

          {item.replies.map((reply, index) => (
            <div key={`${item.id}-${index}`} className="thread-reply">
              <strong className="small">Leer en Familia</strong>
              <p className="small muted">{new Date(reply.at).toLocaleString('es-PE')}</p>
              <p>{reply.text}</p>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
