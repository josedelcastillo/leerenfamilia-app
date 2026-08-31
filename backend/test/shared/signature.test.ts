import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  rawBody,
  signMetaBody,
  verifyMetaSignature,
  verifyTokenMatches,
} from '../../src/shared/signature.ts';

const SECRET = 'app-secret-de-prueba';
const BODY = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), 'utf8');

describe('verifyMetaSignature', () => {
  test('accepts a signature Meta would have produced', () => {
    assert.equal(verifyMetaSignature(BODY, signMetaBody(BODY, SECRET), SECRET), true);
  });

  test('rejects a signature made with a different secret', () => {
    assert.equal(verifyMetaSignature(BODY, signMetaBody(BODY, 'otro-secreto'), SECRET), false);
  });

  test('rejects when the body changed by a single byte', () => {
    const signature = signMetaBody(BODY, SECRET);
    const tampered = Buffer.from(BODY.toString('utf8').replace('entry', 'entrY'), 'utf8');
    assert.equal(verifyMetaSignature(tampered, signature, SECRET), false);
  });

  test('rejects a missing header', () => {
    assert.equal(verifyMetaSignature(BODY, undefined, SECRET), false);
  });

  test('rejects a header without the sha256= prefix', () => {
    const bare = createHmac('sha256', SECRET).update(BODY).digest('hex');
    assert.equal(verifyMetaSignature(BODY, bare, SECRET), false);
    assert.equal(verifyMetaSignature(BODY, `sha1=${bare}`, SECRET), false);
  });

  test('rejects malformed hex instead of letting Buffer truncate it', () => {
    // Buffer.from('zz', 'hex') yields an empty buffer; without an explicit check a garbage
    // signature could compare equal to another garbage signature.
    for (const bad of ['sha256=', 'sha256=zzzz', 'sha256=abc', 'sha256=' + 'ab'.repeat(31)]) {
      assert.equal(verifyMetaSignature(BODY, bad, SECRET), false, `accepted ${bad}`);
    }
  });

  test('rejects a truncated but otherwise valid signature', () => {
    const signature = signMetaBody(BODY, SECRET);
    assert.equal(verifyMetaSignature(BODY, signature.slice(0, -2), SECRET), false);
  });

  test('is computed over raw bytes, not over re-serialised JSON', () => {
    // Meta signs the bytes it sent. Re-stringifying the parsed object reorders keys and drops
    // whitespace, and the signature stops matching for reasons that look like a bad credential.
    const original = Buffer.from('{"b":1,  "a":2}', 'utf8');
    const signature = signMetaBody(original, SECRET);
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(original.toString())), 'utf8');

    assert.equal(verifyMetaSignature(original, signature, SECRET), true);
    assert.equal(verifyMetaSignature(reserialized, signature, SECRET), false);
  });

  test('handles a body with non-ASCII characters', () => {
    const spanish = Buffer.from(JSON.stringify({ text: '¿Cómo está el bebé? ñ' }), 'utf8');
    assert.equal(verifyMetaSignature(spanish, signMetaBody(spanish, SECRET), SECRET), true);
  });
});

describe('rawBody', () => {
  test('decodes a base64 body exactly', () => {
    const original = '{"a":"ñ"}';
    const encoded = Buffer.from(original, 'utf8').toString('base64');
    assert.equal(rawBody(encoded, true).toString('utf8'), original);
  });

  test('passes a plain body through unchanged', () => {
    assert.equal(rawBody('{"a":1}', false).toString('utf8'), '{"a":1}');
  });

  test('a base64 body still verifies against the signature of its decoded bytes', () => {
    const signature = signMetaBody(BODY, SECRET);
    const encoded = BODY.toString('base64');
    assert.equal(verifyMetaSignature(rawBody(encoded, true), signature, SECRET), true);
  });

  test('an absent body is empty, not a crash', () => {
    assert.equal(rawBody(undefined, false).length, 0);
  });
});

describe('verifyTokenMatches', () => {
  test('accepts the exact token', () => {
    assert.equal(verifyTokenMatches('token-secreto', 'token-secreto'), true);
  });

  test('rejects a wrong, absent, shorter or longer token', () => {
    assert.equal(verifyTokenMatches('otro', 'token-secreto'), false);
    assert.equal(verifyTokenMatches(undefined, 'token-secreto'), false);
    assert.equal(verifyTokenMatches('token-secret', 'token-secreto'), false);
    assert.equal(verifyTokenMatches('token-secretoo', 'token-secreto'), false);
    assert.equal(verifyTokenMatches('', 'token-secreto'), false);
  });
});
