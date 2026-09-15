import type { CSSProperties } from 'react';
import type { Dashboard } from './api.ts';
import { participationBars } from './reporte.ts';

/** Families with at least one entry, per programme week, as a share of those that reached it. */
export function Participacion({ data, hoja = false }: { data: Dashboard; hoja?: boolean }) {
  const bars = participationBars(data);
  const label = bars
    .filter((bar) => bar.estado !== 'futura')
    .map((bar) => `Semana ${bar.semana}: ${bar.activas} familias`)
    .join('. ');

  return (
    <div className={hoja ? 'g-barras g-barras--hoja' : 'g-barras'} role="img" aria-label={label || 'Sin semanas todavía'}>
      {bars.map((bar) => (
        <div key={bar.semana} className={`g-barra g-barra--${bar.estado}`}>
          <div className="g-barra__valor" style={{ '--alto': `${Math.max(bar.porcentaje, 4)}%` } as CSSProperties} />
          <div className="g-barra__etiqueta">
            {!hoja && bar.estado !== 'futura' && <>{bar.activas}<br /></>}S{bar.semana}
          </div>
        </div>
      ))}
    </div>
  );
}
