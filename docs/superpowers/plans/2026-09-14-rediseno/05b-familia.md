# Fase 4 (cont.) — Familia: pantallas 4, 7, 8 y 6, y el cableado

Ver [`05-familia.md`](05-familia.md) para las tareas 4.1 a 4.5 y la explicación de por qué las vistas van
en archivos nuevos hasta la tarea 4.10.

---

### Tarea 4.6: Pantalla 4: progreso acumulado

**Files:**
- Create: `web/src/app/Progreso.tsx`
- Modify: `web/src/app/components/Cerebro.tsx` (solo la clase del texto vacío)

Sin barra de progreso, sin meta, sin porcentaje, sin racha. El cerebro se queda (D-021); el recoloreo ya
está en el CSS de la tarea 0.5.

- [ ] **Step 1: `Progreso.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api, type LogEntry } from '../shared/api.ts';
import type { QueuedItem } from '../shared/sync-queue.ts';
import { Cerebro } from './components/Cerebro.tsx';
import { brainState } from './components/cerebro.ts';
import { mergeHistorial } from './components/historial.ts';
import { entryDetail, progressHeadline, relativeDay, todayLocal } from './formato.ts';

/**
 * Screen 4: what the family has built. The history is the server's plus what is still queued
 * (D-015), so an entry logged with no signal counts the instant it is written.
 */
export function Progreso({
  pendingItems,
  syncedAt,
  currentWeek,
  onRegister,
  onOpenPrivacidad,
}: {
  pendingItems: readonly QueuedItem[];
  syncedAt: number;
  currentWeek: number;
  onRegister: () => void;
  onOpenPrivacidad: () => void;
}) {
  const [stored, setStored] = useState<readonly LogEntry[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    api
      .listLog()
      .then((response) => {
        setStored(response.entries);
        setLoadFailed(false);
      })
      // Offline this fails and the queued entries carry the view on their own.
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    if (syncedAt > 0) load();
  }, [syncedAt, load]);

  const entries = mergeHistorial(stored, pendingItems);
  const today = todayLocal();

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <div className="progreso-cabecera">
          <p className="meta">Lo que han construido</p>
          <img className="mishashos" src="/marca/mishashos.png" alt="" width={132} />
        </div>

        {entries.length === 0 ? (
          <p className="lectura">Aún no registras lecturas. La primera puede ser hoy, aunque dure dos minutos.</p>
        ) : (
          <>
            <div>
              <p className="cifra">{entries.length}</p>
              <p className="cifra-leyenda">{progressHeadline(entries.length, Math.max(1, currentWeek))}</p>
            </div>
            <p className="lectura lectura--suave">Cada línea es una vez que tu bebé escuchó tu voz. Ninguna se borra.</p>
            <Cerebro state={brainState(entries)} />
            <hr className="filete" />
            {loadFailed && <p className="meta meta--chica">Ves lo que está guardado en este teléfono.</p>}
            <ol className="lista-puntos lista-puntos--desvanece">
              {entries.map((entry) => (
                <li key={entry.clientId}>
                  <span className="punto punto--coral" aria-hidden="true" />
                  <div className="lista-puntos__cuerpo">
                    <span className="lista-puntos__titulo">{relativeDay(entry.date, today)}</span>
                    <span className="meta meta--chica">
                      {entryDetail(entry)}
                      {entry.pending && ' · por enviar'}
                    </span>
                    {entry.note !== null && entry.note !== '' && <p className="nota-propia">{entry.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="nota-caja">Todo lo que registras se queda aquí. Nada se borra ni retrocede.</p>
          </>
        )}

        <button type="button" className="enlace" onClick={onOpenPrivacidad}>Tus datos y privacidad</button>
      </div>

      <div className="pantalla__accion">
        <button type="button" className="btn" onClick={onRegister}>
          {entries.length === 0 ? 'Registrar la primera' : 'Registrar lectura'}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: En `Cerebro.tsx`, cambie las clases heredadas del texto vacío**

Reemplace `<p className="small muted">` por `<p className="meta">`. No toque la geometría, la animación ni
`cerebro.ts`: el diseño solo cambia los colores, que ya están en el CSS.

- [ ] **Step 3: Tests y commit**

```bash
cd web && npm run typecheck && npm test
git add web/src/app/Progreso.tsx web/src/app/components/Cerebro.tsx
git commit -m "feat(web): progress screen — a count, the growing brain, and a log that never shrinks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
(`cerebro.test.ts` sigue pasando: no se tocó la lógica.)

---

### Tarea 4.7: Pantalla 7: estado de conexión y cola pendiente

**Files:**
- Create: `web/src/app/components/Conexion.tsx`, `web/src/app/Cola.tsx`

Los banners de hoy (`Estado.tsx`, con 📵 y ⏳) pasan a una fila con punto y palabra. Al tocarla se abre
la pantalla 7. `Estado.tsx` se borra en la 4.10.

- [ ] **Step 1: `components/Conexion.tsx`**

```tsx
import { pendingLabel } from '../formato.ts';

/**
 * Connection state, shown only when there is something to say. Colour, word and position carry it;
 * no emoji. A rejected entry gets a plain sentence, never the raw error (handoff: "errores sin
 * disculpa").
 */
export function Conexion({
  online,
  pending,
  rejected,
  onDismiss,
  onOpenCola,
}: {
  online: boolean;
  pending: number;
  rejected: number;
  onDismiss: () => void;
  onOpenCola: () => void;
}) {
  if (online && pending === 0 && rejected === 0) return null;

  return (
    <div className="estado" aria-live="polite">
      {(!online || pending > 0) && (
        <button type="button" className="estado__fila" onClick={onOpenCola}>
          <span className={`punto ${online ? 'punto--morado' : 'punto--alerta'}`} aria-hidden="true" />
          {online ? 'Enviando' : 'Sin conexión'}
          {pending > 0 && ` · ${pendingLabel(pending)}`}
        </button>
      )}
      {rejected > 0 && (
        <div className="aviso-error" role="alert">
          <p>
            {rejected === 1 ? 'Un registro no se pudo guardar.' : `${rejected} registros no se pudieron guardar.`}{' '}
            Si vuelve a pasar, escríbenos en Mensajes.
          </p>
          <button type="button" className="enlace" onClick={onDismiss}>Entendido</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `Cola.tsx`**

```tsx
import type { QueuedItem } from '../shared/sync-queue.ts';
import { describeQueued, visibleQueue } from './cola.ts';
import { colaHeadline, todayLocal } from './formato.ts';

/** Screen 7. The real number of pending items, and the reassurance that they are not lost. */
export function Cola({ online, items, onBack }: { online: boolean; items: readonly QueuedItem[]; onBack: () => void }) {
  const visible = visibleQueue(items);
  const today = todayLocal();

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <p className="estado-linea">
          <span className={`punto ${online ? 'punto--ok' : 'punto--alerta'}`} aria-hidden="true" />
          {online ? 'Con conexión' : 'Sin conexión'}
        </p>
        <h1 className="titular">{colaHeadline(visible.length)}</h1>
        {visible.length > 0 && (
          <p className="lectura lectura--suave">
            Están guardados en tu teléfono. Se envían solos en cuanto vuelvas a tener datos; no tienes que hacer nada.
          </p>
        )}
        <hr className="filete" />
        <ul className="lista-puntos">
          {visible.map((item) => {
            const view = describeQueued(item, today);
            return (
              <li key={item.clientId}>
                <span className="punto punto--morado" aria-hidden="true" />
                <div className="lista-puntos__cuerpo">
                  <span className="lista-puntos__titulo">{view.titulo}</span>
                  <span className="meta meta--chica">{view.cuando}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="nota-caja">Puedes seguir registrando sin señal. La cola no se pierde si cierras la app.</p>
      </div>
      <div className="pantalla__accion">
        <button type="button" className="btn" onClick={onBack}>Seguir registrando</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck y commit**

```bash
cd web && npm run typecheck
git add web/src/app/components/Conexion.tsx web/src/app/Cola.tsx
git commit -m "feat(web): connection row and pending queue screen, without emoji banners

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4.8: Pantalla 8: mensajes a la ONG

**Files:**
- Modify (reescribir): `web/src/app/Mensajes.tsx` (mismas props; no rompe `FamilyApp`)

- [ ] **Step 1: Reemplazar `Mensajes.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api, type Feedback } from '../shared/api.ts';
import type { QueuedItem, QueuedKind } from '../shared/sync-queue.ts';
import { mergeThread } from './mensajes-thread.ts';

const TYPES = [
  { value: 'consulta', label: 'Tengo una duda' },
  { value: 'comentario', label: 'Quiero comentar' },
  { value: 'pedido', label: 'Quiero pedir algo' },
  { value: 'problema', label: 'Algo no funciona' },
] as const;

const TYPE_LABEL: Record<string, string> = {
  consulta: 'Duda', comentario: 'Comentario', pedido: 'Pedido', problema: 'Problema',
};

/** Status in the family's words. "Waiting" is not an alarm here: nothing on these screens reads as a deficit. */
function statusLabel(item: { pending: boolean; status: string }): { text: string; ok: boolean } {
  if (item.pending) return { text: 'Por enviar', ok: false };
  if (item.status === 'respondido') return { text: 'Respondido', ok: true };
  if (item.status === 'cerrado') return { text: 'Cerrado', ok: false };
  return { text: 'Esperando respuesta', ok: false };
}

export function Mensajes({
  enqueue,
  pendingItems,
  syncedAt,
}: {
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  pendingItems: readonly QueuedItem[];
  syncedAt: number;
}) {
  const [stored, setStored] = useState<readonly Feedback[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [type, setType] = useState<string>('consulta');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .listFeedback()
      .then((response) => {
        setStored(response.feedback);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    if (syncedAt > 0) load();
  }, [syncedAt, load]);

  const thread = mergeThread(stored, pendingItems);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim() === '') return;
    setBusy(true);
    try {
      await enqueue('feedback', {
        clientId: crypto.randomUUID(),
        type,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      });
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pantalla" onSubmit={submit}>
      <div className="pantalla__cuerpo">
        <h1 className="titular titular--actividad">Escríbenos</h1>
        <p className="lectura lectura--suave">Te respondemos por aquí y por WhatsApp.</p>

        <div className="chips" role="group" aria-label="¿De qué se trata?">
          {TYPES.map((option) => (
            <button key={option.value} type="button" className="chip" aria-pressed={type === option.value}
                    onClick={() => setType(option.value)}>
              {option.label}
            </button>
          ))}
        </div>

        <label className="visually-hidden" htmlFor="texto">Tu mensaje</label>
        <textarea id="texto" className="campo-mensaje" value={text} maxLength={2000} required
                  placeholder="Cuéntanos con tus palabras" onChange={(event) => setText(event.target.value)} />

        <hr className="filete" />

        {loadFailed && <p className="meta meta--chica">Ves los mensajes guardados en este teléfono.</p>}
        {thread.length === 0 ? (
          <p className="meta">Todavía no nos escribiste. Lo que mandes aparece aquí con su respuesta.</p>
        ) : (
          <ul className="hilo">
            {thread.map((item) => {
              const status = statusLabel(item);
              return (
                <li key={item.id} className="mensaje">
                  <div className="mensaje__cabecera">
                    <span className="tipo">{TYPE_LABEL[item.type] ?? item.type}</span>
                    <span className={status.ok ? 'mensaje__estado mensaje__estado--ok' : 'mensaje__estado'}>{status.text}</span>
                  </div>
                  <p className="mensaje__texto">“{item.text}”</p>
                  {item.replies.map((reply, index) => (
                    <div key={`${item.id}-${index}`} className="respuesta">
                      <span className="respuesta__autor">Leer en Familia</span>
                      <span className="respuesta__texto">{reply.text}</span>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="pantalla__accion">
        <button type="submit" className="btn" disabled={busy || text.trim() === ''}>Enviar</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck, prueba en el navegador y commit**

```bash
cd web && npm run typecheck && npm test && npm run build && npx vite preview --port 4173
```
Con un token de demo, abra la pestaña Mensajes. Chequee tres cosas:
- el chip activo va relleno de tinta con texto blanco
- el hilo muestra la píldora de tipo y la respuesta con el filete morado
- sin red, el mensaje aparece como "Por enviar"

```bash
git add web/src/app/Mensajes.tsx
git commit -m "feat(web): messages screen in the new identity

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4.9: Pantalla 6: privacidad y datos

**Files:**
- Create: `web/src/app/Privacidad.tsx`

El copy del prototipo se corrige en dos lugares (hallazgo 5 del índice), porque tal como está le diría
algo falso a la familia.

- [ ] **Step 1: Escribir el componente**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../shared/api.ts';
import type { QueuedItem, QueuedKind } from '../shared/sync-queue.ts';
import { consentPayload, displayedNotesConsent, effectiveNotesConsent, suppressionPayload } from './privacidad.ts';

/**
 * Screen 6. The switch changes the notes consent through the offline queue (D-025); revoking hides
 * every note already sent, because the manager-side filter is on read (rule 8). The erasure button
 * sends a fixed request to the inbox until the endpoint exists (D-027).
 *
 * The server value is read again whenever a change leaves the queue, so after a sync the screen shows
 * what the server kept — not what it said when the screen opened.
 */
export function Privacidad({
  pendingItems,
  syncedAt,
  enqueue,
  onBack,
}: {
  pendingItems: readonly QueuedItem[];
  syncedAt: number;
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  onBack: () => void;
}) {
  const [server, setServer] = useState<boolean | null>(null);
  // The last value the family chose, and whether the server has been read since that change synced.
  const [lastChoice, setLastChoice] = useState<boolean | null>(null);
  const [serverFresh, setServerFresh] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  // `busy` drives the disabled state but only takes effect on the next render; a very fast double
  // tap can land both calls before that happens. This ref blocks the second one immediately.
  const running = useRef(false);

  const queuedChoice = effectiveNotesConsent(null, pendingItems);
  const hasQueued = queuedChoice !== null;
  // Read by `load` when a request starts: a read begun while a change is still queued predates it.
  const queuedNow = useRef(hasQueued);
  queuedNow.current = hasQueued;
  // Bumped on every new choice, so a read that started before it never counts as fresh.
  const choiceSeq = useRef(0);
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);

  const load = useCallback(() => {
    const id = ++requestSeq.current;
    const choice = choiceSeq.current;
    const startedClean = !queuedNow.current;
    api
      .listLog()
      .then((response) => {
        // An older read that answers late must not overwrite a newer one.
        if (id < appliedSeq.current) return;
        appliedSeq.current = id;
        setServer(response.notesAuthorized);
        if (startedClean && choice === choiceSeq.current) setServerFresh(true);
      })
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  // Every change the family makes passes through the queue, including one left from an earlier visit.
  useEffect(() => {
    if (queuedChoice === null) return;
    choiceSeq.current += 1;
    setLastChoice(queuedChoice);
    setServerFresh(false);
  }, [queuedChoice]);

  // Read the server again after a sync, and whenever the change leaves the queue for any reason — a
  // rejected change leaves too, and then the server never took it.
  const seen = useRef({ syncedAt, hasQueued });
  useEffect(() => {
    const before = seen.current;
    seen.current = { syncedAt, hasQueued };
    if (syncedAt !== before.syncedAt || (before.hasQueued && !hasQueued)) load();
  }, [syncedAt, hasQueued, load]);

  const authorized = displayedNotesConsent(server, pendingItems, lastChoice, serverFresh);

  async function toggle() {
    if (authorized === null || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await enqueue('consentimiento', consentPayload(crypto.randomUUID(), !authorized, new Date()));
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  async function requestErasure() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await enqueue('feedback', suppressionPayload(crypto.randomUUID(), new Date()));
      setConfirming(false);
      setRequested(true);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  const explanation =
    authorized === null
      ? 'Lo verás cuando haya señal.'
      : authorized
        ? 'Activado. Si lo desactivas, el equipo deja de ver tus notas, también las que ya enviaste. Siguen guardadas para ti.'
        : 'Desactivado. El equipo ve cuántas veces y cuánto tiempo registras, nunca lo que escribes.';

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <h1 className="titular titular--actividad">Tus datos</h1>
        <p className="lectura lectura--suave">
          Guardamos lo mínimo para acompañarte durante las ocho semanas. Nada se comparte con nadie más.
        </p>
        <p className="placeholder-note">Texto pendiente de revisión legal.</p>
        <dl className="filas-datos">
          <div>
            <dt>Qué guardamos</dt>
            <dd>Tu número, el nombre y la fecha de nacimiento de tu bebé, la semana en que entraste y cada actividad que registras.</dd>
          </div>
          <div>
            <dt>Quién lo ve</dt>
            <dd>El equipo de Leer en Familia. Cada vez que alguien abre tu ficha queda registrado.</dd>
          </div>
          <div>
            <dt>Hasta cuándo</dt>
            <dd>Hasta que termine el piloto. Puedes pedir que borremos todo cuando quieras.</dd>
          </div>
        </dl>
        <div className="interruptor-caja">
          <button type="button" role="switch" className="interruptor" aria-checked={authorized === true}
                  disabled={authorized === null || busy} onClick={toggle}
                  aria-labelledby="notas-titulo" aria-describedby="notas-explica">
            <span className="interruptor__perilla" />
          </button>
          <div>
            <p id="notas-titulo" className="interruptor__titulo">El equipo puede leer mis notas</p>
            <p id="notas-explica" className="meta">{explanation}</p>
          </div>
        </div>
      </div>

      <div className="pantalla__accion">
        {requested ? (
          <p className="nota-caja" role="status">Recibimos tu pedido. El equipo te escribirá para confirmarlo.</p>
        ) : confirming ? (
          <>
            <p className="meta">Esto pide al equipo que borre lo que registraste y tus datos de contacto.</p>
            <button type="button" className="btn btn--secundario" disabled={busy} onClick={requestErasure}>Sí, pedir que borren mis datos</button>
            <button type="button" className="btn-texto" onClick={() => setConfirming(false)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn btn--secundario" onClick={() => setConfirming(true)}>
            Pedir que borren mis datos
          </button>
        )}
      </div>
    </section>
  );
}
```

La confirmación en dos pasos no está en el prototipo. Es un pedido que no se puede deshacer desde la app,
y un toque accidental con el bebé en brazos es el caso normal. Anótelo en D-027.

- [ ] **Step 2: Typecheck y commit**

```bash
cd web && npm run typecheck && node scripts/check-contrast.mjs
git add web/src/app/Privacidad.tsx
git commit -m "feat(web): privacy screen with a revocable notes consent and an erasure request

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4.10: Cablear `FamilyApp` y borrar las vistas viejas

**Files:**
- Modify (reescribir): `web/src/app/FamilyApp.tsx`
- Delete: `web/src/app/Contenido.tsx`, `web/src/app/Bitacora.tsx`,
  `web/src/app/components/RegistroForm.tsx`, `web/src/app/components/HistorialBitacora.tsx`,
  `web/src/app/components/Estado.tsx`

- [ ] **Step 1: Ver cómo limpia la URL `captureTokenFromUrl`**

Run: `sed -n 1,60p web/src/shared/token.ts`

La vista inicial lee `?v=registrar` **antes** de que se capture el token. Por eso ese `useState` va
primero en el componente. Si `captureTokenFromUrl` borra toda la query string, el orden de abajo alcanza.
Si solo borra `t`, también funciona.

- [ ] **Step 2: Reemplazar `FamilyApp.tsx`**

```tsx
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
```

Los casos `actividad` y `anteriores` no llaman `back()` durante el render (eso sería un setState ahí
mismo). En vez de eso, `unresolvable` se calcula durante el render y un `useEffect` separado vuelve a
`tabs` cuando la vista apunta a contenido que ya no está. Solo pasa si el contenido cambió debajo de
una vista abierta, que es un caso raro.

El efecto que limpia `?v=` corre una sola vez, en el mount, y no en el inicializador de `useState`: en
`StrictMode` React llama los inicializadores dos veces, y la segunda llamada ya no vería el parámetro
en la URL si la primera lo hubiera borrado ahí.

- [ ] **Step 3: Borrar lo que quedó sin uso**

```bash
cd web
grep -rn "Contenido\b\|from './Bitacora\|RegistroForm\|HistorialBitacora\|components/Estado" src || true
git rm src/app/Contenido.tsx src/app/Bitacora.tsx src/app/components/RegistroForm.tsx src/app/components/HistorialBitacora.tsx src/app/components/Estado.tsx
npm run typecheck && npm test && npm run build
```
Expected: el `grep` no encuentra imports vivos (solo, tal vez, comentarios). Typecheck, tests y build
pasan.

- [ ] **Step 4: Verificación visual de las ocho pantallas contra el prototipo**

```bash
npx vite preview --port 4173
```
Con un token de demo (ver `docs/runbook.md` o `backend/scripts/seed-demo.ts`) y el viewport a 390×844,
abra el prototipo al lado y recorra:

| Pantalla | Qué mirar |
|---|---|
| 1 | Sin token: lockup, titular, filas de 56px, casillas coral, halo |
| 2 | `Semana N de 8` y las 8 marcas; titular del API; bloque del kit; filas de actividades; botón de 64px |
| 5 | Tocar una actividad: píldora de tipo, aviso placeholder, "También esta semana", botón "Ya la …" |
| 3 | "Registrar lectura" → botón de 96px con sombra → confirmado; chips en fila; textarea; los dos cierres |
| 3 sin red | DevTools → Offline: la banda "Guardado en tu teléfono…" y "Deshacer este registro" |
| 7 | Offline: fila "Sin conexión · N registros por enviar" → pantalla de la cola |
| 4 | Pestaña Bitácora: cifra 52px en `--brand-alt`, mishashos a 132px, cerebro, puntos que se desvanecen |
| 6 | "Tus datos y privacidad": filas, interruptor morado, confirmación en dos pasos |
| 8 | Pestaña Mensajes: ver la tarea 4.8 |

Y además:
- con `prefers-reduced-motion`, el cerebro aparece completo y sin animación
- no hay scroll horizontal a 360px

- [ ] **Step 5: Instalabilidad y offline**

```bash
CHROMIUM_PATH=/ruta/a/chromium node web/scripts/check-installable.mjs http://localhost:4173/app
```
Expected: todo en verde. Las fuentes y los PNG de marca entran en el precache (`globPatterns` ya incluye
`woff2` y `png`).

- [ ] **Step 6: Commit**

```bash
git add web/src/app
git commit -m "feat(web): wire the redesigned family screens; drop the accordion, form and banners they replace

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
