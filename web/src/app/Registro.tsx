import { useState } from 'react';
import { ApiError, api, type DeclaredBy } from '../shared/api.ts';
import { setToken } from '../shared/token.ts';
import { RELATION_OPTIONS } from './registro-rapido.ts';

/** The consent text is a placeholder pending legal review; see docs/tratamiento-datos.md. */
const CONSENT_VERSION = 'borrador-0';

/**
 * Enrolment from the clinic QR (screen 1). Shown only when the device has no token — normally the
 * family arrives from the WhatsApp link and never sees this screen.
 *
 * The design shows only the role and the consent; the enrolment fields stay because the programme
 * needs them (baby's name, birth date, a phone number) — D-023.
 */
export function Registro({ onRegistered }: { onRegistered: () => void }) {
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [secondMsisdn, setSecondMsisdn] = useState('');
  const [relation, setRelation] = useState<DeclaredBy | null>(null);
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
          { msisdn, role: 'principal', relation },
          ...(secondMsisdn.trim() !== '' ? [{ msisdn: secondMsisdn, role: 'secundario' }] : []),
        ],
        consent: { accepted, version: CONSENT_VERSION, freeTextNotesAuthorized: notesAuthorized },
      });
      setToken(response.token);
      onRegistered();
    } catch (cause) {
      // A 4xx carries a sentence written for the family ("ese número ya está registrado").
      // Anything else is a network problem, and the family gets no raw error for it.
      setError(
        cause instanceof ApiError && cause.status < 500
          ? cause.message
          : 'No pudimos registrarte sin señal. Intenta otra vez cuando tengas datos.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pantalla" onSubmit={submit}>
      <div className="pantalla__cuerpo">
        <img className="lockup" src="/marca/lockup-horizontal.png" alt="Nacidos para Leer" width={168} />
        <h1 className="titular titular--activacion">Ocho semanas leyendo con tu bebé, desde hoy.</h1>
        <p className="lectura">
          Cada semana recibes una actividad corta por WhatsApp. Aquí registras cuándo leyeron. Nada más.
        </p>

        <fieldset className="opciones">
          <legend className="etiqueta">¿Quién eres en casa?</legend>
          {RELATION_OPTIONS.map((option) => (
            <label key={option.value} className="opcion">
              <input
                type="radio"
                name="relacion"
                value={option.value}
                checked={relation === option.value}
                onChange={() => setRelation(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <div className="campo">
          <label htmlFor="bebe">¿Cómo se llama tu bebé?</label>
          <input id="bebe" value={babyName} required autoComplete="off"
                 placeholder="Nombre o como le dicen en casa" onChange={(e) => setBabyName(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="nacimiento">¿Cuándo nació?</label>
          <input id="nacimiento" type="date" value={birthDate} required onChange={(e) => setBirthDate(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="celular">Tu celular</label>
          <input id="celular" type="tel" inputMode="tel" value={msisdn} required placeholder="987 654 321"
                 onChange={(e) => setMsisdn(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="celular2">Celular de otra persona que cuida (opcional)</label>
          <input id="celular2" type="tel" inputMode="tel" value={secondMsisdn} placeholder="Papá, abuela, quien acompañe"
                 onChange={(e) => setSecondMsisdn(e.target.value)} />
        </div>
      </div>

      <div className="pantalla__accion">
        <p className="placeholder-note">Texto de consentimiento pendiente de revisión legal. Borrador {CONSENT_VERSION}.</p>
        <label className="consentimiento">
          <input type="checkbox" checked={accepted} required onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            Acepto participar y que Leer en Familia guarde el nombre de mi bebé, su fecha de nacimiento y mi
            número de celular para acompañarnos durante el programa. Puedo darme de baja cuando quiera
            escribiendo BAJA por WhatsApp.
          </span>
        </label>
        <label className="consentimiento">
          <input type="checkbox" checked={notesAuthorized} onChange={(e) => setNotesAuthorized(e.target.checked)} />
          <span>
            Autorizo además que el equipo lea las notas que escriba. Si no lo marco, el equipo solo ve cuántas
            veces y cuánto tiempo, nunca lo que escribí. Puedo cambiarlo cuando quiera.
          </span>
        </label>
        {error !== null && <p className="error-amable" role="alert">{error}</p>}
        <button type="submit" className="btn" disabled={busy || !accepted}>Empezar</button>
      </div>
    </form>
  );
}
