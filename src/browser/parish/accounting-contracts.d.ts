// Consumed Accounting browser contracts; JSON assertions remain at the existing network boundary.
interface ParishWorkspaceIdentity {
  accountingAvailable?: boolean;
}
interface AccountingAccessProfile {
  id: string;
  displayName: string;
  roleTemplate: string;
}
interface AccountingReadiness {
  ready: boolean;
  [key: string]: unknown;
}
interface AccountingAccessResponse {
  error?: string;
  accounting?: AccountingReadiness;
  profiles?: AccountingAccessProfile[];
  profile: AccountingAccessProfile;
  token?: string;
  expiresAt?: string;
  options?: Record<string, unknown>;
  completed?: boolean;
  status?: string;
  preview: AccountingChartPreview;
  result: AccountingChartResult;
}
interface AccountingFund {
  id: string;
  code: string;
  name: string;
  restrictionType: string;
  isActive: number | boolean;
  isDefault?: number | boolean;
  archivedAt?: string;
  status?: string;
  purpose?: string;
  description?: string;
}
interface AccountingAccount {
  id: string;
  accountNumber: string;
  name: string;
  normalBalance: string;
  category: string;
  isActive: number | boolean;
  isSystem?: number | boolean;
  expenseGroup?: string;
  defaultFundId?: string;
  parentAccountId?: string;
  description?: string;
  cashFlowClassification?: string;
  version: number;
}
interface AccountingLifecycleAction {
  id: string;
  action: string;
}
type AccountingCell = string | number | null | undefined;
interface AccountingReportRow extends Record<string, AccountingCell> {
  category?: string;
  accountId?: string;
  accountNumber?: string;
  accountName?: string;
  name?: string;
  restrictionType?: string;
  kind?: string;
  section?: string;
}
interface AccountingReport {
  error?: string;
  title?: string;
  subtitle?: string;
  asOfDate?: string;
  startDate?: string;
  endDate?: string;
  disclaimer?: string;
  validation?: { status?: string; reasonCodes?: string[] };
  columns?: AccountingStatementColumn[];
  rows?: AccountingReportRow[];
  totals?: Record<string, number>;
  netAssetsByRestriction?: { withoutDonorRestrictions: number; withDonorRestrictions: number };
}
interface AccountingStatementColumn {
  label: string;
  key?: string;
  money?: boolean;
}
interface AccountingStatement {
  title: string;
  subtitle?: string;
  parish: string;
  currency: string;
  basis: string;
  period: string;
  columns: AccountingStatementColumn[];
  rows: { kind: string; cells: AccountingCell[] }[];
  notes: string[];
}
interface AccountingLedgerEntry {
  accountNumber: string;
  accountName: string;
  date: string;
  debitAmount?: number;
  creditAmount?: number;
  entryNumber: string;
  description?: string;
  fund?: string;
}
interface AccountingWorkspaceData {
  setup: { settings?: { baseCurrency?: string } } | null;
  journals: unknown[];
  ledger: AccountingLedgerEntry[];
  reports: Record<string, AccountingReport>;
  accounts: AccountingAccount[];
  accountCatalog: AccountingAccount[];
  funds: AccountingFund[];
  bankAccounts: unknown[];
  payables: unknown;
  budgets: unknown;
  banking: unknown;
  integrations: unknown;
  close: AccountingCloseWorkspace | null;
  adjustments: AccountingAdjustments | null;
  governance: AccountingGovernance | null;
  tier: string;
}
interface AccountingMigrationState {
  active: boolean;
  session: AccountingMigrationSession | null;
  sessions: AccountingMigrationSession[];
  step: string;
  previews: Record<string, AccountingMigrationPreview>;
  advanced: boolean;
}
declare function loadAccountingTab(force?: boolean): Promise<void>;
declare function renderAccountingPane(): void;
declare function renderAccountingReadiness(readiness: AccountingReadiness, pane: HTMLElement): void;
declare function accountingStaffSessionKey(): string;
declare function accountingStaffSession(): { profile: { id: string } } | null;

declare function accountingReportPeriod(): { start: string; end: string };
declare function accountingReportLedgerRows(start: string, end: string): AccountingLedgerEntry[];
declare const ACCOUNTING_REPORT_LIBRARY: readonly { id: string; title: string }[];
declare module '*parish/accounting-report-pdf.js?v=20260930reports1' {
  export function createAccountingReportPdf(report: AccountingStatement): Promise<Uint8Array<ArrayBuffer>>;
}
interface AccountingFundResponse {
  message?: string;
  error?: string;
  funds?: AccountingFund[];
  accounts?: AccountingAccount[];
  accountCatalog?: AccountingAccount[];
}

interface AccountingActivationStatus {
  error?: string;
  completed?: boolean;
  status?: string;
  staffReady?: boolean;
  available?: boolean;
  step?: string;
  message?: string;
  migrationCount?: number;
  retryable?: boolean;
  reference?: string;
  options?: Record<string, unknown>;
}
interface AccountingChartResult {
  alreadyImported?: boolean;
  created?: number;
  linked?: number;
}
interface AccountingChartPreview {
  createCount: number;
  linkCount: number;
  ignoredBalanceColumns: string[];
  distinctSourceTypes: string[];
  selectedTypeMap: Record<string, string>;
  columnMap: Record<string, string>;
  errors: { rowNumber: number; message: string }[];
  rows: { accountNumber?: string; name: string; category?: string; action: string; matchName?: string }[];
  fingerprint: string;
}
interface AccountingActivationImport {
  filename?: string;
  csv?: string;
  sourceSystem?: FormDataEntryValue;
  columnMap?: Record<string, FormDataEntryValue>;
  typeMap?: Record<string, string>;
  preview?: AccountingChartPreview;
  result?: AccountingChartResult;
  migrationSessionId?: string;
}
interface AccountingActivationState {
  parishId: string;
  timer: ReturnType<typeof setTimeout> | null;
  status: AccountingActivationStatus | null;
  import: AccountingActivationImport | null;
  complete: boolean;
}
interface AccountingMigrationSession {
  id: string;
  sourceSystem: string;
  status: string;
  chartOfAccountsStatus?: string;
  vendorsStatus?: string;
  fundMappingStatus?: string;
  openingBalanceStatus?: string;
  transactionHistoryStatus?: string;
}
interface AccountingMigrationPreview {
  rows: {
    status: string;
    sourceFundRef: string;
    agapayFundId?: string;
    accountNumber?: string;
    name?: string;
    sourceType?: string;
    action?: string;
    displayName?: string;
    email?: string;
  }[];
  errors: { rowNumber?: number; code: string }[];
  distinctSourceTypes: string[];
  suggestedTypeMap: Record<string, string>;
  invalidRows?: number;
  totalDebits?: number;
  totalCredits?: number;
  balanced?: boolean;
  eligibleToCommit?: boolean;
  groupingMethod?: string;
  groupingExplanation?: string;
  eligibleGroups?: number;
}
interface AccountingMigrationResponse {
  message?: string;
  error?: string;
  sessions?: AccountingMigrationSession[];
  session: AccountingMigrationSession;
  preview: AccountingMigrationPreview;
  progress: { complete?: boolean; processed?: number; total?: number };
}
interface AccountingMigrationCommit {
  migrationSessionId: string;
  acknowledgeExistingActivity: boolean;
  preview: AccountingMigrationPreview;
  typeMap?: Record<string, string>;
  mappings?: { sourceFundRef: string; agapayFundId?: string }[];
  newFunds?: {
    sourceFundRef: string;
    displayName: string;
    restrictionType: string;
    donorRestricted: boolean;
    accountNumber: string;
  }[];
  effectiveDate?: string;
  advancedOptIn?: boolean;
  batchSize?: number;
}
interface AccountingCloseSession {
  id: string;
  closeType: string;
  status: string;
  version: number;
  fiscalYearId: string;
  accountingPeriodId: string;
  lastValidatedAt?: string;
  summary?: { passed?: number; warnings?: number; blockers?: number };
  checks?: {
    id: string;
    label: string;
    category: string;
    status: string;
    blocking?: boolean;
    version: number;
    details?: { count?: number };
  }[];
}
interface AccountingCloseWorkspace {
  fiscalYears: { id: string; name: string; version: number }[];
  periods: { id: string; name: string; status: string; fiscalYearId: string }[];
  sessions: AccountingCloseSession[];
}
interface AccountingAdjustments {
  items: { id: string; effectiveDate: string; type: string; reason: string; status: string; version: number }[];
  templates: { name: string; frequency: string }[];
}
interface AccountingCloseResponse extends Partial<AccountingCloseWorkspace> {
  message?: string;
  error?: string;
  session: AccountingCloseSession;
  adjustments?: AccountingAdjustments['items'];
  templates?: AccountingAdjustments['templates'];
}
interface AccountingGovernance {
  settings: { version?: number; allowLegalHold?: boolean; disclaimer?: string; [key: string]: unknown };
  health: {
    status?: string;
    protectiveState?: { safeSummary?: string; state?: string };
    activeWork?: number;
    findings?: unknown[];
    disclaimer?: string;
  };
  legalHolds: {
    id: string;
    version: number;
    placedAt: string;
    entityType: string;
    entityId: string;
    reason: string;
    status: string;
  }[];
}
interface AccountingGovernanceResponse extends Partial<AccountingGovernance> {
  message?: string;
  error?: string;
}
declare function downloadAccountingFile(url: string, filename: string): unknown;
