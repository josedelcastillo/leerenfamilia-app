import { useState } from 'react';
import type { Activity, ContentResponse } from '../shared/api.ts';
import { ActividadesLista } from './components/ActividadesLista.tsx';

/** Earlier weeks stay open, so a family that fell behind can catch up (content handler). */
export function Anteriores({
  content,
  onOpenActivity,
  onBack,
  recordAccess,
}: {
  content: ContentResponse;
  onOpenActivity: (week: number, activity: Activity) => void;
  onBack: () => void;
  recordAccess: (week: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const current = Math.min(content.currentWeek, content.programWeeks);
  const previous = content.weeks.filter((week) => week.week < current).reverse();

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <h1 className="titular titular--actividad">Semanas anteriores</h1>
        <p className="lectura lectura--suave">Siguen aquí. Puedes volver a cualquiera cuando quieras.</p>
        <ul className="actividades">
          {previous.map((week) => (
            <li key={week.week}>
              <button
                type="button"
                aria-expanded={open === week.week}
                onClick={() => {
                  const next = open === week.week ? null : week.week;
                  setOpen(next);
                  if (next !== null) recordAccess(next);
                }}
              >
                <span>Semana {week.week}</span>
                <span className="actividades__tipo">{open === week.week ? 'Cerrar' : 'Abrir'}</span>
              </button>
              {open === week.week && (
                <div className="semana-abierta">
                  <ActividadesLista activities={week.activities} onOpen={(a) => onOpenActivity(week.week, a)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
