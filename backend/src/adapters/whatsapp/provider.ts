import type { Msisdn } from '../../domain/msisdn.ts';

export interface TemplateMessage {
  readonly to: Msisdn;
  readonly templateName: string;
  /** e.g. `es_PE`, falling back to `es` if Meta has not approved the regional variant. */
  readonly languageCode: string;
  /** Positional body parameters, in template order. */
  readonly bodyParams: readonly string[];
  /** Fills the dynamic suffix of a URL button, when the template declares one. */
  readonly buttonUrlParam?: string;
}

export interface TextMessage {
  readonly to: Msisdn;
  readonly body: string;
}

export interface SendResult {
  /** Meta's message id, or a clearly-marked fake one under the mock provider. */
  readonly wamid: string;
  readonly provider: ProviderName;
}

export type ProviderName = 'meta' | 'mock';

/**
 * The whole WhatsApp surface the application needs. Two implementations sit behind it, chosen by
 * `WA_PROVIDER`, so the entire flow is demonstrable with no WABA and no spend.
 */
export interface WhatsAppProvider {
  readonly name: ProviderName;
  /** Outside the 24h service window, or for the weekly send: an approved template. */
  sendTemplate(message: TemplateMessage): Promise<SendResult>;
  /** Inside the service window: free text, cheaper and needing no template approval. */
  sendText(message: TextMessage): Promise<SendResult>;
}

export class WhatsAppSendError extends Error {
  readonly status: number | null;
  readonly responseBody: string;

  constructor(message: string, status: number | null, responseBody: string) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.status = status;
    this.responseBody = responseBody;
  }
}
