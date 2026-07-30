// Parish payout diagnostics and monthly reconciliation handlers.

import {
  d1,
  d1GetSetting,
  d1SetSetting,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from "../lib/core.js";
import { givingFeatureAccess } from "../lib/entitlements.js";
import {
  stripeGetConnectedRequest,
  stripeObjectId,
} from "../lib/stripe-connect.js";
import {
  findRegistrationByParishId,
  giftDisplayName,
  loadDonorOfferingByPaymentIntent,
  loadParishPaidOfferings,
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

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit) } };
}

export function reconciliationPeriod(value, now = new Date()) {
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 2020 || year > 2200 || monthNumber < 1 || monthNumber > 12) return reconciliationPeriod(fallback, now);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return {
    month,
    year,
    monthNumber,
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startUnix: Math.floor(start.getTime() / 1000),
    endUnix: Math.floor(end.getTime() / 1000)
  };
}

export async function listStripePayoutsForPeriod(env, stripeAccountId, period, limit = 100) {
  const payouts = [];
  let startingAfter = "";
  let pages = 0;
  // Payout creation can precede bank arrival, so include a generous lookback and filter by arrival date below.
  const createdLookback = period.startUnix - (45 * 86400);

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length))),
      "created[gte]": String(createdLookback),
      "created[lt]": String(period.endUnix)
    });
    if (startingAfter) params.set("starting_after", startingAfter);
    const result = await stripeGetConnectedRequest(env, `/v1/payouts?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;
    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(...data.filter((payout) => {
      const bankDate = Number(payout.arrival_date || payout.created || 0);
      return bankDate >= period.startUnix && bankDate < period.endUnix;
    }));
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;
    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 10) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit), truncated: payouts.length >= limit } };
}

function paymentIntentFromStripeSource(source) {
  if (!source || typeof source === "string") return "";
  return stripeObjectId(source.payment_intent)
    || stripeObjectId(source.charge?.payment_intent)
    || stripeObjectId(source.source?.payment_intent);
}

function reconciliationAllocation(offering = {}) {
  const giftType = String(offering.giftType || "offering").toLowerCase();
  const campaign = offering.campaign || offering.campaignId || "";
  const fund = offering.fund || offering.fundId || "";
  if (["alms", "feast"].includes(giftType)) {
    return { key: "fund:benevolence", category: "Benevolence Fund", label: "Festal Alms for the Poor/Needy" };
  }
  if (campaign || giftType === "campaign") {
    return { key: `campaign:${campaign || fund || "campaign"}`, category: "Campaign", label: campaign || fund || "Parish Campaign" };
  }
  if (["candle", "candles"].includes(giftType)) return { key: "candles", category: "Candles", label: "Candle Offerings" };
  if (["memorial", "commemoration", "commemorations"].includes(giftType)) {
    return { key: "commemorations", category: "Commemorations", label: "Memorials & Commemorations" };
  }
  if (fund && !/^(?:general(?: operating)?(?: fund)?|general stewardship|stewardship)$/i.test(fund)) {
    return { key: `fund:${fund}`, category: "Designated Fund", label: fund };
  }
  return { key: "general", category: "General Giving", label: fund || "General Operating Fund" };
}

function signedFeeParts(transaction, source) {
  const details = Array.isArray(transaction.fee_details) ? transaction.fee_details : [];
  const applicationFee = details
    .filter((item) => String(item.type || "").includes("application"))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const sourceApplicationFee = Number(source?.application_fee_amount || 0);
  const agapayFeeCents = applicationFee || sourceApplicationFee;
  return {
    agapayFeeCents,
    stripeFeeCents: Number(transaction.fee || 0) - agapayFeeCents
  };
}

async function reconciliationCloseRecord(env, parishId, month) {
  const key = `reconciliation-close:${parishId}:${month}`;
  const raw = d1(env) ? await d1GetSetting(env, key) : await env.AGAPAY_REGISTRATIONS?.get(key);
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

async function saveReconciliationCloseRecord(env, parishId, month, record) {
  const key = `reconciliation-close:${parishId}:${month}`;
  const value = JSON.stringify(record);
  if (d1(env)) return d1SetSetting(env, key, value);
  return env.AGAPAY_REGISTRATIONS.put(key, value);
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
      if (offering && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
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
    if (offering && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
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
  if (!sourceId || lookupState.count >= lookupState.limit) return { paymentIntentId: "", source };
  if (lookupState.cache.has(sourceId)) return lookupState.cache.get(sourceId);

  lookupState.count += 1;
  let result = null;
  if (sourceId.startsWith("ch_")) {
    result = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(sourceId)}`, stripeAccountId);
  } else if (sourceId.startsWith("re_")) {
    result = await stripeGetConnectedRequest(env, `/v1/refunds/${encodeURIComponent(sourceId)}`, stripeAccountId);
  }
  const resolvedSource = result?.ok ? result.body : source;
  let paymentIntentId = paymentIntentFromStripeSource(resolvedSource);
  if (!paymentIntentId && result?.ok && sourceId.startsWith("re_")) {
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
    return json({ error: "Monthly reconciliation is available with Giving Plus." }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = reconciliationPeriod(url.searchParams.get("month"));
  const detailed = url.searchParams.get("detail") === "full";
  const closeRecord = await reconciliationCloseRecord(env, parishId, period.month);
  const stripeAccountId = found.registration.stripeAccountId || "";
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
  if (!detailed) {
    const payoutRows = payouts.map((payout) => ({
      id: payout.id,
      status: String(payout.status || "unknown").toLowerCase(),
      amountCents: Number(payout.amount || 0),
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      transactionCount: 0,
      compositionNetCents: 0,
      matchedNetCents: 0,
      differenceCents: 0
    }));
    const depositedCents = payoutRows
      .filter((payout) => payout.status === "paid")
      .reduce((sum, payout) => sum + payout.amountCents, 0);
    const inTransitCents = payoutRows
      .filter((payout) => ["pending", "in_transit"].includes(payout.status))
      .reduce((sum, payout) => sum + payout.amountCents, 0);
    const failedPayoutCents = payoutRows
      .filter((payout) => ["failed", "canceled", "cancelled"].includes(payout.status))
      .reduce((sum, payout) => sum + payout.amountCents, 0);
    const gifts = (await loadParishPaidOfferings(env, parishId, 2000)).filter((gift) => {
      const time = new Date(gift.createdAt || gift.date || 0).getTime();
      return Number.isFinite(time) && time >= Date.parse(period.startIso) && time < Date.parse(period.endIso);
    });
    return json({
      available: true,
      parishId,
      period,
      closeRecord,
      summary: {
        depositedCents,
        inTransitCents,
        failedPayoutCents,
        grossActivityCents: gifts.reduce((sum, gift) => sum + Number(gift.giftAmountCents || gift.amountCents || 0), 0),
        refundCents: 0,
        stripeFeeCents: gifts.reduce((sum, gift) => sum + Number(gift.stripeFeeCents || 0), 0),
        agapayFeeCents: gifts.reduce((sum, gift) => sum + Number(gift.agapayFeeCents || 0), 0),
        totalFeeCents: gifts.reduce((sum, gift) => sum + Number(gift.totalFeeCents || 0), 0),
        payoutCompositionNetCents: 0,
        matchedNetCents: gifts.reduce((sum, gift) => sum + Number(gift.parishNetCents ?? gift.amountCents ?? 0), 0),
        unmatchedNetCents: 0,
        matchedPercent: 100,
        payoutCount: payouts.length,
        paidPayoutCount: payoutRows.filter((payout) => payout.status === "paid").length,
        exceptionCount: 0
      },
      giftActivity: {
        giftCount: gifts.length,
        grossGiftCents: gifts.reduce((sum, gift) => sum + Number(gift.giftAmountCents || 0), 0),
        parishNetCents: gifts.reduce((sum, gift) => sum + Number(gift.parishNetCents ?? gift.amountCents ?? 0), 0),
        feeCents: gifts.reduce((sum, gift) => sum + Number(gift.totalFeeCents || 0), 0)
      },
      allocations: [],
      payouts: payoutRows.sort((a, b) => Number(b.arrivalDate || 0) - Number(a.arrivalDate || 0)),
      transactions: [],
      exceptions: [],
      generatedAt: new Date().toISOString(),
      note: "Fast reconciliation summary. Detailed Stripe transaction matching is deferred to keep the dashboard responsive."
    });
  }

  const lookupState = { count: 0, limit: 80, cache: new Map() };
  const offeringCache = new Map();
  const allocations = new Map();
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

  for (const payout of payouts) {
    const payoutStatus = String(payout.status || "unknown").toLowerCase();
    const payoutAmount = Number(payout.amount || 0);
    if (payoutStatus === "paid") depositedCents += payoutAmount;
    else if (["pending", "in_transit"].includes(payoutStatus)) inTransitCents += payoutAmount;
    else if (["failed", "canceled", "cancelled"].includes(payoutStatus)) failedPayoutCents += payoutAmount;

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
    let payoutNet = 0;
    let payoutMatchedNet = 0;
    for (const transaction of transactions) {
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
      }
      const feeParts = signedFeeParts(transaction, resolved.source);
      const reportingCategory = String(transaction.reporting_category || transaction.type || "other");
      const isRefund = transactionAmount < 0 || /refund|dispute|chargeback/.test(reportingCategory);
      const includedInDeposits = payoutStatus === "paid";
      const allocation = offering ? reconciliationAllocation(offering) : null;

      payoutNet += transactionNet;
      if (includedInDeposits) {
        payoutCompositionNetCents += transactionNet;
        if (transactionAmount > 0) grossActivityCents += transactionAmount;
        if (isRefund) refundCents += Math.abs(transactionAmount);
        stripeFeeCents += feeParts.stripeFeeCents;
        agapayFeeCents += feeParts.agapayFeeCents;
        if (offering && allocation) {
          matchedNetCents += transactionNet;
          payoutMatchedNet += transactionNet;
          const row = allocations.get(allocation.key) || {
            ...allocation,
            grossCents: 0,
            feeCents: 0,
            netCents: 0,
            transactionCount: 0
          };
          row.grossCents += transactionAmount;
          row.feeCents += Number(transaction.fee || 0);
          row.netCents += transactionNet;
          row.transactionCount += 1;
          allocations.set(allocation.key, row);
        } else {
          unmatchedNetCents += transactionNet;
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
        matched: Boolean(offering),
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
      compositionNetCents: payoutNet,
      matchedNetCents: payoutMatchedNet,
      differenceCents
    });
  }

  if (unmatchedNetCents !== 0) {
    exceptions.push({ severity: "warning", code: "unmatched_activity", amountCents: unmatchedNetCents, message: "Some deposited Stripe activity could not be matched to an AGAPAY gift record. Review it before posting fund allocations." });
  }
  if (inTransitCents) exceptions.push({ severity: "info", code: "in_transit", amountCents: inTransitCents, message: "One or more payouts expected this month are still pending or in transit." });
  if (failedPayoutCents) exceptions.push({ severity: "error", code: "failed_payout", amountCents: failedPayoutCents, message: "A payout failed or was canceled and should not be recorded as a bank deposit." });
  if (lookupState.count >= lookupState.limit) exceptions.push({ severity: "warning", code: "lookup_limit", message: "The month contains more Stripe source records than could be matched in one request. Export and review unmatched activity." });
  if (payoutsResult.body.truncated) exceptions.push({ severity: "warning", code: "payout_limit", message: "Only the first 100 payouts for this month are shown." });

  const gifts = (await loadParishPaidOfferings(env, parishId, 2000)).filter((gift) => {
    const time = new Date(gift.createdAt || gift.date || 0).getTime();
    return Number.isFinite(time) && time >= Date.parse(period.startIso) && time < Date.parse(period.endIso);
  });
  const giftActivity = {
    giftCount: gifts.length,
    grossGiftCents: gifts.reduce((sum, gift) => sum + Number(gift.giftAmountCents || 0), 0),
    parishNetCents: gifts.reduce((sum, gift) => sum + Number(gift.parishNetCents ?? gift.amountCents ?? 0), 0),
    feeCents: gifts.reduce((sum, gift) => sum + Number(gift.totalFeeCents || 0), 0)
  };

  const matchedPercent = payoutCompositionNetCents
    ? Math.max(0, Math.min(100, Math.round((matchedNetCents / payoutCompositionNetCents) * 100)))
    : 100;

  return json({
    available: true,
    parishId,
    period,
    closeRecord,
    summary: {
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
      matchedPercent,
      payoutCount: payouts.length,
      paidPayoutCount: payoutRows.filter((payout) => payout.status === "paid").length,
      exceptionCount: exceptions.length
    },
    giftActivity,
    allocations: Array.from(allocations.values()).sort((a, b) => b.netCents - a.netCents),
    payouts: payoutRows.sort((a, b) => Number(b.arrivalDate || 0) - Number(a.arrivalDate || 0)),
    transactions: transactionRows.sort((a, b) => Number(b.created || 0) - Number(a.created || 0)),
    exceptions,
    generatedAt: new Date().toISOString(),
    note: "Bank deposits are grouped by Stripe payout arrival date. Gift activity is grouped separately by the date each gift was made."
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
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (!givingFeatureAccess(found.registration, "reconciliation")) {
    return json({ error: "Monthly reconciliation is available with Giving Plus." }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
  const period = reconciliationPeriod(body.month);
  const bankStatementCents = Math.round(Number(body.bankStatementCents));
  if (!Number.isFinite(bankStatementCents) || bankStatementCents < 0) return json({ error: "Enter a valid bank statement deposit total." }, { status: 400 });
  const closed = body.closed !== false;
  const stripeAccountId = found.registration.stripeAccountId || "";
  if (!stripeAccountId) return json({ error: "Connect Stripe before closing a reconciliation month." }, { status: 409 });
  const payoutsResult = await listStripePayoutsForPeriod(env, stripeAccountId, period, 100);
  if (!payoutsResult.ok) {
    return json({ error: "Unable to verify Stripe deposits before closing the month.", detail: payoutsResult.body?.error?.message || "Stripe request failed" }, { status: 502 });
  }
  const expectedDepositCents = (payoutsResult.body.data || [])
    .filter((payout) => String(payout.status || "").toLowerCase() === "paid")
    .reduce((sum, payout) => sum + Number(payout.amount || 0), 0);
  const notes = String(body.notes || "").trim().slice(0, 2000);
  if (closed && bankStatementCents !== expectedDepositCents && !notes) {
    return json({ error: "Add a treasurer note explaining the bank difference before closing." }, { status: 400 });
  }
  const record = {
    parishId,
    month: period.month,
    status: closed ? "closed" : "open",
    bankStatementCents,
    expectedDepositCents,
    differenceCents: bankStatementCents - expectedDepositCents,
    notes,
    closedAt: closed ? new Date().toISOString() : "",
    updatedAt: new Date().toISOString()
  };
  await saveReconciliationCloseRecord(env, parishId, period.month, record);
  return json({ ok: true, record });
}
