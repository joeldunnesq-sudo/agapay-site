import type { BudgetInput, BudgetVarianceOptions } from '../../src/accounting/budgets/service.js';
import type { ReportOptions, FinancialReport } from '../../src/accounting/reports/service.js';
import { reportCsv } from '../../src/accounting/reports/service.js';
import { verifyTotpCode } from '../../src/lib/mfa.js';
const budget: BudgetInput = { name: 'Operating', lines: [{ accountId: 'a', annualAmount: 100 }] };
// @ts-expect-error Account identities must be strings.
const invalidBudget: BudgetInput = { lines: [{ accountId: 123 }] };
const report: ReportOptions = { startDate: '2026-01-01', fundId: 'f' };
// @ts-expect-error Report dates cannot be numeric timestamps.
const invalidReport: ReportOptions = { startDate: 123 };
const financial: FinancialReport = { code: 'trial_balance', basis: 'accrual', totals: { debit: 12 } };
const csv: string = reportCsv(financial);
// @ts-expect-error Report totals must retain numeric amounts.
const invalidFinancial: FinancialReport = { code: 'trial_balance', basis: 'accrual', totals: { debit: '12' } };
type VarianceMonth = BudgetVarianceOptions['throughMonth'];
const month: VarianceMonth = 12;
// @ts-expect-error Month must be numeric.
const invalidMonth: VarianceMonth = '12';
const verification: Promise<boolean> = verifyTotpCode('test-secret', '123456', 0);
// @ts-expect-error Enrolled TOTP secrets must be strings.
void verifyTotpCode(123, '123456');
void [
  budget,
  invalidBudget,
  report,
  invalidReport,
  financial,
  csv,
  invalidFinancial,
  month,
  invalidMonth,
  verification,
];
