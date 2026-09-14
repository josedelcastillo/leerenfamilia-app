# Fase 2 — Backend: consentimiento revocable, tablero y auditoría

Ver [`00-indice.md`](00-indice.md). Siguen siendo **siete Lambdas** (regla 2): el consentimiento entra por
la Lambda de tracking como un tipo más de ítem de la cola, y `/tablero` y `/auditoria` son rutas del
handler de gestor, que ya recibe `/api/gestor/{proxy+}`. **No se toca `infra/template.yaml`.**

---

### Tarea 2.1: Cambiar el consentimiento de notas desde la PWA

**Files:**
- Modify: `backend/src/adapters/keys.ts`, `backend/src/handlers/family-ports.ts`,
  `backend/src/adapters/family-store.ts`, `backend/src/handlers/tracking/logic.ts`,
  `backend/src/handlers/tracking/index.ts`
- Test: `backend/test/handlers/family-api.test.ts`, `backend/test/adapters/keys.test.ts`

- [ ] **Step 1: Tests que fallan**

En `family-api.test.ts`, importe `NotesConsentChange` desde `family-ports.ts` y agregue al
`FakeFamilyStore`:

```ts
  consentChanges: NotesConsentChange[] = [];

  async putNotesConsent(_familyId: string, change: NotesConsentChange): Promise<void> {
    this.consentChanges = [...this.consentChanges.filter((c) => c.clientId !== change.clientId), change];
    this.context = { ...this.context, freeTextNotesAuthorized: change.notesAuthorized };
  }
```

Cambie cada llamada `listOwnLog(store, store.context)` por `listOwnLog(store, store.context, MOTHER)`.
Luego agregue al final del archivo:

```ts
describe('consentimiento de notas desde la PWA (D-025)', () => {
  function consentItem(overrides: Record<string, unknown> = {}): SyncItem {
    return {
      clientId: 'c-1',
      kind: 'consentimiento',
      notesAuthorized: true,
      at: '2026-09-20T13:00:00.000Z',
      version: 'borrador-0',
      ...overrides,
    } as SyncItem;
  }

  test('guarda el cambio con quién lo hizo y cuándo, y cambia el permiso', async () => {
    const [result] = await applySync(store, store.context, MOTHER, [consentItem()], TODAY, NOW);
    assert.equal(result?.status, 'ok');
    assert.equal(store.context.freeTextNotesAuthorized, true);
    assert.deepEqual(store.consentChanges, [{
      clientId: 'c-1', notesAuthorized: true, at: '2026-09-20T13:00:00.000Z',
      version: 'borrador-0', changedBy: MOTHER,
    }]);
  });

  test('revocar funciona igual, y el historial propio devuelve el estado nuevo', async () => {
    store.context = { ...store.context, freeTextNotesAuthorized: true };
    await applySync(store, store.context, MOTHER, [consentItem({ notesAuthorized: false })], TODAY, NOW);
    assert.equal((await listOwnLog(store, store.context, MOTHER)).notesAuthorized, false);
  });

  test('reenviar el mismo cambio no crea un segundo registro', async () => {
    await applySync(store, store.context, MOTHER, [consentItem()], TODAY, NOW);
    await applySync(store, store.context, MOTHER, [consentItem()], TODAY, NOW);
    assert.equal(store.consentChanges.length, 1);
  });

  test('rechaza un cambio sin booleano, sin fecha válida o sin versión', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      consentItem({ clientId: 'a', notesAuthorized: 'si' }),
      consentItem({ clientId: 'b', at: 'ayer' }),
      consentItem({ clientId: 'c', version: '' }),
    ], TODAY, NOW);
    assert.deepEqual(results.map((r) => r.status), ['rechazado', 'rechazado', 'rechazado']);
    assert.equal(store.consentChanges.length, 0);
  });
});

describe('historial propio: estado para la pantalla de privacidad', () => {
  test('devuelve la relación declarada por el cuidador de este teléfono', async () => {
    assert.equal((await listOwnLog(store, store.context, MOTHER)).relation, 'mama');
    assert.equal((await listOwnLog(store, store.context, FATHER)).relation, null);
  });
});
```

En `test/adapters/keys.test.ts`, agregue:

```ts
  test('a consent change carries its client id, so a replay overwrites it', () => {
    assert.equal(SK.consentChange('2026-09-20T13:00:00.000Z', 'c-1'), 'CONSENT#2026-09-20T13:00:00.000Z#c-1');
    assert.ok(SK.consentChange('x', 'y').startsWith('CONSENT#'));
  });
```
(si el archivo no importa `SK`, agréguelo al import de `../../src/adapters/keys.ts`).

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd backend && node --test test/handlers/family-api.test.ts test/adapters/keys.test.ts`
Expected: FAIL: tipo `consentimiento` desconocido, `SK.consentChange` no existe, `notesAuthorized` y
`relation` en `undefined`.

- [ ] **Step 3: Implementar**

En `keys.ts`, dentro de `SK`, debajo de `consent`:

```ts
  // A change made from the PWA (D-025). Same CONSENT# prefix as the enrolment record, plus the
  // client id so that replaying the queued change rewrites it instead of adding a second proof.
  consentChange: (isoTs: string, clientId: string) => `CONSENT#${isoTs}#${clientId}`,
```

En `family-ports.ts`, antes de `FamilyStore`:

```ts
/** The family changing whether the team may read its notes, from the privacy screen (D-025). */
export interface NotesConsentChange {
  readonly clientId: string;
  readonly notesAuthorized: boolean;
  /** When the caregiver flipped the switch, from the device's clock. */
  readonly at: string;
  /** Version of the text shown on the privacy screen when the change was made. */
  readonly version: string;
  /** The caregiver whose signed token sent the change. */
  readonly changedBy: string;
}
```

y agregue a `FamilyStore`:

```ts
  putNotesConsent(familyId: string, change: NotesConsentChange): Promise<void>;
```

En `adapters/family-store.ts`, importe `NotesConsentChange` y agregue el método después de `putAccess`:

```ts
  /**
   * The proof of the change and the flag it changes land together or not at all (D-025). The flag is
   * what `openFamilyDetail` and the export read, so revoking hides every note already sent — the
   * filter is on read (rule 8), which is what makes a revocation retroactive for free.
   */
  async putNotesConsent(familyId: string, change: NotesConsentChange): Promise<void> {
    await this.#doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.#table,
              Item: {
                PK: KEY.family(familyId),
                SK: SK.consentChange(change.at, change.clientId),
                entity: 'consent',
                familyId,
                channel: 'pwa',
                version: change.version,
                acceptedAt: change.at,
                freeTextNotesAuthorized: change.notesAuthorized,
                changedBy: change.changedBy,
                clientId: change.clientId,
              },
            },
          },
          {
            Update: {
              TableName: this.#table,
              Key: { PK: KEY.family(familyId), SK: SK.meta },
              UpdateExpression: 'SET freeTextNotesAuthorized = :value',
              ConditionExpression: 'attribute_exists(PK)',
              ExpressionAttributeValues: { ':value': change.notesAuthorized },
            },
          },
        ],
      }),
    );
  }
```

En `tracking/logic.ts`:

1. Imports: `DeclaredBy` junto a los de `log-entry.ts`.
2. Tipo `SyncItem`, agregue la variante:

```ts
  | { readonly clientId: string; readonly kind: 'consentimiento'; readonly [key: string]: unknown };
```

3. En `applySync`, antes del `else` final que lanza `Tipo desconocido`:

```ts
      } else if (item.kind === 'consentimiento') {
        const notesAuthorized = item['notesAuthorized'];
        const at = String(item['at'] ?? '');
        const version = String(item['version'] ?? '').trim();
        if (typeof notesAuthorized !== 'boolean' || Number.isNaN(Date.parse(at)) || version === '') {
          // Same rejection code as a malformed log entry: the device's queue handles both alike.
          throw new DomainError('invalid_log_entry', 'Cambio de consentimiento incompleto');
        }
        await store.putNotesConsent(context.familyId, {
          clientId: item.clientId,
          notesAuthorized,
          at: new Date(at).toISOString(),
          version,
          changedBy: principalMsisdn,
        });
```

4. Reemplace `OwnLogResponse` y `listOwnLog`:

```ts
export interface OwnLogResponse {
  readonly entries: readonly LogEntry[];
  /** Whether the team may read the notes, so the privacy screen shows the real state (D-025). */
  readonly notesAuthorized: boolean;
  /** What the caregiver on this phone declared at activation; preselects "who did it". */
  readonly relation: DeclaredBy | null;
}

/**
 * The family's own log, newest first.
 *
 * The free-text notes come back in full. The consent flag governs what a *manager* may read, never
 * what the family sees of what it wrote itself.
 */
export async function listOwnLog(
  store: FamilyStore,
  context: FamilyContext,
  principalMsisdn: string,
): Promise<OwnLogResponse> {
  const entries = await store.listLogEntries(context.familyId);
  return {
    entries: [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    notesAuthorized: context.freeTextNotesAuthorized,
    relation: context.caregivers.find((c) => c.msisdn === principalMsisdn)?.relation ?? null,
  };
}
```

En `tracking/index.ts`:

```ts
      return json(200, await listOwnLog(familyStore, context, principal.msisdn));
```

- [ ] **Step 4: Tests en verde**

```bash
cd backend && npm run typecheck && npm test
```
Expected: PASS. Si el typecheck falla en `e2e/ciclo-completo.test.ts` porque su `InMemoryStore` implementa
`FamilyStore`, agréguele un `putNotesConsent` que guarde el cambio en un arreglo, igual que el fake.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(tracking): families can grant or revoke notes consent from the PWA

A 'consentimiento' item travels through the same offline queue and Lambda as the log; it writes a
CONSENT# proof and flips the flag in one transaction. No new function (rule 2).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 2.2: `buildDashboard`, la lógica del tablero y del reporte

**Files:**
- Create: `backend/src/handlers/admin/dashboard.ts`
- Modify: `backend/src/handlers/admin/logic.ts` (exportar `withinLastDays`)
- Test: `backend/test/handlers/admin-dashboard.test.ts` (*nuevo*)

- [ ] **Step 1: Exportar el helper existente**

En `admin/logic.ts`, cambie `function withinLastDays(` por `export function withinLastDays(`.

- [ ] **Step 2: Escribir el test que falla**

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate } from '../../src/domain/dates.ts';
import { createFeedback } from '../../src/domain/feedback.ts';
import type { LogEntry } from '../../src/domain/log-entry.ts';
import { buildDashboard } from '../../src/handlers/admin/dashboard.ts';
import type { FamilyRecord, ProgramSummary } from '../../src/handlers/admin/ports.ts';

const TODAY = isoDate('2026-10-06');
const PROGRAM: ProgramSummary = {
  programId: 'piloto-2026', programWeeks: 8, templateName: 'nplp_semana',
  languageCode: 'es', replyTemplateName: 'nplp_respuesta',
};

function entry(date: string, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    clientId: `c-${date}-${Math.random()}`, date: isoDate(date), kind: 'lectura', minutes: 5,
    resourceId: null, note: 'texto privado de la familia', loggedBy: 'principal', declaredBy: null,
    ...overrides,
  };
}

function family(familyId: string, anchor: string, overrides: Partial<FamilyRecord> = {}): FamilyRecord {
  return {
    familyId, programId: PROGRAM.programId, status: 'activa', anchorDate: isoDate(anchor),
    babyName: `Bebé ${familyId}`, freeTextNotesAuthorized: false,
    caregivers: [{ msisdn: '+51987654321', role: 'principal', optIn: true, lastInboundAt: null, relation: null }],
    logEntries: [], feedback: [], deliveredIsoWeeks: [], lastAccessAt: null,
    ...overrides,
  };
}

// fam-1 entered in week 1 of the pilot and logged twice this week (programme week 3).
// fam-2 entered a week later and logged once, in its first week, then nothing.
// fam-3 entered today.
const FAMILIES = [
  family('fam-1', '2026-09-15', {
    logEntries: [entry('2026-10-05'), entry('2026-10-05', { loggedBy: 'secundario' })],
    freeTextNotesAuthorized: true,
  }),
  family('fam-2', '2026-09-22', {
    logEntries: [entry('2026-09-23')],
    feedback: [createFeedback({ id: 'fb-1', type: 'consulta', channel: 'pwa', text: '¿Y el kit?', createdAt: '2026-10-01T10:00:00.000Z' })],
  }),
  family('fam-3', '2026-10-06'),
];

describe('tablero del piloto (D-026)', () => {
  test('cuenta registradas, activas en 7 días y registros de la semana', () => {
    const d = buildDashboard(FAMILIES, PROGRAM, TODAY);
    assert.equal(d.registradas, 3);
    assert.equal(d.activasEstaSemana, 1);
    assert.equal(d.registrosSemana, 2);
    assert.equal(d.registrosTotales, 3);
  });

  test('"sin registros en 7 días" solo cuenta familias que ya llevan una semana', () => {
    // fam-3 entered today: it has not had a chance to log, and flagging it would be noise.
    assert.equal(buildDashboard(FAMILIES, PROGRAM, TODAY).sinRegistros7Dias, 1);
  });

  test('la semana del piloto se cuenta desde la primera familia y no pasa del programa', () => {
    assert.equal(buildDashboard(FAMILIES, PROGRAM, TODAY).semanaPiloto, 4);
    assert.equal(buildDashboard(FAMILIES, PROGRAM, isoDate('2027-03-01')).semanaPiloto, 8);
  });

  test('sin familias, todo en cero y semana 0', () => {
    const d = buildDashboard([], PROGRAM, TODAY);
    assert.equal(d.semanaPiloto, 0);
    assert.equal(d.registradas, 0);
    assert.deepEqual(d.consentimientoNotas, { autorizan: 0, de: 0 });
  });

  test('la participación por semana usa la definición de resumen.csv', () => {
    const d = buildDashboard(FAMILIES, PROGRAM, TODAY);
    assert.deepEqual(d.participacionPorSemana[0], { semana: 1, alcanzaron: 3, activas: 1 });
    assert.deepEqual(d.participacionPorSemana[2], { semana: 3, alcanzaron: 2, activas: 1 });
    assert.equal(d.participacionPorSemana.length, 8);
  });

  test('cuenta los hogares donde registran los dos cuidadores', () => {
    assert.equal(buildDashboard(FAMILIES, PROGRAM, TODAY).ambosCuidadores, 1);
  });

  test('cuenta el consentimiento de notas y los mensajes sin responder', () => {
    const d = buildDashboard(FAMILIES, PROGRAM, TODAY);
    assert.deepEqual(d.consentimientoNotas, { autorizan: 1, de: 3 });
    assert.equal(d.mensajesSinResponder, 1);
  });

  test('no lleva texto libre ni nombres: solo agregados', () => {
    const serialized = JSON.stringify(buildDashboard(FAMILIES, PROGRAM, TODAY));
    assert.equal(serialized.includes('texto privado'), false);
    assert.equal(serialized.includes('Bebé'), false);
    assert.equal(serialized.includes('kit'), false);
  });
});
```

- [ ] **Step 3: Correr y ver el fallo**

Run: `cd backend && node --test test/handlers/admin-dashboard.test.ts`
Expected: FAIL: no existe el módulo `dashboard.ts`.

- [ ] **Step 4: Implementar `dashboard.ts`**

```ts
import { daysBetween, type IsoDate } from '../../domain/dates.ts';
import { cohortIndicators, familyIndicators, type FamilyIndicatorInput } from '../../domain/indicators.ts';
import { programWeek } from '../../domain/schedule.ts';
import { withinLastDays } from './logic.ts';
import type { FamilyRecord, ProgramSummary } from './ports.ts';

export interface Dashboard {
  readonly corte: IsoDate;
  readonly programWeeks: number;
  /** Weeks since the first family entered, capped at the programme length. 0 before anyone did. */
  readonly semanaPiloto: number;
  readonly registradas: number;
  /** Families with at least one entry in the last 7 days. */
  readonly activasEstaSemana: number;
  readonly registrosSemana: number;
  readonly registrosTotales: number;
  /** Households where both the principal and the secondary caregiver have logged. */
  readonly ambosCuidadores: number;
  /** Active families at least a week in, with nothing logged in the last 7 days. */
  readonly sinRegistros7Dias: number;
  readonly mensajesSinResponder: number;
  readonly consentimientoNotas: { readonly autorizan: number; readonly de: number };
  readonly participacionPorSemana: ReadonlyArray<{
    readonly semana: number;
    readonly alcanzaron: number;
    readonly activas: number;
  }>;
}

function toIndicatorInput(family: FamilyRecord): FamilyIndicatorInput {
  return {
    familyId: family.familyId,
    clinic: '',
    status: family.status,
    anchorDate: family.anchorDate,
    enrolledAt: '',
    caregivers: family.caregivers.map((caregiver) => ({
      role: caregiver.role,
      optIn: caregiver.optIn,
      optOutAt: null,
      lastInboundAt: caregiver.lastInboundAt,
    })),
    logEntries: family.logEntries,
    deliveries: [],
    feedback: family.feedback,
  };
}

/**
 * The pilot board and the weekly report (D-026). Aggregates only, like the family list: no free
 * text and no names, so it needs neither a consent check nor an audit entry.
 *
 * Participation per week comes from `cohortIndicators`, the definition resumen.csv uses, so the
 * board and the exported summary cannot disagree. Kits and pre-enrolment outreach are not in the
 * data model; the board says so instead of showing a number.
 */
export function buildDashboard(
  families: readonly FamilyRecord[],
  program: ProgramSummary,
  today: IsoDate,
): Dashboard {
  const inputs = families.map(toIndicatorInput);
  const perFamily = inputs.map((input) => familyIndicators(input, today, program.programWeeks));
  const cohort = cohortIndicators(perFamily, inputs, program.programWeeks);

  const recent = families.map((family) => withinLastDays(family.logEntries, today, 7));
  const firstAnchor = [...families].map((f) => f.anchorDate).sort()[0];
  const semanaPiloto = firstAnchor === undefined
    ? 0
    : Math.max(0, Math.min(programWeek(firstAnchor, today), program.programWeeks));

  return {
    corte: today,
    programWeeks: program.programWeeks,
    semanaPiloto,
    registradas: families.length,
    activasEstaSemana: recent.filter((entries) => entries.length > 0).length,
    registrosSemana: recent.reduce((total, entries) => total + entries.length, 0),
    registrosTotales: cohort.entradasTotales,
    ambosCuidadores: families.filter((family) =>
      family.logEntries.some((e) => e.loggedBy === 'principal') &&
      family.logEntries.some((e) => e.loggedBy === 'secundario'),
    ).length,
    sinRegistros7Dias: families.filter((family, index) =>
      family.status === 'activa' &&
      daysBetween(family.anchorDate, today) >= 7 &&
      recent[index]!.length === 0,
    ).length,
    mensajesSinResponder: cohort.feedbackAbierto,
    consentimientoNotas: {
      autorizan: families.filter((family) => family.freeTextNotesAuthorized).length,
      de: families.length,
    },
    participacionPorSemana: cohort.retencionPorSemana.map(({ semana, alcanzaron, activas }) => ({
      semana,
      alcanzaron,
      activas,
    })),
  };
}
```

- [ ] **Step 5: Tests en verde**

Run: `cd backend && node --test test/handlers/admin-dashboard.test.ts && npm run typecheck`
Expected: PASS. Si `semanaPiloto` da 3 en vez de 4, verifique `programWeek` en
`src/domain/schedule.ts`. Con ancla 2026-09-15 y corte 2026-10-06 van 21 días, que es la semana 4 según
el test `'opens weeks 1 to the current one'` de `family-api.test.ts`. **Corrija la aritmética del test,
no la del dominio.**

- [ ] **Step 6: Commit**

```bash
git add backend/src/handlers/admin/dashboard.ts backend/src/handlers/admin/logic.ts backend/test/handlers/admin-dashboard.test.ts
git commit -m "feat(admin): pilot dashboard aggregates, built on the same cohort indicators as the export

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 2.3: Auditoría legible, conteo de notas y datos extra del listado

**Files:**
- Modify: `backend/src/handlers/admin/ports.ts`, `backend/src/handlers/admin/logic.ts`,
  `backend/src/adapters/admin-store.ts`
- Test: `backend/test/handlers/admin.test.ts`

- [ ] **Step 1: Tests que fallan**

En `admin.test.ts`, importe `listRecentAudit` y `recentAuditMonths` desde `logic.ts`, y agregue al
`FakeAdminStore`:

```ts
  async listAudit(months: readonly string[]): Promise<AuditEntry[]> {
    return this.audit.filter((entry) => months.includes(entry.at.slice(0, 7)));
  }
```

Agregue al final del archivo:

```ts
describe('auditoría de accesos (pantalla 14)', () => {
  function audited(at: string): AuditEntry {
    return { gestorSub: 's', gestorEmail: 'maria.p@leerenfamilia.pe', action: 'ver_detalle_familia', familyId: 'fam-1', at };
  }

  test('lee este mes y el anterior, del más nuevo al más viejo', async () => {
    store.audit = [
      audited('2026-08-31T10:00:00.000Z'),
      audited('2026-09-20T09:00:00.000Z'),
      audited('2026-09-19T17:00:00.000Z'),
      audited('2026-07-01T10:00:00.000Z'),
    ];
    const entries = await listRecentAudit(store, GESTOR, TODAY);
    assert.deepEqual(entries.map((e) => e.at), [
      '2026-09-20T09:00:00.000Z', '2026-09-19T17:00:00.000Z', '2026-08-31T10:00:00.000Z',
    ]);
  });

  test('cruza el cambio de año', () => {
    assert.deepEqual(recentAuditMonths(isoDate('2026-01-15'), 2), ['2026-01', '2025-12']);
  });

  test('rechaza a quien no es gestor', async () => {
    await assert.rejects(
      () => listRecentAudit(store, { ...GESTOR, groups: [] }, TODAY),
      (e: unknown) => e instanceof DomainError && e.code === 'forbidden',
    );
  });
});

describe('ficha: notas sin consentimiento (pantalla 11)', () => {
  test('cuenta las notas aunque no las muestre', async () => {
    store.families.set('fam-1', family({
      logEntries: [entry({ note: 'algo privado' }), entry({ note: null }), entry({ note: 'otra' })],
    }));
    const detail = await openFamilyDetail(store, GESTOR, 'fam-1', TODAY, NOW);
    assert.equal(detail.notesVisible, false);
    assert.equal(detail.notesCount, 2);
    assert.equal(detail.entries.every((e) => e.note === null), true);
  });
});

describe('listado: datos para estado y cuidadores (pantalla 10)', () => {
  test('lleva la fecha del último registro, el total y la relación de cada cuidador', () => {
    const rows = buildFamilyRows([family({
      logEntries: [entry({ date: isoDate('2026-09-10') }), entry({ date: isoDate('2026-09-19') })],
      caregivers: [{ msisdn: '+51987654321', role: 'principal', optIn: true, lastInboundAt: null, relation: 'mama' }],
    })], PROGRAM, TODAY);
    assert.equal(rows[0]?.lastEntryDate, '2026-09-19');
    assert.equal(rows[0]?.totalEntries, 2);
    assert.deepEqual(rows[0]?.caregivers, [{ role: 'principal', relation: 'mama', optIn: true }]);
    assert.equal(JSON.stringify(rows).includes('+51'), false, 'el listado no lleva teléfonos');
  });
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd backend && node --test test/handlers/admin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `admin/ports.ts`, agregue a `AdminStore`:

```ts
  /** Audit entries of the given `yyyy-mm` months, in any order. */
  listAudit(months: readonly string[]): Promise<AuditEntry[]>;
```

En `admin/logic.ts`:

1. Importe `AuditEntry` en la línea de `./ports.ts`.
2. En la interfaz `FamilyRow`, agregue:

```ts
  readonly lastEntryDate: string | null;
  readonly totalEntries: number;
  /** Role and declared relation only: the list never carries phone numbers. */
  readonly caregivers: ReadonlyArray<{
    readonly role: 'principal' | 'secundario';
    readonly relation: FamilyRecord['caregivers'][number]['relation'];
    readonly optIn: boolean;
  }>;
```

3. En `buildFamilyRows`, dentro del objeto de cada fila, agregue:

```ts
        lastEntryDate: lastEntry,
        totalEntries: family.logEntries.length,
        caregivers: family.caregivers.map(({ role, relation, optIn }) => ({ role, relation, optIn })),
```

4. En la interfaz `FamilyDetail`, agregue:

```ts
  /**
   * How many entries carry a note. Shown even without consent — it says that notes exist, never
   * what they say — so the manager understands why the column is empty (rule 8, screen 11).
   */
  readonly notesCount: number;
```

y en el `return` de `openFamilyDetail`:

```ts
    notesCount: family.logEntries.filter((entry) => entry.note !== null && entry.note !== '').length,
```

5. Al final del archivo:

```ts
/** The months the audit screen reads, newest first: this one and the ones before it. */
export function recentAuditMonths(today: IsoDate, count: number): string[] {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7),
  );
}

/**
 * The access log as a screen (14). The full log is still one export away (`auditoria.csv`); this
 * shows the last two months so it answers "who opened what, recently" without a Scan.
 */
export async function listRecentAudit(
  store: AdminStore,
  gestor: Gestor,
  today: IsoDate,
  months = 2,
): Promise<AuditEntry[]> {
  assertIsGestor(gestor);
  const entries = await store.listAudit(recentAuditMonths(today, months));
  return [...entries].sort((a, b) => b.at.localeCompare(a.at));
}
```

En `adapters/admin-store.ts`, importe `AuditEntry` (ya está en la línea de ports) y agregue:

```ts
  /** One Query per month partition. The audit PK is AUDIT#yyyy-mm, so no Scan is needed. */
  async listAudit(months: readonly string[]): Promise<AuditEntry[]> {
    const pages = await Promise.all(months.map((month) => this.#queryAll({ pk: KEY.auditMonth(month) })));
    return pages.flat().map((item) => ({
      gestorSub: String(item['gestorSub']),
      gestorEmail: String(item['gestorEmail'] ?? ''),
      action: item['action'] as AuditEntry['action'],
      familyId: typeof item['familyId'] === 'string' ? item['familyId'] : null,
      at: String(item['at']),
      ...(typeof item['detail'] === 'string' ? { detail: item['detail'] } : {}),
    }));
  }
```

- [ ] **Step 4: Tests en verde**

Run: `cd backend && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(admin): audit log listing, note count without content, and list fields for status

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 2.4: Las rutas `/tablero` y `/auditoria`

**Files:**
- Modify: `backend/src/handlers/admin/index.ts`

`index.ts` crea clientes de AWS al cargarse y no se puede importar desde un test (ver el comentario de
`gestorFrom`). La lógica ya está probada en 2.2 y 2.3; aquí solo se enruta.

- [ ] **Step 1: Enrutar**

Agregue a los imports:

```ts
import { buildDashboard } from './dashboard.ts';
```

y agregue `listRecentAudit` a la lista que se importa de `./logic.ts`. Después del bloque de
`familias/:id`, agregue:

```ts
    if (path[0] === 'tablero' && method === 'GET') {
      // Aggregates only (D-026): no free text, so no consent check and no audit entry, like the list.
      const families = await store.listFamilies(program.programId);
      return json(200, buildDashboard(families, program, today));
    }

    if (path[0] === 'auditoria' && method === 'GET') {
      return json(200, { entradas: await listRecentAudit(store, gestor, today) });
    }
```

- [ ] **Step 2: Verificar**

```bash
cd backend && npm run typecheck && npm test && cd ..
sam validate --template infra/template.yaml --lint
sam build --template infra/template.yaml
node scripts/verificar-build.mjs
```
Expected: todo pasa; siguen siendo siete artefactos. **No despliegue**: el deploy va al final, con el
usuario (ver fase 6).

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/admin/index.ts
git commit -m "feat(admin): route GET /api/gestor/tablero and /api/gestor/auditoria

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
