import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebhookPayload } from '../../src/domain/whatsapp-events.ts';
import type { Feedback } from '../../src/domain/feedback.ts';
import type { StatusEvent } from '../../src/domain/whatsapp-events.ts';
import type { CaregiverRef } from '../../src/adapters/dynamo.ts';
import { MockProvider, type MockDelivery } from '../../src/adapters/whatsapp/index.ts';
import { processEvents, type WebhookStore } from '../../src/handlers/wa-webhook/process.ts';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const SENDER = '51987654321';

const CAREGIVER: CaregiverRef = {
  familyId: 'fam-1',
  programId: 'piloto-2026',
  msisdn: '+51987654321',
  role: 'principal',
  optIn: true,
  lastInboundAt: null,
};

class FakeStore implements WebhookStore {
  claimed = new Set<string>();
  released: string[] = [];
  caregiver: CaregiverRef | null = CAREGIVER;
  windowTouches: Array<{ familyId: string; msisdn: string; atMs: number }> = [];
  optOuts: Array<{ familyId: string; msisdn: string; atIso: string }> = [];
  feedback: Array<{ familyId: string; programId: string; feedback: Feedback }> = [];
  statuses: StatusEvent[] = [];
  failOn: 'window' | 'feedback' | 'status' | null = null;

  async claimMessageId(wamid: string): Promise<boolean> {
    if (this.claimed.has(wamid)) return false;
    this.claimed.add(wamid);
    return true;
  }
  async releaseMessageId(wamid: string): Promise<void> {
    this.claimed.delete(wamid);
    this.released.push(wamid);
  }
  async findCaregiverByMsisdn(): Promise<CaregiverRef | null> {
    return this.caregiver;
  }
  async touchServiceWindow(familyId: string, msisdn: string, atMs: number): Promise<void> {
    if (this.failOn === 'window') throw new Error('dynamo caído');
    this.windowTouches.push({ familyId, msisdn, atMs });
  }
  async optOutCaregiver(familyId: string, msisdn: string, atIso: string): Promise<void> {
    this.optOuts.push({ familyId, msisdn, atIso });
  }
  async putFeedback(familyId: string, programId: string, feedback: Feedback): Promise<void> {
    if (this.failOn === 'feedback') throw new Error('dynamo caído');
    this.feedback.push({ familyId, programId, feedback });
  }
  async putMessageStatus(event: StatusEvent): Promise<void> {
    if (this.failOn === 'status') throw new Error('dynamo caído');
    this.statuses.push(event);
  }
}

class RecordingSink {
  deliveries: MockDelivery[] = [];
  async record(delivery: MockDelivery): Promise<void> {
    this.deliveries.push(delivery);
  }
}

let store: FakeStore;
let sink: RecordingSink;
let provider: MockProvider;
let counter: number;

beforeEach(() => {
  store = new FakeStore();
  sink = new RecordingSink();
  provider = new MockProvider(sink, () => NOW);
  counter = 0;
});

function deps() {
  return { store, provider, now: () => NOW, newId: () => `id-${++counter}` };
}

function inbound(text: string | null, wamid = 'wamid.A', type = 'text') {
  return parseWebhookPayload({
    entry: [{ changes: [{ value: { messages: [{
      from: SENDER, id: wamid, timestamp: '1789000000', type,
      ...(text !== null ? { text: { body: text } } : {}),
    }] } }] }],
  }).events;
}

describe('inbound messages', () => {
  test('a free-text message becomes an open consulta in the inbox', async () => {
    const summary = await processEvents(deps(), inbound('¿Cuánto rato debo leerle?'));

    assert.equal(summary.feedbackCreated, 1);
    assert.equal(store.feedback.length, 1);
    const entry = store.feedback[0]!;
    assert.equal(entry.familyId, 'fam-1');
    assert.equal(entry.programId, 'piloto-2026');
    assert.equal(entry.feedback.type, 'consulta');
    assert.equal(entry.feedback.status, 'abierto');
    assert.equal(entry.feedback.channel, 'whatsapp');
    assert.equal(entry.feedback.text, '¿Cuánto rato debo leerle?');
  });

  test('the feedback is timestamped when the family sent it, not when we processed it', async () => {
    await processEvents(deps(), inbound('hola'));
    assert.equal(store.feedback[0]?.feedback.createdAt, new Date(1_789_000_000_000).toISOString());
  });

  test('every inbound message reopens the service window', async () => {
    await processEvents(deps(), inbound('hola'));
    assert.deepEqual(store.windowTouches, [
      { familyId: 'fam-1', msisdn: '+51987654321', atMs: 1_789_000_000_000 },
    ]);
  });

  test('a media message is filed with a readable placeholder instead of being dropped', async () => {
    await processEvents(deps(), inbound(null, 'wamid.AUDIO', 'audio'));
    assert.equal(store.feedback[0]?.feedback.text, '[audio] mensaje sin texto');
  });

  test('a message from a number we do not know is logged and dropped', async () => {
    store.caregiver = null;
    const summary = await processEvents(deps(), inbound('hola'));

    assert.equal(summary.unknownSenders, 1);
    assert.equal(summary.feedbackCreated, 0);
    assert.equal(store.feedback.length, 0);
    assert.equal(store.windowTouches.length, 0);
  });
});

describe('opt-out keywords', () => {
  for (const keyword of ['BAJA', 'stop', ' Salír ']) {
    test(`"${keyword}" opts the caregiver out and confirms`, async () => {
      const summary = await processEvents(deps(), inbound(keyword));

      assert.equal(summary.optOuts, 1);
      assert.deepEqual(store.optOuts, [
        { familyId: 'fam-1', msisdn: '+51987654321', atIso: NOW.toISOString() },
      ]);
      // Meta policy requires the confirmation, and the window is open because they just wrote.
      assert.equal(sink.deliveries.length, 1);
      assert.equal(sink.deliveries[0]?.kind, 'text');
      assert.match(String((sink.deliveries[0]?.payload as { body: string }).body), /diste de baja/);
      // An opt-out is not also a consulta.
      assert.equal(summary.feedbackCreated, 0);
    });
  }

  test('a sentence containing the word is filed for a human instead of opting out', async () => {
    const summary = await processEvents(deps(), inbound('quiero darme de baja por favor'));

    assert.equal(summary.optOuts, 0);
    assert.equal(store.optOuts.length, 0);
    assert.equal(summary.feedbackCreated, 1);
    assert.equal(store.feedback[0]?.feedback.type, 'consulta');
  });

  test('an opt-out still reopens the window before it is applied', async () => {
    await processEvents(deps(), inbound('BAJA'));
    assert.equal(store.windowTouches.length, 1);
  });
});

describe('deduplication', () => {
  test('the same message id delivered twice is processed once', async () => {
    // Meta retries whenever it does not see a fast 200.
    const events = inbound('hola', 'wamid.DUP');
    const first = await processEvents(deps(), events);
    const second = await processEvents(deps(), events);

    assert.equal(first.feedbackCreated, 1);
    assert.equal(second.feedbackCreated, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(store.feedback.length, 1);
  });

  test('two different messages in one payload are both processed', async () => {
    const events = [...inbound('primera', 'wamid.1'), ...inbound('segunda', 'wamid.2')];
    const summary = await processEvents(deps(), events);
    assert.equal(summary.feedbackCreated, 2);
  });

  test('a failure hands the claim back so the retry is not swallowed', async () => {
    // Losing a mother's message silently is worse than filing it twice.
    store.failOn = 'feedback';
    const failed = await processEvents(deps(), inbound('hola', 'wamid.RETRY'));
    assert.equal(failed.errors, 1);
    assert.deepEqual(store.released, ['wamid.RETRY']);

    store.failOn = null;
    const retried = await processEvents(deps(), inbound('hola', 'wamid.RETRY'));
    assert.equal(retried.feedbackCreated, 1);
  });
});

describe('statuses', () => {
  test('persists the status and its pricing', async () => {
    const events = parseWebhookPayload({
      entry: [{ changes: [{ value: { statuses: [{
        id: 'wamid.SENT', status: 'delivered', timestamp: '1789000000', recipient_id: SENDER,
        pricing: { billable: true, pricing_model: 'CBP', category: 'utility' },
      }] } }] }],
    }).events;

    const summary = await processEvents(deps(), events);
    assert.equal(summary.statuses, 1);
    assert.equal(store.statuses[0]?.pricing?.category, 'utility');
    assert.equal(store.statuses[0]?.pricing?.billable, true);
  });

  test('a status does not consume the message-id dedupe entry', async () => {
    // Statuses repeat per message id (sent, delivered, read) and are idempotent by their own key.
    const status = parseWebhookPayload({
      entry: [{ changes: [{ value: { statuses: [
        { id: 'wamid.X', status: 'sent', timestamp: '1789000000' },
        { id: 'wamid.X', status: 'delivered', timestamp: '1789000001' },
        { id: 'wamid.X', status: 'read', timestamp: '1789000002' },
      ] } }] }],
    }).events;

    const summary = await processEvents(deps(), status);
    assert.equal(summary.statuses, 3);
    assert.equal(summary.duplicates, 0);
  });
});

describe('failure isolation', () => {
  test('one bad event does not stop the rest of the batch', async () => {
    // A webhook carrying a broken status and a real message must not lose the message.
    store.failOn = 'status';
    const events = [
      ...parseWebhookPayload({ entry: [{ changes: [{ value: { statuses: [{ id: 'w0', status: 'sent', timestamp: '1789000000' }] } }] }] }).events,
      ...inbound('mensaje real', 'wamid.REAL'),
    ];

    const summary = await processEvents(deps(), events);
    assert.equal(summary.errors, 1);
    assert.equal(summary.feedbackCreated, 1);
    assert.equal(store.feedback[0]?.feedback.text, 'mensaje real');
  });
});

describe('mock provider', () => {
  test('marks its message ids so they can never pass for real ones', async () => {
    await processEvents(deps(), inbound('BAJA'));
    assert.match(sink.deliveries[0]!.wamid, /^wamid\.MOCK-/);
  });

  test('records what it would have sent, to the audit sink', async () => {
    await processEvents(deps(), inbound('BAJA'));
    assert.equal(sink.deliveries.length, 1);
    assert.equal(sink.deliveries[0]?.to, '+51987654321');
    assert.equal(sink.deliveries[0]?.sentAt, NOW.toISOString());
  });
});
