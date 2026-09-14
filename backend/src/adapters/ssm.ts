import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

/**
 * Reads SecureString parameters and keeps them in memory for the life of the execution
 * environment.
 *
 * CloudFormation cannot create SecureString parameters, so these are created out of band and this
 * is the only path by which a credential reaches the code. Nothing is ever read from a plaintext
 * Lambda environment variable.
 *
 * The cache expires: a warm container holding a rotated token for hours would be an outage that
 * looks like a Meta problem. SSM standard-throughput reads are free, so the refresh costs nothing.
 */
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * A parameter the stack needs is not in SSM, or the function cannot read it.
 *
 * Typed rather than a bare Error because it is not a bug: it is a deployment that is missing a
 * step, and it has to be distinguishable so the API can say so instead of returning an opaque 500.
 */
export class MissingParameterError extends Error {
  readonly names: readonly string[];

  constructor(prefix: string, names: readonly string[]) {
    super(`Faltan parámetros SecureString bajo ${prefix}: ${names.join(', ')}`);
    this.name = 'MissingParameterError';
    this.names = names;
  }
}

interface CacheEntry {
  readonly value: string;
  readonly fetchedAt: number;
}

export class ParameterStore {
  readonly #client: SSMClient;
  readonly #prefix: string;
  readonly #maxAgeMs: number;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #now: () => number;

  constructor(options: {
    prefix: string;
    client?: SSMClient;
    maxAgeMs?: number;
    now?: () => number;
  }) {
    this.#client = options.client ?? new SSMClient({});
    this.#prefix = options.prefix.replace(/\/$/, '');
    this.#maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.#now = options.now ?? Date.now;
  }

  /** Fetches every name in one call, skipping those already cached and still fresh. */
  async get<K extends string>(names: readonly K[]): Promise<Record<K, string>> {
    const now = this.#now();
    const stale = names.filter((name) => {
      const cached = this.#cache.get(name);
      return cached === undefined || now - cached.fetchedAt >= this.#maxAgeMs;
    });

    if (stale.length > 0) {
      const response = await this.#client.send(
        new GetParametersCommand({
          Names: stale.map((name) => `${this.#prefix}/${name}`),
          WithDecryption: true,
        }),
      );

      for (const parameter of response.Parameters ?? []) {
        const short = parameter.Name?.slice(this.#prefix.length + 1);
        if (short !== undefined && parameter.Value !== undefined) {
          this.#cache.set(short, { value: parameter.Value, fetchedAt: now });
        }
      }

      const missing = stale.filter((name) => !this.#cache.has(name));
      if (missing.length > 0) {
        // Fail loudly rather than carry on with an empty token.
        throw new MissingParameterError(this.#prefix, missing);
      }
    }

    const result = {} as Record<K, string>;
    for (const name of names) {
      result[name] = this.#cache.get(name)!.value;
    }
    return result;
  }
}

export const WA_PARAMETERS = [
  'WA_PHONE_NUMBER_ID',
  'WA_ACCESS_TOKEN',
  'WA_APP_SECRET',
  'WA_VERIFY_TOKEN',
] as const;
