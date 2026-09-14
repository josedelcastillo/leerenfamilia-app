import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Feedback } from '../domain/feedback.ts';
import type { StatusEvent } from '../domain/whatsapp-events.ts';
import type { MockDelivery, MockDeliverySink } from './whatsapp/mock.ts';
import { GSI1, KEY, SK, TTL_DAYS, ttlSeconds } from './keys.ts';

export interface CaregiverRef {
  readonly familyId: string;
  readonly programId: string;
  readonly msisdn: string;
  readonly role: 'principal' | 'secundario';
  readonly optIn: boolean;
  readonly lastInboundAt: number | null;
}

export class Store implements MockDeliverySink {
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

  /**
   * Claims a WhatsApp message id. Returns false when it was already claimed.
   *
   * A conditional write rather than read-then-write: Meta retries, and two retries can land in two
   * concurrent Lambdas. A read-then-write would let both of them think they were first and file the
   * same message as feedback twice.
   */
  async claimMessageId(wamid: string, now: Date): Promise<boolean> {
    try {
      await this.#doc.send(
        new PutCommand({
          TableName: this.#table,
          Item: {
            PK: KEY.waMessage(wamid),
            SK: SK.dedupe,
            entity: 'wa_dedupe',
            wamid,
            claimedAt: now.toISOString(),
            ttl: ttlSeconds(now, TTL_DAYS.webhookDedupe),
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
   * Gives a claim back after processing failed, so Meta's retry is processed instead of being
   * swallowed as a duplicate. Losing a mother's message silently is worse than filing it twice.
   */
  async releaseMessageId(wamid: string): Promise<void> {
    await this.#doc.send(
      new DeleteCommand({
        TableName: this.#table,
        Key: { PK: KEY.waMessage(wamid), SK: SK.dedupe },
      }),
    );
  }

  /** Reverse lookup for inbound messages, which carry only the sender's number. */
  async findCaregiverByMsisdn(msisdn: string): Promise<CaregiverRef | null> {
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
    if (item === undefined) {
      return null;
    }
    return {
      familyId: String(item['familyId']),
      programId: String(item['programId']),
      msisdn: String(item['msisdn']),
      role: item['role'] === 'secundario' ? 'secundario' : 'principal',
      optIn: item['optIn'] === true,
      lastInboundAt: typeof item['lastInboundAt'] === 'number' ? item['lastInboundAt'] : null,
    };
  }

  /** Every inbound message reopens the 24h service window, whatever it said. */
  async touchServiceWindow(familyId: string, msisdn: string, atMs: number): Promise<void> {
    await this.#doc.send(
      new UpdateCommand({
        TableName: this.#table,
        Key: { PK: KEY.family(familyId), SK: SK.caregiver(msisdn) },
        UpdateExpression: 'SET lastInboundAt = :at',
        // Never resurrect a caregiver record that enrolment has not created.
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':at': atMs },
      }),
    );
  }

  /**
   * Keeps `optInAt` and `optInSource`: they record a consent that really was given, and the audit
   * trail outlives the subscription. Erasure is a separate, explicit action.
   */
  async optOutCaregiver(familyId: string, msisdn: string, atIso: string): Promise<void> {
    await this.#doc.send(
      new UpdateCommand({
        TableName: this.#table,
        Key: { PK: KEY.family(familyId), SK: SK.caregiver(msisdn) },
        UpdateExpression: 'SET optIn = :false, optOutAt = :at',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':false': false, ':at': atIso },
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

  /**
   * One item per status per message id, so Meta re-sending `delivered` overwrites rather than
   * duplicates. The `pricing` object is stored verbatim: it is the only way to reconcile against
   * Meta's invoice and to find out whether a template is landing as utility or as marketing.
   */
  async putMessageStatus(event: StatusEvent, receivedAt: Date): Promise<void> {
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.wamid(event.wamid),
          SK: SK.status(event.status),
          entity: 'wa_status',
          wamid: event.wamid,
          status: event.status,
          timestampMs: event.timestampMs,
          recipientId: event.recipientId,
          pricingCategory: event.pricing?.category ?? null,
          pricingBillable: event.pricing?.billable ?? null,
          pricingModel: event.pricing?.pricingModel ?? null,
          conversationId: event.conversationId,
          receivedAt: receivedAt.toISOString(),
        },
      }),
    );
  }

  /** `MockDeliverySink`: where the mock provider files what it would have sent. */
  async record(delivery: MockDelivery): Promise<void> {
    const sentAt = new Date(delivery.sentAt);
    await this.#doc.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          PK: KEY.mockMonth(delivery.sentAt.slice(0, 7)),
          SK: `${delivery.sentAt}#${delivery.wamid}`,
          entity: 'wa_mock_delivery',
          ...delivery,
          ttl: ttlSeconds(sentAt, TTL_DAYS.mockDelivery),
        },
      }),
    );
  }
}
