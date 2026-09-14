import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { FamilyDataStore } from '../../src/adapters/family-store.ts';
import { isoDate } from '../../src/domain/dates.ts';
import type { Msisdn } from '../../src/domain/msisdn.ts';
import type { NotesConsentChange } from '../../src/handlers/family-ports.ts';
import type { EnrollmentRecord } from '../../src/handlers/register/logic.ts';

interface SentCommand {
  readonly name: string;
  readonly input: Record<string, any>;
}

/** Records every command and, when told to, fails one kind of command with a named error. */
class StubDoc {
  readonly sent: SentCommand[] = [];
  failOn: { command: string; errorName: string } | null = null;

  async send(command: { constructor: { name: string }; input: Record<string, any> }): Promise<unknown> {
    const name = command.constructor.name;
    this.sent.push({ name, input: command.input });
    if (this.failOn?.command === name) {
      const error = new Error('stub failure');
      error.name = this.failOn.errorName;
      throw error;
    }
    return {};
  }
}

function storeWith(stub: StubDoc): FamilyDataStore {
  return new FamilyDataStore('tabla', stub as unknown as DynamoDBDocumentClient);
}

// A clamped change: the device said 2027, the server received it earlier.
const CHANGE: NotesConsentChange = {
  clientId: 'c-1',
  notesAuthorized: true,
  deviceAt: '2027-01-01T00:00:00.000Z',
  at: '2026-09-20T14:00:00.000Z',
  version: 'borrador-0',
  changedBy: '+51987654321',
};

describe('FamilyDataStore.putNotesConsent', () => {
  test('writes the proof keyed by device time, then the flag conditioned on the effective time', async () => {
    const stub = new StubDoc();
    await storeWith(stub).putNotesConsent('fam-1', CHANGE);

    assert.deepEqual(stub.sent.map((c) => c.name), ['PutCommand', 'UpdateCommand']);

    const put = stub.sent[0]!.input;
    assert.equal(put['TableName'], 'tabla');
    assert.equal(put['Item']['PK'], 'FAMILY#fam-1');
    assert.equal(put['Item']['SK'], `CONSENT#${CHANGE.deviceAt}#${CHANGE.clientId}`);
    assert.equal(put['Item']['entity'], 'consent');
    assert.equal(put['Item']['channel'], 'pwa');
    assert.equal(put['Item']['deviceAt'], CHANGE.deviceAt);
    assert.equal(put['Item']['acceptedAt'], CHANGE.at);

    const update = stub.sent[1]!.input;
    assert.deepEqual(update['Key'], { PK: 'FAMILY#fam-1', SK: 'META' });
    // A grant moves the flag only when strictly newer.
    assert.equal(
      update['ConditionExpression'],
      'attribute_exists(PK) AND (attribute_not_exists(notesConsentAt) OR notesConsentAt < :at)',
    );
    assert.equal(update['ExpressionAttributeValues'][':at'], CHANGE.at);
    assert.equal(update['ExpressionAttributeValues'][':value'], true);
  });

  test('a revocation also wins a tie: its condition accepts an equal time', async () => {
    const stub = new StubDoc();
    await storeWith(stub).putNotesConsent('fam-1', { ...CHANGE, notesAuthorized: false });

    const update = stub.sent[1]!.input;
    assert.equal(
      update['ConditionExpression'],
      'attribute_exists(PK) AND (attribute_not_exists(notesConsentAt) OR notesConsentAt <= :at)',
    );
    // No comparison between two values: every operand of the condition is a path or one value.
    assert.equal(Object.keys(update['ExpressionAttributeValues']).sort().join(','), ':at,:value');
  });

  test('swallows a failed condition: the change is stale, not an error', async () => {
    const stub = new StubDoc();
    stub.failOn = { command: 'UpdateCommand', errorName: 'ConditionalCheckFailedException' };
    await assert.doesNotReject(() => storeWith(stub).putNotesConsent('fam-1', CHANGE));
    assert.equal(stub.sent.length, 2, 'the proof was still written');
  });

  test('rethrows any other error on the flag update, so the device retries', async () => {
    const stub = new StubDoc();
    stub.failOn = { command: 'UpdateCommand', errorName: 'ProvisionedThroughputExceededException' };
    await assert.rejects(
      () => storeWith(stub).putNotesConsent('fam-1', CHANGE),
      { name: 'ProvisionedThroughputExceededException' },
    );
  });
});

describe('FamilyDataStore.createFamily', () => {
  test('seeds notesConsentAt on META with the enrolment time', async () => {
    const record: EnrollmentRecord = {
      familyId: 'fam-1',
      programId: 'piloto-2026',
      clinic: 'clinica-1',
      anchorDate: isoDate('2026-09-15'),
      anchorPolicy: 'enrollment_date',
      babyName: 'Mateo',
      babyBirthDate: isoDate('2026-09-10'),
      caregivers: [{ msisdn: '+51987654321' as Msisdn, role: 'principal', relation: 'mama' }],
      consentVersion: 'v1',
      freeTextNotesAuthorized: false,
      enrolledAt: '2026-09-15T15:00:00.000Z',
    };
    const stub = new StubDoc();
    await storeWith(stub).createFamily(record);

    assert.deepEqual(stub.sent.map((c) => c.name), ['TransactWriteCommand']);
    const items = (stub.sent[0]!.input['TransactItems'] as Array<{ Put: { Item: Record<string, unknown> } }>)
      .map((t) => t.Put.Item);
    const meta = items.find((item) => item['SK'] === 'META');
    assert.ok(meta, 'META item is written');
    assert.equal(meta['notesConsentAt'], record.enrolledAt);
  });
});
