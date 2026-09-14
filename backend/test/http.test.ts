import { test } from 'node:test';
import assert from 'node:assert/strict';
import { json, notImplemented } from '../src/shared/http.ts';
import { optionalEnv, requireEnv } from '../src/shared/env.ts';

test('json sets a UTF-8 JSON content type', () => {
  const res = json(200, { ok: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers?.['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.body, '{"ok":true}');
});

test('notImplemented reports the service and the phase that will implement it', () => {
  const res = notImplemented('fn-content', 5);
  assert.equal(res.statusCode, 501);
  assert.deepEqual(JSON.parse(res.body as string), {
    error: 'not_implemented',
    service: 'fn-content',
    plannedPhase: 5,
  });
});

test('requireEnv throws when the variable is absent or empty', () => {
  delete process.env['NPLP_ABSENT'];
  assert.throws(() => requireEnv('NPLP_ABSENT'), /NPLP_ABSENT/);
  process.env['NPLP_EMPTY'] = '';
  assert.throws(() => requireEnv('NPLP_EMPTY'), /NPLP_EMPTY/);
});

test('optionalEnv falls back when unset or empty', () => {
  delete process.env['NPLP_ABSENT'];
  assert.equal(optionalEnv('NPLP_ABSENT', 'mock'), 'mock');
  process.env['NPLP_SET'] = 'meta';
  assert.equal(optionalEnv('NPLP_SET', 'mock'), 'meta');
});
