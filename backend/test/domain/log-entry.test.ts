import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate } from '../../src/domain/dates.ts';
import { DomainError } from '../../src/domain/errors.ts';
import {
  LOG_ACTIVITY_KINDS,
  MAX_MINUTES,
  MAX_NOTE_LENGTH,
  MIN_MINUTES,
  parseLogEntry,
  summarize,
  type LogEntry,
  type LogEntryInput,
} from '../../src/domain/log-entry.ts';

const TODAY = isoDate('2026-09-20');

function input(overrides: Partial<LogEntryInput> = {}): LogEntryInput {
  return {
    clientId: '9f1b0a54-0000-4000-8000-000000000001',
    date: '2026-09-19',
    kind: 'lectura',
    minutes: 10,
    loggedBy: 'principal',
    ...overrides,
  };
}

describe('parseLogEntry', () => {
  test('accepts a well-formed entry', () => {
    const entry = parseLogEntry(input(), TODAY);
    assert.equal(entry.kind, 'lectura');
    assert.equal(entry.minutes, 10);
    assert.equal(entry.date, '2026-09-19');
    assert.equal(entry.loggedBy, 'principal');
  });

  test('accepts every activity kind the programme uses', () => {
    for (const kind of LOG_ACTIVITY_KINDS) {
      assert.equal(parseLogEntry(input({ kind }), TODAY).kind, kind);
    }
  });

  test('records who logged it, so mother and father can be told apart', () => {
    assert.equal(parseLogEntry(input({ loggedBy: 'secundario' }), TODAY).loggedBy, 'secundario');
  });

  test('accepts an entry from today and from days back', () => {
    // The offline queue can flush days late; a backdated entry is normal, not suspicious.
    assert.equal(parseLogEntry(input({ date: '2026-09-20' }), TODAY).date, '2026-09-20');
    assert.equal(parseLogEntry(input({ date: '2026-09-01' }), TODAY).date, '2026-09-01');
  });

  test('rejects a date in the future', () => {
    assert.throws(
      () => parseLogEntry(input({ date: '2026-09-21' }), TODAY),
      (e: unknown) => e instanceof DomainError && e.code === 'invalid_log_entry',
    );
  });

  test('rejects an unknown activity kind', () => {
    for (const kind of ['baile', 'LECTURA', '', 'lectura ']) {
      assert.throws(() => parseLogEntry(input({ kind }), TODAY), DomainError, `accepted ${kind}`);
    }
  });

  test('rejects durations outside a single session', () => {
    assert.equal(parseLogEntry(input({ minutes: MIN_MINUTES }), TODAY).minutes, MIN_MINUTES);
    assert.equal(parseLogEntry(input({ minutes: MAX_MINUTES }), TODAY).minutes, MAX_MINUTES);
    for (const minutes of [0, -5, MAX_MINUTES + 1, 1440]) {
      assert.throws(() => parseLogEntry(input({ minutes }), TODAY), DomainError, `accepted ${minutes}`);
    }
  });

  test('rejects a non-integer duration rather than rounding it', () => {
    // A silently corrected duration would corrupt the indicator it feeds and nobody would notice.
    assert.throws(() => parseLogEntry(input({ minutes: 10.5 }), TODAY), DomainError);
    assert.throws(() => parseLogEntry(input({ minutes: Number.NaN }), TODAY), DomainError);
  });

  test('requires the client-generated id that makes replay safe', () => {
    assert.throws(() => parseLogEntry(input({ clientId: '' }), TODAY), DomainError);
    assert.throws(() => parseLogEntry(input({ clientId: '   ' }), TODAY), DomainError);
  });

  test('requires a valid loggedBy', () => {
    assert.throws(() => parseLogEntry(input({ loggedBy: 'abuela' }), TODAY), DomainError);
  });

  test('normalises an empty or whitespace note to null', () => {
    assert.equal(parseLogEntry(input({ note: '   ' }), TODAY).note, null);
    assert.equal(parseLogEntry(input({ note: null }), TODAY).note, null);
    assert.equal(parseLogEntry(input({ note: '  le gustó  ' }), TODAY).note, 'le gustó');
  });

  test('rejects a note longer than the limit', () => {
    assert.doesNotThrow(() => parseLogEntry(input({ note: 'a'.repeat(MAX_NOTE_LENGTH) }), TODAY));
    assert.throws(() => parseLogEntry(input({ note: 'a'.repeat(MAX_NOTE_LENGTH + 1) }), TODAY), DomainError);
  });

  test('normalises an empty resourceId to null', () => {
    assert.equal(parseLogEntry(input({ resourceId: '' }), TODAY).resourceId, null);
    assert.equal(parseLogEntry(input({ resourceId: 's01-lectura' }), TODAY).resourceId, 's01-lectura');
  });
});

describe('summarize', () => {
  function entry(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
      clientId: 'c1', date: isoDate('2026-09-19'), kind: 'lectura',
      minutes: 10, resourceId: null, note: null, loggedBy: 'principal',
      ...overrides,
    };
  }

  test('is empty for no entries', () => {
    assert.deepEqual(summarize([]), {
      entries: 0,
      totalMinutes: 0,
      byKind: { lectura: 0, cancion: 0, juego: 0, conversacion: 0 },
      distinctDays: 0,
    });
  });

  test('adds minutes and counts entries per kind', () => {
    const summary = summarize([
      entry({ kind: 'lectura', minutes: 10 }),
      entry({ kind: 'lectura', minutes: 5 }),
      entry({ kind: 'cancion', minutes: 3 }),
    ]);
    assert.equal(summary.entries, 3);
    assert.equal(summary.totalMinutes, 18);
    assert.equal(summary.byKind.lectura, 2);
    assert.equal(summary.byKind.cancion, 1);
    assert.equal(summary.byKind.juego, 0);
  });

  test('counts distinct days, which is the adherence measure', () => {
    // Three entries on one day is not the same adherence as one entry on three days.
    const sameDay = summarize([entry(), entry(), entry()]);
    assert.equal(sameDay.distinctDays, 1);

    const spread = summarize([
      entry({ date: isoDate('2026-09-17') }),
      entry({ date: isoDate('2026-09-18') }),
      entry({ date: isoDate('2026-09-19') }),
    ]);
    assert.equal(spread.distinctDays, 3);
  });

  test('carries no free text, so an aggregate can be shown without consent to notes', () => {
    const summary = summarize([entry({ note: 'la rutina de la casa' })]);
    assert.equal(JSON.stringify(summary).includes('rutina'), false);
  });
});
