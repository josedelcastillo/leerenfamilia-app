import { useCallback, useEffect, useState } from 'react';
import { api, type LogEntry } from '../shared/api.ts';
import type { QueuedItem, QueuedKind } from '../shared/sync-queue.ts';
import { Cerebro } from './components/Cerebro.tsx';
import { brainState } from './components/cerebro.ts';
import { HistorialBitacora } from './components/HistorialBitacora.tsx';
import { mergeHistorial } from './components/historial.ts';
import { RegistroForm } from './components/RegistroForm.tsx';

/**
 * The reading log. Written to the local queue first and shown immediately, so it behaves the same
 * with or without a signal — which is the point, since this is the pilot's primary source of
 * indicators and a gap here is a gap in the final report.
 *
 * The history is loaded from the server and merged with what is still queued, so it survives
 * leaving the screen. Before, an entry only existed while this component stayed mounted.
 */
export function Bitacora({
  enqueue,
  pendingItems,
  syncedAt,
}: {
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  pendingItems: readonly QueuedItem[];
  syncedAt: number;
}) {
  const [stored, setStored] = useState<readonly LogEntry[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    api
      .listLog()
      .then((response) => {
        setStored(response.entries);
        setLoadFailed(false);
      })
      // Offline this fails and the queued entries carry the view on their own.
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);
  // Reload once a flush has landed, so entries move from "pendiente" to "guardado" on their own.
  useEffect(() => {
    if (syncedAt > 0) load();
  }, [syncedAt, load]);

  const entries = mergeHistorial(stored, pendingItems);

  return (
    <section>
      <h1>¿Qué hicieron hoy?</h1>
      <p className="muted small">
        Anota los ratos que pasaste con tu bebé. Un minuto basta: lo importante es la constancia.
      </p>

      {/* Built from the merged history, so it grows the instant an entry is queued — with or
          without a signal. */}
      <Cerebro state={brainState(entries)} />

      <RegistroForm
        onSubmit={async (values) => {
          await enqueue('bitacora', {
            clientId: crypto.randomUUID(),
            date: values.date,
            kind_actividad: values.kind,
            minutes: values.minutes,
            note: values.note === '' ? null : values.note,
          });
        }}
      />

      <h2>Lo que llevas registrado</h2>
      {loadFailed && (
        <p className="banner banner--offline small">
          No pudimos cargar tu historial completo. Abajo ves lo que está guardado en este celular.
        </p>
      )}
      <HistorialBitacora entries={entries} />
    </section>
  );
}
