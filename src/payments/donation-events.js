// Generated from src/payments/donation-events.ts by npm run build:server. Do not edit.
import { stripeObjectId } from '../lib/stripe-connect.js';
function subscriptionSetupUpdates(session = {}, offering = {}) {
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
function invoiceDonationMetadata(invoice = {}) {
  return {
    ...(invoice.metadata || {}),
    ...(invoice.lines?.data?.[0]?.metadata || {}),
    ...(invoice.subscription_details?.metadata || {}),
    ...(invoice.parent?.subscription_details?.metadata || {}),
  };
}
function invoicePaymentIntentId(invoice = {}) {
  return (
    stripeObjectId(invoice.payment_intent) ||
    stripeObjectId(
      invoice.payments?.data?.find((item) => item.status === 'paid' || !item.status)?.payment?.payment_intent
    )
  );
}
function invoiceSubscriptionId(invoice = {}) {
  return stripeObjectId(invoice.subscription) || stripeObjectId(invoice.parent?.subscription_details?.subscription);
}
import { visibleDonationRecords } from './donation-visibility.js';
export {
  invoiceDonationMetadata,
  invoicePaymentIntentId,
  invoiceSubscriptionId,
  subscriptionSetupUpdates,
  visibleDonationRecords,
};
