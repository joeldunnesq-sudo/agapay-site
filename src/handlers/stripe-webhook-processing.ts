import type {
  StripeWebhookObject,
  StripeWebhookEvent,
  StripeHandlerEnv,
  StripeObjectResponse,
} from './stripe-composition-contracts.js';

import { recordServiceInvoice, postServiceInvoices } from '../accounting/service-costs.js';
import { detectAccountingEnvironment } from '../accounting/environment.js';

import { resolveOperationalAccountingDatabase } from '../accounting/source-wiring.js';

import {
  subscriptionSetupUpdates,
  invoiceDonationMetadata,
  invoicePaymentIntentId,
  invoiceSubscriptionId,
} from '../payments/donation-events.js';

import '../lib/core.js';

import '../lib/logging.js';

import {
  normalizeSubscriptionAddOns,
  subscriptionTier,
  subscriptionTierFromStripePriceId,
} from '../lib/subscriptions.js';

import '../lib/subscription-checkout.js';

import { persistLearnBillingFromStripe } from '../learn/billing.js';

import { agapayEmailHtml, sendEmail } from '../lib/email.js';

import '../lib/format.js';

import {
  booleanFromStripeMetadata,
  checkoutPaymentIntentId,
  numericCents,
  stripeAccountStatus,
  stripeGetConnectedRequest,
  stripeGetRequest,
  stripeObjectId,
} from '../lib/stripe-connect.js';

import { upsertStripeChargeVolumeRecord } from '../lib/stripe-volume.js';

import '../lib/stripe-fees.js';

import '../lib/parish-onboarding.js';

import '../lib/parish-notifications.js';

import { releaseEarlyAdopterReservation } from '../lib/early-adopter-pricing.js';

import {
  findRegistrationByStripeAccountId,
  findRegistrationByStripeSubscriptionId,
  findCheckoutParish,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadRegistrationByReference,
  storeDonorOffering,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
  updateDonorOfferingByPaymentIntent,
} from './parish.js';

import { ensureCommemorationEntryFromOffering } from './parish-commemorations.js';

import {
  completeCommerceOrderFromStripe,
  disputeCommerceOrderFromStripe,
  refundCommerceOrderFromStripe,
  sendCommerceReceiptIfNeeded,
} from './parish-commerce.js';

import {
  wireCommerceDisputeToAccounting,
  wireCommerceOrderToAccounting,
  wireCommerceRefundsToAccounting,
  wireGivingDisputeToAccounting,
  wireGivingOfferingToAccounting,
  wireGivingRefundsToAccounting,
  wireStripePayoutToAccounting,
} from '../accounting/source-wiring.js';
import { parishForStripeAccount } from './stripe-event-context.js';
import './stripe-shared.js';
import { sendDonationReceiptIfNeeded, isCommerceOrderCompletion } from './stripe-shared.js';
import { stripePayoutBankSummary, invalidateAndSaveMaterialRegistration } from './stripe-account-refresh.js';
import { subscriptionStatusFromStripe, updateSubscriptionRecord } from './stripe.js';

export async function processStripeWebhookEvent(env: StripeHandlerEnv, event: StripeWebhookEvent) {
  const object = (event.data?.object || {}) as StripeWebhookObject;
  if (event.type === 'payout.paid') {
    if (!event.account || event.livemode !== (detectAccountingEnvironment(env) === 'production')) return;
    const parishId = await parishForStripeAccount(env, event.account);
    if (!parishId) return;
    const { arrival_date: arrivalDate, amount, currency } = object;
    if (
      object.object !== 'payout' ||
      object.status !== 'paid' ||
      !/^po_[A-Za-z0-9_]+$/.test(object.id || '') ||
      typeof amount !== 'number' ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      typeof currency !== 'string' ||
      !/^[a-z]{3}$/.test(currency) ||
      typeof arrivalDate !== 'number' ||
      !Number.isFinite(new Date(arrivalDate * 1000).getTime()) ||
      arrivalDate <= 0
    )
      throw new Error('Stripe paid payout was missing required settlement facts.');
    await wireStripePayoutToAccounting(env, parishId, {
      id: object.id,
      amount,
      currency,
      arrivalDate,
      balanceTransactionId: typeof object.balance_transaction === 'string' ? object.balance_transaction : '',
    });
    return;
  }
  if (event.type === 'charge.succeeded' || event.type === 'charge.updated' || event.type === 'charge.refunded') {
    const stripeAccountId = event.account || stripeObjectId(object.on_behalf_of);
    const found = stripeAccountId ? await findRegistrationByStripeAccountId(env, stripeAccountId) : null;
    const parishId = found?.registration?.parishId || object.metadata?.parish_id || '';
    if (parishId && stripeAccountId && object.id) {
      await upsertStripeChargeVolumeRecord(env, parishId, stripeAccountId, object);
    }
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (object.metadata?.product === 'learn') {
      await persistLearnBillingFromStripe(env, {
        ...object,
        status: object.mode === 'subscription' ? 'active' : object.payment_status || 'active',
        stripeSubscriptionId: object.subscription || '',
        checkoutSessionId: object.id || '',
      });
      const toEmail = object.customer_details?.email || object.customer_email || object.metadata?.donor_email || '';
      if (toEmail) {
        const appUrl = env.AGAPAY_PUBLIC_URL || 'https://agapay.app';
        const setupUrl = `${appUrl}/myagapay/learn/setup`;
        const dashUrl = `${appUrl}/myagapay/learn`;
        await sendEmail(env, {
          from: 'AGAPAY Learn <learn@agapay.app>',
          to: [toEmail],
          subject: 'Welcome to AGAPAY Learn',
          html: agapayEmailHtml(
            appUrl,
            'Welcome to AGAPAY Learn',
            `
            <p style="margin:0 0 18px;">Thank you for joining AGAPAY Learn. Your Family plan is now active.</p>
            <p style="margin:0 0 18px;">AGAPAY Learn is an Orthodox Christian homeschool planning application for your household. It brings Church rhythms, lesson planning, books, Grace Mode, and printable plans into one calm workspace shaped by the liturgical calendar.</p>
            <p style="margin:0 0 8px;"><strong>Get started in three steps:</strong></p>
            <ol style="margin:0 0 18px;padding-left:22px;line-height:1.9;">
              <li>Complete your household setup — name your children, set your school year and terms, and choose your Church calendar.</li>
              <li>Add your subjects, books, and Church rhythm.</li>
              <li>Open Today's dashboard each morning for your liturgical day, church rhythms, and household plan.</li>
            </ol>
            <div style="text-align:center;margin:28px 0;">
              <a href="${setupUrl}" style="display:inline-block;background:#07284A;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 32px;font-size:16px;font-weight:700;border:1px solid #C9A25B;">Set Up Your Household →</a>
            </div>
            <p style="margin:0 0 10px;color:#595959;font-size:13px;">Already set up? <a href="${dashUrl}" style="color:#C9A25B;">Go to your dashboard</a>.</p>
            <p style="margin:0;color:#595959;font-size:13px;">If you have any questions, reply to this email. We read every message.</p>
          `
          ),
        }).catch(() => {});
      }
      return;
    }

    if (isCommerceOrderCompletion(object)) {
      const order = await completeCommerceOrderFromStripe(env, object, 'session');
      if (order?.id) {
        await wireCommerceOrderToAccounting(env, order.id);
        await sendCommerceReceiptIfNeeded(env, order.id);
      }
      return;
    }

    const existingOffering = object.id ? await loadDonorOfferingByCheckout(env, object.id) : null;
    const setup = (existingOffering || object.metadata?.donor_email) && subscriptionSetupUpdates(object);
    if (setup) {
      await updateDonorOfferingByCheckout(env, object.id, setup);
      return;
    }

    const paymentStatus = object.payment_status || 'pending';
    const status = paymentStatus === 'paid' ? 'completed' : 'pending';
    const paymentIntentId = checkoutPaymentIntentId(object);
    const feeUpdates =
      status === 'completed' && paymentIntentId
        ? await stripePaymentIntentFinancialUpdates(
            env,
            paymentIntentId,
            object.metadata?.parish_id || existingOffering?.parishId || '',
            existingOffering || object.metadata || {}
          )
        : {};
    const updatedOffering = await updateDonorOfferingByCheckout(env, object.id, {
      status,
      paymentStatus,
      stripeCustomerId: object.customer || '',
      stripePaymentIntentId: paymentIntentId || '',
      stripeSubscriptionId: object.subscription || '',
      completedAt:
        status === 'completed'
          ? object.created
            ? new Date(object.created * 1000).toISOString()
            : new Date().toISOString()
          : '',
      ...feeUpdates,
    });
    if (status === 'completed' || paymentStatus === 'paid') {
      if (updatedOffering) await wireGivingOfferingToAccounting(env, updatedOffering);
      await ensureCommemorationEntryFromOffering(env, updatedOffering || {}, {
        checkoutSessionId: object.id,
        id: object.id,
        parishId: object.metadata?.parish_id || updatedOffering?.parishId || '',
        parishName: object.metadata?.parish_name || updatedOffering?.parishName || '',
        donorEmail:
          object.metadata?.donor_email ||
          object.customer_details?.email ||
          object.customer_email ||
          updatedOffering?.donorEmail ||
          '',
        donorName: object.metadata?.donor_name || object.customer_details?.name || updatedOffering?.donorName || '',
        giftType: object.metadata?.gift_type || updatedOffering?.giftType || '',
        frequency: object.metadata?.frequency || updatedOffering?.frequency || 'once',
        amountCents:
          numericCents(object.metadata?.amount_cents) ||
          updatedOffering?.amountCents ||
          object.amount_subtotal ||
          object.amount_total ||
          0,
        namesLiving: object.metadata?.names_living || updatedOffering?.namesLiving || '',
        namesDeparted: object.metadata?.names_departed || updatedOffering?.namesDeparted || '',
        commemorationKind:
          object.metadata?.commemoration_kind || updatedOffering?.commemorationKind || 'proskomedia_liturgy',
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
      });
      await sendDonationReceiptIfNeeded(env, updatedOffering || {});
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    await updateDonorOfferingByCheckout(env, object.id, {
      status: 'failed',
      paymentStatus: object.payment_status || 'failed',
      stripeCustomerId: object.customer || '',
      stripePaymentIntentId: object.payment_intent || '',
      failureMessage: object.last_payment_error?.message || '',
      failedAt: new Date().toISOString(),
    });
  }

  if (event.type === 'checkout.session.expired') {
    await updateDonorOfferingByCheckout(env, object.id, {
      status: 'expired',
      paymentStatus: object.payment_status || 'unpaid',
      expiredAt: object.expires_at ? new Date(object.expires_at * 1000).toISOString() : new Date().toISOString(),
    });
    if (object.mode === 'subscription') {
      const reference = object.metadata?.agapay_reference || object.client_reference_id || '';
      if (reference) {
        await updateSubscriptionRecord(env, reference, {
          subscriptionStatus: 'not_started',
          stripeSubscriptionCheckoutSessionId: object.id || '',
          stripeSubscriptionCheckoutSessionStatus: 'expired',
        });
      }
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    if (isCommerceOrderCompletion(object)) {
      // PaymentIntent events do not contain Checkout Session automatic-tax
      // totals. Complete payment/inventory now, then let the session webhook
      // reconcile tax and become the accounting/receipt source of truth.
      await completeCommerceOrderFromStripe(env, object, 'payment_intent');
      return;
    }
    const existingOffering = await loadDonorOfferingByPaymentIntent(env, object.id);
    const feeUpdates = await stripePaymentIntentFinancialUpdates(
      env,
      object.id,
      object.metadata?.parish_id || existingOffering?.parishId || '',
      existingOffering || object.metadata || {}
    );
    const updatedOffering = await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: 'completed',
      paymentStatus: 'paid',
      stripeCustomerId: object.customer || '',
      completedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
      ...feeUpdates,
    });
    if (updatedOffering) await wireGivingOfferingToAccounting(env, updatedOffering);
    await ensureCommemorationEntryFromOffering(env, updatedOffering || {}, {
      id: updatedOffering?.checkoutSessionId || updatedOffering?.stripePaymentIntentId || object.id,
      stripePaymentIntentId: object.id,
      parishId: updatedOffering?.parishId || object.metadata?.parish_id || '',
      parishName: updatedOffering?.parishName || object.metadata?.parish_name || '',
      donorEmail: updatedOffering?.donorEmail || object.metadata?.donor_email || '',
      donorName: updatedOffering?.donorName || object.metadata?.donor_name || '',
      giftType: updatedOffering?.giftType || object.metadata?.gift_type || '',
      frequency: updatedOffering?.frequency || object.metadata?.frequency || 'once',
      amountCents: updatedOffering?.amountCents || object.amount_received || object.amount || 0,
      namesLiving: updatedOffering?.namesLiving || object.metadata?.names_living || '',
      namesDeparted: updatedOffering?.namesDeparted || object.metadata?.names_departed || '',
      commemorationKind:
        updatedOffering?.commemorationKind || object.metadata?.commemoration_kind || 'proskomedia_liturgy',
      createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
    });
    await sendDonationReceiptIfNeeded(env, updatedOffering || {});
  }

  if (event.type === 'payment_intent.payment_failed') {
    await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: 'failed',
      paymentStatus: 'failed',
      failureMessage: object.last_payment_error?.message || '',
      failedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
    });
  }

  if (event.type === 'payment_intent.canceled') {
    await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: 'cancelled',
      paymentStatus: 'cancelled',
      cancelledAt: object.canceled_at ? new Date(object.canceled_at * 1000).toISOString() : new Date().toISOString(),
    });
  }

  if (event.type === 'charge.refunded' || (event.type === 'refund.updated' && object.status === 'succeeded')) {
    let charge = object;
    if (event.type === 'refund.updated') {
      const chargeId = stripeObjectId(object.charge);
      if (!chargeId) return;
      const path = `/v1/charges/${encodeURIComponent(chargeId)}`;
      const response = event.account
        ? await stripeGetConnectedRequest(env, path, event.account)
        : await stripeGetRequest(env, path);
      if (!response.ok) throw new Error('Unable to load the charge for the updated Stripe refund.');
      charge = response.body as StripeWebhookObject;
    }
    const commerceOrder = await refundCommerceOrderFromStripe(env, charge);
    if (commerceOrder?.id) await wireCommerceRefundsToAccounting(env, commerceOrder.id, charge, event.account);
    const paymentIntentId = stripeObjectId(charge.payment_intent);
    const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
    const refundedCents = numericCents(charge.amount_refunded);
    if (offering && refundedCents > 0) {
      const refunds = await wireGivingRefundsToAccounting(env, offering, charge, event.account);
      const settledCents = refunds
        ? refunds.reduce((total, refund) => total + (refund?.refundAmount || 0), 0)
        : refundedCents;
      if (!settledCents) return;
      const status = settledCents >= numericCents(charge.amount) ? 'refunded' : 'partially_refunded';
      await updateDonorOfferingByPaymentIntent(env, paymentIntentId, {
        status,
        paymentStatus: status,
        refundedCents: settledCents,
        refundedAt: new Date().toISOString(),
      });
    } else if (
      !offering &&
      !commerceOrder &&
      paymentIntentId &&
      charge.metadata?.donor_email &&
      charge.metadata?.parish_id
    ) {
      throw new Error('The original gift is not yet available for this Stripe refund.');
    }
  }

  if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
    if (String(object.status).startsWith('warning_') || object.status === 'prevented') return;
    const closed = event.type === 'charge.dispute.closed';
    const phase = closed ? 'closed' : 'created';
    const commerceOrder = await disputeCommerceOrderFromStripe(env, object, phase);
    if (commerceOrder?.id) await wireCommerceDisputeToAccounting(env, commerceOrder.id, object, phase);
    const paymentIntentId = stripeObjectId(object.payment_intent);
    const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
    if (!offering) return;

    const occurredAt = new Date((event.created || object.created || Date.now() / 1000) * 1000).toISOString();
    await wireGivingDisputeToAccounting(env, offering, object, { phase, occurredAt });
    const won = closed && object.status === 'won';
    const status = closed ? (won ? 'completed' : 'dispute_closed') : 'disputed';
    await updateDonorOfferingByPaymentIntent(
      env,
      paymentIntentId,
      {
        status,
        paymentStatus: won ? 'paid' : status,
        stripeDisputeId: object.id || '',
        disputedCents: numericCents(object.amount),
        disputeReason: object.reason || offering.disputeReason || '',
        disputedAt: object.created ? new Date(object.created * 1000).toISOString() : occurredAt,
        disputeStatus: closed ? object.status || '' : '',
        disputeClosedAt: closed ? occurredAt : '',
      },
      { disputeResolution: won }
    );
  }

  if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.paid') {
    if (!event.account && !invoiceDonationMetadata(object).donor_email && invoiceSubscriptionId(object)) {
      const billed = await findRegistrationByStripeSubscriptionId(env, invoiceSubscriptionId(object));
      const reference = invoiceDonationMetadata(object).agapay_reference as string | undefined;
      if (!billed && reference && (await loadRegistrationByReference(env, reference)))
        throw new Error('Subscription invoice is awaiting its parish checkout link; retry delivery.');
      const facts = billed && (await recordServiceInvoice(env, object, billed.registration));
      if (facts) {
        const db = await resolveOperationalAccountingDatabase(env, facts.parishId);
        if (db) await postServiceInvoices(env, db, facts.parishId);
      }
    }
    const metadata = invoiceDonationMetadata(object) as Record<string, string>;
    if (metadata.donor_email) {
      let paymentIntentId = invoicePaymentIntentId(object);
      if (!paymentIntentId && env.STRIPE_SECRET_KEY) {
        const accountId = event.account || (await findCheckoutParish(env, metadata.parish_id))?.stripeAccountId;
        if (!accountId) throw new Error('The recurring donation invoice has no connected parish account.');
        const invoice = (await stripeGetConnectedRequest(
          env,
          `/v1/invoices/${encodeURIComponent(object.id)}?expand[]=payments.data.payment.payment_intent`,
          accountId
        )) as StripeObjectResponse;
        if (!invoice.ok) throw new Error('Unable to resolve the recurring donation invoice payment.');
        paymentIntentId = invoicePaymentIntentId(invoice.body as StripeWebhookObject);
      }
      const giftAmountCents = numericCents(metadata.amount_cents) || numericCents(object.amount_paid);
      const feeUpdates = paymentIntentId
        ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, metadata.parish_id || '', {
            amountCents: giftAmountCents,
            giftAmountCents,
            chargeCents: numericCents(metadata.charge_cents) || numericCents(object.amount_paid),
            stripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
            estimatedStripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
            agapayFeeCents: numericCents(metadata.agapay_fee_cents),
            totalFeeCents: numericCents(metadata.total_fee_cents),
            coverFees: booleanFromStripeMetadata(metadata.cover_fees, false),
            paymentMethod: metadata.payment_method || '',
          })
        : {};
      const storedOffering = await storeDonorOffering(env, {
        id: object.id,
        donorEmail: metadata.donor_email,
        donorName: metadata.donor_name || object.customer_name || '',
        parishId: metadata.parish_id || '',
        parishName: metadata.parish_name || '',
        giftType: metadata.gift_type || 'recurring',
        title: metadata.gift_type ? String(metadata.gift_type).replace(/-/g, ' ') : 'Recurring AGAPAY offering',
        fund: metadata.fund || '',
        fundId: metadata.fund_id || '',
        campaign: metadata.campaign || '',
        campaignId: metadata.campaign_id || '',
        campaignDescription: metadata.campaign_description || '',
        publicAnonymous: booleanFromStripeMetadata(metadata.public_anonymous, false),
        publicDisplayName: metadata.public_display_name || metadata.donor_name || object.customer_name || '',
        publicComment: metadata.public_comment || '',
        frequency: metadata.frequency || 'recurring',
        amountCents: giftAmountCents,
        giftAmountCents,
        chargeCents: numericCents(metadata.charge_cents) || numericCents(object.amount_paid),
        stripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
        estimatedStripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
        agapayFeeCents: numericCents(metadata.agapay_fee_cents),
        totalFeeCents: numericCents(metadata.total_fee_cents),
        coverFees: booleanFromStripeMetadata(metadata.cover_fees, false),
        paymentMethod: metadata.payment_method || '',
        status: 'completed',
        paymentStatus: 'paid',
        stripeCustomerId: object.customer || '',
        stripePaymentIntentId: paymentIntentId,
        stripeSubscriptionId: invoiceSubscriptionId(object),
        stripeInvoiceId: object.id,
        stripeLivemode: event.livemode,
        namesLiving: metadata.names_living || '',
        namesDeparted: metadata.names_departed || '',
        commemorationKind: metadata.commemoration_kind || 'proskomedia_liturgy',
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        ...feeUpdates,
      });
      if (storedOffering) await wireGivingOfferingToAccounting(env, storedOffering);
      await ensureCommemorationEntryFromOffering(env, storedOffering || {}, {
        id: object.id,
        parishId: metadata.parish_id || '',
        parishName: metadata.parish_name || '',
        donorEmail: metadata.donor_email || object.customer_email || object.customer_details?.email || '',
        donorName: metadata.donor_name || object.customer_name || '',
        giftType: metadata.gift_type || 'recurring',
        frequency: metadata.frequency || 'recurring',
        amountCents: giftAmountCents,
        namesLiving: metadata.names_living || '',
        namesDeparted: metadata.names_departed || '',
        commemorationKind: metadata.commemoration_kind || 'proskomedia_liturgy',
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
      });
      await sendDonationReceiptIfNeeded(env, storedOffering || {});
    }
  }

  if (
    event.type === 'checkout.session.expired' &&
    object.mode === 'subscription' &&
    object.metadata?.product !== 'learn'
  ) {
    const reference = object.metadata?.agapay_reference || object.client_reference_id || '';
    if (reference) {
      await releaseEarlyAdopterReservation(env, reference);
      await updateSubscriptionRecord(env, reference, {
        subscriptionStatus: 'not_started',
        earlyAdopterSlot: null,
        earlyAdopterReservedAt: '',
        stripeSubscriptionCheckoutSessionStatus: 'expired',
      });
    }
  }

  if (event.type === 'checkout.session.completed' && object.mode === 'subscription') {
    if (object.metadata?.product === 'learn') {
      await persistLearnBillingFromStripe(env, {
        ...object,
        status: 'active',
        stripeSubscriptionId: object.subscription || '',
        checkoutSessionId: object.id || '',
      });
      return;
    }

    const reference = object.metadata?.agapay_reference || object.client_reference_id || '';
    const trialDays = Math.max(0, Number(object.metadata?.agapay_trial_days || 0));
    const activatedAt = new Date().toISOString();
    await updateSubscriptionRecord(env, reference, {
      subscriptionStatus: trialDays ? 'trialing' : 'active',
      subscriptionTrialDays: trialDays,
      stripeCustomerId: object.customer || '',
      stripeSubscriptionId: object.subscription || '',
      stripeSubscriptionCheckoutSessionId: object.id || '',
      subscriptionActivatedAt: activatedAt,
      subscriptionIntroDemoRedeemedAt: trialDays ? activatedAt : '',
      subscriptionTrialStartedAt: trialDays ? activatedAt : '',
      subscriptionTrialEndsAt: trialDays ? new Date(Date.now() + trialDays * 86400000).toISOString() : '',
    });
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted' ||
    event.type === 'customer.subscription.paused' ||
    event.type === 'customer.subscription.resumed'
  ) {
    // A donor's recurring GIVING subscription (created via the /give
    // checkout flow) carries donor_email in its metadata — distinct from
    // the parish's own AGAPAY platform subscription, which uses
    // agapay_reference instead (handled in the branch below). This was
    // previously untracked entirely: nothing recorded when a parishioner
    // canceled a recurring gift, so "canceled recurring gifts" had no real
    // data source. Only the cancellation itself is recorded here — that's
    // the actionable stewardship signal; created/updated/paused/resumed
    // aren't needed for that metric.
    if (object.metadata?.donor_email && event.type === 'customer.subscription.deleted') {
      await storeDonorOffering(env, {
        id: `sub_cancel_${object.id}_${object.canceled_at || Math.floor(Date.now() / 1000)}`,
        donorEmail: object.metadata.donor_email,
        donorName: object.metadata.donor_name || '',
        parishId: object.metadata.parish_id || '',
        parishName: object.metadata.parish_name || '',
        giftType: object.metadata.gift_type || 'recurring',
        title: 'Recurring gift canceled',
        fund: object.metadata.fund || '',
        fundId: object.metadata.fund_id || '',
        frequency: object.metadata.frequency || 'recurring',
        amountCents: 0,
        chargeCents: 0,
        status: 'canceled',
        paymentStatus: 'canceled',
        stripeCustomerId: object.customer || '',
        stripeSubscriptionId: object.id || '',
        createdAt: object.canceled_at ? new Date(object.canceled_at * 1000).toISOString() : new Date().toISOString(),
      }).catch(() => {});
      return;
    }

    if (object.metadata?.product === 'learn') {
      const status =
        event.type === 'customer.subscription.deleted'
          ? 'cancelled'
          : event.type === 'customer.subscription.paused'
            ? 'paused'
            : event.type === 'customer.subscription.resumed'
              ? 'active'
              : subscriptionStatusFromStripe(object.status);
      await persistLearnBillingFromStripe(env, {
        ...object,
        status,
        stripeSubscriptionId: object.id || '',
      });
      return;
    }

    const reference = object.metadata?.agapay_reference || '';
    const activePriceId = object.items?.data?.[0]?.price?.id || '';
    const metadataTierId = object.metadata?.agapay_subscription_tier || '';
    const selectedTier = (subscriptionTierFromStripePriceId(env as Readonly<Record<string, unknown>>, activePriceId) ||
      (metadataTierId
        ? subscriptionTier({
            subscriptionTier: metadataTierId,
            subscriptionPricingProgram: object.metadata?.agapay_pricing_program,
            parishHouseholdBand: object.metadata?.agapay_household_band,
          })
        : null)) as
      | (NonNullable<ReturnType<typeof subscriptionTier>> & { pricingProgram?: string; parishHouseholdBand?: string })
      | null;
    const selectedAddOns = normalizeSubscriptionAddOns(
      object.metadata?.agapay_subscription_add_ons || '',
      selectedTier?.id || metadataTierId
    );
    const stripeMonthlyCents = (object.items?.data || []).reduce(
      (sum, item) => sum + Number(item?.price?.unit_amount || 0) * Number(item?.quantity || 1),
      0
    );
    const tierUpdates = selectedTier
      ? {
          subscriptionTier: selectedTier.id,
          subscriptionTierLabel: selectedTier.label,
          subscriptionAddOns: selectedAddOns,
          subscriptionBaseMonthlyCents: selectedTier.monthlyCents,
          subscriptionMonthlyCents: stripeMonthlyCents || selectedTier.monthlyCents,
          ...(selectedTier.pricingProgram
            ? {
                subscriptionPricingProgram:
                  selectedTier.pricingProgram === 'early_adopter' ? 'founding_20' : selectedTier.pricingProgram,
              }
            : {}),
          ...(selectedTier.parishHouseholdBand ? { parishHouseholdBand: selectedTier.parishHouseholdBand } : {}),
        }
      : {};
    const status =
      event.type === 'customer.subscription.deleted'
        ? 'cancelled'
        : event.type === 'customer.subscription.paused'
          ? 'paused'
          : event.type === 'customer.subscription.resumed'
            ? 'active'
            : subscriptionStatusFromStripe(object.status);
    const trialUpdates = {
      subscriptionCancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      ...(object.status === 'canceled' && object.canceled_at
        ? { subscriptionCancelledAt: new Date(object.canceled_at * 1000).toISOString() }
        : {}),
      subscriptionTrialStartedAt: object.trial_start ? new Date(object.trial_start * 1000).toISOString() : '',
      subscriptionTrialEndsAt: object.trial_end ? new Date(object.trial_end * 1000).toISOString() : '',
    };
    if (reference) {
      await updateSubscriptionRecord(env, reference, {
        subscriptionStatus: status,
        stripeSubscriptionId: object.id || '',
        stripeCustomerId: object.customer || '',
        ...trialUpdates,
        ...tierUpdates,
      });
    } else {
      const found = await findRegistrationByStripeSubscriptionId(env, object.id);
      if (found) {
        await updateSubscriptionRecord(env, found.key, {
          subscriptionStatus: status,
          stripeSubscriptionId: object.id || '',
          stripeCustomerId: object.customer || '',
          ...trialUpdates,
          ...tierUpdates,
        });
      }
    }
  }

  if (event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_action_required') {
    const subscriptionId = object.subscription || '';
    const metadata = (object.subscription_details?.metadata ||
      object.lines?.data?.[0]?.metadata ||
      object.metadata ||
      {}) as Record<string, string>;
    if (metadata.donor_email) {
      await storeDonorOffering(env, {
        id: object.id,
        donorEmail: metadata.donor_email,
        donorName: metadata.donor_name || object.customer_name || '',
        parishId: metadata.parish_id || '',
        parishName: metadata.parish_name || '',
        giftType: metadata.gift_type || 'recurring',
        title: metadata.gift_type ? String(metadata.gift_type).replace(/-/g, ' ') : 'Recurring AGAPAY offering',
        fund: metadata.fund || '',
        fundId: metadata.fund_id || '',
        campaign: metadata.campaign || '',
        campaignId: metadata.campaign || '',
        campaignDescription: metadata.campaign_description || '',
        publicAnonymous: booleanFromStripeMetadata(metadata.public_anonymous, false),
        publicDisplayName: metadata.public_display_name || metadata.donor_name || object.customer_name || '',
        publicComment: metadata.public_comment || '',
        frequency: metadata.frequency || 'recurring',
        amountCents: object.amount_due || object.amount_remaining || object.total || 0,
        chargeCents: object.amount_due || object.amount_remaining || object.total || 0,
        status: 'failed',
        paymentStatus: 'failed',
        stripeCustomerId: object.customer || '',
        stripePaymentIntentId: object.payment_intent || '',
        stripeSubscriptionId: subscriptionId,
        namesLiving: metadata.names_living || '',
        namesDeparted: metadata.names_departed || '',
        commemorationKind: metadata.commemoration_kind || 'proskomedia_liturgy',
        failureMessage: object.last_finalization_error?.message || 'Recurring payment failed.',
        failedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
      });
    }
    const found = await findRegistrationByStripeSubscriptionId(env, subscriptionId);
    if (found) {
      await updateSubscriptionRecord(env, found.key, {
        subscriptionStatus: 'past_due',
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: object.customer || found.registration.stripeCustomerId || '',
        subscriptionPaymentIssueAt: object.created
          ? new Date(object.created * 1000).toISOString()
          : new Date().toISOString(),
        subscriptionPaymentIssueType: event.type,
      });
    }
  }

  if (event.type === 'account.updated') {
    const found = await findRegistrationByStripeAccountId(env, object.id);
    if (found) {
      const next = {
        ...found.registration,
        ...stripePayoutBankSummary(object),
        stripeAccountStatus: stripeAccountStatus(object),
        stripeChargesEnabled: Boolean(object.charges_enabled),
        stripePayoutsEnabled: Boolean(object.payouts_enabled),
        stripeDetailsSubmitted: Boolean(object.details_submitted),
        stripeDisabledReason: object.requirements?.disabled_reason || '',
        stripeRequirementsDue: object.requirements?.currently_due || [],
        stripeStatusCheckedAt: new Date().toISOString(),
      };
      await invalidateAndSaveMaterialRegistration(
        env,
        found.key,
        found.registration,
        next,
        'stripe-webhook',
        'Stripe changed the connected account readiness or payout destination.'
      );
    }
  }
}
