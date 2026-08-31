import { randomUUID } from 'node:crypto';
import type {
  SendResult,
  TemplateMessage,
  TextMessage,
  WhatsAppProvider,
} from './provider.ts';

export interface MockDelivery {
  readonly wamid: string;
  readonly to: string;
  readonly kind: 'template' | 'text';
  readonly payload: unknown;
  readonly sentAt: string;
}

/** Where mock sends are persisted so a manager can inspect them without a WABA. */
export interface MockDeliverySink {
  record(delivery: MockDelivery): Promise<void>;
}

/**
 * Sends nothing. Writes the exact payload it *would* have sent to CloudWatch and to the audit
 * table, so the weekly send, the feedback reply and the whole family journey are demonstrable
 * before a WhatsApp Business Account exists — and at no cost.
 *
 * The fake message id is prefixed `wamid.MOCK-` so a mock delivery can never be mistaken for a
 * real one in the data, in an export, or in the pilot's final report.
 */
export class MockProvider implements WhatsAppProvider {
  readonly name = 'mock' as const;

  readonly #sink: MockDeliverySink;
  readonly #now: () => Date;

  constructor(sink: MockDeliverySink, now: () => Date = () => new Date()) {
    this.#sink = sink;
    this.#now = now;
  }

  async sendTemplate(message: TemplateMessage): Promise<SendResult> {
    return this.#record('template', message.to, message);
  }

  async sendText(message: TextMessage): Promise<SendResult> {
    return this.#record('text', message.to, message);
  }

  async #record(kind: 'template' | 'text', to: string, payload: unknown): Promise<SendResult> {
    const wamid = `wamid.MOCK-${randomUUID()}`;
    const delivery: MockDelivery = {
      wamid,
      to,
      kind,
      payload,
      sentAt: this.#now().toISOString(),
    };
    console.log(JSON.stringify({ event: 'whatsapp.mock.send', ...delivery }));
    await this.#sink.record(delivery);
    return { wamid, provider: this.name };
  }
}
