interface StewardshipEvent {
  id: string;
  type: string;
  data?: {
    object?: {
      id?: string;
      status?: string;
      metadata?: { parish_id?: string };
      subscription_data?: { metadata?: { parish_id?: string } };
      customer?: string;
      subscription?: string;
      items?: { data?: { price?: { id?: string } }[] };
      current_period_start?: number;
      current_period_end?: number;
      cancel_at_period_end?: boolean;
      trial_end?: number;
    };
  };
}
interface StewardshipUpdate {
  status?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  stripePriceId?: string | null;
  currentPeriodStart?: number | null;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: number | null;
  stripeSubscriptionItemId?: string;
}
import type { DashboardRegistration } from './parish-dashboard-handler.js';
type ModuleEnv = Partial<Env> & {
  DB?: D1Database;
  STEWARDSHIP_STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
};
type ModuleRegistration = DashboardRegistration & {
  parishId: string;
  parishName?: string;
  name?: string;
  email?: string;
  contactEmail?: string;
  timezone?: string;
  taxLegalName?: string;
  taxEin?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  website?: string;
};
interface ModuleRow {
  donor_email: string;
  given_cents: number;
  target_amount_cents: number;
}
// src/handlers/stewardship-communications.js
// Stewardship nudges and Stripe webhook-driven subscription updates.

import {
  claimStripeEvent,
  d1All,
  d1Run,
  finishStripeEvent,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  unauthorized,
} from '../lib/core.js';
import { stewardshipToolAccess as hasStewardshipToolAccess } from '../lib/entitlements.js';
import { outsidePledgeGiving } from '../lib/outside-pledges.js';
import { STEWARDSHIP_FUND_DEFAULTS, mergeStewardshipFundsIntoRegistration } from '../lib/stewardship-funds.js';
import { synchronizeGivingCatalogWithAccounting } from '../accounting/source-wiring.js';
import { invalidateOnboardingSignoffIfChanged } from '../lib/parish-onboarding.js';
import { findRegistrationByParishId, saveRegistrationRecord, verifyParishDashboardBearer } from './parish.js';
import { verifyStripeWebhook } from './stripe.js';
import { newId } from './stewardship-http.js';

async function requireParishApiContext(request: Request, env: ModuleEnv, parishId: string) {
  const token = getBearerToken(request);
  if (!parishId || !token) return { ok: false as const, response: unauthorized() };
  const found = await findRegistrationByParishId<ModuleRegistration>(env, parishId);
  if (!found) return { ok: false as const, response: json({ error: 'Parish not found' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false as const, response: unauthorized() };
  }
  return { ok: true as const, registration: found.registration, key: found.key };
}

export async function handleStewardshipNudge(request: Request, env: ModuleEnv, parishId: string) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (!hasStewardshipToolAccess(registration)) {
    return json({ error: 'Stewardship requires the Stewardship or Parish plan.' }, { status: 403 });
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const url = new URL(request.url);
  const year = parseInt((url.searchParams.get('year') || new Date().getFullYear()) as string, 10);
  const dryRun = request.method === 'GET' || url.searchParams.get('dry_run') === 'true';
  const parishName = registration.parishName || registration.name || 'your parish';

  // A donor is "3 months behind" if their actual giving is less than what
  // they should have given by 3 months ago (92 days). This avoids nudging
  // donors who are only a few weeks off pace.
  const today = new Date();
  const yearStart = new Date(`${year}-01-01`);
  const daysInYear = year % 4 === 0 ? 366 : 365;
  const threeMonthsAgo = new Date(today.getTime() - 92 * 86400000);
  // If 3 months ago was before the fiscal year started, no one can be 3 months behind yet.
  const comparisonDate = threeMonthsAgo < yearStart ? yearStart : threeMonthsAgo;
  const daysElapsed = Math.max(
    0,
    Math.ceil(((comparisonDate as Date & number) - (yearStart as Date & number)) / 86400000)
  );
  // Donors must be behind relative to what they should have given 3 months ago.
  const expectedRate = daysElapsed / daysInYear;

  // Load all pledges for this parish + year
  const pledges = await d1All<ModuleRow>(
    env,
    `SELECT donor_email, target_amount_cents FROM household_pledges
     WHERE parish_id = ? AND fiscal_year = ? AND target_amount_cents > 0`,
    parishId,
    year
  );

  if (!pledges.length) {
    return json({ ok: true, behind: [], message: 'No pledging donors found for ' + year + '.' });
  }

  // Load actual giving for each pledging donor this year
  const yearEnd = year + '-12-31';
  const yearStartStr = year + '-01-01';
  const givenRows = await d1All<ModuleRow>(
    env,
    `SELECT donor_email,
            SUM(COALESCE(
              json_extract(data, '$.giftAmountCents'),
              json_extract(data, '$.amountCents'),
              0
            )) AS given_cents
     FROM donor_offerings
     WHERE parish_id = ? AND payment_status IN ('paid','succeeded')
       AND created_at >= ? AND created_at < datetime(?, '+1 day')
       AND lower(COALESCE(json_extract(data, '$.giftType'), 'stewardship')) IN ('stewardship','general')
       AND donor_email IN (${pledges.map(() => '?').join(',')})
     GROUP BY donor_email`,
    parishId,
    yearStartStr,
    yearEnd,
    ...pledges.map((p) => p.donor_email)
  );

  const givenMap: Record<string, number> = {};
  for (const row of givenRows) {
    givenMap[row.donor_email as string] = Number(row.given_cents || 0);
  }

  for (const row of await outsidePledgeGiving(env, parishId, year))
    givenMap[row.donor_email as string] = (givenMap[row.donor_email as string] || 0) + Number(row.given_cents);
  // Identify behind donors
  const behind = pledges
    .map((p) => {
      const given = givenMap[p.donor_email] || 0;
      const expected = Math.round(p.target_amount_cents * expectedRate);
      const behind = given < expected;
      return {
        donorEmail: p.donor_email,
        pledgeCents: p.target_amount_cents,
        givenCents: given,
        expectedCents: expected,
        behind,
      };
    })
    .filter((d) => d.behind);

  if (dryRun) {
    return json({ ok: true, behind, year, dryRun: true, parishName, thresholdActive: daysElapsed >= 1 });
  }

  // Send: write a notification row for each behind donor
  const now = new Date().toISOString();
  const message =
    'Your stewardship campaign team at ' +
    parishName +
    ' wanted to gently reach out. ' +
    'Based on your ' +
    year +
    ' pledge, you may be a little behind schedule. ' +
    'If life has been full this season, please don’t be discouraged — ' +
    'any gift, large or small, makes a difference. Thank you for your faithfulness.';

  let sent = 0;
  for (const donor of behind) {
    await d1Run(
      env,
      `INSERT INTO donor_notifications
         (id, donor_email, parish_id, type, fiscal_year, pledge_cents, given_cents, message, sent_at)
       VALUES (?, ?, ?, 'pledge_nudge', ?, ?, ?, ?, ?)`,
      await newId(),
      donor.donorEmail,
      parishId,
      year,
      donor.pledgeCents,
      donor.givenCents,
      message,
      now
    );
    sent++;
  }

  return json({ ok: true, sent, year, parishName });
}

export async function handleStewardshipWebhook(request: Request, env: ModuleEnv) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature') || '';
  const secret = env.STEWARDSHIP_STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return json({ error: 'STEWARDSHIP_STRIPE_WEBHOOK_SECRET is not configured' }, { status: 500 });
  }
  const valid = await verifyStripeWebhook(body, sig, secret);
  if (!valid) return json({ error: 'Invalid signature' }, { status: 400 });

  let event;
  try {
    event = JSON.parse(body) as StewardshipEvent;
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Deduplicate — claimStripeEvent expects an event object {id, type}, not a bare string.
  // We namespace the id with "sw_" so stewardship events don't collide with the main webhook log.
  const syntheticEvent = { id: 'sw_' + event.id, type: event.type };
  const claim = await claimStripeEvent(env, syntheticEvent);
  if (!claim.claimed) return json({ received: true, duplicate: true });

  try {
    await processWebhookEvent(event, env);
    await finishStripeEvent(env, syntheticEvent.id, 'processed');
  } catch (err) {
    await finishStripeEvent(env, syntheticEvent.id, 'failed', (err as Error | null)?.message || String(err));
    throw err;
  }

  return json({ received: true });
}

async function processWebhookEvent(event: StewardshipEvent, env: ModuleEnv) {
  const obj = event.data?.object;
  if (!obj) return;

  const parishId = obj.metadata?.parish_id || obj.subscription_data?.metadata?.parish_id;

  if (!parishId) return; // not a stewardship event

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
      await updateStewardshipStatus(env, parishId, {
        status,
        stripeSubscriptionId: obj.id,
        stripeCustomerId: obj.customer,
        stripePriceId: obj.items?.data?.[0]?.price?.id || null,
        currentPeriodStart: obj.current_period_start || null,
        currentPeriodEnd: obj.current_period_end || null,
        cancelAtPeriodEnd: !!obj.cancel_at_period_end,
        trialEnd: obj.trial_end || null,
      });
      break;
    }
    case 'invoice.payment_failed': {
      const subId = obj.subscription;
      if (subId) {
        const reg = await loadRegistrationByStripeCustomer(env, obj.customer!);
        if (reg && reg.stewardshipStripeSubscriptionId === subId) {
          await updateStewardshipStatus(env, reg.parishId!, {
            status: 'past_due',
            stripeSubscriptionId: subId,
            stripeCustomerId: obj.customer,
          });
        }
      }
      break;
    }
  }
}

async function updateStewardshipStatus(env: ModuleEnv, parishId: string, data: StewardshipUpdate) {
  // Load the registration, update stewardship fields, save back
  const reg = await env.AGAPAY_REGISTRATIONS!.get<ModuleRegistration>('parish_id_index:' + parishId, { type: 'json' });
  if (!reg) return;

  reg.stewardshipStatus = data.status;
  if (data.stripeSubscriptionId) reg.stewardshipStripeSubscriptionId = data.stripeSubscriptionId;
  if (data.stripeCustomerId) reg.stewardshipStripeCustomerId = data.stripeCustomerId;
  if (data.stripePriceId) reg.stewardshipStripePriceId = data.stripePriceId;
  if (data.currentPeriodEnd !== undefined) reg.stewardshipPeriodEnd = data.currentPeriodEnd;
  if (data.cancelAtPeriodEnd !== undefined) reg.stewardshipCancelAtPeriodEnd = data.cancelAtPeriodEnd;
  if (data.trialEnd !== undefined) reg.stewardshipTrialEnd = data.trialEnd;

  await env.AGAPAY_REGISTRATIONS!.put('parish_id_index:' + parishId, JSON.stringify(reg));

  // Also maintain a reverse index: stripe customer → parish
  if (data.stripeCustomerId) {
    await env.AGAPAY_REGISTRATIONS!.put(
      'stewardship_customer_index:' + data.stripeCustomerId,
      JSON.stringify({ parishId })
    );
  }

  // Bundled AGAPAY Parish +: sync D1 feature flag with subscription status
  if (hasProductionStore(env)) {
    const isActive = ['active', 'trialing'].includes(data.status!);
    if (isActive) {
      await env
        .AGAPAY_DB!.prepare(
          `
        INSERT INTO parish_stewardship_settings (parish_id, has_stewardship_suite, stripe_subscription_item_id)
        VALUES (?, 1, ?)
        ON CONFLICT(parish_id) DO UPDATE SET
          has_stewardship_suite = 1,
          stripe_subscription_item_id = excluded.stripe_subscription_item_id,
          updated_at = datetime('now')
      `
        )
        .bind(parishId, data.stripeSubscriptionItemId || null)
        .run()
        .catch(() => {});

      // Stewardship reporting and Funds & Alms must receive the same catalog.
      await env
        .AGAPAY_DB!.batch(
          STEWARDSHIP_FUND_DEFAULTS.map((f) =>
            env
              .AGAPAY_DB!.prepare(
                `INSERT INTO giving_funds (parish_id, name, code, is_default, sort_order)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(parish_id, code) DO UPDATE SET
               name=excluded.name,is_default=excluded.is_default,sort_order=excluded.sort_order`
              )
              .bind(parishId, f.name, f.reportCode || f.id, f.isDefault ? 1 : 0, f.sortOrder)
          )
        )
        .catch(() => {});

      const found = await findRegistrationByParishId<ModuleRegistration>(env, parishId);
      if (found) {
        const merged = mergeStewardshipFundsIntoRegistration(found.registration);
        if (merged.changed) {
          const catalogSync = await synchronizeGivingCatalogWithAccounting(
            env,
            parishId,
            merged.registration as DashboardRegistration
          );
          const next = {
            ...merged.registration,
            funds: catalogSync.available ? catalogSync.funds : merged.registration.funds,
            parishUpdatedAt: new Date().toISOString(),
          };
          const updated = await invalidateOnboardingSignoffIfChanged(
            found.registration,
            next as DashboardRegistration,
            {
              actor: 'stewardship-webhook',
              reason: 'Stewardship activation changed the giving-fund catalog.',
              receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
            }
          );
          await saveRegistrationRecord(env, found.key, updated, found.registration);
        }
      }
    } else if (data.status === 'canceled') {
      await env
        .AGAPAY_DB!.prepare(
          `
        UPDATE parish_stewardship_settings
        SET has_stewardship_suite = 0, updated_at = datetime('now')
        WHERE parish_id = ?
      `
        )
        .bind(parishId)
        .run()
        .catch(() => {});
    }
  }
}

async function loadRegistrationByStripeCustomer(env: ModuleEnv, customerId: string) {
  const idx = await env.AGAPAY_REGISTRATIONS!.get<{ parishId: string }>('stewardship_customer_index:' + customerId, {
    type: 'json',
  });
  if (!idx?.parishId) return null;
  return env.AGAPAY_REGISTRATIONS!.get<ModuleRegistration>('parish_id_index:' + idx.parishId, { type: 'json' });
}

// Stripe webhook signature verification (HMAC-SHA256)
// ─── D1 sub-record helpers ────────────────────────────────────────────────────
