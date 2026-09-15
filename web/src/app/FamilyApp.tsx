import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import '../shared/styles.css';
import type { Activity, ActivityKind } from '../shared/api.ts';
import { captureTokenFromUrl } from '../shared/token.ts';
import { useSync } from '../shared/useSync.ts';
import { Actividad } from './Actividad.tsx';
import { Anteriores } from './Anteriores.tsx';
import { Cola } from './Cola.tsx';
import { Conexion } from './components/Conexion.tsx';
import { visibleQueue } from './cola.ts';
import { todayLocal } from './formato.ts';
import { Inicio } from './Inicio.tsx';
import { Mensajes } from './Mensajes.tsx';
import { Privacidad } from './Privacidad.tsx';
import { Progreso } from './Progreso.tsx';
import { Registro } from './Registro.tsx';
import { RegistroRapido } from './RegistroRapido.tsx';
import { firstTapPayload } from './registro-rapido.ts';
import { useContenido } from './useContenido.ts';

type Tab = 'semana' | 'bitacora' | 'mensajes';

// One level of tabs, in the lower third, no emoji (D-023: the only place the design revises itself).
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'semana', label: 'Esta semana' },
  { id: 'bitacora', label: 'Bitácora' },
  { id: 'mensajes', label: 'Mensajes' },
];

type Vista =
  | { readonly tipo: 'tabs' }
  | { readonly tipo: 'actividad'; readonly week: number; readonly activityId: string }
  | {
      readonly tipo: 'registro';
      readonly kind: ActivityKind;
      readonly resourceId: string | null;
      readonly week: number | null;
      readonly initial: Record<string, unknown> | null;
    }
  | { readonly tipo: 'anteriores' }
  | { readonly tipo: 'cola' }
  | { readonly tipo: 'privacidad' };

/** `?v=registrar` opens the logging screen directly, for when the WhatsApp template links to it. */
function initialVista(): Vista {
  return new URLSearchParams(window.location.search).get('v') === 'registrar'
    ? { tipo: 'registro', kind: 'lectura', resourceId: null, week: null, initial: null }
    : { tipo: 'tabs' };
}

export default function FamilyApp() {
  // Read before the token capture below rewrites the URL.
  const [vista, setVista] = useState<Vista>(initialVista);
  // Runs once on load: pulls the token out of the WhatsApp deep link and clears it from the URL.
  const [token, setTokenState] = useState<string | null>(() => captureTokenFromUrl());
  const [tab, setTab] = useState<Tab>('semana');
  const [doneBusy, setDoneBusy] = useState(false);
  // `doneBusy` drives the disabled state but only takes effect on the next render; a very fast
  // double tap on "Ya la ..." can land both calls before that happens. This ref blocks the second
  // one immediately, so a fast double tap never enqueues two bitacora entries for one activity.
  const doneRunning = useRef(false);
  const sync = useSync();
  const contenido = useContenido();

  // The deep link's `v` is a one-shot instruction; left in the URL, every reload would reopen it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('v')) return;
    url.searchParams.delete('v');
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  const pendingIds = useMemo(() => new Set(sync.pendingItems.map((item) => item.clientId)), [sync.pendingItems]);

  // `sync.enqueue` is a stable useCallback, so this is too — Inicio's access effect depends on it.
  const enqueue = sync.enqueue;
  /**
   * Showing a week records that the family looked at it (D-016). The client id is fixed per week
   * and day, so re-opening the same week ten times in an afternoon is one record, not ten.
   */
  const recordAccess = useCallback(
    (week: number) => {
      const day = todayLocal();
      void enqueue('acceso', {
        clientId: `acceso-${week}-${day}`,
        resourceId: `semana-${String(week).padStart(2, '0')}`,
        week,
        at: `${day}T00:00:00.000Z`,
      });
    },
    [enqueue],
  );

  const content = contenido.status === 'listo' ? contenido.content : null;
  const actividadWeek = vista.tipo === 'actividad' ? content?.weeks.find((w) => w.week === vista.week) : undefined;
  const actividad =
    vista.tipo === 'actividad' ? actividadWeek?.activities.find((a) => a.id === vista.activityId) : undefined;
  // A view that points at content that is not there (it changed underneath an open screen) goes
  // back to the tabs. Done in an effect, not during render.
  const unresolvable =
    (vista.tipo === 'actividad' && actividad === undefined) || (vista.tipo === 'anteriores' && content === null);

  useEffect(() => {
    if (unresolvable) setVista({ tipo: 'tabs' });
  }, [unresolvable]);

  if (token === null) {
    return (
      <div className="familia">
        <div className="halo" aria-hidden="true" />
        <main className="app app--sin-tabs">
          <Registro onRegistered={() => setTokenState(captureTokenFromUrl())} />
        </main>
      </div>
    );
  }

  const back = () => setVista({ tipo: 'tabs' });
  const openActivity = (week: number, activity: Activity) =>
    setVista({ tipo: 'actividad', week, activityId: activity.id });
  const register = (week: number | null) =>
    setVista({ tipo: 'registro', kind: 'lectura', resourceId: null, week, initial: null });

  async function doneActivity(week: number, activity: Activity) {
    if (doneRunning.current) return;
    doneRunning.current = true;
    setDoneBusy(true);
    try {
      const payload = firstTapPayload({
        clientId: crypto.randomUUID(),
        date: todayLocal(),
        kind: activity.kind,
        resourceId: activity.id,
      });
      await sync.enqueue('bitacora', payload);
      setVista({ tipo: 'registro', kind: activity.kind, resourceId: activity.id, week, initial: payload });
    } finally {
      doneRunning.current = false;
      setDoneBusy(false);
    }
  }

  let screen: ReactNode = null;
  switch (vista.tipo) {
    case 'actividad':
      if (actividadWeek !== undefined && actividad !== undefined) {
        const week = actividadWeek;
        const activity = actividad;
        screen = (
          <Actividad
            week={week}
            activity={activity}
            onBack={back}
            onOpen={(next) => openActivity(week.week, next)}
            onDone={() => void doneActivity(week.week, activity)}
            busy={doneBusy}
          />
        );
      }
      break;
    case 'registro':
      screen = (
        // A new key per navigation: a one-tap entry and a fresh "Registrar" never share state.
        <RegistroRapido
          key={vista.initial === null ? 'nuevo' : String(vista.initial['clientId'])}
          kind={vista.kind}
          resourceId={vista.resourceId}
          week={vista.week}
          initial={vista.initial}
          pendingIds={pendingIds}
          enqueue={sync.enqueue}
          discard={sync.discard}
          onDone={back}
        />
      );
      break;
    case 'anteriores':
      if (content !== null) {
        screen = (
          <Anteriores content={content} onBack={back} onOpenActivity={openActivity} recordAccess={recordAccess} />
        );
      }
      break;
    case 'cola':
      screen = <Cola online={sync.online} items={sync.pendingItems} onBack={back} />;
      break;
    case 'privacidad':
      screen = (
        <Privacidad pendingItems={sync.pendingItems} syncedAt={sync.syncedAt} enqueue={sync.enqueue} onBack={back} />
      );
      break;
    case 'tabs':
      screen =
        tab === 'semana' ? (
          <Inicio
            state={contenido}
            onOpenActivity={openActivity}
            onRegister={register}
            onOpenAnteriores={() => setVista({ tipo: 'anteriores' })}
            recordAccess={recordAccess}
          />
        ) : tab === 'bitacora' ? (
          <Progreso
            pendingItems={sync.pendingItems}
            syncedAt={sync.syncedAt}
            currentWeek={content === null ? 1 : Math.min(content.currentWeek, content.programWeeks)}
            onRegister={() => register(null)}
            onOpenPrivacidad={() => setVista({ tipo: 'privacidad' })}
          />
        ) : (
          <Mensajes enqueue={sync.enqueue} pendingItems={sync.pendingItems} syncedAt={sync.syncedAt} />
        );
      break;
  }

  const withTabs = vista.tipo === 'tabs';
  // Screens 6, 7 and 8 have no wash in the design.
  const withHalo = !(vista.tipo === 'cola' || vista.tipo === 'privacidad' || (withTabs && tab === 'mensajes'));

  return (
    <div className="familia">
      {withHalo && <div className="halo" aria-hidden="true" />}
      <main className={withTabs ? 'app' : 'app app--sin-tabs'}>
        <Conexion
          online={sync.online}
          pending={visibleQueue(sync.pendingItems).length}
          rejected={sync.rejected.length}
          onDismiss={sync.dismissRejected}
          onOpenCola={() => setVista({ tipo: 'cola' })}
        />
        {screen}
      </main>
      {withTabs && (
        <nav className="tabs" aria-label="Secciones">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
