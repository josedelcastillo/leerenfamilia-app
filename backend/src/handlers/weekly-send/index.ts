import { SchedulerStore } from '../../adapters/scheduler-store.ts';
import { ParameterStore } from '../../adapters/ssm.ts';
import { createWhatsAppProvider } from '../../adapters/whatsapp/index.ts';
import { optionalEnv, requireEnv } from '../../shared/env.ts';
import { limaDate } from '../../shared/lima-date.ts';
import { Store } from '../../adapters/dynamo.ts';
import { runWeeklySend, type RunReport } from './run.ts';

const parameters = new ParameterStore({ prefix: requireEnv('SSM_PREFIX') });
const table = requireEnv('TABLE_NAME');
const store = new SchedulerStore(table);
const mockSink = new Store(table);

export async function handler(): Promise<RunReport> {
  const provider = await createWhatsAppProvider({
    providerName: optionalEnv('WA_PROVIDER', 'mock'),
    parameters,
    sink: mockSink,
    ...(process.env['WA_GRAPH_VERSION'] !== undefined
      ? { graphVersion: process.env['WA_GRAPH_VERSION'] }
      : {}),
  });

  const secrets = await parameters.get(['APP_TOKEN_SECRET']);

  const report = await runWeeklySend({
    store,
    provider,
    tokenSecret: secrets.APP_TOKEN_SECRET,
    now: () => new Date(),
    today: () => limaDate(new Date()),
  });

  // The weekly implementation report the operating model asks for, as one structured log line.
  console.log(JSON.stringify({ event: 'weekly_send.report', ...report, outcomes: undefined }));
  if (report.needsReview.length > 0) {
    console.warn(
      JSON.stringify({ event: 'weekly_send.needs_review', families: report.needsReview }),
    );
  }
  return report;
}
