import type { DonationInvoice } from '../payments/donation-events.js';
import type { DashboardRegistration } from './parish-dashboard-handler.js';
export interface StripeWebhookObject extends DonationInvoice {
  [field: string]: unknown;
  metadata?: Record<string, string>;
  on_behalf_of?: string;
  id: string;
  mode?: string;
  payment_status?: string;
  subscription?: string;
  customer_details?: { email?: string; name?: string };
  customer_email?: string;
  customer?: string;
  created?: number;
  amount_subtotal?: number;
  amount_total?: number;
  payment_intent?: string;
  last_payment_error?: { message?: string };
  expires_at?: number;
  client_reference_id?: string;
  amount_received?: string;
  amount?: number;
  canceled_at?: number;
  amount_refunded?: number;
  reason?: string;
  status?: string;
  amount_paid?: number;
  customer_name?: string;
  items?: { data?: { price?: { id?: string; unit_amount?: number }; quantity?: number }[] };
  cancel_at_period_end?: boolean;
  trial_start?: number;
  trial_end?: number;
  subscription_details?: DonationInvoice['subscription_details'];
  lines?: DonationInvoice['lines'];
  amount_due?: number;
  amount_remaining?: number;
  total?: number;
  last_finalization_error?: { message?: string };
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { disabled_reason?: string; currently_due?: string[] };
  external_accounts?: { data?: { object?: string; bank_name?: string; last4?: string }[] };
  requirements?: { disabled_reason?: string; currently_due?: string[] };
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}
export interface StripeWebhookEvent {
  id: string;
  type: string;
  account?: string;
  data?: { object?: StripeWebhookObject };
}
export type StripeHandlerEnv = Partial<Env> &
  import('../lib/stripe-connect.js').StripeRequestEnv &
  import('../lib/email.js').EmailEnv & {
    STRIPE_SECRET_KEY?: string;
    RESEND_API_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_WEBHOOK_SECRET_CONNECT?: string;
  };
export type StripeHandlerRegistration = DashboardRegistration & {
  onboardingStripeTestFixture?: StripeWebhookObject;
  stripeAccountId?: string | null;
  stripeOnboardingLinkCreatedAt?: string;
  stripeSubscriptionCheckoutSessionId?: string;
  reference?: unknown;
  parishId?: string;
  parishName?: string;
  subscriptionTrialDays?: string | number;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  stripeCustomerId?: string;
  dashboardInviteEmailSentAt?: string;
  website?: string;
};
export interface StripeRefreshOptions {
  actor?: string;
  reason?: string;
  preserveReviewedTimestamp?: boolean;
  persist?: boolean;
}

export type StripeObjectResponse = {
  ok: boolean;
  status: number;
  body: Partial<StripeWebhookObject> & import('../lib/stripe-connect.js').StripeResponseBody;
  recovered?: boolean;
  simulated?: boolean;
};
