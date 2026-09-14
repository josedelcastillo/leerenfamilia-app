# Fase 0 — Base: rama al día, marca, fuentes, contraste, íconos

Ver el índice en [`00-indice.md`](00-indice.md). Los tokens y el CSS de familia están en
[`01b-estilos-familia.md`](01b-estilos-familia.md) (tarea 0.5), que se ejecuta entre la 0.4 y la 0.6.

---

### Tarea 0.1: Poner la rama al día con `main` y guardar el handoff

**Files:**
- Move: `design_handoff_nacidos_para_leer/` → `docs/diseno/handoff-2026-09/`

- [ ] **Step 1: Fast-forward a `origin/main`**

```bash
git fetch origin
git merge --ff-only origin/main
git log --oneline -1
```
Expected: el primer commit es `ba2016d Merge pull request #1…` o uno posterior. Si `--ff-only` falla,
**pare y avise**: la rama divergió de `main`, y el merge no se resuelve dentro de este plan.

- [ ] **Step 2: Verificar que llegó lo que el handoff da por existente**

```bash
ls web/src/app/components/Cerebro.tsx web/src/app/components/cerebro.ts web/scripts/check-contrast.mjs web/test/cerebro.test.ts
grep -n "^## D-022" docs/decisiones.md
cd web && npm install && npm test && cd ..
cd backend && npm install && npm test && cd ..
```
Expected: los cuatro archivos existen, D-022 aparece, y los dos `npm test` pasan (web unos 45 tests, más el
chequeo de contraste; backend unos 389).

- [ ] **Step 3: Mover el bundle a `docs/`**

```bash
mkdir -p docs/diseno
mv design_handoff_nacidos_para_leer docs/diseno/handoff-2026-09
git add docs/diseno/handoff-2026-09
git commit -m "docs: keep the Claude Design handoff as the visual reference

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 0.2: Assets de marca, reducidos a 2×

**Files:**
- Create: `web/scripts/redimensionar-marca.py`
- Create: `web/public/marca/lockup-horizontal.png`, `web/public/marca/mishashos.png`

Solo se envían los dos PNG que la app muestra. `lockup-vertical` y `lockup-compacto` quedan como fuente
en `docs/diseno/`: el diseño los reserva para una splash que no se construye ahora.

- [ ] **Step 1: Escribir el script**

```python
"""
Ships the Leer en Familia brand artwork at twice its largest on-screen size.

The originals in docs/diseno/handoff-2026-09/assets are 1200-1400px wide and 180-220 KB each; the app
shows them at 168px and 132px. The service worker precaches every PNG, so shipping the originals would
put ~700 KB on every family's phone for nothing. Resizing is not cropping or recolouring, which the
handoff forbids: the artwork is untouched, only its pixel count changes.

    python3 web/scripts/redimensionar-marca.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("docs/diseno/handoff-2026-09/assets")
OUT = Path("web/public/marca")

# Width in CSS px of the largest place each asset appears, times two for high-density screens.
TARGETS = {
    "lockup-horizontal.png": 168 * 2,  # activation screen (168px) and manager sidebar (156px)
    "mishashos.png": 132 * 2,          # progress screen
}

OUT.mkdir(parents=True, exist_ok=True)
for name, width in TARGETS.items():
    image = Image.open(SRC / name)
    height = round(image.height * width / image.width)
    image.resize((width, height), Image.LANCZOS).save(OUT / name, optimize=True)
    print(f"{name}: {image.width}x{image.height} -> {width}x{height}")
```

- [ ] **Step 2: Correrlo y verificar**

```bash
python3 web/scripts/redimensionar-marca.py
ls -la web/public/marca
```
Expected: dos PNG de menos de 60 KB cada uno. Si no está Pillow: `pip3 install pillow`. Es la misma
dependencia que ya usa `generate-icons.py`.

- [ ] **Step 3: Commit**

```bash
git add web/scripts/redimensionar-marca.py web/public/marca
git commit -m "feat(web): ship the brand lockup and mishashos at 2x display size

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 0.3: Fuentes autoalojadas

**Files:**
- Create: `web/src/shared/fonts/literata-300.woff2`, `literata-400.woff2`, `literata-500.woff2`,
  `atkinson-400.woff2`, `atkinson-700.woff2`, `LICENCIAS.md`

No es una dependencia npm (regla 13): son archivos binarios en el repo, subset latino, bajados una vez.
Las URL se verificaron el 2026-09-14 (todas responden 200).

- [ ] **Step 1: Bajar los WOFF2**

```bash
mkdir -p web/src/shared/fonts && cd web/src/shared/fonts
BASE=https://cdn.jsdelivr.net/fontsource/fonts
curl -fsSL -o literata-300.woff2  $BASE/literata@latest/latin-300-normal.woff2
curl -fsSL -o literata-400.woff2  $BASE/literata@latest/latin-400-normal.woff2
curl -fsSL -o literata-500.woff2  $BASE/literata@latest/latin-500-normal.woff2
curl -fsSL -o atkinson-400.woff2  $BASE/atkinson-hyperlegible@latest/latin-400-normal.woff2
curl -fsSL -o atkinson-700.woff2  $BASE/atkinson-hyperlegible@latest/latin-700-normal.woff2
ls -la && cd -
```
Expected: cinco archivos de entre 17 y 22 KB, unos 98 KB en total.

- [ ] **Step 2: Escribir `LICENCIAS.md`**

```markdown
# Fuentes

Autoalojadas a propósito: un CDN externo agrega una resolución DNS y una descarga que bloquea el texto en
un celular barato (D-023). Subset latino, WOFF2, bajadas de Fontsource el 2026-09-14.

| Archivo | Familia | Peso | Uso |
|---|---|---|---|
| `literata-300.woff2` | Literata | 300 | Cifra grande del progreso |
| `literata-400.woff2` | Literata | 400 | Cuerpo de lectura, cifras del gestor |
| `literata-500.woff2` | Literata | 500 | Titulares |
| `atkinson-400.woff2` | Atkinson Hyperlegible | 400 | Interfaz |
| `atkinson-700.woff2` | Atkinson Hyperlegible | 700 | Interfaz, énfasis |

Las dos familias se distribuyen bajo la **SIL Open Font License 1.1**, que permite incluirlas y
servirlas con la aplicación. Literata: TypeTogether para Google. Atkinson Hyperlegible: Braille Institute.
```

- [ ] **Step 3: Commit**

```bash
git add web/src/shared/fonts
git commit -m "feat(web): self-host Literata and Atkinson Hyperlegible (latin subset, ~98 KB)

Font files, not an npm dependency: served locally so a cheap phone does not wait on a third-party DNS.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 0.4: `check-contrast.mjs` con los pares nuevos y el lint de uso

**Files:**
- Modify (reescribir): `web/scripts/check-contrast.mjs`

Primero va el chequeo, después los tokens. Con los tokens viejos este script **tiene que fallar**: ese
es el test en rojo.

- [ ] **Step 1: Reemplazar el script completo**

```js
/**
 * Fails if any colour pair the interface actually renders drops below its WCAG threshold, or if the
 * two identity fills are used as text colour anywhere.
 *
 * Two different guards, because they catch different mistakes:
 *
 *   1. Contrast. Each pair below is one the UI really paints. The brand coral is ~3.7:1 on white:
 *      fine on a laptop, unreadable on a cheap phone in Lima sunlight.
 *   2. Usage. `--coral` and `--morado` are fills (D-022, D-023). The purple actually measures ~4.7:1,
 *      so a contrast threshold cannot stop someone using it for text; a scan of the source can.
 *
 *   node web/scripts/check-contrast.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../src');
const cssFiles = [join(src, 'shared/styles.css'), join(src, 'gestor/gestor.css')];

/** Every `:root { … }` block of both stylesheets, so the check runs against the real tokens. */
function tokens(files) {
  const found = {};
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [, block] of source.matchAll(/:root\s*\{([^}]*)\}/g)) {
      for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
        found[name] = value;
      }
    }
  }
  return found;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const t = tokens(cssFiles);
const required = [
  'coral', 'coral-ink', 'coral-soft', 'brand', 'brand-alt', 'morado', 'accent', 'accent-soft',
  'morado-text', 'ink', 'ink-soft', 'ink-mid', 'paper', 'surface', 'line', 'line-strong',
  'ok', 'warn', 'warn-soft', 'alert',
  'g-paper', 'g-surface', 'g-ink-soft', 'g-ink-faint', 'g-dark', 'g-purple', 'g-select',
];
const missing = required.filter((name) => !t[name]);
if (missing.length) {
  console.error(`No se encontraron los tokens: ${missing.join(', ')}`);
  process.exit(1);
}

// AA: 4.5:1 for text, 3:1 for large text and for graphical objects such as a focus ring.
const AA_TEXT = 4.5;
const AA_LARGE = 3;
const WHITE = '#ffffff';

const pairs = [
  // Family
  ['texto principal sobre papel', t.ink, t.paper, AA_TEXT],
  ['texto principal sobre superficie', t.ink, t.surface, AA_TEXT],
  ['texto secundario sobre papel', t['ink-soft'], t.paper, AA_TEXT],
  ['texto secundario sobre superficie', t['ink-soft'], t.surface, AA_TEXT],
  ['prosa larga sobre papel', t['ink-mid'], t.paper, AA_TEXT],
  ['marca sobre papel (enlaces, pestaña activa)', t.brand, t.paper, AA_TEXT],
  ['marca sobre coral suave', t.brand, t['coral-soft'], AA_TEXT],
  ['cifra grande sobre papel', t['brand-alt'], t.paper, AA_TEXT],
  ['tinta del botón coral', t['coral-ink'], t.coral, AA_TEXT],
  ['acento sobre papel', t.accent, t.paper, AA_TEXT],
  ['etiqueta de tipo (acento sobre su fondo)', t.accent, t['accent-soft'], AA_TEXT],
  ['morado de etiqueta sobre papel', t['morado-text'], t.paper, AA_TEXT],
  ['alerta sobre papel', t.alert, t.paper, AA_TEXT],
  ['sincronizado sobre papel', t.ok, t.paper, AA_TEXT],
  ['check de registrado (blanco sobre ok)', WHITE, t.ok, AA_TEXT],
  ['aviso de placeholder', t.warn, t['warn-soft'], AA_TEXT],
  ['chip activo (blanco sobre tinta)', WHITE, t.ink, AA_TEXT],
  ['anillo de foco sobre papel', t.accent, t.paper, AA_LARGE],
  ['borde de control sobre papel', t['line-strong'], t.paper, 1.2],
  // Manager
  ['gestor: secundario sobre tarjeta', t['g-ink-soft'], t['g-surface'], AA_TEXT],
  ['gestor: metadatos sobre tarjeta', t['g-ink-faint'], t['g-surface'], AA_TEXT],
  ['gestor: metadatos sobre fondo', t['g-ink-faint'], t['g-paper'], AA_TEXT],
  ['gestor: botón primario', WHITE, t['g-purple'], AA_TEXT],
  ['gestor: botón oscuro y chip activo', WHITE, t['g-dark'], AA_TEXT],
  ['gestor: texto sobre fila seleccionada', t.ink, t['g-select'], AA_TEXT],
  ['gestor: alerta sobre tarjeta', t.alert, t['g-surface'], AA_TEXT],
  ['gestor: ok sobre tarjeta', t.ok, t['g-surface'], AA_TEXT],
];

let failed = 0;
for (const [label, fg, bg, min] of pairs) {
  const value = contrast(fg, bg);
  const ok = value >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${value.toFixed(2)}:1 (mín ${min})  ${label}  ${fg} / ${bg}`);
}

// The vivid coral is deliberately below AA. Assert it, so nobody "fixes" it by darkening --coral
// and quietly losing the identity: it is the logo colour, and its job is illustration.
const vivid = contrast(t.coral, t.paper);
console.log(`nota  ${vivid.toFixed(2)}:1  --coral sobre blanco — por debajo de AA a propósito: solo relleno`);
if (vivid >= AA_TEXT) {
  console.error('--coral ya cumple AA. Si se oscureció, use --brand para texto y devuelva --coral al color del logotipo.');
  failed += 1;
}

// Usage lint: the two fills never become text colour, in CSS or in inline TSX styles.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const FILL_AS_TEXT = /(?<![-\w])color\s*:\s*['"]?var\(--(coral|morado)\)/g;
for (const file of walk(src).filter((f) => /\.(css|tsx)$/.test(f))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(FILL_AS_TEXT)) {
    const line = source.slice(0, match.index).split('\n').length;
    console.error(`FALLA  --${match[1]} usado como color de texto en ${file.replace(src, 'src')}:${line}. Use --brand o --morado-text.`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} problema(s).`);
  process.exit(1);
}
console.log('\nTodos los pares cumplen su umbral y ningún relleno se usa como texto.');
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `cd web && node scripts/check-contrast.mjs; echo "exit=$?"`
Expected: `No se encontraron los tokens: coral-ink, brand-alt, morado, …` y `exit=1`.

- [ ] **Step 3: No se hace commit todavía.** El commit va junto con los tokens, en la tarea 0.5.

---

### Tarea 0.6: Íconos de la PWA desde el lockup, y `theme-color` blanco

**Files:**
- Modify (reescribir): `web/scripts/generate-icons.py`
- Modify: `web/index.html` (`theme-color`), `web/vite.config.ts` (`background_color`, `theme_color`)
- Regenerate: `web/public/{icon-192,icon-512,icon-maskable-192,icon-maskable-512,apple-touch-icon,favicon-32}.png`

- [ ] **Step 1: Reemplazar `generate-icons.py`**

```python
"""
Generates the PWA icons from the Leer en Familia lockup, on the white brand ground.

The artwork is placed as delivered: scaled to fit, never cropped, recoloured or rotated (handoff).
At 32px and 192px the lockup is small; a vector mark made for launcher sizes is still pending from
Leer en Familia and stays listed in the runbook (D-022).

    python3 web/scripts/generate-icons.py
"""
from PIL import Image

SOURCE = "docs/diseno/handoff-2026-09/assets/lockup-vertical.png"
BACKGROUND = (255, 255, 255, 255)  # --paper
OUT = "web/public"

art = Image.open(SOURCE).convert("RGBA")


def icon(size: int, safe_ratio: float) -> Image.Image:
    """safe_ratio is the share of the canvas the artwork may occupy; maskable icons use the inner 80%."""
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    box = int(size * safe_ratio)
    scale = min(box / art.width, box / art.height)
    w, h = max(1, round(art.width * scale)), max(1, round(art.height * scale))
    resized = art.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - w) // 2, (size - h) // 2))
    return canvas.convert("RGB")


for size in (192, 512):
    icon(size, 0.92).save(f"{OUT}/icon-{size}.png", optimize=True)
    icon(size, 0.72).save(f"{OUT}/icon-maskable-{size}.png", optimize=True)
icon(180, 0.86).save(f"{OUT}/apple-touch-icon.png", optimize=True)
icon(32, 1.0).save(f"{OUT}/favicon-32.png", optimize=True)

print(f"Wrote icons from {SOURCE} to {OUT}/")
```

- [ ] **Step 2: Generar y mirar**

```bash
python3 web/scripts/generate-icons.py
```
Abra `web/public/icon-512.png` y `icon-maskable-512.png` y verifique dos cosas: el lockup centrado, sin
recorte, sobre blanco; y en el maskable, un margen claro alrededor.

- [ ] **Step 3: `theme-color` y manifiesto a blanco**

En `web/index.html`, cambie la línea del theme-color para que quede así:

```html
    <meta name="theme-color" content="#ffffff" />
```

En `web/vite.config.ts`, dentro de `manifest`, reemplace las dos líneas de color:

```ts
        background_color: '#ffffff',
        theme_color: '#ffffff',
```

- [ ] **Step 4: Build y commit**

```bash
cd web && npm run build && cd ..
git add web/scripts/generate-icons.py web/public/*.png web/index.html web/vite.config.ts
git commit -m "feat(web): PWA icons from the brand lockup on a white ground

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
Expected: el build pasa. Aún no hay que correr `check-installable`: eso va en la verificación final
(fase 6).
