import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { IsoDate } from '../domain/dates.ts';
import type { Caregiver } from '../domain/opt-in.ts';
import type { Msisdn } from '../domain/msisdn.ts';
import type { WeekContent } from '../content/weeks.ts';
import { GSI1, KEY, SK } from './keys.ts';
import type {
  DeliveryRecord,
  FamilyAggregate,
  ProgramRef,
  RecipientOutcome,
  WeeklySendStore,
} from '../handlers/weekly-send/run.ts';

function documentClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export class SchedulerStore implements WeeklySendStore {
  readonly #doc: DynamoDBDocumentClient;
  readonly #table: string;

  constructor(table: string, doc?: DynamoDBDocumentClient) {
    this.#table = table;
    this.#doc = doc ?? documentClient();
  }

  async listActivePrograms(): Promise<ProgramRef[]> {
    const response = await this.#doc.send(
      new QueryCommand({
        TableName: this.#table,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': GSI1.activePrograms },
      }),
    );
    return (response.Items ?? []).map((item) => ({
      programId: String(item['programId']),
      programWeeks: typeof item['programWeeks'] === 'number' ? item['programWeeks'] : 8,
      templateName: String(item['templateName'] ?? 'nplp_semana'),
      languageCode: String(item['languageCode'] ?? 'es'),
    }));
  }

  /** Paginated: at 50 families one page is enough, but a silent truncation would be invisible. */
  async listFamilyIds(programId: string, status: string): Promise<string[]> {
    const ids: string[] = [];
    let startKey: Record<string, unknown> | undefined;

    do {
      const response = await this.#doc.send(
        new QueryCommand({
          TableName: this.#table,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': GSI1.familiesByStatus(programId, status) },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of response.Items ?? []) {
        ids.push(String(item['familyId']));
      }
      startKey = response.LastEvaluatedKey;
    } while (startKey !== undefined);

    return ids;
  }

  /**
   * One Query for the whole family: metadata, baby, caregivers and past deliveries all share a
   * partition, so the scheduler does a single read per family rather than four.
   */
  async loadFamily(familyId: string): Promise<FamilyAggregate | null> {
    const response = await this.#doc.send(
      new QueryCommand({
        TableName: this.#table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': KEY.family(familyId) },
      }),
    );
    const items = response.Items ?? [];
    const meta = items.find((item) => item['SK'] === SK.meta);
    if (meta === undefined) {
      return null;
    }

    const caregivers: Caregiver[] = [];
    const deliveredIsoWeeks: string[] = [];
    let babyName = '';

    for (const item of items) {
      const sk = String(item['SK']);
      if (sk === SK.baby) {
        babyName = String(item['name'] ?? item['alias'] ?? '');
      } else if (sk.startsWith('CAREGIVER#')) {
        caregivers.push({
          msisdn: String(item['msisdn']) as Msisdn,
          role: item['role'] === 'secundario' ? 'secundario' : 'principal',
          optIn: item['optIn'] === true,
          optInAt: typeof item['optInAt'] === 'string' ? item['optInAt'] : null,
          optInSource: (item['optInSource'] as Caregiver['optInSource']) ?? null,
          optOutAt: typeof item['optOutAt'] === 'string' ? item['optOutAt'] : null,
        });
      } else if (sk.startsWith('DELIVERY#')) {
        deliveredIsoWeeks.push(sk.slice('DELIVERY#'.length));
      }
    }

    return {
      familyId,
      programId: String(meta['programId']),
      status: (meta['status'] as FamilyAggregate['status']) ?? 'activa',
      anchorDate: String(meta['anchorDate']) as IsoDate,
      babyName,
      caregivers,
      deliveredIsoWeeks,
    };
  }

  async getContent(programId: string, week: number): Promise<WeekContent | null> {
    const response = await this.#doc.send(
      new GetCommand({
        TableName: this.#table,
        Key: { PK: KEY.program(programId), SK: SK.content(week) },
      }),
    );
    return (response.Item as WeekContent | undefined) ?? null;
  }

  /**
   * Conditional: the delivery record is written **before** anything is sent, so a scheduler retry
   * can never produce a second charged message. Returns `exists` when someone got here first.
   */
  async claimDelivery(input: {
    familyId: string;
    isoWeek: string;
    week: number;
    recipients: readonly string[];
    at: Date;
  }): Promise<'claimed' | 'exists'> {
    const recipients: Record<string, RecipientOutcome> = {};
    for (const msisdn of input.recipients) {
      recipients[msisdn] = { status: 'pendiente', at: input.at.toISOString() };
    }

    try {
      await this.#doc.send(
        new PutCommand({
          TableName: this.#table,
          Item: {
            PK: KEY.family(input.familyId),
            SK: SK.delivery(input.isoWeek),
            entity: 'delivery',
            familyId: input.familyId,
            isoWeek: input.isoWeek,
            week: input.week,
            claimedAt: input.at.toISOString(),
            recipients,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return 'claimed';
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        return 'exists';
      }
      throw error;
    }
  }

  async getDelivery(familyId: string, isoWeek: string): Promise<DeliveryRecord | null> {
    const response = await this.#doc.send(
      new GetCommand({
        TableName: this.#table,
        Key: { PK: KEY.family(familyId), SK: SK.delivery(isoWeek) },
      }),
    );
    if (response.Item === undefined) {
      return null;
    }
    return {
      familyId,
      isoWeek,
      week: Number(response.Item['week']),
      recipients: (response.Item['recipients'] as Record<string, RecipientOutcome>) ?? {},
    };
  }

  async recordRecipientOutcome(
    familyId: string,
    isoWeek: string,
    msisdn: string,
    outcome: RecipientOutcome,
  ): Promise<void> {
    await this.#doc.send(
      new UpdateCommand({
        TableName: this.#table,
        Key: { PK: KEY.family(familyId), SK: SK.delivery(isoWeek) },
        UpdateExpression: 'SET recipients.#m = :outcome',
        ExpressionAttributeNames: { '#m': msisdn },
        ExpressionAttributeValues: { ':outcome': outcome },
      }),
    );
  }

  /**
   * Links a Meta message id back to the family and week. The status webhook writes the `pricing`
   * object into the same partition, so reconciling a Meta invoice line to a family is one Query.
   */
  async linkWamid(input: {
    wamid: string;
    familyId: string;
    isoWeek: string;
    msisdn: string;
    at: Date;
  }): Promise<void> {
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.wamid(input.wamid),
          SK: SK.meta,
          entity: 'wamid_ref',
          wamid: input.wamid,
          familyId: input.familyId,
          isoWeek: input.isoWeek,
          msisdn: input.msisdn,
          sentAt: input.at.toISOString(),
        },
      }),
    );
  }
}
