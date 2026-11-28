import { detectAccountingEnvironment } from '../accounting/environment.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { d1First, finishStripeEvent, json, reclaimStripeEvent, staleStripeProcessingEvent } from '../lib/core.js';
import { stripeGetConnectedRequest, stripeGetRequest } from '../lib/stripe-connect.js';
import type { StripeHandlerEnv, StripeWebhookEvent } from './stripe-composition-contracts.js';
import { rememberStripeEventContext, RETRYABLE_PAYMENT_EVENTS, stripeEventParish } from './stripe-event-context.js';
import { processStripeWebhookEvent } from './stripe-webhook-processing.js';

export async function retryStripePaymentEvent(request: Request, env: StripeHandlerEnv, eventId: string, actor: string) {
  const reply = (status: number, data: { outcome?: string; error?: string }) =>
    json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!env.AGAPAY_DB) return reply(503, { error: 'Payment exception data is unavailable.' });
  const row = await d1First<{
    event_type: string;
    status: string;
    received_at: string;
    stripe_account_id: string | null;
    parish_id: string;
  }>(env, 'SELECT event_type,status,received_at,stripe_account_id,parish_id FROM stripe_events WHERE id=?', eventId);
  if (!row) return reply(404, { error: 'Payment exception was not found.' });
  if (!RETRYABLE_PAYMENT_EVENTS.has(row.event_type))
    return reply(422, { error: 'Use Stripe Workbench to review this event.' });
  if (row.status !== 'failed' && !(row.status === 'processing' && staleStripeProcessingEvent(row.received_at)))
    return reply(409, { error: 'This event is already processed or has an active delivery. Refresh the queue.' });

  const audit = {
    actorUserId: actor,
    targetType: 'stripe_event',
    targetId: eventId,
    organizationId: row.parish_id,
    before: { status: row.status, type: row.event_type },
  };
  const attempt = await recordAuditEvent(env, request, { ...audit, action: 'stripe.payment_retry.requested' });
  if (!attempt) return reply(503, { error: 'The audit log is unavailable. Try again before retrying this event.' });
  let parishId = row.parish_id;
  const result = async (outcome: string, status: number, error?: string) => {
    const recorded = await recordAuditEvent(env, request, {
      ...audit,
      action: 'stripe.payment_retry.finished',
      organizationId: parishId,
      after: { outcome },
      metadata: { attempt },
    });
    if (!recorded)
      return reply(503, { error: 'The retry outcome could not be audited. Refresh the queue before trying again.' });
    return reply(status, { outcome, ...(error ? { error } : {}) });
  };

  let claimedAt = '';
  try {
    const path = `/v1/events/${encodeURIComponent(eventId)}`;
    const provider = row.stripe_account_id
      ? await stripeGetConnectedRequest(env, path, row.stripe_account_id)
      : await stripeGetRequest(env, path);
    if (!provider.ok)
      return result(
        'provider_unavailable',
        502,
        'Could not retrieve the original event. Review the delivery in Stripe Workbench.'
      );
    const event = provider.body as unknown as StripeWebhookEvent;
    if (
      event.id !== eventId ||
      event.type !== row.event_type ||
      !event.data?.object ||
      event.livemode !== (detectAccountingEnvironment(env) === 'production') ||
      (row.stripe_account_id !== null && row.stripe_account_id !== (event.account || ''))
    )
      return result('identity_mismatch', 409, 'The original Stripe event did not match this delivery.');
    const currentParish = await stripeEventParish(env, event);
    if ((parishId && currentParish !== parishId) || (event.account && !currentParish))
      return result(
        'parish_unverified',
        409,
        'The original Stripe account could not be matched to the affected parish.'
      );
    parishId = currentParish;
    claimedAt = await reclaimStripeEvent(env, eventId, event.type, row);
    if (!claimedAt) return result('already_claimed', 409, 'An active delivery claimed this event. Refresh the queue.');
    await rememberStripeEventContext(env, event, parishId);
    await processStripeWebhookEvent(env, event);
    if (!(await finishStripeEvent(env, eventId, 'processed', '', claimedAt)))
      return result('superseded', 409, 'Another delivery took over. Refresh the queue to see the latest status.');
    return result('processed', 200);
  } catch (error) {
    if (claimedAt) {
      const message = error instanceof Error ? error.message : 'Payment processing failed.';
      const updated = await finishStripeEvent(env, eventId, 'failed', message, claimedAt).catch(() => false);
      if (!updated)
        return result('status_unconfirmed', 503, 'The delivery status could not be confirmed. Refresh the queue.');
    }
    return result('failed', 502, 'The retry could not finish. Review the delivery details before trying again.');
  }
}
