/**
 * Turns a Meta webhook body into typed events.
 *
 * Deliberately forgiving: Meta adds fields and message types without warning, and a parser that
 * throws on something unfamiliar would turn a new emoji reaction type into a webhook that retries
 * forever. Anything unrecognised is counted and dropped, never fatal.
 */

export interface MessagePricing {
  /** `utility`, `marketing`, `service`, `authentication`… Meta's own vocabulary, kept verbatim. */
  readonly category: string | null;
  readonly billable: boolean | null;
  readonly pricingModel: string | null;
}

export interface InboundMessageEvent {
  readonly kind: 'inbound';
  readonly wamid: string;
  /** Sender's number as Meta reports it: digits only, no `+`. */
  readonly from: string;
  readonly timestampMs: number;
  readonly messageType: string;
  /** Present for text, quick-reply buttons and interactive replies; null for media and the rest. */
  readonly text: string | null;
}

export interface StatusEvent {
  readonly kind: 'status';
  readonly wamid: string;
  readonly status: string;
  readonly timestampMs: number;
  readonly recipientId: string;
  /**
   * The only way to reconcile against Meta's invoice, and the only way to find out whether a
   * template is being charged as utility or as marketing. Persisted verbatim.
   */
  readonly pricing: MessagePricing | null;
  readonly conversationId: string | null;
}

export type WhatsAppEvent = InboundMessageEvent | StatusEvent;

export interface ParsedWebhook {
  readonly events: readonly WhatsAppEvent[];
  /** Entries recognised as messages or statuses but not parseable into an event. */
  readonly ignored: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Meta sends epoch seconds, as a string. */
function toMillis(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : Number(asString(value));
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 1000) : null;
}

function extractText(message: Record<string, unknown>, type: string): string | null {
  if (type === 'text' && isRecord(message['text'])) {
    return asString(message['text']['body']);
  }
  // Quick-reply buttons on a template arrive as type `button`.
  if (type === 'button' && isRecord(message['button'])) {
    return asString(message['button']['text']) ?? asString(message['button']['payload']);
  }
  if (type === 'interactive' && isRecord(message['interactive'])) {
    const interactive = message['interactive'];
    for (const key of ['button_reply', 'list_reply']) {
      if (isRecord(interactive[key])) {
        return asString(interactive[key]['title']) ?? asString(interactive[key]['id']);
      }
    }
  }
  return null;
}

function parsePricing(status: Record<string, unknown>): MessagePricing | null {
  const pricing = status['pricing'];
  if (!isRecord(pricing)) {
    return null;
  }
  return {
    category: asString(pricing['category']),
    billable: typeof pricing['billable'] === 'boolean' ? pricing['billable'] : null,
    pricingModel: asString(pricing['pricing_model']),
  };
}

export function parseWebhookPayload(body: unknown): ParsedWebhook {
  const events: WhatsAppEvent[] = [];
  let ignored = 0;

  if (!isRecord(body)) {
    return { events, ignored };
  }

  for (const entry of asArray(body['entry'])) {
    if (!isRecord(entry)) continue;

    for (const change of asArray(entry['changes'])) {
      if (!isRecord(change) || !isRecord(change['value'])) continue;
      const value = change['value'];

      for (const raw of asArray(value['messages'])) {
        if (!isRecord(raw)) {
          ignored += 1;
          continue;
        }
        const wamid = asString(raw['id']);
        const from = asString(raw['from']);
        const timestampMs = toMillis(raw['timestamp']);
        if (wamid === null || from === null || timestampMs === null) {
          ignored += 1;
          continue;
        }
        const messageType = asString(raw['type']) ?? 'unknown';
        events.push({
          kind: 'inbound',
          wamid,
          from,
          timestampMs,
          messageType,
          text: extractText(raw, messageType),
        });
      }

      for (const raw of asArray(value['statuses'])) {
        if (!isRecord(raw)) {
          ignored += 1;
          continue;
        }
        const wamid = asString(raw['id']);
        const status = asString(raw['status']);
        const timestampMs = toMillis(raw['timestamp']);
        if (wamid === null || status === null || timestampMs === null) {
          ignored += 1;
          continue;
        }
        const conversation = raw['conversation'];
        events.push({
          kind: 'status',
          wamid,
          status,
          timestampMs,
          recipientId: asString(raw['recipient_id']) ?? '',
          pricing: parsePricing(raw),
          conversationId: isRecord(conversation) ? asString(conversation['id']) : null,
        });
      }
    }
  }

  return { events, ignored };
}
