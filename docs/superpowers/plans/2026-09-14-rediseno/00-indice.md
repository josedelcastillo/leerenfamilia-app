# Re-vestido "Nacidos para Leer" — plan de implementación (índice)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ejecute las fases **en orden**; dentro de cada archivo, las tareas también van en orden.

**Goal:** Llevar la PWA (familia y gestor) al diseño del handoff de Claude Design
(`docs/diseno/handoff-2026-09/`), agregando solo el backend mínimo que las pantallas nuevas necesitan.

**Architecture:** Los tokens y las clases viven en los dos CSS existentes (`web/src/shared/styles.css`,
`web/src/gestor/gestor.css`). La lógica de cada pantalla que se puede probar va en módulos `.ts` puros al
lado del componente (el patrón de `historial.ts` y `cerebro.ts`), porque `node --test` no lee JSX. En el
backend no se agrega ninguna Lambda: hay dos rutas nuevas en el handler de gestor (`/tablero`,
`/auditoria`) y un tipo de ítem nuevo (`consentimiento`) en la cola que ya procesa la Lambda de tracking.

**Tech Stack:** React 19, Vite 7, CSS plano con custom properties, `node --test` sobre TypeScript nativo
(Node ≥ 22.18), AWS SAM, DynamoDB de tabla única. Sin dependencias nuevas: las fuentes son archivos
WOFF2 del repo, no paquetes npm.

---

## Fases

| # | Archivo | Qué deja funcionando |
|---|---|---|
| 0 | [`01-base.md`](01-base.md) (0.1–0.4, 0.6) + [`01b-estilos-familia.md`](01b-estilos-familia.md) (0.5) | Rama al día con `main` (`ba2016d`), assets de marca, fuentes, tokens, contraste, íconos |
| 1 | [`02-backend-bitacora.md`](02-backend-bitacora.md) | Minutos opcionales, `declaredBy`, relación del cuidador, CSV e indicadores |
| 2 | [`03-backend-consentimiento-gestor.md`](03-backend-consentimiento-gestor.md) | Consentimiento revocable, `/tablero`, `/auditoria`, datos extra de ficha y listado |
| 3 | [`04-web-logica.md`](04-web-logica.md) | Cola con `discard` y sin la carrera de reenvío; módulos puros de familia y gestor, con tests |
| 4 | [`05-familia.md`](05-familia.md) (4.1–4.5) + [`05b-familia.md`](05b-familia.md) (4.6–4.10) | Las ocho pantallas de familia (1–8) |
| 5 | [`06-gestor.md`](06-gestor.md) (5.1–5.3) + [`06b-gestor.md`](06b-gestor.md) (5.4–5.7) | Las seis pantallas del gestor (9–14) y el shell con barra lateral |
| 6 | [`07-cierre.md`](07-cierre.md) | `decisiones.md` D-023…D-027, documentación, limpieza de CSS heredado, verificación completa |

Orden de ejecución dentro de la fase 0: 0.1 → 0.2 → 0.3 → 0.4 → 0.5 (en `01b`) → 0.6.

Cada fase termina con `npm test` y `npm run typecheck` en verde en `backend/` y en `web/`. Commits
chicos, convencionales, en inglés, con la línea de atribución que pide el repo.

---

## Hallazgos de la revisión del handoff (léalos antes de empezar)

1. **El handoff se escribió sobre `ba2016d`** (merge del PR #1 en `main`). Esta rama va 4 commits
   atrás: le faltan `Cerebro.tsx`, `cerebro.ts`, `check-contrast.mjs`, la paleta coral y D-021/D-022.
   Por eso la tarea 1 es un fast-forward. Sin él, la columna "Antes" de la tabla de tokens no coincide
   con nada del repo.
2. **Dos cifras de contraste del README están mal.** Medidas con la fórmula WCAG:
   - `--morado #915EB1` sobre blanco da **4.73:1**, no 3.4:1. Técnicamente pasa AA. La regla "el
     morado es solo relleno" sigue siendo del diseño, pero no se puede hacer cumplir con un umbral de
     contraste. Por eso `check-contrast.mjs` agrega un **lint de uso**: falla si encuentra
     `color: var(--coral)` o `color: var(--morado)` en los CSS o en el TSX.
   - `--coral-ink` sobre `--coral` da **4.74:1**, no 6.1:1. Pasa AA de todas formas.
3. **El prototipo y el README a veces no coinciden.** Donde chocan manda el README, que es la
   especificación escrita:
   - botón de registro: 96px (el prototipo usa 72)
   - check de "registrado": `--ok` (el prototipo usa `#6FA88A`)
   - notas con consentimiento en la ficha: `--ink-mid` (el prototipo usa `#DCD2E8`, ilegible)
4. **Copy del prototipo que no se copia, por la regla 11 (contenido inventado):**
   - el titular y el cuerpo de la pantalla 2 ("Tu bebé reconoce tu voz…")
   - los nombres de cuento y canción ("Buenas noches a todos", "Duérmete mi niño")
   - las instrucciones de la pantalla 5

   Todo eso sale del API (`week.title`, `week.summary`, `activity.title`, `activity.instructions`), que
   hoy es placeholder.
5. **Copy del prototipo que sería falso delante de una familia, y se corrige:**
   - Pantalla 6: "Si lo desactivas, tus notas se quedan solo en tu teléfono". **Falso**: la regla 8 dice
     que las notas se guardan siempre y se filtran en lectura. Pasa a "el equipo deja de ver tus notas,
     también las que ya enviaste. Siguen guardadas para ti."
   - Pantalla 6, "Qué guardamos": omite el nombre y la fecha de nacimiento del bebé, que sí se guardan.
     Se agregan. Las tres filas llevan la marca "pendiente de revisión legal", igual que el
     consentimiento.
   - Pantalla 12: "Se genera con los datos del lunes a las 7 a.m." **No existe tal proceso.** Pasa a
     "Se arma con los datos al momento de abrirlo".
6. **La pantalla 1 no muestra los campos de inscripción** (nombre del bebé, fecha de nacimiento,
   celular), pero el registro por QR los necesita. Se mantienen con la piel nueva y se agrega el
   selector "¿Quién eres en casa?". El texto del consentimiento actual se conserva (es más completo que
   el del prototipo y está marcado como borrador).
7. **Nada del modelo de datos sabe de kits, familias sensibilizadas ni nombres de cuidadores.** Según lo
   decidido, las tarjetas de kit y sensibilizadas muestran su estado vacío. La columna "Kit" del
   listado pasa a "Semana". En la ficha se ven el rol y la relación declarada, no nombres.
8. **La pantalla "Exportar" no está en la barra lateral del diseño.** Se conserva como sexto ítem
   ("Exportar datos"), porque `bitacora.csv` es el archivo del evaluador y no puede perder su UI.
9. **Carrera en la cola que el diseño provoca.** El diseño pide registrar en un toque y completar los
   detalles después. Si los detalles llegan mientras se sincroniza el primer envío, hoy `flush` borra
   el ítem por `clientId` y **pierde la versión nueva**. La tarea 4.1 lo corrige: solo borra si el
   payload no cambió.

## Decisiones tomadas con el usuario (2026-09-14)

| Tema | Decisión |
|---|---|
| Tablero y reporte | Solo con los datos que ya existen. Kit y sensibilizadas muestran el estado vacío |
| Quién leyó | Campo **`declaredBy`** (`mama`/`papa`/`otra`), autodeclarado y opcional. `loggedBy` sigue saliendo del token (D-012 / arquitectura) |
| Minutos | **Opcionales** (`null` = no reportado). Los indicadores de minutos cuentan solo lo reportado y exponen `entradas_con_minutos` |
| Privacidad | Ítem `consentimiento` en la cola → Lambda de tracking. Registro `CONSENT#` como prueba. Siguen siendo siete Lambdas |

Decisiones por defecto que tomé yo (anótelas en D-023…D-027 y corríjalas si no convienen):

- **Fuentes:** Literata 300/400/500 + Atkinson Hyperlegible 400/700, autoalojadas, unos 98 KB. El
  título del reporte usa 500 en vez de 600, para no cargar un cuarto peso.
- **El primer toque guarda `declaredBy: null`.** El chip viene preseleccionado con la relación que el
  cuidador declaró al inscribirse, pero solo se guarda si toca "Guardar y volver". Así no se atribuye
  una lectura a nadie sin que lo diga.
- **Se pierde la fecha retroactiva.** El registro en un toque es "hoy". Se deja escrito en D-024.
- **El reporte es del lado del cliente.** "Descargar PDF" usa `window.print()` con CSS de impresión.
  "Enviar por correo" abre un `mailto:` sin destinatario. Así no hace falta SES ni un recurso nuevo.
- **Los PNG de marca se sirven reducidos a 2×** del tamaño en pantalla. Reducir no es recortar ni
  recolorear, y ahorra unos 700 KB de precache en cada celular. Los originales quedan en `docs/diseno/`.
- **El enlace a "Tus datos" va al pie de la pestaña Bitácora.** El diseño no dice dónde va.
- **El deep link sigue cayendo en la pantalla 2.** Además se acepta `?v=registrar` para abrir directo
  la pantalla 3 cuando se actualice la plantilla de WhatsApp. La plantilla no se toca aquí.

## Mapa de archivos

**Backend** (modificados salvo que diga *nuevo*):
`src/domain/log-entry.ts`, `src/domain/indicators.ts`,
`src/handlers/tracking/{logic,index}.ts`, `src/handlers/register/logic.ts`,
`src/handlers/family-ports.ts`, `src/handlers/admin/{logic,ports,index,export}.ts`,
`src/handlers/admin/dashboard.ts` (*nuevo*),
`src/adapters/{keys,family-store,admin-store}.ts`, `scripts/{generar-ejemplos,seed-demo}.ts`.
Tests: `test/domain/{log-entry,indicators}.test.ts`,
`test/handlers/{family-api,admin,export}.test.ts`, `test/handlers/admin-dashboard.test.ts` (*nuevo*),
`test/adapters/keys.test.ts`.

**Web — lógica pura** (*nuevos* salvo `sync-queue.ts`, `historial.ts`, `api.ts`):
`src/shared/sync-queue.ts`, `src/shared/useSync.ts`, `src/shared/api.ts`,
`src/app/{formato,registro-rapido,cola,privacidad}.ts`, `src/app/components/historial.ts`,
`src/gestor/{tiempo,familias-estado,auditoria,reporte,descargar}.ts`.
Tests: `test/{sync-queue,merge-historial}.test.ts`, `test/familia-formato.test.ts`,
`test/registro-rapido.test.ts`, `test/familia-cola-privacidad.test.ts`,
`test/gestor-logica.test.ts` (*nuevos* los cuatro últimos).

**Web — pantallas:**

- Familia:
  - modificados: `FamilyApp.tsx`, `Registro.tsx`, `Contenido.tsx`, `Bitacora.tsx`, `Mensajes.tsx`,
    `components/{Estado,HistorialBitacora,Cerebro}.tsx`
  - nuevos: `Actividad.tsx`, `Anteriores.tsx`, `RegistroRapido.tsx`, `Cola.tsx`, `Privacidad.tsx`,
    `useContenido.ts`, `components/{Marcas,ActividadesLista,Reproductor}.tsx`
  - se borra: `components/RegistroForm.tsx`
- Gestor:
  - modificados: `ManagerApp.tsx`, `Login.tsx`, `Familias.tsx`, `Bandeja.tsx`, `Exportar.tsx`, `api.ts`,
    `gestor.css`
  - nuevos: `Cabecera.tsx`, `Participacion.tsx`, `Tablero.tsx`, `Reporte.tsx`, `Auditoria.tsx`,
    `Ficha.tsx`

**Web — assets y config:**

- nuevos: `public/marca/{lockup-horizontal,mishashos}.png`,
  `src/shared/fonts/*.woff2` + `LICENCIAS.md`, `scripts/redimensionar-marca.py`
- modificados: `scripts/check-contrast.mjs`, `scripts/generate-icons.py`, `index.html`,
  `vite.config.ts`, `src/shared/styles.css`

**Docs:** `docs/decisiones.md`, `CLAUDE.md`, `docs/indicadores.md`, `docs/tratamiento-datos.md`,
`docs/arquitectura.md`, `docs/runbook.md`. El bundle del handoff pasa a `docs/diseno/handoff-2026-09/`.
