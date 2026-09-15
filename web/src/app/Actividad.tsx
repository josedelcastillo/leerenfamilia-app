import type { Activity, WeekContent } from '../shared/api.ts';
import { ActividadesLista } from './components/ActividadesLista.tsx';
import { Reproductor } from './components/Reproductor.tsx';
import { KIND_LABEL } from './formato.ts';
import { KIND_COPY } from './registro-rapido.ts';

/**
 * Screen 5. The instructions come from the content API and are placeholder today (rule 11), so the
 * placeholder notice stays on screen. The player shows only when the activity has audio.
 */
export function Actividad({
  week,
  activity,
  onOpen,
  onDone,
  onBack,
  busy = false,
}: {
  week: WeekContent;
  activity: Activity;
  onOpen: (activity: Activity) => void;
  /** "Ya la cantamos": logs it in one tap and moves to the confirmed logging screen. */
  onDone: () => void;
  onBack: () => void;
  /** Disables the button while the one-tap log is in flight, so a fast double tap logs once. */
  busy?: boolean;
}) {
  const others = week.activities.filter((a) => a.id !== activity.id);

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <div className="fila-meta">
          <span className="tipo">{KIND_LABEL[activity.kind]}</span>
          <span className="meta meta--chica">Semana {week.week}</span>
        </div>
        <h1 className="titular titular--actividad">{activity.title}</h1>
        <p className="lectura">{activity.instructions}</p>
        {activity.mediaUrl !== null && <Reproductor src={activity.mediaUrl} titulo={activity.title} />}
        {week.isPlaceholder === true && (
          <p className="aviso-placeholder">
            Contenido de ejemplo. El material real lo está preparando Leer en Familia.
          </p>
        )}
        {others.length > 0 && (
          <>
            <hr className="filete" />
            <p className="subtitulo">También esta semana</p>
            <ActividadesLista activities={others} onOpen={onOpen} />
          </>
        )}
      </div>
      <div className="pantalla__accion">
        <button type="button" className="btn" disabled={busy} onClick={onDone}>{KIND_COPY[activity.kind].hecho}</button>
      </div>
    </section>
  );
}
