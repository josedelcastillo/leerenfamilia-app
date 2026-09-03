import { useState } from 'react';
import '../shared/styles.css';
import { captureTokenFromUrl } from '../shared/token.ts';
import { useSync } from '../shared/useSync.ts';
import { Estado } from './components/Estado.tsx';
import { Bitacora } from './Bitacora.tsx';
import { Contenido } from './Contenido.tsx';
import { Mensajes } from './Mensajes.tsx';
import { Registro } from './Registro.tsx';

type Tab = 'semana' | 'bitacora' | 'mensajes';

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: string }> = [
  { id: 'semana', label: 'Esta semana', icon: '📖' },
  { id: 'bitacora', label: 'Bitácora', icon: '✏️' },
  { id: 'mensajes', label: 'Mensajes', icon: '💬' },
];

export default function FamilyApp() {
  // Runs once on load: pulls the token out of the WhatsApp deep link and clears it from the URL.
  const [token, setTokenState] = useState<string | null>(() => captureTokenFromUrl());
  const [tab, setTab] = useState<Tab>('semana');
  const sync = useSync();

  if (token === null) {
    return (
      <main className="app">
        <Registro onRegistered={() => setTokenState(captureTokenFromUrl())} />
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        {/* The wordmark's own arrangement: the two big words, "para" small between them. */}
        <h1 className="marca">
          Nacidos <span className="marca__menor">para</span> Leer{' '}
          <span className="marca__pais">PERÚ</span>
        </h1>
        <p className="muted small" style={{ margin: 0 }}>
          Leer en Familia
        </p>
      </header>

      <main className="app">
        <Estado
          online={sync.online}
          pending={sync.pending}
          rejected={sync.rejected}
          onDismiss={sync.dismissRejected}
        />

        {tab === 'semana' && <Contenido enqueue={sync.enqueue} />}
        {tab === 'bitacora' && (
          <Bitacora
            enqueue={sync.enqueue}
            pendingItems={sync.pendingItems}
            syncedAt={sync.syncedAt}
          />
        )}
        {tab === 'mensajes' && (
          <Mensajes
            enqueue={sync.enqueue}
            pendingItems={sync.pendingItems}
            syncedAt={sync.syncedAt}
          />
        )}
      </main>

      <nav className="tabs" aria-label="Secciones">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true" style={{ display: 'block', fontSize: '1.3rem' }}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
