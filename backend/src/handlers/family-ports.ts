import type { IsoDate } from '../domain/dates.ts';
import type { Feedback, FeedbackType } from '../domain/feedback.ts';
import type { DeclaredBy, LogEntry, LoggedBy } from '../domain/log-entry.ts';
import type { WeekContent } from '../content/weeks.ts';

export interface FamilyContext {
  readonly familyId: string;
  readonly programId: string;
  readonly status: 'activa' | 'baja' | 'suprimida';
  readonly anchorDate: IsoDate;
  readonly programWeeks: number;
  readonly babyName: string;
  /**
   * Whether the family authorised managers to read the free text of their log notes. Modelled from
   * the start because the notes describe the domestic routine of a household with a newborn.
   */
  readonly freeTextNotesAuthorized: boolean;
  readonly caregivers: ReadonlyArray<{
    readonly msisdn: string;
    readonly role: LoggedBy;
    readonly relation: DeclaredBy | null;
  }>;
}

export interface ResourceAccess {
  readonly clientId: string;
  readonly resourceId: string;
  readonly week: number;
  readonly at: string;
}

export interface StoredFeedback {
  readonly clientId: string;
  readonly type: FeedbackType;
  readonly text: string;
  readonly createdAt: string;
}

/** The family changing whether the team may read its notes, from the privacy screen (D-025). */
export interface NotesConsentChange {
  readonly clientId: string;
  readonly notesAuthorized: boolean;
  /**
   * When the caregiver flipped the switch, from the device's clock clamped to the receipt time. The
   * newest change wins by this time, not by arrival order.
   */
  readonly at: string;
  /** Version of the text shown on the privacy screen when the change was made. */
  readonly version: string;
  /** The caregiver whose signed token sent the change. */
  readonly changedBy: string;
}

export interface FamilyStore {
  getContext(familyId: string): Promise<FamilyContext | null>;
  getWeeks(programId: string, weeks: readonly number[]): Promise<WeekContent[]>;
  putLogEntry(familyId: string, entry: LogEntry, receivedAt: Date): Promise<void>;
  putAccess(familyId: string, access: ResourceAccess, msisdn: string): Promise<void>;
  putFeedback(familyId: string, programId: string, feedback: Feedback): Promise<void>;
  listFeedback(familyId: string): Promise<Feedback[]>;
  listLogEntries(familyId: string): Promise<LogEntry[]>;
  putNotesConsent(familyId: string, change: NotesConsentChange): Promise<void>;
}
