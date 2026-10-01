import { givingFeeReportHtml, appendGivingFeeReport } from '../../src/stewardship/giving-fee-presentation.js';
import { ledgerCostTable, type LedgerCostData } from '../../src/stewardship/ledger-cost-presentation.js';
import {
  accountingCouncilReport,
  councilReportPeriod,
  type CouncilReportSnapshot,
} from '../../src/stewardship/council-reports.js';
import type { GivingFeeReport } from '../../src/lib/giving-fee-report.js';

declare const fees: GivingFeeReport;
declare const snapshot: CouncilReportSnapshot;
const html: string = givingFeeReportHtml(fees);
const appended: Promise<Response> = appendGivingFeeReport(new Response(''), fees);
const period = councilReportPeriod(new URL('https://example.test/?month=2026-01'));
if (period) {
  const response: Response = accountingCouncilReport('Parish', period, snapshot, snapshot);
  void response;
}
const ledger: LedgerCostData = { expenseLines: [{ accountNumber: '5840', amount: '10' }] };
ledgerCostTable(ledger, {}, (amount) => amount.toFixed(2));
givingFeeReportHtml(null);
void [html, appended];
// @ts-expect-error: complete fee aggregates are required when a report is present.
givingFeeReportHtml({ year: 2026 });
// @ts-expect-error: append requires a Response with body and headers.
appendGivingFeeReport('<main></main>', fees);
// @ts-expect-error: date selection can fail and must be narrowed.
accountingCouncilReport('Parish', period, snapshot, snapshot);
// @ts-expect-error: accounting amounts are cents represented as numbers.
accountingCouncilReport('Parish', period!, { ...snapshot, netCents: '100' }, snapshot);
// @ts-expect-error: formatters receive numeric dollars.
ledgerCostTable(ledger, {}, (amount: string) => amount);
// @ts-expect-error: expense values are unvalidated until existing coercion runs.
const amount: number = ledger.expenseLines![0].amount;
void amount;
// @ts-expect-error: snapshots expose readonly input arrays.
snapshot.restrictedFunds.push({});
