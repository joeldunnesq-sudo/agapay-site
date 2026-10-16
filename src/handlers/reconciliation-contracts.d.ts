import type { StripeObjectReference, StripeResponseBody } from '../lib/stripe-connect.js';
export interface ReconciliationStripeSource extends StripeResponseBody {
  id?: string;
  payment_intent?: StripeObjectReference;
  charge?: string | { id?: string; payment_intent?: StripeObjectReference } | null;
  source?: { payment_intent?: StripeObjectReference };
  application_fee_amount?: number;
}
export interface ReconciliationStripeRecord {
  id: string;
  status?: string;
  amount: number;
  fee: number;
  net: number;
  arrival_date?: number;
  created?: number;
  currency?: string;
  automatic?: boolean;
  method?: string;
  reconciliation_status?: string;
  livemode?: boolean;
  source?: string | ReconciliationStripeSource | null;
  fee_details?: { type?: string; amount?: number }[];
  reporting_category?: string;
  type?: string;
  available_on?: number;
}
export interface ReconciliationStripeResponse {
  ok: boolean;
  status?: number;
  body: ReconciliationStripeSource & {
    data?: ReconciliationStripeRecord[];
    truncated?: boolean;
    payment_intent?: StripeObjectReference;
    charge?: StripeObjectReference;
  };
}
export interface ReconciliationLookupState {
  count: number;
  limit: number;
  truncated?: boolean;
  cache: Map<string, { paymentIntentId: string; source: ReconciliationStripeSource | string | null | undefined }>;
}
export interface TransferAllocation {
  key?: string;
  label?: string;
  category?: string;
  transactionCount?: number;
  grossCents?: number;
  feeCents?: number;
  netCents?: number;
}

export type ReconciliationRegistration = import('./parish-giving-catalog.js').CatalogRegistration &
  import('./parish-dashboard-handler.js').DashboardRegistration & { stripeAccountId?: string; timezone?: string };
export type ReconciliationOffering = import('./parish-donor-offerings.js').ReceiptOffering;
export interface ReconciliationReview {
  status?: string;
  fingerprint?: string;
  reviewId?: string;
  updatedAt?: string;
  bankStatementCents?: number;
  expectedDepositCents?: number;
  differenceCents?: number;
}
export interface ReconciliationReport {
  complete?: boolean;
  fingerprint?: string;
  summary: { readyForReview?: boolean; depositedCents?: number };
}
