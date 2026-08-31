import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { notImplemented } from '../../shared/http.ts';

// Phase 5: family-side feedback creation and reading of replies.
export async function handler(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented('fn-feedback', 5);
}
