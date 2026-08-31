import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isE164, toE164 } from '../../src/domain/msisdn.ts';
import { DomainError } from '../../src/domain/errors.ts';

describe('toE164', () => {
  test('normalises the ways a Peruvian mobile actually gets typed', () => {
    const expected = '+51987654321';
    for (const input of [
      '987654321',
      '987 654 321',
      '987-654-321',
      '+51987654321',
      '+51 987 654 321',
      '0051987654321',
      '51987654321',
      '(51) 987654321',
      '987.654.321',
    ]) {
      assert.equal(toE164(input), expected, `failed on ${JSON.stringify(input)}`);
    }
  });

  test('keeps a foreign number that already carries its country code', () => {
    assert.equal(toE164('+34600123456'), '+34600123456');
    assert.equal(toE164('+1 415 555 0134'), '+14155550134');
  });

  test('rejects letters and empty input', () => {
    for (const bad of ['', '   ', 'no tengo', '98765432a', '+', '+51 98A 654 321']) {
      assert.throws(() => toE164(bad), DomainError, `expected rejection of ${JSON.stringify(bad)}`);
    }
  });

  test('rejects numbers that are too short or too long for E.164', () => {
    assert.throws(() => toE164('+51987'), DomainError);
    assert.throws(() => toE164('+5198765432112345'), DomainError);
  });

  test('rejects a number starting with a zero country code', () => {
    assert.throws(() => toE164('+0987654321'), DomainError);
  });

  test('carries the invalid input into the error message so the form can echo it back', () => {
    assert.throws(() => toE164('98765432a'), /98765432a/);
  });
});

describe('isE164', () => {
  test('accepts normalised numbers and rejects raw ones', () => {
    assert.equal(isE164('+51987654321'), true);
    assert.equal(isE164('987654321'), false);
    assert.equal(isE164('51987654321'), false);
  });
});
