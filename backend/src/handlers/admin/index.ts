import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DomainError } from '../../domain/errors.ts';
import { AdminDataStore } from '../../adapters/admin-store.ts';
import { ExportDataStore } from '../../adapters/export-store.ts';
import { Store } from '../../adapters/dynamo.ts';
import { ParameterStore } from '../../adapters/ssm.ts';
import { createWhatsAppProvider } from '../../adapters/whatsapp/index.ts';
import { optionalEnv, requireEnv } from '../../shared/env.ts';
import { json } from '../../shared/http.ts';
import { limaDate } from '../../shared/lima-date.ts';
import {
  buildFamilyRows,
  buildInbox,
  closeFeedbackAs,
  openFamilyDetail,
  replyToFeedback,
} from './logic.ts';
import { buildCsv, isDataset } from './export.ts';
import { gestorFromClaims } from './claims.ts';
import { assertIsGestor } from './logic.ts';
import type { Gestor, InboxFilter } from './ports.ts';

const table = requireEnv('TABLE_NAME');
const parameters = new ParameterStore({ prefix: requireEnv('SSM_PREFIX') });
const store = new AdminDataStore(table);
const mockSink = new Store(table);
const exportStore = new ExportDataStore(table);

/**
 * Claims come from the HTTP API's native Cognito authorizer, which has already validated the
 * signature, issuer and audience. We never parse or trust a token by hand here.
 *
 * The parsing itself lives in `claims.ts` so it can be tested; this module builds AWS clients at
 * load time and cannot be imported from a test.
 */
function gestorFrom(event: APIGatewayProxyEventV2): Gestor {
  const claims =
    (event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } })
      .authorizer?.jwt?.claims ?? {};

  return gestorFromClaims(claims);
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const gestor = gestorFrom(event);
  const now = new Date();
  const today = limaDate(now);
  const method = event.requestContext.http.method;
  // The route is /api/gestor/{proxy+}; everything after that prefix is ours to dispatch.
  const path = event.requestContext.http.path.replace(/^\/api\/gestor\/?/, '').split('/');
  const query = event.queryStringParameters ?? {};

  try {
    // Every route of this API reads family data, so the group check goes here, before anything is
    // read. It used to sit only on the routes that touch free text, which left the family list and
    // the inbox readable by any account in the pool (D-012 says the check is in code; it was in
    // three of the routes).
    assertIsGestor(gestor);

    const programs = await store.listActivePrograms();
    const program = programs[0];
    if (program === undefined) {
      return json(503, { error: 'sin_programa_activo' });
    }

    if (path[0] === 'familias' && method === 'GET' && path[1] === undefined) {
      const families = await store.listFamilies(program.programId);
      return json(200, { familias: buildFamilyRows(families, program, today) });
    }

    if (path[0] === 'familias' && method === 'GET' && path[1] !== undefined) {
      return json(200, await openFamilyDetail(store, gestor, path[1], today, now));
    }

    if (path[0] === 'bandeja' && method === 'GET') {
      const families = await store.listFamilies(program.programId);
      const filter = (query['estado'] ?? 'abierto') as InboxFilter;
      return json(200, { mensajes: buildInbox(families, filter) });
    }

    if (path[0] === 'respuesta' && method === 'POST') {
      const body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
      const provider = await createWhatsAppProvider({
        providerName: optionalEnv('WA_PROVIDER', 'mock'),
        parameters,
        sink: mockSink,
        ...(process.env['WA_GRAPH_VERSION'] !== undefined
          ? { graphVersion: process.env['WA_GRAPH_VERSION'] }
          : {}),
      });

      const outcome = await replyToFeedback(
        { store, provider, now: () => now },
        gestor,
        {
          familyId: String(body['familyId'] ?? ''),
          feedbackId: String(body['feedbackId'] ?? ''),
          text: String(body['text'] ?? ''),
          replyTemplateName: program.replyTemplateName,
          languageCode: program.languageCode,
        },
      );
      return json(200, outcome);
    }

    if (path[0] === 'export' && method === 'GET') {
      const dataset = (path[1] ?? '').replace(/\.csv$/, '');
      if (!isDataset(dataset)) {
        return json(404, { error: 'dataset_desconocido' });
      }
      assertIsGestor(gestor);

      // Exporting is one of the three audited actions (encargo §8): it takes data about minors out
      // of the platform and onto somebody's laptop.
      await store.writeAudit({
        gestorSub: gestor.sub,
        gestorEmail: gestor.email,
        action: 'exportar_datos',
        familyId: null,
        at: now.toISOString(),
        detail: dataset,
      });

      const bundle = await exportStore.load(today, program.programWeeks);
      return {
        statusCode: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="nplp-${dataset}-${today}.csv"`,
          'cache-control': 'no-store',
        },
        body: buildCsv(dataset, bundle),
      };
    }

    if (path[0] === 'cerrar' && method === 'POST') {
      const body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
      const closed = await closeFeedbackAs(store, gestor, {
        familyId: String(body['familyId'] ?? ''),
        feedbackId: String(body['feedbackId'] ?? ''),
      }, now);
      return json(200, { feedback: closed });
    }

    return json(404, { error: 'ruta_no_encontrada' });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 400;
      return json(status, { error: error.code, message: error.message });
    }
    console.error(
      JSON.stringify({
        event: 'admin_api.unhandled',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return json(500, { error: 'error_interno' });
  }
}
