interface AccountingPayableItem {
  status: string;
  id: string;
  version: number;
  vendorNumber: string;
  displayName: string;
  email: string;
  vendorType: string;
  vendor: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  totalDue: number;
  dueDate: string;
  vendorName: string;
  vendorInvoiceNumber: string;
  billNumber: string;
  amountDue: number;
  totalAmount: number;
  frequency: string;
  nextBillDate: string;
  name: string;
  accountName: string;
  fundName: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  checkNumber: string;
  referenceNumber: string;
  paymentNumber: string;
  printCount: number;
  bankAccountName: string;
  runDate: string;
  paymentCount: number;
  legalName: string;
  taxIdLast4: string;
  taxClassification: string;
  totalPaid: string;
  meetsThreshold: string;
  accountNumber: string;
  account: string;
  budget: number;
  actual: number;
  variance: number;
  favorable: string;
  varianceLabel: string;
  annualAmount: number;
  allocationStrategy: string;
  versionNumber: number;
  description: string;
  defaultExpenseAccountId: string;
  defaultFundId: string;
  vendorId: string;
}
interface AccountingPledgeComparison {
  accountId?: string | null;
  accountNumber?: string;
  accountName?: string;
  budgetedLineAmountCents?: number;
  pledgedTotalCents?: number;
  pledgingHouseholds?: number;
  fiscalYear?: string;
  varianceCents?: number;
  unpledgedBudgetAmount?: number;
  pledgedAmount?: number;
  budgetAmount?: number;
  difference?: number;
  householdCount?: number;
  pledged?: number;
  budget?: number;
}
interface AccountingPayablesResponse<Report = AccountingBudgetVariance> {
  message?: string;
  error?: string;
  payment: AccountingPayableItem;
  packet: AccountingCouncilPacket;
  detail: { lines?: AccountingPayableItem[]; complete?: boolean; results?: { ok?: boolean }[] };
  print: { html: string };
  html: string;
  nextCheckNumber: number;
  settings: { nextCheckNumber?: string; [key: string]: string | undefined };
  summary: AccountingReport;
  report: Report;
  budget: AccountingPayableItem;
  lines: AccountingPayableItem[];
  comparison: AccountingPledgeComparison;
  pledgeComparison: AccountingPledgeComparison;
}

interface AccountingTax1099Report {
  calendarYear: number;
  vendors: AccountingPayableItem[];
  disclaimer?: string;
}
interface AccountingBudgetVariance {
  budget: { id: string; name?: string };
  totals?: { budget?: number; actual?: number; variance?: number };
  rows?: AccountingPayableItem[];
}
interface AccountingCouncilPacket {
  title?: string;
  generatedAt?: string;
  revenue?: AccountingPayableItem[];
  expenses?: AccountingPayableItem[];
  executiveSummary?: { budget?: number; actual?: number; variance?: number };
}
interface AccountingBudgetEditor {
  budgetId: string;
  lines: AccountingPayableItem[];
  pledgeComparison: AccountingPledgeComparison;
}
type AccountingPayablesForm = HTMLFormElement & {
  elements: HTMLFormControlsCollection &
    Record<
      | 'accountId'
      | 'fundId'
      | 'name'
      | 'description'
      | 'paymentMethod'
      | 'checkNumber'
      | 'referenceNumber'
      | 'bankAccountId',
      HTMLInputElement
    >;
};
