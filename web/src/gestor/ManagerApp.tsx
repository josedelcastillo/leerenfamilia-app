import { useEffect, useState } from 'react';
import '../shared/styles.css';
import './gestor.css';
import { currentIdToken, loadConfig, signOut } from './auth.ts';
import { Bandeja } from './Bandeja.tsx';
import { Familias } from './Familias.tsx';
import { Login } from './Login.tsx';

type View = 'bandeja' | 'familias';

export default function ManagerApp() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [view, setView] = useState<View>('bandeja');

  useEffect(() => {
    loadConfig()
      .then(() => currentIdToken())
      .then((token) => {
        setSignedIn(token !== null);
        setReady(true);
      })
      .catch((cause: unknown) => {
        setConfigError(cause instanceof Error ? cause.message : 'Error de configuración');
        setReady(true);
      });
  }, []);

  if (!ready) return <p className="app muted">Cargando…</p>;
  if (configError !== null) return <p className="app banner banner--error">{configError}</p>;
  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />;

  return (
    <>
      <header className="topbar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <h1>Nacidos para Leer Perú — Gestión</h1>
          <button
            type="button"
            className="chip"
            onClick={() => {
              signOut();
              setSignedIn(false);
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <main className="gestor">
        <div className="toolbar" role="group" aria-label="Secciones">
          <button type="button" className="chip" aria-pressed={view === 'bandeja'} onClick={() => setView('bandeja')}>
            Bandeja
          </button>
          <button type="button" className="chip" aria-pressed={view === 'familias'} onClick={() => setView('familias')}>
            Familias
          </button>
        </div>

        {view === 'bandeja' ? <Bandeja /> : <Familias />}

        <p className="small muted" style={{ marginTop: '2rem' }}>
          Cada vez que abres el detalle de una familia o respondes un mensaje queda registrado con tu
          usuario, por tratarse de datos de menores de edad.
        </p>
      </main>
    </>
  );
}
