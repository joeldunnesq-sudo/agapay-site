interface AccountingWorkspaceSettings extends AccountingIntegrationSettings {
  baseCurrency?: string;
  fiscalYearStartMonth?: number;
  openingBalancesDisposition?: string;
}
interface AccountingSetupOverview {
  periods?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    version: number;
    fiscalStatus: string;
  }[];
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
  overdue?: number;
  openPayables?: number;
  awaitingApproval?: number;
  openBills?: number;
  overdueBills?: number;
  totalDue?: number;
}
interface AccountingPayablesWorkspace {
  overview?: AccountingPayablesOverview;
  vendors: AccountingPayableItem[];
  bills: AccountingPayableItem[];
  recurringBills?: AccountingPayableItem[];
  payments?: AccountingPayableItem[];
  paymentRuns?: AccountingPayableItem[];
  tax1099?: AccountingTax1099Report | null;
  bankAccounts?: AccountingBankAccount[];
  aging: { rows: AccountingPayableItem[]; totalDue: number };
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
  report: AccountingServerReport & AccountingTax1099Report;
  budgets?: AccountingPayableItem[];
  attachments?: {
    id: string;
    version: number;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }[];
  vendors: AccountingPayableItem[];
  bills: AccountingPayableItem[];
  schedules?: AccountingPayableItem[];
  payments?: AccountingPayableItem[];
  paymentRuns?: AccountingPayableItem[];
  aging?: { rows: AccountingPayableItem[]; totalDue: number };
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
