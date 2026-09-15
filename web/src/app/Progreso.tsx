import { useCallback, useEffect, useState } from 'react';
import { api, type LogEntry } from '../shared/api.ts';
import type { QueuedItem } from '../shared/sync-queue.ts';
import { Cerebro } from './components/Cerebro.tsx';
import { brainState } from './components/cerebro.ts';
import { mergeHistorial } from './components/historial.ts';
import { entryDetail, progressHeadline, relativeDay, todayLocal } from './formato.ts';

/**
 * Screen 4: what the family has built. The history is the server's plus what is still queued
 * (D-015), so an entry logged with no signal counts the instant it is written.
 */
export function Progreso({
  pendingItems,
  syncedAt,
  currentWeek,
  onRegister,
  onOpenPrivacidad,
}: {
  pendingItems: readonly QueuedItem[];
  syncedAt: number;
  currentWeek: number;
  onRegister: () => void;
  onOpenPrivacidad: () => void;
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
  useEffect(() => {
    if (syncedAt > 0) load();
  }, [syncedAt, load]);

  const entries = mergeHistorial(stored, pendingItems);
  const today = todayLocal();

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <div className="progreso-cabecera">
          <p className="meta">Lo que han construido</p>
          <img className="mishashos" src="/marca/mishashos.png" alt="" width={132} />
        </div>

        {entries.length === 0 ? (
          <p className="lectura">Aún no registras lecturas. La primera puede ser hoy, aunque dure dos minutos.</p>
        ) : (
          <>
            <div>
              <p className="cifra">{entries.length}</p>
              <p className="cifra-leyenda">{progressHeadline(entries.length, Math.max(1, currentWeek))}</p>
            </div>
            <p className="lectura lectura--suave">Cada línea es una vez que tu bebé escuchó tu voz. Ninguna se borra.</p>
            <Cerebro state={brainState(entries)} />
            <hr className="filete" />
            {loadFailed && <p className="meta meta--chica">Ves lo que está guardado en este teléfono.</p>}
            <ol className="lista-puntos lista-puntos--desvanece">
              {entries.map((entry) => (
                <li key={entry.clientId}>
                  <span className="punto punto--coral" aria-hidden="true" />
                  <div className="lista-puntos__cuerpo">
                    <span className="lista-puntos__titulo">{relativeDay(entry.date, today)}</span>
                    <span className="meta meta--chica">
                      {entryDetail(entry)}
                      {entry.pending && ' · por enviar'}
                    </span>
                    {entry.note !== null && entry.note !== '' && <p className="nota-propia">{entry.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="nota-caja">Todo lo que registras se queda aquí. Nada se borra ni retrocede.</p>
          </>
        )}

        <button type="button" className="enlace" onClick={onOpenPrivacidad}>Tus datos y privacidad</button>
      </div>

      <div className="pantalla__accion">
        <button type="button" className="btn" onClick={onRegister}>
          {entries.length === 0 ? 'Registrar la primera' : 'Registrar lectura'}
        </button>
      </div>
    </section>
  );
}
