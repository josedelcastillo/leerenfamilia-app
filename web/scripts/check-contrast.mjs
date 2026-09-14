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
