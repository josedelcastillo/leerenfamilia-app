import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { IsoDate } from '../domain/dates.ts';
import type { Feedback } from '../domain/feedback.ts';
import type { LogEntry } from '../domain/log-entry.ts';
import type { DeliverySummary, FamilyIndicatorInput } from '../domain/indicators.ts';
import type { AuditRow, ExportBundle } from '../handlers/admin/export.ts';

interface RecipientOutcome {
  status: string;
  wamid?: string;
}

/**
 * Loads everything the export needs in **one paginated Scan**.
 *
 * A Scan is usually the wrong instinct, and here it is the right one. The alternative is roughly
 * fifty family queries plus one per sent message to find its delivery status — around eight hundred
 * reads for a fifty-family cohort. The whole table is a few thousand small items, the export runs a
 * handful of times in the pilot's life, and a single pass is both faster and simpler to reason
 * about. If a future programme makes the table large, this is the first thing to revisit.
 */
export class ExportDataStore {
  readonly #doc: DynamoDBDocumentClient;
  readonly #table: string;

  constructor(table: string, doc?: DynamoDBDocumentClient) {
    this.#table = table;
    this.#doc =
      doc ??
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  async #scan(): Promise<Array<Record<string, unknown>>> {
    const items: Array<Record<string, unknown>> = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const response = await this.#doc.send(
        new ScanCommand({ TableName: this.#table, ExclusiveStartKey: startKey }),
      );
      items.push(...((response.Items ?? []) as Array<Record<string, unknown>>));
      startKey = response.LastEvaluatedKey;
    } while (startKey !== undefined);
    return items;
  }

  async load(cutoff: IsoDate, programWeeks: number): Promise<ExportBundle> {
    const items = await this.#scan();

    const families = new Map<string, Record<string, unknown>>();
    const babies = new Map<string, Record<string, unknown>>();
    const caregivers = new Map<string, Array<Record<string, unknown>>>();
    const logs = new Map<string, LogEntry[]>();
    const feedback = new Map<string, Feedback[]>();
    const deliveries = new Map<string, Array<Record<string, unknown>>>();
    const audit: AuditRow[] = [];

    // wamid -> the status names Meta reported, and what it charged for the message.
    const statuses = new Map<string, Set<string>>();
    const pricing = new Map<string, { category: string | null; billable: boolean | null }>();

    for (const item of items) {
      const entity = String(item['entity'] ?? '');
      const familyId = typeof item['familyId'] === 'string' ? item['familyId'] : null;

      switch (entity) {
        case 'family':
          if (familyId !== null) families.set(familyId, item);
          break;
        case 'baby':
          if (familyId !== null) babies.set(familyId, item);
          break;
        case 'caregiver':
          if (familyId !== null) {
            const list = caregivers.get(familyId) ?? [];
            list.push(item);
            caregivers.set(familyId, list);
          }
          break;
        case 'log_entry':
          if (familyId !== null) {
            const list = logs.get(familyId) ?? [];
            list.push(item as unknown as LogEntry);
            logs.set(familyId, list);
          }
          break;
        case 'feedback':
          if (familyId !== null) {
            const list = feedback.get(familyId) ?? [];
            list.push(item as unknown as Feedback);
            feedback.set(familyId, list);
          }
          break;
        case 'delivery':
          if (familyId !== null) {
            const list = deliveries.get(familyId) ?? [];
            list.push(item);
            deliveries.set(familyId, list);
          }
          break;
        case 'wa_status': {
          const wamid = String(item['wamid']);
          const set = statuses.get(wamid) ?? new Set<string>();
          set.add(String(item['status']));
          statuses.set(wamid, set);
          if (item['pricingCategory'] !== undefined || item['pricingBillable'] !== undefined) {
            pricing.set(wamid, {
              category: typeof item['pricingCategory'] === 'string' ? item['pricingCategory'] : null,
              billable: typeof item['pricingBillable'] === 'boolean' ? item['pricingBillable'] : null,
            });
          }
          break;
        }
        case 'audit':
          audit.push({
            at: String(item['at']),
            gestorSub: String(item['gestorSub']),
            gestorEmail: String(item['gestorEmail'] ?? ''),
            action: String(item['action']),
            familyId,
            ...(typeof item['detail'] === 'string' ? { detail: item['detail'] } : {}),
          });
          break;
        default:
          break;
      }
    }

    const indicatorInputs: FamilyIndicatorInput[] = [];

    for (const [familyId, meta] of families) {
      const familyDeliveries: DeliverySummary[] = (deliveries.get(familyId) ?? []).map((item) => {
        const recipients = (item['recipients'] ?? {}) as Record<string, RecipientOutcome>;
        const outcomes = Object.values(recipients);
        const wamids = outcomes.map((o) => o.wamid).filter((w): w is string => typeof w === 'string');

        const categories: Record<string, number> = {};
        let billable = 0;
        for (const wamid of wamids) {
          const price = pricing.get(wamid);
          if (price?.category != null) {
            categories[price.category] = (categories[price.category] ?? 0) + 1;
          }
          if (price?.billable === true) billable += 1;
        }

        return {
          isoWeek: String(item['isoWeek']),
          week: Number(item['week']),
          sent: outcomes.filter((o) => o.status === 'enviado').length,
          delivered: wamids.filter((w) => statuses.get(w)?.has('delivered') === true).length,
          read: wamids.filter((w) => statuses.get(w)?.has('read') === true).length,
          failed: outcomes.filter((o) => o.status === 'fallido').length,
          billable,
          categories,
        };
      });

      indicatorInputs.push({
        familyId,
        clinic: String(meta['clinic'] ?? ''),
        status: (meta['status'] as FamilyIndicatorInput['status']) ?? 'activa',
        anchorDate: String(meta['anchorDate']) as IsoDate,
        enrolledAt: String(meta['enrolledAt'] ?? ''),
        caregivers: (caregivers.get(familyId) ?? []).map((item) => ({
          role: item['role'] === 'secundario' ? 'secundario' : 'principal',
          optIn: item['optIn'] === true,
          optOutAt: typeof item['optOutAt'] === 'string' ? item['optOutAt'] : null,
          lastInboundAt: typeof item['lastInboundAt'] === 'number' ? item['lastInboundAt'] : null,
        })),
        logEntries: logs.get(familyId) ?? [],
        deliveries: familyDeliveries,
        feedback: feedback.get(familyId) ?? [],
      });
    }

    indicatorInputs.sort((a, b) => a.familyId.localeCompare(b.familyId));

    return {
      cutoff,
      programWeeks,
      families: indicatorInputs,
      logEntriesByFamily: logs,
      feedbackByFamily: feedback,
      audit,
      notesAuthorized: new Map(
        [...families].map(([id, meta]) => [id, meta['freeTextNotesAuthorized'] === true]),
      ),
    };
  }
}
