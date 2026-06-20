import {
  claimStripeEvent,
  finishStripeEvent,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from "../lib/core.js";

import {
  subscriptionTier,
} from "../lib/subscriptions.js";

import {
  createSubscriptionCheckoutForRegistration,
} from "../lib/subscription-checkout.js";

import {
  persistLearnBillingFromStripe,
} from "../learn/billing.js";

import {
  absoluteWebsiteUrl,
  slugify,
} from "../lib/format.js";

import {
  booleanFromStripeMetadata,
  checkoutPaymentIntentId,
  numericCents,
  stripeAccountStatus,
  stripeFormRequest,
  stripeGetRequest,
  stripeObjectId,
} from "../lib/stripe-connect.js";

import {
  appendAdminAudit,
  donorName,
  ensureCommemorationEntryFromOffering,
  findRegistrationByStripeAccountId,
  findRegistrationByStripeSubscriptionId,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadRegistrationByReference,
  requireAdminContext,
  saveRegistrationRecord,
  sendTreasurerStripeInvite,
  storeDonorOffering,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
  updateDonorOfferingByPaymentIntent,
} from "./parish.js";

// src/handlers/stripe.js
// Stripe webhook, onboarding, subscription checkout, and refresh handlers.


async function sendDonationReceiptIfNeeded(env, offering = {}) {
  const donorModule = await import("./donor.js");
  return donorModule.sendDonationReceiptIfNeeded(env, offering);
}


export async function handleSubscriptionCheckout(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const response = await createSubscriptionCheckoutForRegistration({
    request,
    env,
    reference,
    registration,
    body,
    returnPath: "/admin",
    saveRegistrationRecord
  });
  let payload = null;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!response.ok || !payload?.registration) return response;

  const audited = appendAdminAudit(payload.registration, "subscription_checkout_created", adminContext.actor, {
    subscriptionTier: payload.registration.subscriptionTier || "",
    subscriptionStatus: payload.registration.subscriptionStatus || "",
    checkoutSessionId: payload.registration.stripeSubscriptionCheckoutSessionId || ""
  });
  await saveRegistrationRecord(env, reference, audited, payload.registration);
  payload.registration = audited;
  return json(payload, { status: response.status });
}

export function parseStripeSignature(header) {
  const values = {};
  for (const part of String(header || "").split(",")) {
    const [key, value] = part.split("=");
    if (key && value) values[key.trim()] = value.trim();
  }
  return values;
}

export function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function secureCompare(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyStripeWebhook(payload, signatureHeader, secret) {
  if (!secret) return false;
  const signature = parseStripeSignature(signatureHeader);
  if (!signature.t || !signature.v1) return false;

  const timestamp = Number(signature.t);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${signature.t}.${payload}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  return secureCompare(toHex(digest), signature.v1);
}

export function stripeWebhookSecrets(env) {
  return [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_CONNECT]
    .filter((secret, index, secrets) => secret && secrets.indexOf(secret) === index);
}

export async function verifyStripeWebhookWithAnySecret(payload, signatureHeader, secrets) {
  for (const secret of secrets) {
    if (await verifyStripeWebhook(payload, signatureHeader, secret)) return true;
  }
  return false;
}

export function subscriptionStatusFromStripe(status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  if (status === "paused") return "paused";
  return status || "not_started";
}

export async function updateSubscriptionRecord(env, reference, updates) {
  if (!hasProductionStore(env) || !reference) return null;
  const current = await loadRegistrationByReference(env, reference);
  if (!current) return null;
  const updated = {
    ...current,
    ...updates,
    subscriptionUpdatedAt: new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, current);
  return updated;
}

export async function handleStripeWebhook(request, env) {
  const secrets = stripeWebhookSecrets(env);
  if (!secrets.length) {
    return json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const verified = await verifyStripeWebhookWithAnySecret(payload, request.headers.get("Stripe-Signature"), secrets);
  if (!verified) return json({ error: "Invalid Stripe signature" }, { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const claim = await claimStripeEvent(env, event);
  if (!claim.claimed) {
    return json({ received: true, duplicate: true, status: claim.status || "processed" });
  }

  try {
    await processStripeWebhookEvent(env, event);
    await finishStripeEvent(env, event.id, "processed");
    return json({ received: true });
  } catch (error) {
    await finishStripeEvent(env, event.id, "failed", error?.message || String(error));
    return json(
      { error: "Webhook processing failed", detail: error?.message || "Unknown webhook error" },
      { status: 500 }
    );
  }
}

export async function processStripeWebhookEvent(env, event) {
  const object = event.data?.object || {};
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (object.metadata?.product === "learn") {
      await persistLearnBillingFromStripe(env, {
        ...object,
        status: object.mode === "subscription" ? "active" : object.payment_status || "active",
        stripeSubscriptionId: object.subscription || "",
        checkoutSessionId: object.id || ""
      });
      return;
    }

    const paymentStatus = object.payment_status || "paid";
    const status = paymentStatus === "paid" || object.mode === "subscription" ? "completed" : "pending";
    const existingOffering = object.id ? await loadDonorOfferingByCheckout(env, object.id) : null;
    const paymentIntentId = checkoutPaymentIntentId(object);
    const feeUpdates = status === "completed" && paymentIntentId
      ? await stripePaymentIntentFinancialUpdates(
        env,
        paymentIntentId,
        object.metadata?.parish_id || existingOffering?.parishId || "",
        existingOffering || object.metadata || {}
      )
      : {};
    const updatedOffering = await updateDonorOfferingByCheckout(env, object.id, {
      status,
      paymentStatus,
      stripeCustomerId: object.customer || "",
      stripePaymentIntentId: paymentIntentId || "",
      stripeSubscriptionId: object.subscription || "",
      completedAt: status === "completed" ? (object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()) : "",
      ...feeUpdates
    });
    if (status === "completed" || paymentStatus === "paid") {
      await ensureCommemorationEntryFromOffering(env, updatedOffering || {}, {
        checkoutSessionId: object.id,
        id: object.id,
        parishId: object.metadata?.parish_id || updatedOffering?.parishId || "",
        parishName: object.metadata?.parish_name || updatedOffering?.parishName || "",
        donorEmail: object.metadata?.donor_email || object.customer_details?.email || object.customer_email || updatedOffering?.donorEmail || "",
        donorName: object.metadata?.donor_name || object.customer_details?.name || updatedOffering?.donorName || "",
        giftType: object.metadata?.gift_type || updatedOffering?.giftType || "",
        frequency: object.metadata?.frequency || updatedOffering?.frequency || "once",
        amountCents: numericCents(object.metadata?.amount_cents) || updatedOffering?.amountCents || object.amount_subtotal || object.amount_total || 0,
        namesLiving: object.metadata?.names_living || updatedOffering?.namesLiving || "",
        namesDeparted: object.metadata?.names_departed || updatedOffering?.namesDeparted || "",
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
      });
      await sendDonationReceiptIfNeeded(env, updatedOffering || {});
    }
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await updateDonorOfferingByCheckout(env, object.id, {
      status: "failed",
      paymentStatus: object.payment_status || "failed",
      stripeCustomerId: object.customer || "",
      stripePaymentIntentId: object.payment_intent || "",
      failureMessage: object.last_payment_error?.message || "",
      failedAt: new Date().toISOString()
    });
  }

  if (event.type === "checkout.session.expired") {
    await updateDonorOfferingByCheckout(env, object.id, {
      status: "expired",
      paymentStatus: object.payment_status || "unpaid",
      expiredAt: object.expires_at ? new Date(object.expires_at * 1000).toISOString() : new Date().toISOString()
    });
    if (object.mode === "subscription") {
      const reference = object.metadata?.agapay_reference || object.client_reference_id || "";
      if (reference) {
        await updateSubscriptionRecord(env, reference, {
          subscriptionStatus: "not_started",
          stripeSubscriptionCheckoutSessionId: object.id || "",
          stripeSubscriptionCheckoutSessionStatus: "expired"
        });
      }
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const existingOffering = await loadDonorOfferingByPaymentIntent(env, object.id);
    const feeUpdates = await stripePaymentIntentFinancialUpdates(
      env,
      object.id,
      object.metadata?.parish_id || existingOffering?.parishId || "",
      existingOffering || object.metadata || {}
    );
    const updatedOffering = await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: "completed",
      paymentStatus: "paid",
      stripeCustomerId: object.customer || "",
      completedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
      ...feeUpdates
    });
    await ensureCommemorationEntryFromOffering(env, updatedOffering || {}, {
      id: updatedOffering?.checkoutSessionId || updatedOffering?.stripePaymentIntentId || object.id,
      stripePaymentIntentId: object.id,
      parishId: updatedOffering?.parishId || object.metadata?.parish_id || "",
      parishName: updatedOffering?.parishName || object.metadata?.parish_name || "",
      donorEmail: updatedOffering?.donorEmail || object.metadata?.donor_email || "",
      donorName: updatedOffering?.donorName || object.metadata?.donor_name || "",
      giftType: updatedOffering?.giftType || object.metadata?.gift_type || "",
      frequency: updatedOffering?.frequency || object.metadata?.frequency || "once",
      amountCents: updatedOffering?.amountCents || object.amount_received || object.amount || 0,
      namesLiving: updatedOffering?.namesLiving || object.metadata?.names_living || "",
      namesDeparted: updatedOffering?.namesDeparted || object.metadata?.names_departed || "",
      createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
    await sendDonationReceiptIfNeeded(env, updatedOffering || {});
  }

  if (event.type === "payment_intent.payment_failed") {
    await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: "failed",
      paymentStatus: "failed",
      failureMessage: object.last_payment_error?.message || "",
      failedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "payment_intent.canceled") {
    await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: "cancelled",
      paymentStatus: "cancelled",
      cancelledAt: object.canceled_at ? new Date(object.canceled_at * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "charge.refunded") {
    await updateDonorOfferingByPaymentIntent(env, object.payment_intent, {
      status: object.amount_refunded >= object.amount ? "refunded" : "partially_refunded",
      paymentStatus: object.amount_refunded >= object.amount ? "refunded" : "partially_refunded",
      refundedCents: object.amount_refunded || 0,
      refundedAt: new Date().toISOString()
    });
  }

  if (event.type === "charge.dispute.created") {
    await updateDonorOfferingByPaymentIntent(env, object.payment_intent, {
      status: "disputed",
      paymentStatus: "disputed",
      stripeDisputeId: object.id || "",
      disputedCents: object.amount || 0,
      disputeReason: object.reason || "",
      disputedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "charge.dispute.closed") {
    await updateDonorOfferingByPaymentIntent(env, object.payment_intent, {
      status: object.status === "won" ? "completed" : "dispute_closed",
      paymentStatus: object.status === "won" ? "paid" : "dispute_closed",
      stripeDisputeId: object.id || "",
      disputeStatus: object.status || "",
      disputeClosedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const metadata = object.subscription_details?.metadata || object.lines?.data?.[0]?.metadata || object.metadata || {};
    if (metadata.donor_email) {
      const paymentIntentId = stripeObjectId(object.payment_intent);
      const giftAmountCents = numericCents(metadata.amount_cents) || numericCents(object.amount_paid);
      const feeUpdates = paymentIntentId
        ? await stripePaymentIntentFinancialUpdates(
          env,
          paymentIntentId,
          metadata.parish_id || "",
          {
            amountCents: giftAmountCents,
            giftAmountCents,
            chargeCents: numericCents(metadata.charge_cents) || numericCents(object.amount_paid),
            stripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
            estimatedStripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
            agapayFeeCents: numericCents(metadata.agapay_fee_cents),
            totalFeeCents: numericCents(metadata.total_fee_cents),
            coverFees: booleanFromStripeMetadata(metadata.cover_fees, false),
            paymentMethod: metadata.payment_method || ""
          }
        )
        : {};
      const storedOffering = await storeDonorOffering(env, {
        id: object.id,
        donorEmail: metadata.donor_email,
        donorName: metadata.donor_name || object.customer_name || "",
        parishId: metadata.parish_id || "",
        parishName: metadata.parish_name || "",
        giftType: metadata.gift_type || "recurring",
        title: metadata.gift_type ? String(metadata.gift_type).replace(/-/g, " ") : "Recurring AGAPAY offering",
        frequency: metadata.frequency || "recurring",
        amountCents: giftAmountCents,
        giftAmountCents,
        chargeCents: numericCents(metadata.charge_cents) || numericCents(object.amount_paid),
        stripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
        estimatedStripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
        agapayFeeCents: numericCents(metadata.agapay_fee_cents),
        totalFeeCents: numericCents(metadata.total_fee_cents),
        coverFees: booleanFromStripeMetadata(metadata.cover_fees, false),
        paymentMethod: metadata.payment_method || "",
        status: "completed",
        paymentStatus: "paid",
        stripeCustomerId: object.customer || "",
        stripePaymentIntentId: paymentIntentId,
        stripeSubscriptionId: object.subscription || "",
        namesLiving: metadata.names_living || "",
        namesDeparted: metadata.names_departed || "",
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        ...feeUpdates
      });
      await ensureCommemorationEntryFromOffering(env, storedOffering || {}, {
        id: object.id,
        parishId: metadata.parish_id || "",
        parishName: metadata.parish_name || "",
        donorEmail: metadata.donor_email || object.customer_email || object.customer_details?.email || "",
        donorName: metadata.donor_name || object.customer_name || "",
        giftType: metadata.gift_type || "recurring",
        frequency: metadata.frequency || "recurring",
        amountCents: giftAmountCents,
        namesLiving: metadata.names_living || "",
        namesDeparted: metadata.names_departed || "",
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
      });
      await sendDonationReceiptIfNeeded(env, storedOffering || {});
    }
  }

  if (event.type === "checkout.session.completed" && object.mode === "subscription") {
    if (object.metadata?.product === "learn") {
      await persistLearnBillingFromStripe(env, {
        ...object,
        status: "active",
        stripeSubscriptionId: object.subscription || "",
        checkoutSessionId: object.id || ""
      });
      return;
    }

    const reference = object.metadata?.agapay_reference || object.client_reference_id || "";
    await updateSubscriptionRecord(env, reference, {
      subscriptionStatus: "active",
      stripeCustomerId: object.customer || "",
      stripeSubscriptionId: object.subscription || "",
      stripeSubscriptionCheckoutSessionId: object.id || "",
      subscriptionActivatedAt: new Date().toISOString()
    });
  }

  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
    || event.type === "customer.subscription.paused"
    || event.type === "customer.subscription.resumed"
  ) {
    if (object.metadata?.product === "learn") {
      const status = event.type === "customer.subscription.deleted"
        ? "cancelled"
        : event.type === "customer.subscription.paused"
          ? "paused"
          : event.type === "customer.subscription.resumed"
            ? "active"
            : subscriptionStatusFromStripe(object.status);
      await persistLearnBillingFromStripe(env, {
        ...object,
        status,
        stripeSubscriptionId: object.id || ""
      });
      return;
    }

    const reference = object.metadata?.agapay_reference || "";
    const status = event.type === "customer.subscription.deleted"
      ? "cancelled"
      : event.type === "customer.subscription.paused"
        ? "paused"
        : event.type === "customer.subscription.resumed"
          ? "active"
      : subscriptionStatusFromStripe(object.status);
    if (reference) {
      await updateSubscriptionRecord(env, reference, {
        subscriptionStatus: status,
        stripeSubscriptionId: object.id || "",
        stripeCustomerId: object.customer || ""
      });
    } else {
      const found = await findRegistrationByStripeSubscriptionId(env, object.id);
      if (found) {
        await updateSubscriptionRecord(env, found.key, {
          subscriptionStatus: status,
          stripeSubscriptionId: object.id || "",
          stripeCustomerId: object.customer || ""
        });
      }
    }
  }

  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
    const subscriptionId = object.subscription || "";
    const metadata = object.subscription_details?.metadata || object.lines?.data?.[0]?.metadata || object.metadata || {};
    if (metadata.donor_email) {
      await storeDonorOffering(env, {
        id: object.id,
        donorEmail: metadata.donor_email,
        donorName: metadata.donor_name || object.customer_name || "",
        parishId: metadata.parish_id || "",
        parishName: metadata.parish_name || "",
        giftType: metadata.gift_type || "recurring",
        title: metadata.gift_type ? String(metadata.gift_type).replace(/-/g, " ") : "Recurring AGAPAY offering",
        frequency: metadata.frequency || "recurring",
        amountCents: object.amount_due || object.amount_remaining || object.total || 0,
        chargeCents: object.amount_due || object.amount_remaining || object.total || 0,
        status: "failed",
        paymentStatus: "failed",
        stripeCustomerId: object.customer || "",
        stripePaymentIntentId: object.payment_intent || "",
        stripeSubscriptionId: subscriptionId,
        namesLiving: metadata.names_living || "",
        namesDeparted: metadata.names_departed || "",
        failureMessage: object.last_finalization_error?.message || "Recurring payment failed.",
        failedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
      });
    }
    const found = await findRegistrationByStripeSubscriptionId(env, subscriptionId);
    if (found) {
      await updateSubscriptionRecord(env, found.key, {
        subscriptionStatus: "past_due",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: object.customer || found.registration.stripeCustomerId || "",
        subscriptionPaymentIssueAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        subscriptionPaymentIssueType: event.type
      });
    }
  }

  if (event.type === "account.updated") {
    const found = await findRegistrationByStripeAccountId(env, object.id);
    if (found) {
      await saveRegistrationRecord(env, found.key, {
        ...found.registration,
        stripeAccountStatus: stripeAccountStatus(object),
        stripeChargesEnabled: Boolean(object.charges_enabled),
        stripePayoutsEnabled: Boolean(object.payouts_enabled),
        stripeDetailsSubmitted: Boolean(object.details_submitted),
        stripeDisabledReason: object.requirements?.disabled_reason || "",
        stripeRequirementsDue: object.requirements?.currently_due || [],
        stripeStatusCheckedAt: new Date().toISOString()
      }, found.registration);
    }
  }
}

export async function createStripeOnboardingSession(request, env, reference, registration, returnPath = "/admin") {
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeAccountId = registration.stripeAccountId || "";
  let stripeAccount = null;

  if (!stripeAccountId) {
    const accountForm = new URLSearchParams({
      type: "standard",
      country: "US",
      email: registration.treasurerEmail || registration.priestEmail || "",
      business_type: "non_profit",
      "business_profile[name]": registration.parishName || "AGAPAY Parish",
      "business_profile[product_description]": "Online tithes, stewardship, and charitable donations for an Orthodox Christian parish.",
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
      "metadata[agapay_reference]": reference,
      "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName)
    });
    const website = absoluteWebsiteUrl(registration.website);
    if (website) accountForm.set("business_profile[url]", website);

    const created = await stripeFormRequest(env, "/v1/accounts", accountForm);
    if (!created.ok) {
      return json(
        { error: "Stripe connected account creation failed", detail: created.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }

    stripeAccount = created.body;
    stripeAccountId = stripeAccount.id;
  } else {
    const retrieved = await stripeGetRequest(env, `/v1/accounts/${encodeURIComponent(stripeAccountId)}`);
    if (!retrieved.ok) {
      return json(
        { error: "Stripe connected account lookup failed", detail: retrieved.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }
    stripeAccount = retrieved.body;
  }

  const returnSeparator = returnPath.includes("?") ? "&" : "?";
  const linkForm = new URLSearchParams({
    account: stripeAccountId,
    refresh_url: `${appUrl}${returnPath}${returnSeparator}stripe_refresh=${encodeURIComponent(reference)}`,
    return_url: `${appUrl}${returnPath}${returnSeparator}stripe_return=${encodeURIComponent(reference)}`,
    type: "account_onboarding"
  });
  const link = await stripeFormRequest(env, "/v1/account_links", linkForm);
  if (!link.ok) {
    return json(
      { error: "Stripe onboarding link failed", detail: link.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const updated = {
    ...registration,
    parishDashboardToken: registration.parishDashboardToken || crypto.randomUUID(),
    stripeAccountId,
    stripeAccountStatus: stripeAccountStatus(stripeAccount),
    stripeChargesEnabled: Boolean(stripeAccount.charges_enabled),
    stripePayoutsEnabled: Boolean(stripeAccount.payouts_enabled),
    stripeDetailsSubmitted: Boolean(stripeAccount.details_submitted),
    stripeDisabledReason: stripeAccount.requirements?.disabled_reason || "",
    stripeRequirementsDue: stripeAccount.requirements?.currently_due || [],
    stripeOnboardingLinkCreatedAt: new Date().toISOString(),
    reviewedAt: registration.reviewedAt || new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, registration);

  return { onboardingUrl: link.body.url, registration: updated };
}

export async function handleStripeOnboarding(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  if (registration.status !== "verified") {
    return json({ error: "Verify the parish before starting Stripe onboarding" }, { status: 422 });
  }

  const result = await createStripeOnboardingSession(request, env, reference, registration);
  if (result instanceof Response) return result;

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendTreasurerStripeInvite(env, appUrl, result.registration);
  const updated = {
    ...result.registration,
    stripeOnboardingEmailStatus: email.status,
    stripeOnboardingEmailId: email.id || "",
    stripeOnboardingEmailDetail: email.detail || "",
    stripeOnboardingEmailSentAt: email.status === "sent" ? new Date().toISOString() : result.registration.stripeOnboardingEmailSentAt
  };
  const audited = appendAdminAudit(updated, "stripe_onboarding_link_created", adminContext.actor, {
    stripeAccountId: updated.stripeAccountId || "",
    emailStatus: email.status || "unknown"
  });
  await saveRegistrationRecord(env, reference, audited, result.registration);

  return json({ ok: true, onboardingUrl: result.onboardingUrl, email, registration: audited });
}

export async function refreshStripeStatusForRegistration(env, reference, registration) {
  if (!registration.stripeAccountId) {
    return {
      ok: false,
      status: 422,
      body: { error: "This registration does not have a Stripe connected account yet" }
    };
  }

  const retrieved = await stripeGetRequest(env, `/v1/accounts/${encodeURIComponent(registration.stripeAccountId)}`);
  if (!retrieved.ok) {
    return {
      ok: false,
      status: 502,
      body: { error: "Stripe connected account lookup failed", detail: retrieved.body.error?.message || "Unknown Stripe error" }
    };
  }

  const account = retrieved.body;
  const updated = {
    ...registration,
    stripeAccountStatus: stripeAccountStatus(account),
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeDisabledReason: account.requirements?.disabled_reason || "",
    stripeRequirementsDue: account.requirements?.currently_due || [],
    stripeStatusCheckedAt: new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, registration);

  return { ok: true, registration: updated, account };
}

export async function handleStripeRefresh(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  const refreshed = await refreshStripeStatusForRegistration(env, reference, registration);
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });
  let updated = refreshed.registration;
  if ((registration.stripeAccountStatus || "not_started") !== (refreshed.registration.stripeAccountStatus || "not_started")) {
    updated = appendAdminAudit(refreshed.registration, "stripe_status_refreshed", adminContext.actor, {
      from: registration.stripeAccountStatus || "not_started",
      to: refreshed.registration.stripeAccountStatus || "not_started"
    });
    await saveRegistrationRecord(env, reference, updated, refreshed.registration);
  }

  return json({ ok: true, registration: updated });
}
