import type { IsoDate } from '../../domain/dates.ts';
import { isoWeek } from '../../domain/dates.ts';
import { decideWeeklySend, type FamilyStatus, type SkipReason } from '../../domain/eligibility.ts';
import type { Caregiver } from '../../domain/opt-in.ts';
import type { Msisdn } from '../../domain/msisdn.ts';
import type { WeekContent } from '../../content/weeks.ts';
import { WhatsAppSendError, type WhatsAppProvider } from '../../adapters/whatsapp/index.ts';
import { issueFamilyToken } from '../../shared/family-token.ts';

export interface ProgramRef {
  readonly programId: string;
  readonly programWeeks: number;
  readonly templateName: string;
  readonly languageCode: string;
}

export interface FamilyAggregate {
  readonly familyId: string;
  readonly programId: string;
  readonly status: FamilyStatus;
  readonly anchorDate: IsoDate;
  readonly babyName: string;
  readonly caregivers: readonly Caregiver[];
  readonly deliveredIsoWeeks: readonly string[];
}

/**
 * `pendiente` means we claimed the send and do not know whether Meta received it — a crash or a
 * network timeout in between. It is never retried automatically: retrying might charge twice, and
 * that is the one thing the idempotency requirement forbids. It surfaces for a human instead.
 */
export type RecipientStatus = 'pendiente' | 'enviado' | 'fallido';

export interface RecipientOutcome {
  readonly status: RecipientStatus;
  readonly at: string;
  readonly wamid?: string;
  readonly error?: string;
}

export interface DeliveryRecord {
  readonly familyId: string;
  readonly isoWeek: string;
  readonly week: number;
  readonly recipients: Readonly<Record<string, RecipientOutcome>>;
}

export interface WeeklySendStore {
  listActivePrograms(): Promise<ProgramRef[]>;
  listFamilyIds(programId: string, status: string): Promise<string[]>;
  loadFamily(familyId: string): Promise<FamilyAggregate | null>;
  getContent(programId: string, week: number): Promise<WeekContent | null>;
  claimDelivery(input: {
    familyId: string;
    isoWeek: string;
    week: number;
    recipients: readonly string[];
    at: Date;
  }): Promise<'claimed' | 'exists'>;
  getDelivery(familyId: string, isoWeek: string): Promise<DeliveryRecord | null>;
  recordRecipientOutcome(
    familyId: string,
    isoWeek: string,
    msisdn: string,
    outcome: RecipientOutcome,
  ): Promise<void>;
  linkWamid(input: {
    wamid: string;
    familyId: string;
    isoWeek: string;
    msisdn: string;
    at: Date;
  }): Promise<void>;
}

export interface WeeklySendDeps {
  readonly store: WeeklySendStore;
  readonly provider: WhatsAppProvider;
  readonly tokenSecret: string;
  readonly now: () => Date;
  /** Calendar date in the pilot's timezone. Passed in so the domain never reads a clock. */
  readonly today: () => IsoDate;
}

export interface FamilyOutcome {
  readonly familyId: string;
  readonly week: number | null;
  readonly result: 'enviado' | 'omitido' | 'ya_enviado' | 'requiere_revision' | 'error';
  readonly reason?: SkipReason | string;
  readonly sent: number;
  readonly failed: number;
}

/**
 * The weekly report the operating model (§5.4) requires: not just how many messages went out, but
 * how many families got nothing and why.
 */
export interface RunReport {
  readonly today: string;
  readonly isoWeek: string;
  readonly provider: string;
  readonly families: number;
  readonly messagesSent: number;
  readonly messagesFailed: number;
  readonly skipped: Readonly<Record<string, number>>;
  readonly needsReview: readonly string[];
  readonly outcomes: readonly FamilyOutcome[];
}

export async function runWeeklySend(deps: WeeklySendDeps): Promise<RunReport> {
  const today = deps.today();
  const currentIsoWeek = isoWeek(today);
  const outcomes: FamilyOutcome[] = [];
  const skipped: Record<string, number> = {};
  const needsReview: string[] = [];
  let messagesSent = 0;
  let messagesFailed = 0;
  let families = 0;

  for (const program of await deps.store.listActivePrograms()) {
    for (const familyId of await deps.store.listFamilyIds(program.programId, 'activa')) {
      families += 1;
      try {
        const outcome = await sendToFamily(deps, program, familyId, today, currentIsoWeek);
        outcomes.push(outcome);
        messagesSent += outcome.sent;
        messagesFailed += outcome.failed;
        if (outcome.result === 'omitido' || outcome.result === 'ya_enviado') {
          const key = outcome.reason ?? outcome.result;
          skipped[key] = (skipped[key] ?? 0) + 1;
        }
        if (outcome.result === 'requiere_revision') {
          needsReview.push(familyId);
        }
      } catch (error) {
        // One family's failure never stops the run: forty-nine other families are waiting.
        const message = error instanceof Error ? error.message : String(error);
        outcomes.push({ familyId, week: null, result: 'error', reason: message, sent: 0, failed: 0 });
        console.error(
          JSON.stringify({ event: 'weekly_send.family_failed', familyId, error: message }),
        );
      }
    }
  }

  return {
    today,
    isoWeek: currentIsoWeek,
    provider: deps.provider.name,
    families,
    messagesSent,
    messagesFailed,
    skipped,
    needsReview,
    outcomes,
  };
}

async function sendToFamily(
  deps: WeeklySendDeps,
  program: ProgramRef,
  familyId: string,
  today: IsoDate,
  currentIsoWeek: string,
): Promise<FamilyOutcome> {
  const family = await deps.store.loadFamily(familyId);
  if (family === null) {
    return { familyId, week: null, result: 'omitido', reason: 'familia_inactiva', sent: 0, failed: 0 };
  }

  const decision = decideWeeklySend(
    {
      familyId,
      status: family.status,
      anchorDate: family.anchorDate,
      caregivers: family.caregivers,
      deliveredIsoWeeks: family.deliveredIsoWeeks,
    },
    today,
    program.programWeeks,
  );

  if (!decision.send) {
    return { familyId, week: null, result: 'omitido', reason: decision.reason, sent: 0, failed: 0 };
  }

  // Claimed before a single message goes out. A retry that finds the claim will not send again.
  const claim = await deps.store.claimDelivery({
    familyId,
    isoWeek: currentIsoWeek,
    week: decision.week,
    recipients: decision.recipients,
    at: deps.now(),
  });

  let targets: readonly Msisdn[] = decision.recipients;

  if (claim === 'exists') {
    const existing = await deps.store.getDelivery(familyId, currentIsoWeek);
    const retryable = decision.recipients.filter(
      (msisdn) => existing?.recipients[msisdn]?.status === 'fallido',
    );
    const ambiguous = decision.recipients.filter(
      (msisdn) => existing?.recipients[msisdn]?.status === 'pendiente',
    );

    if (retryable.length === 0) {
      // `pendiente` is never retried automatically: we cannot tell whether Meta charged us.
      return ambiguous.length > 0
        ? { familyId, week: decision.week, result: 'requiere_revision', reason: 'envio_en_estado_pendiente', sent: 0, failed: 0 }
        : { familyId, week: decision.week, result: 'ya_enviado', reason: 'ya_enviado_esta_semana', sent: 0, failed: 0 };
    }
    targets = retryable;
  }

  const content = await deps.store.getContent(program.programId, decision.week);
  const activityTitle = content?.title ?? `Semana ${decision.week}`;

  let sent = 0;
  let failed = 0;

  for (const msisdn of targets) {
    const at = deps.now();
    // Reissued every week, so an active family never reaches the 90-day expiry.
    const token = issueFamilyToken(familyId, msisdn, at, deps.tokenSecret);

    try {
      const result = await deps.provider.sendTemplate({
        to: msisdn,
        templateName: program.templateName,
        languageCode: program.languageCode,
        bodyParams: [family.babyName, String(decision.week), activityTitle],
        buttonUrlParam: token,
      });
      await deps.store.recordRecipientOutcome(familyId, currentIsoWeek, msisdn, {
        status: 'enviado',
        at: at.toISOString(),
        wamid: result.wamid,
      });
      await deps.store.linkWamid({
        wamid: result.wamid,
        familyId,
        isoWeek: currentIsoWeek,
        msisdn,
        at,
      });
      sent += 1;
    } catch (error) {
      // Meta answering with an error means the message was definitely not accepted, so it is safe
      // to retry. A network failure or timeout is ambiguous and stays `pendiente` for a human.
      const definitelyNotSent = error instanceof WhatsAppSendError && error.status !== null;
      await deps.store.recordRecipientOutcome(familyId, currentIsoWeek, msisdn, {
        status: definitelyNotSent ? 'fallido' : 'pendiente',
        at: at.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      failed += 1;
    }
  }

  return {
    familyId,
    week: decision.week,
    result: sent > 0 ? 'enviado' : 'error',
    sent,
    failed,
  };
}
