import type { IsoDate } from '../../domain/dates.ts';
import { addReply, closeFeedback, isAwaitingReply, type Feedback } from '../../domain/feedback.ts';
import { DomainError } from '../../domain/errors.ts';
import { summarize, type LogEntry, type LogSummary } from '../../domain/log-entry.ts';
import { programWeek } from '../../domain/schedule.ts';
import { chooseReplyChannel, type ReplyChannel } from '../../domain/service-window.ts';
import type { Msisdn } from '../../domain/msisdn.ts';
import type { WhatsAppProvider } from '../../adapters/whatsapp/index.ts';
import type { AdminStore, FamilyRecord, Gestor, InboxFilter, ProgramSummary } from './ports.ts';

export const GESTORES_GROUP = 'gestores';

/**
 * The JWT authorizer proves the token is valid; it does not prove the user belongs in this app.
 * Group membership is checked here, so a user created in the pool for any other reason cannot read
 * family data.
 */
export function assertIsGestor(gestor: Gestor): void {
  if (!gestor.groups.includes(GESTORES_GROUP)) {
    throw new DomainError('forbidden', 'La cuenta no pertenece al grupo de gestores');
  }
}

export interface FamilyRow {
  readonly familyId: string;
  readonly babyName: string;
  readonly status: FamilyRecord['status'];
  readonly programWeek: number;
  readonly finished: boolean;
  readonly logEntriesLast7Days: number;
  readonly minutesLast7Days: number;
  readonly lastActivityAt: string | null;
  readonly openFeedback: number;
  readonly caregiversOptedIn: number;
  readonly deliveries: number;
}

function withinLastDays(entries: readonly LogEntry[], today: IsoDate, days: number): LogEntry[] {
  const cutoff = new Date(`${today}T00:00:00.000Z`).getTime() - (days - 1) * 86_400_000;
  return entries.filter((entry) => new Date(`${entry.date}T00:00:00.000Z`).getTime() >= cutoff);
}

/**
 * The manager's list. Density over decoration: week, recent activity and open feedback are what
 * decide who needs attention this week.
 *
 * Aggregates only — no free text ever reaches this view, so it needs no consent check and no audit
 * entry. Opening one family's detail is the action that gets recorded.
 */
export function buildFamilyRows(
  families: readonly FamilyRecord[],
  program: ProgramSummary,
  today: IsoDate,
): FamilyRow[] {
  return families
    .map((family) => {
      const week = programWeek(family.anchorDate, today);
      const recent = withinLastDays(family.logEntries, today, 7);
      const lastEntry = family.logEntries
        .map((entry) => entry.date as string)
        .sort()
        .at(-1) ?? null;

      return {
        familyId: family.familyId,
        babyName: family.babyName,
        status: family.status,
        programWeek: week,
        finished: week > program.programWeeks,
        logEntriesLast7Days: recent.length,
        minutesLast7Days: recent.reduce((total, entry) => total + entry.minutes, 0),
        lastActivityAt: family.lastAccessAt ?? lastEntry,
        openFeedback: family.feedback.filter(isAwaitingReply).length,
        caregiversOptedIn: family.caregivers.filter((c) => c.optIn).length,
        deliveries: family.deliveredIsoWeeks.length,
      };
    })
    // Families needing attention first: open feedback, then least recent activity.
    .sort((a, b) =>
      b.openFeedback - a.openFeedback ||
      a.logEntriesLast7Days - b.logEntriesLast7Days ||
      a.familyId.localeCompare(b.familyId),
    );
}

export interface FamilyDetail {
  readonly familyId: string;
  readonly babyName: string;
  readonly status: FamilyRecord['status'];
  readonly programWeek: number;
  readonly anchorDate: IsoDate;
  readonly summary: LogSummary;
  readonly summaryLast7Days: LogSummary;
  readonly entries: ReadonlyArray<Omit<LogEntry, 'note'> & { note: string | null }>;
  readonly notesVisible: boolean;
  readonly feedback: readonly Feedback[];
  readonly caregivers: FamilyRecord['caregivers'];
}

/**
 * One family's detail, and the point at which an access record is written: this is where a manager
 * sees data about a specific child, which is the counterpart of giving them that access at all
 * (encargo §8).
 *
 * Free-text notes are stripped unless the family authorised it in the consent. They are filtered
 * here, on read — never dropped on write, because the family owns them either way.
 */
export async function openFamilyDetail(
  store: AdminStore,
  gestor: Gestor,
  familyId: string,
  today: IsoDate,
  now: Date,
): Promise<FamilyDetail> {
  assertIsGestor(gestor);

  const family = await store.getFamily(familyId);
  if (family === null) {
    throw new DomainError('not_found', `No existe la familia ${familyId}`);
  }

  await store.writeAudit({
    gestorSub: gestor.sub,
    gestorEmail: gestor.email,
    action: 'ver_detalle_familia',
    familyId,
    at: now.toISOString(),
  });

  const notesVisible = family.freeTextNotesAuthorized;

  return {
    familyId,
    babyName: family.babyName,
    status: family.status,
    anchorDate: family.anchorDate,
    programWeek: programWeek(family.anchorDate, today),
    summary: summarize(family.logEntries),
    summaryLast7Days: summarize(withinLastDays(family.logEntries, today, 7)),
    entries: family.logEntries.map((entry) => ({
      ...entry,
      note: notesVisible ? entry.note : null,
    })),
    notesVisible,
    feedback: [...family.feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    caregivers: family.caregivers,
  };
}

export interface InboxItem {
  readonly familyId: string;
  readonly babyName: string;
  readonly feedback: Feedback;
}

/**
 * One inbox, two ways in: what arrives through the PWA and what arrives as a WhatsApp message look
 * the same here, because to the manager answering them they are the same job.
 */
export function buildInbox(
  families: readonly FamilyRecord[],
  filter: InboxFilter,
): InboxItem[] {
  const items: InboxItem[] = [];
  for (const family of families) {
    for (const feedback of family.feedback) {
      if (filter === 'todos' || feedback.status === filter) {
        items.push({ familyId: family.familyId, babyName: family.babyName, feedback });
      }
    }
  }
  // Oldest first: the family that has been waiting longest is answered first.
  return items.sort((a, b) => a.feedback.createdAt.localeCompare(b.feedback.createdAt));
}

export interface ReplyOutcome {
  readonly feedback: Feedback;
  readonly channel: ReplyChannel | 'ninguno';
  readonly notified: boolean;
  readonly reason?: string;
}

/**
 * A manager answers a family.
 *
 * The reply is stored first and the notification is best-effort: a WhatsApp outage must not lose
 * the answer a manager just wrote. The family sees it in the PWA either way.
 */
export async function replyToFeedback(
  deps: {
    store: AdminStore;
    provider: WhatsAppProvider;
    now: () => Date;
  },
  gestor: Gestor,
  input: { familyId: string; feedbackId: string; text: string; replyTemplateName: string; languageCode: string },
): Promise<ReplyOutcome> {
  assertIsGestor(gestor);

  const text = input.text?.trim() ?? '';
  if (text === '') {
    throw new DomainError('invalid_feedback', 'La respuesta no puede estar vacía');
  }

  const family = await deps.store.getFamily(input.familyId);
  if (family === null) {
    throw new DomainError('not_found', `No existe la familia ${input.familyId}`);
  }
  const existing = family.feedback.find((item) => item.id === input.feedbackId);
  if (existing === undefined) {
    throw new DomainError('not_found', `No existe el feedback ${input.feedbackId}`);
  }

  const at = deps.now();
  // Append-only: a correction adds another reply, it never edits the one already sent.
  const updated = addReply(existing, { text, gestorSub: gestor.sub, at: at.toISOString() });
  await deps.store.saveFeedback(input.familyId, family.programId, updated);

  await deps.store.writeAudit({
    gestorSub: gestor.sub,
    gestorEmail: gestor.email,
    action: 'responder_feedback',
    familyId: input.familyId,
    at: at.toISOString(),
    detail: input.feedbackId,
  });

  const replyIndex = updated.replies.length - 1;
  // Keyed on the reply, not on the feedback: a correction is a second reply and the family has to
  // hear about it. Keying on feedback id alone would silence every correction.
  const first = await deps.store.claimReplyNotification(input.feedbackId, replyIndex, at);
  if (!first) {
    return { feedback: updated, channel: 'ninguno', notified: false, reason: 'ya_notificado' };
  }

  const recipient = family.caregivers.find((c) => c.optIn);
  if (recipient === undefined) {
    return { feedback: updated, channel: 'ninguno', notified: false, reason: 'sin_cuidadores_con_opt_in' };
  }

  const channel = chooseReplyChannel(recipient.lastInboundAt, at.getTime());

  try {
    if (channel === 'mensaje_libre') {
      // The window is open: free, and needs no template approval.
      await deps.provider.sendText({ to: recipient.msisdn as Msisdn, body: text });
    } else {
      await deps.provider.sendTemplate({
        to: recipient.msisdn as Msisdn,
        templateName: input.replyTemplateName,
        languageCode: input.languageCode,
        bodyParams: [family.babyName, text.slice(0, 300)],
      });
    }
    return { feedback: updated, channel, notified: true };
  } catch (error) {
    // The reply is saved. Losing the notification is recoverable; losing the answer is not.
    return {
      feedback: updated,
      channel,
      notified: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeFeedbackAs(
  store: AdminStore,
  gestor: Gestor,
  input: { familyId: string; feedbackId: string },
  now: Date,
): Promise<Feedback> {
  assertIsGestor(gestor);
  const family = await store.getFamily(input.familyId);
  const existing = family?.feedback.find((item) => item.id === input.feedbackId);
  if (family === null || existing === undefined) {
    throw new DomainError('not_found', 'No existe ese feedback');
  }
  const closed = closeFeedback(existing, now.toISOString(), gestor.sub);
  await store.saveFeedback(input.familyId, family.programId, closed);
  return closed;
}
