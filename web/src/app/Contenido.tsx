import { useEffect, useState } from 'react';
import { api, type Activity, type ContentResponse, type WeekContent } from '../shared/api.ts';
import type { QueuedKind } from '../shared/sync-queue.ts';
import { RegistroForm, todayLocal } from './components/RegistroForm.tsx';

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
  const [logging, setLogging] = useState<{ week: number; activity: Activity } | null>(null);
  const [justLogged, setJustLogged] = useState<string | null>(null);

  useEffect(() => {
    api
      .getContent()
      .then((response) => {
        setContent(response);
        setOpenWeek(Math.min(response.currentWeek, response.programWeeks));
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  /**
   * Opening a week records that the family looked at it — "who opened what and when", which is what
   * the access entity is for. The client id is fixed per week and day, so re-opening the same week
   * ten times in an afternoon is one record, not ten.
   */
  function recordAccess(week: number) {
    const day = todayLocal();
    void enqueue('acceso', {
      clientId: `acceso-${week}-${day}`,
      resourceId: `semana-${String(week).padStart(2, '0')}`,
      week,
      at: `${day}T00:00:00.000Z`,
    });
  }

  if (error !== null) {
    return <p className="banner banner--error">No pudimos cargar el contenido. {error}</p>;
  }
  if (content === null) {
    return <p className="muted">Cargando…</p>;
  }

  const current = Math.min(content.currentWeek, content.programWeeks);

  if (logging !== null) {
    return (
      <section>
        <h1>{logging.activity.title}</h1>
        <p className="muted small">
          Semana {logging.week} · anota cuánto rato le dedicaron.
        </p>
        <RegistroForm
          initialKind={logging.activity.kind}
          submitLabel="Registrar"
          onCancel={() => setLogging(null)}
          onSubmit={async (values) => {
            await enqueue('bitacora', {
              clientId: crypto.randomUUID(),
              date: values.date,
              kind_actividad: values.kind,
              minutes: values.minutes,
              // Ties the entry to the activity it came from, which is what lets the pilot see which
              // resources actually get used.
              resourceId: logging.activity.id,
              note: values.note === '' ? null : values.note,
            });
            setLogging(null);
            setJustLogged(logging.activity.title);
          }}
        />
      </section>
    );
  }

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

      {justLogged !== null && (
        <p className="banner banner--pending" role="status">
          Registramos «{justLogged}» en tu bitácora.
        </p>
      )}

      {content.weeks.length === 0 && (
        <p className="card card--muted">Tu programa todavía no comienza.</p>
      )}

      {[...content.weeks].reverse().map((week) => (
        <Semana
          key={week.week}
          week={week}
          isCurrent={week.week === current}
          open={openWeek === week.week}
          onToggle={() => {
            const next = openWeek === week.week ? null : week.week;
            setOpenWeek(next);
            if (next !== null) recordAccess(week.week);
          }}
          onLogActivity={(activity) => {
            setJustLogged(null);
            setLogging({ week: week.week, activity });
          }}
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
  onLogActivity,
}: {
  week: WeekContent;
  isCurrent: boolean;
  open: boolean;
  onToggle: () => void;
  onLogActivity: (activity: Activity) => void;
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
              <button type="button" className="chip" onClick={() => onLogActivity(activity)}>
                Ya lo hicimos
              </button>
            </div>
          ))}
        </>
      )}
    </article>
  );
}
