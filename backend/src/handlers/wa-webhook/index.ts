import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { notImplemented } from '../../shared/http.ts';

// Phase 3: Meta webhook. GET performs hub.challenge verification; POST validates
// X-Hub-Signature-256 before anything else and rejects with 403 when it does not match.
export async function handler(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented('fn-wa-webhook', 3);
}
