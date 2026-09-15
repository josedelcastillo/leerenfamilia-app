import { useEffect, useState } from 'react';
import '../shared/styles.css';
import './gestor.css';
import { currentIdToken, loadConfig, signOut } from './auth.ts';
import { Auditoria } from './Auditoria.tsx';
import { Bandeja } from './Bandeja.tsx';
import { Exportar } from './Exportar.tsx';
import { Familias } from './Familias.tsx';
import { Login } from './Login.tsx';
import { Reporte } from './Reporte.tsx';
import { Tablero } from './Tablero.tsx';

export type View = 'tablero' | 'familias' | 'reporte' | 'bandeja' | 'auditoria' | 'exportar';

// The design's five, plus the data exports it left out: bitacora.csv is the evaluator's file and
// cannot lose its UI (D-026).
const NAV: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'tablero', label: 'Tablero' },
  { id: 'familias', label: 'Familias' },
  { id: 'reporte', label: 'Reporte semanal' },
  { id: 'bandeja', label: 'Bandeja' },
  { id: 'auditoria', label: 'Auditoría' },
  { id: 'exportar', label: 'Exportar datos' },
];

export default function ManagerApp() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [view, setView] = useState<View>('tablero');

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

  if (!ready) return <p className="g-login">Cargando…</p>;
  if (configError !== null) return <div className="g-login"><p className="g-error">{configError}</p></div>;
  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />;

  return (
    <div className="g-shell">
      <nav className="g-lateral" aria-label="Secciones">
        <div className="g-lateral__marca">
          <p className="g-org">Leer en Familia</p>
          <img className="g-lockup" src="/marca/lockup-horizontal.png" alt="Nacidos para Leer" width={156} />
          <p className="g-faint">Hospital piloto</p>
        </div>
        <ul className="g-nav-lista">
          {NAV.map((item) => (
            <li key={item.id}>
              <button type="button" className="g-nav" aria-current={view === item.id ? 'page' : undefined}
                      onClick={() => setView(item.id)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="g-nav g-nav--salir" onClick={() => { signOut(); setSignedIn(false); }}>
          Salir
        </button>
      </nav>

      <main className="g-principal">
        {view === 'tablero' && <Tablero onGoTo={setView} />}
        {view === 'familias' && <Familias />}
        {view === 'reporte' && <Reporte />}
        {view === 'bandeja' && <Bandeja />}
        {view === 'auditoria' && <Auditoria />}
        {view === 'exportar' && <Exportar />}
        <p className="g-pie">
          Cada vez que abres el detalle de una familia, respondes un mensaje o exportas datos, queda registrado
          con tu usuario, por tratarse de datos de menores de edad.
        </p>
      </main>
    </div>
  );
}
