import type { StewardshipEnvironment, StewardshipRegistration } from './stewardship-composition-contracts.js';

// src/handlers/stewardship.js
// AGAPAY Stewardship module — Parish-tier annual meeting packet builder.
// All routes live under /parish/stewardship/*.
// Parish auth is already verified by requireAdmin / requireParish helpers in parish.js
// before these handlers are called.

import { hasActiveStewardshipComp, json, stewardshipStatus, unauthorized } from '../lib/core.js';

import { hasLegacyParishPlusAddOn, stewardshipToolAccess, tierIncludesModule } from '../lib/entitlements.js';

import { absoluteWebsiteUrl, findRegistrationByParishId, verifyParishDashboardBearer } from './parish.js';

import './admin.js';

import { getBearerToken } from '../lib/core.js';

import { escHtml } from './stewardship-http.js';

import './stewardship-presentation.js';

import './stewardship-packet-presentation.js';

import './stewardship-financials.js';

import './stewardship-communications.js';
import './stewardship-billing.js';
import './stewardship.js';
import './stewardship-meeting-api.js';
import './stewardship-meeting-pages.js';
import './stewardship-metrics-page.js';
import './stewardship-meeting-storage.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const STEWARDSHIP_PRODUCT_KEY = 'stewardship';
export const STEWARDSHIP_COMING_SOON = false;
export const STEWARDSHIP_COMP_PROMO_CODE = 'founding-20';
export const STEWARDSHIP_COMP_PROMO_LIMIT = 20;
export const STEWARDSHIP_COMP_PROMO_KV_KEY = 'stewardship_comp_promo:founding-20:count';
export async function requireParishContext(
  request: Request,
  env: StewardshipEnvironment
): Promise<
  | { ok: true; registration: StewardshipRegistration; key: string; userEmail?: string }
  | { ok: false; response: Response }
> {
  const url = new URL(request.url);
  const parishId = url.searchParams.get('parishId');
  const token = url.searchParams.get('t') || getBearerToken(request);
  if (!parishId || !token) {
    return {
      ok: false as const,
      response: new Response(
        "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
        { status: 401, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      ),
    };
  }
  const found = await findRegistrationByParishId<StewardshipRegistration>(env, parishId);
  if (!found) return { ok: false as const, response: new Response('Parish not found', { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return {
      ok: false as const,
      response: new Response(
        "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
        { status: 401, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      ),
    };
  }
  return { ok: true as const, registration: found.registration, key: found.key };
}
export async function requireParishApiContext(request: Request, env: StewardshipEnvironment, parishId: string) {
  const token = getBearerToken(request);
  if (!parishId || !token) return { ok: false as const, response: unauthorized() };
  const found = await findRegistrationByParishId<StewardshipRegistration>(env, parishId);
  if (!found) return { ok: false as const, response: json({ error: 'Parish not found' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false as const, response: unauthorized() };
  }
  // Callers that need to persist changes back to this registration must use
  // this key as the reference for saveRegistrationRecord(env, key, registration)
  // — passing the registration object itself where a string key is expected
  // silently corrupts the save (registration becomes the "reference" arg,
  // and the real registration argument is left undefined).
  return { ok: true as const, registration: found.registration, key: found.key };
}
export function stewardshipPublicStatus(registration: StewardshipRegistration | null) {
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
export function hasStewardshipToolAccess(registration: StewardshipRegistration | null) {
  return stewardshipToolAccess(registration);
}
export function stewardshipComingSoonPayload(registration: StewardshipRegistration | null = null) {
  return {
    ok: true as const,
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
export function stewardshipComingSoonJson(status: number = 409) {
  return json(
    {
      ok: false as const,
      comingSoon: true,
      error: 'AGAPAY Stewardship is coming soon. Packet generation and billing are not enabled yet.',
    },
    { status }
  );
}
export function stewardshipComingSoonHtml(registration: StewardshipRegistration | null, env: StewardshipEnvironment) {
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
