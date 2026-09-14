import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { SSMClient } from '@aws-sdk/client-ssm';
import { ParameterStore } from '../../src/adapters/ssm.ts';

interface Call {
  names: string[];
  withDecryption: boolean | undefined;
}

function fakeClient(values: Record<string, string>, calls: Call[] = []): SSMClient {
  return {
    async send(command: { input: { Names?: string[]; WithDecryption?: boolean } }) {
      const names = command.input.Names ?? [];
      calls.push({ names, withDecryption: command.input.WithDecryption });
      return {
        Parameters: names
          .filter((name) => values[name] !== undefined)
          .map((name) => ({ Name: name, Value: values[name] })),
      };
    },
  } as unknown as SSMClient;
}

const PREFIX = '/nplp/piloto';

describe('ParameterStore', () => {
  test('reads parameters under the stack prefix, decrypted', async () => {
    const calls: Call[] = [];
    const store = new ParameterStore({
      prefix: PREFIX,
      client: fakeClient({ [`${PREFIX}/WA_ACCESS_TOKEN`]: 'secreto' }, calls),
    });

    const result = await store.get(['WA_ACCESS_TOKEN']);
    assert.deepEqual(result, { WA_ACCESS_TOKEN: 'secreto' });
    assert.deepEqual(calls[0]?.names, [`${PREFIX}/WA_ACCESS_TOKEN`]);
    assert.equal(calls[0]?.withDecryption, true);
  });

  test('tolerates a prefix with a trailing slash', async () => {
    const calls: Call[] = [];
    const store = new ParameterStore({
      prefix: `${PREFIX}/`,
      client: fakeClient({ [`${PREFIX}/A`]: '1' }, calls),
    });
    await store.get(['A']);
    assert.deepEqual(calls[0]?.names, [`${PREFIX}/A`]);
  });

  test('fetches several parameters in one call', async () => {
    const calls: Call[] = [];
    const store = new ParameterStore({
      prefix: PREFIX,
      client: fakeClient({ [`${PREFIX}/A`]: '1', [`${PREFIX}/B`]: '2' }, calls),
    });
    assert.deepEqual(await store.get(['A', 'B']), { A: '1', B: '2' });
    assert.equal(calls.length, 1);
  });

  test('caches, so a warm invocation does not call SSM again', async () => {
    const calls: Call[] = [];
    const store = new ParameterStore({
      prefix: PREFIX,
      client: fakeClient({ [`${PREFIX}/A`]: '1' }, calls),
    });
    await store.get(['A']);
    await store.get(['A']);
    assert.equal(calls.length, 1);
  });

  test('refetches once the cache expires, so a rotated token is picked up', async () => {
    // A warm container holding a revoked token for hours is an outage that looks like a Meta fault.
    const calls: Call[] = [];
    let clock = 1000;
    const store = new ParameterStore({
      prefix: PREFIX,
      client: fakeClient({ [`${PREFIX}/A`]: '1' }, calls),
      maxAgeMs: 60_000,
      now: () => clock,
    });

    await store.get(['A']);
    clock += 59_000;
    await store.get(['A']);
    assert.equal(calls.length, 1, 'still fresh');

    clock += 2_000;
    await store.get(['A']);
    assert.equal(calls.length, 2, 'expired, refetched');
  });

  test('only refetches the parameters that went stale', async () => {
    const calls: Call[] = [];
    let clock = 0;
    const store = new ParameterStore({
      prefix: PREFIX,
      client: fakeClient({ [`${PREFIX}/A`]: '1', [`${PREFIX}/B`]: '2' }, calls),
      maxAgeMs: 100,
      now: () => clock,
    });

    await store.get(['A']);
    clock = 50;
    await store.get(['B']);
    clock = 120; // A is stale, B is not
    await store.get(['A', 'B']);
    assert.deepEqual(calls[2]?.names, [`${PREFIX}/A`]);
  });

  test('fails loudly when a parameter is missing rather than sending an empty token', async () => {
    const store = new ParameterStore({ prefix: PREFIX, client: fakeClient({}) });
    await assert.rejects(() => store.get(['WA_ACCESS_TOKEN']), /WA_ACCESS_TOKEN/);
  });
});
