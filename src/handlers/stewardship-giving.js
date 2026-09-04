import { stewardshipGivingSummary } from '../lib/stewardship-summary.js';
import {
  d1All,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
  corsHeaders,
} from '../lib/core.js';
import { readStewardshipGivingMix } from '../lib/stewardship-giving.js';
import { synchronizeGivingCatalogWithAccounting } from '../accounting/source-wiring.js';
import { STEWARDSHIP_FUND_DEFAULTS, mergeStewardshipFundsIntoRegistration } from '../lib/stewardship-funds.js';
import { verifyParishDashboardBearer, findRegistrationByParishId, saveRegistrationRecord } from './parish.js';
import { invalidateOnboardingSignoffIfChanged } from '../lib/parish-onboarding.js';
import { requireAdmin } from './admin.js';

export function addCorsHeaders(response, env) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(env);
  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEWARDSHIP GIVING SUITE — inline handlers
// These power the real-time pledge tracking add-on in the Parish dashboard.
// Reads from: household_pledges, giving_funds, donor_offerings, donors (D1).
// Feature-gated by parish_stewardship_settings.has_stewardship_suite = 1.
// ═══════════════════════════════════════════════════════════════════════════

export async function verifyParishDashboard(request, env, parishId) {
  const token = getBearerToken(request);
  if (!parishId || !token) return false;
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return false;
  return verifyParishDashboardBearer(found.registration, token);
}

export async function requireStewardshipFeature(env, parishId) {
  const row = await env.AGAPAY_DB.prepare(
    `SELECT has_stewardship_suite FROM parish_stewardship_settings WHERE parish_id = ?`
  )
    .bind(parishId)
    .first();
  if (!row || !row.has_stewardship_suite) {
    return json({ error: 'AGAPAY Parish + not activated for this parish.' }, { status: 403 });
  }
  return null; // null = access granted
}

// ── GET /api/admin/recent-activity ────────────────────────────────────────────
// Returns a merged, chronological feed of recent donors and stewardship
// activations for the admin overview tab. Limit 20 events.
export async function handleAdminRecentActivity(request, env) {
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const events = [];

  // Recent My AGAPAY user signups
  try {
    const donors = await d1All(
      env,
      `SELECT
         d.email,
         d.default_parish_id,
         d.created_at,
         COALESCE(
           NULLIF(json_extract(d.data, '$.donorName'), ''),
           NULLIF(json_extract(d.data, '$.displayName'), ''),
           TRIM(COALESCE(json_extract(d.data, '$.firstName'), '') || ' ' || COALESCE(json_extract(d.data, '$.lastName'), ''))
         ) AS donor_name,
         COALESCE(
           NULLIF(r.parish_name, ''),
           NULLIF(json_extract(r.data, '$.parishName'), '')
         ) AS parish_name
       FROM donors d
       LEFT JOIN registrations r ON r.parish_id = d.default_parish_id
       ORDER BY d.created_at DESC LIMIT 20`
    );
    for (const d of donors || []) {
      const church = d.parish_name || d.default_parish_id || '';
      events.push({
        type: 'donor_signup',
        label: 'New My AGAPAY user',
        detail: d.email,
        sub: church || null,
        name: d.donor_name || '',
        church,
        churchId: d.default_parish_id || '',
        time: d.created_at,
      });
    }
  } catch {}

  // Recent stewardship activations
  try {
    const activations = await d1All(
      env,
      `SELECT parish_id, updated_at FROM parish_stewardship_settings
       WHERE has_stewardship_suite = 1
       ORDER BY updated_at DESC LIMIT 10`
    );
    for (const a of activations || []) {
      events.push({
        type: 'stewardship_activated',
        label: 'AGAPAY Parish + activated',
        detail: a.parish_id,
        sub: null,
        time: a.updated_at,
      });
    }
  } catch {}

  // Sort merged feed newest-first, cap at 20
  events.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  return json({ ok: true, events: events.slice(0, 20) });
}

async function seedStewardshipFunds(env, parishId) {
  const stmts = STEWARDSHIP_FUND_DEFAULTS.map((f) =>
    env.AGAPAY_DB.prepare(
      `INSERT INTO giving_funds (parish_id, name, code, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(parish_id, code) DO UPDATE SET
         name=excluded.name,is_default=excluded.is_default,sort_order=excluded.sort_order`
    ).bind(parishId, f.name, f.reportCode || f.id, f.isDefault ? 1 : 0, f.sortOrder)
  );
  await env.AGAPAY_DB.batch(stmts);
}

// POST /api/parish/dashboard/:parishId/stewardship/giving/activate
export async function handleStewardshipGivingActivate(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { stripeSubscriptionItemId } = body;

  const merged = mergeStewardshipFundsIntoRegistration(found.registration);
  if (merged.changed) {
    const catalogSync = await synchronizeGivingCatalogWithAccounting(env, parishId, merged.registration);
    const next = {
      ...merged.registration,
      funds: catalogSync.available ? catalogSync.funds : merged.registration.funds,
      parishUpdatedAt: new Date().toISOString(),
    };
    const updated = await invalidateOnboardingSignoffIfChanged(found.registration, next, {
      actor: found.registration.treasurerEmail || found.registration.priestEmail || 'parish',
      reason: 'Stewardship activation changed the giving-fund catalog.',
      receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    });
    await saveRegistrationRecord(env, found.key, updated, found.registration);
  }

  await env.AGAPAY_DB.prepare(
    `
    INSERT INTO parish_stewardship_settings (parish_id, has_stewardship_suite, stripe_subscription_item_id)
    VALUES (?, 1, ?)
    ON CONFLICT(parish_id) DO UPDATE SET
      has_stewardship_suite = 1,
      stripe_subscription_item_id = excluded.stripe_subscription_item_id,
      updated_at = datetime('now')
  `
  )
    .bind(parishId, stripeSubscriptionItemId || null)
    .run();

  await seedStewardshipFunds(env, parishId);
  return json({ ok: true, fundsAdded: merged.added.length, fundsRemoved: merged.removed.length });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/summary
// Pledge vs actual, run rate, household/donor counts, fulfillment rate.
export async function handleStewardshipGivingSummary(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);
  return json(await stewardshipGivingSummary(env, parishId, year, manualIncomeTotalCents));
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/funds
// Giving totals broken down by fund (matches giftType in donor_offerings.data).
export async function handleStewardshipGivingFunds(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);

  const rows = await env.AGAPAY_DB.prepare(
    `
    SELECT
      gf.name                                                             AS fund_name,
      gf.code                                                             AS fund_code,
      COUNT(o.id)                                                         AS transaction_count,
      COALESCE(SUM(COALESCE(json_extract(o.data, '$.giftAmountCents'), json_extract(o.data, '$.amountCents'), 0)), 0) AS total_cents
    FROM giving_funds gf
    LEFT JOIN donor_offerings o
           ON CASE
                WHEN lower(COALESCE(json_extract(o.data, '$.giftType'), json_extract(o.data, '$.fund'), ''))
                  IN ('stewardship','general','general stewardship','general operating fund')
                THEN 'general'
                ELSE lower(COALESCE(json_extract(o.data, '$.giftType'), json_extract(o.data, '$.fund'), ''))
              END = lower(gf.code)
          AND o.parish_id = ?
          AND o.payment_status = 'paid'
          AND o.created_at BETWEEN ? AND ?
    WHERE gf.parish_id = ?
    GROUP BY gf.id, gf.name, gf.code
    ORDER BY gf.sort_order
  `
  )
    .bind(parishId, `${year}-01-01`, `${year}-12-31`, parishId)
    .all();

  const totalCents = rows.results.reduce((s, r) => s + (r.total_cents || 0), 0);

  return json({
    fiscal_year: year,
    total_cents: totalCents,
    funds: rows.results.map((r) => ({
      fund_name: r.fund_name,
      fund_code: r.fund_code,
      transaction_count: r.transaction_count || 0,
      total_cents: r.total_cents || 0,
      pct_of_total: totalCents > 0 ? Math.round(((r.total_cents || 0) / totalCents) * 100) : 0,
    })),
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/distribution
// Anonymized donor giving tier histogram (no individual identities exposed).
export async function handleStewardshipGivingDistribution(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);

  const rows = await env.AGAPAY_DB.prepare(
    `
    SELECT
      donor_email,
      SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)) AS donor_total_cents
    FROM donor_offerings
    WHERE parish_id = ? AND payment_status = 'paid'
      AND created_at BETWEEN ? AND ?
    GROUP BY donor_email
  `
  )
    .bind(parishId, `${year}-01-01`, `${year}-12-31`)
    .all();

  const TIERS = [
    { label: '$0–$500', min: 0, max: 49999 },
    { label: '$500–$2,000', min: 50000, max: 199999 },
    { label: '$2,000–$5,000', min: 200000, max: 499999 },
    { label: '$5,000–$10,000', min: 500000, max: 999999 },
    { label: '$10,000+', min: 1000000, max: Infinity },
  ];

  const tiers = TIERS.map((t) => ({ ...t, count: 0 }));
  for (const row of rows.results) {
    const amt = row.donor_total_cents || 0;
    const tier = tiers.find((t) => amt >= t.min && amt <= t.max);
    if (tier) tier.count++;
  }

  return json({
    fiscal_year: year,
    total_donors: rows.results.length,
    tiers: tiers.map(({ label, count }) => ({ label, count })),
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/retention
// Current vs prior year donor comparison.
export async function handleStewardshipGivingRetention(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);

  const [curRows, priorRows] = await Promise.all([
    env.AGAPAY_DB.prepare(
      `
      SELECT DISTINCT donor_email FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'paid'
        AND created_at BETWEEN ? AND ?
    `
    )
      .bind(parishId, `${year}-01-01`, `${year}-12-31`)
      .all(),

    env.AGAPAY_DB.prepare(
      `
      SELECT DISTINCT donor_email FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'paid'
        AND created_at BETWEEN ? AND ?
    `
    )
      .bind(parishId, `${year - 1}-01-01`, `${year - 1}-12-31`)
      .all(),
  ]);

  const cur = new Set(curRows.results.map((r) => r.donor_email));
  const prior = new Set(priorRows.results.map((r) => r.donor_email));

  const retained = [...prior].filter((e) => cur.has(e)).length;
  const lapsed = [...prior].filter((e) => !cur.has(e)).length;
  const newDonors = [...cur].filter((e) => !prior.has(e)).length;
  const retention = prior.size > 0 ? Math.round((retained / prior.size) * 100) : null;

  return json({
    fiscal_year: year,
    prior_year: year - 1,
    prior_donors: prior.size,
    current_donors: cur.size,
    retained,
    lapsed,
    new_donors: newDonors,
    retention_rate_pct: retention,
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/concentration
// Board-level concentration risk: what share of annual giving comes from
// the top 5 / top 10 households. Anonymized — same aggregation as the
// distribution histogram, just ranked instead of bucketed, and never
// returns anything more identifying than a rank position.
export async function handleStewardshipGivingConcentration(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);

  const rows = await env.AGAPAY_DB.prepare(
    `
    SELECT
      donor_email,
      SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)) AS donor_total_cents
    FROM donor_offerings
    WHERE parish_id = ? AND payment_status = 'paid'
      AND created_at BETWEEN ? AND ?
    GROUP BY donor_email
    HAVING donor_total_cents > 0
  `
  )
    .bind(parishId, `${year}-01-01`, `${year}-12-31`)
    .all();

  const totals = rows.results.map((r) => r.donor_total_cents || 0).sort((a, b) => b - a);
  const grandTotal = totals.reduce((s, v) => s + v, 0);
  const sumTopN = (n) => totals.slice(0, n).reduce((s, v) => s + v, 0);
  const pctTopN = (n) => (grandTotal > 0 ? Math.round((sumTopN(n) / grandTotal) * 100) : null);

  // A simple, standard risk band: >60% from the top 10 households is a
  // real fragility signal for a parish (loss of 1-2 major donors would be
  // materially destabilizing); 40-60% is worth watching; under 40% is
  // healthy diversification. Thresholds are conservative/commonly-cited
  // nonprofit stewardship guidance, not a proprietary formula.
  const top10Pct = pctTopN(10);
  const riskLevel = top10Pct === null ? null : top10Pct >= 60 ? 'high' : top10Pct >= 40 ? 'moderate' : 'low';

  return json({
    fiscal_year: year,
    total_donors: totals.length,
    total_giving_cents: grandTotal,
    top5_pct: pctTopN(5),
    top10_pct: top10Pct,
    top5_cents: sumTopN(5),
    top10_cents: sumTopN(10),
    risk_level: riskLevel,
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/recurring
// Recurring-gift stability: active recurring donors, monthly-equivalent
// recurring revenue, failed/canceled events, and how much of total giving
// is recurring vs one-time. This is the "cash flow stability" story.
//
// Note: card-expiration data isn't tracked here — that needs a Stripe
// `customer.source.expiring` (or payment-method) webhook subscription that
// isn't currently wired up, not something derivable from data already on
// file. Left out rather than estimated.
export async function handleStewardshipGivingRecurring(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86400000).toISOString();

  const [totalRow, recurringPaidRows, failedRow, canceledRow] = await Promise.all([
    readStewardshipGivingMix(env, parishId, year),

    // Most recent successful charge per active recurring subscription —
    // used both to count active recurring donors and to build a
    // monthly-equivalent revenue figure (normalizing quarterly/annual
    // gifts down to a monthly rate, so they're comparable).
    env.AGAPAY_DB.prepare(
      `
      SELECT
        stripe_subscription_id,
        donor_email,
        MAX(created_at) AS last_charge_at,
        COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0) AS amount_cents,
        COALESCE(json_extract(data, '$.frequency'), 'recurring') AS frequency
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'paid'
        AND stripe_subscription_id IS NOT NULL AND stripe_subscription_id != ''
        AND COALESCE(json_extract(data, '$.frequency'), '') NOT IN ('once', '')
        AND created_at >= ?
      GROUP BY stripe_subscription_id
    `
    )
      .bind(parishId, fortyFiveDaysAgo)
      .all(),

    env.AGAPAY_DB.prepare(
      `
      SELECT COUNT(*) AS n FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'failed' AND created_at >= ?
    `
    )
      .bind(parishId, ninetyDaysAgo)
      .first(),

    env.AGAPAY_DB.prepare(
      `
      SELECT COUNT(*) AS n FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'canceled' AND created_at >= ?
    `
    )
      .bind(parishId, ninetyDaysAgo)
      .first(),
  ]);

  const monthlyEquivFor = (amountCents, frequency) => {
    const f = String(frequency || '').toLowerCase();
    if (f === 'annual' || f === 'yearly' || f === 'annually') return amountCents / 12;
    if (f === 'quarterly') return amountCents / 3;
    if (f === 'weekly') return amountCents * (52 / 12);
    return amountCents; // monthly, or unspecified recurring — treated as monthly
  };

  const activeRecurring = recurringPaidRows.results || [];
  const recurringDonorCount = new Set(activeRecurring.map((r) => r.donor_email)).size;
  const mrrCents = Math.round(
    activeRecurring.reduce((s, r) => s + monthlyEquivFor(r.amount_cents || 0, r.frequency), 0)
  );
  const avgRecurringGiftCents = recurringDonorCount > 0 ? Math.round(mrrCents / recurringDonorCount) : 0;
  const totalGivingCents = totalRow?.total_cents || 0;
  // The chart compares gifts received in the same year. Annualized MRR is
  // a projection and can otherwise make a partial year appear 100% recurring.
  const recurringReceivedCents = totalRow?.recurring_received_cents || 0;
  const pctRecurringOfTotal =
    totalGivingCents > 0 ? Math.round((recurringReceivedCents / totalGivingCents) * 100) : null;

  return json({
    fiscal_year: year,
    recurring_donor_count: recurringDonorCount,
    monthly_recurring_revenue_cents: mrrCents,
    avg_recurring_gift_cents: avgRecurringGiftCents,
    failed_payments_90d: failedRow?.n || 0,
    canceled_gifts_90d: canceledRow?.n || 0,
    pct_of_total_giving_recurring: pctRecurringOfTotal,
    expiring_cards: null, // not tracked — see function comment
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/health-score
// A single composite 0-100 score parish leaders can read at a glance.
// Keep this intentionally light: it uses the giving summary only so the
// Stewardship tab can load without chaining several dashboard reports.
export async function handleStewardshipGivingHealthScore(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);
  const summaryRes = await handleStewardshipGivingSummary(
    new Request(`${url.origin}${url.pathname.replace(/\/health-score$/, '/summary')}?year=${year}`, request),
    env,
    parishId
  );
  const summary = summaryRes.ok ? await summaryRes.json() : {};

  // Each component scores 0-100; overall score is a weighted average of
  // whichever components have real data (a brand-new parish with no prior
  // year won't have a retention number yet, for example — it's excluded
  // from the average rather than penalizing the score for missing data).
  const components = [];

  if (summary.fulfillment_rate_pct !== null && summary.fulfillment_rate_pct !== undefined) {
    components.push({
      key: 'pledge_fulfillment',
      label: 'Pledge fulfillment',
      weight: 0.22,
      score: Math.min(100, summary.fulfillment_rate_pct),
    });
  }
  if (summary.total_pledged_cents > 0) {
    const projectionPct = Math.round((summary.run_rate_cents / summary.total_pledged_cents) * 100);
    components.push({
      key: 'year_end_projection',
      label: 'Year-end projection vs. goal',
      weight: 0.15,
      score: Math.min(100, projectionPct),
    });
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score =
    totalWeight > 0 ? Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) : null;

  const status =
    score === null ? 'Not enough data yet' : score >= 80 ? 'On Track' : score >= 60 ? 'Needs Attention' : 'At Risk';

  return json({
    fiscal_year: year,
    score,
    status,
    components: components.map((c) => ({ key: c.key, label: c.label, score: Math.round(c.score) })),
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/report/monthly
// A parish-council-ready HTML report (print-to-PDF via the browser, same
// convention as the annual meeting packet) pulling together everything the
// tab already tracks: giving this month, YTD, pledge progress, budget
// pace, restricted funds, recurring giving health, lapsed/new donors, and
// a short list of rule-based follow-up suggestions derived directly from
// the numbers (not invented copy).
const MANUAL_INCOME_SOURCES = new Set(['cash_and_checks', 'tithely', 'paypal', 'other_giving_platform']);
const MANUAL_INCOME_SOURCE_LABELS = {
  cash_and_checks: 'Cash/Check Collection',
  tithely: 'Tithe.ly',
  paypal: 'PayPal',
  other_giving_platform: 'Another Giving Platform',
};

function manualIncomeRowToJson(row) {
  return {
    id: row.id,
    entryDate: row.entry_date,
    source: row.source,
    sourceLabel:
      row.source === 'other_giving_platform' && row.source_label
        ? row.source_label
        : MANUAL_INCOME_SOURCE_LABELS[row.source] || row.source,
    amountCents: row.amount_cents || 0,
    fundCode: row.fund_code || '',
    batchReference: row.batch_reference || '',
    notes: row.notes || '',
    enteredBy: row.entered_by || '',
    createdAt: row.created_at,
  };
}

// GET /api/parish/dashboard/:parishId/stewardship/income/manual?year=YYYY
// List this year's manually logged outside-AGAPAY contributions (cash/check
// deposits and giving platforms), with totals by source. This is what lets
// a treasurer see the offline/other-platform picture alongside what
// AGAPAY Give collected online.
export async function handleStewardshipManualIncomeList(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);

  const rows = await env.AGAPAY_DB.prepare(
    `
    SELECT * FROM manual_income_entries
    WHERE parish_id = ? AND contribution_eligible = 1 AND entry_date BETWEEN ? AND ?
    ORDER BY entry_date DESC, created_at DESC
  `
  )
    .bind(parishId, `${year}-01-01`, `${year}-12-31`)
    .all();

  const entries = (rows.results || []).map(manualIncomeRowToJson);
  const totalCents = entries.reduce((s, e) => s + e.amountCents, 0);
  const bySource = {};
  for (const e of entries) {
    bySource[e.source] = (bySource[e.source] || 0) + e.amountCents;
  }

  return json({
    fiscal_year: year,
    entries,
    total_cents: totalCents,
    by_source_cents: bySource,
  });
}

// POST /api/parish/dashboard/:parishId/stewardship/income/manual
// Add one outside-AGAPAY contribution. Deliberately simple — a treasurer logging
// this Sunday's cash-and-check count, or a month's Tithe.ly total, should
// take seconds, not require itemizing individual donors.
export async function handleStewardshipManualIncomeCreate(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid request body.' }, { status: 400 });

  const entryDate = String(body.entryDate || '').trim();
  const source = String(body.source || '').trim();
  const amountCents = Math.round(Number(body.amountCents));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return json({ error: 'A valid entry date is required.' }, { status: 400 });
  }
  if (!MANUAL_INCOME_SOURCES.has(source)) {
    return json({ error: 'Choose a valid contribution source.' }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return json({ error: 'Enter an amount greater than zero.' }, { status: 400 });
  }

  const id = `manual_income_${parishId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const sourceLabel =
    source === 'other_giving_platform'
      ? String(body.sourceLabel || '')
          .trim()
          .slice(0, 60)
      : '';
  const notes = String(body.notes || '')
    .trim()
    .slice(0, 500);
  const fundCode = String(body.fundCode || '')
    .trim()
    .slice(0, 60);
  const batchReference = String(body.batchReference || '')
    .trim()
    .slice(0, 120);
  const enteredBy = String(body.enteredByEmail || '')
    .trim()
    .slice(0, 200);
  if (source === 'other_giving_platform' && !sourceLabel) {
    return json({ error: 'Enter the name of the giving platform.' }, { status: 400 });
  }
  if (!fundCode) {
    return json({ error: 'Choose or enter a fund/designation.' }, { status: 400 });
  }

  await env.AGAPAY_DB.prepare(
    `
    INSERT INTO manual_income_entries
      (id, parish_id, entry_date, source, source_label, amount_cents, fund_code,
       batch_reference, contribution_eligible, notes, entered_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `
  )
    .bind(
      id,
      parishId,
      entryDate,
      source,
      sourceLabel || null,
      amountCents,
      fundCode,
      batchReference || null,
      notes || null,
      enteredBy || null,
      now,
      now
    )
    .run();

  return json({
    ok: true,
    entry: manualIncomeRowToJson({
      id,
      entry_date: entryDate,
      source,
      source_label: sourceLabel,
      amount_cents: amountCents,
      fund_code: fundCode,
      batch_reference: batchReference,
      notes,
      entered_by: enteredBy,
      created_at: now,
    }),
  });
}

// DELETE /api/parish/dashboard/:parishId/stewardship/income/manual/:entryId
export async function handleStewardshipManualIncomeDelete(request, env, parishId, entryId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;
  if (!entryId) return json({ error: 'Missing entry id.' }, { status: 400 });
  if (entryId.startsWith('outside_'))
    return json(
      { error: 'Use Givers to correct or void this individual gift; its audit history must be retained.' },
      { status: 409 }
    );

  await env.AGAPAY_DB.prepare(`DELETE FROM manual_income_entries WHERE id = ? AND parish_id = ?`)
    .bind(entryId, parishId)
    .run();

  return json({ ok: true });
}

// Sums contribution-qualified outside giving within a date range — shared by the
// summary/budget-pace figures and the monthly report, so both stay
// consistent with what the treasurer has actually logged.
