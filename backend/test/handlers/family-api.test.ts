import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate, type IsoDate } from '../../src/domain/dates.ts';
import { DomainError } from '../../src/domain/errors.ts';
import type { Feedback } from '../../src/domain/feedback.ts';
import type { LogEntry } from '../../src/domain/log-entry.ts';
import { PLACEHOLDER_WEEKS, type WeekContent } from '../../src/content/weeks.ts';
import type {
  FamilyContext,
  FamilyStore,
  NotesConsentChange,
  ResourceAccess,
} from '../../src/handlers/family-ports.ts';
import { getContent } from '../../src/handlers/content/logic.ts';
import { applySync, listOwnLog, type SyncItem } from '../../src/handlers/tracking/logic.ts';
import { listOwnFeedback, submitFeedback, MAX_FEEDBACK_LENGTH } from '../../src/handlers/feedback/logic.ts';
import {
  enroll,
  type EnrollmentRecord,
  type EnrollmentRequest,
  type EnrollmentStore,
  type ProgramConfig,
} from '../../src/handlers/register/logic.ts';

const ANCHOR = isoDate('2026-09-15');
const NOW = new Date('2026-09-20T14:00:00.000Z');
const TODAY = isoDate('2026-09-20');
const MOTHER = '+51987654321';
const FATHER = '+51912345678';

class FakeFamilyStore implements FamilyStore {
  context: FamilyContext = {
    familyId: 'fam-1',
    programId: 'piloto-2026',
    status: 'activa',
    anchorDate: ANCHOR,
    programWeeks: 8,
    babyName: 'Mateo',
    freeTextNotesAuthorized: false,
    caregivers: [
      { msisdn: MOTHER, role: 'principal', relation: 'mama' },
      { msisdn: FATHER, role: 'secundario', relation: null },
    ],
  };
  logs: LogEntry[] = [];
  accesses: ResourceAccess[] = [];
  feedback: Feedback[] = [];
  requestedWeeks: number[] = [];
  failNextWrite = false;
  /** CONSENT# proofs, keyed by `deviceAt#clientId` exactly like the adapter's sort key. */
  consentProofs = new Map<string, NotesConsentChange>();
  consentFamilyIds: string[] = [];
  /** Mirrors `notesConsentAt` on META: the time of the change that set the flag. */
  notesConsentAt: string | null = null;

  get consentChanges(): NotesConsentChange[] {
    return [...this.consentProofs.values()];
  }

  async getContext(): Promise<FamilyContext | null> {
    return this.context;
  }
  async getWeeks(_programId: string, weeks: readonly number[]): Promise<WeekContent[]> {
    this.requestedWeeks = [...weeks];
    // Returned out of order on purpose: the logic must sort.
    return PLACEHOLDER_WEEKS.filter((w) => weeks.includes(w.week)).slice().reverse();
  }
  async putLogEntry(_familyId: string, entry: LogEntry): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('dynamo caído');
    }
    this.logs = [...this.logs.filter((l) => l.clientId !== entry.clientId), entry];
  }
  async putAccess(_familyId: string, access: ResourceAccess): Promise<void> {
    this.accesses.push(access);
  }
  async putFeedback(_familyId: string, _programId: string, feedback: Feedback): Promise<void> {
    this.feedback = [...this.feedback.filter((f) => f.id !== feedback.id), feedback];
  }
  async listFeedback(): Promise<Feedback[]> {
    return this.feedback;
  }
  async listLogEntries(): Promise<LogEntry[]> {
    return this.logs;
  }
  async putNotesConsent(familyId: string, change: NotesConsentChange): Promise<void> {
    this.consentFamilyIds.push(familyId);
    // Same semantics as the adapter: the proof is always written, the flag only by a newer change,
    // and a revocation wins a tie.
    this.consentProofs.set(`${change.deviceAt}#${change.clientId}`, change);
    if (
      this.notesConsentAt === null ||
      this.notesConsentAt < change.at ||
      (this.notesConsentAt === change.at && !change.notesAuthorized)
    ) {
      this.notesConsentAt = change.at;
      this.context = { ...this.context, freeTextNotesAuthorized: change.notesAuthorized };
    }
  }
}

let store: FakeFamilyStore;
beforeEach(() => {
  store = new FakeFamilyStore();
});

describe('contenido', () => {
  test('opens weeks 1 to the current one, and no further', async () => {
    const response = await getContent(store, store.context, TODAY);
    assert.equal(response.currentWeek, 1);
    assert.deepEqual(response.weeks.map((w) => w.week), [1]);

    const later = await getContent(store, store.context, addDays(ANCHOR, 21));
    assert.deepEqual(later.weeks.map((w) => w.week), [1, 2, 3, 4]);
  });

  test('never returns a future week, not even to be hidden by the UI', async () => {
    // A family should not be able to read next week's activity from the network tab.
    const response = await getContent(store, store.context, addDays(ANCHOR, 7));
    assert.equal(store.requestedWeeks.includes(3), false);
    assert.equal(response.weeks.some((w) => w.week > 2), false);
  });

  test('caps at the programme length and marks it finished', async () => {
    const response = await getContent(store, store.context, addDays(ANCHOR, 100));
    assert.deepEqual(response.weeks.map((w) => w.week), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(response.finished, true);
  });

  test('a finished family keeps access to every week', async () => {
    const response = await getContent(store, store.context, addDays(ANCHOR, 100));
    assert.equal(response.weeks.length, 8);
  });

  test('sorts the weeks regardless of what storage returned', async () => {
    const response = await getContent(store, store.context, addDays(ANCHOR, 21));
    assert.deepEqual(response.weeks.map((w) => w.week), [1, 2, 3, 4]);
  });

  test('returns nothing before the programme starts', async () => {
    const response = await getContent(store, store.context, addDays(ANCHOR, -1));
    assert.deepEqual(response.weeks, []);
    assert.equal(response.currentWeek, 0);
  });
});

describe('sincronización de la cola', () => {
  function logItem(overrides: Record<string, unknown> = {}): SyncItem {
    return {
      clientId: 'uuid-1',
      kind: 'bitacora',
      date: '2026-09-19',
      kind_actividad: 'lectura',
      minutes: 10,
      ...overrides,
    } as SyncItem;
  }

  test('accepts a batch and reports each item', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      logItem({ clientId: 'a' }),
      logItem({ clientId: 'b', kind_actividad: 'cancion' }),
    ], TODAY, NOW);

    assert.deepEqual(results, [
      { clientId: 'a', status: 'ok' },
      { clientId: 'b', status: 'ok' },
    ]);
    assert.equal(store.logs.length, 2);
  });

  test('replaying the same flush does not duplicate anything', async () => {
    // The device retries the whole queue after a dropped connection.
    const batch = [logItem({ clientId: 'a' }), logItem({ clientId: 'b' })];
    await applySync(store, store.context, MOTHER, batch, TODAY, NOW);
    await applySync(store, store.context, MOTHER, batch, TODAY, NOW);
    assert.equal(store.logs.length, 2);
  });

  test('one bad item does not strand the rest of the queue', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      logItem({ clientId: 'a' }),
      logItem({ clientId: 'b', minutes: 9999 }),
      logItem({ clientId: 'c' }),
    ], TODAY, NOW);

    assert.equal(results[0]?.status, 'ok');
    assert.equal(results[1]?.status, 'rechazado');
    assert.equal(results[2]?.status, 'ok');
    assert.equal(store.logs.length, 2);
  });

  test('distinguishes a rejected item from a failure of ours', async () => {
    // `rechazado` will never succeed, so the device drops it. `error` is retried.
    store.failNextWrite = true;
    const results = await applySync(store, store.context, MOTHER, [
      logItem({ clientId: 'a' }),
      logItem({ clientId: 'b', kind_actividad: 'baile' }),
    ], TODAY, NOW);

    assert.equal(results[0]?.status, 'error');
    assert.equal(results[1]?.status, 'rechazado');
  });

  test('takes who logged it from the token, not from the request body', async () => {
    // Otherwise a device could claim every entry was the father's and corrupt the split.
    await applySync(store, store.context, FATHER, [logItem({ loggedBy: 'principal' })], TODAY, NOW);
    assert.equal(store.logs[0]?.loggedBy, 'secundario');
  });

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

  test('accepts entries backdated by the queue, and rejects future ones', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      logItem({ clientId: 'a', date: '2026-09-16' }),
      logItem({ clientId: 'b', date: '2026-09-21' }),
    ], TODAY, NOW);
    assert.equal(results[0]?.status, 'ok');
    assert.equal(results[1]?.status, 'rechazado');
  });

  test('records a resource access', async () => {
    const results = await applySync(store, store.context, MOTHER, [{
      clientId: 'acc-1', kind: 'acceso', resourceId: 's01-lectura', week: 1,
      at: '2026-09-19T10:00:00.000Z',
    } as SyncItem], TODAY, NOW);

    assert.equal(results[0]?.status, 'ok');
    assert.equal(store.accesses[0]?.resourceId, 's01-lectura');
  });

  test('rejects an incomplete access and an unknown item kind', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      { clientId: 'x', kind: 'acceso', resourceId: '', week: 1, at: 'z' } as SyncItem,
      { clientId: 'y', kind: 'otra_cosa' } as unknown as SyncItem,
    ], TODAY, NOW);
    assert.equal(results[0]?.status, 'rechazado');
    assert.equal(results[1]?.status, 'rechazado');
  });
});

describe('historial propio de la bitácora', () => {
  test('devuelve las entradas de la familia, de la más nueva a la más vieja', async () => {
    // Without this the log only existed while the screen stayed mounted.
    await applySync(store, store.context, MOTHER, [
      { clientId: 'a', kind: 'bitacora', date: '2026-09-17', kind_actividad: 'lectura', minutes: 10 } as SyncItem,
      { clientId: 'b', kind: 'bitacora', date: '2026-09-19', kind_actividad: 'cancion', minutes: 5 } as SyncItem,
    ], TODAY, NOW);

    const { entries } = await listOwnLog(store, store.context, MOTHER);
    assert.deepEqual(entries.map((e) => e.date), ['2026-09-19', '2026-09-17']);
  });

  test('la familia sí ve sus propias notas, aunque no las haya autorizado al equipo', async () => {
    // The consent flag governs what a manager reads, never what the family sees of its own writing.
    assert.equal(store.context.freeTextNotesAuthorized, false);
    await applySync(store, store.context, MOTHER, [
      { clientId: 'a', kind: 'bitacora', date: '2026-09-19', kind_actividad: 'lectura', minutes: 10, note: 'le gustó' } as SyncItem,
    ], TODAY, NOW);

    const { entries } = await listOwnLog(store, store.context, MOTHER);
    assert.equal(entries[0]?.note, 'le gustó');
  });

  test('una familia sin registros recibe una lista vacía, no un error', async () => {
    assert.deepEqual((await listOwnLog(store, store.context, MOTHER)).entries, []);
  });

  test('conserva el recurso asociado, para poder mostrar de qué actividad vino', async () => {
    await applySync(store, store.context, MOTHER, [
      { clientId: 'a', kind: 'bitacora', date: '2026-09-19', kind_actividad: 'lectura', minutes: 10, resourceId: 's03-lectura' } as SyncItem,
    ], TODAY, NOW);
    assert.equal((await listOwnLog(store, store.context, MOTHER)).entries[0]?.resourceId, 's03-lectura');
  });
});

describe('feedback de la familia', () => {
  test('creates an open feedback of the requested type', async () => {
    const feedback = await submitFeedback(store, store.context, {
      clientId: 'fb-1', type: 'pedido', text: '  ¿Pueden mandar la canción otra vez?  ',
      createdAt: NOW.toISOString(),
    });

    assert.equal(feedback.status, 'abierto');
    assert.equal(feedback.type, 'pedido');
    assert.equal(feedback.channel, 'pwa');
    assert.equal(feedback.text, '¿Pueden mandar la canción otra vez?');
  });

  test('is idempotent on the client id', async () => {
    const input = { clientId: 'fb-1', type: 'consulta', text: 'hola', createdAt: NOW.toISOString() };
    await submitFeedback(store, store.context, input);
    await submitFeedback(store, store.context, input);
    assert.equal(store.feedback.length, 1);
  });

  test('rejects an unknown type, empty text and a missing client id', async () => {
    const base = { clientId: 'fb-1', type: 'consulta', text: 'hola', createdAt: NOW.toISOString() };
    await assert.rejects(() => submitFeedback(store, store.context, { ...base, type: 'queja' }), DomainError);
    await assert.rejects(() => submitFeedback(store, store.context, { ...base, text: '   ' }), DomainError);
    await assert.rejects(() => submitFeedback(store, store.context, { ...base, clientId: '' }), DomainError);
  });

  test('rejects text beyond the limit', async () => {
    const base = { clientId: 'fb-1', type: 'consulta', createdAt: NOW.toISOString() };
    await assert.doesNotReject(() => submitFeedback(store, store.context, { ...base, text: 'a'.repeat(MAX_FEEDBACK_LENGTH) }));
    await assert.rejects(() => submitFeedback(store, store.context, { ...base, text: 'a'.repeat(MAX_FEEDBACK_LENGTH + 1) }), DomainError);
  });

  test('lists the family thread newest first', async () => {
    await submitFeedback(store, store.context, { clientId: 'a', type: 'consulta', text: 'vieja', createdAt: '2026-09-01T10:00:00.000Z' });
    await submitFeedback(store, store.context, { clientId: 'b', type: 'consulta', text: 'nueva', createdAt: '2026-09-19T10:00:00.000Z' });

    const listed = await listOwnFeedback(store, store.context);
    assert.deepEqual(listed.map((f) => f.text), ['nueva', 'vieja']);
  });
});

describe('registro por QR', () => {
  const PROGRAM: ProgramConfig = {
    programId: 'piloto-2026', anchorPolicy: 'enrollment_date', programWeeks: 8, consentVersion: 'v1',
  };

  class FakeEnrollmentStore implements EnrollmentStore {
    created: EnrollmentRecord[] = [];
    taken = new Set<string>();
    program: ProgramConfig | null = PROGRAM;

    async getProgram(): Promise<ProgramConfig | null> {
      return this.program;
    }
    async findFamilyByMsisdn(msisdn: string): Promise<string | null> {
      return this.taken.has(msisdn) ? 'fam-existente' : null;
    }
    async createFamily(record: EnrollmentRecord): Promise<void> {
      this.created.push(record);
    }
  }

  function request(overrides: Partial<EnrollmentRequest> = {}): EnrollmentRequest {
    return {
      programId: 'piloto-2026',
      clinic: 'CLINICA-DEMO',
      baby: { name: 'Mateo', birthDate: '2026-09-01' },
      caregivers: [{ msisdn: '987654321', role: 'principal' }],
      consent: { accepted: true, version: 'v1', freeTextNotesAuthorized: false },
      ...overrides,
    };
  }

  let enrollmentStore: FakeEnrollmentStore;
  beforeEach(() => {
    enrollmentStore = new FakeEnrollmentStore();
  });

  const run = (req: EnrollmentRequest, today: IsoDate = TODAY) =>
    enroll(enrollmentStore, req, today, NOW, () => 'fam-nueva');

  test('enrols a family and anchors it to the enrolment date', async () => {
    const { record } = await run(request());
    assert.equal(record.familyId, 'fam-nueva');
    assert.equal(record.anchorDate, TODAY, 'D-003: se ancla al ingreso');
    assert.equal(record.caregivers[0]?.msisdn, '+51987654321');
  });

  test('anchors to the birth date when the programme is configured that way', async () => {
    enrollmentStore.program = { ...PROGRAM, anchorPolicy: 'birth_date' };
    const { record } = await run(request());
    assert.equal(record.anchorDate, '2026-09-01');
  });

  test('refuses to enrol without consent', async () => {
    // Minors' data is processed here; consent is a precondition, not a field.
    await assert.rejects(
      () => run(request({ consent: { accepted: false, version: 'v1', freeTextNotesAuthorized: false } })),
      (e: unknown) => e instanceof DomainError && e.code === 'invalid_enrollment',
    );
    assert.equal(enrollmentStore.created.length, 0);
  });

  test('records which consent version was accepted, and the notes authorisation', async () => {
    const { record } = await run(request({
      consent: { accepted: true, version: 'v2-2026-09', freeTextNotesAuthorized: true },
    }));
    assert.equal(record.consentVersion, 'v2-2026-09');
    assert.equal(record.freeTextNotesAuthorized, true);
  });

  test('defaults the notes authorisation to false', async () => {
    const { record } = await run(request({
      consent: { accepted: true, version: 'v1' } as EnrollmentRequest['consent'],
    }));
    assert.equal(record.freeTextNotesAuthorized, false);
  });

  test('accepts a second caregiver and marks their role', async () => {
    const { record } = await run(request({
      caregivers: [{ msisdn: '987654321', role: 'principal' }, { msisdn: '912345678', role: 'secundario' }],
    }));
    assert.deepEqual(record.caregivers.map((c) => c.role), ['principal', 'secundario']);
  });

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

  test('rejects an already registered number instead of merging families', async () => {
    // Merging from a public endpoint would let anyone who guesses a number attach to that family.
    enrollmentStore.taken.add('+51987654321');
    await assert.rejects(() => run(request()), /ya está registrado/);
  });

  test('rejects two caregivers sharing one number, and more than two caregivers', async () => {
    await assert.rejects(() => run(request({
      caregivers: [{ msisdn: '987654321', role: 'principal' }, { msisdn: '987 654 321', role: 'secundario' }],
    })), DomainError);
    await assert.rejects(() => run(request({
      caregivers: [
        { msisdn: '987654321', role: 'principal' },
        { msisdn: '912345678', role: 'secundario' },
        { msisdn: '911111111', role: 'secundario' },
      ],
    })), DomainError);
  });

  test('rejects a missing baby name, a future birth date and an unknown programme', async () => {
    await assert.rejects(() => run(request({ baby: { name: '  ', birthDate: '2026-09-01' } })), DomainError);
    await assert.rejects(() => run(request({ baby: { name: 'Mateo', birthDate: '2026-09-21' } })), DomainError);
    enrollmentStore.program = null;
    await assert.rejects(() => run(request()), DomainError);
  });

  test('stores nothing beyond the minimum the programme needs', async () => {
    const { record } = await run(request({ dni: '12345678', address: 'Av. Siempre Viva 742' } as unknown as Partial<EnrollmentRequest>));
    // Encargo §8: no DNI, no address, nothing coming from the clinic's own records.
    const serialized = JSON.stringify(record);
    assert.equal(serialized.includes('12345678'), false);
    assert.equal(serialized.includes('Siempre Viva'), false);
  });
});

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
      deviceAt: '2026-09-20T13:00:00.000Z', version: 'borrador-0', changedBy: MOTHER,
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

  test('un cambio más viejo que llega después no cambia el permiso, pero queda registrado', async () => {
    // The offline queue does not preserve order, and two phones can send crossed changes.
    const [nuevo] = await applySync(store, store.context, MOTHER, [
      consentItem({ clientId: 'nuevo', notesAuthorized: true, at: '2026-09-20T13:00:00.000Z' }),
    ], TODAY, NOW);
    const [viejo] = await applySync(store, store.context, FATHER, [
      consentItem({ clientId: 'viejo', notesAuthorized: false, at: '2026-09-20T12:00:00.000Z' }),
    ], TODAY, NOW);

    assert.equal(nuevo?.status, 'ok');
    assert.equal(viejo?.status, 'ok', 'processed correctly: must not be retried nor rejected');
    assert.equal(store.context.freeTextNotesAuthorized, true);
    assert.equal(store.consentChanges.length, 2);
  });

  test('en un mismo lote en desorden, gana la elección más reciente', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      consentItem({ clientId: 'nuevo', notesAuthorized: false, at: '2026-09-20T13:00:00.000Z' }),
      consentItem({ clientId: 'viejo', notesAuthorized: true, at: '2026-09-20T12:00:00.000Z' }),
    ], TODAY, NOW);

    assert.deepEqual(results.map((r) => r.status), ['ok', 'ok']);
    assert.equal(store.context.freeTextNotesAuthorized, false);
    assert.equal(store.consentChanges.length, 2);
  });

  test('una hora del futuro se recorta a la hora de recepción', async () => {
    // A phone clock set ahead must not win every later comparison.
    await applySync(store, store.context, MOTHER, [consentItem({ at: '2027-01-01T00:00:00.000Z' })], TODAY, NOW);
    assert.equal(store.consentChanges[0]?.at, NOW.toISOString());
  });

  test('reintentar un cambio recortado no duplica la prueba', async () => {
    // A lost response makes the device resend the same item later: the clamped time moves with the
    // receipt time, so the proof must be keyed by the device's own time.
    const item = consentItem({ at: '2027-01-01T00:00:00.000Z' });
    await applySync(store, store.context, MOTHER, [item], TODAY, NOW);
    await applySync(store, store.context, MOTHER, [item], TODAY, new Date(NOW.getTime() + 60_000));
    assert.equal(store.consentChanges.length, 1);
    assert.equal(store.consentChanges[0]?.deviceAt, '2027-01-01T00:00:00.000Z');
  });

  describe('en empate de hora gana la revocación', () => {
    // A phone clock ahead: grant then revoke offline, both clamped to the same receipt time.
    const grant = (): SyncItem =>
      consentItem({ clientId: 'otorga', notesAuthorized: true, at: '2027-01-01T00:00:00.000Z' });
    const revoke = (): SyncItem =>
      consentItem({ clientId: 'revoca', notesAuthorized: false, at: '2027-01-01T00:05:00.000Z' });

    beforeEach(() => {
      store.context = { ...store.context, freeTextNotesAuthorized: true };
      store.notesConsentAt = '2026-09-15T15:00:00.000Z';
    });

    test('con la autorización procesada al final', async () => {
      await applySync(store, store.context, MOTHER, [revoke(), grant()], TODAY, NOW);
      assert.equal(store.context.freeTextNotesAuthorized, false);
    });

    test('con la revocación procesada al final', async () => {
      await applySync(store, store.context, MOTHER, [grant(), revoke()], TODAY, NOW);
      assert.equal(store.context.freeTextNotesAuthorized, false);
    });
  });

  test('ignora un changedBy o un familyId que vengan en el cuerpo', async () => {
    await applySync(store, store.context, MOTHER, [
      consentItem({ changedBy: 'intruso', familyId: 'otra-familia' }),
    ], TODAY, NOW);
    assert.equal(store.consentChanges[0]?.changedBy, MOTHER);
    assert.deepEqual(store.consentFamilyIds, [store.context.familyId]);
  });

  test('rechaza un cambio sin clientId o con clientId en blanco', async () => {
    const results = await applySync(store, store.context, MOTHER, [
      consentItem({ clientId: undefined }),
      consentItem({ clientId: '   ' }),
    ], TODAY, NOW);
    assert.deepEqual(results.map((r) => r.status), ['rechazado', 'rechazado']);
    assert.equal(store.consentChanges.length, 0);
  });
});

describe('historial propio: estado para la pantalla de privacidad', () => {
  test('devuelve la relación declarada por el cuidador de este teléfono', async () => {
    assert.equal((await listOwnLog(store, store.context, MOTHER)).relation, 'mama');
    assert.equal((await listOwnLog(store, store.context, FATHER)).relation, null);
  });
});
