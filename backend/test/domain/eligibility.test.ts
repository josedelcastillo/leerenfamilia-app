import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate, isoWeek } from '../../src/domain/dates.ts';
import { decideWeeklySend, type FamilySendState } from '../../src/domain/eligibility.ts';
import { toE164 } from '../../src/domain/msisdn.ts';
import type { Caregiver } from '../../src/domain/opt-in.ts';

const ANCHOR = isoDate('2026-09-15');
const AT = '2026-09-15T10:00:00.000Z';

function caregiver(msisdn: string, overrides: Partial<Caregiver> = {}): Caregiver {
  return {
    msisdn: toE164(msisdn),
    role: 'principal',
    optIn: true,
    optInAt: AT,
    optInSource: 'qr',
    optOutAt: null,
    ...overrides,
  };
}

function family(overrides: Partial<FamilySendState> = {}): FamilySendState {
  return {
    familyId: 'fam-1',
    status: 'activa',
    anchorDate: ANCHOR,
    caregivers: [caregiver('987654321')],
    deliveredIsoWeeks: [],
    ...overrides,
  };
}

describe('decideWeeklySend — when it sends', () => {
  test('sends on the anchor day, in week 1', () => {
    const decision = decideWeeklySend(family(), ANCHOR);
    assert.equal(decision.send, true);
    assert.equal(decision.send && decision.week, 1);
    assert.equal(decision.send && decision.isoWeek, isoWeek(ANCHOR));
  });

  test('sends every week from 1 to 8', () => {
    for (let week = 1; week <= 8; week += 1) {
      const today = addDays(ANCHOR, (week - 1) * 7);
      const decision = decideWeeklySend(family(), today);
      assert.equal(decision.send, true, `week ${week} should send`);
      assert.equal(decision.send && decision.week, week);
    }
  });

  test('addresses every caregiver who has opted in', () => {
    const decision = decideWeeklySend(
      family({ caregivers: [caregiver('987654321'), caregiver('912345678', { role: 'secundario' })] }),
      ANCHOR,
    );
    assert.deepEqual(decision.send && decision.recipients, ['+51987654321', '+51912345678']);
  });

  test('skips the caregiver who opted out but still sends to the other one', () => {
    const decision = decideWeeklySend(
      family({
        caregivers: [
          caregiver('987654321'),
          caregiver('912345678', { role: 'secundario', optIn: false, optOutAt: AT }),
        ],
      }),
      ANCHOR,
    );
    assert.deepEqual(decision.send && decision.recipients, ['+51987654321']);
  });
});

describe('decideWeeklySend — when it skips', () => {
  test('skips a family that is not active', () => {
    for (const status of ['baja', 'suprimida'] as const) {
      const decision = decideWeeklySend(family({ status }), ANCHOR);
      assert.deepEqual(decision, { send: false, reason: 'familia_inactiva' });
    }
  });

  test('skips before the program starts', () => {
    const decision = decideWeeklySend(family(), addDays(ANCHOR, -1));
    assert.deepEqual(decision, { send: false, reason: 'aun_no_inicia' });
  });

  test('skips once week 8 is over', () => {
    assert.equal(decideWeeklySend(family(), addDays(ANCHOR, 55)).send, true);
    assert.deepEqual(decideWeeklySend(family(), addDays(ANCHOR, 56)), {
      send: false,
      reason: 'programa_finalizado',
    });
  });

  test('skips a family with nobody left opted in', () => {
    const decision = decideWeeklySend(
      family({ caregivers: [caregiver('987654321', { optIn: false, optOutAt: AT })] }),
      ANCHOR,
    );
    assert.deepEqual(decision, { send: false, reason: 'sin_cuidadores_con_opt_in' });
  });

  test('skips a family with no caregivers at all', () => {
    const decision = decideWeeklySend(family({ caregivers: [] }), ANCHOR);
    assert.deepEqual(decision, { send: false, reason: 'sin_cuidadores_con_opt_in' });
  });
});

describe('decideWeeklySend — idempotency', () => {
  test('a second run in the same ISO week does not send again', () => {
    // EventBridge retries and Lambda can be invoked twice for one trigger. A repeat must never
    // produce a second charged WhatsApp message.
    const first = decideWeeklySend(family(), ANCHOR);
    assert.equal(first.send, true);

    const afterDelivery = family({ deliveredIsoWeeks: [first.send ? first.isoWeek : ''] });
    assert.deepEqual(decideWeeklySend(afterDelivery, ANCHOR), {
      send: false,
      reason: 'ya_enviado_esta_semana',
    });
  });

  test('the block lasts the whole calendar week, not 24 hours', () => {
    const delivered = [isoWeek(ANCHOR)];
    // ANCHOR is a Tuesday; the rest of that ISO week must stay blocked.
    for (let offset = 0; offset <= 5; offset += 1) {
      const today = addDays(ANCHOR, offset);
      if (isoWeek(today) !== delivered[0]) {
        continue;
      }
      assert.deepEqual(decideWeeklySend(family({ deliveredIsoWeeks: delivered }), today), {
        send: false,
        reason: 'ya_enviado_esta_semana',
      });
    }
  });

  test('the next ISO week sends again', () => {
    const delivered = [isoWeek(ANCHOR)];
    const nextWeek = addDays(ANCHOR, 7);
    assert.notEqual(isoWeek(nextWeek), delivered[0]);
    assert.equal(decideWeeklySend(family({ deliveredIsoWeeks: delivered }), nextWeek).send, true);
  });

  test('an unrelated past delivery does not block this week', () => {
    const decision = decideWeeklySend(family({ deliveredIsoWeeks: ['2020-W01'] }), ANCHOR);
    assert.equal(decision.send, true);
  });
});

describe('decideWeeklySend — reason precedence', () => {
  test('an inactive family reports inactivity, not the other problems it also has', () => {
    // The skip reasons feed the weekly implementation report, so the most explanatory one wins.
    const decision = decideWeeklySend(
      family({ status: 'baja', caregivers: [], deliveredIsoWeeks: [isoWeek(ANCHOR)] }),
      addDays(ANCHOR, 200),
    );
    assert.deepEqual(decision, { send: false, reason: 'familia_inactiva' });
  });

  test('a finished program is reported before a missing opt-in', () => {
    const decision = decideWeeklySend(family({ caregivers: [] }), addDays(ANCHOR, 100));
    assert.deepEqual(decision, { send: false, reason: 'programa_finalizado' });
  });
});

describe('decideWeeklySend — configurable program length', () => {
  test('a 12-week program keeps sending past week 8', () => {
    const decision = decideWeeklySend(family(), addDays(ANCHOR, 56), 12);
    assert.equal(decision.send, true);
    assert.equal(decision.send && decision.week, 9);
  });
});
