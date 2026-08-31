import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { notImplemented } from '../../shared/http.ts';

// Phase 5: weekly content for the family, weeks 1..current only.
export async function handler(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented('fn-content', 5);
}
