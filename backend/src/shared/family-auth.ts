import { verifyFamilyToken, type TokenRejection } from './family-token.ts';

export interface FamilyPrincipal {
  readonly familyId: string;
  readonly msisdn: string;
}

export type FamilyAuth =
  | { readonly ok: true; readonly principal: FamilyPrincipal }
  | { readonly ok: false; readonly status: 401; readonly reason: TokenRejection | 'missing' };

/**
 * Families do not log in. The token arrives in the `Authorization` header once the PWA has stored
 * it, or as `?t=` the very first time, straight from the WhatsApp link.
 *
 * Nothing downstream may read a family id from anywhere but the verified payload.
 */
export function authenticateFamily(
  headers: Record<string, string | undefined>,
  query: Record<string, string | undefined>,
  secret: string,
  now: Date,
): FamilyAuth {
  const header = headers['authorization'] ?? headers['Authorization'];
  const bearer = header?.startsWith('Bearer ') === true ? header.slice(7).trim() : undefined;
  const token = bearer !== undefined && bearer !== '' ? bearer : query['t'];

  if (token === undefined || token === '') {
    return { ok: false, status: 401, reason: 'missing' };
  }

  const verified = verifyFamilyToken(token, secret, now);
  if (!verified.valid) {
    return { ok: false, status: 401, reason: verified.reason };
  }
  return {
    ok: true,
    principal: { familyId: verified.payload.familyId, msisdn: verified.payload.msisdn },
  };
}
