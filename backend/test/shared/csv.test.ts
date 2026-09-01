import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOM, escapeCell, toCsv } from '../../src/shared/csv.ts';

describe('escapeCell', () => {
  test('leaves ordinary values alone', () => {
    assert.equal(escapeCell('Mateo'), 'Mateo');
    assert.equal(escapeCell(42), '42');
    assert.equal(escapeCell(true), 'true');
  });

  test('renders null and undefined as empty, not as the words', () => {
    assert.equal(escapeCell(null), '');
    assert.equal(escapeCell(undefined), '');
  });

  test('quotes and doubles embedded quotes', () => {
    assert.equal(escapeCell('dijo "hola"'), '"dijo ""hola"""');
  });

  test('quotes values containing commas, semicolons or newlines', () => {
    assert.equal(escapeCell('leímos, cantamos'), '"leímos, cantamos"');
    assert.equal(escapeCell('a;b'), '"a;b"');
    assert.equal(escapeCell('linea1\nlinea2'), '"linea1\nlinea2"');
    assert.equal(escapeCell('linea1\r\nlinea2'), '"linea1\r\nlinea2"');
  });

  test('neutralises formulas a caregiver could type into a note', () => {
    // Excel executes a cell starting with these. A log note is free text written by a stranger.
    for (const payload of [
      '=HYPERLINK("http://malo.pe","clic")',
      '+1+1',
      '-2+3',
      '@SUM(A1:A9)',
      '=cmd|\' /c calc\'!A1',
    ]) {
      const escaped = escapeCell(payload);
      const unquoted = escaped.startsWith('"') ? escaped.slice(1, -1).replace(/""/g, '"') : escaped;
      assert.equal(unquoted.startsWith("'"), true, `no se neutralizó: ${payload}`);
    }
  });

  test('does not mangle a value that merely contains an equals sign', () => {
    assert.equal(escapeCell('peso=4kg'), 'peso=4kg');
  });

  test('quotes a neutralised formula that also contains a comma', () => {
    const escaped = escapeCell('=A1,B2');
    assert.equal(escaped, `"'=A1,B2"`);
  });
});

describe('toCsv', () => {
  interface Row { name: string; minutes: number }
  const columns = [
    { header: 'nombre', value: (row: Row) => row.name },
    { header: 'minutos', value: (row: Row) => row.minutes },
  ];

  test('writes a header and one line per row', () => {
    const csv = toCsv(columns, [{ name: 'a', minutes: 1 }, { name: 'b', minutes: 2 }]);
    assert.equal(csv, `${BOM}nombre,minutos\r\na,1\r\nb,2\r\n`);
  });

  test('starts with a BOM so accents survive Excel on Windows', () => {
    // Without it "canción" opens as "cancin" or worse, and every export looks broken.
    const csv = toCsv([{ header: 'actividad', value: () => 'canción' }], [{ name: '', minutes: 0 }]);
    assert.equal(csv.startsWith(BOM), true);
    assert.match(csv, /canción/);
  });

  test('uses CRLF, per RFC 4180', () => {
    const csv = toCsv(columns, [{ name: 'a', minutes: 1 }]);
    assert.equal(csv.includes('\r\n'), true);
    assert.equal(/[^\r]\n/.test(csv), false);
  });

  test('writes only a header when there are no rows', () => {
    assert.equal(toCsv(columns, []), `${BOM}nombre,minutos\r\n`);
  });

  test('keeps columns aligned when a value contains the separator', () => {
    const csv = toCsv(columns, [{ name: 'leímos, cantamos', minutes: 5 }]);
    assert.equal(csv, `${BOM}nombre,minutos\r\n"leímos, cantamos",5\r\n`);
  });
});
