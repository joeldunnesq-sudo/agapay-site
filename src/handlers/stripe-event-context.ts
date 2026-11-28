import { d1All, d1Run } from '../lib/core.js';
import { stripeObjectId } from '../lib/stripe-connect.js';
import { loadDonorOfferingByCheckout, loadDonorOfferingByPaymentIntent } from './parish.js';
import type { StripeWebhookEvent } from './stripe-composition-contracts.js';

export const RETRYABLE_PAYMENT_EVENTS = new Set([
  'charge.refunded',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.closed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
]);

export async function parishForStripeAccount(env: Partial<Env>, accountId: string) {
  if (!accountId || !env.AGAPAY_DB) return '';
  const rows = await d1All<{ parish_id: string }>(
    env,
    "SELECT DISTINCT parish_id FROM registrations WHERE stripe_account_id=? AND parish_id<>'' LIMIT 2",
    accountId
  );
  return rows.length === 1 ? rows[0].parish_id : '';
}

export async function stripeEventParish(env: Partial<Env>, event: StripeWebhookEvent) {
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

export async function rememberStripeEventContext(env: Partial<Env>, event: StripeWebhookEvent, parishId?: string) {
  if (!env.AGAPAY_DB || !RETRYABLE_PAYMENT_EVENTS.has(event.type)) return;
  await d1Run(
    env,
    "UPDATE stripe_events SET stripe_account_id=COALESCE(stripe_account_id,?), affected_parish_id=COALESCE(NULLIF(affected_parish_id,''),?) WHERE id=?",
    event.account || '',
    parishId ?? (await stripeEventParish(env, event)),
    event.id
  );
}
