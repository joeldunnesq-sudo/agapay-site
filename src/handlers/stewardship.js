// src/handlers/stewardship.js
// AGAPAY Stewardship module — Parish-tier annual meeting packet builder.
// All routes live under /parish/stewardship/*.
// Parish auth is already verified by requireAdmin / requireParish helpers in parish.js
// before these handlers are called.

import {
  d1All,
  d1First,
  d1Run,
  hasActiveStewardshipComp,
  hasProductionStore,
  hasStewardshipAccess,
  json,
  missingProductionStoreResponse,
  stewardshipStatus,
  unauthorized,
} from '../lib/core.js';

import { hasLegacyParishPlusAddOn, stewardshipToolAccess, tierIncludesModule } from '../lib/entitlements.js';

import {
  absoluteWebsiteUrl,
  saveRegistrationRecord,
  findRegistrationByParishId,
  verifyParishDashboardBearer,
} from './parish.js';

import { requireAdmin } from './admin.js';

import { getBearerToken } from '../lib/core.js';
import {
  apiFormFromMeetingPayload,
  dashboardNav,
  displayToCents,
  escHtml,
  isMissingStewardshipSchema,
  newId,
  packetLineCount,
  parseFormBody,
  parseJsonBody,
  publicMeeting,
  publicMeetingDetails,
  stewardshipSessionScript,
} from './stewardship-http.js';
import { annualMeetingFormHtml, billingHtml, paywallHtml, stewardshipHomeHtml } from './stewardship-presentation.js';
import { packetPreviewHtml } from './stewardship-packet-presentation.js';
import { handleStewardshipFinancials } from './stewardship-financials.js';
import { handleStewardshipNudge, handleStewardshipWebhook } from './stewardship-communications.js';

export { handleStewardshipFinancials, handleStewardshipNudge, handleStewardshipWebhook };

// Auth for stewardship SSR pages.
// The parish SPA links here with ?parishId=XX&t=TOKEN (token from localStorage).
// The worker validates the token against the parish registration.
async function requireParishContext(request, env) {
  const url = new URL(request.url);
  const parishId = url.searchParams.get('parishId');
  const token = url.searchParams.get('t') || getBearerToken(request);
  if (!parishId || !token) {
    return {
      ok: false,
      response: new Response(
        "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
        { status: 401, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      ),
    };
  }
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: new Response('Parish not found', { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return {
      ok: false,
      response: new Response(
        "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
        { status: 401, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      ),
    };
  }
  return { ok: true, registration: found.registration, key: found.key };
}

async function requireParishApiContext(request, env, parishId) {
  const token = getBearerToken(request);
  if (!parishId || !token) return { ok: false, response: unauthorized() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: json({ error: 'Parish not found' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false, response: unauthorized() };
  }
  // Callers that need to persist changes back to this registration must use
  // this key as the reference for saveRegistrationRecord(env, key, registration)
  // — passing the registration object itself where a string key is expected
  // silently corrupts the save (registration becomes the "reference" arg,
  // and the real registration argument is left undefined).
  return { ok: true, registration: found.registration, key: found.key };
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const STEWARDSHIP_PRODUCT_KEY = 'stewardship';
const STEWARDSHIP_COMING_SOON = false;

// Active subscription states that unlock the module
// Cap on the "founding 20" free-year AGAPAY Parish + promo.
const STEWARDSHIP_COMP_PROMO_CODE = 'founding-20';
const STEWARDSHIP_COMP_PROMO_LIMIT = 20;
const STEWARDSHIP_COMP_PROMO_KV_KEY = 'stewardship_comp_promo:founding-20:count';

// ─── Subscription helpers ─────────────────────────────────────────────────────
// hasActiveStewardshipComp, stewardshipStatus, and hasStewardshipAccess now
// live in lib/core.js — re-exported here so every existing caller inside
// this file that imports them from "./stewardship.js" keeps working, while
// parish.js and donor.js can import the same functions directly from
// core.js without creating a circular dependency on this file.
export { hasActiveStewardshipComp, stewardshipStatus, hasStewardshipAccess };

function stewardshipPublicStatus(registration) {
  const comp = registration?.stewardshipComp || null;
  const parishTierAccess = tierIncludesModule(registration, 'stewardshipHealth');
  const legacyAddOnAccess = hasLegacyParishPlusAddOn(registration);
  return {
    status: parishTierAccess ? 'included' : stewardshipStatus(registration),
    active: parishTierAccess || legacyAddOnAccess,
    includedInParishTier: parishTierAccess,
    legacyAddOnActive: legacyAddOnAccess,
    cancelAtPeriodEnd: Boolean(registration?.stewardshipCancelAtPeriodEnd),
    currentPeriodEnd: registration?.stewardshipPeriodEnd || null,
    trialEnd: registration?.stewardshipTrialEnd || null,
    customerConfigured: Boolean(registration?.stewardshipStripeCustomerId),
    subscriptionConfigured: Boolean(registration?.stewardshipStripeSubscriptionId),
    comp:
      comp && hasActiveStewardshipComp(registration)
        ? {
            code: comp.code || null,
            grantedAt: comp.grantedAt || null,
            expiresAt: comp.expiresAt || null,
          }
        : null,
  };
}

function hasStewardshipToolAccess(registration) {
  return stewardshipToolAccess(registration);
}

function stewardshipComingSoonPayload(registration = null) {
  return {
    ok: true,
    comingSoon: true,
    stewardship: {
      status: 'coming_soon',
      active: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      trialEnd: null,
      customerConfigured: Boolean(registration?.stewardshipStripeCustomerId),
      subscriptionConfigured: Boolean(registration?.stewardshipStripeSubscriptionId),
    },
    setupRequired: false,
    meetings: [],
    subscribePlans: [],
    message: 'AGAPAY Stewardship is currently paused.',
  };
}

function stewardshipComingSoonJson(status = 409) {
  return json(
    {
      ok: false,
      comingSoon: true,
      error: 'AGAPAY Stewardship is coming soon. Packet generation and billing are not enabled yet.',
    },
    { status }
  );
}

function stewardshipComingSoonHtml(registration, env) {
  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const parishName = registration?.parishName || registration?.name || 'Your parish';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AGAPAY Stewardship Coming Soon</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <style>
    .stewardship-soon-page { min-height:100vh; display:grid; place-items:center; padding:32px; background:#f4f0e6; color:#071827; }
    .stewardship-soon-card { max-width:760px; border:1px solid rgba(201,162,91,.38); border-radius:18px; padding:34px; background:#fffaf0; box-shadow:0 22px 54px rgba(6,21,34,.14); }
    .stewardship-soon-card h1 { margin:0 0 10px; font-family:var(--font-serif, Georgia, serif); font-size:clamp(2rem,5vw,3.4rem); color:#071827; }
    .stewardship-soon-card p { margin:0 0 18px; color:#5f5b52; line-height:1.65; }
    .stewardship-soon-kicker { color:#b98b2d; font-weight:800; letter-spacing:.14em; text-transform:uppercase; font-size:.78rem; }
    .stewardship-soon-list { display:grid; gap:10px; margin:24px 0; padding:0; list-style:none; }
    .stewardship-soon-list li { border:1px solid rgba(201,162,91,.24); border-radius:12px; padding:12px 14px; background:rgba(255,255,255,.72); }
    .stewardship-soon-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:24px; }
    .stewardship-soon-actions a { text-decoration:none; }
  </style>
</head>
<body>
  <main class="stewardship-soon-page">
    <section class="stewardship-soon-card">
      <div class="stewardship-soon-kicker">Coming soon</div>
      <h1>Stewardship</h1>
      <p><strong>${escHtml(parishName)}</strong> will see Stewardship here when the module is ready for production use. We are keeping packet generation and records tools paused until the workflow is dependable enough for real parish administration.</p>
      <ul class="stewardship-soon-list">
        <li>Annual meeting packet builder with parish-provided agenda, reports, financial summaries, nominees, and resolutions.</li>
        <li>Print-ready packet generation for annual meetings and parish records.</li>
        <li>Restricted fund snapshots, parish council records, compliance dates, and document storage.</li>
      </ul>
      <p>For now, Parish + remains visible in the dashboard as a planned add-on without checkout or packet creation.</p>
      <div class="stewardship-soon-actions">
        <a class="btn btn-gold" href="/parish/dashboard">Back to parish dashboard</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

// Stripe platform requests (uses STRIPE_SECRET_KEY from env, not the parish's connected account)
async function stripePlatformPost(env, path, body) {
  const params = new URLSearchParams(body).toString();
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  return res.json();
}

// ─── Paywall page ─────────────────────────────────────────────────────────────

export async function handleAdminGrantStewardshipComp(request, env) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  const body = await parseJsonBody(request);
  const parishId = String(body?.parishId || '').trim();
  if (!parishId) return json({ error: 'parishId is required.' }, { status: 400 });

  const found = await findRegistrationByParishId(env, parishId);
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
  const currentCountRaw = await env.AGAPAY_REGISTRATIONS.get(STEWARDSHIP_COMP_PROMO_KV_KEY);
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
  await env.AGAPAY_REGISTRATIONS.put(STEWARDSHIP_COMP_PROMO_KV_KEY, String(newCount));

  return json({
    ok: true,
    parishId,
    comp: registration.stewardshipComp,
    claimed: newCount,
    remaining: Math.max(0, STEWARDSHIP_COMP_PROMO_LIMIT - newCount),
  });
}

// GET /api/admin/stewardship/comp-status
// Returns how many of the 20 founding free-year grants have been claimed,
// for the admin dashboard.
export async function handleAdminStewardshipCompStatus(request, env) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const currentCountRaw = await env.AGAPAY_REGISTRATIONS.get(STEWARDSHIP_COMP_PROMO_KV_KEY);
  const claimed = parseInt(currentCountRaw || '0', 10) || 0;
  return json({
    code: STEWARDSHIP_COMP_PROMO_CODE,
    limit: STEWARDSHIP_COMP_PROMO_LIMIT,
    claimed,
    remaining: Math.max(0, STEWARDSHIP_COMP_PROMO_LIMIT - claimed),
  });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function handleParishStewardshipSummary(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) return json(stewardshipComingSoonPayload(registration));
  let meetings = [];
  let setupRequired = false;
  try {
    meetings = await d1All(
      env,
      `
      SELECT id, title, fiscal_year, meeting_date, status, created_at, updated_at
      FROM stewardship_annual_meetings
      WHERE parish_id = ?
      ORDER BY fiscal_year DESC, created_at DESC
      LIMIT 50
    `,
      registration.parishId
    );
  } catch (error) {
    if (!isMissingStewardshipSchema(error)) throw error;
    setupRequired = true;
  }

  return json({
    ok: true,
    stewardship: stewardshipPublicStatus(registration),
    setupRequired,
    meetings: (meetings || []).map(publicMeeting),
    subscribePlans: [],
  });
}

export async function handleParishStewardshipSubscribe(request, env, parishId) {
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

export async function handleParishStewardshipBillingPortal(request, env, parishId) {
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
  return json({ ok: true, portalUrl: portal.url });
}

export async function handleParishStewardshipMeetings(request, env, parishId) {
  try {
    if (!hasProductionStore(env)) return missingProductionStoreResponse();
    const ctx = await requireParishApiContext(request, env, parishId);
    if (!ctx.ok) return ctx.response;
    const { registration } = ctx;
    if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();
    if (!hasStewardshipToolAccess(registration)) {
      return json(
        { error: 'Stewardship subscription required.', stewardship: stewardshipPublicStatus(registration) },
        { status: 402 }
      );
    }

    if (request.method === 'GET') {
      let meetings = [];
      try {
        meetings = await d1All(
          env,
          `
          SELECT *
          FROM stewardship_annual_meetings
          WHERE parish_id = ?
          ORDER BY fiscal_year DESC, created_at DESC
          LIMIT 50
        `,
          registration.parishId
        );
      } catch (error) {
        if (!isMissingStewardshipSchema(error)) throw error;
        return json(
          { ok: false, error: 'Stewardship database tables are not installed yet.', setupRequired: true },
          { status: 503 }
        );
      }
      return json({ ok: true, meetings: (meetings || []).map(publicMeeting) });
    }

    if (request.method !== 'POST') {
      return json(
        { error: `Method not allowed: ${request.method} is not supported on /stewardship/meetings (use GET or POST)` },
        { status: 405 }
      );
    }
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
    const form = apiFormFromMeetingPayload(body);
    const meetingId = await newId();
    const now = new Date().toISOString();

    await d1Run(
      env,
      `
      INSERT INTO stewardship_annual_meetings
        (id, parish_id, title, fiscal_year, meeting_date, meeting_time, location,
         parish_name_override, jurisdiction, address, signature_line_count, note_line_count,
         status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      meetingId,
      registration.parishId,
      form.title || 'Annual Meeting',
      parseInt(form.fiscal_year) || new Date().getFullYear(),
      form.meeting_date || null,
      form.meeting_time || null,
      form.location || null,
      form.parish_name_override || null,
      form.jurisdiction || null,
      form.address || null,
      form.signature_line_count,
      form.note_line_count,
      form.action === 'ready' ? 'ready' : 'draft',
      null,
      now,
      now
    );

    await saveMeetingSubRecords(env, meetingId, form);

    // Build the response directly instead of delegating to
    // handleParishStewardshipMeetingDetail — that function only accepts
    // GET/PATCH, but this request's method is still POST, which made a
    // successful creation look like a failed "Method not allowed" save.
    const created = await d1First(
      env,
      'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
      meetingId,
      registration.parishId
    );
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);
    return json({
      ok: true,
      meeting: publicMeetingDetails(
        created,
        agendaItems,
        reports,
        financialSummary,
        restrictedFunds,
        nominees,
        resolutions
      ),
    });
  } catch (err) {
    return json({ error: 'Stewardship meetings request failed: ' + (err?.message || String(err)) }, { status: 500 });
  }
}

export async function handleParishStewardshipMeetingDetail(request, env, parishId, meetingId) {
  try {
    if (!hasProductionStore(env)) return missingProductionStoreResponse();
    const ctx = await requireParishApiContext(request, env, parishId);
    if (!ctx.ok) return ctx.response;
    const { registration } = ctx;
    if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();
    if (!hasStewardshipToolAccess(registration)) {
      return json(
        { error: 'Stewardship subscription required.', stewardship: stewardshipPublicStatus(registration) },
        { status: 402 }
      );
    }

    const meeting = await d1First(
      env,
      'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
      meetingId,
      registration.parishId
    );
    if (!meeting) return json({ error: 'Meeting not found' }, { status: 404 });

    if (request.method === 'GET') {
      const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
        await loadMeetingSubRecords(env, meetingId);
      return json({
        ok: true,
        meeting: publicMeetingDetails(
          meeting,
          agendaItems,
          reports,
          financialSummary,
          restrictedFunds,
          nominees,
          resolutions
        ),
      });
    }

    if (request.method !== 'PATCH') return json({ error: 'Method not allowed' }, { status: 405 });
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
    const form = apiFormFromMeetingPayload(body);
    const now = new Date().toISOString();

    await d1Run(
      env,
      `
      UPDATE stewardship_annual_meetings SET
        title = ?, fiscal_year = ?, meeting_date = ?, meeting_time = ?, location = ?,
        parish_name_override = ?, jurisdiction = ?, address = ?,
        signature_line_count = ?, note_line_count = ?, status = ?, updated_at = ?
      WHERE id = ? AND parish_id = ?
    `,
      form.title || meeting.title,
      parseInt(form.fiscal_year) || meeting.fiscal_year,
      form.meeting_date || null,
      form.meeting_time || null,
      form.location || null,
      form.parish_name_override || null,
      form.jurisdiction || null,
      form.address || null,
      form.signature_line_count,
      form.note_line_count,
      form.action === 'ready' ? 'ready' : 'draft',
      now,
      meetingId,
      registration.parishId
    );
    await deleteMeetingSubRecords(env, meetingId);
    await saveMeetingSubRecords(env, meetingId, form);

    const updated = await d1First(
      env,
      'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
      meetingId,
      registration.parishId
    );
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);
    return json({
      ok: true,
      meeting: publicMeetingDetails(
        updated,
        agendaItems,
        reports,
        financialSummary,
        restrictedFunds,
        nominees,
        resolutions
      ),
    });
  } catch (err) {
    // Surface the real failure instead of letting it become an opaque
    // Cloudflare 1101/500 with no body the client can read.
    return json({ error: 'Stewardship meeting request failed: ' + (err?.message || String(err)) }, { status: 500 });
  }
}

// GET /parish/stewardship
export async function handleStewardshipHome(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  if (!hasStewardshipToolAccess(registration)) {
    return new Response(paywallHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  const meetings = await d1All(
    env,
    `
    SELECT id, title, fiscal_year, meeting_date, status
    FROM stewardship_annual_meetings
    WHERE parish_id = ?
    ORDER BY fiscal_year DESC, created_at DESC
    LIMIT 50
  `,
    registration.parishId
  );

  return new Response(stewardshipHomeHtml(registration, meetings || [], env), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

// POST /parish/stewardship/subscribe
export async function handleStewardshipSubscribe(request, env) {
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

export async function handleStewardshipBilling(request, env) {
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
export async function handleStewardshipBillingPortal(request, env) {
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

// GET /parish/stewardship/annual-meetings
export async function handleStewardshipMeetingList(request, env) {
  // Reuse home handler — the list is shown there
  return handleStewardshipHome(request, env);
}

// GET /parish/stewardship/annual-meetings/new
// POST /parish/stewardship/annual-meetings/new
export async function handleStewardshipMeetingNew(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      status: request.method === 'GET' ? 200 : 409,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  if (!hasStewardshipToolAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship', 303);
  }

  if (request.method === 'GET') {
    return new Response(annualMeetingFormHtml(registration, null, [], [], null, [], [], [], env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  // POST — create new meeting and all sub-records
  const form = await parseFormBody(request);
  const meetingId = await newId();
  const now = new Date().toISOString();

  await d1Run(
    env,
    `
    INSERT INTO stewardship_annual_meetings
      (id, parish_id, title, fiscal_year, meeting_date, meeting_time, location,
       parish_name_override, jurisdiction, address, signature_line_count, note_line_count,
       status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    meetingId,
    registration.parishId,
    form.title || 'Annual Meeting',
    parseInt(form.fiscal_year) || new Date().getFullYear(),
    form.meeting_date || null,
    form.meeting_time || null,
    form.location || null,
    form.parish_name_override || null,
    form.jurisdiction || null,
    form.address || null,
    packetLineCount(form.signature_line_count, 24, { min: 1 }),
    packetLineCount(form.note_line_count, 12),
    form.action === 'ready' ? 'ready' : 'draft',
    ctx.userEmail || null,
    now,
    now
  );

  await saveMeetingSubRecords(env, meetingId, form);

  return Response.redirect(
    absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship/annual-meetings/' + meetingId,
    303
  );
}

// GET /parish/stewardship/annual-meetings/:id
// POST /parish/stewardship/annual-meetings/:id
export async function handleStewardshipMeetingEdit(request, env, meetingId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      status: request.method === 'GET' ? 200 : 409,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  if (!hasStewardshipToolAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship', 303);
  }

  const meeting = await d1First(
    env,
    'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
    meetingId,
    registration.parishId
  );
  if (!meeting) return json({ error: 'Not found' }, { status: 404 });

  if (request.method === 'GET') {
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);

    return new Response(
      annualMeetingFormHtml(
        registration,
        meeting,
        agendaItems,
        reports,
        financialSummary,
        restrictedFunds,
        nominees,
        resolutions,
        env
      ),
      { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }

  // POST — update
  const form = await parseFormBody(request);
  const now = new Date().toISOString();

  await d1Run(
    env,
    `
    UPDATE stewardship_annual_meetings SET
      title = ?, fiscal_year = ?, meeting_date = ?, meeting_time = ?, location = ?,
      parish_name_override = ?, jurisdiction = ?, address = ?,
      signature_line_count = ?, note_line_count = ?, status = ?, updated_at = ?
    WHERE id = ? AND parish_id = ?
  `,
    form.title || meeting.title,
    parseInt(form.fiscal_year) || meeting.fiscal_year,
    form.meeting_date || null,
    form.meeting_time || null,
    form.location || null,
    form.parish_name_override || null,
    form.jurisdiction || null,
    form.address || null,
    packetLineCount(form.signature_line_count, meeting.signature_line_count || 24, { min: 1 }),
    packetLineCount(form.note_line_count, meeting.note_line_count ?? 12),
    form.action === 'ready' ? 'ready' : form.action === 'save' ? 'draft' : meeting.status,
    now,
    meetingId,
    registration.parishId
  );

  // Delete and re-insert sub-records (simplest approach for MVP)
  await deleteMeetingSubRecords(env, meetingId);
  await saveMeetingSubRecords(env, meetingId, form);

  return Response.redirect(
    absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship/annual-meetings/' + meetingId,
    303
  );
}

// GET /parish/stewardship/annual-meetings/:id/preview
export async function handleStewardshipMeetingPreview(request, env, meetingId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  if (!hasStewardshipToolAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship', 303);
  }

  const meeting = await d1First(
    env,
    'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
    meetingId,
    registration.parishId
  );
  if (!meeting) return json({ error: 'Not found' }, { status: 404 });

  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] = await loadMeetingSubRecords(
    env,
    meetingId
  );

  return new Response(
    packetPreviewHtml(
      registration,
      meeting,
      agendaItems,
      reports,
      financialSummary,
      restrictedFunds,
      nominees,
      resolutions,
      false,
      env
    ),
    { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}

// GET /parish/stewardship/annual-meetings/:id/pdf
// Returns print-optimised HTML — browser/OS native print-to-PDF
export async function handleStewardshipMeetingPdf(request, env, meetingId) {
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

  if (!hasStewardshipToolAccess(registration)) {
    return unauthorized('Stewardship subscription required');
  }

  const meeting = await d1First(
    env,
    'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
    meetingId,
    registration.parishId
  );
  if (!meeting) return json({ error: 'Not found' }, { status: 404 });

  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] = await loadMeetingSubRecords(
    env,
    meetingId
  );

  // Log generation
  await d1Run(
    env,
    `
    INSERT INTO stewardship_generated_packets (id, annual_meeting_id, generated_by, generated_at)
    VALUES (?, ?, ?, ?)
  `,
    await newId(),
    meetingId,
    ctx.userEmail || null,
    new Date().toISOString()
  );

  // Update status to generated
  await d1Run(
    env,
    "UPDATE stewardship_annual_meetings SET status = 'generated', updated_at = ? WHERE id = ?",
    new Date().toISOString(),
    meetingId
  );

  const html = packetPreviewHtml(
    registration,
    meeting,
    agendaItems,
    reports,
    financialSummary,
    restrictedFunds,
    nominees,
    resolutions,
    true,
    env
  );

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Content-Disposition': `inline; filename="annual-meeting-${meeting.fiscal_year}.html"`,
    },
  });
}

// ─── Stripe webhook handler for Stewardship subscriptions ────────────────────

// ─── Stewardship Giving Metrics — full page ───────────────────────────────────

export async function handleStewardshipGivingMetricsPage(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (!hasStewardshipToolAccess(registration)) {
    return new Response(paywallHtml(registration, env), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const parishName = registration.parishName || registration.name || 'Parish';
  const currentYear = new Date().getFullYear();
  const yearOptions = [0, 1, 2, 3, 4]
    .map((n) => {
      const y = currentYear - n;
      return `<option value="${y}">${y}</option>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Stewardship Reports — AGAPAY Stewardship</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <link rel="stylesheet" href="${base}/styles/stewardship.css" />
</head>
<body class="dashboard-body sw-report-page">
  <div class="dashboard-shell sw-report-shell">
    ${dashboardNav(registration, 'stewardship', base)}
    <main class="dashboard-main sw-report-main">
      <div class="sw-report-header">
        <div>
          <span class="sw-report-eyebrow">AGAPAY Stewardship</span>
          <h1>Full Parish Report</h1>
          <p>Review pledge progress, fund activity, donor distribution, and retention for ${escHtml(parishName)}.</p>
        </div>
        <div class="sw-report-actions">
          <a class="sw-report-back" href="/parish/stewardship">Back to Stewardship</a>
          <select id="year-select" class="sw-year-select" onchange="loadAll()">
            ${yearOptions}
          </select>
          <button onclick="downloadReport()" class="btn btn-gold" id="pdf-btn">Download PDF</button>
        </div>
      </div>

      <!-- KPIs -->
      <div id="kpi-grid" class="giving-kpi-grid"></div>

      <!-- Pledge progress -->
      <section class="module-card sw-report-card">
        <h2>Pledge vs. Actual &amp; Run Rate</h2>
        <div id="progress-bars"></div>
      </section>

      <!-- Fund breakdown -->
      <section class="module-card sw-report-card">
        <h2>Giving by Fund</h2>
        <div id="funds-table" class="sw-report-table-wrap"></div>
      </section>

      <!-- Two-col: distribution + retention -->
      <div class="sw-report-two-col">
        <section class="module-card sw-report-card">
          <h2>Giving Distribution</h2>
          <p class="sw-report-muted">Anonymized. No individual identities disclosed.</p>
          <div id="tier-chart"></div>
        </section>
        <section class="module-card sw-report-card">
          <h2>Donor Retention</h2>
          <div id="retention-cards" class="sw-report-retention"></div>
        </section>
      </div>
    </main>
  </div>

  <style>
    .giving-kpi-card { background:#fff;border:1px solid var(--line,#e5dfd3);border-radius:10px;padding:.9rem 1rem;box-shadow:0 8px 22px rgba(6,21,34,.06); }
    .giving-kpi-label { font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted,#8b8578);margin-bottom:.3rem; }
    .giving-kpi-value { font-family:var(--serif,Georgia,serif);font-size:1.65rem;font-weight:600;color:var(--deep,#061522);line-height:1; }
    .giving-kpi-sub { font-size:.72rem;color:var(--stone,#6f6a60);margin-top:.25rem; }
    .progress-track { background:rgba(6,21,34,.08);border-radius:6px;height:10px;overflow:hidden;margin:.3rem 0 .2rem; }
    .progress-fill { height:100%;background:linear-gradient(90deg,var(--gold,#C49C50) 0%,#DABB70 100%);border-radius:6px;transition:width .5s ease; }
    .progress-fill.dim { opacity:.35;border-right:2px dashed var(--gold,#C49C50); }
    .giving-fund-table { width:100%;border-collapse:collapse;font-size:.85rem; }
    .giving-fund-table th { font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#8b8578);text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--line,#e5dfd3); }
    .giving-fund-table td { padding:.55rem .5rem;border-bottom:1px solid rgba(111,106,96,.12); }
    .tier-row { display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem; }
    .tier-label { width:120px;flex-shrink:0;font-size:.78rem;color:var(--stone,#6f6a60); }
    .tier-bar-wrap { flex:1;background:rgba(6,21,34,.07);border-radius:5px;height:18px;overflow:hidden; }
    .tier-bar-fill { height:100%;background:var(--gold,#C49C50);border-radius:5px; }
    .tier-count { width:80px;font-size:.78rem;text-align:right; }
    .ret-card { background:#fff;border:1px solid var(--line,#e5dfd3);border-radius:10px;padding:.9rem 1rem;text-align:center; }
    .ret-num { font-family:var(--font-serif,Georgia,serif);font-size:1.8rem;font-weight:600;color:var(--gold,#C49C50); }
    .ret-lbl { font-size:.72rem;color:var(--stone,#6f6a60);margin-top:.2rem; }
  </style>

  <script>
    (function() {
      var qs       = new URLSearchParams(window.location.search);
      var parishId = qs.get("parishId") || "";
      var token    = qs.get("t") || "";
      var base     = "/api/parish/dashboard/" + encodeURIComponent(parishId);

      function authFetch(path) {
        var year = document.getElementById("year-select").value;
        return fetch(base + path + "?year=" + year, { headers: { Authorization: "Bearer " + token } }).then(function(r){ return r.json(); });
      }

      function fmt(cents) {
        return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      }

      function escH(s) {
        return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      }

      function loadAll() {
        Promise.all([
          authFetch("/stewardship/giving/summary"),
          authFetch("/stewardship/giving/funds"),
          authFetch("/stewardship/giving/distribution"),
          authFetch("/stewardship/giving/retention")
        ]).then(function(d) {
          renderKpis(d[0]);
          renderProgress(d[0]);
          renderFunds(d[1]);
          renderTiers(d[2]);
          renderRetention(d[3]);
        }).catch(function(e) { console.error("Giving metrics error", e); });
      }

      function renderKpis(s) {
        if (!s || s.error) return;
        var yoy = s.prior_year_actual_cents > 0
          ? Math.round(((s.total_actual_cents - s.prior_year_actual_cents) / s.prior_year_actual_cents) * 100) : null;
        var yoyBadge = yoy !== null
          ? "<span style='color:" + (yoy>=0?"var(--green,#4ade80)":"var(--red,#f87171)") + ";font-weight:600'>" + (yoy>=0?"▲":"▼") + " " + Math.abs(yoy) + "% vs prior year</span>" : "";
        document.getElementById("kpi-grid").innerHTML =
          kpi("Total Collected", fmt(s.total_actual_cents), yoyBadge) +
          kpi("Total Pledged", fmt(s.total_pledged_cents), s.pledging_donors + " pledging donors") +
          kpi("Fulfillment Rate", s.fulfillment_rate_pct !== null ? s.fulfillment_rate_pct + "%" : "—", "of pledged amounts collected") +
          kpi("Avg per Donor", fmt(s.avg_per_donor_cents), s.active_donors + " active this year");
      }

      function kpi(label, value, sub) {
        return "<div class='giving-kpi-card'><div class='giving-kpi-label'>" + label + "</div><div class='giving-kpi-value'>" + value + "</div><div class='giving-kpi-sub'>" + sub + "</div></div>";
      }

      function renderProgress(s) {
        if (!s || s.error) return;
        var pct = s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.total_actual_cents / s.total_pledged_cents) * 100)) : 0;
        var rrPct = s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.run_rate_cents / s.total_pledged_cents) * 100)) : 0;
        document.getElementById("progress-bars").innerHTML =
          "<div style='font-size:.8rem;color:var(--stone,#6f6a60);margin-bottom:.2rem'>Collected — " + fmt(s.total_actual_cents) + " (" + pct + "% of goal)</div>" +
          "<div class='progress-track'><div class='progress-fill' style='width:" + pct + "%'></div></div>" +
          "<div style='font-size:.78rem;color:var(--stone,#6f6a60);margin:1rem 0 .2rem'>Run Rate Projection — " + fmt(s.run_rate_cents) + " <span style='opacity:.5;font-size:.72rem'>(day " + s.day_of_year + " of " + s.days_in_year + ")</span></div>" +
          "<div class='progress-track'><div class='progress-fill dim' style='width:" + rrPct + "%'></div></div>" +
          "<div style='font-size:.72rem;color:var(--stone,#6f6a60);margin-top:.2rem'>Pledge goal: " + fmt(s.total_pledged_cents) + "</div>";
      }

      function renderFunds(f) {
        if (!f || f.error) return;
        var rows = (f.funds || []).map(function(fd) {
          return "<tr><td>" + escH(fd.fund_name) + "</td><td style='text-align:center;color:var(--stone,#6f6a60)'>" + fd.transaction_count + "</td><td style='text-align:right;color:var(--gold,#C49C50)'>" + fmt(fd.total_cents) + "</td><td style='text-align:right;color:var(--stone,#6f6a60)'>" + fd.pct_of_total + "%</td><td style='width:80px'><div style='background:rgba(6,21,34,.07);border-radius:3px;height:5px'><div style='width:" + fd.pct_of_total + "%;height:100%;background:var(--gold,#C49C50);border-radius:3px'></div></div></td></tr>";
        }).join("");
        document.getElementById("funds-table").innerHTML =
          "<table class='giving-fund-table'><thead><tr><th>Fund</th><th style='text-align:center'>Transactions</th><th style='text-align:right'>Total</th><th style='text-align:right'>%</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>";
      }

      function renderTiers(d) {
        if (!d || d.error) return;
        var max = Math.max.apply(null, (d.tiers||[]).map(function(t){ return t.count; }).concat([1]));
        document.getElementById("tier-chart").innerHTML = (d.tiers||[]).map(function(t) {
          var w = Math.round((t.count / max) * 100);
          return "<div class='tier-row'><div class='tier-label'>" + escH(t.label) + "</div><div class='tier-bar-wrap'><div class='tier-bar-fill' style='width:" + w + "%'></div></div><div class='tier-count'>" + t.count + " donor" + (t.count !== 1 ? "s" : "") + "</div></div>";
        }).join("");
      }

      function renderRetention(r) {
        if (!r || r.error) return;
        document.getElementById("retention-cards").innerHTML =
          "<div class='ret-card'><div class='ret-num'>" + (r.retention_rate_pct !== null ? r.retention_rate_pct + "%" : "—") + "</div><div class='ret-lbl'>Retention Rate<br>vs " + r.prior_year + "</div></div>" +
          "<div class='ret-card'><div class='ret-num' style='color:var(--green,#4ade80)'>" + r.new_donors + "</div><div class='ret-lbl'>New Donors<br>first gift this year</div></div>" +
          "<div class='ret-card'><div class='ret-num'>" + r.retained + "</div><div class='ret-lbl'>Retained<br>gave both years</div></div>" +
          "<div class='ret-card'><div class='ret-num' style='color:var(--red,#f87171)'>" + r.lapsed + "</div><div class='ret-lbl'>Lapsed<br>gave " + r.prior_year + ", not yet this year</div></div>";
      }

      function downloadReport() {
        var year = document.getElementById("year-select").value;
        var btn = document.getElementById("pdf-btn");
        btn.disabled = true; btn.textContent = "Generating…";
        fetch(base + "/stewardship/giving/generate-pdf?year=" + year, {
          method: "POST", headers: { Authorization: "Bearer " + token }
        }).then(function(r) {
          if (!r.ok) throw new Error("PDF failed");
          return r.blob();
        }).then(function(blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = "AGAPAY-Parish-Plus-" + year + ".pdf"; a.click();
          URL.revokeObjectURL(url);
        }).catch(function() {
          alert("PDF generation failed. Please try again.");
        }).finally(function() {
          btn.disabled = false; btn.textContent = "Download Report PDF";
        });
      }

      loadAll();
    })();
  </script>
  ${stewardshipSessionScript()}
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

async function loadMeetingSubRecords(env, meetingId) {
  return Promise.all([
    d1All(env, 'SELECT * FROM stewardship_agenda_items WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
    d1All(env, 'SELECT * FROM stewardship_reports WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
    d1First(env, 'SELECT * FROM stewardship_financial_summaries WHERE annual_meeting_id = ?', meetingId),
    d1All(
      env,
      'SELECT * FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ? ORDER BY sort_order',
      meetingId
    ),
    d1All(env, 'SELECT * FROM stewardship_nominees WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
    d1All(env, 'SELECT * FROM stewardship_resolutions WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
  ]);
}

async function deleteMeetingSubRecords(env, meetingId) {
  await Promise.all([
    d1Run(env, 'DELETE FROM stewardship_agenda_items WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_reports WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_financial_summaries WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_nominees WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_resolutions WHERE annual_meeting_id = ?', meetingId),
  ]);
}

async function saveMeetingSubRecords(env, meetingId, form) {
  const now = new Date().toISOString();

  // Agenda items
  const agendaTitles = [].concat(form.agenda_title || []);
  const agendaDurations = [].concat(form.agenda_duration || []);
  for (let i = 0; i < agendaTitles.length; i++) {
    if (!agendaTitles[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_agenda_items (id, annual_meeting_id, title, duration_minutes, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      agendaTitles[i].trim(),
      parseInt(agendaDurations[i]) || null,
      i,
      now
    );
  }

  // Reports
  const rTypes = [].concat(form.report_type || []);
  const rTitles = [].concat(form.report_title || []);
  const rBodies = [].concat(form.report_body || []);
  const rSignedBy = [].concat(form.report_signed_by || []);
  for (let i = 0; i < rTitles.length; i++) {
    if (!rTitles[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_reports (id, annual_meeting_id, report_type, title, body, created_by, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      rTypes[i] || 'custom',
      rTitles[i].trim(),
      rBodies[i] || '',
      rSignedBy[i]?.trim() || null,
      i,
      now,
      now
    );
  }

  // Financial summary
  if (form.fin_income || form.fin_expense) {
    const income = displayToCents(form.fin_income);
    const expense = displayToCents(form.fin_expense);
    await d1Run(
      env,
      `
      INSERT INTO stewardship_financial_summaries
        (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents, notes, snapshot_taken_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      income,
      expense,
      income - expense,
      form.fin_notes || null,
      now,
      now,
      now
    );
  }

  // Restricted funds
  const fNames = [].concat(form.fund_name || []);
  const fBegin = [].concat(form.fund_begin || []);
  const fReceived = [].concat(form.fund_received || []);
  const fDisbursed = [].concat(form.fund_disbursed || []);
  const fEnding = [].concat(form.fund_ending || []);
  for (let i = 0; i < fNames.length; i++) {
    if (!fNames[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_restricted_fund_snapshots
        (id, annual_meeting_id, fund_name, beginning_balance_cents, total_received_cents,
         total_disbursed_cents, ending_balance_cents, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      fNames[i].trim(),
      displayToCents(fBegin[i]),
      displayToCents(fReceived[i]),
      displayToCents(fDisbursed[i]),
      displayToCents(fEnding[i]),
      i,
      now
    );
  }

  // Nominees
  const nNames = [].concat(form.nominee_name || []);
  const nPositions = [].concat(form.nominee_position || []);
  const nBios = [].concat(form.nominee_bio || []);
  const nNominatedBy = [].concat(form.nominee_nominated_by || []);
  for (let i = 0; i < nNames.length; i++) {
    if (!nNames[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_nominees (id, annual_meeting_id, full_name, position, bio, nominated_by, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      nNames[i].trim(),
      nPositions[i] || null,
      nBios[i]?.trim() || null,
      nNominatedBy[i]?.trim() || null,
      i,
      now
    );
  }

  // Resolutions
  const resTitles = [].concat(form.resolution_title || []);
  const resResolved = [].concat(form.resolution_resolved || []);
  for (let i = 0; i < resTitles.length; i++) {
    if (!resTitles[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_resolutions (id, annual_meeting_id, title, resolved_text, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      resTitles[i].trim(),
      resResolved[i] || null,
      i,
      now
    );
  }
}
