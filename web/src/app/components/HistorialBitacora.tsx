import { ACTIVITY_KINDS } from './RegistroForm.tsx';
import type { HistorialEntry } from './historial.ts';

function label(kind: string): string {
  return ACTIVITY_KINDS.find((option) => option.value === kind)?.label ?? kind;
}

export function HistorialBitacora({ entries }: { entries: readonly HistorialEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="card card--muted">
        Todavía no registraste nada. Lo que anotes aparece acá, aunque estés sin señal.
      </p>
    );
  }

  const totalMinutes = entries.reduce((total, entry) => total + entry.minutes, 0);
  const days = new Set(entries.map((entry) => entry.date)).size;

  return (
    <>
      <p className="small muted">
        {entries.length === 1 ? '1 registro' : `${entries.length} registros`} · {days}{' '}
        {days === 1 ? 'día' : 'días'} · {totalMinutes} minutos en total
      </p>
      <div className="card">
        {entries.map((entry) => (
          <div key={entry.clientId} className="entry">
            <div className="entry__head">
              <strong>{label(entry.kind)}</strong>
              {entry.pending
                ? <span className="tag tag--pending">Pendiente</span>
                : <span className="tag tag--ok">Guardado</span>}
            </div>
            <p className="small muted">
              {entry.date} · {entry.minutes} min
            </p>
            {entry.note !== null && entry.note !== '' && <p className="small">{entry.note}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
