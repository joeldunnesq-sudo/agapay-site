// Generated from src/handlers/stripe-event-context.ts by npm run build:server. Do not edit.
import { d1All, d1Run } from '../lib/core.js';
import { stripeObjectId } from '../lib/stripe-connect.js';
import { loadDonorOfferingByCheckout, loadDonorOfferingByPaymentIntent } from './parish.js';
const RETRYABLE_PAYMENT_EVENTS = /* @__PURE__ */ new Set([
  'charge.refunded',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.closed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'payout.paid',
]);
async function parishForStripeAccount(env, accountId) {
  if (!accountId || !env.AGAPAY_DB) return '';
  const rows = await d1All(
    env,
    "SELECT DISTINCT parish_id FROM registrations WHERE stripe_account_id=? AND parish_id<>'' LIMIT 2",
    accountId
  );
  return rows.length === 1 ? rows[0].parish_id : '';
}
async function stripeEventParish(env, event) {
  const account = event.account || '';
  const object = event.data?.object;
  let parishId = await parishForStripeAccount(env, account);
  if (!account && object) {
    parishId = await parishForStripeAccount(env, stripeObjectId(object.on_behalf_of));
    const intent = stripeObjectId(object.payment_intent);
    const offering = intent
      ? await loadDonorOfferingByPaymentIntent(env, intent)
      : event.type.startsWith('checkout.session.') && object.id
        ? await loadDonorOfferingByCheckout(env, object.id)
        : null;
    parishId ||= String(offering?.parishId || '');
  }
  return parishId;
}
async function rememberStripeEventContext(env, event, parishId) {
  if (!env.AGAPAY_DB || !RETRYABLE_PAYMENT_EVENTS.has(event.type)) return;
  await d1Run(
    env,
    "UPDATE stripe_events SET stripe_account_id=COALESCE(stripe_account_id,?), parish_id=COALESCE(NULLIF(parish_id,''),?) WHERE id=?",
    event.account || '',
    parishId ?? (await stripeEventParish(env, event)),
    event.id
  );
}
export { RETRYABLE_PAYMENT_EVENTS, parishForStripeAccount, rememberStripeEventContext, stripeEventParish };
