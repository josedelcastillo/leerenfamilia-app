import { useState } from 'react';
import { completeNewPassword, signIn, submitMfaCode } from './auth.ts';

type Step = 'credenciales' | 'mfa' | 'nueva_clave';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<Step>('credenciales');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app login">
      <h1>Nacidos para Leer Perú</h1>
      <p className="muted small">Acceso del equipo de Leer en Familia.</p>

      {step === 'credenciales' && (
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await signIn(email, password);
              if (result.status === 'ok') onSignedIn();
              else if (result.status === 'mfa_requerido') setStep('mfa');
              else setStep('nueva_clave');
            });
          }}
        >
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="username" required value={email}
                 onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="clave">Contraseña</label>
          <input id="clave" type="password" autoComplete="current-password" required value={password}
                 onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn" disabled={busy}>Entrar</button>
        </form>
      )}

      {step === 'mfa' && (
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await submitMfaCode(code);
              onSignedIn();
            });
          }}
        >
          <p className="small muted">
            Ingresa el código de seis dígitos de tu app de autenticación.
          </p>
          <label htmlFor="codigo">Código</label>
          <input id="codigo" inputMode="numeric" autoComplete="one-time-code" required
                 pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="submit" className="btn" disabled={busy}>Verificar</button>
        </form>
      )}

      {step === 'nueva_clave' && (
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await completeNewPassword(newPassword);
              onSignedIn();
            });
          }}
        >
          <p className="small muted">
            Es tu primer ingreso. Define una contraseña de al menos 12 caracteres, con mayúsculas,
            minúsculas, números y símbolos.
          </p>
          <label htmlFor="nueva">Nueva contraseña</label>
          <input id="nueva" type="password" autoComplete="new-password" required minLength={12}
                 value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="submit" className="btn" disabled={busy}>Guardar</button>
        </form>
      )}

      {error !== null && <p className="banner banner--error">{error}</p>}
    </main>
  );
}
