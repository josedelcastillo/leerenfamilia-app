# Handoff: Nacidos para Leer Perú — re-vestido visual completo

Para: Claude Code, sobre `josedelcastillo/leerenfamilia-app@main` (leído en el commit `ba2016d2d87f`).

## Overview

La app ya existe y funciona: PWA offline-first en React 19 + Vite, dos superficies (`web/src/app/` familia, `web/src/gestor/` gestor), estilos en CSS plano con custom properties. Este paquete **no cambia comportamiento, datos ni arquitectura**: cambia la piel y, en tres lugares concretos, la estructura de una pantalla. Todo lo que toca es `web/src/**` (CSS, JSX de presentación) más tres assets nuevos.

La identidad pasa a ser la de **Leer en Familia / Nacidos para Leer**: los mishashos ilustrados, el coral del logotipo, el morado de los libros, fondo blanco. Tipografía Literata para contenido de lectura, Atkinson Hyperlegible para UI.

## About the design files

Los archivos `.dc.html` de este bundle son **referencias de diseño hechas en HTML** — prototipos que muestran aspecto y comportamiento previstos, no código para copiar. La tarea es **recrear estos diseños en el entorno que ya tiene el repo**: React 19 + CSS plano con custom properties en `web/src/shared/styles.css` y `web/src/gestor/gestor.css`. No introducir Tailwind, CSS-in-JS ni una librería de componentes: el repo tiene cuatro dependencias en la web y la regla 13 de `CLAUDE.md` pide justificar cada una.

Los estilos inline de los prototipos son un artefacto del formato de prototipado. En el repo van como **tokens y clases** en los dos CSS existentes.

## Fidelity

**Alta fidelidad.** Colores, tipografía, escala y copy son finales. Reprodúzcalos con exactitud usando las clases del repo. Lo único deliberadamente abierto: la ilustración del cerebro (`Cerebro.tsx`) mantiene su geometría actual, solo cambian sus colores.

---

## Design tokens

Reemplazan el bloque `:root` de `web/src/shared/styles.css`. **La regla D-022 se mantiene y se extiende**: ni el coral ni el morado saturados tocan texto; existen en versión profunda para tipografía y controles.

| Token | Antes | Ahora | Contraste sobre blanco | Uso |
|---|---|---|---|---|
| `--coral` | `#e85c4a` | `#DA5F4B` | 3.5:1 | **Solo relleno.** Botón primario, ilustración, marca de semana actual. Nunca bajo texto |
| `--coral-ink` | — | `#2B1409` | 6.1:1 sobre `--coral` | **Nuevo.** La tinta que va encima del botón coral |
| `--coral-soft` | `#fdeeea` | `#FBEDEA` | — | Superficie teñida |
| `--brand` | `#a83a28` | `#A8402C` | 6.4:1 | Texto y controles de marca. Único coral admitido bajo tipografía |
| `--brand-alt` | — | `#C24A38` | 5.0:1 | **Nuevo.** Cifras grandes y texto ≥19px sobre blanco |
| `--morado` | — | `#915EB1` | 3.4:1 | **Nuevo. Solo relleno.** Barras, progreso, filete de hilo, toggles |
| `--accent` | `#6e4e9b` | `#6E4E9B` | 6.5:1 | Sin cambio. Texto morado, foco visible |
| `--accent-soft` | `#f1ecf7` | `#F2ECF7` | — | Etiquetas de tipo de actividad, respuestas del equipo |
| `--morado-text` | — | `#7B4C99` | 4.9:1 | **Nuevo.** Morado para etiquetas ≥14px en negrita |
| `--ink` | `#2e2320` | `#241A33` | 14.6:1 | Tinta principal, virada de marrón cálido a morado profundo |
| `--ink-soft` | `#6b5750` | `#6B6178` | 6.0:1 | Texto secundario, metadatos |
| `--ink-mid` | — | `#3E3552` | 9.4:1 | **Nuevo.** Prosa larga del reporte y de la consola |
| `--paper` | `#fffbf7` | `#FFFFFF` | — | **Cambia:** fondo blanco, no crema. El crema tiraba a la estética por defecto y peleaba con los PNG |
| `--surface` | `#ffffff` | `#F7F3FA` | — | **Se invierte de rol:** la superficie es lila muy claro sobre papel blanco |
| `--line` | `#e6dcd6` | `#E6DCEF` | — | Filetes y bordes |
| `--line-strong` | — | `#DCD2E8` | — | **Nuevo.** Borde de controles e inputs (2px) |
| `--ok` | `#1c6b3f` | `#3F7A5E` | 4.9:1 | Sincronizado, respondido |
| `--warn` | `#8a5a00` | `#6B4A12` | 8.2:1 | Aviso de contenido placeholder |
| `--alert` | — | `#B5503C` | 5.0:1 | **Nuevo.** Sin responder, sin conexión, pendiente. Nunca decorativo |

Gestor (además de los anteriores):

| Token | Valor | Uso |
|---|---|---|
| `--g-paper` | `#F6F4F9` | Fondo de la consola |
| `--g-surface` | `#FFFFFF` | Tarjetas y tablas |
| `--g-line` | `#E6E0EC` | Filetes de tabla |
| `--g-line-strong` | `#DED6E6` | Bordes de contenedor y de control |
| `--g-head` | `#FAF8FC` | Fila de encabezado de tabla |
| `--g-ink-soft` | `#554A66` | Texto secundario denso (7.0:1) |
| `--g-ink-faint` | `#726A7F` | Metadatos y notas al pie (5.2:1) |
| `--g-dark` | `#241A33` | Botón secundario oscuro, chip activo |
| `--g-purple` | `#7B4C99` | Botón primario de la consola con texto blanco (6.4:1) |

Actualice `web/scripts/check-contrast.mjs` con los pares nuevos: `--coral-ink`/`--coral`, `--brand-alt`/`--paper`, `--morado-text`/`--paper`, `--g-purple`/`#FFFFFF`, `--alert`/`--paper`, `--ok`/`--paper`. **El test debe seguir fallando si alguien pone `--coral` o `--morado` bajo texto.**

### Tipografía

Dos familias, servidas locales como WOFF2 con `font-display: swap`; **no desde Google Fonts** (la regla del repo es no bloquear el arranque en un celular barato, y un CDN externo añade un DNS más).

| Rol | Familia | Tamaño | Peso / interlineado |
|---|---|---|---|
| Contenido de lectura, títulos de actividad, notas y prosa del reporte | **Literata** | 17–31px | 400–500, 1.3 títulos / 1.65 cuerpo |
| UI, etiquetas, controles, toda la consola | **Atkinson Hyperlegible** | 12–21px | 400 / 700 |
| Cifras de indicadores | Atkinson Hyperlegible | 30–32px | 700, tabular-nums |
| Cifras destacadas de Familia | Literata | 52px | 300, `letter-spacing: -0.02em` |

Piso de tamaño en Familia: **cuerpo 18–19px**, metadatos 14px, nunca menos. Consola: base 15px, metadatos 12px. Medida de línea: 33–34 caracteres en móvil, ≤70 en escritorio.

Si añadir dos familias de fuentes es inaceptable por peso, la degradación correcta es: Literata solo para el contenido del programa y `system-ui` para todo lo demás. **No sustituya Literata por una serif del sistema**: el argumento de su elección es la lectura prolongada en pantalla.

### Escala y geometría

- Espaciado: 4 / 8 / 10 / 14 / 20 / 22 / 28 / 40px. `--gap: 1rem` se mantiene.
- Radios: `--radius: 12px` (tarjetas, inputs), 14px (chips y controles de Familia), 16–20px (botón primario), 40px solo para el marco de teléfono de los mockups, 6–10px en la consola. Las píldoras de estado siguen a 12–20px.
- Objetivo táctil: `--touch: 56px` (sube de 3rem/48px). Sin excepciones en Familia. En la consola, 30–34px.
- Sombras: **ninguna en la UI.** Jerarquía por filete y por superficie. La única sombra del prototipo es el marco del teléfono, que no existe en la app.
- Foco: `outline: 3px solid var(--accent); outline-offset: 2px`. Sin cambio.

---

## Pantallas

Numeración del brief. Las de prioridad 1 y 2 están todas en el prototipo `Nacidos para Leer claro.dc.html`, en secciones etiquetadas.

### Familia

**1 — Activación por deep link** (hoy `app/Registro.tsx`)
Logotipo `lockup-horizontal.png` a 168px de ancho arriba a la izquierda. Titular Literata 31px/1.28 (`Ocho semanas leyendo con tu bebé, desde hoy.`), párrafo Literata 19px/1.62 en `--ink` al 72%. Selector "¿Quién eres en casa?" con tres filas de 56px: `Mamá`, `Papá`, `Otra persona que cuida` — fondo `--surface`, borde 1.5px `--line-strong`, y en la seleccionada borde `--coral` 1.5px. Consentimiento como fila de 26px con casilla coral marcada y texto 15px/1.5. Botón primario 60px, `--coral` con texto `--coral-ink` 19px/700, radio 16px, en el tercio inferior. **Halo:** wash radial `rgba(145,94,177,0.22)` desde el borde superior, 540×400px, centrado, `pointer-events: none`.

**2 — Inicio semanal** (hoy `app/Contenido.tsx`)
Indicador de ocho marcas de 22×3px arriba a la derecha: llenas en `--coral` hasta la semana actual, el resto `--line-strong`. `Semana N de 8` a la izquierda, 15px `--ink-soft`. Titular Literata 27px/1.34. Cuerpo 19px/1.68. Bloque "Esta semana, en el kit" con cuento y canción, y enlace `Ver la actividad completa` en `--brand`. Botón `Registrar lectura` 64px al fondo. **Cambio estructural:** hoy la pantalla lista los acordeones de las ocho semanas; en el diseño la semana actual es la pantalla y las anteriores viven detrás de un enlace. Las cuatro actividades de la semana se muestran como lista de 56px con su tipo a la derecha (ver pantalla 5).

**3 — Registro de actividad** (hoy `app/components/RegistroForm.tsx`)
Dos estados. Sin registrar: titular `¿Leyeron hoy?` Literata 30px, subtítulo, y un único botón de **96px** de alto, radio 20px, `--coral` con `box-shadow: 0 10px 28px rgba(218,95,75,0.32)`. Registrado: check de 34px en `--ok` con tinta `--coral-ink`, `Lectura registrada` 19px/700, banda de estado, filete, y **después** los opcionales: chips de quién (Mamá/Papá/Otra) y de cuánto (2/5/10+ min) en filas de 56px, más textarea de 84px con Literata 17px. Cierre con `Guardar y volver` y `Listo, nada más`. **La regla es que nada opcional se pide antes de confirmar** — un toque desde el deep link deja la lectura registrada.

**4 — Progreso acumulado** (hoy `app/components/Cerebro.tsx` + `HistorialBitacora.tsx`)
Cifra Literata 52px en `--brand-alt`, leyenda `lecturas registradas en N semanas`, ilustración `mishashos.png` a 132px arriba a la derecha, y bitácora como lista de filas de 15px con punto de 8px en `--coral` con opacidad decreciente hacia el pasado. Cierre: `Todo lo que registras se queda aquí. Nada se borra ni retrocede.` **Sin barra de progreso, sin meta, sin porcentaje, sin racha.** El cerebro que crece se mantiene: recoloree sus ramas a `--brand` (lectura), `--accent` (canción), `#2F7A55` (juego), `#8A5A12` (conversación) y la silueta a `#F7F3FA` con trazo `#E6DCEF`.

**5 — Detalle de actividad con audio**
Etiqueta de tipo en píldora `--accent-soft` con texto `--accent` 13px/700. Título Literata 28px. Reproductor: círculo de 56px `--coral` con tinta `--coral-ink`, barra de 6px (`--line` de fondo, `--morado` de avance) y tiempos 13px. Aviso de contenido placeholder en `#FFF6E6` con borde `#ECD9AE` y texto `--warn` — **conserve este aviso: la regla 11 del repo dice que todo el contenido es placeholder.** Abajo, las otras actividades de la semana en filas de 56px. Botón `Ya la cantamos` (etiqueta según el tipo).

**6 — Privacidad y datos**
Tres filas con filete: qué guardamos / quién lo ve / hasta cuándo, en lenguaje llano. Toggle de consentimiento de notas: pista de 52×30px en `--morado` con perilla blanca de 24px, más explicación de la consecuencia real de apagarlo. Botón secundario `Pedir que borren mis datos`. **Hoy ese endpoint no existe** (`CLAUDE.md`, estado): deje el botón visible enviando un `feedback` de tipo `pedido` con texto fijo, y anótelo en `docs/decisiones.md` como solución transitoria.

**7 — Cola pendiente sin conexión** (hoy `app/components/Estado.tsx`)
Punto de 9px `--alert` + `Sin conexión` 15px. Titular con el número real de pendientes. Lista de la cola con punto `--morado`, tipo y minutos, y hora en 14px. Cierre: `Puedes seguir registrando sin señal. La cola no se pierde si cierras la app.` **Los banners actuales pierden los emoji** (📵 ⏳): el estado se comunica con color, palabra y posición.

**8 — Mensajes a la ONG** (hoy `app/Mensajes.tsx`)
Cuatro chips de tipo en filas de 52px, el activo en `--g-dark` con texto blanco. Textarea de 104px. Hilo: tarjeta con píldora de tipo, estado en `--ok`, mensaje en Literata 17px y la respuesta del equipo en bloque `--surface` con filete izquierdo de 3px `--morado`.

### Gestor

**9 — Tablero del piloto — PANTALLA NUEVA**
No existe hoy. Barra lateral de 220px (blanco, filete derecho) con el lockup a 156px, `Leer en Familia` 11px/700 en `--g-purple` encima, y cinco ítems de 11px de padding; el activo lleva filete izquierdo de 3px `--coral` y fondo `#F6F0FA`. Cabecera de 60px con título 17px/700 y botón `Generar reporte`. Cuerpo: cuatro tarjetas de indicador (etiqueta 13px, cifra Literata 32px, nota 12px; la tarjeta destacada lleva `box-shadow: inset 3px 0 0 var(--coral)`), franja de participación por semana (barras `--morado`, la semana en curso `--coral`, semanas futuras `--g-line`), y dos tarjetas: `Requiere acción del equipo` y `Consentimiento de notas` con barra de 8px en `--ok`. Todo entra en 1366×768 sin scroll horizontal.

**10 — Listado de familias** (hoy `gestor/Familias.tsx`, mitad izquierda)
Tabla de 5 columnas (`1.5fr 0.9fr 0.7fr 1fr 0.9fr`), filas de 46px, encabezado 12px/700 en `--g-head` **sin mayúsculas forzadas** (hoy `text-transform: uppercase`; quítelo). Estado como punto de 7px + palabra: `--ok` activa, `#B08A3E`→`--alert` en pausa, `--g-ink-faint` sin activar. La fila seleccionada va en `#F6F0FA`. Toolbar con input de 38px y dos filtros, más `Exportar CSV` en `--g-dark`.

**11 — Ficha de familia** (hoy `gestor/Familias.tsx`, `Detalle`)
Cabecera con nombre 16px/700 y `Ingresó en semana N`. Rejilla de 2 columnas con bebé, kit, cuidadores y registros. Tabla de registros recientes. **Bloque de notas:** con consentimiento, las notas en Literata 14px/1.6 y la línea `La familia puede revocar este permiso en cualquier momento`; sin consentimiento, caja `--g-paper` con borde discontinuo `--g-line-strong`, guion en cuadro de 26px y el texto `Esta familia escribió N notas y no autorizó que el equipo las lea. No se muestran ni se exportan.` + `Solo la familia puede cambiarlo, desde su pantalla de privacidad.` El estado va en píldora: `Consentimiento activo` en `--ok`, `Sin consentimiento` en `--alert`. **La regla 8 del repo no cambia: el filtro es en lectura.**

**12 — Reporte semanal de implementación — PANTALLA NUEVA**
Hoja de 794px (A4 a 96dpi) sobre fondo `#E9EBEF`, con columna lateral de acciones. Cabecera con filete inferior de 2px `--g-purple`. Prosa en Literata 15px/1.65 en `--ink-mid`. Tira de cuatro indicadores en rejilla con filetes de 1px. Gráfico de barras `--morado` con la semana en curso en `--coral`. Observaciones de campo como tres líneas con viñeta. Pie: `Generado el <fecha>. Incluye solo datos agregados; no contiene notas de familias sin consentimiento.` La columna lateral: `Descargar PDF`, `Enviar por correo al hospital`, `Copiar resumen como texto`, y la lista `Qué incluye` con las notas desmarcadas.

**13 — Bandeja unificada** (hoy `gestor/Bandeja.tsx`)
Filtros como chips de 30px, el activo en `--g-dark` con el conteo dentro. Tarjetas con filete izquierdo de 3px `--coral` cuando están sin responder. Canal y tipo en píldoras; `Sin responder, N días` en `--alert`. Texto en Literata 15px/1.6. Botón `Responder` en `--g-purple` con texto blanco, `Cerrar` secundario. Nota al pie sobre respuestas no editables.

**14 — Auditoría de accesos** (hoy solo un CSV en `gestor/Exportar.tsx`)
Tabla de 4 columnas (`130px 1fr 1fr 96px`), filas de 10px de padding, 13px. Las acciones de exportación se marcan en `--alert`. Encabezado con `Exportar CSV` en `--g-purple`. Texto introductorio explicando que el registro no se puede desactivar.

---

## Interacciones y estados

- **Registro en un toque:** deep link → pantalla 3 → `Registrar lectura`. El formulario opcional aparece después de confirmar, nunca antes. Sin señal, `enqueue` + UI optimista tal como está hoy.
- **Deshacer:** `Listo, nada más` cierra; `Deshacer este registro` elimina el ítem de la cola si aún no se sincronizó.
- **Transiciones:** 160ms `ease-out` en cambios de estado de botón y chip. Nada más se anima, salvo el cerebro, que conserva su cascada actual. `prefers-reduced-motion` ya está respetado en el CSS; manténgalo.
- **Estados vacíos como contenido:** progreso sin registros → `Aún no registras lecturas. La primera puede ser hoy, aunque dure dos minutos.` + botón `Registrar la primera`. Tablero en semana 0 → cada tarjeta dice qué falta para que aparezca el dato (`Las semanas 4 a 8 aparecerán cuando el hospital registre las entregas de kit correspondientes.`).
- **Errores sin disculpa:** `Guardado en tu teléfono. Se envía solo cuando haya señal.` Nunca "Lo sentimos", nunca un error crudo de red delante de una familia.
- **Ninguna pantalla de Familia comunica déficit.** Sin rachas, sin contadores que bajen, sin comparaciones, sin insignias.

## Copy — voz

Segunda persona, trato de "tú", sin diminutivos, sin lenguaje de crianza experta. El copy exacto de cada pantalla está en el prototipo; respételo literalmente. Cambios de vocabulario respecto al código actual:

- "clínica" → **"hospital"** o "establecimiento de salud" en toda la consola y el reporte. El programa entra a hospitales públicos, no solo a una clínica privada.
- Tercera opción de cuidador: "Otro cuidador" → **"Otra persona que cuida"** (abuelas, tías, quien esté a cargo).
- La organización matriz aparece siempre: `Leer en Familia` sobre `Nacidos para Leer` en la consola, y el lockup en Familia.

## Assets

En `assets/` de este bundle, PNG con transparencia, recortados al contenido. Van a `web/public/marca/`.

| Archivo | Tamaño | Uso |
|---|---|---|
| `lockup-horizontal.png` | 1200×588 | Activación de Familia (168px) y barra lateral del Gestor (156px) |
| `lockup-vertical.png` | 900×566 | Reserva para pantalla de carga / splash de la PWA |
| `lockup-compacto.png` | 900×1636 | Versión apilada, para formatos verticales |
| `mishashos.png` | 1400×638 | Ilustración de progreso acumulado. Lettering eliminado del arte |

Son ilustraciones de la ONG. **No las recolor**ee, no las recorte más, no las rote. Los íconos de la PWA (`web/public/icon-*.png`) hay que regenerarlos desde el lockup con `web/scripts/generate-icons.py`; hoy son placeholder.

## Lo que hay que decidir, no implementar a ciegas

Cada punto necesita una entrada en `docs/decisiones.md` según la regla del repo. **Si algo de esto no se puede resolver, déjelo escrito como tarea y no lo adivine.**

1. **La barra de tabs se queda.** El brief pedía cero tabs; el código tiene tres (Esta semana / Bitácora / Mensajes) y quitarlas dejaría Mensajes huérfano. Son un solo nivel, están en el tercio inferior y cada pestaña conserva una acción por pantalla. Reestílelas: 56px de alto, sin emoji, activa en `--brand` con filete superior de 3px. **Es el único punto donde el diseño revisa su propia regla de §4.**
2. **Pantallas 9 y 12 no tienen backend.** El tablero y el reporte semanal necesitan un endpoint agregado; `domain/indicators.ts` y `resumen.csv` ya calculan casi todo. La regla 2 del repo limita a siete Lambdas: probablemente sea un `GET /api/gestor/tablero` dentro del handler de gestor existente, no una octava función. Decidir antes de escribir.
3. **`--paper` pasa de crema a blanco.** Afecta el `theme-color` de `web/index.html` (`#fffbf7` → `#ffffff`) y los íconos de la PWA.
4. **Dos webfonts nuevas** frente a la decisión actual de no usar ninguna. Peso estimado: ~90KB en WOFF2 con subset latino. Si se rechaza, aplique la degradación descrita en Tipografía.
5. **Modo oscuro:** queda escrito en `Nacidos para Leer.dc.html` (versión noche, misma estructura, fondo `#1B1229`). No lo implemente todavía; si más adelante se quiere, sale de tokens, no de pantallas nuevas.
6. **Endpoint de supresión de datos** (pantalla 6): sigue siendo una obligación legal pendiente.

## Files

| Archivo | Qué contiene |
|---|---|
| `Nacidos para Leer claro.dc.html` | **La referencia.** Pantallas 1–14 en modo claro, con marca. Familia 390×844, Gestor 1366 |
| `Nacidos para Leer.dc.html` | Versión oscura de las pantallas de prioridad 1. Solo referencia futura |
| `assets/*.png` | Los cuatro assets de marca |

Los `.dc.html` se abren en cualquier navegador. La pantalla 3 es interactiva: el botón `Registrar lectura` muestra el estado registrado.
