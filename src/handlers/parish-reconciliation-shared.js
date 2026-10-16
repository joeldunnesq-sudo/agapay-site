// Generated from src/handlers/parish-reconciliation-shared.ts by npm run build:server. Do not edit.
import {
  reconciliationPeriod,
  listStripePayoutsForPeriod,
  listStripeBalanceTransactionsForPayout,
  buildFundTransferWorksheet,
} from './parish-reconciliation.js';
import {
  fundReportPeriod,
  createFundAllocationResolver,
  parishReportingTimezone,
  loadFundGiftActivity,
} from '../lib/fund-reporting.js';
import { d1, d1GetSetting, resolveParishDashboardSession } from '../lib/core.js';
import { stripeGetConnectedRequest, stripeObjectId } from '../lib/stripe-connect.js';
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
} from './parish.js';
function paymentIntentFromStripeSource(source) {
  if (!source || typeof source === 'string') return '';
  return (
    stripeObjectId(source.payment_intent) ||
    stripeObjectId(source.charge?.payment_intent) ||
    stripeObjectId(source.source?.payment_intent)
  );
}
function signedFeeParts(transaction, source) {
  const details = Array.isArray(transaction.fee_details) ? transaction.fee_details : [];
  const applicationFee = details
    .filter((item) => String(item.type || '').includes('application'))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const sourceApplicationFee = Number(transaction.amount) > 0 ? Number(source?.application_fee_amount || 0) : 0;
  const agapayFeeCents = details.length ? applicationFee : sourceApplicationFee;
  return {
    agapayFeeCents,
    stripeFeeCents: Number(transaction.fee || 0) - agapayFeeCents,
  };
}
async function reconciliationReviewHistory(env, parishId, month) {
  if (!d1(env)) return [];
  const prefix = `reconciliation-close:${parishId}:${month}:revision:`;
  const result = await d1(env)
    .prepare(
      "SELECT json_extract(value, '$.record') AS record FROM app_settings WHERE substr(key,1,length(?1))=?1 ORDER BY updated_at DESC,key DESC LIMIT 25"
    )
    .bind(prefix)
    .all();
  return (result.results || [])
    .map((row) => {
      try {
        return JSON.parse(row.record);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
async function reconciliationCloseRecord(env, parishId, month) {
  const key = `reconciliation-close:${parishId}:${month}`;
  const raw = d1(env) ? await d1GetSetting(env, key) : await env.AGAPAY_REGISTRATIONS?.get(key);
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
async function paymentIntentForReconciliationTransaction(env, stripeAccountId, transaction, lookupState) {
  const source = transaction.source;
  const sourceId = stripeObjectId(source);
  const expandedPaymentIntent = paymentIntentFromStripeSource(source);
  if (expandedPaymentIntent) return { paymentIntentId: expandedPaymentIntent, source };
  if (lookupState.cache.has(sourceId)) return lookupState.cache.get(sourceId);
  if (!sourceId || !/^(ch_|re_|dp_)/.test(sourceId)) return { paymentIntentId: '', source };
  if (lookupState.count >= lookupState.limit) {
    lookupState.truncated = true;
    return { paymentIntentId: '', source };
  }
  lookupState.count += 1;
  let result = null;
  if (sourceId.startsWith('ch_')) {
    result = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(sourceId)}`, stripeAccountId);
  } else if (sourceId.startsWith('re_')) {
    result = await stripeGetConnectedRequest(env, `/v1/refunds/${encodeURIComponent(sourceId)}`, stripeAccountId);
  } else if (sourceId.startsWith('dp_')) {
    result = await stripeGetConnectedRequest(env, `/v1/disputes/${encodeURIComponent(sourceId)}`, stripeAccountId);
  }
  const resolvedSource = result?.ok ? result.body : source;
  let paymentIntentId = paymentIntentFromStripeSource(resolvedSource);
  if (!paymentIntentId && result?.ok && /^(re_|dp_)/.test(sourceId)) {
    const chargeId = stripeObjectId(result.body.charge);
    if (chargeId && lookupState.count < lookupState.limit) {
      lookupState.count += 1;
      const chargeResult = await stripeGetConnectedRequest(
        env,
        `/v1/charges/${encodeURIComponent(chargeId)}`,
        stripeAccountId
      );
      if (chargeResult.ok) paymentIntentId = stripeObjectId(chargeResult.body.payment_intent);
    }
  }
  const resolved = { paymentIntentId, source: resolvedSource };
  lookupState.cache.set(sourceId, resolved);
  return resolved;
}
async function prepareReconciliationReport(env, parishId, registration, params) {
  let period;
  try {
    period = reconciliationPeriod(
      params.get('month'),
      /* @__PURE__ */ new Date(),
      parishReportingTimezone(registration)
    );
  } catch (error) {
    return json({ error: error.message }, { status: 422 });
  }
  const closeRecord = await reconciliationCloseRecord(env, parishId, period.month);
  const reviewHistory = await reconciliationReviewHistory(env, parishId, period.month);
  const stripeAccountId = registration.stripeAccountId || '';
  if (!stripeAccountId) {
    return json({
      available: false,
      reason: 'Connect Stripe before reconciling monthly deposits.',
      parishId,
      period,
      closeRecord,
      generatedAt: /* @__PURE__ */ new Date().toISOString(),
    });
  }
  const payoutsResult = await listStripePayoutsForPeriod(env, stripeAccountId, period, 100);
  if (!payoutsResult.ok) {
    return json(
      { error: 'Unable to load Stripe payouts', detail: payoutsResult.body?.error?.message || 'Stripe request failed' },
      { status: 502 }
    );
  }
  const payouts = payoutsResult.body.data || [];
  const lookupState = { count: 0, limit: 80, cache: /* @__PURE__ */ new Map() };
  const offeringCache = /* @__PURE__ */ new Map();
  const allocations = /* @__PURE__ */ new Map();
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
  const seenTransactions = /* @__PURE__ */ new Set();
  for (const payout of payouts) {
    const payoutStatus = String(payout.status || 'unknown').toLowerCase();
    const payoutAmount = Number(payout.amount || 0);
    if ((payout.currency || 'usd') !== 'usd') {
      exceptions.push({
        severity: 'error',
        code: 'currency',
        payoutId: payout.id,
        message: 'A payout uses another currency. Separate currency reporting is required.',
      });
      continue;
    }
    if (
      !Number.isSafeInteger(payoutAmount) ||
      payoutAmount < 0 ||
      !['paid', 'pending', 'in_transit', 'failed', 'canceled', 'cancelled'].includes(payoutStatus)
    ) {
      exceptions.push({
        severity: 'error',
        code: 'invalid_payout',
        payoutId: payout.id,
        message: 'A payout has an unsupported amount or status and needs review.',
      });
      continue;
    }
    if (payoutStatus === 'paid') depositedCents += payoutAmount;
    else if (['pending', 'in_transit'].includes(payoutStatus)) inTransitCents += payoutAmount;
    else if (['failed', 'canceled', 'cancelled'].includes(payoutStatus)) failedPayoutCents += payoutAmount;
    if (
      payoutStatus !== 'paid' ||
      payout.automatic !== true ||
      payout.method === 'instant' ||
      (payout.reconciliation_status && payout.reconciliation_status !== 'completed') ||
      transactionRows.length >= 2500
    ) {
      const unsupported = payoutStatus === 'paid';
      if (unsupported)
        exceptions.push({
          severity: 'error',
          code: 'unsupported_or_large_payout',
          payoutId: payout.id,
          message:
            'This payout is manual/instant, is still preparing its settlement breakdown, or exceeds the interactive report limit. Its fund allocation is not verified. Contact support for a complete report.',
        });
      payoutRows.push({
        id: payout.id,
        status: payoutStatus,
        amountCents: payoutAmount,
        arrivalDate: payout.arrival_date || 0,
        transactionCount: 0,
        matchingComplete: false,
        differenceCents: null,
      });
      continue;
    }
    const balanceResult = await listStripeBalanceTransactionsForPayout(env, stripeAccountId, payout.id, 500);
    if (!balanceResult.ok) {
      exceptions.push({
        severity: 'error',
        code: 'payout_unavailable',
        payoutId: payout.id,
        message: `Could not load the transactions composing payout ${payout.id}.`,
      });
      payoutRows.push({
        id: payout.id,
        status: payoutStatus,
        amountCents: payoutAmount,
        arrivalDate: payout.arrival_date || 0,
        created: payout.created || 0,
        transactionCount: 0,
        compositionNetCents: 0,
        differenceCents: payoutAmount,
      });
      continue;
    }
    const transactions = balanceResult.body.data || [];
    if (balanceResult.body.truncated)
      exceptions.push({
        severity: 'error',
        code: 'transaction_limit',
        payoutId: payout.id,
        message: 'Not all payout transactions were retrieved. This report cannot be finalized.',
      });
    let payoutNet = 0;
    let payoutMatchedNet = 0;
    for (const transaction of transactions) {
      if (
        !transaction.id ||
        seenTransactions.has(transaction.id) ||
        (transaction.currency || 'usd') !== 'usd' ||
        ![transaction.amount, transaction.fee, transaction.net].every(Number.isSafeInteger) ||
        transaction.amount - transaction.fee !== transaction.net
      ) {
        exceptions.push({
          severity: 'error',
          code: 'transaction_identity',
          payoutId: payout.id,
          message: 'Duplicate, invalid, or different-currency transaction needs review.',
        });
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
        if (
          offering?.parishId !== parishId ||
          (offering?.stripeAccountId && offering.stripeAccountId !== stripeAccountId) ||
          (typeof offering?.livemode === 'boolean' &&
            typeof payout.livemode === 'boolean' &&
            offering.livemode !== payout.livemode)
        )
          offering = null;
      }
      const feeParts = signedFeeParts(transaction, resolved.source);
      const reportingCategory = String(transaction.reporting_category || transaction.type || 'other');
      const isRefund = transactionAmount < 0 || /refund|dispute|chargeback/.test(reportingCategory);
      const includedInDeposits = payoutStatus === 'paid';
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
            transactionCount: 0,
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
        type: transaction.type || '',
        reportingCategory,
        sourceId: stripeObjectId(transaction.source),
        paymentIntentId,
        grossCents: transactionAmount,
        feeCents: Number(transaction.fee || 0),
        netCents: transactionNet,
        matched: Boolean(offering && allocation),
        allocationKey: allocation?.key || '',
        donorName: offering ? giftDisplayName(offering) : '',
        donorEmail: offering?.donorEmail || offering?.email || '',
        giftType: offering?.giftType || '',
        fund: offering?.fund || offering?.fundId || '',
        campaign: offering?.campaign || offering?.campaignId || '',
        allocationCategory: allocation?.category || 'Unmatched',
        allocationLabel: allocation?.label || 'Unmatched Stripe activity',
      });
    }
    const differenceCents = payoutAmount - payoutNet;
    if (payoutStatus === 'paid' && differenceCents !== 0) {
      exceptions.push({
        severity: 'warning',
        code: 'payout_difference',
        payoutId: payout.id,
        amountCents: differenceCents,
        message: `Payout ${payout.id} differs from its listed Stripe transactions.`,
      });
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
      differenceCents,
    });
  }
  if (unmatchedCount > 0) {
    exceptions.push({
      severity: 'warning',
      code: 'unmatched_activity',
      amountCents: unmatchedNetCents,
      message: `${unmatchedCount} payout item(s) need classification (${(unmatchedAbsoluteCents / 100).toFixed(2)} USD absolute activity). This may include commerce, taxes, or other Stripe adjustments; none has been assigned to General.`,
    });
  }
  if (inTransitCents)
    exceptions.push({
      severity: 'info',
      code: 'in_transit',
      amountCents: inTransitCents,
      message: 'One or more payouts expected this month are still pending or in transit.',
    });
  if (failedPayoutCents)
    exceptions.push({
      severity: 'error',
      code: 'failed_payout',
      amountCents: failedPayoutCents,
      message: 'A payout failed or was canceled and should not be recorded as a bank deposit.',
    });
  if (lookupState.truncated)
    exceptions.push({
      severity: 'warning',
      code: 'lookup_limit',
      message:
        'The month contains more Stripe source records than could be matched in one request. Export and review unmatched activity.',
    });
  if (payoutsResult.body.truncated)
    exceptions.push({
      severity: 'warning',
      code: 'payout_limit',
      message: 'Only the first 100 payouts for this month are shown.',
    });
  const activity = await loadFundGiftActivity(env, parishId, period, registration).catch(() => ({
    available: false,
    complete: false,
    reason: 'Giving-date totals could not be verified. Retry the report.',
  }));
  const giftActivity = {
    ...activity,
    giftCount: activity.giftCount || 0,
    grossGiftCents: activity.grossGiftCents || 0,
    parishNetCents: activity.parishNetCents || 0,
    feeCents: activity.feeCents || 0,
  };
  const paidRows = transactionRows.filter((row) => row.payoutStatus === 'paid');
  const matchedPercent = paidRows.length
    ? Math.floor((100 * (paidRows.length - unmatchedCount)) / paidRows.length)
    : null;
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
    paidPayoutCount: payoutRows.filter((payout) => payout.status === 'paid').length,
    exceptionCount: exceptions.length,
  };
  const complete = !exceptions.some((item) => item.severity !== 'info');
  summary.matchingComplete = complete;
  summary.readyForReview = complete && !period.inProgress && !inTransitCents && !failedPayoutCents;
  const identity = JSON.stringify({
    version: 2,
    parishId,
    stripeAccountId,
    period,
    summary,
    payouts: payoutRows,
    transactions: transactionRows,
    allocations: allocationRows,
  });
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const reviewCurrent = closeRecord?.status === 'closed' && closeRecord.fingerprint === fingerprint;
  return json({
    available: true,
    complete,
    fingerprint,
    currency: 'usd',
    stripeAccountId,
    state: reviewCurrent
      ? 'reconciled'
      : closeRecord?.status === 'closed'
        ? 'revised'
        : summary.readyForReview
          ? 'ready_for_bank_check'
          : 'needs_review',
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
    generatedAt: /* @__PURE__ */ new Date().toISOString(),
    note: 'Payouts are grouped by Stripe expected arrival date (UTC calendar date), not independent bank posting dates. Giving activity uses the parish timezone. Totals describe period receipts, not current fund balances.',
  });
}
export {
  createFundAllocationResolver,
  d1,
  d1GetSetting,
  findRegistrationByParishId,
  fundReportPeriod,
  getBearerToken,
  giftDisplayName,
  givingFeatureAccess,
  hasProductionStore,
  json,
  loadDonorOfferingByPaymentIntent,
  loadFundGiftActivity,
  missingProductionStoreResponse,
  parishReportingTimezone,
  paymentIntentForReconciliationTransaction,
  paymentIntentFromStripeSource,
  prepareReconciliationReport,
  rateLimit,
  reconciliationCloseRecord,
  reconciliationReviewHistory,
  resolveParishDashboardSession,
  signedFeeParts,
  stripeGetConnectedRequest,
  stripeObjectId,
  unauthorized,
  verifyParishDashboardBearer,
};
