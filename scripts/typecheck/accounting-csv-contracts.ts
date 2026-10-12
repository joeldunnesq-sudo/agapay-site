import { csvRows, csvTable, columnIndexes, cents, digest } from '../../src/accounting/csv-utils.js';
const rows: string[][] = csvRows('a\n1');
void rows;
const table = csvTable({ filename: 'x.csv', csv: 'a\n1', maxRows: 1 });
const index: number = columnIndexes(table.normalizedHeaders, null, { date: 'Date' }).date;
void index;
const amount: number = cents('12.34');
void amount;
const hash: Promise<string> = digest({ a: 1 });
void hash;
// @ts-expect-error CSV input must be text or absent.
csvRows(123);
// @ts-expect-error Row limit must be numeric.
csvTable({ maxRows: '5' });
// @ts-expect-error Delimiter must be text.
csvRows('a', 123);
// @ts-expect-error Headers must contain strings.
columnIndexes([123], null, {});
// @ts-expect-error Parsed cells remain strings.
const numeric: number = table.rows[0][0];
void numeric;
