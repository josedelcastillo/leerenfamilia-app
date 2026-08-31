import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { notImplemented } from '../../shared/http.ts';

// Phase 5: QR enrolment, consent capture and family token issuance, together with the family
// surface that consumes them. Until then, demo families come from backend/scripts/seed-demo.ts.
export async function handler(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented('fn-register', 5);
}
