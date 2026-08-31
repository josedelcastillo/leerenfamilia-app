import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';
const HEX_PATTERN = /^[0-9a-f]+$/i;

/**
 * Validates Meta's `X-Hub-Signature-256`: HMAC-SHA256 of the raw request body, keyed with the app
 * secret.
 *
 * Two things matter here and both are easy to get wrong:
 *
 * 1. The HMAC is over the **raw bytes Meta sent**, not over a re-serialised object. Parsing the
 *    JSON and stringifying it back changes key order and whitespace, and the signature stops
 *    matching for reasons that look like a credential problem.
 * 2. The comparison is timing-safe. A byte-by-byte early return leaks how much of a forged
 *    signature was correct, which is enough to forge one given enough attempts.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (signatureHeader === undefined || !signatureHeader.startsWith(PREFIX)) {
    return false;
  }
  const provided = signatureHeader.slice(PREFIX.length);
  // Buffer.from(…, 'hex') truncates silently on malformed input, so reject it up front.
  if (provided.length === 0 || provided.length % 2 !== 0 || !HEX_PATTERN.test(provided)) {
    return false;
  }

  const providedBytes = Buffer.from(provided, 'hex');
  const expectedBytes = createHmac('sha256', appSecret).update(rawBody).digest();
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

/** Only used by tests and by the mock provider; the real signature always comes from Meta. */
export function signMetaBody(rawBody: Buffer, appSecret: string): string {
  return PREFIX + createHmac('sha256', appSecret).update(rawBody).digest('hex');
}

/**
 * The body exactly as it arrived. API Gateway base64-encodes it whenever it decides the payload is
 * binary, and a webhook that works in testing and fails in production usually failed right here.
 */
export function rawBody(body: string | undefined, isBase64Encoded: boolean): Buffer {
  if (body === undefined) {
    return Buffer.alloc(0);
  }
  return Buffer.from(body, isBase64Encoded ? 'base64' : 'utf8');
}

/**
 * Compares the `hub.verify_token` of the subscription handshake without leaking its length or
 * prefix through timing.
 */
export function verifyTokenMatches(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
