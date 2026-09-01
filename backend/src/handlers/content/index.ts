import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { json } from '../../shared/http.ts';
import { familyStore, openSession, toErrorResponse } from '../family-runtime.ts';
import { getContent } from './logic.ts';

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const opened = await openSession(event);
    if ('response' in opened) {
      return opened.response;
    }
    const { context, today } = opened.session;
    return json(200, await getContent(familyStore, context, today), {
      // Content is identical for every family in the same programme week, and the PWA caches it in
      // the service worker anyway; a short private cache saves a round trip on a bad connection.
      'cache-control': 'private, max-age=300',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
