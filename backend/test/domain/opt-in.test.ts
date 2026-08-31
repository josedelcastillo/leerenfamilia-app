import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPT_OUT_KEYWORDS,
  applyOptIn,
  applyOptOut,
  assertValidOptIn,
  canReceiveMessages,
  isOptOutKeyword,
  normalizeKeyword,
  type Caregiver,
} from '../../src/domain/opt-in.ts';
import { toE164 } from '../../src/domain/msisdn.ts';
import { DomainError } from '../../src/domain/errors.ts';

const AT = '2026-09-15T10:00:00.000Z';

function caregiver(overrides: Partial<Caregiver> = {}): Caregiver {
  return {
    msisdn: toE164('987654321'),
    role: 'principal',
    optIn: true,
    optInAt: AT,
    optInSource: 'qr',
    optOutAt: null,
    ...overrides,
  };
}

describe('isOptOutKeyword', () => {
  test('matches the three required keywords in any case', () => {
    for (const keyword of OPT_OUT_KEYWORDS) {
      assert.equal(isOptOutKeyword(keyword), true);
      assert.equal(isOptOutKeyword(keyword.toLowerCase()), true);
      assert.equal(isOptOutKeyword(` ${keyword} `), true);
    }
  });

  test('ignores punctuation and accents around the keyword', () => {
    assert.equal(isOptOutKeyword('¡BAJA!'), true);
    assert.equal(isOptOutKeyword('baja.'), true);
    assert.equal(isOptOutKeyword('Salír'), true);
  });

  test('does not match a sentence that merely contains the word', () => {
    // Deliberate: fuzzy matching risks cutting off a family that never asked to leave.
    // These reach the manager inbox as a consulta instead.
    assert.equal(isOptOutKeyword('quiero darme de baja'), false);
    assert.equal(isOptOutKeyword('el bebe esta de baja de peso'), false);
    assert.equal(isOptOutKeyword('stop it'), false);
  });

  test('does not match unrelated messages', () => {
    for (const text of ['hola', 'gracias!', '', '   ', 'BAJAR', 'SALIRME']) {
      assert.equal(isOptOutKeyword(text), false, `unexpected match on ${JSON.stringify(text)}`);
    }
  });
});

describe('normalizeKeyword', () => {
  test('strips accents, punctuation and case', () => {
    assert.equal(normalizeKeyword('  ¡Salír!  '), 'SALIR');
  });
});

describe('canReceiveMessages', () => {
  test('true only for a live opt-in', () => {
    assert.equal(canReceiveMessages(caregiver()), true);
    assert.equal(canReceiveMessages(caregiver({ optIn: false })), false);
  });

  test('false once opted out, even if the opt-in flag was left true', () => {
    // Belt and braces: a partial write must not resurrect a caregiver who asked to leave.
    assert.equal(canReceiveMessages(caregiver({ optIn: true, optOutAt: AT })), false);
  });
});

describe('assertValidOptIn', () => {
  test('accepts a consent that records when and how it was given', () => {
    assert.doesNotThrow(() => assertValidOptIn(caregiver()));
  });

  test('rejects an opt-in with no timestamp or no source', () => {
    assert.throws(
      () => assertValidOptIn(caregiver({ optInAt: null })),
      (e: unknown) => e instanceof DomainError && e.code === 'invalid_opt_in',
    );
    assert.throws(() => assertValidOptIn(caregiver({ optInSource: null })), DomainError);
  });

  test('ignores a caregiver who never opted in', () => {
    assert.doesNotThrow(() =>
      assertValidOptIn(caregiver({ optIn: false, optInAt: null, optInSource: null })),
    );
  });
});

describe('applyOptOut', () => {
  test('stops messages and stamps the time', () => {
    const result = applyOptOut(caregiver(), AT);
    assert.equal(result.optIn, false);
    assert.equal(result.optOutAt, AT);
    assert.equal(canReceiveMessages(result), false);
  });

  test('keeps the original consent record', () => {
    // The consent was really given; erasing the evidence would destroy the audit trail.
    const result = applyOptOut(caregiver(), '2026-10-01T00:00:00.000Z');
    assert.equal(result.optInAt, AT);
    assert.equal(result.optInSource, 'qr');
  });

  test('does not mutate its input', () => {
    const original = caregiver();
    applyOptOut(original, AT);
    assert.equal(original.optIn, true);
    assert.equal(original.optOutAt, null);
  });
});

describe('applyOptIn', () => {
  test('records timestamp and channel', () => {
    const fresh = caregiver({ optIn: false, optInAt: null, optInSource: null });
    const result = applyOptIn(fresh, AT, 'whatsapp');
    assert.equal(result.optIn, true);
    assert.equal(result.optInAt, AT);
    assert.equal(result.optInSource, 'whatsapp');
    assert.doesNotThrow(() => assertValidOptIn(result));
  });

  test('clears a previous opt-out so a family can come back', () => {
    const gone = applyOptOut(caregiver(), AT);
    const back = applyOptIn(gone, '2026-11-01T00:00:00.000Z', 'gestor');
    assert.equal(back.optOutAt, null);
    assert.equal(canReceiveMessages(back), true);
  });
});
