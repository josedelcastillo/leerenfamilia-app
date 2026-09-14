import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { SSMClient } from '@aws-sdk/client-ssm';
import { MissingParameterError, ParameterStore } from '../../src/adapters/ssm.ts';

function emptyClient(): SSMClient {
  return { async send() { return { Parameters: [] }; } } as unknown as SSMClient;
}

function failingClient(message: string): SSMClient {
  return {
    async send() {
      throw Object.assign(new Error(message), { name: 'AccessDeniedException' });
    },
  } as unknown as SSMClient;
}

describe('parámetro faltante', () => {
  test('es un error tipado, distinguible de un bug', async () => {
    // It is not a bug: it is a deployment missing a step, and the API has to be able to say so
    // instead of returning an opaque 500.
    const store = new ParameterStore({ prefix: '/nplp/piloto', client: emptyClient() });
    await assert.rejects(
      () => store.get(['APP_TOKEN_SECRET']),
      (error: unknown) => {
        assert.ok(error instanceof MissingParameterError);
        assert.deepEqual(error.names, ['APP_TOKEN_SECRET']);
        return true;
      },
    );
  });

  test('nombra todos los que faltan, no solo el primero', async () => {
    const store = new ParameterStore({ prefix: '/nplp/piloto', client: emptyClient() });
    await assert.rejects(
      () => store.get(['WA_APP_SECRET', 'WA_VERIFY_TOKEN']),
      (error: unknown) => {
        assert.ok(error instanceof MissingParameterError);
        assert.deepEqual([...error.names].sort(), ['WA_APP_SECRET', 'WA_VERIFY_TOKEN']);
        return true;
      },
    );
  });

  test('el mensaje lleva el prefijo, que es donde hay que crearlos', async () => {
    const store = new ParameterStore({ prefix: '/nplp/piloto', client: emptyClient() });
    await assert.rejects(() => store.get(['APP_TOKEN_SECRET']), /\/nplp\/piloto/);
  });

  test('un fallo de permisos no se disfraza de parámetro faltante', async () => {
    // Different cause, different fix: one is creating a parameter, the other is an IAM policy.
    const store = new ParameterStore({
      prefix: '/nplp/piloto',
      client: failingClient('User is not authorized to perform: ssm:GetParameters'),
    });
    await assert.rejects(
      () => store.get(['APP_TOKEN_SECRET']),
      (error: unknown) => {
        assert.equal(error instanceof MissingParameterError, false);
        assert.match(String((error as Error).message), /not authorized/);
        return true;
      },
    );
  });

  test('no filtra ningún valor en el mensaje', async () => {
    const store = new ParameterStore({ prefix: '/nplp/piloto', client: emptyClient() });
    try {
      await store.get(['APP_TOKEN_SECRET']);
      assert.fail('debía fallar');
    } catch (error) {
      // Only names, never values — the message ends up in CloudWatch.
      assert.equal(String((error as Error).message).includes('='), false);
    }
  });
});
