import { useState } from 'react';
import { api } from '../shared/api.ts';
import { setToken } from '../shared/token.ts';

/** The consent text is a placeholder pending legal review; see docs/tratamiento-datos.md. */
const CONSENT_VERSION = 'borrador-0';

/**
 * Enrolment from the clinic QR. Shown only when the device has no token — normally the family
 * arrives from the WhatsApp link and never sees this screen.
 */
export function Registro({ onRegistered }: { onRegistered: () => void }) {
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [secondMsisdn, setSecondMsisdn] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [notesAuthorized, setNotesAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.register({
        programId: 'piloto-2026',
        clinic: new URLSearchParams(window.location.search).get('c') ?? '',
        baby: { name: babyName, birthDate },
        caregivers: [
          { msisdn, role: 'principal' },
          ...(secondMsisdn.trim() !== '' ? [{ msisdn: secondMsisdn, role: 'secundario' }] : []),
        ],
        consent: {
          accepted,
          version: CONSENT_VERSION,
          freeTextNotesAuthorized: notesAuthorized,
        },
      });
      setToken(response.token);
      onRegistered();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos completar el registro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Bienvenida a Nacidos para Leer Perú</h1>
      <p className="muted small">
        Ocho semanas de actividades para leer, cantar, jugar y conversar con tu bebé.
      </p>

      <form onSubmit={submit} className="card">
        <label htmlFor="bebe">¿Cómo se llama tu bebé?</label>
        <input
          id="bebe"
          value={babyName}
          required
          autoComplete="off"
          placeholder="Nombre o como le dicen en casa"
          onChange={(event) => setBabyName(event.target.value)}
        />

        <label htmlFor="nacimiento">¿Cuándo nació?</label>
        <input
          id="nacimiento"
          type="date"
          value={birthDate}
          required
          onChange={(event) => setBirthDate(event.target.value)}
        />

        <label htmlFor="celular">Tu celular</label>
        <input
          id="celular"
          type="tel"
          inputMode="tel"
          value={msisdn}
          required
          placeholder="987 654 321"
          onChange={(event) => setMsisdn(event.target.value)}
        />

        <label htmlFor="celular2">Celular de otro cuidador (opcional)</label>
        <input
          id="celular2"
          type="tel"
          inputMode="tel"
          value={secondMsisdn}
          placeholder="Papá, abuela, quien acompañe"
          onChange={(event) => setSecondMsisdn(event.target.value)}
        />

        <div className="card card--muted">
          <p className="placeholder-note">
            Texto de consentimiento pendiente de revisión legal. Borrador {CONSENT_VERSION}.
          </p>
          <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={accepted}
              required
              onChange={(event) => setAccepted(event.target.checked)}
              style={{ width: 'auto', minHeight: 'auto', marginTop: '0.35rem' }}
            />
            <span className="small">
              Acepto participar y que Leer en Familia guarde el nombre de mi bebé, su fecha de
              nacimiento y mi número de celular para acompañarnos durante el programa. Puedo darme
              de baja cuando quiera escribiendo BAJA por WhatsApp.
            </span>
          </label>
          <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={notesAuthorized}
              onChange={(event) => setNotesAuthorized(event.target.checked)}
              style={{ width: 'auto', minHeight: 'auto', marginTop: '0.35rem' }}
            />
            <span className="small">
              Autorizo además que el equipo lea las notas que yo escriba en la bitácora. Si no
              marcas esto, el equipo solo ve cuántas veces y cuánto tiempo, nunca lo que escribiste.
            </span>
          </label>
        </div>

        {error !== null && <p className="banner banner--error">{error}</p>}

        <button type="submit" className="btn" disabled={busy || !accepted}>
          Registrarme
        </button>
      </form>
    </section>
  );
}
