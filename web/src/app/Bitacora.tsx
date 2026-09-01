import { useState } from 'react';
import type { QueuedKind } from '../shared/sync-queue.ts';

const KINDS = [
  { value: 'lectura', label: 'Leímos' },
  { value: 'cancion', label: 'Cantamos' },
  { value: 'juego', label: 'Jugamos' },
  { value: 'conversacion', label: 'Conversamos' },
] as const;

const DURATIONS = [5, 10, 15, 20, 30];

interface LocalEntry {
  clientId: string;
  date: string;
  kind: string;
  minutes: number;
  note: string | null;
}

function today(): string {
  // The device's own calendar date, which is what the caregiver means by "today".
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * The reading log. Written to the local queue first and rendered immediately, so it behaves the
 * same with or without a signal — which is the whole point, because this is the pilot's primary
 * source of indicators and a gap here is a gap in the final report.
 */
export function Bitacora({
  enqueue,
  pending,
}: {
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  pending: number;
}) {
  const [kind, setKind] = useState<string>('lectura');
  const [minutes, setMinutes] = useState<number>(10);
  const [date, setDate] = useState<string>(today());
  const [note, setNote] = useState<string>('');
  const [saved, setSaved] = useState<LocalEntry[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const clientId = crypto.randomUUID();
      await enqueue('bitacora', {
        clientId,
        date,
        kind_actividad: kind,
        minutes,
        note: note.trim() === '' ? null : note.trim(),
      });
      setSaved((current) => [
        { clientId, date, kind, minutes, note: note.trim() === '' ? null : note.trim() },
        ...current,
      ]);
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>¿Qué hicieron hoy?</h1>
      <p className="muted small">
        Anota los ratos que pasaste con tu bebé. Un minuto basta: lo importante es la constancia.
      </p>

      <form onSubmit={submit} className="card">
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="visually-hidden">Tipo de actividad</legend>
          <label id="tipo-label">Actividad</label>
          <div className="chips" role="group" aria-labelledby="tipo-label">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="chip"
                aria-pressed={kind === option.value}
                onClick={() => setKind(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="visually-hidden">Duración</legend>
          <label id="dur-label">¿Cuánto rato?</label>
          <div className="chips" role="group" aria-labelledby="dur-label">
            {DURATIONS.map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={minutes === value}
                onClick={() => setMinutes(value)}
              >
                {value} min
              </button>
            ))}
          </div>
        </fieldset>

        <label htmlFor="fecha">Día</label>
        <input
          id="fecha"
          type="date"
          value={date}
          max={today()}
          onChange={(event) => setDate(event.target.value)}
        />

        <label htmlFor="nota">Nota (opcional)</label>
        <textarea
          id="nota"
          value={note}
          maxLength={1000}
          placeholder="Por ejemplo: se quedó mirando los dibujos"
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="small muted">
          El equipo solo lee estas notas si lo autorizaste al registrarte.
        </p>

        <button type="submit" className="btn" disabled={busy}>
          Guardar
        </button>
      </form>

      {saved.length > 0 && (
        <>
          <h2>Registrado en este dispositivo</h2>
          <div className="card">
            {saved.map((entry) => (
              <div key={entry.clientId} className="entry">
                <div className="entry__head">
                  <strong>{KINDS.find((k) => k.value === entry.kind)?.label ?? entry.kind}</strong>
                  <span className={pending > 0 ? 'tag tag--pending' : 'tag tag--ok'}>
                    {pending > 0 ? 'Pendiente' : 'Sincronizado'}
                  </span>
                </div>
                <p className="small muted">
                  {entry.date} · {entry.minutes} min
                  {entry.note !== null && ` · ${entry.note}`}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
