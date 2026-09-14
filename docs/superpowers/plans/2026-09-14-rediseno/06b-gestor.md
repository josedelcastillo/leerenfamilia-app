# Fase 5 (cont.) — Gestor: familias, ficha, reporte, bandeja y auditoría

Ver [`06-gestor.md`](06-gestor.md) para el CSS (5.1), el shell (5.2) y el tablero (5.3).

---

### Tarea 5.4: Pantallas 10 y 11: listado de familias y ficha

**Files:**
- Create: `web/src/gestor/Ficha.tsx`
- Modify (reescribir): `web/src/gestor/Familias.tsx`
- Modify: `web/src/gestor/gestor.css` (anchos de columna y selector de fila)

Encabezados de tabla **sin mayúsculas forzadas**. La columna "Kit" del diseño pasa a "Semana" (D-026).
Los nombres de cuidadores del prototipo no existen en el modelo: se muestran el rol y la relación
declarada.

- [ ] **Step 1: Ajustes de CSS**

En `gestor.css`, reemplace la regla `.g-tabla tr[aria-selected='true'] td { … }` por la de abajo, y
agregue los anchos de columna a continuación:

```css
/* aria-current, not aria-selected: this is a plain table, not a grid widget. */
.g-tabla tr[aria-current='true'] td { background: var(--g-select); }
.g-tabla--familias th:nth-child(1) { width: 30%; }
.g-tabla--familias th:nth-child(2) { width: 18%; }
.g-tabla--familias th:nth-child(3) { width: 14%; }
.g-tabla--familias th:nth-child(4) { width: 20%; }
.g-tabla--familias th:nth-child(5) { width: 18%; }
```

- [ ] **Step 2: `Ficha.tsx`**

```tsx
import type { FamilyDetail } from './api.ts';
import { fechaLarga, shortId } from './tiempo.ts';

const KIND: Record<string, string> = { lectura: 'Lectura', cancion: 'Canción', juego: 'Juego', conversacion: 'Conversación' };
const ROLE: Record<string, string> = { principal: 'Principal', secundario: 'Secundario' };
const RELATION: Record<string, string> = { mama: 'mamá', papa: 'papá', otra: 'otra persona' };

type Entry = FamilyDetail['entries'][number];

/** Who did it, as the family said; failing that, whose phone logged it. */
function who(entry: Entry): string {
  if (entry.declaredBy !== null) {
    const relation = RELATION[entry.declaredBy] ?? entry.declaredBy;
    return relation.charAt(0).toUpperCase() + relation.slice(1);
  }
  return ROLE[entry.loggedBy] ?? entry.loggedBy;
}

/**
 * Screen 11. Opening it is audited on the server. Notes are filtered on read (rule 8): without consent
 * the manager sees only how many exist, never what they say.
 */
export function Ficha({ detail }: { detail: FamilyDetail }) {
  const newestFirst = [...detail.entries].sort((a, b) => b.date.localeCompare(a.date));
  const recent = newestFirst.slice(0, 8);
  const withNotes = newestFirst.filter((entry) => entry.note !== null && entry.note !== '').slice(0, 5);

  return (
    <article className="g-ficha">
      <header className="g-ficha__cabecera">
        <div>
          <h2>{detail.babyName || 'Sin nombre registrado'}</h2>
          <p className="g-faint">Semana {detail.programWeek} del programa · ingresó el {fechaLarga(detail.anchorDate)}</p>
        </div>
        <span className="g-faint">{shortId(detail.familyId)}</span>
      </header>

      <div className="g-ficha__cuerpo">
        <dl className="g-tarjeta g-datos">
          <div><dt>Bebé</dt><dd>{detail.babyName || '—'}</dd></div>
          <div><dt>Estado</dt><dd>{detail.status}</dd></div>
          <div>
            <dt>Cuidadores</dt>
            <dd>
              {detail.caregivers
                .map((c) => `${ROLE[c.role] ?? c.role}${c.relation !== null ? ` (${RELATION[c.relation]})` : ''}${c.optIn ? '' : ', dado de baja'}`)
                .join(' · ')}
            </dd>
          </div>
          <div>
            <dt>Registros</dt>
            <dd>
              {detail.summary.entries} en {detail.summary.distinctDays} {detail.summary.distinctDays === 1 ? 'día' : 'días'}
              {detail.summary.entriesWithMinutes > 0 && ` · ${detail.summary.totalMinutes} min reportados`}
            </dd>
          </div>
        </dl>

        <section className="g-tarjeta">
          <h3 className="g-tarjeta__titulo">Registros recientes</h3>
          {recent.length === 0 ? (
            <p className="g-faint">Sin registros todavía.</p>
          ) : (
            <ul className="g-lista-simple">
              {recent.map((entry, index) => (
                <li key={`${entry.date}-${index}`}>
                  <span>{fechaLarga(entry.date)} · {KIND[entry.kind] ?? entry.kind}</span>
                  <span className="g-faint">{who(entry)}{entry.minutes !== null && `, ${entry.minutes} min`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="g-tarjeta">
          <div className="g-tarjeta__cabecera">
            <h3 className="g-tarjeta__titulo">Notas de la familia</h3>
            <span className={detail.notesVisible ? 'g-pill g-pill--ok' : 'g-pill g-pill--alerta'}>
              {detail.notesVisible ? 'Consentimiento activo' : 'Sin consentimiento'}
            </span>
          </div>
          {detail.notesVisible ? (
            <>
              {withNotes.length === 0 ? (
                <p className="g-faint">Todavía no escribió notas.</p>
              ) : (
                <div className="g-notas">
                  {withNotes.map((entry, index) => (
                    <p key={index}>“{entry.note}” — {who(entry)}, {fechaLarga(entry.date)}</p>
                  ))}
                </div>
              )}
              <p className="g-faint">La familia puede revocar este permiso en cualquier momento; las notas dejarían de mostrarse aquí.</p>
            </>
          ) : (
            <>
              <div className="g-sin-consentimiento">
                <span className="g-guion" aria-hidden="true">—</span>
                <p>
                  {detail.notesCount === 0
                    ? 'Esta familia no autorizó que el equipo lea sus notas. Si escribe alguna, no se mostrará ni se exportará.'
                    : `Esta familia escribió ${detail.notesCount} ${detail.notesCount === 1 ? 'nota' : 'notas'} y no autorizó que el equipo las lea. No se muestran ni se exportan.`}
                </p>
              </div>
              <p className="g-faint">Solo la familia puede cambiarlo, desde su pantalla de privacidad.</p>
            </>
          )}
        </section>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: `Familias.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { gestorApi, type FamilyDetail, type FamilyRow } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { descargarCsv } from './descargar.ts';
import {
  ESTADO_LABEL,
  caregiversLabel,
  estadoFamilia,
  filterRows,
  lastEntryLabel,
  type EstadoFamilia,
} from './familias-estado.ts';
import { Ficha } from './Ficha.tsx';
import { limaToday, shortId } from './tiempo.ts';

/**
 * Screens 10 and 11. The list carries aggregates only and is not audited; opening a family is the
 * audited act, which is why the detail loads on click instead of alongside the list.
 */
export function Familias() {
  const [rows, setRows] = useState<FamilyRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [semana, setSemana] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoFamilia | null>(null);
  const [exporting, setExporting] = useState(false);
  const today = limaToday(new Date());

  useEffect(() => {
    gestorApi.familias()
      .then((response) => setRows(response.familias))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  async function open(row: FamilyRow) {
    setSelected(row.familyId);
    setDetail(null);
    try {
      setDetail(await gestorApi.familia(row.familyId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir la ficha');
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await descargarCsv('familias');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  const visible = rows === null ? [] : filterRows(rows, { query, semana, estado });

  return (
    <>
      <Cabecera titulo="Familias" {...(rows !== null ? { subtitulo: `${rows.length} familias; primero las que necesitan atención` } : {})}>
        <input type="search" aria-label="Buscar familia" placeholder="Buscar por nombre" value={query}
               onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Semana" value={semana ?? ''}
                onChange={(event) => setSemana(event.target.value === '' ? null : Number(event.target.value))}>
          <option value="">Todas las semanas</option>
          {Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>Semana {index + 1}</option>)}
        </select>
        <select aria-label="Estado" value={estado ?? ''}
                onChange={(event) => setEstado(event.target.value === '' ? null : (event.target.value as EstadoFamilia))}>
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_LABEL) as EstadoFamilia[]).map((key) => <option key={key} value={key}>{ESTADO_LABEL[key]}</option>)}
        </select>
        <button type="button" className="g-btn g-btn--oscuro" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? 'Generando…' : 'Exportar CSV'}
        </button>
      </Cabecera>

      <div className="g-cuerpo">
        {error !== null && <p className="g-error" role="alert">{error}</p>}
        {rows === null && error === null && <p className="g-faint">Cargando…</p>}
        {rows !== null && (
          <div className="g-split">
            <div className="g-tabla-caja">
              <table className="g-tabla g-tabla--familias">
                <thead>
                  <tr>
                    <th scope="col">Familia</th>
                    <th scope="col">Cuidadores</th>
                    <th scope="col">Semana</th>
                    <th scope="col">Último registro</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={5}>Ninguna familia coincide con el filtro.</td></tr>
                  )}
                  {visible.map((row) => {
                    const status = estadoFamilia(row);
                    return (
                      <tr key={row.familyId} aria-current={selected === row.familyId ? 'true' : undefined}>
                        <td className="g-celda-principal">
                          <button type="button" className="g-fila-boton" onClick={() => void open(row)}>
                            {row.babyName || shortId(row.familyId)}
                          </button>
                        </td>
                        <td>{caregiversLabel(row.caregivers)}</td>
                        <td>{row.finished ? 'Terminó' : row.programWeek}</td>
                        <td>{lastEntryLabel(row.lastEntryDate, today)}</td>
                        <td><span className={`g-estado g-estado--${status}`}>{ESTADO_LABEL[status]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div aria-live="polite">
              {selected === null
                ? <p className="g-faint">Elige una familia para ver su ficha. Abrirla queda registrado.</p>
                : detail === null
                  ? <p className="g-faint">Cargando…</p>
                  : <Ficha detail={detail} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

El spread condicional de `subtitulo` es por `exactOptionalPropertyTypes`: no se puede pasar
`subtitulo={undefined}` a una prop opcional.

- [ ] **Step 4: Verificar y commit**

```bash
cd web && npm run typecheck && npm test && node scripts/check-contrast.mjs && npm run build
git add web/src/gestor/Familias.tsx web/src/gestor/Ficha.tsx web/src/gestor/gestor.css
git commit -m "feat(web): family list with derived status, and a detail that shows how many notes exist, never their text without consent

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 5.5: Pantalla 12: reporte semanal

**Files:**
- Modify (reemplaza el stub): `web/src/gestor/Reporte.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
import { useEffect, useState } from 'react';
import { gestorApi, type Dashboard } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { Participacion } from './Participacion.tsx';
import {
  PRIVACY_FOOTER,
  mailtoHref,
  observationLines,
  reportPlainText,
  reportSummary,
} from './reporte.ts';
import { fechaLarga, limaToday, rangoSemana } from './tiempo.ts';

/**
 * Screen 12. Built in the browser from the dashboard aggregates (D-026): PDF through the print
 * stylesheet, e-mail through mailto:, text through the clipboard. No new AWS resource. The field
 * observations live only in this page until it is printed or copied.
 */
export function Reporte() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [copied, setCopied] = useState(false);
  const generated = new Date();

  useEffect(() => {
    gestorApi.tablero().then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  async function copy() {
    if (data === null) return;
    await navigator.clipboard.writeText(reportPlainText(data, observaciones, generated));
    setCopied(true);
  }

  return (
    <>
      <Cabecera titulo="Reporte semanal" />
      {error !== null && <div className="g-cuerpo"><p className="g-error">{error}</p></div>}
      {data === null && error === null && <div className="g-cuerpo"><p className="g-faint">Cargando…</p></div>}
      {data !== null && (
        <div className="g-reporte">
          <article className="g-hoja">
            <header className="g-hoja__cabecera">
              <div>
                <h1>Reporte semanal de implementación</h1>
                <p className="g-hoja__sub">
                  Nacidos para Leer Perú, semana {data.semanaPiloto} de {data.programWeeks} — {rangoSemana(data.corte)}
                </p>
              </div>
              <p className="g-hoja__org">Leer en Familia<br />Hospital piloto</p>
            </header>

            <section>
              <h2>Resumen de la semana</h2>
              <p className="g-prosa">{reportSummary(data)}</p>
            </section>

            <dl className="g-tira">
              <div><dt>Familias activas</dt><dd>{data.activasEstaSemana}</dd></div>
              <div><dt>Lecturas registradas</dt><dd>{data.registrosSemana}</dd></div>
              <div><dt>Kits entregados</dt><dd>—</dd></div>
              <div><dt>Ambos cuidadores</dt><dd>{data.ambosCuidadores}</dd></div>
            </dl>
            <p className="g-faint">Lecturas: registros de los últimos 7 días. Kits: el hospital todavía no registra las entregas en la plataforma.</p>

            <section>
              <h2>Participación acumulada</h2>
              <Participacion data={data} hoja />
            </section>

            <section>
              <h2>Observaciones de campo</h2>
              <label className="visually-hidden" htmlFor="observaciones">Observaciones de campo</label>
              <textarea id="observaciones" className="g-observaciones no-imprimir" value={observaciones}
                        placeholder="Lo que el equipo observó esta semana. Una idea por línea."
                        onChange={(event) => setObservaciones(event.target.value)} />
              <ul className="g-lista-obs solo-impresion">
                {observationLines(observaciones).map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </section>

            <footer className="g-hoja__pie">
              Generado el {fechaLarga(limaToday(generated))}. {PRIVACY_FOOTER}
            </footer>
          </article>

          <aside className="g-reporte__acciones no-imprimir">
            <section className="g-tarjeta">
              <h2 className="g-tarjeta__titulo">Exportar</h2>
              <button type="button" className="g-btn g-btn--primario" onClick={() => window.print()}>Descargar PDF</button>
              <a className="g-btn" href={mailtoHref(`Reporte semanal — semana ${data.semanaPiloto}`, reportPlainText(data, observaciones, generated))}>
                Enviar por correo al hospital
              </a>
              <button type="button" className="g-btn" onClick={() => void copy()}>Copiar resumen como texto</button>
              {copied && <p className="g-aviso-ok" role="status">Copiado.</p>}
            </section>
            <section className="g-tarjeta">
              <h2 className="g-tarjeta__titulo">Qué incluye</h2>
              <ul className="g-incluye">
                <li className="is-incluido">Indicadores operativos</li>
                <li className="is-incluido">Participación por semana</li>
                <li className="is-incluido">Observaciones del equipo</li>
                <li>Notas de familias, solo con consentimiento</li>
              </ul>
            </section>
            <p className="g-aviso">
              Este reporte se arma con los datos al momento de abrirlo. Las observaciones no se guardan: se incluyen
              al descargar, enviar o copiar.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
```

La hoja se titula en Literata 500, no en 600 como el prototipo, para no cargar un cuarto peso (D-023).

- [ ] **Step 2: Probar impresión**

Con datos (mock o stack desplegado), abra el reporte y aplique Cmd+P → "Guardar como PDF". La hoja debe
salir sola en A4:
- sin barra lateral ni columna de acciones
- con las observaciones como lista, no como textarea
- con el pie de privacidad

- [ ] **Step 3: Commit**

```bash
cd web && npm run typecheck && npm run build
git add web/src/gestor/Reporte.tsx
git commit -m "feat(web): weekly implementation report, printed to PDF and copied as text in the browser

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 5.6: Pantalla 13: bandeja unificada

**Files:**
- Modify (reescribir): `web/src/gestor/Bandeja.tsx`

Mismo comportamiento que hoy: filtros por estado, responder con aviso de notificación y cerrar. Cambian la
piel, el conteo dentro del chip activo, la antigüedad en `--alert` y el texto de la familia en Literata.

- [ ] **Step 1: Reemplazar `Bandeja.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { gestorApi, type InboxItem } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { daysSince, fechaLarga, limaToday } from './tiempo.ts';

const FILTERS = [
  { value: 'abierto', label: 'Sin responder' },
  { value: 'respondido', label: 'Respondidos' },
  { value: 'cerrado', label: 'Cerrados' },
  { value: 'todos', label: 'Todos' },
] as const;

const TYPE_LABEL: Record<string, string> = {
  consulta: 'Consulta', comentario: 'Comentario', pedido: 'Pedido', problema: 'Problema',
};

export function Bandeja() {
  const [filter, setFilter] = useState<string>('abierto');
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((estado: string) => {
    setItems(null);
    gestorApi.bandeja(estado)
      .then((response) => setItems(response.mensajes))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  useEffect(() => load(filter), [filter, load]);

  return (
    <>
      <Cabecera titulo="Bandeja" subtitulo="Lo que llega por la app y por WhatsApp, lo más antiguo primero">
        <div className="g-chips" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((option) => (
            <button key={option.value} type="button" className="g-chip" aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}>
              {option.label}{filter === option.value && items !== null ? ` ${items.length}` : ''}
            </button>
          ))}
        </div>
      </Cabecera>
      <div className="g-cuerpo">
        {error !== null && <p className="g-error" role="alert">{error}</p>}
        {items === null && error === null && <p className="g-faint">Cargando…</p>}
        {items !== null && items.length === 0 && <p className="g-faint">Nada pendiente aquí.</p>}
        {items?.map((item) => <Mensaje key={item.feedback.id} item={item} onChanged={() => load(filter)} />)}
        <p className="g-faint">Las respuestas no se editan: cada una se agrega a la anterior y la familia ve las dos.</p>
      </div>
    </>
  );
}

function Mensaje({ item, onChanged }: { item: InboxItem; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const today = limaToday(new Date());
  const open = item.feedback.status === 'abierto';
  const age = daysSince(item.feedback.createdAt, today);

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await gestorApi.responder(item.familyId, item.feedback.id, text);
      // The reply is saved even when the notification fails; the manager needs to know which happened.
      setNotice(outcome.notified
        ? `Respondido y avisado por WhatsApp (${outcome.channel}).`
        : `Respuesta guardada, pero no se pudo avisar por WhatsApp: ${outcome.reason ?? 'sin detalle'}.`);
      setText('');
      onChanged();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={open ? 'g-mensaje g-mensaje--abierto' : 'g-mensaje'}>
      <div className="g-mensaje__cabecera">
        <div className="g-mensaje__quien">
          <strong>{item.babyName || item.familyId}</strong>
          <span className={item.feedback.channel === 'whatsapp' ? 'g-pill g-pill--canal' : 'g-pill'}>
            {item.feedback.channel === 'whatsapp' ? 'WhatsApp' : 'App'}
          </span>
          <span className="g-pill">{TYPE_LABEL[item.feedback.type] ?? item.feedback.type}</span>
        </div>
        {open
          ? <span className="g-alerta">Sin responder, {age === 1 ? '1 día' : `${age} días`}</span>
          : <span className="g-ok">{item.feedback.status === 'cerrado' ? 'Cerrado' : 'Respondido'}</span>}
      </div>
      <p className="g-prosa">“{item.feedback.text}”</p>

      {item.feedback.replies.map((entry, index) => (
        <div key={index} className="g-respuesta">
          Respondido el {fechaLarga(entry.at.slice(0, 10))}: {entry.text}
        </div>
      ))}

      {item.feedback.status !== 'cerrado' && (
        <form onSubmit={reply} className="g-botones" style={{ flexDirection: 'column' }}>
          <label className="visually-hidden" htmlFor={`resp-${item.feedback.id}`}>
            {item.feedback.replies.length === 0 ? 'Responder' : 'Agregar otra respuesta'}
          </label>
          <textarea id={`resp-${item.feedback.id}`} value={text} required maxLength={1000}
                    placeholder={item.feedback.replies.length === 0 ? 'Tu respuesta' : 'Agregar otra respuesta'}
                    onChange={(event) => setText(event.target.value)} />
          <div className="g-botones">
            <button type="submit" className="g-btn g-btn--primario g-btn--chico" disabled={busy || text.trim() === ''}>Responder</button>
            <button type="button" className="g-btn g-btn--chico" disabled={busy}
                    onClick={() => void gestorApi.cerrar(item.familyId, item.feedback.id).then(onChanged)}>
              Cerrar
            </button>
          </div>
        </form>
      )}
      {notice !== null && <p className="g-faint" role="status">{notice}</p>}
    </article>
  );
}
```

El `style={{ flexDirection: 'column' }}` del formulario es layout y va contra la regla de "sin inline".
Mejor agregue a `gestor.css` `.g-respuesta-form { display: flex; flex-direction: column; gap: 8px; }` y
use esa clase en el `<form>`.

- [ ] **Step 2: Verificar y commit**

```bash
cd web && npm run typecheck && npm run build
git add web/src/gestor/Bandeja.tsx web/src/gestor/gestor.css
git commit -m "feat(web): unified inbox in the new identity, with unanswered age and count in the active filter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 5.7: Pantalla 14 (auditoría) y exportaciones

**Files:**
- Modify (reemplaza el stub): `web/src/gestor/Auditoria.tsx`
- Modify (reescribir): `web/src/gestor/Exportar.tsx`

- [ ] **Step 1: `Auditoria.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { gestorApi, type AuditEntry } from './api.ts';
import { auditRow } from './auditoria.ts';
import { Cabecera } from './Cabecera.tsx';
import { descargarCsv } from './descargar.ts';
import { limaToday } from './tiempo.ts';

/** Screen 14. The last two months on screen; the whole log is one export away. */
export function Auditoria() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = limaToday(new Date());

  useEffect(() => {
    gestorApi.auditoria()
      .then((response) => setEntries(response.entradas))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  return (
    <>
      <Cabecera titulo="Auditoría de accesos">
        <button type="button" className="g-btn g-btn--primario"
                onClick={() => void descargarCsv('auditoria').catch((c: unknown) => setError(c instanceof Error ? c.message : 'No se pudo exportar'))}>
          Exportar CSV
        </button>
      </Cabecera>
      <div className="g-cuerpo">
        <p className="g-intro">
          Se registra cada vez que alguien del equipo abre la ficha de una familia, responde un mensaje o exporta
          datos. Por tratarse de datos de menores, este registro no se puede desactivar.
        </p>
        {error !== null && <p className="g-error" role="alert">{error}</p>}
        {entries === null && error === null && <p className="g-faint">Cargando…</p>}
        {entries !== null && (
          <div className="g-tabla-caja">
            <table className="g-tabla g-tabla--auditoria">
              <colgroup><col className="g-col-cuando" /><col /><col /><col className="g-col-accion" /></colgroup>
              <thead>
                <tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Qué abrió</th><th scope="col">Acción</th></tr>
              </thead>
              <tbody>
                {entries.length === 0 && <tr><td colSpan={4}>Sin accesos en los dos últimos meses.</td></tr>}
                {entries.map((entry) => {
                  const row = auditRow(entry, today);
                  return (
                    <tr key={`${entry.at}-${entry.gestorSub}`}>
                      <td>{row.cuando}</td>
                      <td className="g-celda-principal">{row.quien}</td>
                      <td>{row.que}</td>
                      <td className={row.alerta ? 'g-accion--alerta' : undefined}>{row.accion}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="g-faint">Muestra los dos últimos meses. El registro completo se conserva durante todo el piloto y se descarga con Exportar CSV.</p>
      </div>
    </>
  );
}
```

Agregue a `gestor.css` los anchos del diseño (`130px 1fr 1fr 96px`):

```css
.g-col-cuando { width: 130px; }
.g-col-accion { width: 96px; }
```

- [ ] **Step 2: `Exportar.tsx`**

```tsx
import { useState } from 'react';
import { Cabecera } from './Cabecera.tsx';
import { descargarCsv } from './descargar.ts';

const DATASETS = [
  { id: 'resumen', label: 'Resumen de indicadores', hint: 'Una fila por indicador, con su definición al lado' },
  { id: 'familias', label: 'Familias', hint: 'Una fila por familia: adherencia, envíos, feedback' },
  { id: 'bitacora', label: 'Bitácora', hint: 'Una fila por entrada. El archivo granular del análisis' },
  { id: 'envios', label: 'Envíos', hint: 'Alcance semanal y categoría de precio de Meta' },
  { id: 'feedback', label: 'Feedback', hint: 'Mensajes de las familias y tiempos de respuesta' },
  { id: 'auditoria', label: 'Auditoría de accesos', hint: 'Quién abrió qué y cuándo' },
] as const;

export function Exportar() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(dataset: string) {
    setBusy(dataset);
    setError(null);
    try {
      await descargarCsv(dataset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Cabecera titulo="Exportar datos" />
      <div className="g-cuerpo">
        <p className="g-intro">
          Archivos CSV para el análisis del piloto. Van seudonimizados —sin teléfonos ni nombres— pero siguen siendo
          datos personales: guárdalos con el mismo cuidado que la plataforma. Cada exportación queda registrada con tu
          usuario, y el texto de las notas solo se incluye para las familias que lo autorizaron.
        </p>
        <div className="g-tabla-caja">
          <table className="g-tabla">
            <thead>
              <tr><th scope="col">Archivo</th><th scope="col">Contenido</th><th scope="col"><span className="visually-hidden">Descargar</span></th></tr>
            </thead>
            <tbody>
              {DATASETS.map((dataset) => (
                <tr key={dataset.id}>
                  <td className="g-celda-principal">{dataset.label}</td>
                  <td>{dataset.hint}</td>
                  <td>
                    <button type="button" className="g-btn g-btn--chico" disabled={busy !== null} onClick={() => void download(dataset.id)}>
                      {busy === dataset.id ? 'Generando…' : 'Descargar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error !== null && <p className="g-error" role="alert">{error}</p>}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verificación del gestor completo y commit**

```bash
cd web && npm run typecheck && npm test && node scripts/check-contrast.mjs && npm run build
npx vite preview --port 4173
```
A 1366×768, recorra Tablero, Familias (con ficha abierta), Reporte, Bandeja, Auditoría y Exportar contra
las pantallas 9 a 14. Chequee dos cosas:
- no hay scroll horizontal, y los encabezados de tabla van sin mayúsculas forzadas
- con el teclado, el foco es visible en la navegación, los filtros, los botones de fila y los chips

```bash
git add web/src/gestor
git commit -m "feat(web): access audit screen and restyled data exports

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
