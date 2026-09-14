import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLACEHOLDER_NOTICE, PLACEHOLDER_WEEKS } from '../../src/content/weeks.ts';

describe('placeholder content', () => {
  test('covers the eight weeks of the programme, numbered 1 to 8', () => {
    assert.equal(PLACEHOLDER_WEEKS.length, 8);
    assert.deepEqual(PLACEHOLDER_WEEKS.map((w) => w.week), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('every week is marked as pending real content', () => {
    // Nothing here may ever reach a family looking like finished programme content.
    for (const week of PLACEHOLDER_WEEKS) {
      assert.equal(week.isPlaceholder, true);
      assert.equal(week.todo, PLACEHOLDER_NOTICE);
      assert.match(week.todo, /Leer en Familia/);
    }
  });

  test('carries the four activity kinds the reading log records', () => {
    for (const week of PLACEHOLDER_WEEKS) {
      assert.deepEqual(
        week.activities.map((a) => a.kind),
        ['lectura', 'cancion', 'juego', 'conversacion'],
      );
    }
  });

  test('activity ids are unique across the whole programme', () => {
    const ids = PLACEHOLDER_WEEKS.flatMap((w) => w.activities.map((a) => a.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  test('no song is named and no media is linked', () => {
    // Song titles, lyrics and book text are copyrighted, and are Leer en Familia's to supply.
    for (const week of PLACEHOLDER_WEEKS) {
      for (const activity of week.activities) {
        assert.equal(activity.mediaUrl, null);
        assert.match(activity.title, /por definir/);
        assert.equal(activity.instructions, PLACEHOLDER_NOTICE);
      }
    }
  });
});
