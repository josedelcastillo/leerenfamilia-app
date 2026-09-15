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
    <main className="g-login">
      <div className="g-login__caja">
        <p className="g-org">Leer en Familia</p>
        <img className="g-lockup" src="/marca/lockup-horizontal.png" alt="Nacidos para Leer" width={156} />
        <p className="g-faint">Acceso del equipo.</p>

        {step === 'credenciales' && (
          <form onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await signIn(email, password);
              if (result.status === 'ok') onSignedIn();
              else if (result.status === 'mfa_requerido') setStep('mfa');
              else setStep('nueva_clave');
            });
          }}>
            <label className="g-campo">Correo
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="g-campo">Contraseña
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" className="g-btn g-btn--primario" disabled={busy}>Entrar</button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await submitMfaCode(code);
              onSignedIn();
            });
          }}>
            <p className="g-faint">Ingresa el código de seis dígitos de tu app de autenticación.</p>
            <label className="g-campo">Código
              <input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button type="submit" className="g-btn g-btn--primario" disabled={busy}>Verificar</button>
          </form>
        )}

        {step === 'nueva_clave' && (
          <form onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await completeNewPassword(newPassword);
              onSignedIn();
            });
          }}>
            <p className="g-faint">
              Es tu primer ingreso. Define una contraseña de al menos 12 caracteres, con mayúsculas, minúsculas,
              números y símbolos.
            </p>
            <label className="g-campo">Nueva contraseña
              <input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <button type="submit" className="g-btn g-btn--primario" disabled={busy}>Guardar</button>
          </form>
        )}

        {error !== null && <p className="g-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
