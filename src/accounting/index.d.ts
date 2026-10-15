// Narrow declarations for legacy Accounting APIs consumed by migrated HTTP controllers.
// Runtime validation remains in those legacy services; JSON payloads remain opaque.
import type { AccountingHttpDatabase, AccountingHttpOptions } from '../handlers/accounting-http-contracts.js';
export function createAdjustment(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createAdjustmentTemplate(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function postAdjustment(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function accountingHealthOverview(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createLegalHold(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function getRetentionSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function releaseLegalHold(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateRetentionSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createRecurringTransaction(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function listRecurringTransactions(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateRecurringTransaction(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function commitBankImport(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function commerceOverview(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function commerceReportCsv(report: unknown): string;
export function completeReconciliation(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function configureCommerceItem(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function confirmReconciliationMatch(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function createBankAccount(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createReconciliation(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function eligibleLedgerItems(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function getIntegrationSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function integrationOverview(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function listBankAccounts(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function postReconciliationAdjustment(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function previewBankCsv(options: AccountingHttpOptions): unknown;
export function previewCommerceBackfill(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function previewIntegrationBackfill(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function reconciliationCsv(report: unknown): string;
export function reopenReconciliation(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function salesTaxLiabilityReport(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function stripeClearingValidation(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function suggestMatches(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateBankAccount(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateIntegrationSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function validateReconciliation(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export { deleteAttachment } from './attachments/service.js';
export { listAttachments } from './attachments/service.js';
export { recordAttachment } from './attachments/service.js';
export function commitChartOfAccountsImport(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function commitFundMapping(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function commitOpeningBalanceImport(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function commitTransactionHistoryImport(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function commitVendorImport(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createMigrationSession(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function listMigrationSessions(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function migrationSessionDetail(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function previewChartOfAccountsCsv(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function previewFundMapping(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function previewOpeningBalanceCsv(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function previewTransactionHistoryCsv(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function previewVendorCsv(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function archiveAccount(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function fundActivity(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ code: string; [field: string]: unknown }>;
export function getAccountingSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function getAccountingSetupOverview(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function initializeAccountingSetup(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function netAssetRollforward(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ code: string; [field: string]: unknown }>;
export function reportCsv(report: unknown): string;
export function statementOfActivities(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ code: string; [field: string]: unknown }>;
export function statementOfCashFlows(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ code: string; [field: string]: unknown }>;
export function statementOfFinancialPosition(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ code: string; [field: string]: unknown }>;
export function statementOfFunctionalExpenses(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ code: string; [field: string]: unknown }>;
export function trialBalance(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ code: string; [field: string]: unknown }>;
export function unarchiveAccount(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateAccountingSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function archiveFiscalYear(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createCloseSession(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function closeSessionDetail(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function validateCloseSession(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function waiveCloseCheck(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function reviewCloseSession(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function completeCloseSession(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function reopenCloseSession(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function previewYearEndClose(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function executeYearEndClose(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function auditReadiness(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function generateAccountantExport(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function closePacketHtml(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<string>;
export function auditTrailCsv(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<string>;
export function reopenYearEndClose(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function accountsPayableAging(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function addBudgetLine(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function approveBill(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function approveBudget(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function archiveVendor(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function budgetReportCsv(report: unknown): string;
export function budgetVsActual(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function copyBudget(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function councilBudgetPacket(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createBillDraft(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createBudget(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createVendor(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createPaymentRun(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createRecurringBillSchedule(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function forecastBudget(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function getCheckSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function listBudgets(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function listPaymentRuns(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function listRecurringBillSchedules(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function listVendors(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function lockBudget(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function payablesOverview(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function paymentRunDetail(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ run: { bankAccountId: string } }>;
export function postBill(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function postPaymentRun(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function printPaymentRun(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function rejectBill(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function seedCheckPayerIdentity(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function submitBill(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function submitBudget(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function createPayment(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function postPayment(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function listPayments(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function paymentDetail(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<{ bankAccount: { id: string } }>;
export function unarchiveVendor(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateBudgetLine(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateCheckSettings(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function updateRecurringBillSchedule(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<unknown>;
export function updateVendor(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
export function recordCheckPrint(
  db: AccountingHttpDatabase,
  options: AccountingHttpOptions
): Promise<import('./payables/check-printing.js').PrintablePaymentDetail>;
export { vendor1099Summary } from './payables/vendor-reporting.js';
export { vendor1099SummaryCsv } from './payables/vendor-reporting.js';
export function voidPayment(db: AccountingHttpDatabase, options: AccountingHttpOptions): Promise<unknown>;
