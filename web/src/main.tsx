import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * The two surfaces are split at the entry point so a family's device never downloads the manager
 * bundle. Each is a separate chunk, loaded only for its own path prefix.
 *
 * A router is deliberately absent until phase 5, when the family surface gains real routes.
 */
const FamilySurface = lazy(() => import('./app/FamilyApp'));
const ManagerSurface = lazy(() => import('./gestor/ManagerApp'));

const isManagerSurface = window.location.pathname.startsWith('/gestor');
const Surface = isManagerSurface ? ManagerSurface : FamilySurface;

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root container');
}

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={<p lang="es-PE">Cargando…</p>}>
      <Surface />
    </Suspense>
  </StrictMode>,
);
