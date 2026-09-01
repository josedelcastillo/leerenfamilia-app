import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DomainError } from '../domain/errors.ts';
import { FamilyDataStore } from '../adapters/family-store.ts';
import { ParameterStore } from '../adapters/ssm.ts';
import { authenticateFamily, type FamilyPrincipal } from '../shared/family-auth.ts';
import { json } from '../shared/http.ts';
import { limaDate } from '../shared/lima-date.ts';
import { requireEnv } from '../shared/env.ts';
import type { FamilyContext } from './family-ports.ts';

export const parameters = new ParameterStore({ prefix: requireEnv('SSM_PREFIX') });
export const familyStore = new FamilyDataStore(requireEnv('TABLE_NAME'));

export interface FamilySession {
  readonly principal: FamilyPrincipal;
  readonly context: FamilyContext;
  readonly today: ReturnType<typeof limaDate>;
  readonly now: Date;
}

/**
 * Resolves the caller's family from the signed token, or returns the response to send instead.
 * Callers get a `FamilyContext` loaded from storage; the token is only ever trusted for identity.
 */
export async function openSession(
  event: APIGatewayProxyEventV2,
): Promise<{ session: FamilySession } | { response: APIGatewayProxyStructuredResultV2 }> {
  const now = new Date();
  const secrets = await parameters.get(['APP_TOKEN_SECRET']);
  const auth = authenticateFamily(
    event.headers as Record<string, string | undefined>,
    (event.queryStringParameters ?? {}) as Record<string, string | undefined>,
    secrets.APP_TOKEN_SECRET,
    now,
  );

  if (!auth.ok) {
    return { response: json(401, { error: 'no_autorizado', reason: auth.reason }) };
  }

  const context = await familyStore.getContext(auth.principal.familyId);
  if (context === null) {
    return { response: json(404, { error: 'familia_no_encontrada' }) };
  }
  if (context.status === 'suprimida') {
    // Erasure has been executed; the token must stop working even before it expires.
    return { response: json(410, { error: 'familia_suprimida' }) };
  }

  return { session: { principal: auth.principal, context, today: limaDate(now), now } };
}

export function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (event.body === undefined || event.body === '') {
    return {};
  }
  const raw = event.isBase64Encoded === true
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Domain rejections are the caller's fault and carry a message meant for the caller. */
export function toErrorResponse(error: unknown): APIGatewayProxyStructuredResultV2 {
  if (error instanceof DomainError) {
    return json(400, { error: error.code, message: error.message });
  }
  console.error(
    JSON.stringify({
      event: 'family_api.unhandled',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return json(500, { error: 'error_interno' });
}
