import type { StripeRequestEnv } from '../lib/stripe-connect.js';
export type LearnBillingEnvironment = Partial<Env> &
  StripeRequestEnv & {
    AGAPAY_PUBLIC_URL?: string;
    AGAPAY_APP_URL?: string;
    STRIPE_SECRET_KEY?: string;
    LEARN_PERSISTED_CUSTOMER_ENFORCED?: string;
    AGAPAY_LEARN_FULL_ACCESS_EMAILS?: string;
    AGAPAY_STRIPE_PRICE_LEARN_FAMILY_YEARLY?: string;
    AGAPAY_STRIPE_PRICE_LEARN_FAMILY_MONTHLY?: string;
    AGAPAY_STRIPE_PRICE_LEARN_FOUNDING_YEARLY?: string;
    AGAPAY_STRIPE_PRICE_LEARN_FOUNDING_MONTHLY?: string;
  };
export interface LearnBillingRecord extends Record<string, unknown> {
  updatedAt?: string;
  monthlyEquivalentCents?: number;
  monthlyCents?: number;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
  stripe_customer_id?: string;
  email?: string;
  householdId?: string;
  plan?: string;
  learnSubscriptionCents?: number;
  interval?: string;
  billingInterval?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCheckoutSessionId?: string;
  source?: string;
  odysseyRef?: string;
  odysseyVerificationStatus?: string;
  odysseyActivatedAt?: string;
  odysseyLastVerifiedAt?: string;
  odysseyVerificationNote?: string;
  cancel_at_period_end?: boolean;
  cancelledAt?: string;
  canceledAt?: string;
  billingLegalName?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostalCode?: string;
  billingCountry?: string;
  createdAt?: string;
}
export interface LearnStripeSource extends Record<string, unknown> {
  id?: string;
  email?: string;
  customer?: string;
  customerEmail?: string;
  stripeCustomerId?: string;
  subscription?: string;
  stripeSubscriptionId?: string;
  checkoutSessionId?: string;
  status?: string;
  interval?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  canceled_at?: number;
  metadata?: Record<string, string>;
  customer_details?: {
    email?: string;
    name?: string;
    address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
  };
}
export interface LearnStripeCustomer {
  id: string;
  email?: string;
  metadata?: Record<string, string>;
}
interface LearnBillingSqlRow {
  id: string;
  email: string;
  data: string;
  stripe_customer_id: string;
}
export { LearnBillingSqlRow };
