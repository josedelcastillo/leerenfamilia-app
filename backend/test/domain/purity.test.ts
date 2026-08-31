import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DOMAIN_DIR = new URL('../../src/domain/', import.meta.url).pathname;

async function domainSources(): Promise<Array<{ name: string; source: string }>> {
  const names = (await readdir(DOMAIN_DIR)).filter((n) => n.endsWith('.ts'));
  return Promise.all(
    names.map(async (name) => ({ name, source: await readFile(join(DOMAIN_DIR, name), 'utf8') })),
  );
}

/**
 * These are the guarantees that let the domain layer be tested with no network and no credentials,
 * and that keep the pilot's indicators reproducible. A future change that quietly imports the AWS
 * SDK here should fail the build, not be caught in review.
 */
describe('domain purity', () => {
  test('there is something to check', async () => {
    const sources = await domainSources();
    assert.ok(sources.length >= 7, `expected the domain modules, found ${sources.length}`);
  });

  test('nothing imports the AWS SDK', async () => {
    for (const { name, source } of await domainSources()) {
      assert.ok(!/@aws-sdk|aws-lambda|aws-cdk/.test(source), `${name} imports an AWS package`);
    }
  });

  test('nothing imports from adapters, handlers or shared', async () => {
    for (const { name, source } of await domainSources()) {
      assert.ok(
        !/from\s+['"][^'"]*(adapters|handlers|shared)\//.test(source),
        `${name} imports from an outer layer`,
      );
    }
  });

  test('nothing reads the clock or the environment', async () => {
    // Time and configuration are arguments, never ambient state: that is what makes the schedule
    // reproducible and the tests deterministic.
    for (const { name, source } of await domainSources()) {
      assert.ok(!/Date\.now\(\)/.test(source), `${name} calls Date.now()`);
      assert.ok(!/new Date\(\)/.test(source), `${name} constructs an empty Date`);
      assert.ok(!/process\.env/.test(source), `${name} reads process.env`);
      assert.ok(!/Math\.random\(\)/.test(source), `${name} calls Math.random()`);
    }
  });

  test('nothing performs I/O', async () => {
    for (const { name, source } of await domainSources()) {
      assert.ok(!/\bfetch\s*\(|node:fs|node:http|require\(/.test(source), `${name} performs I/O`);
    }
  });
});
