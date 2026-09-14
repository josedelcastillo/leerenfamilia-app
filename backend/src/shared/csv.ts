/**
 * CSV writer for the pilot's exports.
 *
 * The output is opened in Excel by an evaluator, which drives two decisions that a naive
 * `values.join(',')` gets wrong:
 *
 * 1. **Formula injection.** A caregiver can type `=HYPERLINK("http://…")` into a log note. Excel
 *    executes a cell that starts with `=`, `+`, `-`, `@`, tab or CR — so those cells are prefixed
 *    with an apostrophe. Without this, exporting the pilot's data would hand an attacker a way to
 *    run something on the evaluator's machine.
 * 2. **Encoding.** A UTF-8 file with no BOM opens as mojibake in Excel on Windows — "Mateo" is
 *    fine, "canción" is not. The BOM is what makes accents survive the trip.
 */
export const BOM = '﻿';

const NEEDS_QUOTING = /[",\r\n;]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);

  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface CsvColumn<T> {
  readonly header: string;
  readonly value: (row: T) => unknown;
}

/**
 * RFC 4180 line endings (CRLF) and a BOM, because the consumer is Excel and not a Unix pipe.
 */
export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((column) => escapeCell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}
