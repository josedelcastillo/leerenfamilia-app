# Fase 6 — Cierre: decisiones, documentación, limpieza y verificación

Ver [`00-indice.md`](00-indice.md). Documentación en español (Perú); mensajes de commit en inglés.

---

### Tarea 6.1: `docs/decisiones.md`, D-023 a D-027

**Files:**
- Modify: `docs/decisiones.md` (agregar al final, con el mismo formato que D-021/D-022)

- [ ] **Step 1: Agregar las cinco entradas**

Escriba cada una con **Fecha: 2026-09-14 · Estado: vigente**, y con contexto, decisión, alternativas
descartadas y consecuencias. El contenido mínimo de cada una:

**D-023 — Re-vestido "Nacidos para Leer": tokens nuevos, dos fuentes autoalojadas, las pestañas se quedan**
- Se reemplaza el `:root` de D-022: papel blanco, superficie lila, `--coral #DA5F4B` y `--morado #915EB1`
  como rellenos, y versiones profundas para texto (`--brand`, `--brand-alt`, `--accent`, `--morado-text`).
- **Corrección a la cifra del handoff:** `--morado` mide 4.73:1 sobre blanco, no 3.4:1. Que no toque texto
  es una regla de diseño, no de contraste; por eso `check-contrast.mjs` agrega un lint de uso además de los
  umbrales.
- Literata (300/400/500) y Atkinson Hyperlegible (400/700), unos 98 KB WOFF2 autoalojados y precacheados.
  Revierte la decisión de "sin webfont" de D-022 por lectura prolongada. Degradación prevista si pesa
  demasiado: Literata solo para contenido y `system-ui` para el resto, **nunca una serif del sistema**.
- Las tres pestañas se quedan (el brief pedía cero; sin ellas Mensajes queda huérfano): 56px, sin emoji.
- La activación conserva los campos de inscripción que el prototipo omite (el backend los necesita).
- Los PNG de marca se sirven reducidos a 2× del tamaño en pantalla; los originales quedan en `docs/diseno/`.
- Copy del prototipo que no se copió: el contenido del programa (regla 11) y dos frases falsas de la
  pantalla 6 (ver el índice del plan, hallazgo 5).

**D-024 — Registro en un toque: minutos opcionales y `declaredBy` autodeclarado**
- `minutes` admite `null` (no reportado). L2 suma solo lo reportado; `entradas_con_minutos` dice cuántas.
  No hay valor por defecto: inventar una duración corrompería L2 sin que nadie lo notara.
- `declaredBy` (`mama`/`papa`/`otra`) es lo que dice la familia; `loggedBy` sigue saliendo del token. Son
  preguntas distintas: de quién es el teléfono y quién leyó.
- El primer toque guarda `declaredBy: null`; el chip viene preseleccionado con la relación de la
  activación, pero solo se guarda si la familia toca "Guardar y volver".
- Los detalles reescriben la misma entrada (mismo `clientId` y fecha, luego la misma clave de DynamoDB).
  La cola solo borra un ítem enviado si su payload no cambió durante el envío.
- "Deshacer" solo mientras el ítem no salió del teléfono. Lo enviado no se borra: "nada se borra ni
  retrocede".
- Se pierde la fecha retroactiva del formulario anterior. Si el piloto la necesita, vuelve como enlace
  "¿fue otro día?" en la pantalla 3.

**D-025 — El consentimiento de notas se cambia desde la PWA, sin Lambda nueva**
- Ítem `consentimiento` en la misma cola offline → Lambda de tracking → escribe
  `CONSENT#<ts>#<clientId>` (canal `pwa`, versión, quién) y luego cambia `freeTextNotesAuthorized` en `META`.
- El cambio más reciente gana por su hora (`notesConsentAt` en META), no por orden de llegada: la cola
  offline no preserva el orden y dos teléfonos pueden enviar cambios cruzados. Un cambio viejo deja su
  registro de prueba pero no toca el permiso. La hora del dispositivo se recorta a la de recepción.
- En empate de hora gana la revocación. Un teléfono con el reloj muy atrasado envía cambios más viejos
  que la inscripción: quedan como prueba pero no cambian el permiso; la pantalla de privacidad muestra
  el valor del servidor después de sincronizar, así que la familia lo ve. La clave del registro de
  prueba usa la hora del dispositivo, así un reintento no duplica la prueba.
- Revocar oculta también las notas ya enviadas, sin código extra: el filtro es en lectura (regla 8).
- El texto de la pantalla 6 es borrador, pendiente de revisión legal, como el del consentimiento.

**D-026 — Tablero, reporte y auditoría con los datos que existen**
- `GET /api/gestor/tablero` y `GET /api/gestor/auditoria` dentro del handler de gestor (regla 2).
- La participación por semana usa `cohortIndicators`, la misma definición de `resumen.csv`.
- Kits y familias sensibilizadas **no están en el modelo**: sus tarjetas lo dicen. Agregarlos es alcance
  aparte (entidad nueva y carga por el gestor).
- El reporte se arma en el navegador: PDF con `window.print()`, correo con `mailto:` sin destinatario
  (no hay SES ni dirección del hospital configurada) y copia al portapapeles. Las observaciones no se
  guardan.
- "Exportar datos" se conserva como sexto ítem de la barra lateral.
- La auditoría en pantalla muestra dos meses; el registro completo sigue en `auditoria.csv` (TTL 365 días).

**D-027 — El pedido de supresión, transitorio, va por la bandeja**
- El botón "Pedir que borren mis datos" encola un `feedback` de tipo `pedido` con texto fijo, tras una
  confirmación en dos pasos. Un gestor lo atiende a mano con el procedimiento del runbook.
- **Sigue siendo una obligación legal pendiente:** el endpoint de supresión no existe. Esto solo evita que
  la familia no tenga dónde pedirlo.

- [ ] **Step 2: Commit**

```bash
git add docs/decisiones.md
git commit -m "docs: D-023 to D-027 — redesign, one-tap logging, revocable consent, dashboard, erasure request

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 6.2: Borrar el CSS heredado

**Files:**
- Modify: `web/src/shared/styles.css`

- [ ] **Step 1: Confirmar que nadie usa esas clases**

```bash
cd web
for c in muted small topbar marca banner card entry tag thread-reply table-wrap pill toolbar row-link split consent-warning login; do
  printf '%s: ' "$c"; grep -rlE "className=[\"{][^\"}]*\\b$c\\b" src | tr '\n' ' '; echo
done
```
Expected: ninguna clase con archivos al lado. Si aparece alguna, reemplácela en ese componente por la clase
nueva que corresponda antes de seguir.

- [ ] **Step 2: Borrar el bloque** que va desde `/* --- heredado: se borra en la tarea 6.2` hasta la regla
  `label { display: block; }` inclusive. El bloque `@media (prefers-reduced-motion)` del final se queda.

- [ ] **Step 3: Verificar y commit**

```bash
npm test && npm run build
git add src/shared/styles.css
git commit -m "chore(web): drop the stylesheet rules the redesign replaced

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 6.3: Documentación

**Files:**
- Modify: `CLAUDE.md`, `docs/indicadores.md`, `docs/tratamiento-datos.md`, `docs/arquitectura.md`,
  `docs/runbook.md`

- [ ] **Step 1: `CLAUDE.md`**
  - Regla 10, que pase a decir: *"`--coral` y `--morado` son rellenos: no tocan ningún texto. Para texto y
    controles van `--brand`, `--brand-alt`, `--accent` y `--morado-text` (D-022, D-023). `npm test` lo
    verifica midiendo contraste y buscando su uso como `color:`."*
  - Regla 13: aclarar que las fuentes son archivos del repo, no dependencias.
  - Sección Estado: agregar que la supresión tiene una solución transitoria por la bandeja (D-027) y que
    kits y sensibilizadas no están en el modelo (D-026).

- [ ] **Step 2: `docs/indicadores.md`**
  - L2: *"Suma de minutos **reportados**… Las entradas en un toque no reportan duración; ver
    `entradas_con_minutos` (D-024)."*
  - Agregar **L4 — Quién hizo la actividad, según la familia**: conteo por `declarado_por`
    (`mama`/`papa`/`otra`/`sin_dato`). Una nota que lo distinga de L3, que viene del token.
  - Agregar una sección "Tablero del gestor" que liste qué indicador alimenta cada tarjeta (D-026).

- [ ] **Step 3: `docs/tratamiento-datos.md`**
  - Tabla de datos: agregar la relación declarada del cuidador y `declaredBy` de cada entrada, ambos
    opcionales y autodeclarados.
  - Consentimiento: el cambio desde la PWA, con su registro de prueba, y que revocar es retroactivo para el
    equipo (D-025).
  - Supresión: la solución transitoria (D-027), sin quitar la obligación pendiente.

- [ ] **Step 4: `docs/arquitectura.md`**
  - Rutas del handler de gestor: `/tablero` y `/auditoria`.
  - Tipos de ítem de `/api/seguimiento`: agregar `consentimiento`.
  - Entidad `CONSENT#<ts>#<clientId>`, al lado de la de la inscripción.
  - Tabla de verificación: actualizar los conteos de tests de backend y web con lo que den en 6.4.

- [ ] **Step 5: `docs/runbook.md`**
  - Pendientes antes de operar: el logo **en vector** para los íconos sigue abierto. Los íconos actuales
    salen del lockup PNG y a 32px no se leen.
  - Operación: cómo atender un pedido de supresión que llega por la bandeja (texto fijo de D-027).
  - Diagnóstico: el tablero en blanco con error 404 significa un stack sin el deploy de esta rama.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs
git commit -m "docs: indicators, data handling, architecture and runbook after the redesign

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 6.4: Verificación completa, revisión y deploy

- [ ] **Step 1: Todo lo que corre sin red**

```bash
cd backend && npm install && npm test && npm run typecheck && cd ..
cd web && npm install && npm test && npm run typecheck && npm run build && cd ..
sam validate --template infra/template.yaml --lint
sam build --template infra/template.yaml
node scripts/verificar-build.mjs
```
Expected: todo en verde; siete artefactos; `check-contrast` dentro de `npm test`.

- [ ] **Step 2: Instalabilidad y offline**

```bash
cd web && npx vite preview --port 4173 &
CHROMIUM_PATH=/ruta/a/chromium node web/scripts/check-installable.mjs http://localhost:4173/app
```

- [ ] **Step 3: Recorrido visual final** contra `docs/diseno/handoff-2026-09/Nacidos para Leer claro.dc.html`.
  Familia a 390×844 (tabla de la tarea 4.10) y gestor a 1366×768 (pantallas 9 a 14), sin scroll
  horizontal, con foco visible al tabular, y con `prefers-reduced-motion`.

- [ ] **Step 4: Revisión de código.** Use la skill `superpowers:requesting-code-review` sobre el diff contra
  `origin/main`. Pídale que mire con atención tres cosas: la regla 8 (ningún camino nuevo expone notas sin
  consentimiento), la carrera de la cola (tarea 3.1) y que `domain/` siga puro.

- [ ] **Step 5: Deploy, solo con confirmación del usuario.** Este plan no despliega por su cuenta. Cuando el
  usuario lo pida:

```bash
sam deploy --template-file .aws-sam/build/template.yaml --config-file "$PWD/infra/samconfig.toml"
```
Después:
- suba la web con el procedimiento del runbook
- recargue los datos de demo con `backend/scripts/seed-demo.ts`, si hace falta
- abra `/gestor`, pase por el tablero y la auditoría, y verifique que no den 404
