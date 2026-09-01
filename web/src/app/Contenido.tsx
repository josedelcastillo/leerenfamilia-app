import { useEffect, useState } from 'react';
import { api, type ContentResponse, type WeekContent } from '../shared/api.ts';
import type { QueuedKind } from '../shared/sync-queue.ts';

const KIND_LABEL: Record<string, string> = {
  lectura: 'Lectura',
  cancion: 'Canción',
  juego: 'Juego',
  conversacion: 'Conversación',
};

export function Contenido({
  enqueue,
}: {
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
}) {
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  useEffect(() => {
    api
      .getContent()
      .then((response) => {
        setContent(response);
        setOpenWeek(Math.min(response.currentWeek, response.programWeeks));
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  // Recorded through the queue like everything else, so opening an activity offline is not lost.
  const recordAccess = (week: number, resourceId: string) =>
    void enqueue('acceso', { resourceId, week, at: new Date().toISOString() });

  if (error !== null) {
    return <p className="banner banner--error">No pudimos cargar el contenido. {error}</p>;
  }
  if (content === null) {
    return <p className="muted">Cargando…</p>;
  }

  const current = Math.min(content.currentWeek, content.programWeeks);

  return (
    <section>
      <h1>
        {content.finished
          ? 'Ya completaste las 8 semanas'
          : `Semana ${current} con ${content.babyName || 'tu bebé'}`}
      </h1>
      <p className="muted small">
        {content.finished
          ? 'Puedes volver a cualquier semana cuando quieras.'
          : `Semana ${current} de ${content.programWeeks}. Las semanas anteriores siguen disponibles.`}
      </p>

      {content.weeks.length === 0 && (
        <p className="card card--muted">Tu programa todavía no comienza.</p>
      )}

      {[...content.weeks].reverse().map((week) => (
        <Semana
          key={week.week}
          week={week}
          isCurrent={week.week === current}
          open={openWeek === week.week}
          onToggle={() => setOpenWeek(openWeek === week.week ? null : week.week)}
          onOpenActivity={(resourceId) => recordAccess(week.week, resourceId)}
        />
      ))}
    </section>
  );
}

function Semana({
  week,
  isCurrent,
  open,
  onToggle,
  onOpenActivity,
}: {
  week: WeekContent;
  isCurrent: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenActivity: (resourceId: string) => void;
}) {
  return (
    <article className={isCurrent ? 'card' : 'card card--muted'}>
      <button
        type="button"
        className="chip"
        aria-expanded={open}
        onClick={onToggle}
        style={{ width: '100%', textAlign: 'left', borderRadius: 'var(--radius)' }}
      >
        <strong>Semana {week.week}</strong>
        {isCurrent && ' · esta semana'}
      </button>

      {open && (
        <>
          <h2>{week.title}</h2>
          {week.isPlaceholder === true && (
            <p className="placeholder-note">
              Contenido de ejemplo. El material real lo está preparando Leer en Familia.
            </p>
          )}
          {week.activities.map((activity) => (
            <div key={activity.id} className="entry">
              <div className="entry__head">
                <h3>{activity.title}</h3>
                <span className="tag">{KIND_LABEL[activity.kind] ?? activity.kind}</span>
              </div>
              <p className="small muted">
                {activity.instructions} · unos {activity.approximateMinutes} minutos
              </p>
              <button
                type="button"
                className="chip"
                onClick={() => onOpenActivity(activity.id)}
              >
                Ya la hicimos
              </button>
            </div>
          ))}
        </>
      )}
    </article>
  );
}
