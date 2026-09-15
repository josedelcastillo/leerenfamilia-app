import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { json } from '../../shared/http.ts';
import { familyStore, openSession, parseBody, toErrorResponse } from '../family-runtime.ts';
import { applySync, listOwnLog, type SyncItem } from './logic.ts';

/** One flush of the device's queue may not be unbounded; the client batches beyond this. */
const MAX_ITEMS = 100;

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const opened = await openSession(event);
    if ('response' in opened) {
      return opened.response;
    }
    const { context, principal, today, now } = opened.session;

    if (event.requestContext.http.method === 'GET') {
      return json(200, await listOwnLog(familyStore, context));
    }

    const body = parseBody(event);
    const items = Array.isArray(body['items']) ? (body['items'] as SyncItem[]) : [];

    if (items.length === 0) {
      return json(400, { error: 'lote_vacio' });
    }
    if (items.length > MAX_ITEMS) {
      return json(413, { error: 'lote_demasiado_grande', maxItems: MAX_ITEMS });
    }

    const results = await applySync(
      familyStore,
      context,
      principal.msisdn,
      items,
      today,
      now,
    );
    // 200 even when some items failed: the per-item results are the answer, and the device uses
    // them to dequeue exactly what landed.
    return json(200, { results });
  } catch (error) {
    return toErrorResponse(error);
  }
}
