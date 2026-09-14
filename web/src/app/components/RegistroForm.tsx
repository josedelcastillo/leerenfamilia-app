import { useState } from 'react';

export const ACTIVITY_KINDS = [
  { value: 'lectura', label: 'Leímos' },
  { value: 'cancion', label: 'Cantamos' },
  { value: 'juego', label: 'Jugamos' },
  { value: 'conversacion', label: 'Conversamos' },
] as const;

const DURATIONS = [5, 10, 15, 20, 30];

export function todayLocal(): string {
  // The device's own calendar date, which is what a caregiver means by "today".
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export interface RegistroValues {
  kind: string;
  minutes: number;
  date: string;
  note: string;
}

/**
 * The one form for writing a log entry. Shared by the Bitácora tab and by "Ya lo hicimos" on the
 * weekly content, so both ask for the same things and behave the same way — an activity done from
 * the content screen is not a lesser record than one typed by hand.
 */
export function RegistroForm({
  initialKind = 'lectura',
  submitLabel = 'Guardar',
  onSubmit,
  onCancel,
}: {
  initialKind?: string;
  submitLabel?: string;
  onSubmit: (values: RegistroValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<string>(initialKind);
  const [minutes, setMinutes] = useState<number>(10);
  const [date, setDate] = useState<string>(todayLocal());
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ kind, minutes, date, note: note.trim() });
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="visually-hidden">Tipo de actividad</legend>
        <label id={`tipo-${initialKind}`}>Actividad</label>
        <div className="chips" role="group" aria-labelledby={`tipo-${initialKind}`}>
          {ACTIVITY_KINDS.map((option) => (
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
        <label id={`dur-${initialKind}`}>¿Cuánto rato?</label>
        <div className="chips" role="group" aria-labelledby={`dur-${initialKind}`}>
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

      <label htmlFor={`fecha-${initialKind}`}>Día</label>
      <input
        id={`fecha-${initialKind}`}
        type="date"
        value={date}
        max={todayLocal()}
        onChange={(event) => setDate(event.target.value)}
      />

      <label htmlFor={`nota-${initialKind}`}>Nota (opcional)</label>
      <textarea
        id={`nota-${initialKind}`}
        value={note}
        maxLength={1000}
        placeholder="Por ejemplo: se quedó mirando los dibujos"
        onChange={(event) => setNote(event.target.value)}
      />
      <p className="small muted">
        El equipo solo lee estas notas si lo autorizaste al registrarte.
      </p>

      <button type="submit" className="btn" disabled={busy}>
        {submitLabel}
      </button>
      {onCancel !== undefined && (
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      )}
    </form>
  );
}
