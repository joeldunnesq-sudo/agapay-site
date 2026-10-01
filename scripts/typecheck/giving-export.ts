import {
  csvCell,
  givingExportOptions,
  givingExportRows,
  monthlyGivingCsv,
  type GivingExportRow,
} from '../../src/lib/monthly-giving-csv.js';
const options = givingExportOptions(new URLSearchParams('month=2026-07'));
const rows = givingExportRows([{ id: 'a', data: '{}', created_at: '2026-07-01T00:00:00Z' }], options);
const cents: number = rows[0].fees.totalFeeCents;
const csv: string = monthlyGivingCsv(rows, options);
const safeCell: string = csvCell({ arbitrary: true });
void [cents, csv, safeCell];
declare const outside: GivingExportRow;
// @ts-expect-error: outside fees can be unknown, represented by null.
const fee: number = outside.fees.totalFeeCents;
void fee;
// @ts-expect-error: grouping vocabulary is closed.
givingExportRows([], { ...options, groupBy: 'fund' });
// @ts-expect-error: stored JSON must be serialized text.
givingExportRows([{ id: 'a', data: {}, created_at: '' }], options);
// @ts-expect-error: timestamp fallback is required.
givingExportRows([{ id: 'a', data: '{}' }], options);
// @ts-expect-error: complete normalized export rows are required.
monthlyGivingCsv([{ id: 'a' }], options);
// @ts-expect-error: the formatter receives timezone options.
monthlyGivingCsv(rows, {});
