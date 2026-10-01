import { d1, d1All, d1First } from '../../src/lib/database-reads.js';
import { readGivingFeeReport, summarizeGivingFees, type GivingFeeReport } from '../../src/lib/giving-fee-report.js';
declare const env: Env;
const binding: D1Database | null = d1(env);
const report: Promise<GivingFeeReport> = readGivingFeeReport(env, 'parish', 2026);
const result = summarizeGivingFees([{ data: '{external JSON}' }], 2026);
const label: string = result.annual.label;
const total: number = result.annual.grossContributionCents;
const rows: Promise<{ id: string }[]> = d1All<{ id: string }>(env, 'SELECT id FROM records');
const first: Promise<{ id: string } | null> = d1First<{ id: string }>(env, 'SELECT id FROM records');
void [binding, report, label, total, rows, first];
// @ts-expect-error: reporting years must be numeric.
readGivingFeeReport(env, 'parish', '2026');
// @ts-expect-error: a database binding must implement D1.
d1({ AGAPAY_DB: {} });
// @ts-expect-error: SQL must be text.
d1All(env, null);
// @ts-expect-error: report rows are required.
summarizeGivingFees(null, 2026);
// @ts-expect-error: only defined numeric bucket fields can be read.
void result.annual.grossContributonCents;
// @ts-expect-error: currency contract is USD.
const currency: 'EUR' = result.currency;
void currency;
async function defaults() {
  const row = await d1First(env, 'SELECT value FROM records');
  if (row) {
    // @ts-expect-error: untyped query values remain unknown.
    const value: number = row.value;
    void value;
  }
}
void defaults;
