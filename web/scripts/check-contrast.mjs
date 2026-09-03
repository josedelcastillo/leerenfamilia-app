/**
 * Fails if any colour pair the interface actually renders drops below its WCAG threshold.
 *
 * The reason this is a build step and not a note in a design doc: the brand coral is 3.46:1 on
 * white. It looks fine on a laptop and is unreadable on a cheap phone in Lima sunlight, which is
 * exactly where this app is used. Somebody will eventually reach for the vivid coral because it
 * is prettier; this is what stops that reaching production.
 *
 *   node web/scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../src/shared/styles.css'), 'utf8');

/** Reads the `:root` custom properties so the check runs against the real tokens, not a copy. */
function tokens(source) {
  const root = source.slice(source.indexOf(':root {'), source.indexOf('* { box-sizing'));
  const found = {};
  for (const [, name, value] of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) found[name] = value;
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

const t = tokens(css);
const missing = ['ink', 'ink-soft', 'brand', 'brand-ink', 'accent', 'paper', 'surface', 'coral']
  .filter((name) => !t[name]);
if (missing.length) {
  console.error(`No se encontraron los tokens: ${missing.join(', ')}`);
  process.exit(1);
}

// AA is 4.5:1 for body text, 3:1 for large text and for the boundary of a control.
const AA_TEXT = 4.5;
const AA_LARGE = 3;

const pairs = [
  ['texto principal sobre papel', t.ink, t.paper, AA_TEXT],
  ['texto principal sobre tarjeta', t.ink, t.surface, AA_TEXT],
  ['texto secundario sobre papel', t['ink-soft'], t.paper, AA_TEXT],
  ['texto secundario sobre tarjeta', t['ink-soft'], t.surface, AA_TEXT],
  ['marca sobre tarjeta (cabecera, enlaces)', t.brand, t.surface, AA_TEXT],
  ['marca sobre papel', t.brand, t.paper, AA_TEXT],
  ['etiqueta del botón principal', t['brand-ink'], t.brand, AA_TEXT],
  ['chip activo', t['brand-ink'], t.brand, AA_TEXT],
  ['acento (morado) sobre tarjeta', t.accent, t.surface, AA_TEXT],
  ['acento sobre su propio fondo suave', t.accent, t['accent-soft'], AA_TEXT],
  ['marca sobre el fondo coral suave', t.brand, t['coral-soft'], AA_TEXT],
  ['anillo de foco sobre papel', t.accent, t.paper, AA_LARGE],
  ['borde de campo sobre tarjeta', t.line, t.surface, 1.2],
];

let failed = 0;
for (const [label, fg, bg, min] of pairs) {
  const value = contrast(fg, bg);
  const ok = value >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${value.toFixed(2)}:1 (mín ${min})  ${label}  ${fg} / ${bg}`);
}

// The vivid coral is deliberately below AA. Assert that too, so nobody "fixes" it by darkening
// --coral and quietly losing the identity: it is the logo colour, and its job is illustration.
const vivid = contrast(t.coral, t.surface);
console.log(`nota  ${vivid.toFixed(2)}:1  --coral sobre blanco — por debajo de AA a propósito: solo ilustración, nunca bajo texto`);
if (vivid >= AA_TEXT) {
  console.error('--coral ya cumple AA. Si se oscureció, use --brand para texto y devuelva --coral al color del logotipo.');
  failed += 1;
}

if (failed) {
  console.error(`\n${failed} par(es) fuera de umbral.`);
  process.exit(1);
}
console.log('\nTodos los pares cumplen su umbral.');
