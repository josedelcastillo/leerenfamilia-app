/**
 * Checks that `sam build` produced deployable artifacts before anything is deployed.
 *
 * Exists because of a failure that costs an hour to diagnose and a second to prevent. Deploying the
 * **source** template instead of the built one uploads `backend/` as-is: no bundle, no `index.mjs`
 * at the root of the artifact. The stack deploys cleanly, CloudFormation reports success, and every
 * Lambda then dies at init with `Runtime.ImportModuleError: Cannot find module 'index'` — an error
 * that says nothing about the actual cause.
 *
 *   node scripts/verificar-build.mjs
 *
 * Run it between `sam build` and `sam deploy`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const BUILD_DIR = '.aws-sam/build';
const BUILT_TEMPLATE = join(BUILD_DIR, 'template.yaml');
const HANDLER_FILE = 'index.mjs';

const problems = [];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(BUILT_TEMPLATE))) {
  console.error(`No existe ${BUILT_TEMPLATE}.`);
  console.error('Ejecute primero: sam build --template infra/template.yaml');
  process.exit(1);
}

const template = await readFile(BUILT_TEMPLATE, 'utf8');

// After a build, every CodeUri must be a directory inside .aws-sam/build. One still pointing at
// ../backend means the source template is about to be deployed instead of the built one.
for (const [, codeUri] of template.matchAll(/^\s*CodeUri:\s*(\S+)\s*$/gm)) {
  if (codeUri.includes('..') || codeUri.startsWith('/')) {
    problems.push(
      `El template construido todavía apunta al fuente (CodeUri: ${codeUri}). ` +
        'Vuelva a correr sam build.',
    );
  }
}

const entries = await readdir(BUILD_DIR, { withFileTypes: true });
const functionDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

if (functionDirs.length === 0) {
  problems.push(`No hay artefactos en ${BUILD_DIR}.`);
}

for (const name of functionDirs) {
  const handler = join(BUILD_DIR, name, HANDLER_FILE);
  if (!(await exists(handler))) {
    const contents = await readdir(join(BUILD_DIR, name)).catch(() => []);
    problems.push(
      `${name} no tiene ${HANDLER_FILE} en su raíz. Contiene: ${contents.slice(0, 6).join(', ') || '(vacío)'}`,
    );
  }
}

if (problems.length > 0) {
  console.error('\nEl build NO es desplegable:\n');
  for (const problem of problems) {
    console.error(`  ✗ ${problem}`);
  }
  console.error(
    '\nDespliegue con el template construido, no con el fuente:\n' +
      '  sam deploy --template-file .aws-sam/build/template.yaml\n',
  );
  process.exit(1);
}

console.log(`Build verificado: ${functionDirs.length} funciones, cada una con ${HANDLER_FILE}.`);
console.log('Despliegue con: sam deploy --template-file .aws-sam/build/template.yaml');
