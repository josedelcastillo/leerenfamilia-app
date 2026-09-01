import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { IsoDate } from '../domain/dates.ts';
import type { Feedback } from '../domain/feedback.ts';
import type { LogEntry } from '../domain/log-entry.ts';
import type { AdminStore, AuditEntry, FamilyRecord, ProgramSummary } from '../handlers/admin/ports.ts';
import { GSI1, KEY, SK, TTL_DAYS, ttlSeconds } from './keys.ts';

export class AdminDataStore implements AdminStore {
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

  async #queryAll(
    params: { pk: string; index?: string; pkAttribute?: string },
  ): Promise<Array<Record<string, unknown>>> {
    const items: Array<Record<string, unknown>> = [];
    let startKey: Record<string, unknown> | undefined;
    const attribute = params.pkAttribute ?? 'PK';
    do {
      const response = await this.#doc.send(
        new QueryCommand({
          TableName: this.#table,
          ...(params.index === undefined ? {} : { IndexName: params.index }),
          KeyConditionExpression: `${attribute} = :pk`,
          ExpressionAttributeValues: { ':pk': params.pk },
          ExclusiveStartKey: startKey,
        }),
      );
      items.push(...((response.Items ?? []) as Array<Record<string, unknown>>));
      startKey = response.LastEvaluatedKey;
    } while (startKey !== undefined);
    return items;
  }

  async listActivePrograms(): Promise<ProgramSummary[]> {
    const items = await this.#queryAll({ pk: GSI1.activePrograms, index: 'GSI1', pkAttribute: 'GSI1PK' });
    return items.map((item) => ({
      programId: String(item['programId']),
      programWeeks: typeof item['programWeeks'] === 'number' ? item['programWeeks'] : 8,
      templateName: String(item['templateName'] ?? 'nplp_semana'),
      languageCode: String(item['languageCode'] ?? 'es'),
      replyTemplateName: String(item['replyTemplateName'] ?? 'nplp_respuesta'),
    }));
  }

  #toRecord(familyId: string, items: Array<Record<string, unknown>>): FamilyRecord | null {
    const meta = items.find((item) => item['SK'] === SK.meta);
    if (meta === undefined) {
      return null;
    }
    const baby = items.find((item) => item['SK'] === SK.baby);

    const caregivers: Array<FamilyRecord['caregivers'][number]> = [];
    const logEntries: LogEntry[] = [];
    const feedback: Feedback[] = [];
    const deliveredIsoWeeks: string[] = [];
    let lastAccessAt: string | null = null;

    for (const item of items) {
      const sk = String(item['SK']);
      if (sk.startsWith('CAREGIVER#')) {
        caregivers.push({
          msisdn: String(item['msisdn']),
          role: item['role'] === 'secundario' ? 'secundario' : 'principal',
          optIn: item['optIn'] === true,
          lastInboundAt: typeof item['lastInboundAt'] === 'number' ? item['lastInboundAt'] : null,
        });
      } else if (sk.startsWith('LOG#')) {
        logEntries.push(item as unknown as LogEntry);
      } else if (sk.startsWith('FEEDBACK#')) {
        feedback.push(item as unknown as Feedback);
      } else if (sk.startsWith('DELIVERY#')) {
        deliveredIsoWeeks.push(sk.slice('DELIVERY#'.length));
      } else if (sk.startsWith('ACCESS#')) {
        const at = String(item['at']);
        if (lastAccessAt === null || at > lastAccessAt) lastAccessAt = at;
      }
    }

    return {
      familyId,
      programId: String(meta['programId']),
      status: (meta['status'] as FamilyRecord['status']) ?? 'activa',
      anchorDate: String(meta['anchorDate']) as IsoDate,
      babyName: String(baby?.['name'] ?? ''),
      freeTextNotesAuthorized: meta['freeTextNotesAuthorized'] === true,
      caregivers,
      logEntries,
      feedback,
      deliveredIsoWeeks,
      lastAccessAt,
    };
  }

  async getFamily(familyId: string): Promise<FamilyRecord | null> {
    return this.#toRecord(familyId, await this.#queryAll({ pk: KEY.family(familyId) }));
  }

  /**
   * One Query per family, run in parallel. At 50 families this is a few hundred milliseconds and
   * needs no counters kept up to date — which would be a second source of truth to get wrong.
   */
  async listFamilies(programId: string): Promise<FamilyRecord[]> {
    const ids = new Set<string>();
    for (const status of ['activa', 'baja']) {
      const rows = await this.#queryAll({
        pk: GSI1.familiesByStatus(programId, status),
        index: 'GSI1',
        pkAttribute: 'GSI1PK',
      });
      for (const row of rows) ids.add(String(row['familyId']));
    }

    const records = await Promise.all([...ids].map((id) => this.getFamily(id)));
    return records.filter((record): record is FamilyRecord => record !== null);
  }

  async saveFeedback(familyId: string, programId: string, feedback: Feedback): Promise<void> {
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.family(familyId),
          SK: SK.feedback(feedback.createdAt, feedback.id),
          GSI1PK: GSI1.feedbackByStatus(programId, feedback.status),
          GSI1SK: GSI1.feedbackSort(feedback.createdAt, familyId),
          entity: 'feedback',
          familyId,
          programId,
          ...feedback,
        },
      }),
    );
  }

  async claimReplyNotification(feedbackId: string, replyIndex: number, at: Date): Promise<boolean> {
    try {
      await this.#doc.send(
        new PutCommand({
          TableName: this.#table,
          Item: {
            PK: `NOTIF#${feedbackId}`,
            SK: `REPLY#${String(replyIndex).padStart(3, '0')}`,
            entity: 'reply_notification',
            feedbackId,
            replyIndex,
            claimedAt: at.toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Retention is 12 months, enforced by TTL rather than by anyone remembering to prune. This is the
   * counterpart of giving a manager access to data about minors (encargo §8).
   */
  async writeAudit(entry: AuditEntry): Promise<void> {
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.auditMonth(entry.at.slice(0, 7)),
          SK: `${entry.at}#${entry.gestorSub}`,
          entity: 'audit',
          ...entry,
          ttl: ttlSeconds(new Date(entry.at), TTL_DAYS.audit),
        },
      }),
    );
  }
}
