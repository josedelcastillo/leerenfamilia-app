import { createFeedback, type Feedback } from '../../domain/feedback.ts';
import { toE164 } from '../../domain/msisdn.ts';
import { isOptOutKeyword } from '../../domain/opt-in.ts';
import type { StatusEvent, WhatsAppEvent } from '../../domain/whatsapp-events.ts';
import type { CaregiverRef } from '../../adapters/dynamo.ts';
import type { WhatsAppProvider } from '../../adapters/whatsapp/index.ts';

/** Meta policy requires confirming an opt-out. The window is open: they just wrote to us. */
const OPT_OUT_CONFIRMATION =
  'Listo, diste de baja tu participación en Nacidos para Leer Perú y no recibirás más mensajes ' +
  'semanales. Si más adelante quieres volver, respóndenos por aquí y te reactivamos.';

export interface WebhookStore {
  claimMessageId(wamid: string, now: Date): Promise<boolean>;
  releaseMessageId(wamid: string): Promise<void>;
  findCaregiverByMsisdn(msisdn: string): Promise<CaregiverRef | null>;
  touchServiceWindow(familyId: string, msisdn: string, atMs: number): Promise<void>;
  optOutCaregiver(familyId: string, msisdn: string, atIso: string): Promise<void>;
  putFeedback(familyId: string, programId: string, feedback: Feedback): Promise<void>;
  putMessageStatus(event: StatusEvent, receivedAt: Date): Promise<void>;
}

export interface ProcessDeps {
  readonly store: WebhookStore;
  readonly provider: WhatsAppProvider;
  readonly now: () => Date;
  readonly newId: () => string;
}

export interface ProcessSummary {
  inbound: number;
  duplicates: number;
  unknownSenders: number;
  optOuts: number;
  feedbackCreated: number;
  statuses: number;
  errors: number;
}

function emptySummary(): ProcessSummary {
  return {
    inbound: 0,
    duplicates: 0,
    unknownSenders: 0,
    optOuts: 0,
    feedbackCreated: 0,
    statuses: 0,
    errors: 0,
  };
}

/**
 * Applies a parsed webhook to storage.
 *
 * Every event is isolated: one failure is counted and logged, and the rest of the batch still gets
 * processed. A webhook carrying one bad status and one real message from a family must not lose
 * the message.
 */
export async function processEvents(
  deps: ProcessDeps,
  events: readonly WhatsAppEvent[],
): Promise<ProcessSummary> {
  const summary = emptySummary();

  for (const event of events) {
    try {
      if (event.kind === 'status') {
        await deps.store.putMessageStatus(event, deps.now());
        summary.statuses += 1;
      } else {
        await processInbound(deps, event, summary);
      }
    } catch (error) {
      summary.errors += 1;
      console.error(
        JSON.stringify({
          event: 'whatsapp.webhook.event_failed',
          kind: event.kind,
          wamid: event.wamid,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return summary;
}

async function processInbound(
  deps: ProcessDeps,
  event: Extract<WhatsAppEvent, { kind: 'inbound' }>,
  summary: ProcessSummary,
): Promise<void> {
  const now = deps.now();

  // Claimed before any work, so two concurrent retries cannot both act on the same message.
  const claimed = await deps.store.claimMessageId(event.wamid, now);
  if (!claimed) {
    summary.duplicates += 1;
    return;
  }

  try {
    summary.inbound += 1;

    // Meta reports the sender as digits with no `+`.
    const msisdn = toE164(`+${event.from}`);
    const caregiver = await deps.store.findCaregiverByMsisdn(msisdn);
    if (caregiver === null) {
      // Nobody we know. There is no family to attach this to and we will not create one from an
      // inbound message, so it is logged and dropped rather than silently invented.
      summary.unknownSenders += 1;
      console.warn(
        JSON.stringify({ event: 'whatsapp.webhook.unknown_sender', wamid: event.wamid }),
      );
      return;
    }

    await deps.store.touchServiceWindow(caregiver.familyId, caregiver.msisdn, event.timestampMs);

    if (event.text !== null && isOptOutKeyword(event.text)) {
      await deps.store.optOutCaregiver(caregiver.familyId, caregiver.msisdn, now.toISOString());
      summary.optOuts += 1;
      // Free text: the inbound message just reopened the 24h window, so this costs nothing.
      await deps.provider.sendText({ to: msisdn, body: OPT_OUT_CONFIRMATION });
      return;
    }

    // Everything else becomes a consulta in the manager's inbox — the same inbox the PWA feeds.
    // One inbox, two ways in.
    await deps.store.putFeedback(
      caregiver.familyId,
      caregiver.programId,
      createFeedback({
        id: deps.newId(),
        type: 'consulta',
        channel: 'whatsapp',
        text: event.text ?? `[${event.messageType}] mensaje sin texto`,
        createdAt: new Date(event.timestampMs).toISOString(),
      }),
    );
    summary.feedbackCreated += 1;
  } catch (error) {
    // Hand the claim back so Meta's retry is processed rather than skipped as a duplicate.
    await deps.store.releaseMessageId(event.wamid).catch(() => undefined);
    throw error;
  }
}
