interface AccountingWorkspaceSettings extends AccountingIntegrationSettings {
  baseCurrency?: string;
  fiscalYearStartMonth?: number;
  openingBalancesDisposition?: string;
}
interface AccountingSetupOverview {
  activeAccountCount?: number;
  activeFundCount?: number;
  checklist?: { complete?: boolean; label: string }[];
  validation?: { ok?: boolean };
  currentPeriod?: { name?: string };
  settings?: AccountingWorkspaceSettings;
  currentFiscalYear?: { name?: string; startDate?: string; endDate?: string };
  initialization?: { operational?: boolean };
}
interface AccountingPayablesOverview {
  openPayables?: number;
  awaitingApproval?: number;
  openBills?: number;
  overdueBills?: number;
  totalDue?: number;
}
interface AccountingPayablesWorkspace {
  overview?: AccountingPayablesOverview;
  vendors?: unknown[];
  bills?: unknown[];
  recurringBills?: unknown[];
  payments?: unknown[];
  paymentRuns?: unknown[];
  tax1099?: AccountingReport | null;
  bankAccounts?: AccountingBankAccount[];
  aging?: { rows: unknown[]; totalDue: number };
}
interface AccountingServerReport extends AccountingReport {
  current?: AccountingServerReport;
  comparative?: AccountingServerReport;
  simplification?: string;
  budget?: { name?: string };
  throughDate?: string;
  rows?: AccountingServerReportRow[];
}
interface AccountingServerReportRow extends AccountingReportRow {
  account?: string;
  label: string;
  accountId: string;
  fundId: string;
  restrictionType: string;
  amount?: number;
  total?: number;
}
interface AccountingBudgetSummary {
  id: string;
  status: string;
  name?: string;
}
interface AccountingWorkspaceResponse {
  message?: string;
  error?: string;
  ok: boolean;
  accounting?: AccountingReadiness;
  overview: AccountingSetupOverview & AccountingPayablesOverview;
  tier?: string;
  status?: { operational?: boolean };
  accounts?: AccountingBankAccount[] & AccountingAccount[];
  accountCatalog?: AccountingAccount[];
  funds?: AccountingFund[];
  entries?: AccountingJournalSummary[];
  rows?: AccountingLedgerEntry[];
  items?: AccountingRecurring[];
  report: AccountingServerReport;
  budgets?: AccountingBudgetSummary[];
  attachments?: {
    id: string;
    version: number;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }[];
  vendors?: unknown[];
  bills?: unknown[];
  schedules?: unknown[];
  payments?: unknown[];
  paymentRuns?: unknown[];
  aging?: { rows: unknown[]; totalDue: number };
}
interface AccountingReport {
  serverPath?: string;
  comparativeSupported?: boolean;
}
interface AccountingLedgerEntry {
  id?: string;
  status?: string;
  memo?: string;
  entry_date?: string;
  entry_number?: string;
  source_type?: string;
  totalDebits?: number;
  total_debits?: number;
  totalCredits?: number;
  total_credits?: number;
}
interface AccountingJournalSummary {
  date?: string;
  fundName?: string;
  fund_name?: string;
  entry_date?: string;
  entry_number?: string;
  creditAmount?: number;
  credit_amount?: number;
  debitAmount?: number;
  debit_amount?: number;
  registerBalance?: number;
  totalCredits?: number;
  total_credits?: number;
  sourceType?: string;
  source_type?: string;
}
interface ParishWorkspaceIdentity {
  subscriptionMonthlyCents?: number;
  subscriptionTierLabel?: string;
  subscriptionTier?: string;
}
declare function showAccountingBillForm(): void;

declare function renderAccountingPayables(pane: HTMLElement): void;
declare function renderAccountingBudgets(pane: HTMLElement): void;
