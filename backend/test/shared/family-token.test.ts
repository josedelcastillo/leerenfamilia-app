import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  FAMILY_TOKEN_DAYS,
  issueFamilyToken,
  verifyFamilyToken,
} from '../../src/shared/family-token.ts';

const SECRET = 'clave-hmac-de-prueba';
const NOW = new Date('2026-09-15T12:00:00.000Z');
const FAMILY = 'fam-1';
const MSISDN = '+51987654321';

function daysLater(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('issue and verify', () => {
  test('a freshly issued token verifies', () => {
    const result = verifyFamilyToken(issueFamilyToken(FAMILY, MSISDN, NOW, SECRET), SECRET, NOW);
    assert.equal(result.valid, true);
  });

  test('carries the caregiver, not only the family', () => {
    // The pilot needs to know whether the log was filled in by the mother or the father.
    const result = verifyFamilyToken(issueFamilyToken(FAMILY, MSISDN, NOW, SECRET), SECRET, NOW);
    assert.equal(result.valid && result.payload.familyId, FAMILY);
    assert.equal(result.valid && result.payload.msisdn, MSISDN);
  });

  test('two caregivers of one family get distinguishable tokens', () => {
    const mother = issueFamilyToken(FAMILY, '+51987654321', NOW, SECRET);
    const father = issueFamilyToken(FAMILY, '+51912345678', NOW, SECRET);
    assert.notEqual(mother, father);

    const asFather = verifyFamilyToken(father, SECRET, NOW);
    assert.equal(asFather.valid && asFather.payload.msisdn, '+51912345678');
  });

  test('is URL-safe, so it survives being a query parameter', () => {
    const token = issueFamilyToken(FAMILY, MSISDN, NOW, SECRET);
    assert.equal(token, encodeURIComponent(token));
    assert.doesNotMatch(token, /[+/=]/);
  });
});

describe('expiry', () => {
  test('lasts 90 days', () => {
    assert.equal(FAMILY_TOKEN_DAYS, 90);
    const token = issueFamilyToken(FAMILY, MSISDN, NOW, SECRET);
    assert.equal(verifyFamilyToken(token, SECRET, daysLater(89)).valid, true);
    assert.equal(verifyFamilyToken(token, SECRET, daysLater(91)).valid, false);
  });

  test('reports expiry distinctly from a bad signature', () => {
    // The two need different handling: expired means reissue, bad signature means reject.
    const token = issueFamilyToken(FAMILY, MSISDN, NOW, SECRET);
    const expired = verifyFamilyToken(token, SECRET, daysLater(120));
    assert.deepEqual(expired, { valid: false, reason: 'expired' });
  });

  test('is closed at the exact expiry instant', () => {
    const token = issueFamilyToken(FAMILY, MSISDN, NOW, SECRET, 1);
    const exact = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    assert.equal(verifyFamilyToken(token, SECRET, exact).valid, false);
  });

  test('a reissue extends the life without invalidating the family', () => {
    // The weekly send reissues, so an active family never hits the 90-day wall.
    const week6 = daysLater(42);
    const reissued = issueFamilyToken(FAMILY, MSISDN, week6, SECRET);
    assert.equal(verifyFamilyToken(reissued, SECRET, daysLater(120)).valid, true);
  });
});

describe('tampering', () => {
  test('rejects a token signed with another secret', () => {
    const forged = issueFamilyToken(FAMILY, MSISDN, NOW, 'otra-clave');
    assert.deepEqual(verifyFamilyToken(forged, SECRET, NOW), { valid: false, reason: 'bad_signature' });
  });

  test('rejects a payload edited to point at another family', () => {
    // The whole point: without this, guessing a family id would be enough to read its data.
    const token = issueFamilyToken(FAMILY, MSISDN, NOW, SECRET);
    const [body, signature] = token.split('.') as [string, string];
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    decoded['f'] = 'fam-de-otra-familia';
    const edited = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    assert.deepEqual(
      verifyFamilyToken(`${edited}.${signature}`, SECRET, NOW),
      { valid: false, reason: 'bad_signature' },
    );
  });

  test('rejects a payload edited to extend the expiry', () => {
    const token = issueFamilyToken(FAMILY, MSISDN, NOW, SECRET, 1);
    const [body, signature] = token.split('.') as [string, string];
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    decoded['e'] = 9_999_999_999;
    const edited = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    assert.equal(verifyFamilyToken(`${edited}.${signature}`, SECRET, NOW).valid, false);
  });

  test('rejects malformed tokens without throwing', () => {
    for (const bad of ['', '.', 'sinpunto', '.solofirma', 'solocuerpo.', 'a.b', 'x'.repeat(500)]) {
      const result = verifyFamilyToken(bad, SECRET, NOW);
      assert.equal(result.valid, false, `accepted ${JSON.stringify(bad)}`);
    }
  });

  test('rejects a correctly signed body that is not valid JSON', () => {
    const body = Buffer.from('no soy json', 'utf8').toString('base64url');
    const signature = createHmac('sha256', SECRET).update(body).digest('base64url');
    assert.deepEqual(
      verifyFamilyToken(`${body}.${signature}`, SECRET, NOW),
      { valid: false, reason: 'malformed' },
    );
  });

  test('rejects a correctly signed payload missing its fields', () => {
    for (const wire of [{}, { f: 'x' }, { f: 'x', c: 'y' }, { f: '', c: 'y', e: 1 }, { f: 'x', c: 'y', e: 'pronto' }]) {
      const body = Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
      const signature = createHmac('sha256', SECRET).update(body).digest('base64url');
      const result = verifyFamilyToken(`${body}.${signature}`, SECRET, NOW);
      assert.deepEqual(result, { valid: false, reason: 'malformed' }, `accepted ${JSON.stringify(wire)}`);
    }
  });
});
