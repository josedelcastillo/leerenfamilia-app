# Fase 4 — Familia: pantallas 1, 2, 5 y 3

Ver [`00-indice.md`](00-indice.md). Continúa en [`05b-familia.md`](05b-familia.md).

**Cómo está armada esta fase para que el build nunca se rompa:** las vistas con props nuevas van en
archivos nuevos (`Inicio.tsx`, `Actividad.tsx`, `RegistroRapido.tsx`, …). `tsc` las revisa aunque
todavía no se usen. `FamilyApp.tsx` se cablea al final, en la tarea 4.10, y ahí se borran
`Contenido.tsx`, `Bitacora.tsx`, `RegistroForm.tsx` y `HistorialBitacora.tsx`. La única excepción es la
activación (4.2), que conserva sus props y se ve de inmediato.

Referencia visual de cada pantalla: `docs/diseno/handoff-2026-09/Nacidos para Leer claro.dc.html`,
abierto en un navegador. Todas las clases ya existen desde la tarea 0.5.

---

### Tarea 4.1: Hook de contenido y tres componentes chicos

**Files:**
- Create: `web/src/app/useContenido.ts`, `web/src/app/components/Marcas.tsx`,
  `web/src/app/components/ActividadesLista.tsx`, `web/src/app/components/Reproductor.tsx`

- [ ] **Step 1: `useContenido.ts`**

Hoy el contenido lo pide `Contenido.tsx`. Pasa a `FamilyApp` para que Inicio, Detalle, Anteriores y
Progreso (que necesita la semana actual) lean la misma respuesta. El service worker ya la cachea
(`NetworkFirst` sobre `/api/contenido`).

```ts
import { useEffect, useState } from 'react';
import { api, type ContentResponse } from '../shared/api.ts';

export type ContenidoState =
  | { readonly status: 'cargando' }
  | { readonly status: 'listo'; readonly content: ContentResponse }
  /** Offline with nothing cached yet. The screens still let the family log. */
  | { readonly status: 'sin_datos' };

export function useContenido(): ContenidoState {
  const [state, setState] = useState<ContenidoState>({ status: 'cargando' });

  useEffect(() => {
    let alive = true;
    api
      .getContent()
      .then((content) => alive && setState({ status: 'listo', content }))
      .catch(() => alive && setState({ status: 'sin_datos' }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
```

- [ ] **Step 2: `components/Marcas.tsx`**

```tsx
/** Eight 22×3 marks, coral up to the current week. Decorative: the text beside it says the same. */
export function Marcas({ actual, total }: { actual: number; total: number }) {
  return (
    <div className="marcas" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < actual ? 'is-hecha' : undefined} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `components/ActividadesLista.tsx`**

```tsx
import type { Activity } from '../../shared/api.ts';
import { KIND_LABEL } from '../formato.ts';

/** The week's activities as 56px rows, each with its type on the right (screens 2 and 5). */
export function ActividadesLista({
  activities,
  onOpen,
}: {
  activities: readonly Activity[];
  onOpen: (activity: Activity) => void;
}) {
  return (
    <ul className="actividades">
      {activities.map((activity) => (
        <li key={activity.id}>
          <button type="button" onClick={() => onOpen(activity)}>
            <span>{activity.title}</span>
            <span className="actividades__tipo">{KIND_LABEL[activity.kind]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: `components/Reproductor.tsx`**

```tsx
import { useRef, useState, type CSSProperties } from 'react';
import { formatClock } from '../formato.ts';

/**
 * A plain <audio> with the design's controls: a 56px coral button, a 6px bar and the two times.
 * No library. The service worker caches /assets/ audio (CacheFirst), so a song heard once plays
 * again with no signal.
 */
export function Reproductor({ src, titulo }: { src: string; titulo: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  function toggle() {
    const element = audio.current;
    if (element === null) return;
    if (element.paused) {
      // Autoplay policy can reject this, and so can the audio not being cached for offline use;
      // either way the caregiver needs a reason, not silence.
      element
        .play()
        .then(() => setFailed(false))
        .catch(() => setFailed(true));
    } else {
      element.pause();
    }
  }

  return (
    <>
      <div className="reproductor">
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        />
        <button
          type="button"
          className="reproductor__boton"
          onClick={toggle}
          aria-label={playing ? `Pausar ${titulo}` : `Escuchar ${titulo}`}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </button>
        <div className="reproductor__pista">
          <div
            className="reproductor__barra"
            role="progressbar"
            aria-label="Avance"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            style={{ '--avance': `${progress}%` } as CSSProperties}
          >
            <span />
          </div>
          <div className="reproductor__tiempos">
            <span>{formatClock(time)}</span>
            <span>{formatClock(duration)}</span>
          </div>
        </div>
      </div>
      {failed && (
        <p className="meta meta--chica" role="status">No se pudo reproducir. Intenta de nuevo cuando tengas señal.</p>
      )}
    </>
  );
}
```

La única regla de estilo inline que se admite es una custom property con un **dato** (aquí `--avance`),
como hace ya `Cerebro.tsx` con `--orden`. Nada de colores ni medidas del diseño inline.

- [ ] **Step 5: Typecheck y commit**

```bash
cd web && npm run typecheck && npm test
git add web/src/app/useContenido.ts web/src/app/components/Marcas.tsx web/src/app/components/ActividadesLista.tsx web/src/app/components/Reproductor.tsx
git commit -m "feat(web): content hook, week marks, activity rows and audio player

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4.2: Pantalla 1: activación

**Files:**
- Modify (reescribir): `web/src/app/Registro.tsx`

Se conservan los campos de inscripción, porque el backend los necesita (ver el hallazgo 6 del índice),
y el texto de consentimiento actual con su marca de borrador. Lo nuevo:

- la piel del diseño: lockup, titular, halo desde `FamilyApp`, botón "Empezar"
- el selector "¿Quién eres en casa?", que se envía como `relation` del cuidador principal
- los errores sin disculpas y sin textos crudos de red

- [ ] **Step 1: Reemplazar `Registro.tsx`**

```tsx
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
```

Si `api.register` está tipado con `payload: unknown`, `relation` pasa sin cambios de tipo. Verifíquelo en
`shared/api.ts`.

- [ ] **Step 2: Verificar a 390px**

```bash
cd web && npm run typecheck && npm run build && npx vite preview --port 4173
```
Abra `http://localhost:4173/app?c=DEMO` en una ventana privada (sin token) con el viewport a 390×844.
Compare contra la pantalla 1 del prototipo:
- lockup a 168px arriba a la izquierda
- titular en Literata
- filas de 56px, con la elegida en borde coral
- casillas coral de 26px
- botón coral con tinta oscura

El halo todavía no aparece: lo pone `FamilyApp` en la 4.10.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/Registro.tsx
git commit -m "feat(web): activation screen in the new identity, asking who the caregiver is at home

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4.3: Pantalla 2 (inicio semanal) y semanas anteriores

**Files:**
- Create: `web/src/app/Inicio.tsx`, `web/src/app/Anteriores.tsx`
- Modify: `web/src/shared/styles.css` (una regla)

**Cambio estructural del diseño:** la semana actual es la pantalla, y las anteriores viven detrás de un
enlace. El titular, el cuerpo y los nombres del kit **salen del API** (regla 11), no del prototipo.

- [ ] **Step 1: `Inicio.tsx`**

```tsx
import { useEffect } from 'react';
import type { Activity } from '../shared/api.ts';
import { ActividadesLista } from './components/ActividadesLista.tsx';
import { Marcas } from './components/Marcas.tsx';
import type { ContenidoState } from './useContenido.ts';

const PLACEHOLDER = 'Contenido de ejemplo. El material real lo está preparando Leer en Familia.';

/** Screen 2. The current week is the screen; earlier weeks are one link away. */
export function Inicio({
  state,
  onOpenActivity,
  onRegister,
  onOpenAnteriores,
  recordAccess,
}: {
  state: ContenidoState;
  onOpenActivity: (week: number, activity: Activity) => void;
  onRegister: (week: number | null) => void;
  onOpenAnteriores: () => void;
  recordAccess: (week: number) => void;
}) {
  const content = state.status === 'listo' ? state.content : null;
  const current = content === null ? 0 : Math.min(content.currentWeek, content.programWeeks);
  const week = content?.weeks.find((w) => w.week === current) ?? null;

  // Showing a week's content is what counts as opening it (D-016). One record per week and day.
  useEffect(() => {
    if (week !== null) recordAccess(week.week);
  }, [week, recordAccess]);

  if (state.status === 'cargando') {
    return <section className="pantalla"><p className="meta">Cargando…</p></section>;
  }

  if (content === null || week === null) {
    return (
      <section className="pantalla">
        <div className="pantalla__cuerpo">
          <h1 className="titular">
            {content === null
              ? 'La actividad de esta semana aparece sola cuando haya señal.'
              : 'Tu programa todavía no comienza.'}
          </h1>
          <p className="lectura">Mientras tanto, puedes registrar cuando lean. Se guarda en tu teléfono.</p>
        </div>
        <div className="pantalla__accion">
          <button type="button" className="btn btn--grande" onClick={() => onRegister(null)}>Registrar lectura</button>
        </div>
      </section>
    );
  }

  const lectura = week.activities.find((a) => a.kind === 'lectura') ?? null;
  const cancion = week.activities.find((a) => a.kind === 'cancion') ?? null;

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <div className="semana-cabecera">
          <p className="meta">
            {content.finished
              ? `Completaste las ${content.programWeeks} semanas`
              : `Semana ${current} de ${content.programWeeks}`}
          </p>
          <Marcas actual={current} total={content.programWeeks} />
        </div>

        <h1 className="titular">{week.title}</h1>
        {week.summary !== '' && <p className="lectura">{week.summary}</p>}
        {week.isPlaceholder === true && <p className="aviso-placeholder">{PLACEHOLDER}</p>}

        <hr className="filete" />

        {(lectura !== null || cancion !== null) && (
          <div className="kit">
            <p className="kit__titulo">Esta semana, en el kit</p>
            <p className="kit__items">
              {lectura !== null && <>Cuento: <span>{lectura.title}</span></>}
              {lectura !== null && cancion !== null && <br />}
              {cancion !== null && <>Canción: <span>{cancion.title}</span></>}
            </p>
            {lectura !== null && (
              <button type="button" className="enlace" onClick={() => onOpenActivity(week.week, lectura)}>
                Ver la actividad completa
              </button>
            )}
          </div>
        )}

        <ActividadesLista activities={week.activities} onOpen={(activity) => onOpenActivity(week.week, activity)} />

        {current > 1 && (
          <button type="button" className="enlace" onClick={onOpenAnteriores}>Semanas anteriores</button>
        )}
      </div>

      <div className="pantalla__accion">
        <button type="button" className="btn btn--grande" onClick={() => onRegister(week.week)}>
          Registrar lectura
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `Anteriores.tsx`**

```tsx
import { useState } from 'react';
import type { Activity, ContentResponse } from '../shared/api.ts';
import { ActividadesLista } from './components/ActividadesLista.tsx';

/** Earlier weeks stay open, so a family that fell behind can catch up (content handler). */
export function Anteriores({
  content,
  onOpenActivity,
  onBack,
  recordAccess,
}: {
  content: ContentResponse;
  onOpenActivity: (week: number, activity: Activity) => void;
  onBack: () => void;
  recordAccess: (week: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const current = Math.min(content.currentWeek, content.programWeeks);
  const previous = content.weeks.filter((week) => week.week < current).reverse();

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <h1 className="titular titular--actividad">Semanas anteriores</h1>
        <p className="lectura lectura--suave">Siguen aquí. Puedes volver a cualquiera cuando quieras.</p>
        <ul className="actividades">
          {previous.map((week) => (
            <li key={week.week}>
              <button
                type="button"
                aria-expanded={open === week.week}
                onClick={() => {
                  const next = open === week.week ? null : week.week;
                  setOpen(next);
                  if (next !== null) recordAccess(next);
                }}
              >
                <span>Semana {week.week}</span>
                <span className="actividades__tipo">{open === week.week ? 'Cerrar' : 'Abrir'}</span>
              </button>
              {open === week.week && (
                <div className="semana-abierta">
                  <ActividadesLista activities={week.activities} onOpen={(a) => onOpenActivity(week.week, a)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Agregar la regla que falta en `styles.css`**, justo antes del comentario
  `/* --- heredado`:

```css
.semana-abierta { padding: 10px 0 4px 12px; }
```

- [ ] **Step 4: Typecheck y commit**

```bash
cd web && npm run typecheck && node scripts/check-contrast.mjs
git add web/src/app/Inicio.tsx web/src/app/Anteriores.tsx web/src/shared/styles.css
git commit -m "feat(web): weekly home screen, with earlier weeks behind a link

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4.4: Pantalla 5: detalle de actividad

**Files:**
- Create: `web/src/app/Actividad.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
import type { Activity, WeekContent } from '../shared/api.ts';
import { ActividadesLista } from './components/ActividadesLista.tsx';
import { Reproductor } from './components/Reproductor.tsx';
import { KIND_LABEL } from './formato.ts';
import { KIND_COPY } from './registro-rapido.ts';

/**
 * Screen 5. The instructions come from the content API and are placeholder today (rule 11), so the
 * placeholder notice stays on screen. The player shows only when the activity has audio.
 */
export function Actividad({
  week,
  activity,
  onOpen,
  onDone,
  onBack,
  busy = false,
}: {
  week: WeekContent;
  activity: Activity;
  onOpen: (activity: Activity) => void;
  /** "Ya la cantamos": logs it in one tap and moves to the confirmed logging screen. */
  onDone: () => void;
  onBack: () => void;
  /** Disables the button while the one-tap log is in flight, so a fast double tap logs once. */
  busy?: boolean;
}) {
  const others = week.activities.filter((a) => a.id !== activity.id);

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <button type="button" className="volver" onClick={onBack}>Volver</button>
        <div className="fila-meta">
          <span className="tipo">{KIND_LABEL[activity.kind]}</span>
          <span className="meta meta--chica">Semana {week.week}</span>
        </div>
        <h1 className="titular titular--actividad">{activity.title}</h1>
        <p className="lectura">{activity.instructions}</p>
        {activity.mediaUrl !== null && <Reproductor src={activity.mediaUrl} titulo={activity.title} />}
        {week.isPlaceholder === true && (
          <p className="aviso-placeholder">
            Contenido de ejemplo. El material real lo está preparando Leer en Familia.
          </p>
        )}
        {others.length > 0 && (
          <>
            <hr className="filete" />
            <p className="subtitulo">También esta semana</p>
            <ActividadesLista activities={others} onOpen={onOpen} />
          </>
        )}
      </div>
      <div className="pantalla__accion">
        <button type="button" className="btn" disabled={busy} onClick={onDone}>{KIND_COPY[activity.kind].hecho}</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
cd web && npm run typecheck
git add web/src/app/Actividad.tsx
git commit -m "feat(web): activity detail screen with audio player and one-tap done

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4.5: Pantalla 3: registro en un toque

**Files:**
- Create: `web/src/app/RegistroRapido.tsx`

Dos estados. **Nada opcional se pide antes de confirmar.** Si la vista llega con `initial` (desde "Ya la
cantamos"), arranca ya registrada.

- [ ] **Step 1: Escribir el componente**

```tsx
import { useRef, useState } from 'react';
import type { ActivityKind, DeclaredBy } from '../shared/api.ts';
import type { QueuedKind } from '../shared/sync-queue.ts';
import { todayLocal } from './formato.ts';
import { KIND_COPY, MINUTE_OPTIONS, WHO_OPTIONS, detailsPayload, firstTapPayload } from './registro-rapido.ts';

export function RegistroRapido({
  kind,
  resourceId,
  week,
  relation,
  initial,
  pendingIds,
  enqueue,
  discard,
  onDone,
}: {
  kind: ActivityKind;
  resourceId: string | null;
  week: number | null;
  /** What this caregiver declared at activation. Preselects "who", but is only saved if they save. */
  relation: DeclaredBy | null;
  /** The entry already logged by a one-tap button elsewhere, or null to ask first. */
  initial: Record<string, unknown> | null;
  pendingIds: ReadonlySet<string>;
  enqueue: (kind: QueuedKind, payload: Record<string, unknown>) => Promise<string>;
  discard: (clientId: string) => Promise<boolean>;
  onDone: () => void;
}) {
  const [entry, setEntry] = useState<Record<string, unknown> | null>(initial);
  const [who, setWho] = useState<DeclaredBy | null>(relation);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const copy = KIND_COPY[kind];
  // `busy` drives the disabled state but only takes effect on the next render; a very fast double
  // tap can land both calls before that happens. This ref blocks the second one immediately.
  const running = useRef(false);

  async function register() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const payload = firstTapPayload({ clientId: crypto.randomUUID(), date: todayLocal(), kind, resourceId });
      await enqueue('bitacora', payload);
      setEntry(payload);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  async function saveDetails() {
    if (entry === null || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await enqueue('bitacora', detailsPayload(entry, { minutes, declaredBy: who, note }));
      onDone();
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  async function undo() {
    if (entry === null) return;
    if (await discard(String(entry['clientId']))) {
      setEntry(null);
      setNotice(null);
    } else {
      setNotice('Este registro ya se envió y queda en tu bitácora.');
    }
  }

  if (entry === null) {
    return (
      <section className="pantalla">
        <div className="pantalla__cuerpo">
          <button type="button" className="volver" onClick={onDone}>Volver</button>
          {week !== null && <p className="meta">Semana {week}</p>}
          <h1 className="titular titular--registro">{copy.pregunta}</h1>
          <p className="lectura">Un toque y listo. Lo demás es opcional y lo puedes dejar después.</p>
        </div>
        <div className="pantalla__accion">
          <button type="button" className="btn btn--registrar" disabled={busy} onClick={register}>
            {copy.boton}
          </button>
        </div>
      </section>
    );
  }

  const pending = pendingIds.has(String(entry['clientId']));

  return (
    <section className="pantalla">
      <div className="pantalla__cuerpo">
        <p className="confirmado" role="status">
          <span className="confirmado__check" aria-hidden="true">✓</span>
          {copy.confirmado}
        </p>
        {pending ? (
          <p className="banda-estado">
            <span className="punto" aria-hidden="true" />
            Guardado en tu teléfono. Se envía solo cuando haya señal.
          </p>
        ) : (
          <p className="sincronizado">Sincronizado</p>
        )}

        <hr className="filete" />

        <div className="opcionales">
          <p className="subtitulo">Si quieres, cuéntanos más</p>
          <div className="chips chips--fila" role="group" aria-label="Quién lo hizo">
            {WHO_OPTIONS.map((option) => (
              <button key={option.value} type="button" className="chip" aria-pressed={who === option.value}
                      onClick={() => setWho(who === option.value ? null : option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="chips chips--fila" role="group" aria-label="Cuánto rato">
            {MINUTE_OPTIONS.map((option) => (
              <button key={option.value} type="button" className="chip" aria-pressed={minutes === option.value}
                      onClick={() => setMinutes(minutes === option.value ? null : option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <label className="visually-hidden" htmlFor="nota">Nota</label>
          <textarea id="nota" value={note} maxLength={1000} placeholder="Una nota para ti, si te nace"
                    onChange={(event) => setNote(event.target.value)} />
          <p className="meta meta--chica">El equipo solo lee tus notas si lo autorizaste.</p>
          {pending && <button type="button" className="enlace" onClick={undo}>Deshacer este registro</button>}
          {notice !== null && <p className="meta" role="status">{notice}</p>}
        </div>
      </div>

      <div className="pantalla__accion">
        <button type="button" className="btn" disabled={busy} onClick={saveDetails}>Guardar y volver</button>
        <button type="button" className="btn-texto" onClick={onDone}>Listo, nada más</button>
      </div>
    </section>
  );
}
```

"Guardar y volver" guarda también cuando no se tocó nada. Con el chip preseleccionado, eso sí guarda la
relación declarada, y es a propósito: "Listo, nada más" es la salida sin atribuir a nadie.

- [ ] **Step 2: Typecheck y commit**

```bash
cd web && npm run typecheck && node scripts/check-contrast.mjs
git add web/src/app/RegistroRapido.tsx
git commit -m "feat(web): one-tap logging screen, with optional details only after confirming

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
