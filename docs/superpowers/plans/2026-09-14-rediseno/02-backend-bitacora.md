# Fase 1 — Backend: la bitácora en un toque

Ver [`00-indice.md`](00-indice.md). Todo corre sin red y sin credenciales: `cd backend && npm test`.
Recordatorio de la regla 1: `domain/` no importa AWS, no lee el reloj ni el entorno. El test
`test/domain/purity.test.ts` lo vigila.

---

### Tarea 1.1: `minutes` opcional y `declaredBy` en el dominio

**Files:**
- Modify: `backend/src/domain/log-entry.ts`
- Test: `backend/test/domain/log-entry.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregue al final de `backend/test/domain/log-entry.test.ts`, y agregue `DECLARED_BY` al import de
`log-entry.ts`:

```ts
describe('registro en un toque (D-024)', () => {
  test('acepta una entrada sin minutos y la guarda como null', () => {
    assert.equal(parseLogEntry(input({ minutes: null }), TODAY).minutes, null);
    const { minutes: _omitted, ...withoutMinutes } = input();
    assert.equal(parseLogEntry(withoutMinutes, TODAY).minutes, null);
  });

  test('una duración reportada sigue validándose igual', () => {
    for (const minutes of [0, MAX_MINUTES + 1, 2.5]) {
      assert.throws(() => parseLogEntry(input({ minutes }), TODAY), DomainError);
    }
  });

  test('guarda quién dice la familia que hizo la actividad, aparte de quién registró', () => {
    const entry = parseLogEntry(input({ declaredBy: 'papa', loggedBy: 'principal' }), TODAY);
    assert.equal(entry.declaredBy, 'papa');
    assert.equal(entry.loggedBy, 'principal');
  });

  test('declaredBy es null si no viene o viene vacío, y rechaza lo que no conoce', () => {
    assert.equal(parseLogEntry(input(), TODAY).declaredBy, null);
    assert.equal(parseLogEntry(input({ declaredBy: '' }), TODAY).declaredBy, null);
    assert.throws(() => parseLogEntry(input({ declaredBy: 'abuela' }), TODAY), DomainError);
    assert.deepEqual(DECLARED_BY, ['mama', 'papa', 'otra']);
  });
});

describe('summarize con minutos opcionales', () => {
  test('suma solo los minutos reportados y dice cuántas entradas los reportaron', () => {
    const base = parseLogEntry(input(), TODAY);
    const summary = summarize([
      { ...base, clientId: 'a', minutes: 10 },
      { ...base, clientId: 'b', minutes: null },
    ]);
    assert.equal(summary.entries, 2);
    assert.equal(summary.totalMinutes, 10);
    assert.equal(summary.entriesWithMinutes, 1);
  });
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd backend && node --test test/domain/log-entry.test.ts`
Expected: FAIL, con errores de validación de `minutes: null`, `DECLARED_BY` no exportado y
`entriesWithMinutes` en `undefined`.

- [ ] **Step 3: Implementar en `backend/src/domain/log-entry.ts`**

Debajo de `export type LoggedBy = …`, agregue:

```ts
/**
 * Who the caregiver says did the activity. Self-reported and optional, and deliberately separate
 * from `loggedBy`: that one comes from the signed token and says whose phone logged the entry; this
 * one is what the family tells us. A father reading while the mother's phone logs is exactly the
 * case where the two differ (D-024).
 */
export type DeclaredBy = 'mama' | 'papa' | 'otra';

export const DECLARED_BY: readonly DeclaredBy[] = ['mama', 'papa', 'otra'];
```

En `LogEntryInput`, cambie `minutes` y agregue `declaredBy`:

```ts
  /** Null or absent when the family logged in one tap and did not say how long (D-024). */
  readonly minutes?: number | null;
  readonly resourceId?: string | null;
  readonly note?: string | null;
  readonly loggedBy: string;
  readonly declaredBy?: string | null;
```

En `LogEntry`, cambie `minutes` y agregue `declaredBy` al final:

```ts
  /** Null when not reported. Never defaulted: an invented duration would corrupt L2. */
  readonly minutes: number | null;
```
```ts
  readonly loggedBy: LoggedBy;
  readonly declaredBy: DeclaredBy | null;
```

En `parseLogEntry`, reemplace el bloque de validación de minutos por:

```ts
  const minutes = input.minutes ?? null;
  if (
    minutes !== null &&
    (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES)
  ) {
    invalid(`La duración debe ser un número entero de ${MIN_MINUTES} a ${MAX_MINUTES} minutos`);
  }
```

Antes del `return`, agregue:

```ts
  const declared = typeof input.declaredBy === 'string' ? input.declaredBy.trim() : '';
  if (declared !== '' && !DECLARED_BY.includes(declared as DeclaredBy)) {
    invalid(`Quién hizo la actividad no es una opción válida: ${declared}`);
  }
```

En el objeto que devuelve, use `minutes,` en lugar de `minutes: input.minutes,` y agregue al final:

```ts
    declaredBy: declared === '' ? null : (declared as DeclaredBy),
```

Reemplace `LogSummary` y `summarize` completos:

```ts
export interface LogSummary {
  readonly entries: number;
  /** Sum of the durations that were reported. Entries without one add nothing (D-024). */
  readonly totalMinutes: number;
  readonly entriesWithMinutes: number;
  readonly byKind: Readonly<Record<LogActivityKind, number>>;
  readonly distinctDays: number;
}

/**
 * What a manager sees by default, and what the pilot reports on: aggregates and adherence, never
 * the free text.
 */
export function summarize(entries: readonly LogEntry[]): LogSummary {
  const byKind: Record<LogActivityKind, number> = {
    lectura: 0,
    cancion: 0,
    juego: 0,
    conversacion: 0,
  };
  const days = new Set<string>();
  let totalMinutes = 0;
  let entriesWithMinutes = 0;

  for (const entry of entries) {
    byKind[entry.kind] += 1;
    if (typeof entry.minutes === 'number') {
      totalMinutes += entry.minutes;
      entriesWithMinutes += 1;
    }
    days.add(entry.date);
  }

  return { entries: entries.length, totalMinutes, entriesWithMinutes, byKind, distinctDays: days.size };
}
```

- [ ] **Step 4: Correr el archivo de tests**

Run: `cd backend && node --test test/domain/log-entry.test.ts`
Expected: PASS. Si un test existente arma un `LogEntry` literal y el typecheck se queja, se arregla en la
tarea 1.4; `node --test` no hace chequeo de tipos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/log-entry.ts backend/test/domain/log-entry.test.ts
git commit -m "feat(domain): optional minutes and self-declared reader on log entries

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 1.2: La cola acepta entradas sin minutos y con `declaredBy`

**Files:**
- Modify: `backend/src/handlers/tracking/logic.ts`
- Test: `backend/test/handlers/family-api.test.ts`

- [ ] **Step 1: Tests que fallan**

Dentro de `describe('sincronización de la cola', …)`, después del test
`'takes who logged it from the token, not from the request body'`, agregue:

```ts
  test('acepta una entrada registrada en un toque, sin minutos', async () => {
    const [result] = await applySync(store, store.context, MOTHER, [logItem({ minutes: null })], TODAY, NOW);
    assert.equal(result?.status, 'ok');
    assert.equal(store.logs[0]?.minutes, null);
  });

  test('guarda declaredBy aparte del loggedBy que sale del token', async () => {
    await applySync(store, store.context, MOTHER, [logItem({ declaredBy: 'papa' })], TODAY, NOW);
    assert.equal(store.logs[0]?.declaredBy, 'papa');
    assert.equal(store.logs[0]?.loggedBy, 'principal');
  });

  test('completar los detalles reescribe la misma entrada, no crea otra', async () => {
    await applySync(store, store.context, MOTHER, [logItem({ minutes: null })], TODAY, NOW);
    await applySync(store, store.context, MOTHER, [logItem({ minutes: 5, note: 'nos miró', declaredBy: 'mama' })], TODAY, NOW);
    assert.equal(store.logs.length, 1);
    assert.equal(store.logs[0]?.minutes, 5);
    assert.equal(store.logs[0]?.declaredBy, 'mama');
  });

  test('rechaza minutos que no son un número, en vez de convertirlos', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      logItem({ clientId: 'texto', minutes: '10' }),
      logItem({ clientId: 'booleano', minutes: true }),
    ], TODAY, NOW);
    assert.deepEqual(results.map((r) => r.status), ['rechazado', 'rechazado']);
    assert.equal(store.logs.length, 0);
  });

  test('rechaza un declaredBy que no es texto, en vez de tomarlo como no declarado', async () => {
    const [result] = await applySync(store, store.context, MOTHER, [logItem({ declaredBy: true })], TODAY, NOW);
    assert.equal(result?.status, 'rechazado');
  });
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd backend && node --test test/handlers/family-api.test.ts`
Expected: FAIL. `Number(null)` da `0` y se rechaza por duración; `declaredBy` llega `undefined`.

- [ ] **Step 3: Implementar**

En `applySync`, dentro de la rama `bitacora`, reemplace las líneas de `minutes` y `loggedBy` del objeto
que se pasa a `parseLogEntry`:

```ts
            // Passed through untouched, not coerced: parseLogEntry's Number.isInteger rejects a
            // string or boolean, where Number() would have turned "10" or true into a duration.
            minutes: item['minutes'] === undefined ? null : (item['minutes'] as number | null),
            resourceId: typeof item['resourceId'] === 'string' ? item['resourceId'] : null,
            note: typeof item['note'] === 'string' ? item['note'] : null,
            loggedBy: role,
            // A non-string is a malformed payload, not "the family did not say": String() makes
            // it fail the domain's enum check instead of silently becoming null.
            declaredBy: item['declaredBy'] === undefined || item['declaredBy'] === null
              ? null
              : String(item['declaredBy']),
```

- [ ] **Step 4: Tests en verde**

Run: `cd backend && node --test test/handlers/family-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/handlers/tracking/logic.ts backend/test/handlers/family-api.test.ts
git commit -m "feat(tracking): accept one-tap entries and let details overwrite them by client id

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 1.3: Indicadores y CSV con minutos opcionales y `declarado_por`

**Files:**
- Modify: `backend/src/domain/indicators.ts`, `backend/src/handlers/admin/export.ts`
- Test: `backend/test/domain/indicators.test.ts`, `backend/test/handlers/export.test.ts`

- [ ] **Step 1: Tests que fallan en `indicators.test.ts`**

Agregue `declaredBy: null,` al objeto que arma `entryOnWeek`, después de `loggedBy`. Luego agregue al
final del archivo:

```ts
describe('minutos opcionales (D-024)', () => {
  test('suma solo los minutos reportados y cuenta cuántas entradas los reportaron', () => {
    const result = familyIndicators(
      input({ logEntries: [entryOnWeek(1, { minutes: 10 }), entryOnWeek(2, { minutes: null })] }),
      CUTOFF,
      WEEKS,
    );
    assert.equal(result.entradas, 2);
    assert.equal(result.minutosTotales, 10);
    assert.equal(result.entradasConMinutos, 1);
  });

  test('una entrada sin minutos igual cuenta la semana como activa', () => {
    const result = familyIndicators(input({ logEntries: [entryOnWeek(1, { minutes: null })] }), CUTOFF, WEEKS);
    assert.equal(result.semanasActivas, 1);
  });
});

describe('quién hizo la actividad, según la familia', () => {
  test('cuenta por declaración, aparte del cuidador que firmó el registro', () => {
    const inputs = [input({
      logEntries: [
        entryOnWeek(1, { declaredBy: 'papa', loggedBy: 'principal' }),
        entryOnWeek(2, { declaredBy: null }),
      ],
    })];
    const perFamily = inputs.map((i) => familyIndicators(i, CUTOFF, WEEKS));
    const cohort = cohortIndicators(perFamily, inputs, WEEKS);
    assert.deepEqual(cohort.entradasPorDeclarado, { mama: 0, papa: 1, otra: 0, sin_dato: 1 });
    assert.equal(cohort.entradasConMinutos, 2);
  });
});
```

- [ ] **Step 2: Tests que fallan en `export.test.ts`**

Agregue `declaredBy: null,` al helper `entry()`, después de `loggedBy`. Luego agregue:

```ts
describe('bitácora con registro en un toque', () => {
  test('deja vacía la duración no reportada y separa declarado_por de registrado_por', () => {
    const fam = family({ logEntries: [entry({ minutes: null, declaredBy: 'otra' })] });
    const rows = parse(buildCsv('bitacora', bundle({ families: [fam] })));
    const header = rows[0]!;
    const row = rows[1]!;
    assert.equal(row[header.indexOf('minutos')], '');
    assert.equal(row[header.indexOf('declarado_por')], 'otra');
    assert.equal(row[header.indexOf('registrado_por')], 'principal');
  });

  test('el resumen dice cuántas entradas reportaron minutos', () => {
    const fam = family({ logEntries: [entry({ clientId: 'a', minutes: 5 }), entry({ clientId: 'b', minutes: null })] });
    const rows = parse(buildCsv('resumen', bundle({ families: [fam] })));
    const byName = new Map(rows.map((r) => [r[0], r[1]]));
    assert.equal(byName.get('entradas_con_minutos'), '1');
    assert.equal(byName.get('minutos_bitacora'), '5');
    assert.equal(byName.get('declarado_sin_dato'), '2');
  });
});
```

- [ ] **Step 3: Correr y ver el fallo**

Run: `cd backend && node --test test/domain/indicators.test.ts test/handlers/export.test.ts`
Expected: FAIL. No existen `entradasConMinutos`, `entradasPorDeclarado`, `declarado_por` ni
`entradas_con_minutos`.

- [ ] **Step 4: Implementar en `indicators.ts`**

Cambie el import de `log-entry.ts`:

```ts
import type { DeclaredBy, LogActivityKind, LogEntry } from './log-entry.ts';
```

Debajo de `EMPTY_BY_KIND`, agregue:

```ts
/** `sin_dato` is an entry where the family did not say who did it — the one-tap default (D-024). */
export type DeclaredByBucket = DeclaredBy | 'sin_dato';

const EMPTY_DECLARED: Record<DeclaredByBucket, number> = { mama: 0, papa: 0, otra: 0, sin_dato: 0 };
```

En `FamilyIndicators`, después de `minutosTotales`:

```ts
  /** Entries that reported a duration. `minutosTotales` sums only these (D-024). */
  readonly entradasConMinutos: number;
  readonly entradasPorDeclarado: Readonly<Record<DeclaredByBucket, number>>;
```

En `familyIndicators`, declare dos contadores junto a `let minutos = 0;`:

```ts
  let conMinutos = 0;
  const declared: Record<DeclaredByBucket, number> = { ...EMPTY_DECLARED };
```

Dentro del `for`, reemplace `minutos += entry.minutes;` por:

```ts
    if (typeof entry.minutes === 'number') {
      minutos += entry.minutes;
      conMinutos += 1;
    }
    // Items written before D-024 have no declaredBy at all; they count as not declared.
    declared[entry.declaredBy ?? 'sin_dato'] += 1;
```

En el objeto que devuelve, después de `minutosTotales: minutos,`:

```ts
    entradasConMinutos: conMinutos,
    entradasPorDeclarado: declared,
```

En `CohortIndicators`, después de `minutosTotales`:

```ts
  readonly entradasConMinutos: number;
  readonly entradasPorDeclarado: Readonly<Record<DeclaredByBucket, number>>;
```

En `cohortIndicators`, antes del `return`:

```ts
  const byDeclared: Record<DeclaredByBucket, number> = { ...EMPTY_DECLARED };
  for (const family of families) {
    for (const bucket of Object.keys(byDeclared) as DeclaredByBucket[]) {
      byDeclared[bucket] += family.entradasPorDeclarado[bucket];
    }
  }
```

y en el objeto devuelto, después de `minutosTotales: …,`:

```ts
    entradasConMinutos: families.reduce((total, f) => total + f.entradasConMinutos, 0),
    entradasPorDeclarado: byDeclared,
```

- [ ] **Step 5: Implementar en `export.ts`**

En `resumenCsv`, reemplace la fila de `minutos_bitacora` por estas dos:

```ts
    { indicador: 'minutos_bitacora', valor: String(cohort.minutosTotales), nota: 'suma solo las entradas que reportaron duración (D-024)' },
    { indicador: 'entradas_con_minutos', valor: String(cohort.entradasConMinutos), nota: 'entradas con duración reportada; el resto se registró en un toque' },
```

y después de la fila `entradas_conversacion`, agregue:

```ts
    { indicador: 'declarado_mama', valor: String(cohort.entradasPorDeclarado.mama), nota: 'quién hizo la actividad según la familia; no es registrado_por (D-024)' },
    { indicador: 'declarado_papa', valor: String(cohort.entradasPorDeclarado.papa), nota: '' },
    { indicador: 'declarado_otra', valor: String(cohort.entradasPorDeclarado.otra), nota: 'otra persona que cuida' },
    { indicador: 'declarado_sin_dato', valor: String(cohort.entradasPorDeclarado.sin_dato), nota: 'la familia no lo dijo' },
```

En `familiasCsv`, después de la columna `minutos_totales`:

```ts
    { header: 'entradas_con_minutos', value: (f) => f.entradasConMinutos },
```

En `bitacoraCsv`, reemplace la columna `minutos` y agregue `declarado_por` después de `registrado_por`:

```ts
    { header: 'minutos', value: (r) => r.entry.minutes ?? '' },
    { header: 'registrado_por', value: (r) => r.entry.loggedBy },
    { header: 'declarado_por', value: (r) => r.entry.declaredBy ?? '' },
```

- [ ] **Step 6: Tests en verde**

Run: `cd backend && node --test test/domain/indicators.test.ts test/handlers/export.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/domain/indicators.ts backend/src/handlers/admin/export.ts backend/test/domain/indicators.test.ts backend/test/handlers/export.test.ts
git commit -m "feat(indicators): count reported minutes only, and report who the family says did it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 1.4: Barrido de tipos y ejemplos regenerados

**Files:**
- Modify: `backend/src/handlers/admin/logic.ts`, cada test o script que arme un `LogEntry` literal
- Regenerate: `docs/ejemplos/*.csv`

- [ ] **Step 1: Encontrar lo que se rompió**

Run: `cd backend && npm run typecheck`
Expected: errores de dos tipos:
- `Property 'declaredBy' is missing` en helpers de test (`admin.test.ts`, `e2e/ciclo-completo.test.ts`,
  y los que queden) y en `scripts/generar-ejemplos.ts` / `scripts/seed-demo.ts`
- `'entry.minutes' is possibly 'null'` donde se suman minutos

- [ ] **Step 2: Arreglar cada error, sin inventar datos**

- En cada helper o literal de `LogEntry`: agregue `declaredBy: null`.
- En `scripts/generar-ejemplos.ts`, que produce los CSV de ejemplo: además del `declaredBy`, modele el
  toque único, para que los ejemplos muestren el caso real. Reemplace
  `minutes: pick([5, 5, 10, 10, 15, 20, 30]),` por:

```ts
          // About a third of entries are logged in one tap, with no duration (D-024).
          minutes: pick([null, null, 2, 5, 5, 10, 10]),
          declaredBy: pick([null, null, 'mama', 'mama', 'papa', 'otra']),
```
  Si el tipo que infiere `pick` no encaja con `LogEntry`, anote el arreglo con `as const` o tipe el
  elemento: `pick<number | null>([...])` y `pick<DeclaredBy | null>([...])`. Importe `DeclaredBy` de
  `../src/domain/log-entry.ts`.
- En `src/handlers/admin/logic.ts`, `buildFamilyRows`, cambie la suma de minutos:

```ts
        minutesLast7Days: recent.reduce((total, entry) => total + (entry.minutes ?? 0), 0),
```
- Si aparece otra suma de `entry.minutes` en `src/`, use el mismo `?? 0`. No aplique `?? 0` fuera de
  una suma: en cualquier otro lugar, `null` significa "no reportado" y se tiene que ver así.

- [ ] **Step 3: Todo en verde**

```bash
cd backend && npm run typecheck && npm test
node scripts/generar-ejemplos.ts
git diff --stat docs/ejemplos
```
Expected: typecheck limpio, todos los tests pasan, y en `docs/ejemplos/bitacora.csv` aparecen celdas de
`minutos` vacías y la columna `declarado_por`.

- [ ] **Step 4: Commit**

```bash
git add backend docs/ejemplos
git commit -m "chore(backend): carry optional minutes and declaredBy through tests, scripts and samples

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 1.5: La relación que declara el cuidador al inscribirse

**Files:**
- Modify: `backend/src/handlers/register/logic.ts`, `backend/src/handlers/family-ports.ts`,
  `backend/src/handlers/admin/ports.ts`, `backend/src/adapters/family-store.ts`,
  `backend/src/adapters/admin-store.ts`
- Test: `backend/test/handlers/family-api.test.ts`, `backend/test/handlers/admin.test.ts`

Esta relación es la respuesta a "¿Quién eres en casa?" en la pantalla 1. Sirve para que la ficha diga
"principal (mamá)". No preselecciona el chip de "quién" (D-024) ni reemplaza `role`.

- [ ] **Step 1: Tests que fallan (inscripción)**

Dentro de `describe('registro por QR', …)`, agregue:

```ts
  test('guarda la relación que declara el cuidador, y null si no la dice', async () => {
    const { record } = await run(request({
      caregivers: [
        { msisdn: '987654321', role: 'principal', relation: 'mama' },
        { msisdn: '912345678', role: 'secundario' },
      ],
    }));
    assert.equal(record.caregivers[0]?.relation, 'mama');
    assert.equal(record.caregivers[1]?.relation, null);
  });

  test('rechaza una relación que no conoce', async () => {
    await assert.rejects(
      () => run(request({ caregivers: [{ msisdn: '987654321', role: 'principal', relation: 'tía' }] })),
      (e: unknown) => e instanceof DomainError && e.code === 'invalid_enrollment',
    );
  });
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd backend && node --test test/handlers/family-api.test.ts`
Expected: FAIL; `relation` no existe en el registro.

- [ ] **Step 3: Implementar en `register/logic.ts`**

Agregue el import:

```ts
import { DECLARED_BY, type DeclaredBy } from '../../domain/log-entry.ts';
```

En `EnrollmentRequest`, cambie el tipo de `caregivers`:

```ts
  readonly caregivers: ReadonlyArray<{
    readonly msisdn: string;
    readonly role: string;
    /** "¿Quién eres en casa?" on the activation screen. Optional. */
    readonly relation?: string | null;
  }>;
```

En `EnrollmentRecord`:

```ts
  readonly caregivers: ReadonlyArray<{
    readonly msisdn: Msisdn;
    readonly role: 'principal' | 'secundario';
    readonly relation: DeclaredBy | null;
  }>;
```

Debajo de `function invalid(…)`, agregue:

```ts
function parseRelation(value: unknown): DeclaredBy | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && (DECLARED_BY as readonly string[]).includes(value)) {
    return value as DeclaredBy;
  }
  invalid(`Relación con el bebé no reconocida: ${String(value)}`);
}
```

En el `map` que arma `caregivers`, agregue la relación:

```ts
  const caregivers = request.caregivers.map((caregiver, index) => ({
    msisdn: toE164(String(caregiver.msisdn)),
    role: (index === 0 || caregiver.role === 'principal' ? 'principal' : 'secundario') as
      | 'principal'
      | 'secundario',
    relation: parseRelation(caregiver.relation),
  }));
```

- [ ] **Step 4: Guardarla y leerla**

En `family-ports.ts`, importe `DeclaredBy` junto a `LoggedBy` y cambie `caregivers` en `FamilyContext`:

```ts
  readonly caregivers: ReadonlyArray<{
    readonly msisdn: string;
    readonly role: LoggedBy;
    readonly relation: DeclaredBy | null;
  }>;
```

En `admin/ports.ts`, importe `DeclaredBy` de `../../domain/log-entry.ts` y agregue a cada cuidador de
`FamilyRecord`:

```ts
    readonly relation: DeclaredBy | null;
```

En `adapters/family-store.ts`: importe `DeclaredBy` y agregue, debajo de los imports:

```ts
const relationOf = (value: unknown): DeclaredBy | null =>
  value === 'mama' || value === 'papa' || value === 'otra' ? value : null;
```

En `getContext`, en el `map` de cuidadores, agregue `relation: relationOf(item['relation']),`. En
`createFamily`, en el ítem del cuidador, agregue `relation: caregiver.relation,` después de `role`.

En `adapters/admin-store.ts`: la misma función `relationOf` (con su import) y, en `#toRecord`, dentro del
`caregivers.push({…})`, agregue `relation: relationOf(item['relation']),`.

- [ ] **Step 5: Ajustar los fixtures y correr todo**

- En `family-api.test.ts`, `FakeFamilyStore.context.caregivers`: agregue `relation: 'mama'` a MOTHER y
  `relation: null` a FATHER.
- En `admin.test.ts`, helper `family()`: agregue `relation: null` al cuidador.

```bash
cd backend && npm run typecheck && npm test
```
Expected: todo en verde. El test `'stores nothing beyond the minimum the programme needs'` sigue pasando:
la relación viene del formulario de la PWA, no de los registros del hospital.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(register): store the relation the caregiver declares at activation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
