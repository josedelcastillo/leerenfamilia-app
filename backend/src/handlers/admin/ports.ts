import type { IsoDate } from '../../domain/dates.ts';
import type { Feedback, FeedbackStatus } from '../../domain/feedback.ts';
import type { LogEntry } from '../../domain/log-entry.ts';

export interface ProgramSummary {
  readonly programId: string;
  readonly programWeeks: number;
  readonly templateName: string;
  readonly languageCode: string;
  readonly replyTemplateName: string;
}

export interface FamilyRecord {
  readonly familyId: string;
  readonly programId: string;
  readonly status: 'activa' | 'baja' | 'suprimida';
  readonly anchorDate: IsoDate;
  readonly babyName: string;
  /** Consent flag. Free-text notes are filtered out on read when this is false. */
  readonly freeTextNotesAuthorized: boolean;
  readonly caregivers: ReadonlyArray<{
    readonly msisdn: string;
    readonly role: 'principal' | 'secundario';
    readonly optIn: boolean;
    readonly lastInboundAt: number | null;
  }>;
  readonly logEntries: readonly LogEntry[];
  readonly feedback: readonly Feedback[];
  readonly deliveredIsoWeeks: readonly string[];
  readonly lastAccessAt: string | null;
}

export interface AuditEntry {
  readonly gestorSub: string;
  readonly gestorEmail: string;
  readonly action: 'ver_detalle_familia' | 'exportar_datos' | 'responder_feedback';
  readonly familyId: string | null;
  readonly at: string;
  readonly detail?: string;
}

export interface AdminStore {
  listActivePrograms(): Promise<ProgramSummary[]>;
  listFamilies(programId: string): Promise<FamilyRecord[]>;
  getFamily(familyId: string): Promise<FamilyRecord | null>;
  saveFeedback(familyId: string, programId: string, feedback: Feedback): Promise<void>;
  /** Conditional write. False means this reply was already notified. */
  claimReplyNotification(feedbackId: string, replyIndex: number, at: Date): Promise<boolean>;
  writeAudit(entry: AuditEntry): Promise<void>;
}

export interface Gestor {
  readonly sub: string;
  readonly email: string;
  readonly groups: readonly string[];
}

export type InboxFilter = FeedbackStatus | 'todos';
