import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { text, normalize, cents, csvRows, csvTable, columnIndexes, digest } from '../src/accounting/csv-utils.js';
import { ValidationError } from '../src/accounting/errors.js';
assert.equal(text(null), '');
assert.equal(text(0), '0');
assert.equal(text(false), 'false');
assert.equal(normalize('  Bank_Amount ($) '), 'bank amount');
for (const [value, expected] of [
  ['$1,234.56', 123456],
  ['-12.34', -1234],
  ['0', 0],
  [' 12.3 ', 1230],
  [12, 1200],
])
  assert.equal(cents(value), expected);
for (const value of ['', null, '1.234', '.50', '1e2', '(12.00)', 'NaN'])
  assert.throws(() => cents(value), ValidationError);
assert.throws(() => cents('invalid', 'Amount'), /Amount is invalid/);
assert.deepEqual(csvRows('a,b\r\n1,2\n3,4\r5,6'), [
  ['a', 'b'],
  ['1', '2'],
  ['3', '4'],
  ['5', '6'],
]);
assert.deepEqual(csvRows('a,b\n"comma,quote" ,"he said ""yes"""\n"line\nbreak",x'), [
  ['a', 'b'],
  ['comma,quote ', 'he said "yes"'],
  ['line\nbreak', 'x'],
]);
assert.deepEqual(csvRows('\n,\n"",\r\na,\n'), [['a', '']]);
assert.deepEqual(csvRows('a\tb\n1\t2', '\t'), [
  ['a', 'b'],
  ['1', '2'],
]);
assert.deepEqual(csvRows('a;b\n1;2', ';'), [
  ['a', 'b'],
  ['1', '2'],
]);
for (const value of [null, undefined, '']) assert.deepEqual(csvRows(value), []);
assert.throws(() => csvRows('a\n"open'), ValidationError);
const csv = ' Date ,Bank Amount\n2030-01-01,12.34';
const table = csvTable({ filename: 'IMPORT.CSV', csv });
assert.deepEqual(table, {
  headers: [' Date ', 'Bank Amount'],
  normalizedHeaders: ['date', 'bank amount'],
  rows: [['2030-01-01', '12.34']],
});
assert.deepEqual(
  columnIndexes(
    table.normalizedHeaders,
    { amount: ' BANK_AMOUNT ', date: '' },
    { amount: 'Amount', date: 'Date', missing: 'Absent' }
  ),
  { amount: 1, date: 0, missing: -1 }
);
assert.deepEqual(columnIndexes(['date'], null, { date: 'Date' }), { date: 0 });
assert.deepEqual(csvTable({ filename: 'x.csv', csv: 'a\n1\n2', maxRows: 2 }).rows, [['1'], ['2']]);
assert.throws(() => csvTable({ filename: 'x.csv', csv: 'a\n1\n2', maxRows: 1 }), ValidationError);
const unicode = 'a\n\u03b1';
const bytes = new TextEncoder().encode(unicode).length;
assert.deepEqual(csvTable({ filename: 'x.csv', csv: unicode, maxBytes: bytes }).rows, [['\u03b1']]);
assert.throws(() => csvTable({ filename: 'x.csv', csv: unicode, maxBytes: bytes - 1 }), ValidationError);
for (const options of [
  {},
  { filename: 'x.txt', csv },
  { filename: 'x.csv', csv: 'a' },
  { filename: 'x.csv', csv: null },
])
  assert.throws(() => csvTable(options), ValidationError);
for (const value of ['abc', '', null, undefined, { a: 1 }, [1, 2]]) {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  assert.equal(
    await digest(value),
    createHash('sha256')
      .update(input ?? '')
      .digest('hex')
  );
}
const cyclic = {};
cyclic.self = cyclic;
await assert.rejects(() => digest(cyclic), TypeError);
console.log('PASS - Accounting CSV parsing, byte/row limits, amounts, headers, and digests');
