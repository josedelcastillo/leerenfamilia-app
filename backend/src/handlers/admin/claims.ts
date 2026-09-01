import type { Gestor } from './ports.ts';

/**
 * Reads the manager's identity out of the JWT authorizer's claims.
 *
 * Pure on purpose, and separate from `index.ts`, because `index.ts` builds the AWS clients at module
 * load and cannot be imported from a test.
 *
 * The shape of `cognito:groups` is the whole reason this exists. The HTTP API's native JWT
 * authorizer flattens every multi-valued claim into a **single bracketed string** before it reaches
 * the Lambda: one group arrives as `"[gestores]"` and two as `"[gestores administradores]"`, never
 * as a JSON array. Splitting on whitespace without stripping the brackets yields `"[gestores]"`,
 * which matches no group name, and every manager gets a 403 on the family detail. Arrays are still
 * accepted because a Lambda authorizer or a direct unit test can hand us one.
 */
export function gestorFromClaims(claims: Record<string, unknown>): Gestor {
  return {
    sub: String(claims['sub'] ?? ''),
    email: String(claims['email'] ?? ''),
    groups: parseGroups(claims['cognito:groups']),
  };
}

export function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).filter((group) => group !== '');
  }
  if (typeof raw !== 'string') {
    return [];
  }
  return raw
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(/[\s,]+/)
    .filter((group) => group !== '');
}
