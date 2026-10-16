// Generated from src/handlers/parish-payout-diagnostics.ts by npm run build:server. Do not edit.
import {
  stripeGetConnectedRequest,
  findRegistrationByParishId,
  getBearerToken,
  hasProductionStore,
  json,
  loadDonorOfferingByPaymentIntent,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
  verifyParishDashboardBearer,
} from './parish-reconciliation-shared.js';
import {
  listRecentStripePayouts,
  listStripeBalanceTransactionsForPayout,
  listRecentStripeBalanceTransactions,
} from './parish-reconciliation.js';
async function handleParishPayoutDiagnostics(request, env, parishId) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-dashboard', { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (!found.registration.stripeAccountId) {
    return json({
      parishId,
      available: false,
      reason: 'Stripe is not connected for this parish.',
    });
  }
  const stripeAccountId = found.registration.stripeAccountId;
  const payoutsResult = await listRecentStripePayouts(env, stripeAccountId, 5);
  if (!payoutsResult.ok) {
    return json(
      {
        parishId,
        stripeAccountId,
        available: false,
        payoutsRequest: {
          ok: false,
          status: payoutsResult.status,
          error: payoutsResult.body?.error?.message || 'Unknown Stripe error',
        },
      },
      { status: 502 }
    );
  }
  const payouts = payoutsResult.body.data || [];
  const diagnostics = {
    parishId,
    stripeAccountId,
    payoutsRequest: {
      ok: true,
      count: payouts.length,
    },
    payouts: payouts.map((payout) => ({
      id: payout.id,
      status: payout.status,
      amount: payout.amount,
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      currency: payout.currency || 'usd',
    })),
    balanceTransactionsRequest: null,
    samplePayoutTransactions: [],
    matchedOfferings: [],
    traceability: {
      chargeLinkedTransactionCount: 0,
      paymentIntentLinkedOfferingCount: 0,
      notes: [],
    },
  };
  if (!payouts.length) {
    diagnostics.traceability.notes.push('Stripe returned no payouts for this connected account yet.');
    const recentBalanceResult = await listRecentStripeBalanceTransactions(env, stripeAccountId, 25);
    if (!recentBalanceResult.ok) {
      diagnostics.balanceTransactionsRequest = {
        ok: false,
        status: recentBalanceResult.status,
        error: recentBalanceResult.body?.error?.message || 'Unknown Stripe error',
      };
      diagnostics.traceability.notes.push(
        'Recent balance transactions could not be listed, so charge traceability remains unverified.'
      );
      return json(diagnostics);
    }
    diagnostics.balanceTransactionsRequest = {
      ok: true,
      mode: 'recent',
      count: recentBalanceResult.body.data?.length || 0,
    };
    const recentTransactions = recentBalanceResult.body.data || [];
    const chargeIds2 = /* @__PURE__ */ new Set();
    const paymentIntentIds2 = /* @__PURE__ */ new Set();
    const matchedOfferings2 = [];
    for (const transaction of recentTransactions) {
      const sourceId = typeof transaction.source === 'string' ? transaction.source : transaction.source?.id || '';
      if (sourceId.startsWith('ch_')) chargeIds2.add(sourceId);
      if (sourceId.startsWith('pi_')) paymentIntentIds2.add(sourceId);
    }
    for (const chargeId of chargeIds2) {
      const chargeResult = await stripeGetConnectedRequest(
        env,
        `/v1/charges/${encodeURIComponent(chargeId)}`,
        stripeAccountId
      );
      if (!chargeResult.ok) continue;
      const paymentIntentId =
        typeof chargeResult.body.payment_intent === 'string'
          ? chargeResult.body.payment_intent
          : chargeResult.body.payment_intent?.id || '';
      if (paymentIntentId) paymentIntentIds2.add(paymentIntentId);
    }
    for (const paymentIntentId of paymentIntentIds2) {
      const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
      if (offering?.parishId === parishId && !matchedOfferings2.some((item) => item.id === offering.id))
        matchedOfferings2.push(offering);
    }
    diagnostics.samplePayoutTransactions = recentTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      fee: transaction.fee,
      net: transaction.net,
      source: typeof transaction.source === 'string' ? transaction.source : transaction.source?.id || '',
      reportingCategory: transaction.reporting_category || '',
      availableOn: transaction.available_on || 0,
      created: transaction.created || 0,
    }));
    diagnostics.matchedOfferings = matchedOfferings2.map((offering) => ({
      id: offering.id,
      donorName: offering.donorName || '',
      donorEmail: offering.donorEmail || '',
      amountCents: offering.amountCents || 0,
      chargeCents: offering.chargeCents || offering.amountCents || 0,
      agapayFeeCents: offering.agapayFeeCents || 0,
      estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
      giftType: offering.giftType || '',
      fund: offering.fund || '',
      campaign: offering.campaign || '',
      paymentIntentId: offering.stripePaymentIntentId || '',
      checkoutSessionId: offering.checkoutSessionId || '',
    }));
    diagnostics.traceability.chargeLinkedTransactionCount = chargeIds2.size;
    diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings2.length;
    if (chargeIds2.size)
      diagnostics.traceability.notes.push('Recent balance transactions include charge ids in `source`.');
    if (paymentIntentIds2.size)
      diagnostics.traceability.notes.push(
        'Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.'
      );
    if (matchedOfferings2.length)
      diagnostics.traceability.notes.push(
        'Recent balance transactions can be matched back to AGAPAY donor_offerings records.'
      );
    return json(diagnostics);
  }
  const samplePayout = payouts[0];
  const balanceResult = await listStripeBalanceTransactionsForPayout(env, stripeAccountId, samplePayout.id, 100);
  if (!balanceResult.ok) {
    diagnostics.balanceTransactionsRequest = {
      ok: false,
      payoutId: samplePayout.id,
      status: balanceResult.status,
      error: balanceResult.body?.error?.message || 'Unknown Stripe error',
    };
    return json(diagnostics, { status: 502 });
  }
  diagnostics.balanceTransactionsRequest = {
    ok: true,
    payoutId: samplePayout.id,
    count: balanceResult.body.data?.length || 0,
  };
  const transactions = balanceResult.body.data || [];
  const chargeIds = /* @__PURE__ */ new Set();
  const paymentIntentIds = /* @__PURE__ */ new Set();
  const matchedOfferings = [];
  for (const transaction of transactions) {
    const sourceId = typeof transaction.source === 'string' ? transaction.source : transaction.source?.id || '';
    if (sourceId.startsWith('ch_')) chargeIds.add(sourceId);
    if (sourceId.startsWith('pi_')) paymentIntentIds.add(sourceId);
  }
  for (const chargeId of chargeIds) {
    const chargeResult = await stripeGetConnectedRequest(
      env,
      `/v1/charges/${encodeURIComponent(chargeId)}`,
      stripeAccountId
    );
    if (!chargeResult.ok) continue;
    const paymentIntentId =
      typeof chargeResult.body.payment_intent === 'string'
        ? chargeResult.body.payment_intent
        : chargeResult.body.payment_intent?.id || '';
    if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
  }
  for (const paymentIntentId of paymentIntentIds) {
    const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
    if (offering?.parishId === parishId && !matchedOfferings.some((item) => item.id === offering.id))
      matchedOfferings.push(offering);
  }
  diagnostics.samplePayoutTransactions = transactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    fee: transaction.fee,
    net: transaction.net,
    source: typeof transaction.source === 'string' ? transaction.source : transaction.source?.id || '',
    reportingCategory: transaction.reporting_category || '',
    availableOn: transaction.available_on || 0,
    created: transaction.created || 0,
  }));
  diagnostics.matchedOfferings = matchedOfferings.map((offering) => ({
    id: offering.id,
    donorName: offering.donorName || '',
    donorEmail: offering.donorEmail || '',
    amountCents: offering.amountCents || 0,
    chargeCents: offering.chargeCents || offering.amountCents || 0,
    agapayFeeCents: offering.agapayFeeCents || 0,
    estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
    giftType: offering.giftType || '',
    fund: offering.fund || '',
    campaign: offering.campaign || '',
    paymentIntentId: offering.stripePaymentIntentId || '',
    checkoutSessionId: offering.checkoutSessionId || '',
  }));
  diagnostics.traceability.chargeLinkedTransactionCount = chargeIds.size;
  diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings.length;
  if (chargeIds.size)
    diagnostics.traceability.notes.push('Sample payout balance transactions include charge ids in `source`.');
  if (paymentIntentIds.size)
    diagnostics.traceability.notes.push(
      'Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.'
    );
  if (matchedOfferings.length) {
    diagnostics.traceability.notes.push(
      'At least some payout line items can be matched back to AGAPAY donor_offerings records.'
    );
  } else {
    diagnostics.traceability.notes.push(
      'No AGAPAY donor_offerings records matched the sampled payout transaction sources yet.'
    );
  }
  return json(diagnostics);
}
export { handleParishPayoutDiagnostics };
