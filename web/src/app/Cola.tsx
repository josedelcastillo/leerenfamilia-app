import type { QueuedItem } from '../shared/sync-queue.ts';
import { describeQueued, visibleQueue } from './cola.ts';
import { colaHeadline, todayLocal } from './formato.ts';

/** Screen 7. The real number of pending items, and the reassurance that they are not lost. */
export function Cola({ online, items, onBack }: { online: boolean; items: readonly QueuedItem[]; onBack: () => void }) {
  const visible = visibleQueue(items);
  const today = todayLocal();

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <p className="estado-linea">
          <span className={`punto ${online ? 'punto--ok' : 'punto--alerta'}`} aria-hidden="true" />
          {online ? 'Con conexión' : 'Sin conexión'}
        </p>
        <h1 className="titular">{colaHeadline(visible.length)}</h1>
        {visible.length > 0 && (
          <p className="lectura lectura--suave">
            Están guardados en tu teléfono. Se envían solos en cuanto vuelvas a tener datos; no tienes que hacer nada.
          </p>
        )}
        <hr className="filete" />
        <ul className="lista-puntos">
          {visible.map((item) => {
            const view = describeQueued(item, today);
            return (
              <li key={item.clientId}>
                <span className="punto punto--morado" aria-hidden="true" />
                <div className="lista-puntos__cuerpo">
                  <span className="lista-puntos__titulo">{view.titulo}</span>
                  <span className="meta meta--chica">{view.cuando}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="nota-caja">Puedes seguir registrando sin señal. La cola no se pierde si cierras la app.</p>
      </div>
      <div className="pantalla__accion">
        <button type="button" className="btn" onClick={onBack}>Seguir registrando</button>
      </div>
    </section>
  );
}
