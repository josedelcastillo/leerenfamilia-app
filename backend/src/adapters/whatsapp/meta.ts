import type { Msisdn } from '../../domain/msisdn.ts';
import {
  WhatsAppSendError,
  type SendResult,
  type TemplateMessage,
  type TextMessage,
  type WhatsAppProvider,
} from './provider.ts';

/**
 * Pinned rather than floating, so Meta shipping a new version cannot change our payload shape
 * overnight. Overridable through `WA_GRAPH_VERSION`.
 *
 * TODO: confirm against Meta's changelog before go-live. The WABA does not exist yet and the pilot
 * starts in September 2026, so whatever is current today may well have been superseded by then.
 */
export const DEFAULT_GRAPH_VERSION = 'v21.0';

/** Graph API is not in the request path of a family, but it is in the webhook's 5-second budget. */
const DEFAULT_TIMEOUT_MS = 8000;

export interface MetaCloudConfig {
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly graphVersion?: string;
  readonly timeoutMs?: number;
}

interface GraphResponse {
  readonly messages?: ReadonlyArray<{ readonly id?: string }>;
}

export class MetaCloudProvider implements WhatsAppProvider {
  readonly name = 'meta' as const;

  readonly #config: MetaCloudConfig;
  readonly #fetch: typeof fetch;

  constructor(config: MetaCloudConfig, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  async sendTemplate(message: TemplateMessage): Promise<SendResult> {
    const components: unknown[] = [];
    if (message.bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: message.bodyParams.map((text) => ({ type: 'text', text })),
      });
    }
    if (message.buttonUrlParam !== undefined) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: message.buttonUrlParam }],
      });
    }

    return this.#post(message.to, {
      type: 'template',
      template: {
        name: message.templateName,
        language: { code: message.languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    });
  }

  async sendText(message: TextMessage): Promise<SendResult> {
    return this.#post(message.to, {
      type: 'text',
      // Link previews are noise on a phone with a newborn in the other arm.
      text: { body: message.body, preview_url: false },
    });
  }

  async #post(to: Msisdn, payload: Record<string, unknown>): Promise<SendResult> {
    const version = this.#config.graphVersion ?? DEFAULT_GRAPH_VERSION;
    const url = `https://graph.facebook.com/${version}/${this.#config.phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
        signal: AbortSignal.timeout(this.#config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new WhatsAppSendError(
        `Graph API request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        null,
        '',
      );
    }

    const text = await response.text();
    if (!response.ok) {
      // The body carries Meta's error code and message; it is the only useful diagnostic and the
      // access token is not echoed back in it.
      throw new WhatsAppSendError(`Graph API returned ${response.status}`, response.status, text);
    }

    let wamid: string | undefined;
    try {
      wamid = (JSON.parse(text) as GraphResponse).messages?.[0]?.id;
    } catch {
      throw new WhatsAppSendError('Graph API returned a body that is not JSON', response.status, text);
    }
    if (wamid === undefined) {
      throw new WhatsAppSendError('Graph API accepted the message but returned no id', response.status, text);
    }
    return { wamid, provider: this.name };
  }
}
