# Fase 3 — Web: cola y lógica pura, con tests

Ver [`00-indice.md`](00-indice.md). `node --test` no lee JSX, así que todo lo que decide qué mostrar vive
en módulos `.ts` sin React ni DOM, como `historial.ts` y `cerebro.ts`. Los componentes de las fases 4 y 5
solo pintan. Los módulos de `gestor/` que se prueban **no importan valores de `api.ts` ni de `auth.ts`**
(que cargan Cognito): solo `import type`.

---

### Tarea 3.1: La cola deja deshacer y ya no pierde detalles durante un envío

**Files:**
- Modify: `web/src/shared/sync-queue.ts`, `web/src/shared/useSync.ts`
- Test: `web/test/sync-queue.test.ts`

- [ ] **Step 1: Tests que fallan**

Al final de `web/test/sync-queue.test.ts`:

```ts
describe('registro en un toque y detalles después (D-024)', () => {
  test('conserva la versión nueva si llegó mientras la vieja se enviaba', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'x', minutes: null });
    await q.flush(async (items) => {
      // The caregiver taps "Guardar y volver" while the first version is on the wire.
      await q.enqueue('bitacora', { clientId: 'x', minutes: 5 });
      return items.map((item) => ({ clientId: item.clientId, status: 'ok' as const }));
    });
    assert.equal(storage.items.get('x')?.payload['minutes'], 5, 'la versión con detalles sigue en cola');
  });

  test('sí quita el ítem si nadie lo cambió durante el envío', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'x', minutes: null });
    await q.flush(allOk);
    assert.equal(storage.items.has('x'), false);
  });

  test('consentimiento es un tipo de ítem válido', async () => {
    const id = await queue().enqueue('consentimiento', { clientId: 'c', notesAuthorized: false });
    assert.equal(storage.items.get(id)?.kind, 'consentimiento');
  });
});

describe('discard', () => {
  test('quita un ítem que todavía no salió', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'x' });
    assert.equal(await q.discard('x'), true);
    assert.equal(await q.pendingCount(), 0);
  });

  test('no puede deshacer lo que ya se está enviando', async () => {
    const q = queue();
    await q.enqueue('bitacora', { clientId: 'x' });
    let during: boolean | undefined;
    await q.flush(async (items) => {
      during = await q.discard('x');
      return items.map((item) => ({ clientId: item.clientId, status: 'ok' as const }));
    });
    assert.equal(during, false);
  });

  test('devuelve false para algo que ya no está en la cola', async () => {
    assert.equal(await queue().discard('nunca-existio'), false);
  });
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd web && node --test test/sync-queue.test.ts`
Expected: FAIL: `discard` no existe; el primer test encuentra el ítem borrado.

- [ ] **Step 3: Implementar en `sync-queue.ts`**

Cambie el tipo:

```ts
export type QueuedKind = 'bitacora' | 'acceso' | 'feedback' | 'consentimiento';
```

En la clase, junto a `#flushing`, agregue:

```ts
  /** Client ids of the batch currently on the wire. They can no longer be undone. */
  #inFlight = new Set<string>();
```

Agregue el método `discard` después de `snapshot`:

```ts
  /**
   * Drops an item that has not left the device. Returns false when it already did — or is leaving
   * right now — because then the server has it, and the log never takes anything back (D-024).
   */
  async discard(clientId: string): Promise<boolean> {
    if (this.#inFlight.has(clientId)) return false;
    const present = (await this.#storage.all()).some((item) => item.clientId === clientId);
    if (present) await this.#storage.remove([clientId]);
    return present;
  }
```

En `flush`, justo después de calcular `batch`, registre lo que sale y cómo salió:

```ts
      // What each item looked like when it left. If the caregiver adds details while this batch
      // is on the wire, the new version replaces it in storage under the same id, and must not be
      // dropped when the old version's `ok` comes back.
      const sentAs = new Map(batch.map((item) => [item.clientId, JSON.stringify(item.payload)]));
      for (const item of batch) this.#inFlight.add(item.clientId);
```

Reemplace la línea `if (drop.length > 0) await this.#storage.remove(drop);` que va **después** del
bloque `if (batch.length > 0) { … }` por:

```ts
      if (drop.length > 0) {
        const current = new Map((await this.#storage.all()).map((item) => [item.clientId, item]));
        const unchanged = drop.filter((id) => {
          const sent = sentAs.get(id);
          const now = current.get(id);
          // Exhausted items were never sent; everything else is dropped only if it did not change.
          return sent === undefined || now === undefined || JSON.stringify(now.payload) === sent;
        });
        if (unchanged.length > 0) await this.#storage.remove(unchanged);
      }
```

Y en el `finally`, antes de `this.#flushing = false;`:

```ts
      this.#inFlight.clear();
```

(la rama `catch` que hace `return` pasa por el `finally`, así que también limpia).

- [ ] **Step 4: Exponer `discard` en `useSync.ts`**

En `SyncState`, agregue:

```ts
  /** Undo for an entry still on the device. False when it already reached (or is reaching) the server. */
  discard: (clientId: string) => Promise<boolean>;
```

En el hook, antes del `return`:

```ts
  const discard = useCallback(
    async (clientId: string) => {
      const dropped = await queue.discard(clientId);
      await refresh();
      return dropped;
    },
    [queue, refresh],
  );
```

y agregue `discard,` al objeto devuelto.

- [ ] **Step 5: Tests en verde y commit**

```bash
cd web && npm test && npm run typecheck
git add web/src/shared/sync-queue.ts web/src/shared/useSync.ts web/test/sync-queue.test.ts
git commit -m "feat(web): undo for unsent entries, and keep details added while a batch is in flight

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 3.2: Tipos del API e historial con minutos opcionales

**Files:**
- Modify: `web/src/shared/api.ts`, `web/src/app/components/historial.ts`
- Test: `web/test/merge-historial.test.ts`

- [ ] **Step 1: Test que falla**

En `merge-historial.test.ts`, agregue `declaredBy: null` al helper `stored()`. Después agregue, dentro de
`describe('mergeHistorial', …)`:

```ts
  test('una entrada en cola sin minutos queda en null, no en cero, y lleva declaredBy', () => {
    const [entry] = mergeHistorial([], [queued('b', { minutes: null, declaredBy: 'papa' })]);
    assert.equal(entry?.minutes, null);
    assert.equal(entry?.declaredBy, 'papa');
  });

  test('una entrada del servidor anterior a D-024 queda con declaredBy null', () => {
    const legacy = { ...stored() } as Record<string, unknown>;
    delete legacy['declaredBy'];
    const [entry] = mergeHistorial([legacy as unknown as LogEntry], []);
    assert.equal(entry?.declaredBy, null);
  });
```

- [ ] **Step 2: Ver el fallo**

Run: `cd web && node --test test/merge-historial.test.ts`
Expected: FAIL (`minutes` da `0` y `declaredBy` da `undefined`).

- [ ] **Step 3: Implementar**

En `shared/api.ts`:

```ts
export type ActivityKind = 'lectura' | 'cancion' | 'juego' | 'conversacion';
export type DeclaredBy = 'mama' | 'papa' | 'otra';
```

Use `kind: ActivityKind;` dentro de `Activity`. En `LogEntry`, cambie:

```ts
  minutes: number | null;
```

y agregue `declaredBy: DeclaredBy | null;` después de `loggedBy`. Cambie `listLog`:

```ts
  listLog: () =>
    request<{ entries: LogEntry[]; notesAuthorized: boolean; relation: DeclaredBy | null }>('/seguimiento'),
```

En `historial.ts`, importe `DeclaredBy` de `../../shared/api.ts` y cambie `HistorialEntry`:

```ts
  readonly minutes: number | null;
  readonly declaredBy: DeclaredBy | null;
```

(`declaredBy` va después de `resourceId`). En el ítem que sale de la cola:

```ts
      minutes: payload['minutes'] === null || payload['minutes'] === undefined ? null : Number(payload['minutes']),
```
```ts
      declaredBy: isDeclaredBy(payload['declaredBy']) ? payload['declaredBy'] : null,
```

En el ítem que viene del servidor:

```ts
      minutes: entry.minutes ?? null,
```
```ts
      declaredBy: entry.declaredBy ?? null,
```

Y al final del archivo:

```ts
function isDeclaredBy(value: unknown): value is DeclaredBy {
  return value === 'mama' || value === 'papa' || value === 'otra';
}
```

- [ ] **Step 4: Verde, arreglar tipos y commit**

```bash
cd web && npm test && npm run typecheck
```
El typecheck marca `HistorialBitacora.tsx` (suma de minutos) y `gestor/Familias.tsx`. En
`HistorialBitacora.tsx`, cambie la suma a `total + (entry.minutes ?? 0)`; ese componente lo reemplaza
`Progreso.tsx` (tarea 4.6) y se borra en la tarea 4.10. El gestor se arregla en la 3.6.

```bash
git add web/src/shared/api.ts web/src/app/components/historial.ts web/src/app/components/HistorialBitacora.tsx web/test/merge-historial.test.ts
git commit -m "feat(web): optional minutes and declaredBy in the family log model

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 3.3: `app/formato.ts`: los textos de las pantallas de familia

**Files:**
- Create: `web/src/app/formato.ts`
- Test: `web/test/familia-formato.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_LABEL,
  colaHeadline,
  entryDetail,
  formatClock,
  pendingLabel,
  progressHeadline,
  relativeDay,
} from '../src/app/formato.ts';

describe('relativeDay', () => {
  test('hoy, ayer, día de la semana y fecha', () => {
    assert.equal(relativeDay('2026-09-14', '2026-09-14'), 'Hoy');
    assert.equal(relativeDay('2026-09-13', '2026-09-14'), 'Ayer');
    assert.equal(relativeDay('2026-09-09', '2026-09-14'), 'Miércoles');
    assert.equal(relativeDay('2026-09-01', '2026-09-14'), '1 de septiembre');
  });
});

describe('progressHeadline', () => {
  test('dice cuántas en cuántas semanas, sin metas ni porcentajes', () => {
    assert.equal(progressHeadline(14, 5), 'lecturas registradas en 5 semanas');
    assert.equal(progressHeadline(3, 1), 'lecturas registradas esta semana');
    assert.equal(progressHeadline(1, 1), 'lectura registrada esta semana');
    assert.equal(progressHeadline(1, 3), 'lectura registrada en 3 semanas');
  });
});

describe('entryDetail', () => {
  test('quién y cuánto, si se dijo; el tipo si no es lectura', () => {
    assert.equal(entryDetail({ kind: 'lectura', declaredBy: 'mama', minutes: 5 }), 'Mamá, 5 minutos');
    assert.equal(entryDetail({ kind: 'lectura', declaredBy: null, minutes: null }), 'Lectura');
    assert.equal(entryDetail({ kind: 'cancion', declaredBy: 'papa', minutes: null }), 'Canción · Papá');
    assert.equal(entryDetail({ kind: 'lectura', declaredBy: null, minutes: 1 }), '1 minuto');
  });
});

describe('cola', () => {
  test('pendingLabel y colaHeadline en singular y plural', () => {
    assert.equal(pendingLabel(1), '1 registro por enviar');
    assert.equal(pendingLabel(3), '3 registros por enviar');
    assert.equal(colaHeadline(0), 'No tienes registros esperando señal.');
    assert.equal(colaHeadline(1), 'Tienes 1 registro esperando señal.');
    assert.equal(colaHeadline(3), 'Tienes 3 registros esperando señal.');
  });
});

describe('formatClock', () => {
  test('minutos y segundos para el reproductor', () => {
    assert.equal(formatClock(38), '0:38');
    assert.equal(formatClock(112.4), '1:52');
    assert.equal(formatClock(Number.NaN), '0:00');
  });
});

test('KIND_LABEL cubre los cuatro tipos', () => {
  assert.deepEqual(Object.keys(KIND_LABEL).sort(), ['cancion', 'conversacion', 'juego', 'lectura']);
});
```

- [ ] **Step 2: Ver el fallo**

Run: `cd web && node --test test/familia-formato.test.ts`
Expected: FAIL (el módulo no existe).

- [ ] **Step 3: Implementar `web/src/app/formato.ts`**

```ts
import type { ActivityKind, DeclaredBy } from '../shared/api.ts';

/**
 * Every sentence the family screens build from data. Kept apart so it can be tested with
 * `node --test`, and so the voice stays in one place: second person, no diminutives, and nothing
 * that reads as a deficit — no streaks, no goals, no counters that go down (handoff §Interacciones).
 */

export const KIND_LABEL: Record<ActivityKind, string> = {
  lectura: 'Lectura',
  cancion: 'Canción',
  juego: 'Juego',
  conversacion: 'Conversación',
};

export const DECLARED_LABEL: Record<DeclaredBy, string> = {
  mama: 'Mamá',
  papa: 'Papá',
  otra: 'Otra persona',
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** The device's own calendar date, which is what a caregiver means by "today". */
export function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** Log entries carry a day, not a time, so this is as precise as the data allows. */
export function relativeDay(date: string, today: string): string {
  const days = Math.round((utc(today).getTime() - utc(date).getTime()) / 86_400_000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  const d = utc(date);
  if (days > 1 && days < 7) return DIAS[d.getUTCDay()]!;
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function progressHeadline(total: number, weeks: number): string {
  const noun = total === 1 ? 'lectura registrada' : 'lecturas registradas';
  return weeks <= 1 ? `${noun} esta semana` : `${noun} en ${weeks} semanas`;
}

export function entryDetail(entry: {
  kind: string;
  declaredBy: DeclaredBy | null;
  minutes: number | null;
}): string {
  const parts: string[] = [];
  if (entry.declaredBy !== null) parts.push(DECLARED_LABEL[entry.declaredBy]);
  if (entry.minutes !== null) parts.push(entry.minutes === 1 ? '1 minuto' : `${entry.minutes} minutos`);
  const who = parts.join(', ');
  const kind = KIND_LABEL[entry.kind as ActivityKind] ?? entry.kind;
  if (entry.kind === 'lectura') return who === '' ? kind : who;
  return who === '' ? kind : `${kind} · ${who}`;
}

export function pendingLabel(count: number): string {
  return count === 1 ? '1 registro por enviar' : `${count} registros por enviar`;
}

export function colaHeadline(count: number): string {
  if (count === 0) return 'No tienes registros esperando señal.';
  return count === 1 ? 'Tienes 1 registro esperando señal.' : `Tienes ${count} registros esperando señal.`;
}

export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Verde y commit**

```bash
cd web && npm test && npm run typecheck
git add web/src/app/formato.ts web/test/familia-formato.test.ts
git commit -m "feat(web): family screen copy helpers, tested

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 3.4: `app/registro-rapido.ts`: el registro en un toque

**Files:**
- Create: `web/src/app/registro-rapido.ts`
- Test: `web/test/registro-rapido.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_COPY,
  MINUTE_OPTIONS,
  WHO_OPTIONS,
  detailsPayload,
  firstTapPayload,
} from '../src/app/registro-rapido.ts';

describe('registro en un toque', () => {
  const first = firstTapPayload({ clientId: 'x', date: '2026-09-14', kind: 'lectura', resourceId: null });

  test('el primer toque no pide ni inventa nada opcional', () => {
    assert.deepEqual(first, {
      clientId: 'x', date: '2026-09-14', kind_actividad: 'lectura',
      minutes: null, resourceId: null, note: null, declaredBy: null,
    });
  });

  test('los detalles reescriben la misma entrada: mismo clientId y misma fecha', () => {
    const details = detailsPayload(first, { minutes: 5, declaredBy: 'papa', note: '  nos miró  ' });
    assert.equal(details['clientId'], 'x');
    assert.equal(details['date'], '2026-09-14');
    assert.equal(details['minutes'], 5);
    assert.equal(details['declaredBy'], 'papa');
    assert.equal(details['note'], 'nos miró');
  });

  test('una nota vacía queda en null', () => {
    assert.equal(detailsPayload(first, { minutes: null, declaredBy: null, note: '   ' })['note'], null);
  });

  test('las opciones son las del diseño', () => {
    assert.deepEqual(MINUTE_OPTIONS.map((o) => o.label), ['2 min', '5 min', '10+ min']);
    assert.deepEqual(WHO_OPTIONS.map((o) => o.label), ['Mamá', 'Papá', 'Otra']);
    assert.equal(KIND_COPY.lectura.boton, 'Registrar lectura');
    assert.equal(KIND_COPY.cancion.hecho, 'Ya la cantamos');
  });
});
```

- [ ] **Step 2: Ver el fallo**, con `cd web && node --test test/registro-rapido.test.ts`.

- [ ] **Step 3: Implementar `web/src/app/registro-rapido.ts`**

```ts
import type { ActivityKind, DeclaredBy } from '../shared/api.ts';

/**
 * Logging in one tap (D-024). The rule the design sets: nothing optional is asked before the entry
 * is confirmed. The first tap writes the entry with no duration and no "who"; the details, if the
 * caregiver adds them, rewrite the same entry — same client id and same date, hence the same
 * DynamoDB item — rather than creating a second one.
 */

export const WHO_OPTIONS: ReadonlyArray<{ value: DeclaredBy; label: string }> = [
  { value: 'mama', label: 'Mamá' },
  { value: 'papa', label: 'Papá' },
  { value: 'otra', label: 'Otra' },
];

/** The activation screen's wording for the same three options. */
export const RELATION_OPTIONS: ReadonlyArray<{ value: DeclaredBy; label: string }> = [
  { value: 'mama', label: 'Mamá' },
  { value: 'papa', label: 'Papá' },
  { value: 'otra', label: 'Otra persona que cuida' },
];

/** "10+" is stored as 10: the chip means "ten or more", and the indicator is a lower bound. */
export const MINUTE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10+ min' },
];

export const KIND_COPY: Record<
  ActivityKind,
  { pregunta: string; boton: string; hecho: string; confirmado: string }
> = {
  lectura: { pregunta: '¿Leyeron hoy?', boton: 'Registrar lectura', hecho: 'Ya la leímos', confirmado: 'Lectura registrada' },
  cancion: { pregunta: '¿Cantaron hoy?', boton: 'Registrar canción', hecho: 'Ya la cantamos', confirmado: 'Canción registrada' },
  juego: { pregunta: '¿Jugaron hoy?', boton: 'Registrar juego', hecho: 'Ya jugamos', confirmado: 'Juego registrado' },
  conversacion: { pregunta: '¿Conversaron hoy?', boton: 'Registrar conversación', hecho: 'Ya conversamos', confirmado: 'Conversación registrada' },
};

export function firstTapPayload(input: {
  clientId: string;
  date: string;
  kind: ActivityKind;
  resourceId: string | null;
}): Record<string, unknown> {
  return {
    clientId: input.clientId,
    date: input.date,
    kind_actividad: input.kind,
    minutes: null,
    resourceId: input.resourceId,
    note: null,
    declaredBy: null,
  };
}

export function detailsPayload(
  first: Record<string, unknown>,
  details: { minutes: number | null; declaredBy: DeclaredBy | null; note: string },
): Record<string, unknown> {
  const note = details.note.trim();
  return {
    ...first,
    minutes: details.minutes,
    declaredBy: details.declaredBy,
    note: note === '' ? null : note,
  };
}
```

- [ ] **Step 4: Verde y commit**

```bash
cd web && npm test && npm run typecheck
git add web/src/app/registro-rapido.ts web/test/registro-rapido.test.ts
git commit -m "feat(web): one-tap logging payloads, with details rewriting the same entry

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 3.5: `app/cola.ts` y `app/privacidad.ts`

**Files:**
- Create: `web/src/app/cola.ts`, `web/src/app/privacidad.ts`
- Test: `web/test/familia-cola-privacidad.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { QueuedItem } from '../src/shared/sync-queue.ts';
import { describeQueued, visibleQueue } from '../src/app/cola.ts';
import {
  CONSENT_TEXT_VERSION,
  SUPPRESSION_REQUEST_TEXT,
  consentPayload,
  effectiveNotesConsent,
  suppressionPayload,
} from '../src/app/privacidad.ts';

function item(kind: QueuedItem['kind'], payload: Record<string, unknown>, queuedAt = '2026-09-14T08:00:00.000Z'): QueuedItem {
  return { clientId: String(payload['clientId'] ?? kind), kind, payload, queuedAt, attempts: 0 };
}

describe('cola visible para la familia', () => {
  test('oculta los registros de acceso, que la familia nunca hizo a mano', () => {
    const visible = visibleQueue([item('acceso', { clientId: 'a' }), item('bitacora', { clientId: 'b' })]);
    assert.deepEqual(visible.map((i) => i.clientId), ['b']);
  });

  test('describe cada ítem en palabras', () => {
    const today = '2026-09-14';
    assert.deepEqual(
      describeQueued(item('bitacora', { kind_actividad: 'lectura', minutes: 5, date: '2026-09-14' }), today),
      { titulo: 'Lectura, 5 minutos', cuando: 'Hoy' },
    );
    assert.deepEqual(
      describeQueued(item('bitacora', { kind_actividad: 'cancion', minutes: null, date: '2026-09-13' }), today),
      { titulo: 'Canción', cuando: 'Ayer' },
    );
    assert.equal(describeQueued(item('feedback', { createdAt: '2026-09-13T20:00:00.000Z' }), today).titulo, 'Mensaje al equipo');
    assert.equal(describeQueued(item('consentimiento', { at: '2026-09-14T08:00:00.000Z' }), today).titulo, 'Cambio de privacidad');
  });
});

describe('privacidad', () => {
  test('el estado efectivo es el último cambio en cola, o el del servidor', () => {
    assert.equal(effectiveNotesConsent(true, []), true);
    assert.equal(effectiveNotesConsent(null, []), null);
    const queued = [
      item('consentimiento', { clientId: 'a', notesAuthorized: false }, '2026-09-14T08:00:00.000Z'),
      item('consentimiento', { clientId: 'b', notesAuthorized: true }, '2026-09-14T09:00:00.000Z'),
    ];
    assert.equal(effectiveNotesConsent(false, queued), true);
  });

  test('el cambio lleva fecha, versión del texto y el valor nuevo', () => {
    assert.deepEqual(consentPayload('c', false, new Date('2026-09-14T08:00:00.000Z')), {
      clientId: 'c', notesAuthorized: false, at: '2026-09-14T08:00:00.000Z', version: CONSENT_TEXT_VERSION,
    });
  });

  test('el pedido de borrado es un feedback de tipo pedido con texto fijo (D-027)', () => {
    const payload = suppressionPayload('p', new Date('2026-09-14T08:00:00.000Z'));
    assert.equal(payload['type'], 'pedido');
    assert.equal(payload['text'], SUPPRESSION_REQUEST_TEXT);
  });
});
```

- [ ] **Step 2: Ver el fallo**, con `cd web && node --test test/familia-cola-privacidad.test.ts`.

- [ ] **Step 3: Implementar `web/src/app/cola.ts`**

```ts
import type { QueuedItem } from '../shared/sync-queue.ts';
import { KIND_LABEL, relativeDay } from './formato.ts';
import type { ActivityKind } from '../shared/api.ts';

/**
 * What the family sees of its queue. Resource accesses are queued too, but the family never made
 * one by hand; counting them would show "1 registro por enviar" for something nobody wrote.
 */
export function visibleQueue(items: readonly QueuedItem[]): QueuedItem[] {
  return items.filter((item) => item.kind !== 'acceso');
}

export function describeQueued(item: QueuedItem, today: string): { titulo: string; cuando: string } {
  const p = item.payload;
  switch (item.kind) {
    case 'bitacora': {
      const kind = KIND_LABEL[String(p['kind_actividad']) as ActivityKind] ?? 'Registro';
      const minutes = typeof p['minutes'] === 'number' ? `, ${p['minutes']} minutos` : '';
      return { titulo: `${kind}${minutes}`, cuando: relativeDay(String(p['date'] ?? today), today) };
    }
    case 'feedback':
      return { titulo: 'Mensaje al equipo', cuando: relativeDay(String(p['createdAt'] ?? item.queuedAt).slice(0, 10), today) };
    case 'consentimiento':
      return { titulo: 'Cambio de privacidad', cuando: relativeDay(String(p['at'] ?? item.queuedAt).slice(0, 10), today) };
    default:
      return { titulo: 'Registro', cuando: relativeDay(item.queuedAt.slice(0, 10), today) };
  }
}
```

- [ ] **Step 4: Implementar `web/src/app/privacidad.ts`**

```ts
import type { QueuedItem } from '../shared/sync-queue.ts';

/** The privacy screen text is a draft pending legal review, like the enrolment consent. */
export const CONSENT_TEXT_VERSION = 'borrador-0';

/**
 * The erasure endpoint does not exist yet (CLAUDE.md, Estado). Until it does, the button sends a
 * fixed request through the inbox, where a manager handles it by hand (D-027). The wording is
 * fixed so the team can recognise it and nobody has to write it under stress.
 */
export const SUPPRESSION_REQUEST_TEXT =
  'Pido que borren mis datos y los de mi bebé del programa Nacidos para Leer.';

/**
 * The state the switch shows: the latest change still waiting in the queue, or else what the server
 * said. Null means we have never heard from the server and nothing is queued — the screen says so
 * instead of guessing.
 */
export function effectiveNotesConsent(
  server: boolean | null,
  queued: readonly QueuedItem[],
): boolean | null {
  const latest = queued
    .filter((item) => item.kind === 'consentimiento' && typeof item.payload['notesAuthorized'] === 'boolean')
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
    .at(-1);
  return latest === undefined ? server : (latest.payload['notesAuthorized'] as boolean);
}

export function consentPayload(clientId: string, notesAuthorized: boolean, now: Date): Record<string, unknown> {
  return { clientId, notesAuthorized, at: now.toISOString(), version: CONSENT_TEXT_VERSION };
}

export function suppressionPayload(clientId: string, now: Date): Record<string, unknown> {
  return { clientId, type: 'pedido', text: SUPPRESSION_REQUEST_TEXT, createdAt: now.toISOString() };
}
```

- [ ] **Step 5: Verde y commit**

```bash
cd web && npm test && npm run typecheck
git add web/src/app/cola.ts web/src/app/privacidad.ts web/test/familia-cola-privacidad.test.ts
git commit -m "feat(web): queue descriptions and privacy state for the family screens

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 3.6: Lógica del gestor: tiempo, familias, auditoría y reporte

**Files:**
- Modify: `web/src/gestor/api.ts`
- Create: `web/src/gestor/tiempo.ts`, `web/src/gestor/familias-estado.ts`, `web/src/gestor/auditoria.ts`,
  `web/src/gestor/reporte.ts`, `web/src/gestor/descargar.ts`
- Test: `web/test/gestor-logica.test.ts`

- [ ] **Step 1: Tipos en `gestor/api.ts`**

En `FamilyRow`, agregue:

```ts
  lastEntryDate: string | null;
  totalEntries: number;
  caregivers: Array<{ role: 'principal' | 'secundario'; relation: 'mama' | 'papa' | 'otra' | null; optIn: boolean }>;
```

En `LogSummary`, agregue `entriesWithMinutes: number;`. En `FamilyDetail`:

```ts
  entries: Array<{
    date: string; kind: string; minutes: number | null; note: string | null;
    loggedBy: string; declaredBy: 'mama' | 'papa' | 'otra' | null;
  }>;
  notesVisible: boolean;
  notesCount: number;
  feedback: Feedback[];
  caregivers: Array<{ msisdn: string; role: string; optIn: boolean; relation: 'mama' | 'papa' | 'otra' | null }>;
```

Agregue las interfaces nuevas y las dos llamadas:

```ts
export interface Dashboard {
  corte: string;
  programWeeks: number;
  semanaPiloto: number;
  registradas: number;
  activasEstaSemana: number;
  registrosSemana: number;
  registrosTotales: number;
  ambosCuidadores: number;
  sinRegistros7Dias: number;
  mensajesSinResponder: number;
  consentimientoNotas: { autorizan: number; de: number };
  participacionPorSemana: Array<{ semana: number; alcanzaron: number; activas: number }>;
}

export interface AuditEntry {
  gestorSub: string;
  gestorEmail: string;
  action: 'ver_detalle_familia' | 'exportar_datos' | 'responder_feedback';
  familyId: string | null;
  at: string;
  detail?: string;
}
```
```ts
  tablero: () => request<Dashboard>('/tablero'),
  auditoria: () => request<{ entradas: AuditEntry[] }>('/auditoria'),
```

- [ ] **Step 2: Test que falla, `web/test/gestor-logica.test.ts`**

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Dashboard, FamilyRow } from '../src/gestor/api.ts';
import { daysSince, limaToday, rangoSemana, shortId, whenLabel } from '../src/gestor/tiempo.ts';
import { caregiversLabel, estadoFamilia, filterRows, lastEntryLabel } from '../src/gestor/familias-estado.ts';
import { auditRow } from '../src/gestor/auditoria.ts';
import { MAILTO_MAX, mailtoHref, participationBars, reportPlainText, reportSummary } from '../src/gestor/reporte.ts';

function row(overrides: Partial<FamilyRow> = {}): FamilyRow {
  return {
    familyId: 'a1b2c3d4-0000', babyName: 'Mateo', status: 'activa', programWeek: 3, finished: false,
    logEntriesLast7Days: 2, minutesLast7Days: 10, lastActivityAt: null, openFeedback: 0,
    caregiversOptedIn: 1, deliveries: 2, lastEntryDate: '2026-09-13', totalEntries: 5,
    caregivers: [{ role: 'principal', relation: 'mama', optIn: true }], ...overrides,
  };
}

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    corte: '2026-09-09', programWeeks: 8, semanaPiloto: 5, registradas: 41, activasEstaSemana: 33,
    registrosSemana: 89, registrosTotales: 112, ambosCuidadores: 18, sinRegistros7Dias: 8,
    mensajesSinResponder: 3, consentimientoNotas: { autorizan: 29, de: 41 },
    participacionPorSemana: [1, 2, 3, 4, 5, 6, 7, 8].map((semana) => ({ semana, alcanzaron: semana <= 5 ? 41 : 0, activas: semana <= 5 ? 30 : 0 })),
    ...overrides,
  };
}

describe('tiempo (hora de Lima, sin horario de verano)', () => {
  test('limaToday resta cinco horas', () => {
    assert.equal(limaToday(new Date('2026-09-15T03:00:00.000Z')), '2026-09-14');
  });
  test('whenLabel: hoy, ayer o fecha corta, con hora de Lima', () => {
    assert.equal(whenLabel('2026-09-14T14:14:00.000Z', '2026-09-14'), 'Hoy 09:14');
    assert.equal(whenLabel('2026-09-13T22:48:00.000Z', '2026-09-14'), 'Ayer 17:48');
    assert.equal(whenLabel('2026-09-11T16:05:00.000Z', '2026-09-14'), '11 sep 11:05');
  });
  test('daysSince, rangoSemana y shortId', () => {
    assert.equal(daysSince('2026-09-12T10:00:00.000Z', '2026-09-14'), 2);
    assert.equal(rangoSemana('2026-09-09'), '3 al 9 de septiembre de 2026');
    assert.equal(rangoSemana('2026-09-03'), '28 de agosto al 3 de septiembre de 2026');
    assert.equal(shortId('a1b2c3d4-0000'), 'F-A1B2C3');
  });
  test('rangoSemana incluye el año de inicio cuando la semana cruza el 1 de enero', () => {
    assert.equal(rangoSemana('2026-01-03'), '28 de diciembre de 2025 al 3 de enero de 2026');
  });
});

describe('estado de una familia', () => {
  test('activa, en pausa, sin activar, de baja', () => {
    assert.equal(estadoFamilia(row()), 'activa');
    assert.equal(estadoFamilia(row({ logEntriesLast7Days: 0 })), 'en_pausa');
    assert.equal(estadoFamilia(row({ logEntriesLast7Days: 0, totalEntries: 0 })), 'sin_activar');
    assert.equal(estadoFamilia(row({ status: 'baja' })), 'de_baja');
  });
  test('cuidadores por relación, con el rol si no la declararon', () => {
    assert.equal(caregiversLabel(row().caregivers), 'Mamá');
    assert.equal(caregiversLabel([
      { role: 'principal', relation: null, optIn: true },
      { role: 'secundario', relation: 'papa', optIn: true },
    ]), 'Principal, Papá');
  });
  test('último registro', () => {
    assert.equal(lastEntryLabel(null, '2026-09-14'), 'Sin registros');
    assert.equal(lastEntryLabel('2026-09-14', '2026-09-14'), 'Hoy');
    assert.equal(lastEntryLabel('2026-09-13', '2026-09-14'), 'Hace 1 día');
    assert.equal(lastEntryLabel('2026-09-05', '2026-09-14'), 'Hace 9 días');
  });
  test('filtra por texto, semana y estado', () => {
    const rows = [row(), row({ familyId: 'b', babyName: 'Luz', programWeek: 1, logEntriesLast7Days: 0 })];
    assert.equal(filterRows(rows, { query: 'luz', semana: null, estado: null }).length, 1);
    assert.equal(filterRows(rows, { query: '', semana: 3, estado: null }).length, 1);
    assert.equal(filterRows(rows, { query: '', semana: null, estado: 'en_pausa' })[0]?.babyName, 'Luz');
  });
});

describe('auditoría', () => {
  test('una exportación se marca en alerta y dice qué se exportó', () => {
    const r = auditRow({ gestorSub: 's', gestorEmail: 'maria.p@leerenfamilia.pe', action: 'exportar_datos', familyId: null, at: '2026-09-14T14:02:00.000Z', detail: 'bitacora' }, '2026-09-14');
    assert.deepEqual(r, { cuando: 'Hoy 09:02', quien: 'maria.p', que: 'Bitácora completa', accion: 'Exportar', alerta: true });
  });
  test('abrir una ficha nombra a la familia por su id corto', () => {
    const r = auditRow({ gestorSub: 's', gestorEmail: 'jose.d@x.pe', action: 'ver_detalle_familia', familyId: 'a1b2c3d4-0000', at: '2026-09-13T22:48:00.000Z' }, '2026-09-14');
    assert.equal(r.que, 'Familia F-A1B2C3');
    assert.equal(r.alerta, false);
  });
});

describe('reporte semanal', () => {
  test('barras: pasadas, la actual en coral, futuras vacías', () => {
    const bars = participationBars(dashboard());
    assert.equal(bars.length, 8);
    assert.equal(bars[4]?.estado, 'actual');
    assert.equal(bars[0]?.estado, 'pasada');
    assert.equal(bars[5]?.estado, 'futura');
    assert.equal(bars[0]?.porcentaje, 73);
  });
  test('el resumen solo afirma lo que los datos dicen', () => {
    const text = reportSummary(dashboard());
    assert.match(text, /33 de las 41 familias registradas leyeron al menos una vez esta semana\./);
    assert.match(text, /89 registros en los últimos 7 días, una media de 2,7 por familia activa\./);
    assert.match(text, /3 mensajes de familias esperan respuesta\./);
    assert.equal(/kit/i.test(text), false, 'no hay datos de kits, así que no los menciona');
  });
  test('sin familias no divide por cero', () => {
    assert.equal(reportSummary(dashboard({ registradas: 0, activasEstaSemana: 0, registrosSemana: 0, mensajesSinResponder: 0 })), 'Todavía no hay familias registradas en el piloto.');
  });
  test('el texto plano incluye las observaciones y el pie de privacidad', () => {
    const text = reportPlainText(dashboard(), 'Entregas en el control\n\nMás lecturas de noche', new Date('2026-09-10T15:00:00.000Z'));
    assert.match(text, /- Entregas en el control\n- Más lecturas de noche/);
    assert.match(text, /no contiene notas de familias sin consentimiento/);
  });
  test('mailtoHref no toca un cuerpo corto', () => {
    const href = mailtoHref('Reporte semanal', 'Cuerpo corto');
    assert.equal(href, `mailto:?subject=${encodeURIComponent('Reporte semanal')}&body=${encodeURIComponent('Cuerpo corto')}`);
  });
  test('mailtoHref recorta un cuerpo largo para no exceder MAILTO_MAX', () => {
    const href = mailtoHref('Reporte semanal', 'x'.repeat(5000));
    assert.ok(href.length <= MAILTO_MAX, `href.length fue ${href.length}`);
    assert.match(decodeURIComponent(href), /Resumen recortado: use "Copiar resumen como texto" para el texto completo\./);
  });
});
```

- [ ] **Step 3: Ver el fallo**, con `cd web && node --test test/gestor-logica.test.ts`.

- [ ] **Step 4: Implementar `web/src/gestor/tiempo.ts`**

```ts
/**
 * Dates for the manager, in Lima time. Peru has no daylight saving, so the offset is a constant;
 * using Intl here would make the output depend on the laptop's locale data.
 */
const LIMA_OFFSET_MS = -5 * 3_600_000;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = MESES.map((mes) => mes.slice(0, 3));

function lima(iso: string | Date): Date {
  return new Date((typeof iso === 'string' ? Date.parse(iso) : iso.getTime()) + LIMA_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayMs = (date: string) => Date.parse(`${date}T00:00:00.000Z`);

export function limaToday(now: Date): string {
  return lima(now).toISOString().slice(0, 10);
}

/** "Hoy 09:14", "Ayer 17:48", "11 sep 11:05". */
export function whenLabel(iso: string, today: string): string {
  const d = lima(iso);
  const date = d.toISOString().slice(0, 10);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const days = Math.round((dayMs(today) - dayMs(date)) / 86_400_000);
  if (days === 0) return `Hoy ${time}`;
  if (days === 1) return `Ayer ${time}`;
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]} ${time}`;
}

export function daysSince(iso: string, today: string): number {
  return Math.max(0, Math.round((dayMs(today) - dayMs(lima(iso).toISOString().slice(0, 10))) / 86_400_000));
}

export function fechaLarga(date: string): string {
  const d = new Date(dayMs(date));
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/**
 * The seven days ending on the cutoff: "3 al 9 de septiembre de 2026". When the week crosses a
 * year boundary the start needs its own year too, or "28 de diciembre al 3 de enero de 2026" reads
 * as if both dates were the same year.
 */
export function rangoSemana(corte: string): string {
  const end = new Date(dayMs(corte));
  const start = new Date(dayMs(corte) - 6 * 86_400_000);
  const startLabel = start.getUTCFullYear() !== end.getUTCFullYear()
    ? `${start.getUTCDate()} de ${MESES[start.getUTCMonth()]} de ${start.getUTCFullYear()}`
    : start.getUTCMonth() === end.getUTCMonth()
      ? `${start.getUTCDate()}`
      : `${start.getUTCDate()} de ${MESES[start.getUTCMonth()]}`;
  return `${startLabel} al ${fechaLarga(corte)}`;
}

/**
 * A short, pseudonymous handle for a family id: the list never shows phone numbers. 6 hex chars
 * (16^6 ≈ 16.7M buckets) instead of 4 (16^4 ≈ 65k): at 50 families a birthday-paradox collision is
 * ~1.8% with 4 chars, versus ~0.007% with 6 — low enough to not worry about in a 50-family pilot.
 */
export function shortId(familyId: string): string {
  return `F-${familyId.replace(/[^0-9a-z]/gi, '').slice(0, 6).toUpperCase()}`;
}
```

- [ ] **Step 5: Implementar `web/src/gestor/familias-estado.ts`**

```ts
import type { FamilyRow } from './api.ts';

export type EstadoFamilia = 'activa' | 'en_pausa' | 'sin_activar' | 'de_baja';

export const ESTADO_LABEL: Record<EstadoFamilia, string> = {
  activa: 'Activa',
  en_pausa: 'En pausa',
  sin_activar: 'Sin activar',
  de_baja: 'De baja',
};

/** Derived from data the list already has: recent entries, all entries, and the family status. */
export function estadoFamilia(row: Pick<FamilyRow, 'status' | 'logEntriesLast7Days' | 'totalEntries'>): EstadoFamilia {
  if (row.status !== 'activa') return 'de_baja';
  if (row.totalEntries === 0) return 'sin_activar';
  return row.logEntriesLast7Days > 0 ? 'activa' : 'en_pausa';
}

const RELATION: Record<string, string> = { mama: 'Mamá', papa: 'Papá', otra: 'Otra persona' };
const ROLE: Record<string, string> = { principal: 'Principal', secundario: 'Secundario' };

export function caregiversLabel(caregivers: FamilyRow['caregivers']): string {
  return caregivers
    .map((c) => (c.relation !== null ? RELATION[c.relation] : ROLE[c.role]) ?? c.role)
    .join(', ');
}

export function lastEntryLabel(date: string | null, today: string): string {
  if (date === null) return 'Sin registros';
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'Hoy';
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
}

export function filterRows(
  rows: readonly FamilyRow[],
  filters: { query: string; semana: number | null; estado: EstadoFamilia | null },
): FamilyRow[] {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) =>
    (query === '' || row.babyName.toLowerCase().includes(query) || row.familyId.toLowerCase().includes(query)) &&
    (filters.semana === null || row.programWeek === filters.semana) &&
    (filters.estado === null || estadoFamilia(row) === filters.estado),
  );
}
```

- [ ] **Step 6: Implementar `web/src/gestor/auditoria.ts`**

```ts
import type { AuditEntry } from './api.ts';
import { shortId, whenLabel } from './tiempo.ts';

export const ACTION_LABEL: Record<AuditEntry['action'], string> = {
  ver_detalle_familia: 'Ver ficha',
  responder_feedback: 'Responder',
  exportar_datos: 'Exportar',
};

const DATASET_LABEL: Record<string, string> = {
  resumen: 'Resumen de indicadores',
  familias: 'Listado de familias',
  bitacora: 'Bitácora completa',
  envios: 'Envíos',
  feedback: 'Mensajes de las familias',
  auditoria: 'Registro de accesos',
};

export interface AuditRowView {
  cuando: string;
  quien: string;
  que: string;
  accion: string;
  /** Exports take data about minors off the platform; they are the rows worth a second look. */
  alerta: boolean;
}

export function auditRow(entry: AuditEntry, today: string): AuditRowView {
  const que = entry.familyId !== null
    ? `Familia ${shortId(entry.familyId)}`
    : DATASET_LABEL[entry.detail ?? ''] ?? entry.detail ?? '—';
  return {
    cuando: whenLabel(entry.at, today),
    quien: entry.gestorEmail.split('@')[0] || entry.gestorSub,
    que,
    accion: ACTION_LABEL[entry.action] ?? entry.action,
    alerta: entry.action === 'exportar_datos',
  };
}
```

- [ ] **Step 7: Implementar `web/src/gestor/reporte.ts`**

```ts
import type { Dashboard } from './api.ts';
import { fechaLarga, rangoSemana } from './tiempo.ts';

export interface Bar {
  semana: number;
  activas: number;
  /** Share of the families that reached the week, 0–100. */
  porcentaje: number;
  estado: 'pasada' | 'actual' | 'futura';
}

export function participationBars(d: Dashboard): Bar[] {
  return d.participacionPorSemana.map(({ semana, alcanzaron, activas }) => ({
    semana,
    activas,
    porcentaje: alcanzaron === 0 ? 0 : Math.round((activas / alcanzaron) * 100),
    estado: semana === d.semanaPiloto ? 'actual' : semana > d.semanaPiloto ? 'futura' : 'pasada',
  }));
}

const decimal = (value: number) => value.toFixed(1).replace('.', ',');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Only sentences the data supports. No trend claims ("estable", "creciendo") and nothing about kits:
 * the platform has no kit data (D-026), and a report that sounds sure of something it cannot know
 * is worse than a shorter one.
 */
export function reportSummary(d: Dashboard): string {
  if (d.registradas === 0) return 'Todavía no hay familias registradas en el piloto.';
  const sentences = [
    `${d.activasEstaSemana} de las ${d.registradas} familias registradas leyeron al menos una vez esta semana.`,
  ];
  if (d.registrosSemana > 0) {
    const media = d.activasEstaSemana === 0 ? '' : `, una media de ${decimal(d.registrosSemana / d.activasEstaSemana)} por familia activa`;
    sentences.push(`Hubo ${d.registrosSemana} ${plural(d.registrosSemana, 'registro', 'registros')} en los últimos 7 días${media}.`);
  }
  if (d.mensajesSinResponder > 0) {
    sentences.push(`${d.mensajesSinResponder} ${plural(d.mensajesSinResponder, 'mensaje de familia espera', 'mensajes de familias esperan')} respuesta.`);
  }
  return sentences.join(' ');
}

export const PRIVACY_FOOTER = 'Incluye solo datos agregados; no contiene notas de familias sin consentimiento.';

export function observationLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

export function reportPlainText(d: Dashboard, observaciones: string, generado: Date): string {
  const lines = [
    'Reporte semanal de implementación',
    `Nacidos para Leer Perú, semana ${d.semanaPiloto} de ${d.programWeeks} — ${rangoSemana(d.corte)}`,
    '',
    reportSummary(d),
    '',
    `Familias activas: ${d.activasEstaSemana}`,
    `Registros en 7 días: ${d.registrosSemana}`,
    `Hogares con los dos cuidadores: ${d.ambosCuidadores}`,
  ];
  const obs = observationLines(observaciones);
  if (obs.length > 0) lines.push('', 'Observaciones de campo:', ...obs.map((line) => `- ${line}`));
  lines.push('', `Generado el ${fechaLarga(generado.toISOString().slice(0, 10))}. ${PRIVACY_FOOTER}`);
  return lines.join('\n');
}

/** Some mail clients truncate `mailto:` URLs past this length. */
export const MAILTO_MAX = 1900;

const TRUNCATION_NOTICE = '\n\n[Resumen recortado: use "Copiar resumen como texto" para el texto completo.]';

/**
 * Builds a `mailto:` URL, cutting the plain body (before encoding, so multi-byte characters do not
 * distort the budget) when it would push the encoded URL past MAILTO_MAX. The full text is always
 * available via "Copiar resumen como texto"; this just keeps the mail client from silently losing
 * the tail of a long report with free-text observations.
 */
export function mailtoHref(subject: string, body: string): string {
  const build = (b: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`;
  const full = build(body);
  if (full.length <= MAILTO_MAX) return full;

  let lo = 0;
  let hi = body.length;
  let best = TRUNCATION_NOTICE;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = body.slice(0, mid) + TRUNCATION_NOTICE;
    if (build(candidate).length <= MAILTO_MAX) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return build(best);
}
```

El test del resumen espera `89 registros en los últimos 7 días, una media de 2,7…`. Con el código de
arriba el texto dice "Hubo 89 registros…" y `/89 registros en los últimos 7 días, una media de 2,7 por
familia activa\./` igual calza, porque la regex no está anclada al principio. No cambie ni el test ni el
código por eso.

- [ ] **Step 8: Implementar `web/src/gestor/descargar.ts`** (sale de `Exportar.tsx`, que se reescribe en la
tarea 5.7)

```ts
import { currentIdToken } from './auth.ts';

/**
 * Fetched with the token rather than linked: an <a href> cannot carry the header. Every export is
 * audited on the server (encargo §8).
 */
export async function descargarCsv(dataset: string): Promise<void> {
  const token = await currentIdToken();
  if (token === null) throw new Error('Sesión expirada');
  const response = await fetch(`/api/gestor/export/${dataset}.csv`, { headers: { authorization: token } });
  if (!response.ok) throw new Error(`Error ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `nplp-${dataset}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari can cancel the download if the object URL is revoked before it has started reading it;
  // deferring to the next tick lets the click's navigation begin first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

- [ ] **Step 9: Verde y commit**

```bash
cd web && npm test && npm run typecheck
```
El typecheck puede marcar `gestor/Familias.tsx` por los tipos nuevos (`minutes` en null). Si pasa, póngale
un `?? 0` o `?? '—'` en la celda; el componente se reescribe en la tarea 5.4.

```bash
git add web/src/gestor web/test/gestor-logica.test.ts
git commit -m "feat(web): manager-side logic for board, report, audit and family status, tested

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
