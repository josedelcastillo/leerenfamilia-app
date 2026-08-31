import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { notImplemented } from '../../shared/http.ts';

// Phase 1: QR enrolment, consent capture, family token issuance.
export async function handler(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented('fn-register', 1);
}
