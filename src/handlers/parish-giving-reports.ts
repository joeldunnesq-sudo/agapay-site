import type { StripeRequestEnv, StripeCharge, StripeResponseBody } from '../lib/stripe-connect.js';
interface ReportingRegistration extends DashboardRegistration {
  timezone?: string | null;
  stripeAccountId?: string | null;
  onboardingStripeTestFixture?: { id?: string } | null;
}
import type { ManualGivingRow } from '../lib/manual-giving-model.js';
import type { DashboardRegistration } from './parish-dashboard-handler.js';
// src/handlers/parish-giving-reports.js
// Parish giving summaries, history, Stripe volume, and recurring-gift health.

import {
  findRegistrationByParishId,
  getBearerToken,
  givingFeatureAccess,
  hasProductionStore,
  json,
  loadParishPaidOfferings,
  loadParishRecurringOfferings,
  missingProductionStoreResponse,
  parishDashboardPayload,
  rateLimit,
  summarizeCharges,
  summarizeParishRecurringHealth,
  unauthorized,
  verifyParishDashboardBearer,
} from './parish.js';
import { fundReportPeriod, parishReportingTimezone, loadFundGiftActivity } from '../lib/fund-reporting.js';
import { exportMonthlyGiving } from '../lib/monthly-giving-export.js';
import { outsideGiftsForGiving, subtractLinkedOutsideGifts } from '../lib/outside-gifts.js';
import { d1 } from '../lib/core.js';
import { summarizeStoredParishGifts } from '../lib/stored-giving-summary.js';
export { summarizeStoredParishGifts } from '../lib/stored-giving-summary.js';
import { listYtdStripeCharges } from '../lib/stripe-connect.js';
import { refreshStripeVolume, summarizeStoredStripeVolume } from '../lib/stripe-volume.js';
import { resolveOperationalAccountingDatabase } from '../accounting/source-wiring.js';

function stagingOnboardingFixture(env: Partial<Env>, registration: ReportingRegistration): boolean {
  return (
    ['development', 'local', 'preview', 'staging', 'test'].includes(
      String(env.AGAPAY_ENVIRONMENT || '')
        .trim()
        .toLowerCase()
    ) &&
    String(registration.stripeAccountId || '').startsWith('acct_staging_') &&
    registration.onboardingStripeTestFixture?.id === registration.stripeAccountId
  );
}

// Keep parishDashboardPayload in the explicit shared-core dependency contract for
// this reporting cluster, even though the current endpoints return narrower payloads.
void parishDashboardPayload;

import { manualAccountingGifts } from '../lib/manual-giving-model.js';

export async function loadManualAccountingGivingEntries(
  env: Partial<Env> & StripeRequestEnv,
  parishId: string,
  limit: number = 500
) {
  const db = await resolveOperationalAccountingDatabase(env, parishId);
  if (!db) return [];
  try {
    const result = await db
      .prepare(
        `
      SELECT e.id entry_id,l.id line_id,COALESCE(e.posting_date,e.entry_date) gift_date,
        e.description entry_description,e.source_type,l.credit_amount,
        a.account_number,a.name account_name,f.code fund_code,f.name fund_name
      FROM accounting_journal_entries e
      JOIN accounting_journal_lines l ON l.journal_entry_id=e.id
      JOIN accounting_accounts a ON a.id=l.account_id
      JOIN accounting_account_types t ON t.id=a.account_type_id
      JOIN accounting_funds f ON f.id=l.fund_id
      WHERE e.status='posted'
        AND e.source_type IN ('manual','manual_register_contribution')
        AND t.category='revenue' AND l.credit_amount>0
      ORDER BY gift_date DESC,e.created_at DESC,l.line_number
      LIMIT ?
    `
      )
      .bind(Math.max(1, Math.min(2000, Number(limit) || 500)))
      .all<ManualGivingRow>();
    return manualAccountingGifts(result.results || []);
  } catch (error) {
    if (
      /no such table|not configured|unavailable/i.test(String((error as { message?: unknown } | null)?.message || ''))
    )
      return [];
    throw error;
  }
}

export async function handleParishGivingSummary(
  request: Request,
  env: Partial<Env> & StripeRequestEnv,
  parishId: string
) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-dashboard', { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId<ReportingRegistration>(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (new URL(request.url).searchParams.get('view') === 'weekly-funds') {
    try {
      const period = fundReportPeriod({ week: true, timezone: parishReportingTimezone(found.registration) });
      return json({ weeklyFunds: await loadFundGiftActivity(env, parishId, period, found.registration) });
    } catch {
      return json({ error: 'Weekly fund totals could not be verified. Please retry.' }, { status: 503 });
    }
  }

  const emptySummary = {
    ...summarizeCharges([]),
    generatedAt: new Date().toISOString(),
  };

  const url = new URL(request.url);
  const forceStripe = url.searchParams.get('source') === 'stripe';
  const storedGifts = await loadParishPaidOfferings(env, parishId, 2000);
  if (stagingOnboardingFixture(env, found.registration)) {
    return json({
      summary: {
        ...summarizeStoredParishGifts(storedGifts),
        dataSource: 'staging_fixture',
        simulated: true,
        generatedAt: new Date().toISOString(),
        note: 'Staging onboarding simulation. No Stripe payment data was queried.',
      },
    });
  }

  if (storedGifts.length && !forceStripe) {
    return json({
      summary: {
        ...summarizeStoredParishGifts(storedGifts),
        dataSource: 'stored',
        generatedAt: new Date().toISOString(),
        note: 'Showing stored AGAPAY gift records.',
      },
    });
  }

  if (!found.registration.stripeAccountId || String(found.registration.stripeAccountId).startsWith('acct_demo_')) {
    return json({
      summary: {
        ...(storedGifts.length ? summarizeStoredParishGifts(storedGifts) : emptySummary),
        dataSource: storedGifts.length ? 'stored' : 'not_connected',
        generatedAt: new Date().toISOString(),
        note: storedGifts.length
          ? 'Showing seeded AGAPAY gift records for this demo parish.'
          : 'Stripe is not connected yet.',
      },
    });
  }

  const result = await listYtdStripeCharges(env, found.registration.stripeAccountId);
  if (!result.ok) {
    if (storedGifts.length) {
      return json({
        summary: {
          ...summarizeStoredParishGifts(storedGifts),
          dataSource: 'stored',
          generatedAt: new Date().toISOString(),
          note: 'Showing stored AGAPAY gift records because Stripe summary is unavailable.',
        },
      });
    }
    return json(
      {
        error: 'Stripe giving summary failed',
        detail: (result.body as StripeResponseBody).error?.message || 'Unknown Stripe error',
      },
      { status: 502 }
    );
  }

  return json({
    summary: {
      ...summarizeCharges((result.body.data || []) as StripeCharge[]),
      dataSource: 'stripe',
      generatedAt: new Date().toISOString(),
      note:
        ((result.body.data as StripeCharge[] | undefined)?.length as number) >= 500
          ? 'Showing the first 500 Stripe charges for this year.'
          : '',
    },
  });
}

export async function handleParishStripeVolume(
  request: Request,
  env: Partial<Env> & StripeRequestEnv,
  parishId: string
) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-stripe-volume', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId<ReportingRegistration>(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();

  if (stagingOnboardingFixture(env, found.registration)) {
    return json({
      volume: {
        ...(await summarizeStoredStripeVolume(env, parishId)),
        connected: false,
        simulated: true,
        note: 'Staging onboarding simulation. No Stripe payment data was queried.',
      },
    });
  }

  const stripeAccountId = found.registration.stripeAccountId || '';
  if (!stripeAccountId || stripeAccountId.startsWith('acct_demo_')) {
    return json({
      volume: {
        ...(await summarizeStoredStripeVolume(env, parishId)),
        connected: false,
        note: 'Connect the parish Stripe account to begin payment-volume tracking.',
      },
    });
  }

  try {
    const refresh = await refreshStripeVolume(env, parishId, stripeAccountId);
    const volume = await summarizeStoredStripeVolume(env, parishId, refresh.periodStart);
    return json({
      volume: {
        ...volume,
        connected: true,
        note: volume.scan.complete
          ? 'Donation share is an AGAPAY estimate based on classified Stripe charge volume.'
          : 'Stripe history is still being scanned. Refresh again to continue before relying on the percentage.',
      },
    });
  } catch (error) {
    const volume = await summarizeStoredStripeVolume(env, parishId);
    return json(
      {
        error: 'Stripe volume refresh failed',
        detail: (error as { message?: unknown } | null)?.message || 'Stripe request failed',
        volume: { ...volume, connected: true },
      },
      { status: 502 }
    );
  }
}

export async function handleParishGivingHistory(
  request: Request,
  env: Partial<Env> & StripeRequestEnv,
  parishId: string
) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-dashboard', { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId<ReportingRegistration>(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (new URL(request.url).searchParams.get('format') === 'csv') {
    return exportMonthlyGiving(request, env, parishId, found.registration);
  }

  const [gifts, manualAccountingGifts, outsideGifts] = await Promise.all([
    loadParishPaidOfferings(env, parishId, 500),
    loadManualAccountingGivingEntries(env, parishId, 500),
    outsideGiftsForGiving(env, parishId, found.registration),
  ]);
  return json({
    gifts: [...gifts, ...outsideGifts],
    manualAccountingGifts: subtractLinkedOutsideGifts(manualAccountingGifts, outsideGifts),
    generatedAt: new Date().toISOString(),
  });
}

export async function handleParishRecurringHealth(
  request: Request,
  env: Partial<Env> & StripeRequestEnv,
  parishId: string
) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-dashboard', { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId<ReportingRegistration>(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (!givingFeatureAccess(found.registration, 'giverInsights')) {
    return json({ error: 'Recurring-gift insights are available with Give +.' }, { status: 403 });
  }

  const records = await loadParishRecurringOfferings(env, parishId, 1000);
  return json({
    health: summarizeParishRecurringHealth(records),
  });
}
