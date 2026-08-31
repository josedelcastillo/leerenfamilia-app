import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate, isoWeek, type IsoDate } from '../../src/domain/dates.ts';
import { toE164 } from '../../src/domain/msisdn.ts';
import type { Caregiver } from '../../src/domain/opt-in.ts';
import type { WeekContent } from '../../src/content/weeks.ts';
import { WhatsAppSendError, type SendResult, type TemplateMessage, type TextMessage, type WhatsAppProvider } from '../../src/adapters/whatsapp/index.ts';
import { verifyFamilyToken } from '../../src/shared/family-token.ts';
import {
  runWeeklySend,
  type DeliveryRecord,
  type FamilyAggregate,
  type ProgramRef,
  type RecipientOutcome,
  type WeeklySendStore,
} from '../../src/handlers/weekly-send/run.ts';

const SECRET = 'clave-de-prueba';
const NOW = new Date('2026-09-15T14:00:00.000Z');
const ANCHOR = isoDate('2026-09-15');
const PROGRAM: ProgramRef = {
  programId: 'piloto-2026',
  programWeeks: 8,
  templateName: 'nplp_semana',
  languageCode: 'es',
};

function caregiver(msisdn: string, overrides: Partial<Caregiver> = {}): Caregiver {
  return {
    msisdn: toE164(msisdn),
    role: 'principal',
    optIn: true,
    optInAt: '2026-09-15T10:00:00.000Z',
    optInSource: 'qr',
    optOutAt: null,
    ...overrides,
  };
}

function family(overrides: Partial<FamilyAggregate> = {}): FamilyAggregate {
  return {
    familyId: 'fam-1',
    programId: PROGRAM.programId,
    status: 'activa',
    anchorDate: ANCHOR,
    babyName: 'Mateo',
    caregivers: [caregiver('987654321')],
    deliveredIsoWeeks: [],
    ...overrides,
  };
}

const CONTENT: WeekContent = {
  week: 1,
  title: 'Semana 1 — actividad por definir',
  summary: 'TODO',
  activities: [],
  isPlaceholder: true,
  todo: 'TODO',
};

class FakeStore implements WeeklySendStore {
  families = new Map<string, FamilyAggregate>([['fam-1', family()]]);
  deliveries = new Map<string, DeliveryRecord>();
  content: WeekContent | null = CONTENT;
  wamidLinks: Array<{ wamid: string; familyId: string; isoWeek: string; msisdn: string }> = [];
  calls: string[] = [];
  loadFailsFor: string | null = null;

  async listActivePrograms(): Promise<ProgramRef[]> {
    return [PROGRAM];
  }
  async listFamilyIds(): Promise<string[]> {
    return [...this.families.keys()];
  }
  async loadFamily(familyId: string): Promise<FamilyAggregate | null> {
    if (this.loadFailsFor === familyId) throw new Error('dynamo caído');
    return this.families.get(familyId) ?? null;
  }
  async getContent(): Promise<WeekContent | null> {
    return this.content;
  }
  async claimDelivery(input: {
    familyId: string; isoWeek: string; week: number; recipients: readonly string[]; at: Date;
  }): Promise<'claimed' | 'exists'> {
    this.calls.push(`claim:${input.familyId}`);
    const key = `${input.familyId}#${input.isoWeek}`;
    if (this.deliveries.has(key)) return 'exists';
    const recipients: Record<string, RecipientOutcome> = {};
    for (const m of input.recipients) recipients[m] = { status: 'pendiente', at: input.at.toISOString() };
    this.deliveries.set(key, { familyId: input.familyId, isoWeek: input.isoWeek, week: input.week, recipients });
    return 'claimed';
  }
  async getDelivery(familyId: string, week: string): Promise<DeliveryRecord | null> {
    return this.deliveries.get(`${familyId}#${week}`) ?? null;
  }
  async recordRecipientOutcome(
    familyId: string, isoWeekId: string, msisdn: string, outcome: RecipientOutcome,
  ): Promise<void> {
    const key = `${familyId}#${isoWeekId}`;
    const existing = this.deliveries.get(key);
    if (existing !== undefined) {
      this.deliveries.set(key, {
        ...existing,
        recipients: { ...existing.recipients, [msisdn]: outcome },
      });
    }
  }
  async linkWamid(input: { wamid: string; familyId: string; isoWeek: string; msisdn: string }): Promise<void> {
    this.wamidLinks.push(input);
  }
}

class FakeProvider implements WhatsAppProvider {
  readonly name = 'mock' as const;
  templates: TemplateMessage[] = [];
  calls: string[];
  failWith: Error | null = null;

  constructor(calls: string[]) {
    this.calls = calls;
  }
  async sendTemplate(message: TemplateMessage): Promise<SendResult> {
    this.calls.push(`send:${message.to}`);
    if (this.failWith !== null) throw this.failWith;
    this.templates.push(message);
    return { wamid: `wamid.MOCK-${this.templates.length}`, provider: 'mock' };
  }
  async sendText(_message: TextMessage): Promise<SendResult> {
    return { wamid: 'wamid.MOCK-text', provider: 'mock' };
  }
}

let store: FakeStore;
let provider: FakeProvider;

beforeEach(() => {
  store = new FakeStore();
  provider = new FakeProvider(store.calls);
});

function deps(today: IsoDate = ANCHOR) {
  return {
    store,
    provider,
    tokenSecret: SECRET,
    now: () => NOW,
    today: () => today,
  };
}

describe('sending', () => {
  test('sends the weekly template to an eligible family', async () => {
    const report = await runWeeklySend(deps());
    assert.equal(report.messagesSent, 1);
    assert.equal(provider.templates.length, 1);
  });

  test('fills the template with baby name, week number and activity title', async () => {
    await runWeeklySend(deps(addDays(ANCHOR, 14)));
    assert.deepEqual(provider.templates[0]?.bodyParams, ['Mateo', '3', CONTENT.title]);
  });

  test('sends to both caregivers of a family', async () => {
    store.families.set('fam-1', family({
      caregivers: [caregiver('987654321'), caregiver('912345678', { role: 'secundario' })],
    }));
    const report = await runWeeklySend(deps());
    assert.equal(report.messagesSent, 2);
    assert.deepEqual(provider.templates.map((t) => t.to), ['+51987654321', '+51912345678']);
  });

  test('gives each caregiver a token that identifies them, not just the family', async () => {
    store.families.set('fam-1', family({
      caregivers: [caregiver('987654321'), caregiver('912345678', { role: 'secundario' })],
    }));
    await runWeeklySend(deps());

    const first = verifyFamilyToken(provider.templates[0]!.buttonUrlParam!, SECRET, NOW);
    const second = verifyFamilyToken(provider.templates[1]!.buttonUrlParam!, SECRET, NOW);
    assert.equal(first.valid && first.payload.msisdn, '+51987654321');
    assert.equal(second.valid && second.payload.msisdn, '+51912345678');
    assert.equal(first.valid && first.payload.familyId, 'fam-1');
  });

  test('the token in the deep link is valid and covers the rest of the programme', async () => {
    await runWeeklySend(deps());
    const token = provider.templates[0]!.buttonUrlParam!;
    const inEightWeeks = new Date(NOW.getTime() + 56 * 24 * 60 * 60 * 1000);
    assert.equal(verifyFamilyToken(token, SECRET, inEightWeeks).valid, true);
  });

  test('links the message id to the family and week for invoice reconciliation', async () => {
    await runWeeklySend(deps());
    assert.deepEqual(store.wamidLinks[0], {
      wamid: 'wamid.MOCK-1',
      familyId: 'fam-1',
      isoWeek: isoWeek(ANCHOR),
      msisdn: '+51987654321',
      at: NOW,
    });
  });

  test('falls back to a generic title when the week has no content loaded', async () => {
    store.content = null;
    await runWeeklySend(deps());
    assert.deepEqual(provider.templates[0]?.bodyParams, ['Mateo', '1', 'Semana 1']);
  });
});

describe('idempotency', () => {
  test('claims the delivery before sending anything', async () => {
    // The order is the guarantee: if the send came first, a crash in between would let a retry
    // charge for a second message.
    await runWeeklySend(deps());
    assert.deepEqual(store.calls, ['claim:fam-1', 'send:+51987654321']);
  });

  test('a second run in the same week sends nothing', async () => {
    await runWeeklySend(deps());
    const second = await runWeeklySend(deps());

    assert.equal(second.messagesSent, 0);
    assert.equal(provider.templates.length, 1);
    assert.equal(second.skipped['ya_enviado_esta_semana'], 1);
  });

  test('a family whose delivery record already exists is not charged twice', async () => {
    // Simulates the scheduler retrying after the claim was written but the report was lost.
    store.deliveries.set(`fam-1#${isoWeek(ANCHOR)}`, {
      familyId: 'fam-1', isoWeek: isoWeek(ANCHOR), week: 1,
      recipients: { '+51987654321': { status: 'enviado', at: NOW.toISOString(), wamid: 'w1' } },
    });
    const report = await runWeeklySend(deps());
    assert.equal(report.messagesSent, 0);
    assert.equal(provider.templates.length, 0);
  });

  test('retries only the recipient whose send definitely failed', async () => {
    store.families.set('fam-1', family({
      caregivers: [caregiver('987654321'), caregiver('912345678', { role: 'secundario' })],
    }));
    store.deliveries.set(`fam-1#${isoWeek(ANCHOR)}`, {
      familyId: 'fam-1', isoWeek: isoWeek(ANCHOR), week: 1,
      recipients: {
        '+51987654321': { status: 'enviado', at: NOW.toISOString(), wamid: 'w1' },
        '+51912345678': { status: 'fallido', at: NOW.toISOString(), error: 'rate limit' },
      },
    });

    const report = await runWeeklySend(deps());
    assert.equal(report.messagesSent, 1);
    assert.deepEqual(provider.templates.map((t) => t.to), ['+51912345678']);
  });

  test('never auto-retries an ambiguous pendiente, and flags it for review', async () => {
    // We cannot tell whether Meta charged us, and charging twice is the one forbidden outcome.
    store.deliveries.set(`fam-1#${isoWeek(ANCHOR)}`, {
      familyId: 'fam-1', isoWeek: isoWeek(ANCHOR), week: 1,
      recipients: { '+51987654321': { status: 'pendiente', at: NOW.toISOString() } },
    });

    const report = await runWeeklySend(deps());
    assert.equal(report.messagesSent, 0);
    assert.equal(provider.templates.length, 0);
    assert.deepEqual(report.needsReview, ['fam-1']);
  });
});

describe('send failures', () => {
  test('an error from Meta is recorded as fallido, so it can be retried', async () => {
    provider.failWith = new WhatsAppSendError('Graph API returned 400', 400, '{"error":{}}');
    const report = await runWeeklySend(deps());

    assert.equal(report.messagesFailed, 1);
    const delivery = await store.getDelivery('fam-1', isoWeek(ANCHOR));
    assert.equal(delivery?.recipients['+51987654321']?.status, 'fallido');
  });

  test('a network timeout stays pendiente, because it is ambiguous', async () => {
    provider.failWith = new WhatsAppSendError('Graph API request failed: timeout', null, '');
    await runWeeklySend(deps());

    const delivery = await store.getDelivery('fam-1', isoWeek(ANCHOR));
    assert.equal(delivery?.recipients['+51987654321']?.status, 'pendiente');
  });

  test('a fallido recipient is picked up by the next run, a pendiente one is not', async () => {
    provider.failWith = new WhatsAppSendError('rechazado', 400, '');
    await runWeeklySend(deps());

    provider.failWith = null;
    const second = await runWeeklySend(deps());
    assert.equal(second.messagesSent, 1);
  });

  test('one family failing does not stop the rest of the run', async () => {
    store.families.set('fam-2', family({ familyId: 'fam-2' }));
    store.loadFailsFor = 'fam-1';

    const report = await runWeeklySend(deps());
    assert.equal(report.families, 2);
    assert.equal(report.messagesSent, 1);
    assert.equal(report.outcomes.find((o) => o.familyId === 'fam-1')?.result, 'error');
  });
});

describe('the weekly report', () => {
  test('counts why families were skipped, not just how many messages went out', async () => {
    // The operating model (§5.4) asks for a weekly implementation report, and this is its substance.
    store.families.set('fam-2', family({ familyId: 'fam-2', status: 'baja' }));
    store.families.set('fam-3', family({ familyId: 'fam-3', caregivers: [caregiver('987654321', { optIn: false })] }));
    store.families.set('fam-4', family({ familyId: 'fam-4', anchorDate: addDays(ANCHOR, -60) }));

    const report = await runWeeklySend(deps());
    assert.equal(report.families, 4);
    assert.equal(report.messagesSent, 1);
    assert.deepEqual(report.skipped, {
      familia_inactiva: 1,
      sin_cuidadores_con_opt_in: 1,
      programa_finalizado: 1,
    });
  });

  test('names the provider, so a mock run is never mistaken for a real one', async () => {
    const report = await runWeeklySend(deps());
    assert.equal(report.provider, 'mock');
  });

  test('respects a program configured with more than eight weeks', async () => {
    store.families.set('fam-1', family({ anchorDate: addDays(ANCHOR, -70) }));
    const eightWeek = await runWeeklySend(deps());
    assert.equal(eightWeek.messagesSent, 0);

    store.deliveries.clear();
    const twelveWeek = await runWeeklySend({
      ...deps(),
      store: Object.assign(store, {
        listActivePrograms: async () => [{ ...PROGRAM, programWeeks: 12 }],
      }),
    });
    assert.equal(twelveWeek.messagesSent, 1);
  });
});
