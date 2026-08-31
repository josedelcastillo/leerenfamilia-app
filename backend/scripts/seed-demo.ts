/**
 * Seeds a program, its eight placeholder weeks and a handful of demo families, so the whole flow
 * can be exercised with `WA_PROVIDER=mock` before enrolment (phase 5) exists.
 *
 * Requires AWS credentials — it is a development tool, not part of the deployed stack.
 *
 *   TABLE_NAME=<tabla> node backend/scripts/seed-demo.ts
 *
 * Every family it creates is prefixed `demo-` and every phone number is in the +5199999xxxx range,
 * which is not a real Peruvian mobile prefix. Demo data must never be confusable with pilot data.
 */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { addDays, isoDate } from '../src/domain/dates.ts';
import { PLACEHOLDER_WEEKS } from '../src/content/weeks.ts';
import { GSI1, KEY, SK } from '../src/adapters/keys.ts';
import { limaDate } from '../src/shared/lima-date.ts';

const TABLE = process.env['TABLE_NAME'];
if (TABLE === undefined || TABLE === '') {
  throw new Error('TABLE_NAME is required');
}

const PROGRAM_ID = 'piloto-2026';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

async function put(item: Record<string, unknown>): Promise<void> {
  await doc.send(new PutCommand({ TableName: TABLE, Item: item }));
}

const today = limaDate(new Date());
const now = new Date().toISOString();

/** Three families at different points of the programme, which is the situation D-003 creates. */
const DEMO_FAMILIES = [
  { id: 'demo-familia-1', baby: 'Mateo', weeksIn: 0, caregivers: ['+51999990001', '+51999990002'] },
  { id: 'demo-familia-2', baby: 'Valentina', weeksIn: 3, caregivers: ['+51999990003'] },
  { id: 'demo-familia-3', baby: 'Thiago', weeksIn: 7, caregivers: ['+51999990004'] },
];

async function main(): Promise<void> {
  await put({
    PK: KEY.program(PROGRAM_ID),
    SK: SK.meta,
    GSI1PK: GSI1.activePrograms,
    GSI1SK: GSI1.programSort(PROGRAM_ID),
    entity: 'program',
    programId: PROGRAM_ID,
    name: 'Piloto clínico 2026',
    programWeeks: 8,
    anchorPolicy: 'enrollment_date',
    templateName: 'nplp_semana',
    languageCode: 'es',
    createdAt: now,
  });

  for (const week of PLACEHOLDER_WEEKS) {
    await put({
      PK: KEY.program(PROGRAM_ID),
      SK: SK.content(week.week),
      entity: 'content',
      programId: PROGRAM_ID,
      ...week,
    });
  }

  for (const demo of DEMO_FAMILIES) {
    const anchorDate = addDays(isoDate(today), -demo.weeksIn * 7);

    await put({
      PK: KEY.family(demo.id),
      SK: SK.meta,
      GSI1PK: GSI1.familiesByStatus(PROGRAM_ID, 'activa'),
      GSI1SK: GSI1.familyByStatusSort(anchorDate, demo.id),
      entity: 'family',
      familyId: demo.id,
      programId: PROGRAM_ID,
      status: 'activa',
      anchorDate,
      anchorPolicy: 'enrollment_date',
      enrolledAt: now,
      clinic: 'CLINICA-DEMO',
      // Phase 8 models this properly; the seed sets it false so the manager view is exercised in
      // its default, more restrictive state.
      freeTextNotesAuthorized: false,
      createdAt: now,
    });

    await put({
      PK: KEY.family(demo.id),
      SK: SK.baby,
      entity: 'baby',
      familyId: demo.id,
      name: demo.baby,
      birthDate: addDays(isoDate(today), -demo.weeksIn * 7 - 14),
    });

    for (const [index, msisdn] of demo.caregivers.entries()) {
      await put({
        PK: KEY.family(demo.id),
        SK: SK.caregiver(msisdn),
        GSI1PK: GSI1.byMsisdn(msisdn),
        GSI1SK: GSI1.msisdnSort(demo.id),
        entity: 'caregiver',
        familyId: demo.id,
        programId: PROGRAM_ID,
        msisdn,
        role: index === 0 ? 'principal' : 'secundario',
        optIn: true,
        optInAt: now,
        optInSource: 'qr',
        optOutAt: null,
        lastInboundAt: null,
      });
    }

    await put({
      PK: KEY.family(demo.id),
      SK: SK.consent(now),
      entity: 'consent',
      familyId: demo.id,
      consentId: randomUUID(),
      version: 'DEMO-0',
      channel: 'qr',
      acceptedAt: now,
      text: 'TODO: texto de consentimiento pendiente de revisión legal (fase 8)',
    });
  }

  console.log(
    `Seeded program ${PROGRAM_ID}, ${PLACEHOLDER_WEEKS.length} weeks of placeholder content and ` +
      `${DEMO_FAMILIES.length} demo families into ${TABLE}.`,
  );
  console.log('Families are at programme weeks: ' + DEMO_FAMILIES.map((f) => f.weeksIn + 1).join(', '));
}

await main();
