import { useEffect } from 'react';
import type { Activity } from '../shared/api.ts';
import { ActividadesLista } from './components/ActividadesLista.tsx';
import { Marcas } from './components/Marcas.tsx';
import type { ContenidoState } from './useContenido.ts';

const PLACEHOLDER = 'Contenido de ejemplo. El material real lo está preparando Leer en Familia.';

/** Screen 2. The current week is the screen; earlier weeks are one link away. */
export function Inicio({
  state,
  onOpenActivity,
  onRegister,
  onOpenAnteriores,
  recordAccess,
}: {
  state: ContenidoState;
  onOpenActivity: (week: number, activity: Activity) => void;
  onRegister: (week: number | null) => void;
  onOpenAnteriores: () => void;
  recordAccess: (week: number) => void;
}) {
  const content = state.status === 'listo' ? state.content : null;
  const current = content === null ? 0 : Math.min(content.currentWeek, content.programWeeks);
  const week = content?.weeks.find((w) => w.week === current) ?? null;

  // Showing a week's content is what counts as opening it (D-016). One record per week and day.
  useEffect(() => {
    if (week !== null) recordAccess(week.week);
  }, [week, recordAccess]);

  if (state.status === 'cargando') {
    return <section className="pantalla"><p className="meta">Cargando…</p></section>;
  }

  if (content === null || week === null) {
    return (
      <section className="pantalla">
        <div className="pantalla__cuerpo">
          <h1 className="titular">
            {content === null
              ? 'La actividad de esta semana aparece sola cuando haya señal.'
              : 'Tu programa todavía no comienza.'}
          </h1>
          <p className="lectura">Mientras tanto, puedes registrar cuando lean. Se guarda en tu teléfono.</p>
        </div>
        <div className="pantalla__accion">
          <button type="button" className="btn btn--grande" onClick={() => onRegister(null)}>Registrar lectura</button>
        </div>
      </section>
    );
  }

  const lectura = week.activities.find((a) => a.kind === 'lectura') ?? null;
  const cancion = week.activities.find((a) => a.kind === 'cancion') ?? null;

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <div className="semana-cabecera">
          <p className="meta">
            {content.finished
              ? `Completaste las ${content.programWeeks} semanas`
              : `Semana ${current} de ${content.programWeeks}`}
          </p>
          <Marcas actual={current} total={content.programWeeks} />
        </div>

        <h1 className="titular">{week.title}</h1>
        {week.summary !== '' && <p className="lectura">{week.summary}</p>}
        {week.isPlaceholder === true && <p className="aviso-placeholder">{PLACEHOLDER}</p>}

        <hr className="filete" />

        {(lectura !== null || cancion !== null) && (
          <div className="kit">
            <p className="kit__titulo">Esta semana, en el kit</p>
            <p className="kit__items">
              {lectura !== null && <>Cuento: <span>{lectura.title}</span></>}
              {lectura !== null && cancion !== null && <br />}
              {cancion !== null && <>Canción: <span>{cancion.title}</span></>}
            </p>
            {lectura !== null && (
              <button type="button" className="enlace" onClick={() => onOpenActivity(week.week, lectura)}>
                Ver la actividad completa
              </button>
            )}
          </div>
        )}

        <ActividadesLista activities={week.activities} onOpen={(activity) => onOpenActivity(week.week, activity)} />

        {current > 1 && (
          <button type="button" className="enlace" onClick={onOpenAnteriores}>Semanas anteriores</button>
        )}
      </div>

      <div className="pantalla__accion">
        <button type="button" className="btn btn--grande" onClick={() => onRegister(week.week)}>
          Registrar lectura
        </button>
      </div>
    </section>
  );
}
