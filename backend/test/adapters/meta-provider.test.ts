import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toE164 } from '../../src/domain/msisdn.ts';
import { MetaCloudProvider, DEFAULT_GRAPH_VERSION } from '../../src/adapters/whatsapp/meta.ts';
import { WhatsAppSendError } from '../../src/adapters/whatsapp/provider.ts';

const TO = toE164('987654321');

interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function fakeFetch(response: { status?: number; body?: string }, captured: Captured[] = []) {
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(url),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const status = response.status ?? 200;
    return new Response(response.body ?? JSON.stringify({ messages: [{ id: 'wamid.REAL' }] }), {
      status,
    });
  }) as unknown as typeof fetch;
  return { impl, captured };
}

function provider(response: { status?: number; body?: string }, captured: Captured[] = []) {
  const { impl } = fakeFetch(response, captured);
  return new MetaCloudProvider(
    { phoneNumberId: '555000', accessToken: 'token-de-prueba' },
    impl,
  );
}

describe('sendText', () => {
  test('posts to the pinned Graph version and phone number id', async () => {
    const captured: Captured[] = [];
    await provider({}, captured).sendText({ to: TO, body: 'hola' });

    assert.equal(
      captured[0]?.url,
      `https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/555000/messages`,
    );
  });

  test('sends the access token as a bearer credential', async () => {
    const captured: Captured[] = [];
    await provider({}, captured).sendText({ to: TO, body: 'hola' });
    const headers = captured[0]?.init.headers as Record<string, string>;
    assert.equal(headers['authorization'], 'Bearer token-de-prueba');
  });

  test('disables link previews', async () => {
    const captured: Captured[] = [];
    await provider({}, captured).sendText({ to: TO, body: 'https://ejemplo.pe' });
    assert.deepEqual(captured[0]?.body['text'], { body: 'https://ejemplo.pe', preview_url: false });
  });

  test('returns the message id Meta assigned', async () => {
    const result = await provider({}).sendText({ to: TO, body: 'hola' });
    assert.deepEqual(result, { wamid: 'wamid.REAL', provider: 'meta' });
  });

  test('honours an overridden Graph version', async () => {
    const captured: Captured[] = [];
    const { impl } = fakeFetch({}, captured);
    const custom = new MetaCloudProvider(
      { phoneNumberId: '555000', accessToken: 't', graphVersion: 'v99.0' },
      impl,
    );
    await custom.sendText({ to: TO, body: 'hola' });
    assert.match(captured[0]!.url, /\/v99\.0\//);
  });
});

describe('sendTemplate', () => {
  test('builds body parameters in the order given', async () => {
    const captured: Captured[] = [];
    await provider({}, captured).sendTemplate({
      to: TO,
      templateName: 'semana_actividad',
      languageCode: 'es_PE',
      bodyParams: ['Mateo', '3', 'Tela y contraste'],
    });

    const template = captured[0]?.body['template'] as Record<string, unknown>;
    assert.equal(template['name'], 'semana_actividad');
    assert.deepEqual(template['language'], { code: 'es_PE' });
    assert.deepEqual(template['components'], [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Mateo' },
          { type: 'text', text: '3' },
          { type: 'text', text: 'Tela y contraste' },
        ],
      },
    ]);
  });

  test('adds a URL button component only when a parameter is supplied', async () => {
    const withButton: Captured[] = [];
    await provider({}, withButton).sendTemplate({
      to: TO, templateName: 't', languageCode: 'es', bodyParams: [], buttonUrlParam: 'tok123',
    });
    assert.deepEqual((withButton[0]?.body['template'] as Record<string, unknown>)['components'], [
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'tok123' }] },
    ]);

    const without: Captured[] = [];
    await provider({}, without).sendTemplate({
      to: TO, templateName: 't', languageCode: 'es', bodyParams: [],
    });
    assert.equal((without[0]?.body['template'] as Record<string, unknown>)['components'], undefined);
  });
});

describe('error handling', () => {
  test('raises a typed error carrying Meta status and body', async () => {
    const body = JSON.stringify({ error: { code: 131047, message: 'Re-engagement message' } });
    await assert.rejects(
      () => provider({ status: 400, body }).sendText({ to: TO, body: 'hola' }),
      (error: unknown) => {
        assert.ok(error instanceof WhatsAppSendError);
        assert.equal(error.status, 400);
        assert.match(error.responseBody, /131047/);
        return true;
      },
    );
  });

  test('rejects a 200 that carries no message id', async () => {
    // Treating this as success would record a delivery that never happened.
    await assert.rejects(
      () => provider({ body: JSON.stringify({ messages: [] }) }).sendText({ to: TO, body: 'x' }),
      /no id/,
    );
  });

  test('rejects a 200 whose body is not JSON', async () => {
    await assert.rejects(
      () => provider({ body: '<html>gateway</html>' }).sendText({ to: TO, body: 'x' }),
      /not JSON/,
    );
  });

  test('wraps a network failure instead of leaking the raw cause', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const p = new MetaCloudProvider({ phoneNumberId: '1', accessToken: 't' }, failing);
    await assert.rejects(() => p.sendText({ to: TO, body: 'x' }), (error: unknown) => {
      assert.ok(error instanceof WhatsAppSendError);
      assert.equal(error.status, null);
      return true;
    });
  });
});
