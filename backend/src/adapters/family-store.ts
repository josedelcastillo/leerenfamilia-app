import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { IsoDate } from '../domain/dates.ts';
import type { Feedback } from '../domain/feedback.ts';
import type { LogEntry, LoggedBy } from '../domain/log-entry.ts';
import type { WeekContent } from '../content/weeks.ts';
import type {
  FamilyContext,
  FamilyStore,
  ResourceAccess,
} from '../handlers/family-ports.ts';
import type {
  EnrollmentRecord,
  EnrollmentStore,
  ProgramConfig,
} from '../handlers/register/logic.ts';
import { GSI1, KEY, SK } from './keys.ts';

export class FamilyDataStore implements FamilyStore, EnrollmentStore {
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

  async #queryPartition(pk: string, prefix?: string): Promise<Array<Record<string, unknown>>> {
    const items: Array<Record<string, unknown>> = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const response = await this.#doc.send(
        new QueryCommand({
          TableName: this.#table,
          KeyConditionExpression:
            prefix === undefined ? 'PK = :pk' : 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues:
            prefix === undefined ? { ':pk': pk } : { ':pk': pk, ':sk': prefix },
          ExclusiveStartKey: startKey,
        }),
      );
      items.push(...((response.Items ?? []) as Array<Record<string, unknown>>));
      startKey = response.LastEvaluatedKey;
    } while (startKey !== undefined);
    return items;
  }

  async getContext(familyId: string): Promise<FamilyContext | null> {
    const items = await this.#queryPartition(KEY.family(familyId));
    const meta = items.find((item) => item['SK'] === SK.meta);
    if (meta === undefined) {
      return null;
    }
    const baby = items.find((item) => item['SK'] === SK.baby);
    const caregivers = items
      .filter((item) => String(item['SK']).startsWith('CAREGIVER#'))
      .map((item) => ({
        msisdn: String(item['msisdn']),
        role: (item['role'] === 'secundario' ? 'secundario' : 'principal') as LoggedBy,
      }));

    return {
      familyId,
      programId: String(meta['programId']),
      status: (meta['status'] as FamilyContext['status']) ?? 'activa',
      anchorDate: String(meta['anchorDate']) as IsoDate,
      programWeeks: typeof meta['programWeeks'] === 'number' ? meta['programWeeks'] : 8,
      babyName: String(baby?.['name'] ?? ''),
      freeTextNotesAuthorized: meta['freeTextNotesAuthorized'] === true,
      caregivers,
    };
  }

  async getWeeks(programId: string, weeks: readonly number[]): Promise<WeekContent[]> {
    if (weeks.length === 0) {
      return [];
    }
    // BatchGet caps at 100 keys; the programme is 8 weeks, so one call always suffices.
    const response = await this.#doc.send(
      new BatchGetCommand({
        RequestItems: {
          [this.#table]: {
            Keys: weeks.map((week) => ({ PK: KEY.program(programId), SK: SK.content(week) })),
          },
        },
      }),
    );
    return ((response.Responses?.[this.#table] ?? []) as WeekContent[]) ?? [];
  }

  /**
   * Idempotent by construction: the client id is part of the sort key, so replaying a queued flush
   * overwrites this exact item instead of adding a duplicate — with no read-before-write.
   */
  async putLogEntry(familyId: string, entry: LogEntry, receivedAt: Date): Promise<void> {
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.family(familyId),
          SK: SK.log(`${entry.date}T00:00:00.000Z`, entry.clientId),
          entity: 'log_entry',
          familyId,
          ...entry,
          receivedAt: receivedAt.toISOString(),
        },
      }),
    );
  }

  async putAccess(familyId: string, access: ResourceAccess, msisdn: string): Promise<void> {
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.family(familyId),
          SK: SK.access(access.at, access.resourceId),
          entity: 'resource_access',
          familyId,
          msisdn,
          ...access,
        },
      }),
    );
  }

  async putFeedback(familyId: string, programId: string, feedback: Feedback): Promise<void> {
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

  async listFeedback(familyId: string): Promise<Feedback[]> {
    const items = await this.#queryPartition(KEY.family(familyId), 'FEEDBACK#');
    return items as unknown as Feedback[];
  }

  async listLogEntries(familyId: string): Promise<LogEntry[]> {
    const items = await this.#queryPartition(KEY.family(familyId), 'LOG#');
    return items as unknown as LogEntry[];
  }

  // --- enrolment ------------------------------------------------------------

  async getProgram(programId: string): Promise<ProgramConfig | null> {
    const items = await this.#queryPartition(KEY.program(programId), SK.meta);
    const meta = items[0];
    if (meta === undefined) {
      return null;
    }
    return {
      programId,
      anchorPolicy: meta['anchorPolicy'] === 'birth_date' ? 'birth_date' : 'enrollment_date',
      programWeeks: typeof meta['programWeeks'] === 'number' ? meta['programWeeks'] : 8,
      consentVersion: String(meta['consentVersion'] ?? 'v1'),
    };
  }

  async findFamilyByMsisdn(msisdn: string): Promise<string | null> {
    const response = await this.#doc.send(
      new QueryCommand({
        TableName: this.#table,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': GSI1.byMsisdn(msisdn) },
        Limit: 1,
      }),
    );
    const item = response.Items?.[0];
    return item === undefined ? null : String(item['familyId']);
  }

  /**
   * One transaction. A family that ends up with a baby but no caregivers, or with consent recorded
   * and no family, is worse than an enrolment that fails and is retried at the clinic desk.
   */
  async createFamily(record: EnrollmentRecord): Promise<void> {
    const items: Array<Record<string, unknown>> = [
      {
        PK: KEY.family(record.familyId),
        SK: SK.meta,
        GSI1PK: GSI1.familiesByStatus(record.programId, 'activa'),
        GSI1SK: GSI1.familyByStatusSort(record.anchorDate, record.familyId),
        entity: 'family',
        familyId: record.familyId,
        programId: record.programId,
        status: 'activa',
        clinic: record.clinic,
        anchorDate: record.anchorDate,
        anchorPolicy: record.anchorPolicy,
        freeTextNotesAuthorized: record.freeTextNotesAuthorized,
        enrolledAt: record.enrolledAt,
      },
      {
        PK: KEY.family(record.familyId),
        SK: SK.baby,
        entity: 'baby',
        familyId: record.familyId,
        name: record.babyName,
        birthDate: record.babyBirthDate,
      },
      {
        PK: KEY.family(record.familyId),
        SK: SK.consent(record.enrolledAt),
        entity: 'consent',
        familyId: record.familyId,
        version: record.consentVersion,
        channel: 'qr',
        acceptedAt: record.enrolledAt,
        freeTextNotesAuthorized: record.freeTextNotesAuthorized,
      },
      ...record.caregivers.map((caregiver) => ({
        PK: KEY.family(record.familyId),
        SK: SK.caregiver(caregiver.msisdn),
        GSI1PK: GSI1.byMsisdn(caregiver.msisdn),
        GSI1SK: GSI1.msisdnSort(record.familyId),
        entity: 'caregiver',
        familyId: record.familyId,
        programId: record.programId,
        msisdn: caregiver.msisdn,
        role: caregiver.role,
        optIn: true,
        optInAt: record.enrolledAt,
        optInSource: 'qr',
        optOutAt: null,
        lastInboundAt: null,
      })),
    ];

    await this.#doc.send(
      new TransactWriteCommand({
        TransactItems: items.map((Item) => ({
          Put: {
            TableName: this.#table,
            Item,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          },
        })),
      }),
    );
  }
}
