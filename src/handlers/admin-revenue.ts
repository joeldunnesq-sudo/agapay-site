import type {
  AdminRegistration,
  AdminRevenueAccumulator,
  AdminSqlRow,
  AdminEnvironment,
  AdminChargeResult,
} from './admin-composition-contracts.js';

import {
  d1,
  d1All,
  d1First,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  safeParseJsonRow,
  unauthorized,
} from '../lib/core.js';

import '../lib/mfa.js';

import { buildAdminOverviewMetrics } from '../lib/admin-overview-metrics.js';

import '../lib/registrations.js';

import { monthLabel } from '../lib/format.js';

import { subscriptionReady, subscriptionTier } from '../lib/subscriptions.js';

import '../lib/subscription-checkout.js';

import '../lib/parish-notifications.js';

import '../lib/memberships.js';

import { listYtdStripeCharges, summarizeCharges } from '../lib/stripe-connect.js';

import { loadRegistrationByReference, requireAdmin } from './parish.js';

import './parish-commemorations.js';

import '../lib/audit-log.js';

import '../lib/tax-readiness.js';

import '../lib/parish-onboarding.js';

import '../lib/entitlements.js';

import '../lib/stewardship-funds.js';

import '../organizations/verification-policies.js';

import '../accounting/index.js';

import './accounting-ledger.js';
import './admin-shared.js';
import { loadAllRegistrations } from './admin-registration-storage.js';
import './admin-session-operations.js';
import './admin-registration-detail.js';
import './admin-onboarding-test.js';
import './admin-accounting-operations.js';
export function emptySubscriptionProduct(id: string, label: string) {
  return {
    id,
    label,
    monthlyCents: 0,
    activeCount: 0,
    trialingCount: 0,
    estimated: true,
  };
}
export function normalizeProductSubscriptionStatus(value: unknown) {
  const status = String(value || '')
    .trim()
    .toLowerCase();
  if (['active', 'trialing', 'free_forever'].includes(status)) return status;
  return '';
}
export function addSubscriptionRevenueProduct(
  summary: AdminRevenueAccumulator,
  id: string,
  label: string,
  cents: unknown,
  status: unknown = 'active'
) {
  const normalized = normalizeProductSubscriptionStatus(status) || 'active';
  const product = summary.byProduct![id] || emptySubscriptionProduct(id, label);
  product.label = label;
  if (normalized !== 'free_forever') product.monthlyCents += Math.max(0, Number(cents || 0));
  if (normalized === 'trialing') product.trialingCount += 1;
  else product.activeCount += 1;
  summary.byProduct![id] = product;
}
export function monthlyEquivalentCents(value: unknown, interval: unknown = 'month') {
  const cents = Math.max(0, Number(value || 0));
  if (!cents) return 0;
  return String(interval || '')
    .toLowerCase()
    .startsWith('year')
    ? Math.round(cents / 12)
    : cents;
}
export function buildSubscriptionRevenueSummary(registrations: AdminRegistration[] = []) {
  const summary: AdminRevenueAccumulator = {
    monthLabel: monthLabel(new Date().getUTCMonth()),
    totalMonthlyCents: 0,
    byProduct: {
      give: emptySubscriptionProduct('give', 'AGAPAY Give'),
      stewardship: emptySubscriptionProduct('stewardship', 'AGAPAY Parish +'),
      learn: emptySubscriptionProduct('learn', 'AGAPAY Learn'),
    },
    note: 'Subscription revenue is estimated from active AGAPAY records and normalized to a monthly amount.',
  };

  for (const registration of registrations) {
    if (subscriptionReady(registration)) {
      const tier = subscriptionTier(registration);
      const status = registration.subscriptionStatus || registration.billingStatus || 'active';
      addSubscriptionRevenueProduct(summary, 'give', 'AGAPAY Give', tier.monthlyCents, status);
    }

    const stewardshipStatus = normalizeProductSubscriptionStatus(registration.stewardshipStatus);
    if (stewardshipStatus) {
      const plan = String(registration.stewardshipPlan || registration.stewardshipBillingInterval || '').toLowerCase();
      const monthlyCents = plan === 'annual' ? Math.round(39900 / 12) : 3900;
      addSubscriptionRevenueProduct(summary, 'stewardship', 'AGAPAY Parish +', monthlyCents, stewardshipStatus);
    }

    const learnStatus = normalizeProductSubscriptionStatus(
      registration.learnSubscriptionStatus || registration.learnStatus
    );
    if (learnStatus) {
      const plan = String(registration.learnPlan || '').toLowerCase();
      const yearlyCents = plan.includes('founding') ? 4900 : 5900;
      const interval = registration.learnBillingInterval || 'year';
      addSubscriptionRevenueProduct(
        summary,
        'learn',
        'AGAPAY Learn',
        monthlyEquivalentCents(registration.learnSubscriptionCents || yearlyCents, interval),
        learnStatus
      );
    }
  }

  summary.products = Object.values(summary.byProduct!);
  summary.totalMonthlyCents = summary.products.reduce((sum, product) => sum + product.monthlyCents, 0);
  delete summary.byProduct;
  return summary;
}
export function emptyDonationFeeSummary(now: Date = new Date()) {
  return {
    month: now.getUTCMonth() + 1,
    monthLabel: monthLabel(now.getUTCMonth()),
    agapayFeeCents: 0,
    grossGiftCents: 0,
    netDonationCents: 0,
    giftCount: 0,
    connectedAccounts: 0,
    dataSource: 'not_configured',
    note: 'AGAPAY no longer charges a donation fee; this reflects legacy application-fee revenue from before the change.',
  };
}

export async function handleAdminPlatformSummary(request: Request, env: AdminEnvironment) {
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    registered: 0,
    verified: 0,
    ytdDonationsCents: 0,
    giftCount: 0,
  }));

  let totalRegistered = 0;
  let totalVerified = 0;
  let connectedStripeAccounts = 0;
  const connected: AdminRegistration[] = [];
  let revenueRegistrations = [];

  if (d1(env)) {
    const totals = await d1First<AdminSqlRow>(
      env,
      `SELECT
         COUNT(*) AS total_registered,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS total_verified,
         SUM(CASE WHEN COALESCE(stripe_account_id, '') != '' THEN 1 ELSE 0 END) AS connected_stripe_accounts
       FROM registrations`
    );
    totalRegistered = Number(totals?.total_registered || 0);
    totalVerified = Number(totals?.total_verified || 0);
    connectedStripeAccounts = Number(totals?.connected_stripe_accounts || 0);

    const monthRows = await d1All<AdminSqlRow>(
      env,
      `SELECT
         CAST(strftime('%m', received_at) AS INTEGER) AS month,
         COUNT(*) AS registered,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified
       FROM registrations
       WHERE received_at >= ?1 AND received_at < ?2
       GROUP BY month`,
      `${year}-01-01T00:00:00.000Z`,
      `${year + 1}-01-01T00:00:00.000Z`
    );
    for (const row of monthRows) {
      const target = monthly[Number(row.month || 0) - 1];
      if (!target) continue;
      target.registered = Number(row.registered || 0);
      target.verified = Number(row.verified || 0);
    }

    const connectedRows = await d1All<AdminSqlRow>(
      env,
      `SELECT data FROM registrations
       WHERE COALESCE(stripe_account_id, '') != ''
       ORDER BY received_at DESC, reference DESC
       LIMIT 2000`
    );
    connected.push(...(connectedRows.map(safeParseJsonRow).filter(Boolean) as AdminRegistration[]));
    revenueRegistrations = await loadAllRegistrations(env, { hardLimit: 10000 });
  } else {
    const registrations = await loadAllRegistrations(env);
    revenueRegistrations = registrations;
    for (const registration of registrations) {
      totalRegistered += 1;
      if (registration.status === 'verified') totalVerified += 1;
      if (registration.stripeAccountId) {
        connectedStripeAccounts += 1;
        connected.push(registration);
      }

      const received = registration.receivedAt ? new Date(registration.receivedAt) : null;
      if (received && !Number.isNaN(received.getTime()) && received.getUTCFullYear() === year) {
        monthly[received.getUTCMonth()].registered += 1;
        if (registration.status === 'verified') monthly[received.getUTCMonth()].verified += 1;
      }
    }
  }

  let donationDataSource = 'not_configured';
  let donationError = '';
  const donationFeeRevenue = emptyDonationFeeSummary(now);

  if (env.STRIPE_SECRET_KEY && connected.length) {
    donationDataSource = 'stripe';
    donationFeeRevenue.dataSource = 'stripe';
    donationFeeRevenue.connectedAccounts = connected.length;
    for (const registration of connected) {
      const result = (await listYtdStripeCharges(env, registration.stripeAccountId!)) as AdminChargeResult;
      if (!result.ok) {
        donationDataSource = 'partial';
        donationFeeRevenue.dataSource = 'partial';
        donationError = result.body?.error?.message || 'Stripe giving summary failed for at least one parish.';
        donationFeeRevenue.note = donationError;
        continue;
      }

      const summary = summarizeCharges(result.body.data || []);
      for (const month of summary.monthly) {
        const target = monthly[month.month - 1];
        target.ytdDonationsCents += month.amountCents || 0;
        target.giftCount += month.giftCount || 0;
        if (month.month === donationFeeRevenue.month) {
          donationFeeRevenue.agapayFeeCents += month.agapayFeeCents || 0;
          donationFeeRevenue.grossGiftCents += month.grossGiftCents || 0;
          donationFeeRevenue.netDonationCents += month.amountCents || 0;
          donationFeeRevenue.giftCount += month.giftCount || 0;
        }
      }
    }
  } else if (!connected.length) {
    donationDataSource = 'not_connected';
    donationFeeRevenue.dataSource = 'not_connected';
  }
  if (donationFeeRevenue.dataSource === 'stripe') {
    donationFeeRevenue.note =
      "AGAPAY no longer charges a donation fee; this month's total reflects any legacy application fees still settling from before the change.";
  }

  const ytdDonationsCents = monthly.reduce((sum, item) => sum + item.ytdDonationsCents, 0);
  const giftCount = monthly.reduce((sum, item) => sum + item.giftCount, 0);
  const subscriptionRevenue = buildSubscriptionRevenueSummary(revenueRegistrations);

  return json({
    summary: {
      year,
      generatedAt: now.toISOString(),
      overviewMetrics: buildAdminOverviewMetrics(revenueRegistrations, now, totalRegistered),
      totalRegistered,
      totalVerified,
      connectedStripeAccounts,
      ytdDonationsCents,
      giftCount,
      revenue: {
        subscriptionRevenue,
        donationFeeRevenue,
      },
      donationDataSource,
      donationError,
      monthly,
    },
  });
}

export async function handleAdminRegistrationGivingSummary(request: Request, env: AdminEnvironment, reference: string) {
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = (await loadRegistrationByReference(env, reference)) as AdminRegistration | null;
  if (!registration) return json({ error: 'Registration not found' }, { status: 404 });

  if (!registration.stripeAccountId) {
    return json({
      summary: {
        dataSource: 'not_connected',
        year: new Date().getUTCFullYear(),
        ytdCents: 0,
        giftCount: 0,
        lastGiftAt: '',
        monthly: [],
      },
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      summary: {
        dataSource: 'not_configured',
        year: new Date().getUTCFullYear(),
        ytdCents: 0,
        giftCount: 0,
        lastGiftAt: '',
        monthly: [],
      },
    });
  }

  const result = (await listYtdStripeCharges(env, registration.stripeAccountId)) as AdminChargeResult;
  if (!result.ok) {
    return json(
      { error: 'Unable to load Stripe giving summary', detail: result.body?.error?.message || 'Stripe request failed' },
      { status: 502 }
    );
  }

  const summary = summarizeCharges(result.body?.data || []);
  return json({
    summary: {
      ...summary,
      dataSource: 'stripe',
      stripeAccountId: registration.stripeAccountId,
    },
  });
}
