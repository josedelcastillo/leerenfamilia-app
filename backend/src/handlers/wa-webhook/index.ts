import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { parseWebhookPayload } from '../../domain/whatsapp-events.ts';
import { Store } from '../../adapters/dynamo.ts';
import { ParameterStore } from '../../adapters/ssm.ts';
import { createWhatsAppProvider } from '../../adapters/whatsapp/index.ts';
import { rawBody, verifyMetaSignature, verifyTokenMatches } from '../../shared/signature.ts';
import { requireEnv, optionalEnv } from '../../shared/env.ts';
import { json } from '../../shared/http.ts';
import { processEvents } from './process.ts';

// Built once per execution environment; the SSM reads inside are cached and refreshed on their own.
const parameters = new ParameterStore({ prefix: requireEnv('SSM_PREFIX') });
const store = new Store(requireEnv('TABLE_NAME'));

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === 'GET') {
    return handleVerification(event);
  }
  if (method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }
  return handleEvent(event);
}

/** Meta's subscription handshake: echo `hub.challenge` back, but only for the right token. */
async function handleVerification(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const query = event.queryStringParameters ?? {};
  const secrets = await parameters.get(['WA_VERIFY_TOKEN']);

  if (
    query['hub.mode'] !== 'subscribe' ||
    !verifyTokenMatches(query['hub.verify_token'], secrets.WA_VERIFY_TOKEN)
  ) {
    return json(403, { error: 'forbidden' });
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: query['hub.challenge'] ?? '',
  };
}

async function handleEvent(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = rawBody(event.body, event.isBase64Encoded === true);

  // Signature first, before parsing and before touching storage. There is no bypass and no
  // development mode that skips this: an unsigned request is not from Meta.
  const secrets = await parameters.get(['WA_APP_SECRET']);
  const signature = event.headers['x-hub-signature-256'] ?? event.headers['X-Hub-Signature-256'];
  if (!verifyMetaSignature(body, signature, secrets.WA_APP_SECRET)) {
    console.warn(JSON.stringify({ event: 'whatsapp.webhook.bad_signature' }));
    return json(403, { error: 'invalid_signature' });
  }

  // From here on the answer is always 200. Meta retries anything else, and a retry storm on a
  // parsing bug would be worse than dropping one payload we have already logged.
  try {
    const parsed = parseWebhookPayload(JSON.parse(body.toString('utf8')) as unknown);

    const provider = await createWhatsAppProvider({
      providerName: optionalEnv('WA_PROVIDER', 'mock'),
      parameters,
      sink: store,
      ...(process.env['WA_GRAPH_VERSION'] !== undefined
        ? { graphVersion: process.env['WA_GRAPH_VERSION'] }
        : {}),
    });

    const summary = await processEvents(
      { store, provider, now: () => new Date(), newId: () => randomUUID() },
      parsed.events,
    );
    console.log(
      JSON.stringify({ event: 'whatsapp.webhook.processed', ...summary, ignored: parsed.ignored }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'whatsapp.webhook.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  return json(200, { received: true });
}
