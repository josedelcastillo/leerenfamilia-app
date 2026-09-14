import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { IsoDate } from '../domain/dates.ts';
import type { Feedback } from '../domain/feedback.ts';
import type { DeclaredBy, LogEntry, LoggedBy } from '../domain/log-entry.ts';
import type { WeekContent } from '../content/weeks.ts';
import type {
  FamilyContext,
  FamilyStore,
  NotesConsentChange,
  ResourceAccess,
} from '../handlers/family-ports.ts';
import type {
  EnrollmentRecord,
  EnrollmentStore,
  ProgramConfig,
} from '../handlers/register/logic.ts';
import { GSI1, KEY, SK } from './keys.ts';

const relationOf = (value: unknown): DeclaredBy | null =>
  value === 'mama' || value === 'papa' || value === 'otra' ? value : null;

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
        relation: relationOf(item['relation']),
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

  /**
   * Proof first, then the flag, and the newest change wins by its own time (D-025).
   *
   * The offline queue does not preserve order and two caregivers' phones can deliver crossed changes,
   * so the flag on META only moves for a change strictly newer than `notesConsentAt`, the time of
   * the change that set it. A stale change still gets its CONSENT# proof — it did happen, and the
   * record is evidence of what the family chose and when — but it must not flip the flag; its
   * failed condition is swallowed so the device dequeues it as processed. The proof is keyed by
   * client id, so a replay overwrites it; if the flag update fails for any other reason the error
   * propagates and the replay rewrites the same proof.
   *
   * The flag is what `openFamilyDetail` and the export read, so revoking hides every note already
   * sent — the filter is on read (rule 8), which is what makes a revocation retroactive for free.
   */
  async putNotesConsent(familyId: string, change: NotesConsentChange): Promise<void> {
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.family(familyId),
          SK: SK.consentChange(change.at, change.clientId),
          entity: 'consent',
          familyId,
          channel: 'pwa',
          version: change.version,
          acceptedAt: change.at,
          freeTextNotesAuthorized: change.notesAuthorized,
          changedBy: change.changedBy,
          clientId: change.clientId,
        },
      }),
    );
    try {
      await this.#doc.send(
        new UpdateCommand({
          TableName: this.#table,
          Key: { PK: KEY.family(familyId), SK: SK.meta },
          UpdateExpression: 'SET freeTextNotesAuthorized = :value, notesConsentAt = :at',
          // ISO-8601 UTC strings from toISOString() order correctly as strings.
          ConditionExpression:
            'attribute_exists(PK) AND (attribute_not_exists(notesConsentAt) OR notesConsentAt < :at)',
          ExpressionAttributeValues: { ':value': change.notesAuthorized, ':at': change.at },
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        return; // Stale: a newer change already set the flag.
      }
      throw error;
    }
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
        relation: caregiver.relation,
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
