import { DomainError } from './errors.ts';

/** A phone number in E.164, e.g. `+51987654321`. */
export type Msisdn = string & { readonly __brand: 'Msisdn' };

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const PERU_COUNTRY_CODE = '51';
const PERU_MOBILE_DIGITS = 9;

/**
 * Normalises what a caregiver actually types into E.164.
 *
 * Peruvian mobiles are nine digits starting with 9, and families write them every possible way:
 * `987 654 321`, `987-654-321`, `+51 987654321`, `0051987654321`. Rejecting those at the QR form
 * would cost enrolments, so we accept them and normalise rather than lecture the user.
 */
export function toE164(raw: string, defaultCountryCode = PERU_COUNTRY_CODE): Msisdn {
  const cleaned = raw.replace(/[\s()\-.]/g, '');

  let digits: string;
  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    digits = cleaned.slice(2);
  } else if (cleaned.length === PERU_MOBILE_DIGITS && defaultCountryCode === PERU_COUNTRY_CODE) {
    digits = PERU_COUNTRY_CODE + cleaned;
  } else {
    digits = cleaned;
  }

  if (!/^\d+$/.test(digits)) {
    throw new DomainError('invalid_msisdn', `Not a phone number: ${raw}`);
  }

  const candidate = `+${digits}`;
  if (!E164_PATTERN.test(candidate)) {
    throw new DomainError('invalid_msisdn', `Not a valid E.164 number: ${raw}`);
  }
  return candidate as Msisdn;
}

export function isE164(value: string): value is Msisdn {
  return E164_PATTERN.test(value);
}
