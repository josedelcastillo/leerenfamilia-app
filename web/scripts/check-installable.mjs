/**
 * Verifies the PWA installability criteria against a running build.
 *
 * Lighthouse dropped its PWA category in v12, so "Lighthouse PWA green" no longer exists as a
 * check. These are the conditions Chromium actually uses to offer installation, asserted directly:
 * a served manifest with name, start_url, display and 192/512 icons, a maskable icon, and a
 * registered service worker with a fetch handler.
 *
 *   node web/scripts/check-installable.mjs http://localhost:4173/app
 */
import { chromium } from 'playwright';

const target = process.argv[2] ?? 'http://localhost:4173/app';
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
    failures.push(label);
  }
}

// CHROMIUM_PATH lets a CI image point at a browser it already has, instead of downloading one.
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(executablePath === undefined ? {} : { executablePath }),
});
const page = await browser.newPage();
await page.goto(target, { waitUntil: 'networkidle' });

console.log(`\nInstalabilidad — ${target}\n`);

const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
check('la página enlaza un manifest', manifestHref !== null);

const manifest = await page.evaluate(async (href) => {
  const response = await fetch(href);
  return response.ok ? await response.json() : null;
}, manifestHref ?? '/manifest.webmanifest');

check('el manifest se sirve y es JSON válido', manifest !== null);
if (manifest !== null) {
  check('tiene name', typeof manifest.name === 'string' && manifest.name.length > 0);
  check('tiene short_name', typeof manifest.short_name === 'string' && manifest.short_name.length > 0);
  check('tiene start_url', typeof manifest.start_url === 'string');
  check('display es standalone', manifest.display === 'standalone');
  check('declara theme_color y background_color',
    typeof manifest.theme_color === 'string' && typeof manifest.background_color === 'string');
  check('idioma es es-PE', manifest.lang === 'es-PE');

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  check('tiene ícono 192x192', icons.some((i) => i.sizes === '192x192'));
  check('tiene ícono 512x512', icons.some((i) => i.sizes === '512x512'));
  check('tiene al menos un ícono maskable',
    icons.some((i) => String(i.purpose ?? '').split(' ').includes('maskable')));

  for (const icon of icons) {
    const status = await page.evaluate(async (src) => (await fetch(src)).status, icon.src);
    check(`el ícono ${icon.src} se sirve`, status === 200, `HTTP ${status}`);
  }
}

const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'sin soporte';
  const registration = await Promise.race([
    navigator.serviceWorker.ready.then((r) => r),
    new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
  ]);
  return registration === null ? 'no se registró' : 'ok';
});
check('el service worker queda registrado', swReady === 'ok', String(swReady));

check('hay meta theme-color', (await page.locator('meta[name="theme-color"]').count()) > 0);
check('el documento declara idioma', (await page.getAttribute('html', 'lang')) !== null);

// --- offline -------------------------------------------------------------
// The point of all of the above. A caregiver opening the app with no signal must get the app,
// not the browser's dinosaur.
console.log('\nSin conexión\n');

await page.context().setOffline(true);
let reloadFailed = false;
try {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
} catch {
  reloadFailed = true;
}
check('la app carga con la red apagada', !reloadFailed);

if (!reloadFailed) {
  const shell = await page.evaluate(() => ({
    title: document.title,
    rendered: (document.getElementById('root')?.textContent ?? '').length > 0,
  }));
  check('el título llega desde el precache', shell.title.includes('Nacidos para Leer'));
  check('la interfaz se renderiza sin red', shell.rendered);

  // A deep link into a client-side route must also resolve from the precached shell.
  let deepLinkFailed = false;
  try {
    await page.goto(new URL('/app', target).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch {
    deepLinkFailed = true;
  }
  check('una ruta del cliente resuelve sin red', !deepLinkFailed);
}
await page.context().setOffline(false);

await browser.close();

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('Todas las comprobaciones de instalabilidad pasaron.');
