import { ParameterStore, WA_PARAMETERS } from '../ssm.ts';
import { MetaCloudProvider } from './meta.ts';
import { MockProvider, type MockDeliverySink } from './mock.ts';
import type { WhatsAppProvider } from './provider.ts';

export * from './provider.ts';
export { MetaCloudProvider } from './meta.ts';
export { MockProvider, type MockDelivery, type MockDeliverySink } from './mock.ts';

/**
 * Chooses the implementation from `WA_PROVIDER`. Anything other than an explicit `meta` selects the
 * mock: a misconfigured variable should fail towards sending nothing, never towards sending real
 * messages to real families with an unverified setup.
 */
export async function createWhatsAppProvider(options: {
  providerName: string;
  parameters: ParameterStore;
  sink: MockDeliverySink;
  graphVersion?: string;
}): Promise<WhatsAppProvider> {
  if (options.providerName !== 'meta') {
    return new MockProvider(options.sink);
  }
  const secrets = await options.parameters.get(WA_PARAMETERS);
  return new MetaCloudProvider({
    phoneNumberId: secrets.WA_PHONE_NUMBER_ID,
    accessToken: secrets.WA_ACCESS_TOKEN,
    ...(options.graphVersion !== undefined ? { graphVersion: options.graphVersion } : {}),
  });
}
