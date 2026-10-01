import { stripeObjectId } from '../lib/stripe-connect.js';

export function subscriptionSetupUpdates(session = {}, offering = {}) {
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

export function invoiceDonationMetadata(invoice = {}) {
  return {
    ...(invoice.metadata || {}),
    ...(invoice.lines?.data?.[0]?.metadata || {}),
    ...(invoice.subscription_details?.metadata || {}),
    ...(invoice.parent?.subscription_details?.metadata || {}),
  };
}

export function invoicePaymentIntentId(invoice = {}) {
  return (
    stripeObjectId(invoice.payment_intent) ||
    stripeObjectId(
      invoice.payments?.data?.find((item) => item.status === 'paid' || !item.status)?.payment?.payment_intent
    )
  );
}

export function invoiceSubscriptionId(invoice = {}) {
  return stripeObjectId(invoice.subscription) || stripeObjectId(invoice.parent?.subscription_details?.subscription);
}

export { visibleDonationRecords } from './donation-visibility.js';
