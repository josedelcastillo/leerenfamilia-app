import { DomainError } from './errors.ts';
import type { Msisdn } from './msisdn.ts';

export type OptInSource = 'qr' | 'whatsapp' | 'gestor';

export interface Caregiver {
  readonly msisdn: Msisdn;
  readonly role: 'principal' | 'secundario';
  readonly optIn: boolean;
  /** ISO instant. Always present when `optIn` is true: consent without a timestamp is not consent. */
  readonly optInAt: string | null;
  readonly optInSource: OptInSource | null;
  readonly optOutAt: string | null;
}

/**
 * Keywords Meta's policy requires us to honour. Matched exactly, after stripping accents,
 * punctuation and case.
 *
 * Deliberately not fuzzy: "quiero darme de baja" does not match, and lands in the manager inbox as
 * a `consulta` for a human to action. Guessing at intent risks silently cutting off a family that
 * never asked to leave, and a message a human reads is the safer failure.
 */
export const OPT_OUT_KEYWORDS = ['BAJA', 'STOP', 'SALIR'] as const;

export function normalizeKeyword(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();
}

export function isOptOutKeyword(text: string): boolean {
  const normalized = normalizeKeyword(text);
  return OPT_OUT_KEYWORDS.some((keyword) => keyword === normalized);
}

/** True when we are allowed to send this caregiver a message at all. */
export function canReceiveMessages(caregiver: Caregiver): boolean {
  return caregiver.optIn && caregiver.optOutAt === null;
}

/**
 * Consent must carry when it was given and through which channel; the data-protection record is
 * the point of it. An opt-in missing either is rejected rather than quietly stored.
 */
export function assertValidOptIn(caregiver: Caregiver): void {
  if (!caregiver.optIn) {
    return;
  }
  if (caregiver.optInAt === null || caregiver.optInSource === null) {
    throw new DomainError(
      'invalid_opt_in',
      `Opt-in for ${caregiver.msisdn} is missing its timestamp or source`,
    );
  }
}

export function applyOptIn(caregiver: Caregiver, at: string, source: OptInSource): Caregiver {
  return { ...caregiver, optIn: true, optInAt: at, optInSource: source, optOutAt: null };
}

/**
 * Opting out keeps `optInAt` and `optInSource`: they are the record of a consent that was once
 * given, and erasing them would erase the audit trail. Suppression is a separate action.
 */
export function applyOptOut(caregiver: Caregiver, at: string): Caregiver {
  return { ...caregiver, optIn: false, optOutAt: at };
}
