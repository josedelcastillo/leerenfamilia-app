import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { issueFamilyToken } from '../../src/shared/family-token.ts';
import { authenticateFamily } from '../../src/shared/family-auth.ts';

const SECRET = 'clave';
const NOW = new Date('2026-09-15T12:00:00.000Z');
const TOKEN = issueFamilyToken('fam-1', '+51987654321', NOW, SECRET);

describe('authenticateFamily', () => {
  test('accepts a bearer token', () => {
    const auth = authenticateFamily({ authorization: `Bearer ${TOKEN}` }, {}, SECRET, NOW);
    assert.equal(auth.ok, true);
    assert.equal(auth.ok && auth.principal.familyId, 'fam-1');
    assert.equal(auth.ok && auth.principal.msisdn, '+51987654321');
  });

  test('accepts the query parameter, which is how the WhatsApp link arrives', () => {
    const auth = authenticateFamily({}, { t: TOKEN }, SECRET, NOW);
    assert.equal(auth.ok, true);
  });

  test('prefers the header when both are present', () => {
    const other = issueFamilyToken('fam-2', '+51912345678', NOW, SECRET);
    const auth = authenticateFamily({ authorization: `Bearer ${TOKEN}` }, { t: other }, SECRET, NOW);
    assert.equal(auth.ok && auth.principal.familyId, 'fam-1');
  });

  test('is case-tolerant about the header name', () => {
    assert.equal(authenticateFamily({ Authorization: `Bearer ${TOKEN}` }, {}, SECRET, NOW).ok, true);
  });

  test('rejects a missing token', () => {
    assert.deepEqual(authenticateFamily({}, {}, SECRET, NOW), { ok: false, status: 401, reason: 'missing' });
    assert.deepEqual(authenticateFamily({ authorization: 'Bearer ' }, {}, SECRET, NOW), { ok: false, status: 401, reason: 'missing' });
  });

  test('rejects a header that is not a bearer token', () => {
    assert.equal(authenticateFamily({ authorization: TOKEN }, {}, SECRET, NOW).ok, false);
    assert.equal(authenticateFamily({ authorization: `Basic ${TOKEN}` }, {}, SECRET, NOW).ok, false);
  });

  test('distinguishes an expired token from a forged one', () => {
    // Expired means reissue on the next weekly send; bad signature means reject outright.
    const later = new Date(NOW.getTime() + 100 * 24 * 60 * 60 * 1000);
    assert.equal(authenticateFamily({}, { t: TOKEN }, SECRET, later).ok, false);
    const auth = authenticateFamily({}, { t: TOKEN }, SECRET, later);
    assert.equal(!auth.ok && auth.reason, 'expired');

    const forged = authenticateFamily({}, { t: issueFamilyToken('fam-1', 'x', NOW, 'otra') }, SECRET, NOW);
    assert.equal(!forged.ok && forged.reason, 'bad_signature');
  });
});
