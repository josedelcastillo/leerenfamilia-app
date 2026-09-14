import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_WINDOW_MS,
  chooseReplyChannel,
  isServiceWindowOpen,
  recordInbound,
  serviceWindowExpiresAt,
} from '../../src/domain/service-window.ts';

const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('isServiceWindowOpen', () => {
  test('is closed when the family has never written', () => {
    assert.equal(isServiceWindowOpen(null, NOW), false);
  });

  test('is open immediately after an inbound message', () => {
    assert.equal(isServiceWindowOpen(NOW, NOW), true);
  });

  test('is open at 23h59m', () => {
    assert.equal(isServiceWindowOpen(NOW - (SERVICE_WINDOW_MS - 60_000), NOW), true);
  });

  test('is closed at exactly 24h', () => {
    // At the boundary we pay for a template rather than risk a message Meta refuses to deliver.
    assert.equal(isServiceWindowOpen(NOW - SERVICE_WINDOW_MS, NOW), false);
  });

  test('is closed past 24h', () => {
    assert.equal(isServiceWindowOpen(NOW - SERVICE_WINDOW_MS - 1, NOW), false);
    assert.equal(isServiceWindowOpen(NOW - 72 * HOUR, NOW), false);
  });

  test('treats a future inbound timestamp as closed rather than open forever', () => {
    // Clock skew between Meta and us must not hand out an unbounded free-message window.
    assert.equal(isServiceWindowOpen(NOW + HOUR, NOW), false);
  });
});

describe('serviceWindowExpiresAt', () => {
  test('is exactly 24 hours after the last inbound', () => {
    assert.equal(serviceWindowExpiresAt(NOW), NOW + SERVICE_WINDOW_MS);
  });
});

describe('recordInbound', () => {
  test('every inbound resets the window, whatever the message said', () => {
    const first = NOW;
    const later = NOW + 20 * HOUR;
    assert.equal(recordInbound(later), later);
    // Twenty hours in, a new message buys another full day.
    assert.equal(isServiceWindowOpen(first, later + 5 * HOUR), false);
    assert.equal(isServiceWindowOpen(recordInbound(later), later + 5 * HOUR), true);
  });
});

describe('chooseReplyChannel', () => {
  test('free text while the window is open', () => {
    assert.equal(chooseReplyChannel(NOW - HOUR, NOW), 'mensaje_libre');
  });

  test('a template once it has closed', () => {
    assert.equal(chooseReplyChannel(NOW - 25 * HOUR, NOW), 'plantilla');
  });

  test('a template when the family has never written', () => {
    assert.equal(chooseReplyChannel(null, NOW), 'plantilla');
  });
});
