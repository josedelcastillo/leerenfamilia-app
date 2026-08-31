import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addReply,
  closeFeedback,
  createFeedback,
  isAwaitingReply,
  type Feedback,
} from '../../src/domain/feedback.ts';
import { DomainError } from '../../src/domain/errors.ts';

const GESTOR = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER_GESTOR = 'a1b2c3d4-0000-4000-8000-000000000002';

function open(): Feedback {
  return createFeedback({
    id: 'fb-1',
    type: 'consulta',
    channel: 'whatsapp',
    text: '¿El bebé puede ver el libro tan cerca?',
    createdAt: '2026-09-15T10:00:00.000Z',
  });
}

describe('createFeedback', () => {
  test('starts open with no replies', () => {
    const feedback = open();
    assert.equal(feedback.status, 'abierto');
    assert.deepEqual(feedback.replies, []);
    assert.equal(feedback.closedAt, null);
    assert.equal(feedback.closedBy, null);
    assert.equal(isAwaitingReply(feedback), true);
  });

  test('keeps the channel it arrived through, for the unified inbox', () => {
    assert.equal(open().channel, 'whatsapp');
    assert.equal(createFeedback({ ...open(), channel: 'pwa' }).channel, 'pwa');
  });
});

describe('addReply', () => {
  test('moves an open feedback to respondido', () => {
    const replied = addReply(open(), { text: 'Sí, a unos 30 cm.', gestorSub: GESTOR, at: '2026-09-15T11:00:00.000Z' });
    assert.equal(replied.status, 'respondido');
    assert.equal(replied.replies.length, 1);
    assert.equal(isAwaitingReply(replied), false);
  });

  test('attributes every reply to the manager who wrote it', () => {
    const replied = addReply(open(), { text: 'Sí.', gestorSub: GESTOR, at: '2026-09-15T11:00:00.000Z' });
    assert.equal(replied.replies[0]?.gestorSub, GESTOR);
  });

  test('appends corrections instead of editing the original reply', () => {
    // A replied feedback is never edited: the family must see what it was actually told.
    const first = addReply(open(), { text: 'A 10 cm.', gestorSub: GESTOR, at: '2026-09-15T11:00:00.000Z' });
    const corrected = addReply(first, { text: 'Corrijo: a 30 cm.', gestorSub: OTHER_GESTOR, at: '2026-09-15T12:00:00.000Z' });

    assert.equal(corrected.replies.length, 2);
    assert.equal(corrected.replies[0]?.text, 'A 10 cm.');
    assert.equal(corrected.replies[1]?.text, 'Corrijo: a 30 cm.');
    assert.equal(corrected.replies[0]?.gestorSub, GESTOR);
    assert.equal(corrected.replies[1]?.gestorSub, OTHER_GESTOR);
    assert.equal(corrected.status, 'respondido');
  });

  test('does not mutate the feedback it was given', () => {
    const original = open();
    addReply(original, { text: 'Sí.', gestorSub: GESTOR, at: '2026-09-15T11:00:00.000Z' });
    assert.equal(original.status, 'abierto');
    assert.deepEqual(original.replies, []);
  });

  test('refuses to reply to a closed feedback', () => {
    const closed = closeFeedback(open(), '2026-09-16T09:00:00.000Z', GESTOR);
    assert.throws(
      () => addReply(closed, { text: 'Tarde.', gestorSub: GESTOR, at: '2026-09-16T10:00:00.000Z' }),
      (e: unknown) => e instanceof DomainError && e.code === 'invalid_transition',
    );
  });
});

describe('closeFeedback', () => {
  test('closes straight from abierto', () => {
    const closed = closeFeedback(open(), '2026-09-16T09:00:00.000Z', GESTOR);
    assert.equal(closed.status, 'cerrado');
    assert.equal(closed.closedBy, GESTOR);
    assert.equal(closed.closedAt, '2026-09-16T09:00:00.000Z');
  });

  test('closes from respondido and keeps the replies', () => {
    const replied = addReply(open(), { text: 'Sí.', gestorSub: GESTOR, at: '2026-09-15T11:00:00.000Z' });
    const closed = closeFeedback(replied, '2026-09-16T09:00:00.000Z', GESTOR);
    assert.equal(closed.status, 'cerrado');
    assert.equal(closed.replies.length, 1);
  });

  test('refuses to close twice', () => {
    const closed = closeFeedback(open(), '2026-09-16T09:00:00.000Z', GESTOR);
    assert.throws(
      () => closeFeedback(closed, '2026-09-17T09:00:00.000Z', OTHER_GESTOR),
      (e: unknown) => e instanceof DomainError && e.code === 'invalid_transition',
    );
  });
});

describe('isAwaitingReply', () => {
  test('only an open feedback counts as awaiting', () => {
    const feedback = open();
    assert.equal(isAwaitingReply(feedback), true);
    assert.equal(isAwaitingReply(addReply(feedback, { text: 'x', gestorSub: GESTOR, at: '2026-09-15T11:00:00.000Z' })), false);
    assert.equal(isAwaitingReply(closeFeedback(feedback, '2026-09-16T09:00:00.000Z', GESTOR)), false);
  });
});
