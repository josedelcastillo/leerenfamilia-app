import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { json } from '../../shared/http.ts';
import { familyStore, openSession, parseBody, toErrorResponse } from '../family-runtime.ts';
import { listOwnFeedback, submitFeedback } from './logic.ts';

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const opened = await openSession(event);
  if ('response' in opened) {
    return opened.response;
  }

  try {
    const { context } = opened.session;

    if (event.requestContext.http.method === 'GET') {
      return json(200, { feedback: await listOwnFeedback(familyStore, context) });
    }

    const body = parseBody(event);
    const feedback = await submitFeedback(familyStore, context, {
      clientId: String(body['clientId'] ?? ''),
      type: String(body['type'] ?? ''),
      text: String(body['text'] ?? ''),
      createdAt: typeof body['createdAt'] === 'string' ? body['createdAt'] : opened.session.now.toISOString(),
    });
    return json(201, { feedback });
  } catch (error) {
    return toErrorResponse(error);
  }
}
