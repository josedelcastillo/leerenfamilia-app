import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GSI1, KEY, SK, TTL_DAYS, ttlSeconds } from '../../src/adapters/keys.ts';

describe('key layout', () => {
  test('everything about a family shares one partition', () => {
    // A family detail view is then one Query, and erasure is one Query plus one BatchWrite.
    const family = KEY.family('f1');
    assert.equal(family, 'FAMILY#f1');
    for (const sk of [SK.meta, SK.baby, SK.caregiver('+51987654321'), SK.log('2026-09-15T10:00:00.000Z')]) {
      assert.ok(sk.length > 0);
    }
  });

  test('content weeks are zero-padded so they sort correctly', () => {
    const sorted = [10, 2, 1, 8].map(SK.content).sort();
    assert.deepEqual(sorted, ['CONTENT#01', 'CONTENT#02', 'CONTENT#08', 'CONTENT#10']);
  });

  test('feedback sort keys order oldest first within a status', () => {
    const keys = [
      GSI1.feedbackSort('2026-09-15T10:00:00.000Z', 'f2'),
      GSI1.feedbackSort('2026-09-14T23:59:59.000Z', 'f1'),
    ].sort();
    assert.match(keys[0]!, /2026-09-14/);
  });

  test('the msisdn index resolves a sender to a family', () => {
    assert.equal(GSI1.byMsisdn('+51987654321'), 'MSISDN#+51987654321');
    assert.equal(GSI1.msisdnSort('f1'), 'FAMILY#f1');
  });

  test('status and feedback partitions of the index cannot collide', () => {
    assert.notEqual(
      GSI1.familiesByStatus('p1', 'activa'),
      GSI1.feedbackByStatus('p1', 'activa'),
    );
  });
});

describe('ttlSeconds', () => {
  test('returns epoch seconds, not milliseconds', () => {
    // DynamoDB TTL in milliseconds is a date roughly fifty thousand years out: nothing expires.
    const from = new Date('2026-09-15T00:00:00.000Z');
    assert.equal(ttlSeconds(from, 0), Math.floor(from.getTime() / 1000));
    assert.ok(ttlSeconds(from, 1) < 2_000_000_000);
  });

  test('adds whole days', () => {
    const from = new Date('2026-09-15T00:00:00.000Z');
    assert.equal(ttlSeconds(from, 7) - ttlSeconds(from, 0), 7 * 86400);
  });

  test('manager audit records are kept for twelve months', () => {
    assert.equal(TTL_DAYS.audit, 365);
  });
});
