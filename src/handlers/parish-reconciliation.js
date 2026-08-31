// src/handlers/parish-reconciliation.js
// Parish payout diagnostics, monthly reconciliation, and close/reopen workflow.

import { fundReportPeriod, createFundAllocationResolver, parishReportingTimezone, loadFundGiftActivity } from "../lib/fund-reporting.js";
import {
  d1,
  d1GetSetting,
  resolveParishDashboardSession,
} from "../lib/core.js";
import {
  stripeGetConnectedRequest,
  stripeObjectId,
} from "../lib/stripe-connect.js";
import {
  findRegistrationByParishId,
  getBearerToken,
  giftDisplayName,
  givingFeatureAccess,
  hasProductionStore,
  json,
  loadDonorOfferingByPaymentIntent,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
  verifyParishDashboardBearer,
} from "./parish.js";

export async function listRecentStripePayouts(env, stripeAccountId, limit = 10) {
  const payouts = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length)))
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/payouts?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit) } };
}

export async function listStripeBalanceTransactionsForPayout(env, stripeAccountId, payoutId, limit = 100) {
  const transactions = [];
  let startingAfter = "";
  let pages = 0;
  let hasMore = false;

  do {
    const params = new URLSearchParams({
      payout: payoutId,
      limit: String(Math.min(100, Math.max(1, limit - transactions.length)))
    });
    params.append("expand[]", "data.source");
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/balance_transactions?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;
    hasMore = Boolean(result.body.has_more);

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit), truncated: hasMore || transactions.length > limit } };
}

export function reconciliationPeriod(value, now = new Date(), timezone = "UTC") {
  return fundReportPeriod({ month: value, now, timezone });
}

export async function listStripePayoutsForPeriod(env, stripeAccountId, period, limit = 100) {
  const payouts = [];
  let startingAfter = "";
  let pages = 0;
  let hasMore = false;
  // Stripe arrival_date is an expected calendar date, not a bank posting instant.
  const arrivalStart = Date.parse(period.startDate + "T00:00:00Z") / 1000;
  const arrivalEnd = Date.parse(period.endDate + "T00:00:00Z") / 1000;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length))),
      "arrival_date[gte]": String(arrivalStart),
      "arrival_date[lt]": String(arrivalEnd)
    });
    if (startingAfter) params.set("starting_after", startingAfter);
    const result = await stripeGetConnectedRequest(env, `/v1/payouts?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;
    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(...data.filter((payout) => {
      const bankDate = Number(payout.arrival_date || payout.created || 0);
      return bankDate >= arrivalStart && bankDate < arrivalEnd;
    }));
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;
    hasMore = Boolean(result.body.has_more);
    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 10) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit), truncated: hasMore || payouts.length > limit } };
}

function paymentIntentFromStripeSource(source) {
  if (!source || typeof source === "string") return "";
  return stripeObjectId(source.payment_intent)
    || stripeObjectId(source.charge?.payment_intent)
    || stripeObjectId(source.source?.payment_intent);
}

export function buildFundTransferWorksheet(allocations = [], summary = {}) {
  const depositedCents = Math.round(Number(summary.depositedCents || 0));
  const lines = (Array.isArray(allocations) ? allocations : []).map((item) => {
    const key = String(item?.key || "").trim() || `allocation:${String(item?.label || "giving").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const category = String(item?.category || "Giving").trim() || "Giving";
    const label = String(item?.label || "General Giving").trim() || "General Giving";
    const netCents = Math.round(Number(item?.netCents || 0));
    return {
      key,
      category,
      label,
      transactionCount: Math.max(0, Math.round(Number(item?.transactionCount || 0))),
      grossCents: Math.round(Number(item?.grossCents || 0)),
      feeCents: Math.round(Number(item?.feeCents || 0)),
      netCents,
      recommendedAction: "retain",
      needsReview: netCents < 0,
    };
  });
  const allocatedNetCents = lines.reduce((sum, item) => sum + item.netCents, 0);
  const recommendedTransferCents = lines
    .filter((item) => item.recommendedAction === "transfer" && item.netCents > 0)
    .reduce((sum, item) => sum + item.netCents, 0);
  const unallocatedCents = depositedCents - allocatedNetCents;
  return {
    available: lines.length > 0,
    lines,
    depositedCents,
    allocatedNetCents,
    recommendedTransferCents,
    retainInDepositAccountCents: depositedCents - recommendedTransferCents,
    unallocatedCents,
    readyToTransfer: summary.readyForReview === true && lines.length > 0 && unallocatedCents === 0 && lines.every((item) => !item.needsReview),
    note: "Net allocations describe paid Stripe payouts, not current fund balances or instructions to move money. Record any bank transfers separately.",
  };
}

export function normalizeFundTransferInstructions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item) => {
    const action = item?.action === "transfer" ? "transfer" : "retain";
    return {
      key: String(item?.key || "").trim().slice(0, 180),
      action,
      destination: action === "transfer" ? String(item?.destination || "").trim().slice(0, 160) : "",
      completed: action === "transfer" && Boolean(item?.completed),
      reference: action === "transfer" ? String(item?.reference || "").trim().slice(0, 160) : "",
    };
  }).filter((item) => item.key);
}

function signedFeeParts(transaction, source) {
  const details = Array.isArray(transaction.fee_details) ? transaction.fee_details : [];
  const applicationFee = details
    .filter((item) => String(item.type || "").includes("application"))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const sourceApplicationFee = Number(transaction.amount) > 0 ? Number(source?.application_fee_amount || 0) : 0;
  const agapayFeeCents = details.length ? applicationFee : sourceApplicationFee;
  return {
    agapayFeeCents,
    stripeFeeCents: Number(transaction.fee || 0) - agapayFeeCents
  };
}

async function reconciliationReviewHistory(env, parishId, month) {
  if (!d1(env)) return [];
  const prefix = `reconciliation-close:${parishId}:${month}:revision:`;
  const result = await d1(env).prepare("SELECT json_extract(value, '$.record') AS record FROM app_settings WHERE substr(key,1,length(?1))=?1 ORDER BY updated_at DESC,key DESC LIMIT 25").bind(prefix).all();
  return (result.results || []).map(row => { try { return JSON.parse(row.record); } catch { return null; } }).filter(Boolean);
}

async function reconciliationCloseRecord(env, parishId, month) {
  const key = `reconciliation-close:${parishId}:${month}`;
  const raw = d1(env) ? await d1GetSetting(env, key) : await env.AGAPAY_REGISTRATIONS?.get(key);
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

export async function listRecentStripeBalanceTransactions(env, stripeAccountId, limit = 25) {
  const transactions = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - transactions.length)))
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/balance_transactions?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit) } };
}

export async function handleParishPayoutDiagnostics(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (!found.registration.stripeAccountId) {
    return json({
      parishId,
      available: false,
      reason: "Stripe is not connected for this parish."
    });
  }

  const stripeAccountId = found.registration.stripeAccountId;
  const payoutsResult = await listRecentStripePayouts(env, stripeAccountId, 5);
  if (!payoutsResult.ok) {
    return json({
      parishId,
      stripeAccountId,
      available: false,
      payoutsRequest: {
        ok: false,
        status: payoutsResult.status,
        error: payoutsResult.body?.error?.message || "Unknown Stripe error"
      }
    }, { status: 502 });
  }

  const payouts = payoutsResult.body.data || [];
  const diagnostics = {
    parishId,
    stripeAccountId,
    payoutsRequest: {
      ok: true,
      count: payouts.length
    },
    payouts: payouts.map((payout) => ({
      id: payout.id,
      status: payout.status,
      amount: payout.amount,
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      currency: payout.currency || "usd"
    })),
    balanceTransactionsRequest: null,
    samplePayoutTransactions: [],
    matchedOfferings: [],
    traceability: {
      chargeLinkedTransactionCount: 0,
      paymentIntentLinkedOfferingCount: 0,
      notes: []
    }
  };

  if (!payouts.length) {
    diagnostics.traceability.notes.push("Stripe returned no payouts for this connected account yet.");

    const recentBalanceResult = await listRecentStripeBalanceTransactions(env, stripeAccountId, 25);
    if (!recentBalanceResult.ok) {
      diagnostics.balanceTransactionsRequest = {
        ok: false,
        status: recentBalanceResult.status,
        error: recentBalanceResult.body?.error?.message || "Unknown Stripe error"
      };
      diagnostics.traceability.notes.push("Recent balance transactions could not be listed, so charge traceability remains unverified.");
      return json(diagnostics);
    }

    diagnostics.balanceTransactionsRequest = {
      ok: true,
      mode: "recent",
      count: recentBalanceResult.body.data?.length || 0
    };

    const recentTransactions = recentBalanceResult.body.data || [];
    const chargeIds = new Set();
    const paymentIntentIds = new Set();
    const matchedOfferings = [];

    for (const transaction of recentTransactions) {
      const sourceId = typeof transaction.source === "string"
        ? transaction.source
        : transaction.source?.id || "";
      if (sourceId.startsWith("ch_")) chargeIds.add(sourceId);
      if (sourceId.startsWith("pi_")) paymentIntentIds.add(sourceId);
    }

    for (const chargeId of chargeIds) {
      const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
      if (!chargeResult.ok) continue;
      const paymentIntentId = typeof chargeResult.body.payment_intent === "string"
        ? chargeResult.body.payment_intent
        : chargeResult.body.payment_intent?.id || "";
      if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
    }

    for (const paymentIntentId of paymentIntentIds) {
      const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
      if (offering?.parishId === parishId && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
    }

    diagnostics.samplePayoutTransactions = recentTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      fee: transaction.fee,
      net: transaction.net,
      source: typeof transaction.source === "string" ? transaction.source : transaction.source?.id || "",
      reportingCategory: transaction.reporting_category || "",
      availableOn: transaction.available_on || 0,
      created: transaction.created || 0
    }));
    diagnostics.matchedOfferings = matchedOfferings.map((offering) => ({
      id: offering.id,
      donorName: offering.donorName || "",
      donorEmail: offering.donorEmail || "",
      amountCents: offering.amountCents || 0,
      chargeCents: offering.chargeCents || offering.amountCents || 0,
      agapayFeeCents: offering.agapayFeeCents || 0,
      estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
      giftType: offering.giftType || "",
      fund: offering.fund || "",
      campaign: offering.campaign || "",
      paymentIntentId: offering.stripePaymentIntentId || "",
      checkoutSessionId: offering.checkoutSessionId || ""
    }));
    diagnostics.traceability.chargeLinkedTransactionCount = chargeIds.size;
    diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings.length;
    if (chargeIds.size) diagnostics.traceability.notes.push("Recent balance transactions include charge ids in `source`.");
    if (paymentIntentIds.size) diagnostics.traceability.notes.push("Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.");
    if (matchedOfferings.length) diagnostics.traceability.notes.push("Recent balance transactions can be matched back to AGAPAY donor_offerings records.");
    return json(diagnostics);
  }

  const samplePayout = payouts[0];
  const balanceResult = await listStripeBalanceTransactionsForPayout(env, stripeAccountId, samplePayout.id, 100);
  if (!balanceResult.ok) {
    diagnostics.balanceTransactionsRequest = {
      ok: false,
      payoutId: samplePayout.id,
      status: balanceResult.status,
      error: balanceResult.body?.error?.message || "Unknown Stripe error"
    };
    return json(diagnostics, { status: 502 });
  }

  diagnostics.balanceTransactionsRequest = {
    ok: true,
    payoutId: samplePayout.id,
    count: balanceResult.body.data?.length || 0
  };

  const transactions = balanceResult.body.data || [];
  const chargeIds = new Set();
  const paymentIntentIds = new Set();
  const matchedOfferings = [];

  for (const transaction of transactions) {
    const sourceId = typeof transaction.source === "string"
      ? transaction.source
      : transaction.source?.id || "";
    if (sourceId.startsWith("ch_")) chargeIds.add(sourceId);
    if (sourceId.startsWith("pi_")) paymentIntentIds.add(sourceId);
  }

  for (const chargeId of chargeIds) {
    const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
    if (!chargeResult.ok) continue;
    const paymentIntentId = typeof chargeResult.body.payment_intent === "string"
      ? chargeResult.body.payment_intent
      : chargeResult.body.payment_intent?.id || "";
    if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
  }

  for (const paymentIntentId of paymentIntentIds) {
    const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
    if (offering?.parishId === parishId && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
  }

  diagnostics.samplePayoutTransactions = transactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    fee: transaction.fee,
    net: transaction.net,
    source: typeof transaction.source === "string" ? transaction.source : transaction.source?.id || "",
    reportingCategory: transaction.reporting_category || "",
    availableOn: transaction.available_on || 0,
    created: transaction.created || 0
  }));
  diagnostics.matchedOfferings = matchedOfferings.map((offering) => ({
    id: offering.id,
    donorName: offering.donorName || "",
    donorEmail: offering.donorEmail || "",
    amountCents: offering.amountCents || 0,
    chargeCents: offering.chargeCents || offering.amountCents || 0,
    agapayFeeCents: offering.agapayFeeCents || 0,
    estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
    giftType: offering.giftType || "",
    fund: offering.fund || "",
    campaign: offering.campaign || "",
    paymentIntentId: offering.stripePaymentIntentId || "",
    checkoutSessionId: offering.checkoutSessionId || ""
  }));
  diagnostics.traceability.chargeLinkedTransactionCount = chargeIds.size;
  diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings.length;
  if (chargeIds.size) diagnostics.traceability.notes.push("Sample payout balance transactions include charge ids in `source`.");
  if (paymentIntentIds.size) diagnostics.traceability.notes.push("Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.");
  if (matchedOfferings.length) {
    diagnostics.traceability.notes.push("At least some payout line items can be matched back to AGAPAY donor_offerings records.");
  } else {
    diagnostics.traceability.notes.push("No AGAPAY donor_offerings records matched the sampled payout transaction sources yet.");
  }

  return json(diagnostics);
}

async function paymentIntentForReconciliationTransaction(env, stripeAccountId, transaction, lookupState) {
  const source = transaction.source;
  const sourceId = stripeObjectId(source);
  const expandedPaymentIntent = paymentIntentFromStripeSource(source);
  if (expandedPaymentIntent) return { paymentIntentId: expandedPaymentIntent, source };
  if (lookupState.cache.has(sourceId)) return lookupState.cache.get(sourceId);
  if (!sourceId || !/^(ch_|re_|dp_)/.test(sourceId)) return { paymentIntentId: "", source };
  if (lookupState.count >= lookupState.limit) { lookupState.truncated = true; return { paymentIntentId: "", source }; }

  lookupState.count += 1;
  let result = null;
  if (sourceId.startsWith("ch_")) {
    result = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(sourceId)}`, stripeAccountId);
  } else if (sourceId.startsWith("re_")) {
    result = await stripeGetConnectedRequest(env, `/v1/refunds/${encodeURIComponent(sourceId)}`, stripeAccountId);
  } else if (sourceId.startsWith("dp_")) {
    result = await stripeGetConnectedRequest(env, `/v1/disputes/${encodeURIComponent(sourceId)}`, stripeAccountId);
  }
  const resolvedSource = result?.ok ? result.body : source;
  let paymentIntentId = paymentIntentFromStripeSource(resolvedSource);
  if (!paymentIntentId && result?.ok && /^(re_|dp_)/.test(sourceId)) {
    const chargeId = stripeObjectId(result.body.charge);
    if (chargeId && lookupState.count < lookupState.limit) {
      lookupState.count += 1;
      const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
      if (chargeResult.ok) paymentIntentId = stripeObjectId(chargeResult.body.payment_intent);
    }
  }
  const resolved = { paymentIntentId, source: resolvedSource };
  lookupState.cache.set(sourceId, resolved);
  return resolved;
}

export async function handleParishReconciliation(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-reconciliation", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (!givingFeatureAccess(found.registration, "reconciliation")) {
    return json({ error: "Reconciliation access is unavailable." }, { status: 403 });
  }

  return buildReconciliationReport(env, parishId, found.registration, new URL(request.url).searchParams);
}

export async function buildReconciliationReport(env, parishId, registration, params) {
  try { return await prepareReconciliationReport(env, parishId, registration, params); }
  catch { return json({ error: "The report could not be verified. Retry when Stripe and giving records are available." }, { status: 503 }); }
}

async function prepareReconciliationReport(env, parishId, registration, params) {
  let period;
  try { period = reconciliationPeriod(params.get("month"), new Date(), parishReportingTimezone(registration)); }
  catch (error) { return json({ error: error.message }, { status: 422 }); }
  const closeRecord = await reconciliationCloseRecord(env, parishId, period.month);
  const reviewHistory = await reconciliationReviewHistory(env, parishId, period.month);
  const stripeAccountId = registration.stripeAccountId || "";
  if (!stripeAccountId) {
    return json({
      available: false,
      reason: "Connect Stripe before reconciling monthly deposits.",
      parishId,
      period,
      closeRecord,
      generatedAt: new Date().toISOString()
    });
  }

  const payoutsResult = await listStripePayoutsForPeriod(env, stripeAccountId, period, 100);
  if (!payoutsResult.ok) {
    return json({ error: "Unable to load Stripe payouts", detail: payoutsResult.body?.error?.message || "Stripe request failed" }, { status: 502 });
  }

  const payouts = payoutsResult.body.data || [];
  const lookupState = { count: 0, limit: 80, cache: new Map() };
  const offeringCache = new Map();
  const allocations = new Map();
  const resolveFund = createFundAllocationResolver(registration);
  const exceptions = [];
  const payoutRows = [];
  const transactionRows = [];
  let depositedCents = 0;
  let inTransitCents = 0;
  let failedPayoutCents = 0;
  let grossActivityCents = 0;
  let refundCents = 0;
  let stripeFeeCents = 0;
  let agapayFeeCents = 0;
  let payoutCompositionNetCents = 0;
  let matchedNetCents = 0;
  let unmatchedNetCents = 0;
  let unmatchedCount = 0;
  let unmatchedAbsoluteCents = 0;
  const seenTransactions = new Set();

  for (const payout of payouts) {
    const payoutStatus = String(payout.status || "unknown").toLowerCase();
    const payoutAmount = Number(payout.amount || 0);
    if ((payout.currency || "usd") !== "usd") {
      exceptions.push({ severity: "error", code: "currency", payoutId: payout.id, message: "A payout uses another currency. Separate currency reporting is required." });
      continue;
    }
    if (!Number.isSafeInteger(payoutAmount) || payoutAmount < 0 || !["paid", "pending", "in_transit", "failed", "canceled", "cancelled"].includes(payoutStatus)) {
      exceptions.push({ severity: "error", code: "invalid_payout", payoutId: payout.id, message: "A payout has an unsupported amount or status and needs review." });
      continue;
    }
    if (payoutStatus === "paid") depositedCents += payoutAmount;
    else if (["pending", "in_transit"].includes(payoutStatus)) inTransitCents += payoutAmount;
    else if (["failed", "canceled", "cancelled"].includes(payoutStatus)) failedPayoutCents += payoutAmount;

    if (payoutStatus !== "paid" || payout.automatic !== true || payout.method === "instant" || (payout.reconciliation_status && payout.reconciliation_status !== "completed") || transactionRows.length >= 2500) {
      const unsupported = payoutStatus === "paid";
      if (unsupported) exceptions.push({ severity: "error", code: "unsupported_or_large_payout", payoutId: payout.id, message: "This payout is manual/instant, is still preparing its settlement breakdown, or exceeds the interactive report limit. Its fund allocation is not verified. Contact support for a complete report." });
      payoutRows.push({ id: payout.id, status: payoutStatus, amountCents: payoutAmount, arrivalDate: payout.arrival_date || 0, transactionCount: 0, matchingComplete: false, differenceCents: null });
      continue;
    }
    const balanceResult = await listStripeBalanceTransactionsForPayout(env, stripeAccountId, payout.id, 500);
    if (!balanceResult.ok) {
      exceptions.push({ severity: "error", code: "payout_unavailable", payoutId: payout.id, message: `Could not load the transactions composing payout ${payout.id}.` });
      payoutRows.push({
        id: payout.id,
        status: payoutStatus,
        amountCents: payoutAmount,
        arrivalDate: payout.arrival_date || 0,
        created: payout.created || 0,
        transactionCount: 0,
        compositionNetCents: 0,
        differenceCents: payoutAmount
      });
      continue;
    }

    const transactions = balanceResult.body.data || [];
    if (balanceResult.body.truncated) exceptions.push({ severity: "error", code: "transaction_limit", payoutId: payout.id, message: "Not all payout transactions were retrieved. This report cannot be finalized." });
    let payoutNet = 0;
    let payoutMatchedNet = 0;
    for (const transaction of transactions) {
      if (!transaction.id || seenTransactions.has(transaction.id) || (transaction.currency || "usd") !== "usd" ||
        ![transaction.amount, transaction.fee, transaction.net].every(Number.isSafeInteger) || transaction.amount - transaction.fee !== transaction.net) {
        exceptions.push({ severity: "error", code: "transaction_identity", payoutId: payout.id, message: "Duplicate, invalid, or different-currency transaction needs review." });
        continue;
      }
      seenTransactions.add(transaction.id);
      const transactionNet = Number(transaction.net || 0);
      const transactionAmount = Number(transaction.amount || 0);
      const resolved = await paymentIntentForReconciliationTransaction(env, stripeAccountId, transaction, lookupState);
      const paymentIntentId = resolved.paymentIntentId;
      let offering = null;
      if (paymentIntentId) {
        if (!offeringCache.has(paymentIntentId)) {
          offeringCache.set(paymentIntentId, await loadDonorOfferingByPaymentIntent(env, paymentIntentId));
        }
        offering = offeringCache.get(paymentIntentId);
        if (offering?.parishId !== parishId || (offering?.stripeAccountId && offering.stripeAccountId !== stripeAccountId) ||
          (typeof offering?.livemode === "boolean" && typeof payout.livemode === "boolean" && offering.livemode !== payout.livemode)) offering = null;
      }
      const feeParts = signedFeeParts(transaction, resolved.source);
      const reportingCategory = String(transaction.reporting_category || transaction.type || "other");
      const isRefund = transactionAmount < 0 || /refund|dispute|chargeback/.test(reportingCategory);
      const includedInDeposits = payoutStatus === "paid";
      const allocation = offering ? resolveFund(offering) : null;

      payoutNet += transactionNet;
      if (includedInDeposits) {
        payoutCompositionNetCents += transactionNet;
        if (transactionAmount > 0) grossActivityCents += transactionAmount;
        if (isRefund && transactionAmount < 0) refundCents += -transactionAmount;
        stripeFeeCents += feeParts.stripeFeeCents;
        agapayFeeCents += feeParts.agapayFeeCents;
        if (offering && allocation) {
          matchedNetCents += transactionNet;
          payoutMatchedNet += transactionNet;
          const row = allocations.get(allocation.key) || {
            ...allocation,
            grossCents: 0,
            refundsCents: 0,
            chargedCents: 0,
            feeCents: 0,
            netCents: 0,
            transactionCount: 0
          };
          row.grossCents += transactionAmount;
          if (transactionAmount > 0) row.chargedCents += transactionAmount;
          if (transactionAmount < 0) row.refundsCents += -transactionAmount;
          row.feeCents += Number(transaction.fee || 0);
          row.netCents += transactionNet;
          row.transactionCount += 1;
          allocations.set(allocation.key, row);
        } else {
          unmatchedNetCents += transactionNet;
          unmatchedAbsoluteCents += Math.abs(transactionNet);
          unmatchedCount++;
        }
      }

      transactionRows.push({
        id: transaction.id,
        payoutId: payout.id,
        payoutStatus,
        created: transaction.created || 0,
        availableOn: transaction.available_on || 0,
        type: transaction.type || "",
        reportingCategory,
        sourceId: stripeObjectId(transaction.source),
        paymentIntentId,
        grossCents: transactionAmount,
        feeCents: Number(transaction.fee || 0),
        netCents: transactionNet,
        matched: Boolean(offering && allocation),
        allocationKey: allocation?.key || "",
        donorName: offering ? giftDisplayName(offering) : "",
        donorEmail: offering?.donorEmail || offering?.email || "",
        giftType: offering?.giftType || "",
        fund: offering?.fund || offering?.fundId || "",
        campaign: offering?.campaign || offering?.campaignId || "",
        allocationCategory: allocation?.category || "Unmatched",
        allocationLabel: allocation?.label || "Unmatched Stripe activity"
      });
    }

    const differenceCents = payoutAmount - payoutNet;
    if (payoutStatus === "paid" && differenceCents !== 0) {
      exceptions.push({ severity: "warning", code: "payout_difference", payoutId: payout.id, amountCents: differenceCents, message: `Payout ${payout.id} differs from its listed Stripe transactions.` });
    }
    payoutRows.push({
      id: payout.id,
      status: payoutStatus,
      amountCents: payoutAmount,
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      transactionCount: transactions.length,
      matchingComplete: !balanceResult.body.truncated,
      compositionNetCents: payoutNet,
      matchedNetCents: payoutMatchedNet,
      differenceCents
    });
  }

  if (unmatchedCount > 0) {
    exceptions.push({ severity: "warning", code: "unmatched_activity", amountCents: unmatchedNetCents, message: `${unmatchedCount} payout item(s) need classification (${(unmatchedAbsoluteCents / 100).toFixed(2)} USD absolute activity). This may include commerce, taxes, or other Stripe adjustments; none has been assigned to General.` });
  }
  if (inTransitCents) exceptions.push({ severity: "info", code: "in_transit", amountCents: inTransitCents, message: "One or more payouts expected this month are still pending or in transit." });
  if (failedPayoutCents) exceptions.push({ severity: "error", code: "failed_payout", amountCents: failedPayoutCents, message: "A payout failed or was canceled and should not be recorded as a bank deposit." });
  if (lookupState.truncated) exceptions.push({ severity: "warning", code: "lookup_limit", message: "The month contains more Stripe source records than could be matched in one request. Export and review unmatched activity." });
  if (payoutsResult.body.truncated) exceptions.push({ severity: "warning", code: "payout_limit", message: "Only the first 100 payouts for this month are shown." });

  const activity = await loadFundGiftActivity(env, parishId, period, registration).catch(() => ({ available: false, complete: false, reason: "Giving-date totals could not be verified. Retry the report." }));
  const giftActivity = {
    ...activity,
    giftCount: activity.giftCount || 0,
    grossGiftCents: activity.grossGiftCents || 0,
    parishNetCents: activity.parishNetCents || 0,
    feeCents: activity.feeCents || 0
  };

  const paidRows = transactionRows.filter((row) => row.payoutStatus === "paid");
  const matchedPercent = paidRows.length ? Math.floor(100 * (paidRows.length - unmatchedCount) / paidRows.length) : null;

  const allocationRows = Array.from(allocations.values()).sort((a, b) => b.netCents - a.netCents);
  const summary = {
    depositedCents,
    inTransitCents,
    failedPayoutCents,
    grossActivityCents,
    refundCents,
    stripeFeeCents,
    agapayFeeCents,
    totalFeeCents: stripeFeeCents + agapayFeeCents,
    payoutCompositionNetCents,
    matchedNetCents,
    unmatchedNetCents,
    unmatchedCount,
    unmatchedAbsoluteCents,
    matchedPercent,
    payoutCount: payouts.length,
    paidPayoutCount: payoutRows.filter((payout) => payout.status === "paid").length,
    exceptionCount: exceptions.length
  };

  const complete = !exceptions.some((item) => item.severity !== "info");
  summary.matchingComplete = complete;
  summary.readyForReview = complete && !period.inProgress && !inTransitCents && !failedPayoutCents;
  const identity = JSON.stringify({ version: 2, parishId, stripeAccountId, period, summary, payouts: payoutRows, transactions: transactionRows, allocations: allocationRows });
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)))].map((value) => value.toString(16).padStart(2, "0")).join("");
  const reviewCurrent = closeRecord?.status === "closed" && closeRecord.fingerprint === fingerprint;
  return json({
    available: true,
    complete,
    fingerprint,
    currency: "usd",
    stripeAccountId,
    state: reviewCurrent ? "reconciled" : closeRecord?.status === "closed" ? "revised" : summary.readyForReview ? "ready_for_bank_check" : "needs_review",
    parishId,
    period,
    closeRecord,
    reviewHistory,
    summary,
    giftActivity,
    allocations: allocationRows,
    transferWorksheet: buildFundTransferWorksheet(allocationRows, summary),
    payouts: payoutRows.sort((a, b) => Number(b.arrivalDate || 0) - Number(a.arrivalDate || 0)),
    transactions: transactionRows.sort((a, b) => Number(b.created || 0) - Number(a.created || 0)),
    exceptions,
    generatedAt: new Date().toISOString(),
    note: "Payouts are grouped by Stripe expected arrival date (UTC calendar date), not independent bank posting dates. Giving activity uses the parish timezone. Totals describe period receipts, not current fund balances."
  });
}

export async function handleParishReconciliationClose(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-reconciliation-close", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  const session = await resolveParishDashboardSession(found.registration, token);
  if (!session) return unauthorized();
  if (!givingFeatureAccess(found.registration, "reconciliation")) {
    return json({ error: "Reconciliation access is unavailable." }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Expected a review object." }, { status: 400 });
  let period;
  try { period = reconciliationPeriod(body.month, new Date(), parishReportingTimezone(found.registration)); }
  catch (error) { return json({ error: error.message }, { status: 422 }); }
  const closed = body.closed !== false;
  const bankStatementCents = body.bankStatementCents;
  if (closed && (body.bankConfirmed !== true || !Number.isSafeInteger(bankStatementCents) || bankStatementCents < 0))
    return json({ error: "Enter and confirm the Stripe deposit total from your bank statement." }, { status: 400 });
  if (!d1(env)) return json({ error: "Saving a reviewed report requires the giving database." }, { status: 503 });
  const previous = await reconciliationCloseRecord(env, parishId, period.month);
  const previousVersion = previous?.reviewId || previous?.updatedAt || null;
  if ((body.expectedReviewVersion || null) !== previousVersion)
    return json({ error: "Another review changed this month. Refresh before saving." }, { status: 409 });
  if (closed && previous?.status === "closed") return json({ error: "Reopen the existing review with a reason before saving a replacement." }, { status: 409 });
  if (!closed && previous?.status !== "closed") return json({ error: "Only a closed review can be reopened." }, { status: 409 });
  const notes = String(body.notes || "").trim().slice(0, 2000);
  if (!closed && !notes) return json({ error: "Add a reason before reopening this review." }, { status: 400 });
  let report = null;
  if (closed) {
    const response = await buildReconciliationReport(env, parishId, found.registration, new URLSearchParams({ month: period.month, detail: "full" }));
    if (!response.ok) return response;
    report = await response.json();
    if (!report.summary?.readyForReview || !report.complete)
      return json({ error: "Resolve incomplete matching, pending payouts, and review items before finalizing." }, { status: 409 });
    if (!body.fingerprint || body.fingerprint !== report.fingerprint)
      return json({ error: "The report changed. Refresh and review the latest amounts before saving." }, { status: 409 });
    if (bankStatementCents !== report.summary.depositedCents)
      return json({ error: "The bank total differs from Stripe. Review payout amounts and posting dates; notes cannot mark a difference reconciled." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const record = {
    parishId, month: period.month, reviewId: crypto.randomUUID(),
    previousReviewId: previousVersion, status: closed ? "closed" : "open",
    bankStatementCents: closed ? bankStatementCents : previous?.bankStatementCents ?? null,
    bankConfirmed: closed, expectedDepositCents: report?.summary.depositedCents ?? previous?.expectedDepositCents ?? null,
    differenceCents: closed ? 0 : previous?.differenceCents ?? null,
    fingerprint: report?.fingerprint || previous?.fingerprint || "",
    notes, transferInstructions: normalizeFundTransferInstructions(body.transferInstructions),
    closedAt: closed ? now : "", updatedAt: now,
    reviewedVia: "authenticated_parish_dashboard", reviewedSessionId: session.id,
  };
  const key = `reconciliation-close:${parishId}:${period.month}`;
  const previousRaw = previous ? JSON.stringify(previous) : null;
  const snapshot = JSON.stringify({ record, report });
  // Keep headroom under D1's row-size limit; never save a close without its audit snapshot.
  if (new TextEncoder().encode(snapshot).byteLength > 1_800_000)
    return json({ error: "This report is too large to archive safely. Export the draft and contact support; the month has not been marked reconciled." }, { status: 413 });
  // D1 executes this batch atomically. A losing reviewer writes neither a
  // snapshot nor the current pointer, so history never includes unsaved attempts.
  const results = await d1(env).batch([
    d1(env).prepare(
      "INSERT INTO app_settings (key,value,updated_at) SELECT ?1,?2,?3 WHERE " +
      "(?4 IS NULL AND NOT EXISTS(SELECT 1 FROM app_settings WHERE key=?5)) OR EXISTS(SELECT 1 FROM app_settings WHERE key=?5 AND value=?4)"
    ).bind(`${key}:revision:${record.reviewId}`, snapshot, now, previousRaw, key),
    d1(env).prepare(
      "INSERT INTO app_settings (key,value,updated_at) SELECT ?1,?2,?3 WHERE ?4 IS NULL OR EXISTS(SELECT 1 FROM app_settings WHERE key=?1 AND value=?4) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE app_settings.value=?4"
    ).bind(key, JSON.stringify(record), now, previousRaw),
  ]);
  const result = results[1];
  if (!result.meta?.changes) return json({ error: "Another reviewer saved changes. Refresh before trying again." }, { status: 409 });
  return json({ ok: true, record });
}
