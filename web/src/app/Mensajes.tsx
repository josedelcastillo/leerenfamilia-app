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

const TYPE_LABEL: Record<string, string> = {
  consulta: 'Duda', comentario: 'Comentario', pedido: 'Pedido', problema: 'Problema',
};

/** Status in the family's words. "Waiting" is not an alarm here: nothing on these screens reads as a deficit. */
function statusLabel(item: { pending: boolean; status: string }): { text: string; ok: boolean } {
  if (item.pending) return { text: 'Por enviar', ok: false };
  if (item.status === 'respondido') return { text: 'Respondido', ok: true };
  if (item.status === 'cerrado') return { text: 'Cerrado', ok: false };
  return { text: 'Esperando respuesta', ok: false };
}

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
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);
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
    <form className="pantalla" onSubmit={submit}>
      <div className="pantalla__cuerpo">
        <h1 className="titular titular--actividad">Escríbenos</h1>
        <p className="lectura lectura--suave">Te respondemos por aquí y por WhatsApp.</p>

        <div className="chips" role="group" aria-label="¿De qué se trata?">
          {TYPES.map((option) => (
            <button key={option.value} type="button" className="chip" aria-pressed={type === option.value}
                    onClick={() => setType(option.value)}>
              {option.label}
            </button>
          ))}
        </div>

        <label className="visually-hidden" htmlFor="texto">Tu mensaje</label>
        <textarea id="texto" className="campo-mensaje" value={text} maxLength={2000} required
                  placeholder="Cuéntanos con tus palabras" onChange={(event) => setText(event.target.value)} />

        <hr className="filete" />

        {loadFailed && <p className="meta meta--chica">Ves los mensajes guardados en este teléfono.</p>}
        {thread.length === 0 ? (
          <p className="meta">Todavía no nos escribiste. Lo que mandes aparece aquí con su respuesta.</p>
        ) : (
          <ul className="hilo">
            {thread.map((item) => {
              const status = statusLabel(item);
              return (
                <li key={item.id} className="mensaje">
                  <div className="mensaje__cabecera">
                    <span className="tipo">{TYPE_LABEL[item.type] ?? item.type}</span>
                    <span className={status.ok ? 'mensaje__estado mensaje__estado--ok' : 'mensaje__estado'}>{status.text}</span>
                  </div>
                  <p className="mensaje__texto">“{item.text}”</p>
                  {item.replies.map((reply, index) => (
                    <div key={`${item.id}-${index}`} className="respuesta">
                      <span className="respuesta__autor">Leer en Familia</span>
                      <span className="respuesta__texto">{reply.text}</span>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="pantalla__accion">
        <button type="submit" className="btn" disabled={busy || text.trim() === ''}>Enviar</button>
      </div>
    </form>
  );
}
