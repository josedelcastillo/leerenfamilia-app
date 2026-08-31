/**
 * Every key the single table uses, in one place. Pure string building, so the layout is testable
 * without DynamoDB and a change to it is visible in one diff.
 *
 * See docs/arquitectura.md for the entity table these correspond to.
 */

export const KEY = {
  family: (familyId: string) => `FAMILY#${familyId}`,
  program: (programId: string) => `PROGRAM#${programId}`,
  waMessage: (wamid: string) => `WAMSG#${wamid}`,
  wamid: (wamid: string) => `WAMID#${wamid}`,
  auditMonth: (yyyyMm: string) => `AUDIT#${yyyyMm}`,
  mockMonth: (yyyyMm: string) => `MOCKWA#${yyyyMm}`,
} as const;

export const SK = {
  meta: 'META',
  baby: 'BABY',
  dedupe: 'DEDUPE',
  caregiver: (msisdn: string) => `CAREGIVER#${msisdn}`,
  consent: (isoTs: string) => `CONSENT#${isoTs}`,
  access: (isoTs: string, resourceId: string) => `ACCESS#${isoTs}#${resourceId}`,
  log: (isoTs: string) => `LOG#${isoTs}`,
  feedback: (isoTs: string) => `FEEDBACK#${isoTs}`,
  delivery: (isoWeek: string) => `DELIVERY#${isoWeek}`,
  content: (week: number) => `CONTENT#${String(week).padStart(2, '0')}`,
  status: (status: string) => `STATUS#${status}`,
} as const;

/** GSI1 serves three access patterns; see docs/arquitectura.md for why one index is enough. */
export const GSI1 = {
  /** Families of a program, filtered by status, ordered by anchor date. */
  familiesByStatus: (programId: string, status: string) => `PROGRAM#${programId}#STATUS#${status}`,
  familyByStatusSort: (anchorDate: string, familyId: string) => `${anchorDate}#${familyId}`,

  /** The manager's inbox: feedback of a program filtered by status, oldest first. */
  feedbackByStatus: (programId: string, status: string) => `PROGRAM#${programId}#FEEDBACK#${status}`,
  feedbackSort: (isoTs: string, familyId: string) => `${isoTs}#${familyId}`,

  /**
   * Phone number to family. Required by the webhook: an inbound WhatsApp message carries only the
   * sender's number, and without this the only alternative is scanning the table per message.
   */
  byMsisdn: (msisdn: string) => `MSISDN#${msisdn}`,
  msisdnSort: (familyId: string) => `FAMILY#${familyId}`,
} as const;

/** DynamoDB TTL is in epoch **seconds**, not milliseconds. Getting this wrong deletes nothing. */
export function ttlSeconds(from: Date, days: number): number {
  return Math.floor(from.getTime() / 1000) + days * 24 * 60 * 60;
}

export const TTL_DAYS = {
  /** Data-protection retention for manager access records (encargo §8). */
  audit: 365,
  /** Meta stops retrying long before this; the entries exist only to absorb those retries. */
  webhookDedupe: 7,
  /** Mock sends are demo data, not pilot data. */
  mockDelivery: 90,
} as const;
