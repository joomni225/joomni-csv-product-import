import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, readTable, toCsv } from '../src/csv.js';

test('quotes, escaped quotes, commas and line breaks inside a field', () => {
  const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2']]);
});

test('the Excel BOM and blank lines are ignored', () => {
  assert.deepEqual(parseCsv('﻿a,b\n\n1,2\n\n'), [['a', 'b'], ['1', '2']]);
});

test('an unclosed quote is an error, not silent data loss', () => {
  assert.throws(() => parseCsv('a\n"oops'), /closing "/);
});

test('readTable keys cells by header and keeps the spreadsheet line number', () => {
  const t = readTable('title,price\nTee,100\nCap,50');
  assert.deepEqual(t.rows[1], { _line: 3, title: 'Cap', price: '50' });
});

test('toCsv round-trips', () => {
  const rows = [['a', 'b'], ['x, "y"', 'z\nw']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});
