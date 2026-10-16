import type {
  StewardshipEnvironment,
  StewardshipRegistration,
  MeetingPayload,
} from './stewardship-composition-contracts.js';

// src/handlers/stewardship.js
// AGAPAY Stewardship module — Parish-tier annual meeting packet builder.
// All routes live under /parish/stewardship/*.
// Parish auth is already verified by requireAdmin / requireParish helpers in parish.js
// before these handlers are called.

import {
  hasActiveStewardshipComp,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  unauthorized,
} from '../lib/core.js';

import '../lib/entitlements.js';

import { absoluteWebsiteUrl, saveRegistrationRecord, findRegistrationByParishId } from './parish.js';

import { requireAdmin } from './admin.js';

import '../lib/core.js';

import { parseJsonBody } from './stewardship-http.js';

import { billingHtml } from './stewardship-presentation.js';

import './stewardship-packet-presentation.js';

import './stewardship-financials.js';

import './stewardship-communications.js';
import {
  STEWARDSHIP_COMING_SOON,
  STEWARDSHIP_COMP_PROMO_CODE,
  STEWARDSHIP_COMP_PROMO_LIMIT,
  STEWARDSHIP_COMP_PROMO_KV_KEY,
} from './stewardship-shared.js';
import {
  requireParishContext,
  requireParishApiContext,
  stewardshipComingSoonJson,
  stewardshipComingSoonHtml,
} from './stewardship-shared.js';
import './stewardship.js';
import './stewardship-meeting-api.js';
import './stewardship-meeting-pages.js';
import './stewardship-metrics-page.js';
import './stewardship-meeting-storage.js';
export async function stripePlatformPost(env: StewardshipEnvironment, path: string, body: Record<string, string>) {
  const params = new URLSearchParams(body).toString();
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  return res.json() as Promise<{ url?: string; error?: { message?: string } }>;
}

// ─── Paywall page ─────────────────────────────────────────────────────────────

export async function handleAdminGrantStewardshipComp(request: Request, env: StewardshipEnvironment) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  const body = (await parseJsonBody(request)) as MeetingPayload | null;
  const parishId = String(body?.parishId || '').trim();
  if (!parishId) return json({ error: 'parishId is required.' }, { status: 400 });

  const found = await findRegistrationByParishId<StewardshipRegistration>(env, parishId);
  if (!found) return json({ error: 'Parish not found.' }, { status: 404 });
  const { registration } = found;

  if (hasActiveStewardshipComp(registration)) {
    return json(
      {
        error: 'This parish already has an active AGAPAY Parish + comp grant.',
        comp: registration.stewardshipComp,
      },
      { status: 409 }
    );
  }

  // Check-then-increment against the cap. This isn't perfectly atomic under
  // true concurrent requests, but grants are a rare, admin-only, manual
  // action — the realistic risk of two simultaneous grants racing past the
  // cap is effectively zero for this use case.
  const currentCountRaw = await env.AGAPAY_REGISTRATIONS!.get(STEWARDSHIP_COMP_PROMO_KV_KEY);
  const currentCount = parseInt(currentCountRaw || '0', 10) || 0;
  if (currentCount >= STEWARDSHIP_COMP_PROMO_LIMIT) {
    return json(
      {
        error: `The founding ${STEWARDSHIP_COMP_PROMO_LIMIT} free-year promo has already been fully claimed.`,
        claimed: currentCount,
        limit: STEWARDSHIP_COMP_PROMO_LIMIT,
      },
      { status: 409 }
    );
  }

  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + 1);

  registration.stewardshipComp = {
    active: true,
    code: STEWARDSHIP_COMP_PROMO_CODE,
    grantedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    grantedBy: 'admin',
  };
  await saveRegistrationRecord(env, found.key, registration);

  const newCount = currentCount + 1;
  await env.AGAPAY_REGISTRATIONS!.put(STEWARDSHIP_COMP_PROMO_KV_KEY, String(newCount));

  return json({
    ok: true as const,
    parishId,
    comp: registration.stewardshipComp,
    claimed: newCount,
    remaining: Math.max(0, STEWARDSHIP_COMP_PROMO_LIMIT - newCount),
  });
}

// GET /api/admin/stewardship/comp-status
// Returns how many of the 20 founding free-year grants have been claimed,
// for the admin dashboard.
export async function handleAdminStewardshipCompStatus(request: Request, env: StewardshipEnvironment) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const currentCountRaw = await env.AGAPAY_REGISTRATIONS!.get(STEWARDSHIP_COMP_PROMO_KV_KEY);
  const claimed = parseInt(currentCountRaw || '0', 10) || 0;
  return json({
    code: STEWARDSHIP_COMP_PROMO_CODE,
    limit: STEWARDSHIP_COMP_PROMO_LIMIT,
    claimed,
    remaining: Math.max(0, STEWARDSHIP_COMP_PROMO_LIMIT - claimed),
  });
}

export async function handleParishStewardshipSubscribe(
  request: Request,
  env: StewardshipEnvironment,
  parishId: string
) {
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  return json(
    {
      error:
        'Separate Stewardship subscriptions have been retired. Stewardship Health is included in Give + and Parish. Choose a current plan in parish dashboard settings.',
      code: 'subscription_option_retired',
    },
    { status: 410 }
  );
}

export async function handleParishStewardshipBillingPortal(
  request: Request,
  env: StewardshipEnvironment,
  parishId: string
) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();

  const customerId = registration.stewardshipStripeCustomerId;
  if (!customerId) return json({ error: 'No Stewardship billing customer found.' }, { status: 400 });

  const portal = await stripePlatformPost(env, '/billing_portal/sessions', {
    customer: customerId,
    return_url: absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/dashboard?tab=stewardship',
  });
  if (portal.error || !portal.url) {
    return json({ error: portal.error?.message || 'Could not open billing portal.' }, { status: 500 });
  }
  return json({ ok: true as const, portalUrl: portal.url });
}

// POST /parish/stewardship/subscribe
export async function handleStewardshipSubscribe(request: Request, env: StewardshipEnvironment) {
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  return json(
    {
      error:
        'Separate Stewardship subscriptions have been retired. Stewardship Health is included in Give + and Parish. Choose a current plan in parish dashboard settings.',
      code: 'subscription_option_retired',
    },
    { status: 410 }
  );
}

export async function handleStewardshipBilling(request: Request, env: StewardshipEnvironment) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  return new Response(billingHtml(registration, null, env), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

// POST /parish/stewardship/billing-portal
export async function handleStewardshipBillingPortal(request: Request, env: StewardshipEnvironment) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      status: 409,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  const customerId = registration.stewardshipStripeCustomerId;
  if (!customerId) {
    return Response.redirect(absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship', 303);
  }

  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const portal = await stripePlatformPost(env, '/billing_portal/sessions', {
    customer: customerId,
    return_url: base + '/parish/stewardship/billing',
  });

  if (portal.error || !portal.url) {
    return json({ error: 'Could not open billing portal.' }, { status: 500 });
  }

  return Response.redirect(portal.url, 303);
}
