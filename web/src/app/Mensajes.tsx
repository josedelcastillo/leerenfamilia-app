import { useEffect, useState } from 'react';
import { api, type Feedback } from '../shared/api.ts';
import type { QueuedKind } from '../shared/sync-queue.ts';

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

export function Mensajes({
  enqueue,
}: {
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
}) {
  const [thread, setThread] = useState<Feedback[]>([]);
  const [type, setType] = useState<string>('consulta');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    // Offline this simply fails and the local thread stays empty; the queue still accepts writes.
    api.listFeedback().then((response) => setThread(response.feedback)).catch(() => undefined);
  }, []);

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
      setJustSent(true);
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
        {justSent && (
          <p className="banner banner--pending small" role="status">
            Recibido. Si estás sin señal se enviará solo cuando vuelva.
          </p>
        )}
      </form>

      {thread.length > 0 && (
        <>
          <h2>Tus mensajes anteriores</h2>
          {thread.map((item) => (
            <article key={item.id} className="card">
              <div className="entry__head">
                <span className="tag">{item.channel === 'whatsapp' ? 'WhatsApp' : 'App'}</span>
                <span className={item.status === 'abierto' ? 'tag tag--pending' : 'tag tag--ok'}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              </div>
              <p>{item.text}</p>
              {item.replies.map((reply, index) => (
                <div key={`${item.id}-${index}`} className="entry">
                  <strong className="small">Leer en Familia</strong>
                  <p>{reply.text}</p>
                </div>
              ))}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
