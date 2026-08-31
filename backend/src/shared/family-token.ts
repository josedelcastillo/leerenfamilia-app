import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The family's credential. There is no login: a mother with a weeks-old baby, at 3am, with one
 * hand free, will not get through a password form, and any friction there costs adoption. The link
 * that arrives by WhatsApp carries this token instead.
 *
 * It identifies the **caregiver**, not just the family, because the pilot needs to know whether the
 * reading log was filled in by the mother or the father.
 */
export const FAMILY_TOKEN_DAYS = 90;

export interface FamilyTokenPayload {
  readonly familyId: string;
  readonly msisdn: string;
  /** Expiry, epoch seconds. */
  readonly exp: number;
}

interface WireFormat {
  readonly f: string;
  readonly c: string;
  readonly e: number;
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function issueFamilyToken(
  familyId: string,
  msisdn: string,
  now: Date,
  secret: string,
  days = FAMILY_TOKEN_DAYS,
): string {
  const exp = Math.floor(now.getTime() / 1000) + days * 24 * 60 * 60;
  const wire: WireFormat = { f: familyId, c: msisdn, e: exp };
  const body = base64url(Buffer.from(JSON.stringify(wire), 'utf8'));
  return `${body}.${base64url(sign(body, secret))}`;
}

export type TokenRejection =
  | 'malformed'
  | 'bad_signature'
  | 'expired';

export type TokenVerification =
  | { readonly valid: true; readonly payload: FamilyTokenPayload }
  | { readonly valid: false; readonly reason: TokenRejection };

/**
 * Signature is checked before expiry, and before the payload is trusted for anything. A caller must
 * never read `familyId` out of an unverified token.
 */
export function verifyFamilyToken(token: string, secret: string, now: Date): TokenVerification {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return { valid: false, reason: 'malformed' };
  }
  const body = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), 'base64url');
  const expected = sign(body, secret);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false, reason: 'bad_signature' };
  }

  let wire: WireFormat;
  try {
    wire = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as WireFormat;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (
    typeof wire.f !== 'string' || wire.f === '' ||
    typeof wire.c !== 'string' || wire.c === '' ||
    typeof wire.e !== 'number' || !Number.isFinite(wire.e)
  ) {
    return { valid: false, reason: 'malformed' };
  }

  if (wire.e * 1000 <= now.getTime()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload: { familyId: wire.f, msisdn: wire.c, exp: wire.e } };
}
