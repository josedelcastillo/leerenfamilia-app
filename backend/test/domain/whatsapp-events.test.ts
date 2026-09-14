import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebhookPayload } from '../../src/domain/whatsapp-events.ts';

function envelope(value: unknown): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '123', changes: [{ field: 'messages', value }] }],
  };
}

describe('parseWebhookPayload — inbound messages', () => {
  test('parses a plain text message', () => {
    const { events } = parseWebhookPayload(
      envelope({
        messaging_product: 'whatsapp',
        messages: [
          {
            from: '51987654321',
            id: 'wamid.ABC',
            timestamp: '1789000000',
            type: 'text',
            text: { body: '¿El bebé puede ver el libro tan cerca?' },
          },
        ],
      }),
    );

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      kind: 'inbound',
      wamid: 'wamid.ABC',
      from: '51987654321',
      timestampMs: 1_789_000_000_000,
      messageType: 'text',
      text: '¿El bebé puede ver el libro tan cerca?',
    });
  });

  test('converts Meta epoch seconds to milliseconds', () => {
    const { events } = parseWebhookPayload(
      envelope({ messages: [{ from: '51987654321', id: 'w', timestamp: '1789000000', type: 'text', text: { body: 'x' } }] }),
    );
    assert.equal(events[0]?.timestampMs, 1_789_000_000_000);
  });

  test('reads the label of a template quick-reply button', () => {
    // Quick replies are the engagement signal the weekly template depends on.
    const { events } = parseWebhookPayload(
      envelope({
        messages: [
          {
            from: '51987654321',
            id: 'wamid.BTN',
            timestamp: '1789000000',
            type: 'button',
            button: { text: 'Ver actividad', payload: 'VER_ACTIVIDAD' },
          },
        ],
      }),
    );
    assert.equal(events[0]?.kind === 'inbound' && events[0].text, 'Ver actividad');
  });

  test('falls back to the button payload when there is no label', () => {
    const { events } = parseWebhookPayload(
      envelope({
        messages: [{ from: '5198', id: 'w', timestamp: '1789000000', type: 'button', button: { payload: 'VER' } }],
      }),
    );
    assert.equal(events[0]?.kind === 'inbound' && events[0].text, 'VER');
  });

  test('reads an interactive button reply and a list reply', () => {
    const { events } = parseWebhookPayload(
      envelope({
        messages: [
          { from: '5198', id: 'w1', timestamp: '1789000000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'si', title: 'Sí, ya leímos' } } },
          { from: '5198', id: 'w2', timestamp: '1789000000', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'sem3', title: 'Semana 3' } } },
        ],
      }),
    );
    assert.equal(events[0]?.kind === 'inbound' && events[0].text, 'Sí, ya leímos');
    assert.equal(events[1]?.kind === 'inbound' && events[1].text, 'Semana 3');
  });

  test('keeps a media message with a null text rather than dropping it', () => {
    // An audio note from a caregiver is still a message that a manager should see.
    const { events } = parseWebhookPayload(
      envelope({ messages: [{ from: '5198', id: 'w', timestamp: '1789000000', type: 'audio', audio: { id: 'media-1' } }] }),
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind === 'inbound' && events[0].text, null);
    assert.equal(events[0]?.kind === 'inbound' && events[0].messageType, 'audio');
  });

  test('labels a message with no type as unknown instead of discarding it', () => {
    const { events } = parseWebhookPayload(
      envelope({ messages: [{ from: '5198', id: 'w', timestamp: '1789000000' }] }),
    );
    assert.equal(events[0]?.kind === 'inbound' && events[0].messageType, 'unknown');
    assert.equal(events[0]?.kind === 'inbound' && events[0].text, null);
  });

  test('accepts a numeric timestamp as well as the string Meta normally sends', () => {
    const { events } = parseWebhookPayload(
      envelope({ messages: [{ from: '5198', id: 'w', timestamp: 1789000000, type: 'text', text: { body: 'x' } }] }),
    );
    assert.equal(events[0]?.timestampMs, 1_789_000_000_000);
  });

  test('counts a message missing its id, sender or timestamp as ignored', () => {
    const { events, ignored } = parseWebhookPayload(
      envelope({
        messages: [
          { from: '5198', timestamp: '1789000000', type: 'text' },
          { id: 'w', timestamp: '1789000000', type: 'text' },
          { from: '5198', id: 'w', type: 'text' },
          'no es un objeto',
        ],
      }),
    );
    assert.equal(events.length, 0);
    assert.equal(ignored, 4);
  });
});

describe('parseWebhookPayload — statuses', () => {
  test('keeps the pricing object verbatim', () => {
    // This is the only way to reconcile against Meta's invoice and to see whether the template is
    // being charged as utility or as marketing.
    const { events } = parseWebhookPayload(
      envelope({
        statuses: [
          {
            id: 'wamid.SENT',
            status: 'delivered',
            timestamp: '1789000000',
            recipient_id: '51987654321',
            conversation: { id: 'conv-1', origin: { type: 'utility' } },
            pricing: { billable: true, pricing_model: 'CBP', category: 'utility' },
          },
        ],
      }),
    );

    assert.deepEqual(events[0], {
      kind: 'status',
      wamid: 'wamid.SENT',
      status: 'delivered',
      timestampMs: 1_789_000_000_000,
      recipientId: '51987654321',
      pricing: { category: 'utility', billable: true, pricingModel: 'CBP' },
      conversationId: 'conv-1',
    });
  });

  test('records a marketing category as faithfully as a utility one', () => {
    const { events } = parseWebhookPayload(
      envelope({ statuses: [{ id: 'w', status: 'sent', timestamp: '1789000000', pricing: { billable: true, category: 'marketing' } }] }),
    );
    assert.equal(events[0]?.kind === 'status' && events[0].pricing?.category, 'marketing');
  });

  test('accepts a status with no pricing block', () => {
    const { events } = parseWebhookPayload(
      envelope({ statuses: [{ id: 'w', status: 'read', timestamp: '1789000000' }] }),
    );
    assert.equal(events[0]?.kind === 'status' && events[0].pricing, null);
    assert.equal(events[0]?.kind === 'status' && events[0].conversationId, null);
  });

  test('counts a malformed status as ignored instead of emitting a broken event', () => {
    const { events, ignored } = parseWebhookPayload(
      envelope({
        statuses: [
          'no es un objeto',
          { status: 'sent', timestamp: '1789000000' },
          { id: 'w', timestamp: '1789000000' },
          { id: 'w', status: 'sent' },
        ],
      }),
    );
    assert.equal(events.length, 0);
    assert.equal(ignored, 4);
  });

  test('defaults a missing recipient_id to an empty string rather than dropping the status', () => {
    const { events } = parseWebhookPayload(
      envelope({ statuses: [{ id: 'w', status: 'sent', timestamp: '1789000000' }] }),
    );
    assert.equal(events[0]?.kind === 'status' && events[0].recipientId, '');
  });

  test('parses a failed status alongside its message', () => {
    const { events } = parseWebhookPayload(
      envelope({
        messages: [{ from: '5198', id: 'w1', timestamp: '1789000000', type: 'text', text: { body: 'hola' } }],
        statuses: [{ id: 'w2', status: 'failed', timestamp: '1789000001' }],
      }),
    );
    assert.equal(events.length, 2);
    assert.equal(events[0]?.kind, 'inbound');
    assert.equal(events[1]?.kind, 'status');
  });
});

describe('parseWebhookPayload — resilience', () => {
  test('never throws on shapes Meta has not sent before', () => {
    // A parser that throws would turn a new message type into a webhook that retries forever.
    for (const payload of [
      null, undefined, 42, 'texto', [], {},
      { entry: 'no es un array' },
      { entry: [null, 7, { changes: null }] },
      { entry: [{ changes: [{ value: null }] }] },
      { entry: [{ changes: [{ value: { messages: 'no es un array' } }] }] },
      envelope({ messages: [{ from: '5198', id: 'w', timestamp: 'no-es-un-numero', type: 'text' }] }),
      envelope({ messages: [{ from: '5198', id: 'w', timestamp: '-5', type: 'text' }] }),
    ]) {
      assert.doesNotThrow(() => parseWebhookPayload(payload), `threw on ${JSON.stringify(payload)}`);
    }
  });

  test('an unfamiliar top-level field does not stop the messages being read', () => {
    const { events } = parseWebhookPayload(
      envelope({ un_campo_nuevo: { algo: true }, messages: [{ from: '5198', id: 'w', timestamp: '1789000000', type: 'text', text: { body: 'hola' } }] }),
    );
    assert.equal(events.length, 1);
  });

  test('reads every change of every entry in a batched webhook', () => {
    const { events } = parseWebhookPayload({
      entry: [
        { changes: [{ value: { messages: [{ from: '1', id: 'a', timestamp: '1789000000', type: 'text', text: { body: 'a' } }] } }] },
        { changes: [
          { value: { messages: [{ from: '2', id: 'b', timestamp: '1789000000', type: 'text', text: { body: 'b' } }] } },
          { value: { statuses: [{ id: 'c', status: 'sent', timestamp: '1789000000' }] } },
        ] },
      ],
    });
    assert.deepEqual(events.map((e) => e.wamid), ['a', 'b', 'c']);
  });
});
