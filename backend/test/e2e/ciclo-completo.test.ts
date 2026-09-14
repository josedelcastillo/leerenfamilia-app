import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate, isoWeek, type IsoDate } from '../../src/domain/dates.ts';
import { toE164 } from '../../src/domain/msisdn.ts';
import type { Caregiver } from '../../src/domain/opt-in.ts';
import type { Feedback } from '../../src/domain/feedback.ts';
import { parseWebhookPayload, type StatusEvent } from '../../src/domain/whatsapp-events.ts';
import { PLACEHOLDER_WEEKS } from '../../src/content/weeks.ts';
import type { WeekContent } from '../../src/content/weeks.ts';
import { MockProvider, type MockDelivery } from '../../src/adapters/whatsapp/index.ts';
import type { CaregiverRef } from '../../src/adapters/dynamo.ts';
import { verifyFamilyToken } from '../../src/shared/family-token.ts';
import { processEvents, type WebhookStore } from '../../src/handlers/wa-webhook/process.ts';
import {
  runWeeklySend,
  type DeliveryRecord,
  type FamilyAggregate,
  type ProgramRef,
  type RecipientOutcome,
  type WeeklySendStore,
} from '../../src/handlers/weekly-send/run.ts';

const SECRET = 'clave-e2e';
const PROGRAM: ProgramRef = {
  programId: 'piloto-2026',
  programWeeks: 8,
  templateName: 'nplp_semana',
  languageCode: 'es',
};
const MOTHER = toE164('999990001');
const ANCHOR = isoDate('2026-09-15');

/** Stands in for the single table, backing both the scheduler and the webhook, as in production. */
class InMemoryStore implements WeeklySendStore, WebhookStore {
  families = new Map<string, FamilyAggregate>();
  deliveries = new Map<string, DeliveryRecord>();
  content = new Map<number, WeekContent>();
  feedback: Array<{ familyId: string; feedback: Feedback }> = [];
  statuses: StatusEvent[] = [];
  serviceWindow = new Map<string, number>();
  claimedMessages = new Set<string>();
  wamidLinks = new Map<string, { familyId: string; isoWeek: string }>();

  // --- scheduler side -------------------------------------------------------
  async listActivePrograms(): Promise<ProgramRef[]> {
    return [PROGRAM];
  }
  async listFamilyIds(): Promise<string[]> {
    return [...this.families.keys()];
  }
  async loadFamily(familyId: string): Promise<FamilyAggregate | null> {
    return this.families.get(familyId) ?? null;
  }
  async getContent(_programId: string, week: number): Promise<WeekContent | null> {
    return this.content.get(week) ?? null;
  }
  async claimDelivery(input: {
    familyId: string; isoWeek: string; week: number; recipients: readonly string[]; at: Date;
  }): Promise<'claimed' | 'exists'> {
    const key = `${input.familyId}#${input.isoWeek}`;
    if (this.deliveries.has(key)) return 'exists';
    const recipients: Record<string, RecipientOutcome> = {};
    for (const m of input.recipients) recipients[m] = { status: 'pendiente', at: input.at.toISOString() };
    this.deliveries.set(key, { familyId: input.familyId, isoWeek: input.isoWeek, week: input.week, recipients });
    // The scheduler records the delivery, which is also what makes the family "already sent to".
    const family = this.families.get(input.familyId);
    if (family !== undefined) {
      this.families.set(input.familyId, {
        ...family,
        deliveredIsoWeeks: [...family.deliveredIsoWeeks, input.isoWeek],
      });
    }
    return 'claimed';
  }
  async getDelivery(familyId: string, week: string): Promise<DeliveryRecord | null> {
    return this.deliveries.get(`${familyId}#${week}`) ?? null;
  }
  async recordRecipientOutcome(
    familyId: string, week: string, msisdn: string, outcome: RecipientOutcome,
  ): Promise<void> {
    const key = `${familyId}#${week}`;
    const existing = this.deliveries.get(key);
    if (existing !== undefined) {
      this.deliveries.set(key, { ...existing, recipients: { ...existing.recipients, [msisdn]: outcome } });
    }
  }
  async linkWamid(input: { wamid: string; familyId: string; isoWeek: string }): Promise<void> {
    this.wamidLinks.set(input.wamid, { familyId: input.familyId, isoWeek: input.isoWeek });
  }

  // --- webhook side ---------------------------------------------------------
  async claimMessageId(wamid: string): Promise<boolean> {
    if (this.claimedMessages.has(wamid)) return false;
    this.claimedMessages.add(wamid);
    return true;
  }
  async releaseMessageId(wamid: string): Promise<void> {
    this.claimedMessages.delete(wamid);
  }
  async findCaregiverByMsisdn(msisdn: string): Promise<CaregiverRef | null> {
    for (const family of this.families.values()) {
      const caregiver = family.caregivers.find((c) => c.msisdn === msisdn);
      if (caregiver !== undefined) {
        return {
          familyId: family.familyId,
          programId: family.programId,
          msisdn: caregiver.msisdn,
          role: caregiver.role,
          optIn: caregiver.optIn,
          lastInboundAt: this.serviceWindow.get(caregiver.msisdn) ?? null,
        };
      }
    }
    return null;
  }
  async touchServiceWindow(_familyId: string, msisdn: string, atMs: number): Promise<void> {
    this.serviceWindow.set(msisdn, atMs);
  }
  async optOutCaregiver(familyId: string, msisdn: string, atIso: string): Promise<void> {
    const family = this.families.get(familyId)!;
    this.families.set(familyId, {
      ...family,
      caregivers: family.caregivers.map((c) =>
        c.msisdn === msisdn ? { ...c, optIn: false, optOutAt: atIso } : c,
      ),
    });
  }
  async putFeedback(familyId: string, _programId: string, feedback: Feedback): Promise<void> {
    this.feedback.push({ familyId, feedback });
  }
  async putMessageStatus(event: StatusEvent): Promise<void> {
    this.statuses.push(event);
  }
}

function caregiver(msisdn: string): Caregiver {
  return {
    msisdn: toE164(msisdn),
    role: 'principal',
    optIn: true,
    optInAt: '2026-09-15T10:00:00.000Z',
    optInSource: 'qr',
    optOutAt: null,
  };
}

function seed(): InMemoryStore {
  const store = new InMemoryStore();
  for (const week of PLACEHOLDER_WEEKS) store.content.set(week.week, week);
  store.families.set('demo-familia-1', {
    familyId: 'demo-familia-1',
    programId: PROGRAM.programId,
    status: 'activa',
    anchorDate: ANCHOR,
    babyName: 'Mateo',
    caregivers: [caregiver('999990001')],
    deliveredIsoWeeks: [],
  });
  return store;
}

function inboundPayload(text: string, wamid: string, atMs: number): unknown {
  return {
    entry: [{ changes: [{ value: { messages: [{
      from: MOTHER.slice(1),
      id: wamid,
      timestamp: String(Math.floor(atMs / 1000)),
      type: 'text',
      text: { body: text },
    }] } }] }],
  };
}

describe('ciclo completo en modo mock', () => {
  test('envío semanal, apertura del enlace, respuesta de la familia, y baja', async () => {
    const store = seed();
    const sink = { deliveries: [] as MockDelivery[], async record(d: MockDelivery) { this.deliveries.push(d); } };
    let clock = new Date('2026-09-15T14:00:00.000Z');
    const provider = new MockProvider(sink, () => clock);
    const templates: string[] = [];
    const spy = new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === 'sendTemplate') {
          return async (message: Parameters<MockProvider['sendTemplate']>[0]) => {
            templates.push(message.buttonUrlParam ?? '');
            return target.sendTemplate(message);
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });

    const sendOn = (today: IsoDate) =>
      runWeeklySend({ store, provider: spy, tokenSecret: SECRET, now: () => clock, today: () => today });
    const webhookOn = (payload: unknown) =>
      processEvents(
        { store, provider, now: () => clock, newId: () => `fb-${store.feedback.length + 1}` },
        parseWebhookPayload(payload).events,
      );

    // 1. Week 1: the family gets its message, and nothing was sent for free.
    const week1 = await sendOn(ANCHOR);
    assert.equal(week1.messagesSent, 1, 'semana 1 enviada');
    assert.equal(week1.provider, 'mock');
    assert.equal(sink.deliveries.length, 1, 'el mock registró el envío');
    assert.match(sink.deliveries[0]!.wamid, /^wamid\.MOCK-/, 'id marcado como simulado');

    // 2. The deep link token identifies this caregiver of this family.
    const token = templates[0]!;
    const opened = verifyFamilyToken(token, SECRET, clock);
    assert.equal(opened.valid, true);
    assert.equal(opened.valid && opened.payload.familyId, 'demo-familia-1');
    assert.equal(opened.valid && opened.payload.msisdn, MOTHER);

    // 3. A retry of the scheduler in the same week must not charge a second time.
    const retry = await sendOn(ANCHOR);
    assert.equal(retry.messagesSent, 0, 'el reintento no vuelve a enviar');
    assert.equal(retry.skipped['ya_enviado_esta_semana'], 1);
    assert.equal(sink.deliveries.length, 1);

    // 4. The mother writes back. It becomes an open consulta in the manager's inbox.
    clock = new Date('2026-09-16T02:30:00.000Z');
    await webhookOn(inboundPayload('¿A qué distancia le muestro el libro?', 'wamid.IN-1', clock.getTime()));
    assert.equal(store.feedback.length, 1);
    assert.equal(store.feedback[0]?.feedback.type, 'consulta');
    assert.equal(store.feedback[0]?.feedback.status, 'abierto');
    assert.equal(store.feedback[0]?.feedback.channel, 'whatsapp');
    // Her message opened the 24h service window, so a reply costs nothing.
    assert.equal(store.serviceWindow.get(MOTHER), clock.getTime());

    // 5. Meta retries the same webhook; it is not filed twice.
    await webhookOn(inboundPayload('¿A qué distancia le muestro el libro?', 'wamid.IN-1', clock.getTime()));
    assert.equal(store.feedback.length, 1, 'deduplicado por message.id');

    // 6. Next week, week 2 goes out.
    clock = new Date('2026-09-22T14:00:00.000Z');
    const week2 = await sendOn(addDays(ANCHOR, 7));
    assert.equal(week2.messagesSent, 1);
    assert.notEqual(isoWeek(addDays(ANCHOR, 7)), isoWeek(ANCHOR));
    assert.equal(sink.deliveries.length, 2);

    // 7. She sends BAJA. She is opted out and receives a confirmation.
    await webhookOn(inboundPayload('BAJA', 'wamid.IN-2', clock.getTime()));
    assert.equal(sink.deliveries.length, 3, 'confirmación de baja enviada');
    assert.equal(sink.deliveries[2]?.kind, 'text');
    assert.equal(store.feedback.length, 1, 'una baja no es también una consulta');

    // 8. From week 3 on she gets nothing, and the report says why.
    clock = new Date('2026-09-29T14:00:00.000Z');
    const week3 = await sendOn(addDays(ANCHOR, 14));
    assert.equal(week3.messagesSent, 0);
    assert.equal(week3.skipped['sin_cuidadores_con_opt_in'], 1);
    assert.equal(sink.deliveries.length, 3, 'no salió ningún mensaje más');
  });

  test('el estado de entrega de Meta se reconcilia con la familia y la semana', async () => {
    const store = seed();
    const sink = { deliveries: [] as MockDelivery[], async record(d: MockDelivery) { this.deliveries.push(d); } };
    const clock = new Date('2026-09-15T14:00:00.000Z');
    const provider = new MockProvider(sink, () => clock);

    await runWeeklySend({ store, provider, tokenSecret: SECRET, now: () => clock, today: () => ANCHOR });
    const wamid = sink.deliveries[0]!.wamid;

    await processEvents(
      { store, provider, now: () => clock, newId: () => 'x' },
      parseWebhookPayload({
        entry: [{ changes: [{ value: { statuses: [{
          id: wamid, status: 'delivered', timestamp: '1789000000', recipient_id: MOTHER.slice(1),
          pricing: { billable: true, pricing_model: 'CBP', category: 'utility' },
        }] } }] }],
      }).events,
    );

    // The wamid links the charge to a family and a week; the status carries what Meta billed.
    assert.deepEqual(store.wamidLinks.get(wamid), {
      familyId: 'demo-familia-1',
      isoWeek: isoWeek(ANCHOR),
    });
    assert.equal(store.statuses[0]?.pricing?.category, 'utility');
    assert.equal(store.statuses[0]?.pricing?.billable, true);
  });
});
