import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { json } from '../../shared/http.ts';
import { issueFamilyToken } from '../../shared/family-token.ts';
import { limaDate } from '../../shared/lima-date.ts';
import { familyStore, parameters, parseBody, toErrorResponse } from '../family-runtime.ts';
import { enroll, type EnrollmentRequest } from './logic.ts';

/**
 * Enrolment from the clinic QR. Public by design: the family is standing at the desk with a
 * newborn and has no credential yet. What protects it is that it only creates, never reads: an
 * attempt to enrol a number that already exists is refused rather than merged.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const now = new Date();
    const request = parseBody(event) as unknown as EnrollmentRequest;
    const { record } = await enroll(familyStore, request, limaDate(now), now, randomUUID);

    const secrets = await parameters.get(['APP_TOKEN_SECRET']);
    // The caregiver filling the form gets their token straight away, so the PWA works before the
    // first WhatsApp message ever arrives.
    const primary = record.caregivers[0]!;

    return json(201, {
      familyId: record.familyId,
      anchorDate: record.anchorDate,
      token: issueFamilyToken(record.familyId, primary.msisdn, now, secrets.APP_TOKEN_SECRET),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
