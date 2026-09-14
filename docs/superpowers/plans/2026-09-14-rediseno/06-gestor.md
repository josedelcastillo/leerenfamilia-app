# Fase 5 — Gestor: estilos, shell, login y tablero

Ver [`00-indice.md`](00-indice.md). Continúa en [`06b-gestor.md`](06b-gestor.md). La consola se diseña
para 1366×768 sin scroll horizontal; por debajo de 60rem la barra lateral pasa arriba. Base de 15px,
metadatos de 12px y controles de 30 a 38px (el piso de 56px es solo de Familia).

---

### Tarea 5.1: `gestor.css` completo

**Files:**
- Modify (reescribir): `web/src/gestor/gestor.css`

- [ ] **Step 1: Reemplazar el archivo completo**

```css
/*
 * Manager surface. Density over decoration: a working tool for five people who need to see who needs
 * attention this week. Same identity as the family app, its own layout: fixed side navigation,
 * 60px headers, tables with hairlines, no shadows.
 */
:root {
  --g-paper: #F6F4F9;
  --g-surface: #FFFFFF;
  --g-line: #E6E0EC;
  --g-line-soft: #EFEAF3;
  --g-line-strong: #DED6E6;
  --g-head: #FAF8FC;
  --g-ink-soft: #554A66;
  --g-ink-faint: #726A7F;
  --g-dark: #241A33;
  --g-purple: #7B4C99;
  --g-select: #F6F0FA;
}

/* --- shell --------------------------------------------------------------- */
.g-shell {
  display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100vh;
  background: var(--g-paper); color: var(--ink);
  font-family: var(--font-ui); font-size: 15px; line-height: 1.5;
}
.g-lateral {
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column; padding: 20px 0;
  background: var(--g-surface); border-right: 1px solid var(--g-line);
}
.g-lateral__marca { display: flex; flex-direction: column; gap: 2px; padding: 0 20px 22px; }
.g-org { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--g-purple); }
.g-lockup { width: 156px; height: auto; margin: 4px 0 2px -2px; }
.g-faint { font-size: 12px; color: var(--g-ink-faint); }
.g-nav-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.g-nav {
  display: block; width: 100%; min-height: 34px; padding: 11px 20px;
  border: 0; border-left: 3px solid transparent; background: none; cursor: pointer;
  font-size: 14px; color: var(--g-ink-soft); text-align: left;
  transition: background-color var(--ease), color var(--ease);
}
.g-nav[aria-current='page'] { font-weight: 700; color: var(--ink); border-left-color: var(--coral); background: var(--g-select); }
.g-nav--salir { margin-top: auto; }
.g-principal { min-width: 0; display: flex; flex-direction: column; }
.g-cabecera {
  flex: none; height: 60px; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: var(--g-surface); border-bottom: 1px solid var(--g-line);
}
.g-cabecera h1 { font-size: 17px; font-weight: 700; }
.g-cabecera__acciones { display: flex; align-items: center; gap: 10px; }
.g-cuerpo { display: flex; flex-direction: column; gap: 20px; padding: 22px 24px; }
.g-pie { padding: 0 24px 24px; font-size: 12px; color: var(--g-ink-faint); }

/* The family stylesheet sizes controls for thumbs; the console sizes them for a mouse. */
.g-shell input:not([type='checkbox']):not([type='radio']), .g-shell select,
.g-login input:not([type='checkbox']):not([type='radio']) {
  width: auto; min-height: 0; height: 38px; padding: 0 12px;
  font-size: 13px; color: var(--g-ink-soft); background: var(--g-surface);
  border: 1px solid var(--g-line-strong); border-radius: 8px;
}
.g-login input:not([type='checkbox']):not([type='radio']) { width: 100%; font-size: 15px; color: var(--ink); }
.g-shell textarea {
  width: 100%; min-height: 72px; padding: 10px 12px; background: var(--g-surface);
  border: 1px solid var(--g-line-strong); border-radius: 8px;
  font-family: var(--font-read); font-size: 14px; line-height: 1.5;
}

/* --- controls ------------------------------------------------------------ */
.g-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 36px; padding: 0 16px; border-radius: 8px;
  border: 1px solid var(--g-line-strong); background: var(--g-surface); color: var(--ink);
  font-size: 13px; cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: background-color var(--ease), border-color var(--ease);
}
.g-btn--primario { background: var(--g-purple); border-color: var(--g-purple); color: #ffffff; font-weight: 700; }
.g-btn--oscuro { background: var(--g-dark); border-color: var(--g-dark); color: #ffffff; font-weight: 700; }
.g-btn--chico { height: 32px; padding: 0 14px; border-radius: 6px; }
.g-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.g-enlace { padding: 0; border: 0; background: none; cursor: pointer; font-size: 13px; color: var(--g-ink-faint); text-decoration: underline; }
.g-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.g-chip {
  height: 30px; padding: 0 11px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--g-line-strong); background: var(--g-surface); color: var(--g-ink-soft); font-size: 13px;
  transition: background-color var(--ease), color var(--ease);
}
.g-chip[aria-pressed='true'] { background: var(--g-dark); border-color: var(--g-dark); color: #ffffff; }
.g-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.g-error { font-size: 13px; color: var(--alert); }
.g-aviso-ok { font-size: 13px; color: var(--ok); }

/* --- cards and indicators ------------------------------------------------ */
.g-tarjeta {
  display: flex; flex-direction: column; gap: 12px; padding: 16px 20px;
  background: var(--g-surface); border: 1px solid var(--g-line); border-radius: 10px;
}
.g-tarjeta__cabecera { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.g-tarjeta__titulo { font-size: 14px; font-weight: 700; }
.g-indicadores { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.g-indicador {
  display: flex; flex-direction: column; gap: 7px; padding: 16px 18px;
  background: var(--g-surface); border: 1px solid var(--g-line); border-radius: 10px;
}
.g-indicador--destacado { box-shadow: inset 3px 0 0 var(--coral); }
.g-indicador__etiqueta { font-size: 13px; color: var(--g-ink-faint); }
.g-cifra { font-family: var(--font-read); font-size: 32px; line-height: 1; font-variant-numeric: tabular-nums; }
.g-indicador__nota { font-size: 12px; line-height: 1.5; color: var(--g-ink-faint); }
.g-dos { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; }
.g-acciones { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.g-acciones li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--g-line-soft); }
.g-acciones li:last-child { border-bottom: 0; }
.g-cifra-fila { display: flex; align-items: flex-end; gap: 10px; }
.g-cifra-fila .g-faint { font-size: 13px; padding-bottom: 4px; }
.g-progreso { height: 8px; border-radius: 4px; background: var(--g-line); overflow: hidden; }
.g-progreso span { display: block; height: 100%; width: var(--valor, 0%); background: var(--ok); }

/* Participation bars: purple for past weeks, coral for the current one, empty for the future. */
.g-barras { display: flex; align-items: flex-end; gap: 10px; height: 132px; }
.g-barra { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; }
.g-barra__valor { height: var(--alto, 4%); min-height: 4px; border-radius: 4px 4px 0 0; background: var(--morado); }
.g-barra--actual .g-barra__valor { background: var(--coral); }
.g-barra--futura .g-barra__valor { height: 8%; background: var(--g-line); }
.g-barra__etiqueta { font-size: 12px; line-height: 1.35; text-align: center; color: var(--g-ink-faint); }

/* --- tables -------------------------------------------------------------- */
.g-tabla-caja { overflow: auto; background: var(--g-surface); border: 1px solid var(--g-line); border-radius: 10px; }
.g-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
.g-tabla th {
  padding: 11px 16px; text-align: left; background: var(--g-head); border-bottom: 1px solid var(--g-line);
  font-size: 12px; font-weight: 700; color: var(--g-ink-faint);
}
.g-tabla td {
  height: 46px; padding: 0 16px; border-bottom: 1px solid var(--g-line-soft);
  color: var(--g-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.g-tabla tr:last-child td { border-bottom: 0; }
.g-tabla td.g-celda-principal { font-weight: 700; color: var(--ink); }
.g-tabla tr[aria-selected='true'] td { background: var(--g-select); }
.g-fila-boton { padding: 0; border: 0; background: none; font: inherit; font-weight: 700; color: inherit; cursor: pointer; text-align: left; }
.g-estado { display: inline-flex; align-items: center; gap: 7px; color: var(--ink); }
.g-estado::before { content: ''; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--g-ink-faint); }
.g-estado--activa::before { background: var(--ok); }
.g-estado--en_pausa::before { background: var(--alert); }
.g-estado--de_baja::before { background: var(--g-line-strong); }
.g-tabla--auditoria td { height: auto; padding: 10px 16px; white-space: normal; }
.g-accion--alerta { color: var(--alert); }
.g-intro { max-width: 70ch; font-size: 13px; line-height: 1.5; color: var(--g-ink-soft); }

/* --- family detail ------------------------------------------------------- */
.g-split { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.g-ficha { overflow: hidden; background: var(--g-paper); border: 1px solid var(--g-line-strong); border-radius: 10px; }
.g-ficha__cabecera {
  height: 60px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between;
  background: var(--g-surface); border-bottom: 1px solid var(--g-line);
}
.g-ficha__cabecera h2 { font-size: 16px; font-weight: 700; }
.g-ficha__cuerpo { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
.g-datos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
.g-datos div { display: flex; flex-direction: column; gap: 3px; }
.g-datos dt { font-size: 12px; color: var(--g-ink-faint); }
.g-lista-simple { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.g-lista-simple li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--g-line-soft); }
.g-lista-simple li:last-child { border-bottom: 0; }
.g-pill { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; background: #F1F0EC; color: var(--g-ink-soft); }
.g-pill--canal { background: var(--accent-soft); color: var(--accent); }
.g-pill--ok, .g-pill--alerta { background: var(--g-surface); border: 1px solid currentColor; }
.g-pill--ok { color: var(--ok); }
.g-pill--alerta { color: var(--alert); }
.g-notas { display: flex; flex-direction: column; gap: 10px; font-family: var(--font-read); font-size: 14px; line-height: 1.6; color: var(--ink-mid); }
.g-sin-consentimiento {
  min-height: 120px; padding: 18px; border-radius: 8px; text-align: center;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: var(--g-paper); border: 1px dashed var(--g-line-strong);
}
.g-sin-consentimiento p { max-width: 34ch; font-size: 13px; line-height: 1.55; color: var(--g-ink-soft); }
.g-guion { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; background: var(--g-line); color: var(--g-ink-faint); }

/* --- inbox --------------------------------------------------------------- */
.g-mensaje {
  display: flex; flex-direction: column; gap: 8px; padding: 14px 16px;
  background: var(--g-surface); border: 1px solid var(--g-line); border-radius: 8px;
}
.g-mensaje--abierto { border-left: 3px solid var(--coral); }
.g-mensaje__cabecera { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.g-mensaje__quien { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; }
.g-prosa { font-family: var(--font-read); font-size: 15px; line-height: 1.6; color: var(--ink-mid); }
.g-respuesta { padding: 10px 12px; border-left: 3px solid var(--morado); border-radius: 0 6px 6px 0; background: var(--surface); font-size: 13px; color: var(--g-ink-soft); }
.g-botones { display: flex; gap: 8px; flex-wrap: wrap; }
.g-alerta { font-size: 12px; color: var(--alert); }
.g-ok { font-size: 12px; color: var(--ok); }

/* --- weekly report ------------------------------------------------------- */
.g-reporte { display: flex; align-items: flex-start; gap: 24px; padding: 28px; background: #E9EBEF; }
.g-hoja { flex: none; width: 794px; max-width: 100%; display: flex; flex-direction: column; gap: 26px; padding: 52px 60px; background: #ffffff; }
.g-hoja__cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid var(--g-purple); }
.g-hoja h1 { font-family: var(--font-read); font-size: 24px; font-weight: 500; }
.g-hoja h2 { font-size: 14px; font-weight: 700; }
.g-hoja section { display: flex; flex-direction: column; gap: 8px; }
.g-hoja__sub { font-size: 13px; color: var(--g-ink-soft); }
.g-hoja__org { font-size: 12px; line-height: 1.5; text-align: right; color: var(--g-ink-faint); }
.g-tira { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--g-line-strong); }
.g-tira div { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-right: 1px solid var(--g-line-strong); }
.g-tira div:last-child { border-right: 0; }
.g-tira dt { font-size: 11px; color: var(--g-ink-faint); }
.g-tira dd { font-family: var(--font-read); font-size: 24px; }
.g-barras--hoja { height: 96px; gap: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--g-line-strong); }
.g-barras--hoja .g-barra__valor { border-radius: 0; }
.g-barras--hoja .g-barra__etiqueta { font-size: 11px; }
.g-observaciones { min-height: 96px; }
.g-lista-obs { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 7px; font-family: var(--font-read); font-size: 15px; line-height: 1.65; color: var(--ink-mid); }
.g-hoja__pie { margin-top: auto; padding-top: 18px; border-top: 1px solid var(--g-line-strong); font-size: 11px; color: var(--g-ink-faint); }
.g-reporte__acciones { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 12px; }
.g-reporte__acciones .g-btn { width: 100%; height: 42px; font-size: 14px; }
.g-incluye { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; font-size: 13px; color: var(--g-ink-soft); }
.g-incluye li { display: flex; align-items: center; gap: 10px; }
.g-incluye li::before { content: ''; flex: none; width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #C9C0D2; }
.g-incluye li.is-incluido::before { content: '✓'; display: grid; place-items: center; background: var(--ok); border-color: var(--ok); color: #ffffff; font-size: 12px; }
.g-aviso { padding: 16px 20px; border-radius: 10px; background: var(--g-select); border: 1px solid #E0D0EC; font-size: 13px; line-height: 1.55; color: var(--g-ink-soft); }
.solo-impresion { display: none; }

/* --- login --------------------------------------------------------------- */
.g-login { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--g-paper); font-family: var(--font-ui); }
.g-login__caja { width: min(100%, 24rem); display: flex; flex-direction: column; gap: 14px; padding: 28px; background: var(--g-surface); border: 1px solid var(--g-line); border-radius: 10px; }
.g-login__caja form { display: flex; flex-direction: column; gap: 14px; }
.g-campo { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--g-ink-soft); }
.g-login .g-btn { height: 42px; font-size: 14px; }

/* --- narrow screens ------------------------------------------------------ */
@media (max-width: 60rem) {
  .g-shell { grid-template-columns: 1fr; }
  .g-lateral { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--g-line); }
  .g-lateral__marca { padding: 0 12px 0 0; }
  .g-nav-lista { flex-direction: row; flex-wrap: wrap; }
  .g-nav { width: auto; border-left: 0; border-bottom: 3px solid transparent; }
  .g-nav[aria-current='page'] { border-bottom-color: var(--coral); }
  .g-nav--salir { margin-top: 0; margin-left: auto; }
  .g-indicadores { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .g-dos, .g-split { grid-template-columns: 1fr; }
  .g-reporte { flex-direction: column; padding: 12px; }
  .g-hoja { padding: 28px 20px; }
}

/* --- print: the report is the page, nothing else ------------------------- */
@media print {
  .g-lateral, .g-cabecera, .g-pie, .no-imprimir { display: none !important; }
  .g-shell { display: block; background: #ffffff; }
  .g-reporte { padding: 0; background: #ffffff; }
  .g-hoja { width: auto; padding: 0; }
  .g-observaciones { display: none; }
  .solo-impresion { display: block; }
  @page { size: A4; margin: 18mm; }
}
```

- [ ] **Step 2: Contraste y build**

```bash
cd web && node scripts/check-contrast.mjs && npm run build
```
Expected: todos los pares `gestor: …` en `ok` y el build pasa. Los componentes del gestor todavía usan
clases viejas; se ven sin estilo hasta la 5.2. Es esperado, y el commit va junto con la 5.2.

---

### Tarea 5.2: Shell con barra lateral, cabecera y login

**Files:**
- Create: `web/src/gestor/Cabecera.tsx`
- Modify (reescribir): `web/src/gestor/ManagerApp.tsx`, `web/src/gestor/Login.tsx`

`ManagerApp` enruta a `Tablero`, `Reporte` y `Auditoria`, que todavía no existen. Para que el build no
se rompa, créelos en este paso como stubs de una línea y reemplácelos en las tareas 5.3, 5.5 y 5.7:

```tsx
// web/src/gestor/Tablero.tsx, Reporte.tsx, Auditoria.tsx — stub temporal, se reemplaza en su tarea
export function Tablero(_: { onGoTo: (view: 'familias' | 'bandeja' | 'reporte') => void }) { return null; }
```
(`Reporte` y `Auditoria` sin props: `export function Reporte() { return null; }`.)

- [ ] **Step 1: `Cabecera.tsx`**

```tsx
import type { ReactNode } from 'react';

/** The 60px header every manager view starts with: a title, and its actions on the right. */
export function Cabecera({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: ReactNode }) {
  return (
    <header className="g-cabecera">
      <div>
        <h1>{titulo}</h1>
        {subtitulo !== undefined && <p className="g-faint">{subtitulo}</p>}
      </div>
      {children !== undefined && <div className="g-cabecera__acciones">{children}</div>}
    </header>
  );
}
```

- [ ] **Step 2: `ManagerApp.tsx`**

```tsx
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
```

El stub de `Tablero` tipa `onGoTo` con tres vistas; con `setView` (que acepta `View`) compila igual.

- [ ] **Step 3: `Login.tsx`**

Mismo flujo de tres pasos que hoy; cambian la piel y el texto de los errores.

```tsx
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
```

- [ ] **Step 4: Build, vistazo y commit**

```bash
cd web && npm run typecheck && npm run build && npx vite preview --port 4173
```
Abra `http://localhost:4173/gestor` a 1366×768. Chequee dos cosas: el login en su caja blanca sobre
lila, y, tras entrar, la barra lateral de 220px con el lockup y el ítem activo con filete coral. Las
vistas viejas (Familias, Bandeja, Exportar) se ven desarregladas hasta sus tareas.

```bash
git add web/src/gestor
git commit -m "feat(web): manager shell with side navigation, 60px headers and restyled login

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 5.3: Pantalla 9: tablero del piloto

**Files:**
- Create: `web/src/gestor/Participacion.tsx`
- Modify (reemplaza el stub): `web/src/gestor/Tablero.tsx`

- [ ] **Step 1: `Participacion.tsx`** (lo usan el tablero y el reporte)

```tsx
import type { CSSProperties } from 'react';
import type { Dashboard } from './api.ts';
import { participationBars } from './reporte.ts';

/** Families with at least one entry, per programme week, as a share of those that reached it. */
export function Participacion({ data, hoja = false }: { data: Dashboard; hoja?: boolean }) {
  const bars = participationBars(data);
  const label = bars
    .filter((bar) => bar.estado !== 'futura')
    .map((bar) => `Semana ${bar.semana}: ${bar.activas} familias`)
    .join('. ');

  return (
    <div className={hoja ? 'g-barras g-barras--hoja' : 'g-barras'} role="img" aria-label={label || 'Sin semanas todavía'}>
      {bars.map((bar) => (
        <div key={bar.semana} className={`g-barra g-barra--${bar.estado}`}>
          <div className="g-barra__valor" style={{ '--alto': `${Math.max(bar.porcentaje, 4)}%` } as CSSProperties} />
          <div className="g-barra__etiqueta">
            {!hoja && bar.estado !== 'futura' && <>{bar.activas}<br /></>}S{bar.semana}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `Tablero.tsx`**

```tsx
import { useEffect, useState, type CSSProperties } from 'react';
import { gestorApi, type Dashboard } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { Participacion } from './Participacion.tsx';

function Indicador({ etiqueta, cifra, nota, destacado = false }: {
  etiqueta: string; cifra: number | null; nota: string; destacado?: boolean;
}) {
  return (
    <div className={destacado ? 'g-indicador g-indicador--destacado' : 'g-indicador'}>
      <span className="g-indicador__etiqueta">{etiqueta}</span>
      {cifra !== null && <span className="g-cifra">{cifra}</span>}
      <span className="g-indicador__nota">{nota}</span>
    </div>
  );
}

/**
 * Screen 9. Only what the platform knows (D-026). Outreach and kit delivery are not in the data model,
 * so those two cards say what is missing instead of showing a number nobody measured.
 */
export function Tablero({ onGoTo }: { onGoTo: (view: 'familias' | 'bandeja' | 'reporte') => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gestorApi.tablero().then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  return (
    <>
      <Cabecera titulo="Tablero del piloto">
        <button type="button" className="g-btn g-btn--primario" onClick={() => onGoTo('reporte')}>Generar reporte</button>
      </Cabecera>
      <div className="g-cuerpo">
        {error !== null && <p className="g-error">{error}</p>}
        {data === null && error === null && <p className="g-faint">Cargando…</p>}
        {data !== null && (
          <>
            <div className="g-indicadores">
              <Indicador etiqueta="Sensibilizadas" cifra={null}
                         nota="Aparecerá cuando el hospital registre a las familias sensibilizadas en consulta." />
              <Indicador etiqueta="Registradas en la PWA" cifra={data.registradas} nota="familias inscritas en el piloto" />
              <Indicador etiqueta="Activas esta semana" cifra={data.activasEstaSemana}
                         nota="al menos un registro en 7 días" destacado />
              <Indicador etiqueta="Kits entregados" cifra={null}
                         nota="Aparecerá cuando el hospital registre las entregas de kit." />
            </div>

            <section className="g-tarjeta">
              <div className="g-tarjeta__cabecera">
                <h2 className="g-tarjeta__titulo">Participación por semana</h2>
                <span className="g-faint">familias con al menos un registro</span>
              </div>
              {data.semanaPiloto === 0
                ? <p className="g-faint">La participación aparece cuando las familias empiecen su primera semana.</p>
                : <Participacion data={data} />}
            </section>

            <div className="g-dos">
              <section className="g-tarjeta">
                <h2 className="g-tarjeta__titulo">Requiere acción del equipo</h2>
                {data.mensajesSinResponder === 0 && data.sinRegistros7Dias === 0 ? (
                  <p className="g-faint">Nada pendiente.</p>
                ) : (
                  <ul className="g-acciones">
                    {data.mensajesSinResponder > 0 && (
                      <li>
                        <span>{data.mensajesSinResponder} {data.mensajesSinResponder === 1 ? 'comentario' : 'comentarios'} sin responder en la bandeja</span>
                        <button type="button" className="g-enlace" onClick={() => onGoTo('bandeja')}>Abrir</button>
                      </li>
                    )}
                    {data.sinRegistros7Dias > 0 && (
                      <li>
                        <span>{data.sinRegistros7Dias} {data.sinRegistros7Dias === 1 ? 'familia' : 'familias'} sin registros en 7 días</span>
                        <button type="button" className="g-enlace" onClick={() => onGoTo('familias')}>Ver lista</button>
                      </li>
                    )}
                  </ul>
                )}
              </section>
              <section className="g-tarjeta">
                <h2 className="g-tarjeta__titulo">Consentimiento de notas</h2>
                <div className="g-cifra-fila">
                  <span className="g-cifra">{data.consentimientoNotas.autorizan}</span>
                  <span className="g-faint">de {data.consentimientoNotas.de} familias autorizan que el equipo lea sus notas</span>
                </div>
                <div className="g-progreso" aria-hidden="true"
                     style={{ '--valor': `${data.consentimientoNotas.de === 0 ? 0 : Math.round((data.consentimientoNotas.autorizan / data.consentimientoNotas.de) * 100)}%` } as CSSProperties}>
                  <span />
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Probar contra datos de demo**

Sin backend desplegado el tablero muestra el error del fetch, y eso es correcto. Para verlo con datos,
elija una de dos:
- después del deploy de la fase 6, contra el stack con `seed-demo.ts`
- ahora, con un mock temporal de `gestorApi.tablero` que devuelva el objeto `dashboard()` de
  `test/gestor-logica.test.ts`. **No lo commitee.**

Compare a 1366×768 con la pantalla 9: cuatro tarjetas, barras moradas con la semana actual en coral, dos
tarjetas abajo, y todo sin scroll horizontal.

- [ ] **Step 4: Commit**

```bash
cd web && npm run typecheck && npm test && npm run build
git add web/src/gestor/Participacion.tsx web/src/gestor/Tablero.tsx
git commit -m "feat(web): pilot dashboard, with empty states where the data model has nothing to show

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
