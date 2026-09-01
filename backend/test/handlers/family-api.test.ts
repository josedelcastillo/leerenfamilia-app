import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate, type IsoDate } from '../../src/domain/dates.ts';
import { DomainError } from '../../src/domain/errors.ts';
import type { Feedback } from '../../src/domain/feedback.ts';
import type { LogEntry } from '../../src/domain/log-entry.ts';
import { PLACEHOLDER_WEEKS, type WeekContent } from '../../src/content/weeks.ts';
import type { FamilyContext, FamilyStore, ResourceAccess } from '../../src/handlers/family-ports.ts';
import { getContent } from '../../src/handlers/content/logic.ts';
import { applySync, type SyncItem } from '../../src/handlers/tracking/logic.ts';
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
      { msisdn: MOTHER, role: 'principal' },
      { msisdn: FATHER, role: 'secundario' },
    ],
  };
  logs: LogEntry[] = [];
  accesses: ResourceAccess[] = [];
  feedback: Feedback[] = [];
  requestedWeeks: number[] = [];
  failNextWrite = false;

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
