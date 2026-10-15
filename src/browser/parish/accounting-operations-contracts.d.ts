// Accounting register, reconciliation and treasurer UI contracts.
// Network assertions describe consumed JSON; server validation remains authoritative.
type AccountingFormEvent = Event & { currentTarget: HTMLFormElement };
interface AccountingJournalLine {
  accountId?: string;
  fundId?: string;
  debitAmount?: number;
  creditAmount?: number;
}
interface AccountingJournalDraft {
  id: string;
  version: number;
  entryDate: string;
  description?: string;
  lines: AccountingJournalLine[];
}
interface AccountingJournalSummary {
  entryNumber?: string;
  memo?: string;
  id: string;
  status: string;
  totalDebits?: number;
  total_debits?: number;
  description?: string;
  postingDate?: string;
  entryDate?: string;
}
interface AccountingRecurring {
  expenseAccount?: string;
  fund?: string;
  id: string;
  version: number;
  name?: string;
  payee?: string;
  registerAccountId?: string;
  expenseAccountId?: string;
  fundId?: string;
  amount?: number;
  frequency?: string;
  nextPostingDate?: string;
  endDate?: string;
  description?: string;
  status?: string;
}
interface AccountingBankAccount {
  ledgerAccountId?: string;
  id: string;
  version: number;
  name: string;
  institutionName?: string;
  maskedLast4?: string;
}
interface AccountingBankSession {
  id: string;
  version: number;
  status: string;
  startDate: string;
  endDate: string;
  bankAccountName: string;
  endingBalance: number;
  difference: number;
}
interface AccountingBanking {
  accounts: AccountingBankAccount[];
  sessions: AccountingBankSession[];
}
interface AccountingBankPreview {
  bankAccountId?: string;
  validRows?: number;
  invalidRows?: number;
  totalCredits?: number;
  totalDebits?: number;
  ordersFound?: number;
  readyToPost?: number;
  missingMappings?: number;
}
interface AccountingGiveTotals {
  events?: number;
  grossContributions?: number;
  stripeFees?: number;
}
interface AccountingGiveOverview extends AccountingGiveTotals {
  totals?: AccountingGiveTotals;
  serviceInvoices?: {
    id: string;
    paidAt: string;
    planLabel: string;
    invoiceId: string;
    currency: string;
    amountCents: number;
    status: string;
    message?: string;
  }[];
}
interface AccountingCommerceOverview {
  netSales?: number;
  salesTaxCollected?: number;
  unposted?: number;
  exceptions?: number;
}
interface AccountingConnectedOverview extends AccountingGiveOverview, AccountingCommerceOverview {}
interface AccountingIntegrationSettings {
  version?: number;
  postingMode?: string;
  pledgeComparisonAccountId?: string;
}
interface AccountingIntegrations {
  settings: AccountingIntegrationSettings;
  give?: AccountingGiveOverview;
  clearing?: { calculatedBalance?: number; balanced?: boolean };
  commerce?: AccountingCommerceOverview | null;
}
interface AccountingEligibleItem {
  journalLineId: string;
  journalEntryId: string;
  postingDate: string;
  entryNumber?: string;
  description?: string;
  netEffect?: number;
}
interface AccountingMatchSuggestion {
  amount: number;
  reasons: string[];
  journalLineId: string;
  journalEntryId: string;
  bankTransactionId: string;
}
interface AccountingFeeCoverage {
  year: number;
  afterId?: string;
  nextCursor?: string;
  additions: { status?: string }[];
  totalCents: number;
  scanned: number;
  hasMore?: boolean;
}
interface AccountingFeeCoverageCard extends HTMLElement {
  feeCoveragePreview?: AccountingFeeCoverage;
}
interface AccountingOperationsResponse {
  message?: string;
  error?: string;
  entry: AccountingJournalDraft;
  validation?: { ok?: boolean; issues?: string[] };
  preview?: AccountingBankPreview;
  accounts?: AccountingBankAccount[];
  sessions?: AccountingBankSession[];
  reconciliation?: AccountingBankSession;
  settings: AccountingIntegrationSettings;
  overview?: AccountingConnectedOverview;
  clearing?: AccountingIntegrations['clearing'];
  items?: AccountingEligibleItem[];
  suggestions?: AccountingMatchSuggestion[];
  feeCoverage: AccountingFeeCoverage;
}
interface AccountingIncomeSplit {
  revenueAccountId?: string;
  fundId?: string;
  amount?: number | string;
  description?: string;
}
interface AccountingAccount {
  archivedAt?: string;
  account_number?: string;
  normal_balance?: string;
}
interface AccountingFund {
  restriction_type?: string;
  givingSourceId?: string;
  giving_source_id?: string;
  givingSourceType?: string;
  giving_source_type?: string;
}
interface AccountingLedgerEntry {
  account_number?: string;
  postingDate?: string;
  entryDate?: string;
  debit_amount?: number;
  credit_amount?: number;
  fundName?: string;
  fund_name?: string;
  sourceType?: string;
}
interface ParishGivingOption {
  accountingFundId?: string;
}
declare function accountingParishOnly(): string;
