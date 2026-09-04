// src/handlers/parish-commerce.js
// Parish bookstore operations, settlement profiles, and commerce webhooks.

import {
  SETTLEMENT_PROFILE_TYPES,
  assignModuleProfile,
  createSettlementProfile,
  ensureDefaultCommerceProfile,
  ensureDefaultGivingProfile,
  listSettlementProfiles,
  renameSettlementProfile,
  setDefaultCommerceProfile,
  setDefaultGivingProfile,
  setProfileActive,
  settlementProfileToJson,
} from '../lib/settlement-profiles.js';
import { checkoutPaymentIntentId, numericCents, stripeObjectId } from '../lib/stripe-connect.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';
import {
  bookstoreEnabledFor,
  d1All,
  d1First,
  d1Run,
  findRegistrationByParishId,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  recordAuditEvent,
  stripePaymentIntentFinancialUpdates,
  unauthorized,
  verifyParishDashboardBearer,
} from './parish.js';

import {
  applyBookstoreInventoryAtCompletion,
  changedRows,
  promotePaidScannedBooksToCatalog,
} from './parish-bookstore-inventory.js';

export {
  applyBookstoreInventoryAtCompletion,
  closeBookstoreCountSession,
  getBookstoreCountSession,
  listBookstoreCountSessions,
  listBookstoreLowStock,
  patchBookstoreProduct,
  patchBookstoreReorderThreshold,
  receiveBookstoreStock,
  startBookstoreCountSession,
} from './parish-bookstore-inventory.js';

export { handleParishBookstore } from './parish-bookstore-handler.js';

const commerceDatabase = (env) => env.AGAPAY_DB || env.DB || null;
export async function handleParishSettlementProfiles(request, env, parishId, subpath = '') {
  const limited = await rateLimit(request, env, 'parish-settlement-profiles', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!commerceDatabase(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const segments = String(subpath || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);

  // Every request self-heals the parish's giving default, and its commerce
  // default if Parish + is active, so the list is never empty for a
  // verified parish — mirrors the "ensure a default profile exists" spec
  // without needing a separate onboarding hook to have run first.
  await ensureDefaultGivingProfile(env, parishId);
  if (bookstoreEnabledFor(found.registration)) {
    await ensureDefaultCommerceProfile(env, parishId);
  }

  if (request.method === 'GET' && segments.length === 0) {
    const profiles = await listSettlementProfiles(env, parishId);
    return json({
      profiles,
      profileTypes: SETTLEMENT_PROFILE_TYPES,
      stewardshipActive: bookstoreEnabledFor(found.registration),
    });
  }

  if (request.method === 'POST' && segments.length === 0) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const result = await createSettlementProfile(env, parishId, { name: body.name, profileType: body.profileType });
    if (result.error) return json({ error: result.error }, { status: 422 });
    return json({ profile: settlementProfileToJson(result.profile) });
  }

  const profileId = segments[0];
  if (!profileId) return json({ error: 'Not found' }, { status: 404 });

  if (request.method === 'PATCH' && segments.length === 1) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (typeof body.name === 'string') {
      const result = await renameSettlementProfile(env, parishId, profileId, body.name);
      if (result.error) return json({ error: result.error }, { status: 422 });
      await recordAuditEvent(env, request, {
        action: 'settlement_profile.renamed',
        actorUserId: parishId,
        actorType: 'parish',
        targetType: 'settlement_profile',
        targetId: profileId,
        organizationId: parishId,
        after: { name: body.name },
      });
      return json({ profile: settlementProfileToJson(result.profile) });
    }
    if (typeof body.isActive === 'boolean') {
      const result = await setProfileActive(env, parishId, profileId, body.isActive);
      if (result.error) return json({ error: result.error }, { status: 422 });
      await recordAuditEvent(env, request, {
        action: 'settlement_profile.active_changed',
        actorUserId: parishId,
        actorType: 'parish',
        targetType: 'settlement_profile',
        targetId: profileId,
        organizationId: parishId,
        after: { isActive: body.isActive },
      });
      return json({ profile: settlementProfileToJson(result.profile) });
    }
    return json({ error: 'Nothing to update' }, { status: 400 });
  }

  if (request.method === 'POST' && segments[1] === 'default-giving') {
    const result = await setDefaultGivingProfile(env, parishId, profileId);
    if (result.error) return json({ error: result.error }, { status: 422 });
    await recordAuditEvent(env, request, {
      action: 'settlement_profile.default_giving_changed',
      actorUserId: parishId,
      actorType: 'parish',
      targetType: 'settlement_profile',
      targetId: profileId,
      organizationId: parishId,
    });
    return json({ profile: settlementProfileToJson(result.profile) });
  }

  if (request.method === 'POST' && segments[1] === 'default-commerce') {
    const result = await setDefaultCommerceProfile(env, parishId, profileId);
    if (result.error) return json({ error: result.error }, { status: 422 });
    await recordAuditEvent(env, request, {
      action: 'settlement_profile.default_commerce_changed',
      actorUserId: parishId,
      actorType: 'parish',
      targetType: 'settlement_profile',
      targetId: profileId,
      organizationId: parishId,
    });
    return json({ profile: settlementProfileToJson(result.profile) });
  }

  if (request.method === 'POST' && segments[1] === 'assign-module') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const result = await assignModuleProfile(env, parishId, body.moduleKey, profileId);
    if (result.error) return json({ error: result.error }, { status: 422 });
    await recordAuditEvent(env, request, {
      action: 'settlement_profile.module_assigned',
      actorUserId: parishId,
      actorType: 'parish',
      targetType: 'settlement_profile',
      targetId: profileId,
      organizationId: parishId,
      after: { moduleKey: body.moduleKey },
    });
    return json(result);
  }

  return json({ error: 'Not found' }, { status: 404 });
}

function commerceMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export async function sendCommerceReceiptIfNeeded(env, orderId) {
  if (!commerceDatabase(env) || !orderId || !String(env.RESEND_API_KEY || '').trim()) {
    return { status: 'not_configured' };
  }
  const order = await d1First(env, 'SELECT * FROM commerce_orders WHERE id = ?', orderId);
  if (!order?.donor_email || !['paid', 'partially_refunded', 'refunded'].includes(order.payment_status)) return null;

  const now = new Date().toISOString();
  const claim = await d1Run(
    env,
    `
    UPDATE commerce_orders
    SET receipt_email_status = 'sending', updated_at = ?
    WHERE id = ?
      AND (
        COALESCE(receipt_email_status, '') NOT IN ('sending', 'sent')
        OR (receipt_email_status = 'sending' AND datetime(updated_at) <= datetime('now', '-15 minutes'))
      )
  `,
    now,
    order.id
  );
  if (changedRows(claim) !== 1) return { status: 'already_claimed' };

  try {
    const items = await d1All(
      env,
      `
      SELECT item_name, item_description, quantity, subtotal_cents
      FROM commerce_order_items
      WHERE order_id = ?
      ORDER BY created_at, id
    `,
      order.id
    );
    const found = await findRegistrationByParishId(env, order.parish_id);
    const registration = found?.registration || {};
    const parishName =
      registration.commerceSellerDisplayName || registration.name || registration.parishName || 'your parish';
    const channelLabel = order.commerce_module === 'events' ? 'Meals & Events' : 'Bookstore';
    const itemRows = (
      items.length
        ? items
        : [
            {
              item_name: order.item_description,
              quantity: order.quantity,
              subtotal_cents: order.subtotal_cents,
            },
          ]
    )
      .map(
        (item) => `
      <tr>
        <td style="padding:7px 10px 7px 0;color:#171715;">${htmlEscape(item.item_name || item.item_description || 'Commerce item')} × ${Math.max(1, Number(item.quantity || 1))}</td>
        <td style="padding:7px 0;text-align:right;color:#171715;">${commerceMoney(item.subtotal_cents)}</td>
      </tr>`
      )
      .join('');
    const appUrl = env.AGAPAY_APP_URL || env.AGAPAY_PUBLIC_URL || 'https://agapay.app';
    const result = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
      to: [String(order.donor_email).trim().toLowerCase()],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
      subject: `${channelLabel} receipt — ${parishName}`,
      html: agapayEmailHtml(
        appUrl,
        `${channelLabel} receipt`,
        `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Thank you, ${htmlEscape(order.donor_name || 'friend')}. Your purchase from <strong>${htmlEscape(parishName)}</strong> is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${itemRows}
          <tr><td style="padding:9px 10px 7px 0;border-top:1px solid #E5DED0;"><strong>Subtotal</strong></td><td style="padding:9px 0 7px;border-top:1px solid #E5DED0;text-align:right;">${commerceMoney(order.subtotal_cents)}</td></tr>
          <tr><td style="padding:7px 10px 7px 0;"><strong>Sales tax</strong></td><td style="padding:7px 0;text-align:right;">${commerceMoney(order.tax_cents)}</td></tr>
          <tr><td style="padding:7px 10px 7px 0;"><strong>Total charged</strong></td><td style="padding:7px 0;text-align:right;"><strong>${commerceMoney(order.total_charged_cents)}</strong></td></tr>
        </table>
        ${order.pickup_note ? `<p style="margin:18px 0 0;font-size:13px;color:#595959;"><strong>Pickup note:</strong> ${htmlEscape(order.pickup_note)}</p>` : ''}
        <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#6F6A60;">This is a purchase receipt, not a charitable-contribution acknowledgment.</p>
      `
      ),
      text: `${channelLabel} receipt from ${parishName}\nSubtotal: ${commerceMoney(order.subtotal_cents)}\nSales tax: ${commerceMoney(order.tax_cents)}\nTotal charged: ${commerceMoney(order.total_charged_cents)}\nThis is a purchase receipt, not a charitable-contribution acknowledgment.`,
    });
    const status = result?.status === 'sent' ? 'sent' : result?.status || 'failed';
    await d1Run(
      env,
      `
      UPDATE commerce_orders
      SET receipt_email_status = ?, receipt_email_id = ?, receipt_email_sent_at = ?, updated_at = ?
      WHERE id = ?
    `,
      status,
      result?.id || '',
      status === 'sent' ? now : null,
      now,
      order.id
    );
    return result;
  } catch (error) {
    await d1Run(
      env,
      "UPDATE commerce_orders SET receipt_email_status = 'failed', updated_at = ? WHERE id = ?",
      new Date().toISOString(),
      order.id
    );
    return { status: 'failed', detail: error?.message || String(error) };
  }
}

// Marks a commerce order paid once Stripe confirms, and reconciles
// real Stripe fees / parish net from the balance transaction. Without this the
// order sits at payment_status='pending' forever and never shows up in sales
// reporting. Replays do not re-apply inventory; a later Checkout Session may
// still reconcile automatic-tax facts after a PaymentIntent arrived first.
// `object` is the Stripe checkout.session (kind='session') or payment_intent
// (kind='payment_intent') from the webhook.
export async function completeCommerceOrderFromStripe(env, object = {}, kind = 'session') {
  if (!commerceDatabase(env)) return null;
  const meta = object.metadata || {};

  const paymentIntentId =
    kind === 'payment_intent'
      ? object.id || ''
      : checkoutPaymentIntentId(object) || stripeObjectId(object.payment_intent) || '';

  let order = null;
  if (kind === 'session' && object.id) {
    order = await d1First(env, `SELECT * FROM commerce_orders WHERE checkout_session_id = ?`, object.id);
  }
  if (!order && meta.order_id) {
    order = await d1First(env, `SELECT * FROM commerce_orders WHERE id = ?`, meta.order_id);
  }
  if (!order && paymentIntentId) {
    order = await d1First(env, `SELECT * FROM commerce_orders WHERE stripe_payment_intent_id = ?`, paymentIntentId);
  }
  if (!order) return null;
  // Stripe does not guarantee webhook delivery order. A refund or dispute can
  // be processed before a delayed payment/session completion event, so never
  // let completion regress one of those later lifecycle states back to paid.
  if (['paid', 'partially_refunded', 'refunded', 'disputed', 'dispute_closed'].includes(order.payment_status)) {
    const replayNow = new Date().toISOString();
    let replayedOrder = order;
    if (kind === 'session') {
      const hasSessionTax = object.total_details?.amount_tax != null;
      const hasSessionTotal = object.amount_total != null;
      const reconciledTaxCents = hasSessionTax
        ? numericCents(object.total_details.amount_tax)
        : Number(order.tax_cents || 0);
      const reconciledTotalCents = hasSessionTotal
        ? numericCents(object.amount_total)
        : Number(order.total_charged_cents || 0);
      await d1Run(
        env,
        `
        UPDATE commerce_orders
        SET tax_cents = ?, total_charged_cents = ?,
            stripe_payment_intent_id = COALESCE(NULLIF(?, ''), stripe_payment_intent_id),
            stripe_customer_id = COALESCE(NULLIF(?, ''), stripe_customer_id),
            updated_at = ?
        WHERE id = ?
      `,
        reconciledTaxCents,
        reconciledTotalCents,
        paymentIntentId,
        stripeObjectId(object.customer),
        replayNow,
        order.id
      );
      replayedOrder = {
        ...order,
        tax_cents: reconciledTaxCents,
        total_charged_cents: reconciledTotalCents,
        stripe_payment_intent_id: paymentIntentId || order.stripe_payment_intent_id,
        stripe_customer_id: stripeObjectId(object.customer) || order.stripe_customer_id,
        updated_at: replayNow,
      };
    }
    await promotePaidScannedBooksToCatalog(env, replayedOrder, replayNow);
    return replayedOrder;
  }

  const fees = paymentIntentId
    ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, order.parish_id, {
        chargeCents: numericCents(object.amount_total || object.amount_received || order.total_charged_cents),
        coverFees: order.cover_fees === 1,
      })
    : {};

  const totalCents =
    numericCents(object.amount_total || object.amount_received) ||
    Number(fees.chargeCents || 0) ||
    Number(order.subtotal_cents || 0);
  const taxCents = numericCents(object.total_details?.amount_tax) || Number(order.tax_cents || 0);
  const stripeFeeCents = Number(fees.stripeFeeCents || 0);
  const agapayFeeCents = Number(fees.agapayFeeCents || 0); // bookstore takes no AGAPAY fee
  const netCents = Number(fees.parishNetCents || Math.max(0, totalCents - stripeFeeCents - agapayFeeCents));
  const refundedCents = Number(fees.stripeRefundedCents || 0);
  const paymentStatus = fees.stripeDisputed
    ? 'disputed'
    : refundedCents >= totalCents
      ? 'refunded'
      : refundedCents > 0
        ? 'partially_refunded'
        : 'paid';
  const status = paymentStatus === 'paid' ? 'completed' : paymentStatus;
  const now = new Date().toISOString();
  const completedAt = object.created ? new Date(object.created * 1000).toISOString() : now;

  await d1Run(
    env,
    `UPDATE commerce_orders
     SET payment_status = ?, status = ?,
         tax_cents = ?, total_charged_cents = ?, stripe_fee_cents = ?, agapay_fee_cents = ?,
         parish_net_cents = ?, stripe_payment_intent_id = ?, stripe_charge_id = ?,
         stripe_customer_id = COALESCE(NULLIF(?, ''), stripe_customer_id),
          fulfillment_status = CASE
            WHEN COALESCE(parish_notes, '') LIKE '%Inventory attention:%' THEN fulfillment_status
            WHEN fulfillment_status = 'pending' THEN 'ready'
            ELSE fulfillment_status
          END,
         completed_at = ?, updated_at = ?
     WHERE id = ?`,
    paymentStatus,
    status,
    taxCents,
    totalCents,
    stripeFeeCents,
    agapayFeeCents,
    netCents,
    paymentIntentId || order.stripe_payment_intent_id || '',
    fees.stripeChargeId || order.stripe_charge_id || '',
    object.customer || order.stripe_customer_id || '',
    completedAt,
    now,
    order.id
  );

  await promotePaidScannedBooksToCatalog(env, order, now);
  if (order.commerce_module === 'bookstore' || order.commerce_module === 'events') {
    await applyBookstoreInventoryAtCompletion(env, order, now, order.commerce_module);
  }

  return {
    ...order,
    payment_status: paymentStatus,
    status,
    tax_cents: taxCents,
    total_charged_cents: totalCents,
    stripe_fee_cents: stripeFeeCents,
    agapay_fee_cents: agapayFeeCents,
    parish_net_cents: netCents,
    stripe_payment_intent_id: paymentIntentId || order.stripe_payment_intent_id || '',
    completed_at: completedAt,
  };
}

// Reflects a Stripe refund back onto the bookstore order so sales reporting
// stays honest. Safe to call for any charge — no-ops when the charge isn't a
// bookstore order.
export async function refundCommerceOrderFromStripe(env, charge = {}) {
  if (!commerceDatabase(env)) return null;
  const pi = stripeObjectId(charge.payment_intent);
  if (!pi) return null;
  const order = await d1First(
    env,
    `SELECT id, total_charged_cents FROM commerce_orders WHERE stripe_payment_intent_id = ?`,
    pi
  );
  if (!order) return null;
  const refunded = numericCents(charge.amount_refunded);
  const full = refunded >= numericCents(charge.amount || order.total_charged_cents);
  const state = full ? 'refunded' : 'partially_refunded';
  await d1Run(
    env,
    `UPDATE commerce_orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
    state,
    state,
    new Date().toISOString(),
    order.id
  );
  return order;
}

// Reflects Stripe disputes back onto commerce orders (any module). Safe to
// call for any charge dispute: unknown payment intents no-op.
export async function disputeCommerceOrderFromStripe(env, dispute = {}, phase = 'created') {
  if (!commerceDatabase(env)) return null;
  const pi = stripeObjectId(dispute.payment_intent);
  if (!pi) return null;
  const order = await d1First(env, `SELECT id FROM commerce_orders WHERE stripe_payment_intent_id = ?`, pi);
  if (!order) return null;
  const won = String(dispute.status || '').toLowerCase() === 'won';
  const state = phase === 'closed' ? (won ? 'completed' : 'dispute_closed') : 'disputed';
  const paymentStatus = phase === 'closed' ? (won ? 'paid' : 'dispute_closed') : 'disputed';
  await d1Run(
    env,
    `UPDATE commerce_orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
    paymentStatus,
    state,
    new Date().toISOString(),
    order.id
  );
  return order;
}
