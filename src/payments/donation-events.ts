import type { StripeObjectReference } from '../lib/stripe-connect.js';
export interface DonationSession {
  mode?: unknown;
  status?: unknown;
  customer?: StripeObjectReference;
  subscription?: StripeObjectReference;
}
export interface SubscriptionOffering {
  recordType?: unknown;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}
export interface InvoiceSubscription {
  metadata?: Record<string, unknown>;
  subscription?: StripeObjectReference;
}
export interface DonationInvoice {
  metadata?: Record<string, unknown>;
  lines?: { data?: { metadata?: Record<string, unknown> }[] };
  subscription_details?: InvoiceSubscription;
  parent?: { subscription_details?: InvoiceSubscription };
  payment_intent?: StripeObjectReference;
  subscription?: StripeObjectReference;
  payments?: { data?: { status?: string; payment?: { payment_intent?: StripeObjectReference } }[] };
}
import { stripeObjectId } from '../lib/stripe-connect.js';

export function subscriptionSetupUpdates(session: DonationSession = {}, offering: SubscriptionOffering = {}) {
  if (session.mode !== 'subscription' && offering.recordType !== 'subscription_setup') return null;
  return {
    recordType: 'subscription_setup',
    status: session.status === 'expired' ? 'expired' : 'subscription_setup',
    paymentStatus: 'pending',
    stripeCustomerId: stripeObjectId(session.customer) || offering.stripeCustomerId || '',
    stripeSubscriptionId: stripeObjectId(session.subscription) || offering.stripeSubscriptionId || '',
    stripePaymentIntentId: '',
    completedAt: '',
  };
}

export function invoiceDonationMetadata(invoice: DonationInvoice = {}) {
  return {
    ...(invoice.metadata || {}),
    ...(invoice.lines?.data?.[0]?.metadata || {}),
    ...(invoice.subscription_details?.metadata || {}),
    ...(invoice.parent?.subscription_details?.metadata || {}),
  };
}

export function invoicePaymentIntentId(invoice: DonationInvoice = {}) {
  return (
    stripeObjectId(invoice.payment_intent) ||
    stripeObjectId(
      invoice.payments?.data?.find((item) => item.status === 'paid' || !item.status)?.payment?.payment_intent
    )
  );
}

export function invoiceSubscriptionId(invoice: DonationInvoice = {}) {
  return stripeObjectId(invoice.subscription) || stripeObjectId(invoice.parent?.subscription_details?.subscription);
}

export { visibleDonationRecords } from './donation-visibility.js';
