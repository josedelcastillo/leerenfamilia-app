import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return { statusCode, headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) };
}

/**
 * Placeholder for handlers whose behaviour lands in a later phase. Returning 501 rather than a
 * cheerful 200 keeps a deployed-but-unimplemented route distinguishable from a working one.
 */
export function notImplemented(service: string, phase: number): APIGatewayProxyStructuredResultV2 {
  return json(501, { error: 'not_implemented', service, plannedPhase: phase });
}
