// src/handlers/stewardship.js
// AGAPAY Stewardship module — subscription gate, annual meeting packet builder.
// All routes live under /parish/stewardship/*.
// Parish auth is already verified by requireAdmin / requireParish helpers in parish.js
// before these handlers are called.

import {
  STRIPE_EVENT_PREFIX,
  claimStripeEvent,
  d1All,
  d1First,
  d1Run,
  finishStripeEvent,
  generateSecret,
  hasActiveStewardshipComp,
  hasProductionStore,
  hasStewardshipAccess,
  json,
  missingProductionStoreResponse,
  rateLimit,
  stewardshipStatus,
  unauthorized,
} from "../lib/core.js";

import {
  absoluteWebsiteUrl,
  loadRegistrationByReference,
  saveRegistrationRecord,
  findRegistrationByParishId,
  verifyParishDashboardBearer,
} from "./parish.js";

import { verifyStripeWebhook } from "./stripe.js";

import { requireAdmin } from "./admin.js";

import { getBearerToken } from "../lib/core.js";

// Auth for stewardship SSR pages.
// The parish SPA links here with ?parishId=XX&t=TOKEN (token from localStorage).
// The worker validates the token against the parish registration.
async function requireParishContext(request, env) {
  const url = new URL(request.url);
  const parishId = url.searchParams.get("parishId");
  const token = url.searchParams.get("t") || getBearerToken(request);
  if (!parishId || !token) {
    return { ok: false, response: new Response(
      "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
      { status: 401, headers: { "Content-Type": "text/html;charset=utf-8" } }
    )};
  }
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: new Response("Parish not found", { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false, response: new Response(
      "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
      { status: 401, headers: { "Content-Type": "text/html;charset=utf-8" } }
    )};
  }
  return { ok: true, registration: found.registration, key: found.key };
}

async function requireParishApiContext(request, env, parishId) {
  const token = getBearerToken(request);
  if (!parishId || !token) return { ok: false, response: unauthorized() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: json({ error: "Parish not found" }, { status: 404 }) };
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

export const STEWARDSHIP_PRODUCT_KEY = "stewardship";
const STEWARDSHIP_COMING_SOON = false;

// Active subscription states that unlock the module
// Cap on the "founding 20" free-year Stewardship Suite promo.
const STEWARDSHIP_COMP_PROMO_CODE = "founding-20";
const STEWARDSHIP_COMP_PROMO_LIMIT = 20;
const STEWARDSHIP_COMP_PROMO_KV_KEY = "stewardship_comp_promo:founding-20:count";

// ─── Subscription helpers ─────────────────────────────────────────────────────
// hasActiveStewardshipComp, stewardshipStatus, and hasStewardshipAccess now
// live in lib/core.js — re-exported here so every existing caller inside
// this file that imports them from "./stewardship.js" keeps working, while
// parish.js and donor.js can import the same functions directly from
// core.js without creating a circular dependency on this file.
export { hasActiveStewardshipComp, stewardshipStatus, hasStewardshipAccess };

function stewardshipPublicStatus(registration) {
  const comp = registration?.stewardshipComp || null;
  return {
    status: stewardshipStatus(registration),
    active: hasStewardshipAccess(registration),
    cancelAtPeriodEnd: Boolean(registration?.stewardshipCancelAtPeriodEnd),
    currentPeriodEnd: registration?.stewardshipPeriodEnd || null,
    trialEnd: registration?.stewardshipTrialEnd || null,
    customerConfigured: Boolean(registration?.stewardshipStripeCustomerId),
    subscriptionConfigured: Boolean(registration?.stewardshipStripeSubscriptionId),
    comp: comp && hasActiveStewardshipComp(registration) ? {
      code: comp.code || null,
      grantedAt: comp.grantedAt || null,
      expiresAt: comp.expiresAt || null
    } : null
  };
}

function stewardshipComingSoonPayload(registration = null) {
  return {
    ok: true,
    comingSoon: true,
    stewardship: {
      status: "coming_soon",
      active: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      trialEnd: null,
      customerConfigured: Boolean(registration?.stewardshipStripeCustomerId),
      subscriptionConfigured: Boolean(registration?.stewardshipStripeSubscriptionId)
    },
    setupRequired: false,
    meetings: [],
    subscribePlans: [],
    message: "AGAPAY Stewardship is currently paused as a coming soon add-on."
  };
}

function stewardshipComingSoonJson(status = 409) {
  return json({
    ok: false,
    comingSoon: true,
    error: "AGAPAY Stewardship is coming soon. Packet generation and billing are not enabled yet."
  }, { status });
}

function stewardshipComingSoonHtml(registration, env) {
  const base = absoluteWebsiteUrl(env);
  const parishName = registration?.parishName || registration?.name || "Your parish";
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
      <div class="stewardship-soon-kicker">Coming soon add-on</div>
      <h1>AGAPAY Stewardship</h1>
      <p><strong>${escHtml(parishName)}</strong> will see Stewardship here when the module is ready for production use. We are keeping packet generation, billing, and records tools paused until the workflow is dependable enough for real parish administration.</p>
      <ul class="stewardship-soon-list">
        <li>Annual meeting packet builder with parish-provided agenda, reports, financial summaries, nominees, and resolutions.</li>
        <li>Print-ready packet generation for annual meetings and parish records.</li>
        <li>Restricted fund snapshots, parish council records, compliance dates, and document storage.</li>
      </ul>
      <p>For now, Stewardship remains visible in the dashboard as a planned add-on without checkout or packet creation.</p>
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
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  return res.json();
}

async function stripePlatformGet(env, path) {
  const res = await fetch("https://api.stripe.com/v1" + path, {
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  return res.json();
}

// ─── Paywall page ─────────────────────────────────────────────────────────────

function paywallHtml(registration, env) {
  const parishName = registration.parishName || registration.name || "Your Parish";
  const base = absoluteWebsiteUrl(env);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AGAPAY Stewardship</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <style>
    .paywall { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem; }
    .paywall-hero { text-align: center; margin-bottom: 3rem; }
    .paywall-hero h1 { font-size: 2.2rem; font-family: var(--font-serif); color: var(--gold); margin-bottom: .5rem; }
    .paywall-hero p { color: var(--text-muted); max-width: 520px; margin: 0 auto; line-height: 1.6; }
    .paywall-feature { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; display: flex; gap: 1rem; align-items: flex-start; }
    .paywall-feature-icon { font-size: 2rem; flex-shrink: 0; }
    .paywall-feature h3 { margin: 0 0 .25rem; font-size: 1.05rem; }
    .paywall-feature p { margin: 0; color: var(--text-muted); font-size: .9rem; }
    .plan-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
    @media (max-width: 520px) { .plan-cards { grid-template-columns: 1fr; } }
    .plan-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 1.75rem 1.5rem; text-align: center; }
    .plan-card.featured { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 6%, var(--surface-2)); }
    .plan-card .badge { display: inline-block; background: var(--gold); color: #000; font-size: .7rem; font-weight: 700; letter-spacing: .05em; padding: .2rem .6rem; border-radius: 20px; margin-bottom: .75rem; text-transform: uppercase; }
    .plan-price { font-size: 2.5rem; font-weight: 700; color: var(--text); margin: .5rem 0 .25rem; }
    .plan-price span { font-size: 1rem; font-weight: 400; color: var(--text-muted); }
    .plan-label { color: var(--text-muted); font-size: .9rem; margin-bottom: 1.5rem; }
    .plan-note { font-size: .8rem; color: var(--text-muted); margin-top: 1.5rem; text-align: center; }
    .btn-primary { display: inline-block; background: var(--gold); color: #000; font-weight: 600; padding: .75rem 1.5rem; border-radius: 8px; text-decoration: none; border: none; cursor: pointer; font-size: .95rem; width: 100%; }
    .btn-primary:hover { background: var(--gold-hover, #c8922a); }
    .coming-soon-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5rem; }
    .coming-soon-list li { color: var(--text-muted); font-size: .9rem; }
    .coming-soon-list li::before { content: "⟡ "; color: var(--gold); }
  </style>
</head>
<body class="dashboard-body">
  <div class="paywall">
    <div class="paywall-hero">
      <p style="color:var(--gold);font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;margin-bottom:.5rem">AGAPAY</p>
      <h1>Stewardship</h1>
      <p>Annual meeting packets, parish council records, restricted fund reporting, and faithful parish administration — built for Orthodox communities.</p>
    </div>

    <div class="paywall-feature">
      <div class="paywall-feature-icon">📋</div>
      <div>
        <h3>Annual Meeting Packet Builder</h3>
        <p>Generate a complete, branded annual parish meeting packet — agenda, reports, financial summary, restricted funds, nominations, and resolutions — in minutes.</p>
      </div>
    </div>

    <div class="plan-cards">
      <div class="plan-card">
        <div class="plan-price">$39<span>/mo</span></div>
        <div class="plan-label">Monthly plan</div>
        <form method="POST" action="/parish/stewardship/subscribe">
          <input type="hidden" name="plan" value="monthly" />
          <button type="submit" class="btn-primary">Start Monthly</button>
        </form>
      </div>
      <div class="plan-card featured">
        <div class="badge">Best Value</div>
        <div class="plan-price">$399<span>/yr</span></div>
        <div class="plan-label">Annual plan — save $69</div>
        <form method="POST" action="/parish/stewardship/subscribe">
          <input type="hidden" name="plan" value="annual" />
          <button type="submit" class="btn-primary">Start Annual</button>
        </form>
      </div>
    </div>

    <p class="plan-note">Your subscription applies to the <strong>${escHtml(parishName)}</strong> parish account. A 14-day free trial is included.</p>

    <div style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border)">
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:1rem">Coming soon in Stewardship:</p>
      <ul class="coming-soon-list">
        <li>Document Vault</li>
        <li>Compliance Calendar</li>
        <li>Parish Council Records</li>
      </ul>
    </div>
  </div>
  ${stewardshipSessionScript()}
</body>
</html>`;
}

// ─── Module home (when subscribed) ───────────────────────────────────────────

function stewardshipHomeHtml(registration, meetings, env) {
  const base = absoluteWebsiteUrl(env);
  const status = stewardshipStatus(registration);
  const statusLabel = {
    active: "Active", trialing: "Trial", past_due: "Past Due",
    canceled: "Canceled", unpaid: "Unpaid", incomplete: "Incomplete",
  }[status] || status;
  const statusColor = hasStewardshipAccess(registration) ? "var(--green, #4ade80)" : "var(--red, #f87171)";

  const meetingRows = meetings.map(m => `
    <tr>
      <td><a href="/parish/stewardship/annual-meetings/${m.id}">${escHtml(m.title)}</a></td>
      <td>${m.fiscal_year}</td>
      <td>${m.meeting_date || "—"}</td>
      <td><span class="status-badge status-${m.status}">${m.status}</span></td>
      <td>
        <a href="/parish/stewardship/annual-meetings/${m.id}">Edit</a> ·
        <a href="/parish/stewardship/annual-meetings/${m.id}/preview">Preview</a>
      </td>
    </tr>`).join("") || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No annual meetings yet. <a href="/parish/stewardship/annual-meetings/new">Create your first packet →</a></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Stewardship — AGAPAY</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <link rel="stylesheet" href="${base}/styles/stewardship.css" />
</head>
<body class="dashboard-body">
  <div class="dashboard-shell">
    ${dashboardNav(registration, "stewardship", base)}
    <main class="dashboard-main">
      <div class="page-header">
        <div>
          <h1>Stewardship</h1>
          <p style="color:var(--text-muted);margin:0">Subscription: <span style="color:${statusColor};font-weight:600">${statusLabel}</span> · <a href="/parish/stewardship/billing">Manage billing →</a></p>
        </div>
        <a href="/parish/stewardship/annual-meetings/new" class="btn btn-primary">+ New Annual Meeting Packet</a>
      </div>

      <section class="module-card">
        <div class="module-card-header">
          <h2>📋 Annual Meeting Packets</h2>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Title</th><th>Year</th><th>Meeting Date</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${meetingRows}</tbody>
        </table>
      </section>

      <!-- ── Giving Metrics (Stewardship Suite) ── -->
      <section class="module-card" id="giving-metrics-card">
        <div class="module-card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
          <h2>📊 Pledge &amp; Giving Metrics</h2>
          <div style="display:flex;align-items:center;gap:.75rem">
            <select id="giving-year-select" class="form-select" style="font-size:.85rem;padding:.3rem .6rem" onchange="loadGivingMetrics()">
              ${[0,1,2,3,4].map(n => {
                const y = new Date().getFullYear() - n;
                return `<option value="${y}">${y}</option>`;
              }).join("")}
            </select>
            <a href="/parish/stewardship/giving" class="btn btn-ghost" style="font-size:.82rem">Full Report →</a>
          </div>
        </div>

        <!-- KPI row -->
        <div id="giving-kpis" class="giving-kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem;margin:1rem 0">
          <div class="giving-kpi-skeleton" style="height:72px;border-radius:10px;background:var(--surface-3,rgba(255,255,255,.06));animation:giving-shimmer 1.4s infinite"></div>
          <div class="giving-kpi-skeleton" style="height:72px;border-radius:10px;background:var(--surface-3,rgba(255,255,255,.06));animation:giving-shimmer 1.4s infinite"></div>
          <div class="giving-kpi-skeleton" style="height:72px;border-radius:10px;background:var(--surface-3,rgba(255,255,255,.06));animation:giving-shimmer 1.4s infinite"></div>
          <div class="giving-kpi-skeleton" style="height:72px;border-radius:10px;background:var(--surface-3,rgba(255,255,255,.06));animation:giving-shimmer 1.4s infinite"></div>
        </div>

        <!-- Pledge progress bar -->
        <div id="giving-progress" style="margin-bottom:1rem"></div>

        <!-- Fund breakdown table -->
        <div id="giving-funds" style="overflow-x:auto"></div>

        <!-- Upgrade prompt (shown when feature not activated) -->
        <div id="giving-upgrade" style="display:none;text-align:center;padding:2rem 1rem;border:1px dashed var(--border);border-radius:12px;margin-top:.5rem">
          <p style="color:var(--text-muted);margin:0 0 1rem;font-size:.9rem">Giving Metrics requires the Stewardship Suite add-on.</p>
          <a href="/parish/stewardship/giving/activate" class="btn btn-primary" style="font-size:.85rem">Add Giving Metrics — $9/mo</a>
        </div>
      </section>

      <section class="module-card coming-soon-card">
        <h2 style="color:var(--text-muted)">Coming Soon</h2>
        <div class="coming-soon-grid">
          <div class="cs-item">📁 Document Vault</div>
          <div class="cs-item">📅 Compliance Calendar</div>
          <div class="cs-item">📋 Parish Council Records</div>
        </div>
      </section>
    </main>
  </div>

  <style>
    @keyframes giving-shimmer {
      0%   { opacity:.4 }
      50%  { opacity:.9 }
      100% { opacity:.4 }
    }
    .giving-kpi-card {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: .9rem 1rem;
    }
    .giving-kpi-label {
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .07em;
      color: var(--text-muted);
      margin-bottom: .3rem;
    }
    .giving-kpi-value {
      font-family: var(--font-serif, Georgia, serif);
      font-size: 1.55rem;
      font-weight: 600;
      color: var(--gold, #C49C50);
      line-height: 1;
    }
    .giving-kpi-sub { font-size: .72rem; color: var(--text-muted); margin-top: .25rem; }
    .giving-progress-track {
      background: rgba(255,255,255,.08);
      border-radius: 6px;
      height: 10px;
      overflow: hidden;
      margin: .35rem 0 .25rem;
    }
    .giving-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--gold,#C49C50) 0%, #DABB70 100%);
      border-radius: 6px;
      transition: width .5s ease;
    }
    .giving-fund-table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-top: .75rem; }
    .giving-fund-table th {
      font-size: .72rem; text-transform: uppercase; letter-spacing: .06em;
      color: var(--text-muted); text-align: left; padding: .4rem .5rem;
      border-bottom: 1px solid var(--border);
    }
    .giving-fund-table td { padding: .55rem .5rem; border-bottom: 1px solid rgba(255,255,255,.04); }
    .giving-fund-table tr:last-child td { border-bottom: none; }
    .giving-mini-bar { background: rgba(255,255,255,.07); border-radius:3px; height:5px; }
    .giving-mini-fill { height:100%; background:var(--gold,#C49C50); border-radius:3px; }
  </style>

  <script>
    (function() {
      var qs        = new URLSearchParams(window.location.search);
      var parishId  = qs.get("parishId") || "";
      var token     = qs.get("t") || "";
      var base      = "/api/parish/dashboard/" + encodeURIComponent(parishId);

      function fmt(cents) {
        return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      }

      function loadGivingMetrics() {
        var year = document.getElementById("giving-year-select").value;
        Promise.all([
          fetch(base + "/stewardship/giving/summary?year=" + year, { headers: { Authorization: "Bearer " + token } }).then(function(r){ return r.json(); }),
          fetch(base + "/stewardship/giving/funds?year=" + year,   { headers: { Authorization: "Bearer " + token } }).then(function(r){ return r.json(); })
        ]).then(function(results) {
          renderKpis(results[0]);
          renderProgress(results[0]);
          renderFunds(results[1]);
        }).catch(function(err) {
          // Check if 403 (not activated)
          fetch(base + "/stewardship/giving/summary?year=" + year, { headers: { Authorization: "Bearer " + token } })
            .then(function(r) {
              if (r.status === 403) {
                document.getElementById("giving-kpis").style.display = "none";
                document.getElementById("giving-progress").style.display = "none";
                document.getElementById("giving-funds").style.display = "none";
                document.getElementById("giving-upgrade").style.display = "";
              }
            });
        });
      }

      function renderKpis(s) {
        if (!s || s.error) {
          if (s && s.error && s.error.includes("not activated")) {
            document.getElementById("giving-kpis").style.display = "none";
            document.getElementById("giving-progress").style.display = "none";
            document.getElementById("giving-funds").style.display = "none";
            document.getElementById("giving-upgrade").style.display = "";
          }
          return;
        }
        var yoy = s.prior_year_actual_cents > 0
          ? Math.round(((s.total_actual_cents - s.prior_year_actual_cents) / s.prior_year_actual_cents) * 100)
          : null;
        var yoyHtml = yoy !== null
          ? "<span style='color:" + (yoy >= 0 ? "var(--green,#4ade80)" : "var(--red,#f87171)") + ";font-size:.72rem;font-weight:600'>" + (yoy >= 0 ? "▲" : "▼") + " " + Math.abs(yoy) + "% vs prior year</span>"
          : "";
        document.getElementById("giving-kpis").innerHTML =
          kpiCard("Total Collected", fmt(s.total_actual_cents), yoyHtml) +
          kpiCard("Total Pledged", fmt(s.total_pledged_cents), s.pledging_donors + " pledging donors") +
          kpiCard("Fulfillment", s.fulfillment_rate_pct !== null ? s.fulfillment_rate_pct + "%" : "—", "of pledge goal") +
          kpiCard("Avg / Donor", fmt(s.avg_per_donor_cents), s.active_donors + " active donors");
      }

      function kpiCard(label, value, sub) {
        return "<div class='giving-kpi-card'><div class='giving-kpi-label'>" + label + "</div><div class='giving-kpi-value'>" + value + "</div><div class='giving-kpi-sub'>" + sub + "</div></div>";
      }

      function renderProgress(s) {
        if (!s || s.error || !s.total_pledged_cents) { document.getElementById("giving-progress").innerHTML = ""; return; }
        var pct = Math.min(100, Math.round((s.total_actual_cents / s.total_pledged_cents) * 100));
        document.getElementById("giving-progress").innerHTML =
          "<div style='font-size:.78rem;color:var(--text-muted);margin-bottom:.25rem'>Collected vs pledge goal — " + pct + "% (" + fmt(s.total_actual_cents) + " of " + fmt(s.total_pledged_cents) + ")</div>" +
          "<div class='giving-progress-track'><div class='giving-progress-fill' style='width:" + pct + "%'></div></div>" +
          "<div style='font-size:.72rem;color:var(--text-muted)'>Projected year-end: " + fmt(s.run_rate_cents) + "</div>";
      }

      function renderFunds(f) {
        if (!f || f.error || !f.funds || !f.funds.length) { document.getElementById("giving-funds").innerHTML = ""; return; }
        var rows = f.funds.filter(function(x){ return x.total_cents > 0; }).map(function(fund) {
          return "<tr><td>" + escH(fund.fund_name) + "</td><td style='text-align:right;color:var(--gold,#C49C50)'>" + fmt(fund.total_cents) + "</td><td style='text-align:right;color:var(--text-muted)'>" + fund.pct_of_total + "%</td><td style='width:80px'><div class='giving-mini-bar'><div class='giving-mini-fill' style='width:" + fund.pct_of_total + "%'></div></div></td></tr>";
        }).join("");
        if (!rows) { document.getElementById("giving-funds").innerHTML = ""; return; }
        document.getElementById("giving-funds").innerHTML =
          "<table class='giving-fund-table'><thead><tr><th>Fund</th><th style='text-align:right'>Total</th><th style='text-align:right'>%</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>";
      }

      function escH(s) {
        return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      }

      // Kick off load
      loadGivingMetrics();
    })();
  </script>

  ${stewardshipSessionScript()}
</body>
</html>`;
}

// ─── Billing page ─────────────────────────────────────────────────────────────

function billingHtml(registration, subscription, env) {
  const base = absoluteWebsiteUrl(env);
  const status = stewardshipStatus(registration);
  const periodEnd = registration.stewardshipPeriodEnd
    ? new Date(registration.stewardshipPeriodEnd * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Stewardship Billing — AGAPAY</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <link rel="stylesheet" href="${base}/styles/stewardship.css" />
</head>
<body class="dashboard-body">
  <div class="dashboard-shell">
    ${dashboardNav(registration, "stewardship", base)}
    <main class="dashboard-main">
      <div class="page-header">
        <div>
          <h1>Stewardship Billing</h1>
          <p style="color:var(--text-muted);margin:0"><a href="/parish/stewardship">← Back to Stewardship</a></p>
        </div>
      </div>

      <div class="module-card" style="max-width:520px">
        <table class="info-table">
          <tr><th>Plan</th><td>AGAPAY Stewardship</td></tr>
          <tr><th>Status</th><td><strong>${escHtml(status)}</strong></td></tr>
          <tr><th>Renewal Date</th><td>${periodEnd}</td></tr>
          ${registration.stewardshipCancelAtPeriodEnd ? `<tr><th></th><td style="color:var(--red,#f87171)">Cancels at end of period</td></tr>` : ""}
        </table>

        ${hasStewardshipAccess(registration) ? `
        <div style="margin-top:1.5rem">
          <form method="POST" action="/parish/stewardship/billing-portal">
            <button type="submit" class="btn btn-secondary">Manage Billing in Stripe →</button>
          </form>
        </div>` : `
        <div style="margin-top:1.5rem">
          <a href="/parish/stewardship" class="btn btn-primary">Subscribe to Stewardship →</a>
        </div>`}
      </div>
    </main>
  </div>
  ${stewardshipSessionScript()}
</body>
</html>`;
}

// ─── Annual meeting list / new / edit ─────────────────────────────────────────

function annualMeetingFormHtml(registration, meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions, env) {
  const base = absoluteWebsiteUrl(env);
  const isNew = !meeting;
  const title = isNew ? "New Annual Meeting Packet" : `Edit: ${meeting.title}`;
  const action = isNew ? "/parish/stewardship/annual-meetings/new" : `/parish/stewardship/annual-meetings/${meeting.id}`;
  const parishName = registration.parishName || registration.name || "";
  const currentYear = new Date().getFullYear();

  const agendaHtml = (agendaItems || []).map((item, i) => `
    <div class="agenda-row" data-index="${i}">
      <input type="hidden" name="agenda_id[]" value="${escAttr(item.id || "")}" />
      <input class="form-input" type="text" name="agenda_title[]" value="${escAttr(item.title)}" placeholder="Agenda item" required />
      <input class="form-input" type="number" name="agenda_duration[]" value="${item.duration_minutes || ""}" placeholder="Min" style="width:80px" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`).join("");

  const reportsHtml = (reports || []).map((r, i) => `
    <div class="report-row">
      <input type="hidden" name="report_id[]" value="${escAttr(r.id || "")}" />
      <select name="report_type[]" class="form-select">
        ${["priest","warden","treasurer","stewardship","ministry","custom"].map(t =>
          `<option value="${t}"${r.report_type === t ? " selected" : ""}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
        ).join("")}
      </select>
      <input class="form-input" type="text" name="report_title[]" value="${escAttr(r.title)}" placeholder="Report title" required />
      <textarea class="form-textarea" name="report_body[]" rows="4" placeholder="Report content…">${escHtml(r.body || "")}</textarea>
      <input class="form-input" type="text" name="report_signed_by[]" value="${escAttr(r.created_by || "")}" placeholder="Signed by (optional)" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`).join("");

  const fundsHtml = (restrictedFunds || []).map((f, i) => `
    <div class="fund-row">
      <input type="hidden" name="fund_id[]" value="${escAttr(f.id || "")}" />
      <input class="form-input" type="text" name="fund_name[]" value="${escAttr(f.fund_name || "")}" placeholder="Fund name" required />
      <input class="form-input" type="number" name="fund_begin[]" value="${centsToDisplay(f.beginning_balance_cents)}" placeholder="Beginning" step="0.01" />
      <input class="form-input" type="number" name="fund_received[]" value="${centsToDisplay(f.total_received_cents)}" placeholder="Received" step="0.01" />
      <input class="form-input" type="number" name="fund_disbursed[]" value="${centsToDisplay(f.total_disbursed_cents)}" placeholder="Disbursed" step="0.01" />
      <input class="form-input" type="number" name="fund_ending[]" value="${centsToDisplay(f.ending_balance_cents)}" placeholder="Ending" step="0.01" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`).join("");

  const nomineesHtml = (nominees || []).map((n, i) => `
    <div class="nominee-row">
      <input type="hidden" name="nominee_id[]" value="${escAttr(n.id || "")}" />
      <input class="form-input" type="text" name="nominee_name[]" value="${escAttr(n.full_name || "")}" placeholder="Full name" required />
      <input class="form-input" type="text" name="nominee_position[]" value="${escAttr(n.position || "")}" placeholder="Position (e.g. Warden)" />
      <textarea class="form-textarea" name="nominee_bio[]" rows="2" placeholder="Short bio (optional)">${escHtml(n.bio || "")}</textarea>
      <input class="form-input" type="text" name="nominee_nominated_by[]" value="${escAttr(n.nominated_by || "")}" placeholder="Nominated by (optional)" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`).join("");

  const resolutionsHtml = (resolutions || []).map((r, i) => `
    <div class="resolution-row">
      <input type="hidden" name="resolution_id[]" value="${escAttr(r.id || "")}" />
      <input class="form-input" type="text" name="resolution_title[]" value="${escAttr(r.title || "")}" placeholder="Resolution title" required />
      <textarea class="form-textarea" name="resolution_resolved[]" rows="2" placeholder="RESOLVED THAT…">${escHtml(r.resolved_text || "")}</textarea>
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)} — AGAPAY</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <link rel="stylesheet" href="${base}/styles/stewardship.css" />
</head>
<body class="dashboard-body">
  <div class="dashboard-shell">
    ${dashboardNav(registration, "stewardship", base)}
    <main class="dashboard-main">
      <div class="page-header">
        <div>
          <h1>${escHtml(title)}</h1>
          <p style="color:var(--text-muted);margin:0"><a href="/parish/stewardship">← Back to Stewardship</a></p>
        </div>
        ${!isNew ? `<div style="display:flex;gap:.75rem">
          <a href="/parish/stewardship/annual-meetings/${meeting.id}/preview" class="btn btn-secondary">Preview</a>
          <a href="/parish/stewardship/annual-meetings/${meeting.id}/pdf" class="btn btn-ghost" target="_blank">Download PDF</a>
        </div>` : ""}
      </div>

      <form method="POST" action="${action}" class="stewardship-form">
        <!-- SECTION: Meeting Details -->
        <section class="form-section">
          <h2>Meeting Details</h2>
          <div class="form-grid">
            <label class="form-field">
              <span>Packet Title</span>
              <input class="form-input" type="text" name="title" value="${escAttr(meeting?.title || parishName + " Annual Parish Meeting")}" required />
            </label>
            <label class="form-field">
              <span>Fiscal Year</span>
              <input class="form-input" type="number" name="fiscal_year" value="${meeting?.fiscal_year || currentYear}" min="2000" max="2100" required />
            </label>
            <label class="form-field">
              <span>Meeting Date</span>
              <input class="form-input" type="date" name="meeting_date" value="${escAttr(meeting?.meeting_date || "")}" />
            </label>
            <label class="form-field">
              <span>Meeting Time</span>
              <input class="form-input" type="time" name="meeting_time" value="${escAttr(meeting?.meeting_time || "")}" />
            </label>
            <label class="form-field form-field--full">
              <span>Location</span>
              <input class="form-input" type="text" name="location" value="${escAttr(meeting?.location || (isNew && parishName ? `${parishName} Parish Hall` : ""))}" placeholder="e.g. Parish Hall" />
            </label>
          </div>
        </section>

        <!-- SECTION: Parish Information (auto-filled, editable) -->
        <section class="form-section">
          <h2>Parish Information</h2>
          <p class="section-note">Auto-filled from your parish profile. Edit here to override for this packet.</p>
          <div class="form-grid">
            <label class="form-field">
              <span>Parish Name</span>
              <input class="form-input" type="text" name="parish_name_override" value="${escAttr(meeting?.parish_name_override || parishName)}" />
            </label>
            <label class="form-field">
              <span>Jurisdiction / Diocese</span>
              <input class="form-input" type="text" name="jurisdiction" value="${escAttr(meeting?.jurisdiction || registration.jurisdiction || "")}" />
            </label>
            <label class="form-field form-field--full">
              <span>Address</span>
              <input class="form-input" type="text" name="address" value="${escAttr(meeting?.address || registrationAddressLine(registration) || "")}" />
            </label>
          </div>
        </section>

        <!-- SECTION: Agenda -->
        <section class="form-section">
          <h2>Agenda</h2>
          <div id="agenda-items">${agendaHtml}</div>
          <button type="button" class="btn btn-ghost btn-sm add-row" data-target="agenda-items" data-template="agenda">+ Add Agenda Item</button>
        </section>

        <!-- SECTION: Reports -->
        <section class="form-section">
          <h2>Reports</h2>
          <div id="reports-list">${reportsHtml}</div>
          <button type="button" class="btn btn-ghost btn-sm add-row" data-target="reports-list" data-template="report">+ Add Report</button>
        </section>

        <!-- SECTION: Financial Summary -->
        <section class="form-section">
          <h2>Financial Summary</h2>
          <div class="form-grid">
            <label class="form-field">
              <span>Total Income</span>
              <div class="input-prefix-wrap"><span class="input-prefix">$</span>
              <input class="form-input" type="number" name="fin_income" value="${centsToDisplay(financialSummary?.total_income_cents)}" step="0.01" placeholder="0.00" /></div>
            </label>
            <label class="form-field">
              <span>Total Expenses</span>
              <div class="input-prefix-wrap"><span class="input-prefix">$</span>
              <input class="form-input" type="number" name="fin_expense" value="${centsToDisplay(financialSummary?.total_expense_cents)}" step="0.01" placeholder="0.00" /></div>
            </label>
            <label class="form-field form-field--full">
              <span>Notes</span>
              <textarea class="form-textarea" name="fin_notes" rows="3" placeholder="Budget notes, audit status, etc.">${escHtml(financialSummary?.notes || "")}</textarea>
            </label>
          </div>
        </section>

        <!-- SECTION: Restricted Funds -->
        <section class="form-section">
          <h2>Restricted Funds</h2>
          <p class="section-note">Historical snapshot — changes to live fund data will not affect this packet.</p>
          <div class="restricted-funds-header form-grid-5">
            <span>Fund Name</span><span>Beginning</span><span>Received</span><span>Disbursed</span><span>Ending</span>
          </div>
          <div id="funds-list">${fundsHtml}</div>
          <button type="button" class="btn btn-ghost btn-sm add-row" data-target="funds-list" data-template="fund">+ Add Fund</button>
        </section>

        <!-- SECTION: Nominations -->
        <section class="form-section">
          <h2>Nominations</h2>
          <div id="nominees-list">${nomineesHtml}</div>
          <button type="button" class="btn btn-ghost btn-sm add-row" data-target="nominees-list" data-template="nominee">+ Add Nominee</button>
        </section>

        <!-- SECTION: Resolutions -->
        <section class="form-section">
          <h2>Proposed Resolutions</h2>
          <div id="resolutions-list">${resolutionsHtml}</div>
          <button type="button" class="btn btn-ghost btn-sm add-row" data-target="resolutions-list" data-template="resolution">+ Add Resolution</button>
        </section>

        <div class="form-actions">
          <button type="submit" name="action" value="save" class="btn btn-primary">Save Draft</button>
          <button type="submit" name="action" value="ready" class="btn btn-secondary">Mark Ready</button>
          <a href="/parish/stewardship" class="btn btn-ghost">Cancel</a>
        </div>
      </form>
    </main>
  </div>

  <script>
    // Dynamic add-row buttons
    const TEMPLATES = {
      agenda: () => \`<div class="agenda-row"><input type="hidden" name="agenda_id[]" value="" /><input class="form-input" type="text" name="agenda_title[]" placeholder="Agenda item" required /><input class="form-input" type="number" name="agenda_duration[]" placeholder="Min" style="width:80px" /><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
      report: () => \`<div class="report-row"><input type="hidden" name="report_id[]" value="" /><select name="report_type[]" class="form-select"><option>priest</option><option>warden</option><option>treasurer</option><option>stewardship</option><option>ministry</option><option>custom</option></select><input class="form-input" type="text" name="report_title[]" placeholder="Report title" required /><textarea class="form-textarea" name="report_body[]" rows="4" placeholder="Report content…"></textarea><input class="form-input" type="text" name="report_signed_by[]" placeholder="Signed by (optional)" /><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
      fund: () => \`<div class="fund-row"><input type="hidden" name="fund_id[]" value="" /><input class="form-input" type="text" name="fund_name[]" placeholder="Fund name" required /><input class="form-input" type="number" name="fund_begin[]" placeholder="Beginning" step="0.01" /><input class="form-input" type="number" name="fund_received[]" placeholder="Received" step="0.01" /><input class="form-input" type="number" name="fund_disbursed[]" placeholder="Disbursed" step="0.01" /><input class="form-input" type="number" name="fund_ending[]" placeholder="Ending" step="0.01" /><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
      nominee: () => \`<div class="nominee-row"><input type="hidden" name="nominee_id[]" value="" /><input class="form-input" type="text" name="nominee_name[]" placeholder="Full name" required /><input class="form-input" type="text" name="nominee_position[]" placeholder="Position" /><textarea class="form-textarea" name="nominee_bio[]" rows="2" placeholder="Short bio (optional)"></textarea><input class="form-input" type="text" name="nominee_nominated_by[]" placeholder="Nominated by (optional)" /><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
      resolution: () => \`<div class="resolution-row"><input type="hidden" name="resolution_id[]" value="" /><input class="form-input" type="text" name="resolution_title[]" placeholder="Resolution title" required /><textarea class="form-textarea" name="resolution_resolved[]" rows="2" placeholder="RESOLVED THAT…"></textarea><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
    };
    document.addEventListener('click', e => {
      if (e.target.matches('.add-row')) {
        const tmpl = e.target.dataset.template;
        const target = document.getElementById(e.target.dataset.target);
        target.insertAdjacentHTML('beforeend', TEMPLATES[tmpl]());
      }
      if (e.target.matches('.remove-row')) {
        e.target.closest('[class$="-row"]')?.remove();
      }
    });
  </script>
  ${stewardshipSessionScript()}
</body>
</html>`;
}

// ─── Preview / PDF ────────────────────────────────────────────────────────────

function packetPreviewHtml(registration, meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions, isPdf, env) {
  // A meeting saved before its Financial Summary section was filled in has no
  // row in stewardship_financial_summaries at all — d1First then returns null
  // rather than an empty object, which crashed every property access below.
  financialSummary = financialSummary || {};
  const base         = absoluteWebsiteUrl(env);
  const parishName   = meeting.parish_name_override || registration.parishName || registration.name || "Parish";
  const jurisdiction = meeting.jurisdiction || registration.jurisdiction || "";
  const address      = meeting.address || registrationAddressLine(registration) || "";
  const location     = meeting.location || "";
  const fiscalYear   = meeting.fiscal_year || new Date().getFullYear();
  const meetingDate  = meeting.meeting_date
    ? new Date(meeting.meeting_date + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
    : "Date TBD";
  const meetingTime  = meeting.meeting_time
    ? new Date("2000-01-01T" + meeting.meeting_time).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" })
    : "";

  const fmt = (cents) => cents
    ? "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "$0.00";

  // ── Sections ──────────────────────────────────────────────────────────────

  const noticeSection = `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Notice</span></div>
      <h2 class="pk-section-heading">Notice of Annual Parish Meeting</h2>
      <p class="pk-body">Notice is hereby given that the Annual Parish Meeting of <strong>${escHtml(parishName)}</strong> will be held on <strong>${meetingDate}</strong>${meetingTime ? " at " + meetingTime : ""}${location ? " at " + escHtml(location) : ""}.</p>
      <p class="pk-body">The purpose of the meeting is to receive annual reports, review the financial statement, elect parish council members, consider resolutions, and transact such other business as may properly come before the meeting.</p>
      <p class="pk-body pk-body--muted">In the name of the Father, and of the Son, and of the Holy Spirit.</p>
    </section>`;

  const agendaSection = agendaItems?.length ? `
    <section class="pk-section">
      <div class="pk-section-rule"><span>Order of Business</span></div>
      <h2 class="pk-section-heading">Agenda</h2>
      <ol class="pk-agenda">
        ${agendaItems.map(item => `
          <li class="pk-agenda-item">
            <span class="pk-agenda-title">${escHtml(item.title)}</span>
            ${item.duration_minutes ? `<span class="pk-agenda-dur">${item.duration_minutes}&thinsp;min</span>` : ""}
          </li>`).join("")}
      </ol>
    </section>` : "";

  const reportsSection = reports?.length ? `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Reports</span></div>
      ${reports.map((r, i) => `
        <div class="pk-report${i > 0 ? " pk-report--border" : ""}">
          <h2 class="pk-report-heading">${escHtml(r.title)}</h2>
          <div class="pk-report-body">
            ${r.body
              ? r.body.split(/\n+/).filter(p => p.trim()).map(p => `<p class="pk-body">${escHtml(p)}</p>`).join("")
              : `<p class="pk-body pk-body--placeholder">[Report content will appear here.]</p>`}
          </div>
          ${r.created_by ? `<p class="pk-report-sig">${escHtml(r.created_by)}</p>` : ""}
        </div>`).join("")}
    </section>` : "";

  const finSection = financialSummary ? (() => {
    const income  = financialSummary.total_income_cents  || 0;
    const expense = financialSummary.total_expense_cents || 0;
    const net     = financialSummary.net_cents ?? (income - expense);
    const netSign = net >= 0 ? "surplus" : "deficit";
    return `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Financials</span></div>
      <h2 class="pk-section-heading">Financial Summary &mdash; Fiscal Year ${fiscalYear}</h2>
      <table class="pk-fin-table">
        <tbody>
          <tr class="pk-fin-row">
            <th class="pk-fin-label">Total Income</th>
            <td class="pk-fin-value pk-fin-income">${fmt(income)}</td>
          </tr>
          <tr class="pk-fin-row">
            <th class="pk-fin-label">Total Expenses</th>
            <td class="pk-fin-value pk-fin-expense">${fmt(expense)}</td>
          </tr>
          <tr class="pk-fin-row pk-fin-net">
            <th class="pk-fin-label">Net ${net >= 0 ? "Surplus" : "Deficit"}</th>
            <td class="pk-fin-value pk-fin-net-${netSign}">${fmt(Math.abs(net))}</td>
          </tr>
        </tbody>
      </table>
      ${financialSummary.notes ? `<p class="pk-body pk-fin-notes">${escHtml(financialSummary.notes)}</p>` : ""}
    </section>`;
  })() : "";

  const fundsSection = restrictedFunds?.length ? `
    <section class="pk-section">
      <div class="pk-section-rule"><span>Restricted Funds</span></div>
      <h2 class="pk-section-heading">Restricted Fund Report</h2>
      <div class="pk-table-wrap">
        <table class="pk-table">
          <thead>
            <tr>
              <th class="pk-th">Fund</th>
              <th class="pk-th pk-th-right">Beginning</th>
              <th class="pk-th pk-th-right">Received</th>
              <th class="pk-th pk-th-right">Disbursed</th>
              <th class="pk-th pk-th-right">Ending</th>
            </tr>
          </thead>
          <tbody>
            ${restrictedFunds.map(f => `
              <tr class="pk-tr">
                <td class="pk-td pk-fund-name">${escHtml(f.fund_name)}</td>
                <td class="pk-td pk-td-right">${fmt(f.beginning_balance_cents)}</td>
                <td class="pk-td pk-td-right pk-fin-income">${fmt(f.total_received_cents)}</td>
                <td class="pk-td pk-td-right pk-fin-expense">${fmt(f.total_disbursed_cents)}</td>
                <td class="pk-td pk-td-right pk-fin-net-surplus">${fmt(f.ending_balance_cents)}</td>
              </tr>
              ${f.notes ? `<tr class="pk-tr pk-tr-notes"><td colspan="5" class="pk-td pk-td-notes">${escHtml(f.notes)}</td></tr>` : ""}`).join("")}
          </tbody>
        </table>
      </div>
    </section>` : "";

  const nomineesSection = nominees?.length ? `
    <section class="pk-section">
      <div class="pk-section-rule"><span>Elections</span></div>
      <h2 class="pk-section-heading">Parish Council Nominations</h2>
      <div class="pk-nominees">
        ${nominees.map(n => `
          <div class="pk-nominee">
            <strong class="pk-nominee-name">${escHtml(n.full_name)}</strong>
            ${n.position ? `<span class="pk-nominee-role">${escHtml(n.position)}</span>` : ""}
            ${n.bio     ? `<p class="pk-nominee-bio">${escHtml(n.bio)}</p>` : ""}
            ${n.nominated_by ? `<p class="pk-nominee-meta">Nominated by ${escHtml(n.nominated_by)}</p>` : ""}
          </div>`).join("")}
      </div>
    </section>` : "";

  const resolutionsSection = resolutions?.length ? `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Resolutions</span></div>
      <h2 class="pk-section-heading">Proposed Resolutions</h2>
      ${resolutions.map((r, i) => `
        <div class="pk-resolution">
          <h3 class="pk-resolution-title">Resolution ${i + 1}${r.title ? ": " + escHtml(r.title) : ""}</h3>
          ${r.body ? `<div class="pk-resolution-body">${r.body.split(/\n+/).filter(Boolean).map(p => `<p class="pk-body">${escHtml(p)}</p>`).join("")}</div>` : ""}
          ${r.resolved_text ? `<blockquote class="pk-resolved">RESOLVED, THAT ${escHtml(r.resolved_text)}</blockquote>` : ""}
        </div>`).join("")}
    </section>` : "";

  const signinSection = `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Sign-In</span></div>
      <h2 class="pk-section-heading">Meeting Sign-In Sheet</h2>
      <p class="pk-body pk-body--muted">Please print and bring to the annual meeting.</p>
      <div class="pk-table-wrap">
        <table class="pk-table pk-signin-table">
          <thead><tr><th class="pk-th pk-th-num">#</th><th class="pk-th">Name (Print)</th><th class="pk-th">Signature</th><th class="pk-th">Email</th></tr></thead>
          <tbody>
            ${Array.from({length: 24}, (_, i) => `<tr class="pk-tr pk-signin-row"><td class="pk-td pk-td-num">${i + 1}</td><td class="pk-td"></td><td class="pk-td"></td><td class="pk-td"></td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;

  const minutesSection = `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Minutes</span></div>
      <h2 class="pk-section-heading">Minutes Template</h2>
      <p class="pk-body"><strong>Minutes of the Annual Meeting of ${escHtml(parishName)}</strong></p>
      <p class="pk-body">Date: ${meetingDate}&ensp;&ensp;Location: ${escHtml(location || "[Location]")}</p>
      <p class="pk-body">The meeting was called to order at _____________. Members present: _____________.</p>
      <p class="pk-body">The Rector opened the meeting in prayer.</p>
      <div class="pk-minutes-lines">
        ${Array.from({length: 12}, () => '<div class="pk-minutes-line"></div>').join("")}
      </div>
      <div class="pk-sig-block">
        <div class="pk-sig-line"><div class="pk-sig-under"></div><span>President / Chair</span></div>
        <div class="pk-sig-line"><div class="pk-sig-under"></div><span>Recording Secretary</span></div>
        <div class="pk-sig-line"><div class="pk-sig-under"></div><span>Date</span></div>
      </div>
    </section>`;

  // ── Toolbar (preview only) ────────────────────────────────────────────────
  const toolbar = isPdf ? "" : `
    <div class="pk-toolbar" data-no-print>
      <a href="javascript:history.back()" class="pk-toolbar-btn pk-toolbar-back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="10 3 5 8 10 13"/></svg>
        Back to editor
      </a>
      <div class="pk-toolbar-actions">
        <button class="pk-toolbar-btn" onclick="window.print()">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="10" height="4" rx="1"/><rect x="3" y="9" width="10" height="5" rx="1"/><line x1="5" y1="11" x2="11" y2="11"/><line x1="5" y1="13" x2="9" y2="13"/></svg>
          Print
        </button>
        <a class="pk-toolbar-btn pk-toolbar-primary" href="/parish/stewardship/annual-meetings/${escAttr(meeting.id)}/pdf" target="_blank">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12l2 2 7-9"/><line x1="8" y1="2" x2="8" y2="10"/><polyline points="5 7 8 10 11 7"/></svg>
          Download PDF
        </a>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(meeting.title || parishName + " Annual Meeting")} &mdash; AGAPAY Stewardship</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Tokens ── */
    :root {
      --pk-navy:   #061522;
      --pk-navy2:  #0b2130;
      --pk-gold:   #b18a3e;
      --pk-gold-l: #c8a24a;
      --pk-cream:  #f6f1e8;
      --pk-paper:  #fffdf8;
      --pk-ink:    #171715;
      --pk-muted:  #6f6a60;
      --pk-line:   #ddd5c5;
      --pk-red:    #8a2929;
      --pk-green:  #2e6b4a;
      --pk-serif:  "Cormorant Garamond", Georgia, serif;
      --pk-sans:   "DM Sans", system-ui, sans-serif;
    }

    /* ── Page ── */
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      background: var(--pk-cream);
      color: var(--pk-ink);
      font-family: var(--pk-sans);
      font-size: 14px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    @media print {
      body { background: white; font-size: 11px; }
      [data-no-print] { display: none !important; }
      .pk-page-break { page-break-before: always; }
    }

    /* ── Toolbar ── */
    .pk-toolbar {
      position: sticky;
      top: 0;
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: .75rem 1.5rem;
      border-bottom: 1px solid var(--pk-line);
      background: rgba(246,241,232,0.94);
      backdrop-filter: blur(10px);
    }
    .pk-toolbar-actions { display: flex; gap: .5rem; }
    .pk-toolbar-btn {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      height: 36px;
      padding: 0 .9rem;
      border: 1px solid var(--pk-line);
      border-radius: 6px;
      background: white;
      color: var(--pk-ink);
      cursor: pointer;
      font: 500 .8rem var(--pk-sans);
      text-decoration: none;
      transition: border-color .15s;
    }
    .pk-toolbar-btn svg { width: 14px; height: 14px; }
    .pk-toolbar-btn:hover { border-color: var(--pk-gold); }
    .pk-toolbar-back { color: var(--pk-muted); }
    .pk-toolbar-primary {
      border-color: var(--pk-gold);
      background: var(--pk-gold);
      color: white;
      font-weight: 600;
    }
    .pk-toolbar-primary:hover { background: var(--pk-navy); border-color: var(--pk-navy); color: var(--pk-cream); }

    /* ── Packet container ── */
    .pk-container {
      max-width: 820px;
      margin: 0 auto;
      padding: 2rem 2rem 4rem;
    }
    @media (max-width: 640px) { .pk-container { padding: 1rem 1rem 3rem; } }

    /* ── Cover page ── */
    .pk-cover {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      padding: 4rem 2rem;
      text-align: center;
      border: 1px solid rgba(177,138,62,.3);
      border-radius: 4px;
      margin-bottom: 3rem;
      background:
        radial-gradient(ellipse 70% 50% at 50% -10%, rgba(177,138,62,.18), transparent),
        linear-gradient(180deg, var(--pk-navy), var(--pk-navy2));
      color: var(--pk-cream);
    }
    @media print { .pk-cover { min-height: 100vh; margin-bottom: 0; } }
    .pk-cover-cross {
      width: 44px;
      height: 55px;
      margin-bottom: 2.5rem;
      display: block;
    }
    .pk-cover-jurisdiction {
      font-size: .72rem;
      font-weight: 600;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: rgba(246,241,232,.65);
      margin-bottom: 1.1rem;
    }
    .pk-cover-parish {
      font-family: var(--pk-serif);
      font-size: clamp(2.4rem, 6vw, 4rem);
      font-weight: 500;
      line-height: 1;
      margin-bottom: 1.5rem;
    }
    .pk-cover-rule {
      width: 48px;
      height: 1px;
      background: rgba(177,138,62,.55);
      margin: 0 auto 1.5rem;
    }
    .pk-cover-title {
      font-family: var(--pk-serif);
      font-size: clamp(1.4rem, 3.5vw, 2rem);
      font-weight: 400;
      font-style: italic;
      color: rgba(246,241,232,.88);
      margin-bottom: .5rem;
    }
    .pk-cover-year {
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--pk-gold-l);
      margin-bottom: 2rem;
    }
    .pk-cover-details {
      font-size: .85rem;
      color: rgba(246,241,232,.72);
      line-height: 1.8;
    }
    .pk-cover-agapay {
      margin-top: 3rem;
      font-size: .65rem;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: rgba(246,241,232,.34);
    }

    /* ── Sections ── */
    .pk-section { margin-bottom: 2.5rem; }
    .pk-section-rule {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin-bottom: 1.25rem;
    }
    .pk-section-rule::before,
    .pk-section-rule::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--pk-line);
    }
    .pk-section-rule span {
      color: var(--pk-gold);
      font-size: .65rem;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .pk-section-heading {
      font-family: var(--pk-serif);
      font-size: 1.75rem;
      font-weight: 500;
      color: var(--pk-navy);
      margin-bottom: .9rem;
      line-height: 1.1;
    }

    /* ── Body text ── */
    .pk-body { margin-bottom: .65rem; }
    .pk-body--muted { color: var(--pk-muted); font-style: italic; }
    .pk-body--placeholder { color: var(--pk-muted); font-style: italic; }

    /* ── Agenda ── */
    .pk-agenda { list-style: none; counter-reset: agenda; }
    .pk-agenda-item {
      counter-increment: agenda;
      display: grid;
      grid-template-columns: 2rem 1fr auto;
      align-items: baseline;
      gap: .5rem;
      padding: .6rem 0;
      border-bottom: 1px solid var(--pk-line);
    }
    .pk-agenda-item::before {
      content: counter(agenda) ".";
      font-family: var(--pk-serif);
      font-size: 1rem;
      color: var(--pk-gold);
    }
    .pk-agenda-title { font-weight: 500; }
    .pk-agenda-dur { font-size: .78rem; color: var(--pk-muted); white-space: nowrap; }

    /* ── Reports ── */
    .pk-report { margin-bottom: 2rem; }
    .pk-report--border { padding-top: 1.5rem; border-top: 1px solid var(--pk-line); }
    .pk-report-heading {
      font-family: var(--pk-serif);
      font-size: 1.45rem;
      font-weight: 500;
      color: var(--pk-navy);
      margin-bottom: .65rem;
    }
    .pk-report-sig {
      margin-top: 1rem;
      padding-top: .5rem;
      border-top: 1px solid var(--pk-line);
      color: var(--pk-muted);
      font-size: .82rem;
    }

    /* ── Financial table ── */
    .pk-fin-table { width: 100%; border-collapse: collapse; margin-bottom: .75rem; }
    .pk-fin-row { border-bottom: 1px solid var(--pk-line); }
    .pk-fin-label {
      padding: .75rem 0;
      text-align: left;
      font-weight: 500;
      color: var(--pk-muted);
      font-size: .88rem;
    }
    .pk-fin-value {
      padding: .75rem 0;
      text-align: right;
      font-family: var(--pk-serif);
      font-size: 1.3rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .pk-fin-net .pk-fin-label,
    .pk-fin-net .pk-fin-value { font-weight: 700; font-size: 1.05rem; border-top: 2px solid var(--pk-line); }
    .pk-fin-income { color: var(--pk-green); }
    .pk-fin-expense { color: var(--pk-red); }
    .pk-fin-net-surplus { color: var(--pk-green); }
    .pk-fin-net-deficit { color: var(--pk-red); }
    .pk-fin-notes { color: var(--pk-muted); font-size: .88rem; font-style: italic; }

    /* ── Generic table ── */
    .pk-table-wrap { overflow-x: auto; }
    .pk-table { width: 100%; border-collapse: collapse; min-width: 480px; }
    .pk-th {
      padding: .5rem .75rem;
      border-bottom: 2px solid var(--pk-line);
      text-align: left;
      font-size: .7rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--pk-muted);
    }
    .pk-th-right, .pk-td-right { text-align: right; }
    .pk-th-num, .pk-td-num { text-align: center; width: 2.5rem; }
    .pk-tr { border-bottom: 1px solid var(--pk-line); }
    .pk-tr-notes td { background: rgba(246,241,232,.6); }
    .pk-td { padding: .65rem .75rem; vertical-align: top; font-size: .9rem; }
    .pk-td-notes { font-size: .8rem; color: var(--pk-muted); font-style: italic; padding: .3rem .75rem .6rem; }
    .pk-fund-name { font-weight: 500; }

    /* ── Nominees ── */
    .pk-nominees { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .pk-nominee {
      padding: 1rem;
      border: 1px solid var(--pk-line);
      border-radius: 6px;
      background: var(--pk-paper);
    }
    .pk-nominee-name { display: block; font-family: var(--pk-serif); font-size: 1.25rem; font-weight: 500; margin-bottom: .2rem; }
    .pk-nominee-role { display: block; font-size: .8rem; font-weight: 600; color: var(--pk-gold); text-transform: uppercase; letter-spacing: .08em; margin-bottom: .4rem; }
    .pk-nominee-bio { font-size: .88rem; color: var(--pk-muted); margin-top: .4rem; }
    .pk-nominee-meta { font-size: .78rem; color: var(--pk-muted); margin-top: .35rem; }

    /* ── Resolutions ── */
    .pk-resolution { margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--pk-line); }
    .pk-resolution:last-child { border-bottom: none; }
    .pk-resolution-title {
      font-family: var(--pk-serif);
      font-size: 1.2rem;
      font-weight: 500;
      color: var(--pk-navy);
      margin-bottom: .5rem;
    }
    .pk-resolved {
      margin-top: .75rem;
      padding: .75rem 1rem;
      border-left: 3px solid var(--pk-gold);
      background: rgba(177,138,62,.06);
      font-style: italic;
      font-size: .92rem;
      color: var(--pk-navy);
      border-radius: 0 4px 4px 0;
    }

    /* ── Sign-in sheet ── */
    .pk-signin-table { min-width: 560px; }
    .pk-signin-row td { height: 2.4rem; }

    /* ── Minutes template ── */
    .pk-minutes-lines { margin: 1.5rem 0; }
    .pk-minutes-line { height: 2rem; border-bottom: 1px solid var(--pk-line); margin-bottom: .1rem; }
    .pk-sig-block { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 2.5rem; }
    .pk-sig-line { display: flex; flex-direction: column; gap: .3rem; }
    .pk-sig-under { height: 1px; background: var(--pk-ink); }
    .pk-sig-line span { font-size: .72rem; color: var(--pk-muted); }

    /* ── Footer ── */
    .pk-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--pk-line);
      text-align: center;
      color: var(--pk-muted);
      font-size: .72rem;
    }
  </style>
</head>
<body>
  ${toolbar}
  <div class="pk-container">

    <!-- ── Cover ── -->
    <div class="pk-cover${isPdf ? " pk-page-break" : ""}">
      <svg class="pk-cover-cross" viewBox="0 0 240 300" role="img" aria-label="Gold Orthodox budded cross" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pkCrossGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f7e7b4"/>
            <stop offset="0.48" stop-color="#b78b32"/>
            <stop offset="1" stop-color="#6e4c14"/>
          </linearGradient>
          <filter id="pkCrossShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#4c330d" flood-opacity="0.22"/>
          </filter>
        </defs>
        <path
          d="m 120,6.5 c -10.67737,0 -19.33309,8.65572 -19.33309,19.33309 0,3.59159 0.96899,6.96328 2.67524,9.84489 -10.67736,0 -19.33308,8.65572 -19.33308,19.3331 0,9.1766 6.4058,16.8551 14.98136,18.8337 l 0,14.4106 -25.46831,0 C 71.54356,79.67988 63.86503,73.27408 54.68841,73.27408 c -10.67736,0 -19.33308,8.6557 -19.33308,19.3331 -2.88161,-1.7063 -6.2533,-2.6753 -9.84489,-2.6753 -10.67737,0 -19.33309,8.6557 -19.33309,19.3331 0,10.6774 8.65572,19.3331 19.33309,19.3331 3.59159,0 6.96328,-0.969 9.84489,-2.6753 0,10.6774 8.65572,19.3331 19.33308,19.3331 9.17662,0 16.85515,-6.4058 18.83371,-14.9813 l 25.46831,0 0,95.8807 c -8.57556,1.9785 -14.98136,9.657 -14.98136,18.8337 0,10.6773 8.65572,19.333 19.33308,19.333 -1.70625,2.8817 -2.67524,6.2533 -2.67524,9.8449 0,10.6774 8.65572,19.3331 19.33309,19.3331 10.67736,0 19.33308,-8.6557 19.33308,-19.3331 0,-3.5916 -0.96898,-6.9632 -2.67524,-9.8449 10.67737,0 19.33308,-8.6557 19.33308,-19.333 0,-9.1767 -6.4058,-16.8552 -14.98135,-18.8337 l 0,-95.8807 25.4683,0 c 1.97857,8.5755 9.65709,14.9813 18.83371,14.9813 10.67737,0 19.33309,-8.6557 19.33309,-19.3331 2.8816,1.7063 6.25329,2.6753 9.84489,2.6753 10.67736,0 19.33308,-8.6557 19.33308,-19.3331 0,-10.6774 -8.65572,-19.3331 -19.33308,-19.3331 -3.5916,0 -6.96329,0.969 -9.84489,2.6753 0,-10.6774 -8.65572,-19.3331 -19.33309,-19.3331 -9.17662,0 -16.85514,6.4058 -18.83371,14.9813 l -25.4683,0 0,-14.4106 c 8.57555,-1.9786 14.98135,-9.6571 14.98135,-18.8337 0,-10.67738 -8.65571,-19.3331 -19.33308,-19.3331 1.70626,-2.88161 2.67524,-6.2533 2.67524,-9.84489 C 139.33308,15.15572 130.67736,6.5 120,6.5 z"
          fill="none"
          stroke="url(#pkCrossGold)"
          stroke-width="7"
          stroke-linejoin="round"
          filter="url(#pkCrossShadow)"
        />
        <path
          d="M120 54v190M104 79h32M75 109h90M103 203l36 16"
          fill="none"
          stroke="url(#pkCrossGold)"
          stroke-width="7"
          stroke-linecap="square"
          stroke-linejoin="round"
        />
        <text x="45" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="#b78b32" letter-spacing="1.5">IC</text>
        <text x="171" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="#b78b32" letter-spacing="1.5">XC</text>
      </svg>
      ${jurisdiction ? `<p class="pk-cover-jurisdiction">${escHtml(jurisdiction)}</p>` : ""}
      <h1 class="pk-cover-parish">${escHtml(parishName)}</h1>
      <div class="pk-cover-rule"></div>
      <h2 class="pk-cover-title">${escHtml(meeting.title || fiscalYear + " Annual Parish Meeting")}</h2>
      <p class="pk-cover-year">Fiscal Year ${fiscalYear}</p>
      <div class="pk-cover-details">
        ${meetingDate !== "Date TBD" ? `<p>${meetingDate}${meetingTime ? " &middot; " + meetingTime : ""}</p>` : ""}
        ${location  ? `<p>${escHtml(location)}</p>` : ""}
        ${address   ? `<p>${escHtml(address)}</p>`  : ""}
      </div>
      <p class="pk-cover-agapay">Generated by AGAPAY Stewardship &middot; agapay.app</p>
    </div>

    ${noticeSection}
    ${agendaSection}
    ${reportsSection}
    ${finSection}
    ${fundsSection}
    ${nomineesSection}
    ${resolutionsSection}
    ${signinSection}
    ${minutesSection}

    <div class="pk-footer">
      Generated by AGAPAY Stewardship &middot; agapay.app &middot; ${new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })}
    </div>
  </div>

  ${!isPdf ? `<script>if (window.location.hash === '#print') window.print();</script>` : ""}
  ${!isPdf ? stewardshipSessionScript() : ""}
</body>
</html>`;
}


// ─── Utility: dashboard nav (matches existing pattern) ───────────────────────

function dashboardNav(registration, activeSection, base) {
  const parishName = registration.parishName || registration.name || "Parish";
  return `<nav class="dashboard-nav">
    <div class="nav-brand">
      <a href="/parish"><img src="${base}/mark.png" alt="AGAPAY" class="nav-mark" /></a>
      <span class="nav-parish-name">${escHtml(parishName)}</span>
    </div>
    <ul class="nav-links">
      <li class="${activeSection === "home" ? "active" : ""}"><a href="/parish">Dashboard</a></li>
      <li class="${activeSection === "giving" ? "active" : ""}"><a href="/parish/give">Giving</a></li>
      <li class="${activeSection === "commemorations" ? "active" : ""}"><a href="/parish/commemorations">Commemorations</a></li>
      <li class="${activeSection === "campaigns" ? "active" : ""}"><a href="/parish/campaigns">Campaigns</a></li>
      <li class="${activeSection === "stewardship" ? "active" : ""}"><a href="/parish/stewardship">Stewardship</a></li>
      <li class="${activeSection === "settings" ? "active" : ""}"><a href="/parish/settings">Settings</a></li>
    </ul>
  </nav>`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// Builds a single-line mailing address from the parish's Settings tab fields
// (addressLine1, addressLine2, city, state, postalCode) — the registration
// record has no single flat "address" field, so every place that wants a
// printable parish address should go through this rather than reading
// registration.address directly (which is always undefined).
function registrationAddressLine(registration = {}) {
  return [
    registration.addressLine1,
    registration.addressLine2,
    [registration.city, registration.state, registration.postalCode].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");
}

function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function escAttr(s) {
  return String(s || "").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function stewardshipSessionScript() {
  return `<script>
    (function () {
      var qs = window.location.search || "";
      if (!qs) return;
      function withSession(value) {
        try {
          var url = new URL(value, window.location.origin);
          if (url.origin !== window.location.origin || !url.pathname.startsWith("/parish/stewardship")) return value;
          var current = new URLSearchParams(qs);
          if (!url.searchParams.get("parishId") && current.get("parishId")) url.searchParams.set("parishId", current.get("parishId"));
          if (!url.searchParams.get("t") && current.get("t")) url.searchParams.set("t", current.get("t"));
          return url.pathname + url.search + url.hash;
        } catch {
          return value;
        }
      }
      document.querySelectorAll("a[href^='/parish/stewardship']").forEach(function (link) {
        link.setAttribute("href", withSession(link.getAttribute("href")));
      });
      document.querySelectorAll("form[action^='/parish/stewardship']").forEach(function (form) {
        form.setAttribute("action", withSession(form.getAttribute("action")));
      });
    })();
  </script>`;
}

function centsToDisplay(cents) {
  if (!cents) return "";
  return (cents / 100).toFixed(2);
}

function displayToCents(s) {
  const n = parseFloat(String(s || "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function newId() {
  return generateSecret(16);
}

// Parse repeated form fields (e.g. title[], body[])
function parseRepeatedField(formData, key) {
  const raw = formData.getAll ? formData.getAll(key) : [];
  return Array.isArray(raw) ? raw : [raw].filter(Boolean);
}

async function parseFormBody(request) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const result = {};
  for (const [key, value] of params.entries()) {
    if (key.endsWith("[]")) {
      const bare = key.slice(0, -2);
      if (!result[bare]) result[bare] = [];
      result[bare].push(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function centsFromApi(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Math.round(Number(value) * 100) || 0;
}

function apiFormFromMeetingPayload(payload = {}) {
  const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const restrictedFunds = Array.isArray(payload.restrictedFunds) ? payload.restrictedFunds : [];
  const nominees = Array.isArray(payload.nominees) ? payload.nominees : [];
  const resolutions = Array.isArray(payload.resolutions) ? payload.resolutions : [];
  const financialSummary = payload.financialSummary || {};
  return {
    title: payload.title || "Annual Meeting",
    fiscal_year: payload.fiscalYear || payload.fiscal_year || new Date().getFullYear(),
    meeting_date: payload.meetingDate || payload.meeting_date || "",
    meeting_time: payload.meetingTime || payload.meeting_time || "",
    location: payload.location || "",
    parish_name_override: payload.parishNameOverride || payload.parish_name_override || "",
    jurisdiction: payload.jurisdiction || "",
    address: payload.address || "",
    action: payload.status === "ready" || payload.action === "ready" ? "ready" : "save",
    agenda_id: agendaItems.map((item) => item.id || ""),
    agenda_title: agendaItems.map((item) => item.title || ""),
    agenda_duration: agendaItems.map((item) => item.durationMinutes || item.duration_minutes || ""),
    report_id: reports.map((item) => item.id || ""),
    report_type: reports.map((item) => item.reportType || item.report_type || "stewardship"),
    report_title: reports.map((item) => item.title || ""),
    report_body: reports.map((item) => item.body || ""),
    report_signed_by: reports.map((item) => item.createdBy || item.created_by || item.signedBy || item.signed_by || ""),
    fin_income: financialSummary.totalIncome ?? financialSummary.total_income ?? "",
    fin_expense: financialSummary.totalExpense ?? financialSummary.total_expense ?? "",
    fin_notes: financialSummary.notes || "",
    fund_id: restrictedFunds.map((item) => item.id || ""),
    fund_name: restrictedFunds.map((item) => item.fundName || item.fund_name || ""),
    fund_begin: restrictedFunds.map((item) => item.beginningBalance ?? item.beginning_balance ?? ""),
    fund_received: restrictedFunds.map((item) => item.totalReceived ?? item.total_received ?? ""),
    fund_disbursed: restrictedFunds.map((item) => item.totalDisbursed ?? item.total_disbursed ?? ""),
    fund_ending: restrictedFunds.map((item) => item.endingBalance ?? item.ending_balance ?? ""),
    nominee_id: nominees.map((item) => item.id || ""),
    nominee_name: nominees.map((item) => item.fullName || item.full_name || ""),
    nominee_position: nominees.map((item) => item.position || ""),
    nominee_bio: nominees.map((item) => item.bio || ""),
    nominee_nominated_by: nominees.map((item) => item.nominatedBy || item.nominated_by || ""),
    resolution_id: resolutions.map((item) => item.id || ""),
    resolution_title: resolutions.map((item) => item.title || ""),
    resolution_resolved: resolutions.map((item) => item.resolvedText || item.resolved_text || item.body || "")
  };
}

function publicMeeting(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "",
    fiscalYear: Number(row.fiscal_year) || new Date().getFullYear(),
    meetingDate: row.meeting_date || "",
    meetingTime: row.meeting_time || "",
    location: row.location || "",
    parishNameOverride: row.parish_name_override || "",
    jurisdiction: row.jurisdiction || "",
    address: row.address || "",
    status: row.status || "draft",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function publicMeetingDetails(meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions) {
  return {
    ...publicMeeting(meeting),
    agendaItems: (agendaItems || []).map((item) => ({
      id: item.id,
      title: item.title || "",
      description: item.description || "",
      durationMinutes: item.duration_minutes || ""
    })),
    reports: (reports || []).map((item) => ({
      id: item.id,
      reportType: item.report_type || "stewardship",
      title: item.title || "",
      body: item.body || "",
      createdBy: item.created_by || ""
    })),
    financialSummary: financialSummary ? {
      totalIncomeCents: financialSummary.total_income_cents || 0,
      totalExpenseCents: financialSummary.total_expense_cents || 0,
      netCents: financialSummary.net_cents || 0,
      notes: financialSummary.notes || ""
    } : {
      totalIncomeCents: 0,
      totalExpenseCents: 0,
      netCents: 0,
      notes: ""
    },
    restrictedFunds: (restrictedFunds || []).map((item) => ({
      id: item.id,
      fundName: item.fund_name || "",
      beginningBalanceCents: item.beginning_balance_cents || 0,
      totalReceivedCents: item.total_received_cents || 0,
      totalDisbursedCents: item.total_disbursed_cents || 0,
      endingBalanceCents: item.ending_balance_cents || 0,
      notes: item.notes || ""
    })),
    nominees: (nominees || []).map((item) => ({
      id: item.id,
      fullName: item.full_name || "",
      position: item.position || "",
      bio: item.bio || "",
      nominatedBy: item.nominated_by || ""
    })),
    resolutions: (resolutions || []).map((item) => ({
      id: item.id,
      title: item.title || "",
      body: item.body || "",
      resolvedText: item.resolved_text || ""
    }))
  };
}

function isMissingStewardshipSchema(error) {
  return /stewardship_annual_meetings|no such table|not found/i.test(String(error?.message || error || ""));
}

// ─── "Founding 20" free-year Stewardship Suite promo ───────────────────────────
// Admin-granted only — not self-service — to keep the count exact and to avoid
// building abuse/fraud protection for what is a small, relationship-driven
// promo. Grant state lives entirely on the registration record
// (registration.stewardshipComp), completely separate from the Stripe
// subscription fields, so a comped parish has no billing objects at all.

// POST /api/admin/stewardship/comp
// Body: { parishId: string }
// Grants one year of free Stewardship Suite access, capped at
// STEWARDSHIP_COMP_PROMO_LIMIT total grants across all parishes.
export async function handleAdminGrantStewardshipComp(request, env) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await parseJsonBody(request);
  const parishId = String(body?.parishId || "").trim();
  if (!parishId) return json({ error: "parishId is required." }, { status: 400 });

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found." }, { status: 404 });
  const { registration } = found;

  if (hasActiveStewardshipComp(registration)) {
    return json({
      error: "This parish already has an active Stewardship Suite comp grant.",
      comp: registration.stewardshipComp
    }, { status: 409 });
  }

  // Check-then-increment against the cap. This isn't perfectly atomic under
  // true concurrent requests, but grants are a rare, admin-only, manual
  // action — the realistic risk of two simultaneous grants racing past the
  // cap is effectively zero for this use case.
  const currentCountRaw = await env.AGAPAY_REGISTRATIONS.get(STEWARDSHIP_COMP_PROMO_KV_KEY);
  const currentCount = parseInt(currentCountRaw || "0", 10) || 0;
  if (currentCount >= STEWARDSHIP_COMP_PROMO_LIMIT) {
    return json({
      error: `The founding ${STEWARDSHIP_COMP_PROMO_LIMIT} free-year promo has already been fully claimed.`,
      claimed: currentCount,
      limit: STEWARDSHIP_COMP_PROMO_LIMIT
    }, { status: 409 });
  }

  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + 1);

  registration.stewardshipComp = {
    active: true,
    code: STEWARDSHIP_COMP_PROMO_CODE,
    grantedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    grantedBy: "admin"
  };
  await saveRegistrationRecord(env, found.key, registration);

  const newCount = currentCount + 1;
  await env.AGAPAY_REGISTRATIONS.put(STEWARDSHIP_COMP_PROMO_KV_KEY, String(newCount));

  return json({
    ok: true,
    parishId,
    comp: registration.stewardshipComp,
    claimed: newCount,
    remaining: Math.max(0, STEWARDSHIP_COMP_PROMO_LIMIT - newCount)
  });
}

// GET /api/admin/stewardship/comp-status
// Returns how many of the 20 founding free-year grants have been claimed,
// for the admin dashboard.
export async function handleAdminStewardshipCompStatus(request, env) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const currentCountRaw = await env.AGAPAY_REGISTRATIONS.get(STEWARDSHIP_COMP_PROMO_KV_KEY);
  const claimed = parseInt(currentCountRaw || "0", 10) || 0;
  return json({
    code: STEWARDSHIP_COMP_PROMO_CODE,
    limit: STEWARDSHIP_COMP_PROMO_LIMIT,
    claimed,
    remaining: Math.max(0, STEWARDSHIP_COMP_PROMO_LIMIT - claimed)
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
    meetings = await d1All(env, `
      SELECT id, title, fiscal_year, meeting_date, status, created_at, updated_at
      FROM stewardship_annual_meetings
      WHERE parish_id = ?
      ORDER BY fiscal_year DESC, created_at DESC
      LIMIT 50
    `, registration.parishId);
  } catch (error) {
    if (!isMissingStewardshipSchema(error)) throw error;
    setupRequired = true;
  }

  return json({
    ok: true,
    stewardship: stewardshipPublicStatus(registration),
    setupRequired,
    meetings: (meetings || []).map(publicMeeting),
    subscribePlans: [
      { id: "monthly", label: "Monthly", priceLabel: "$39/mo", trialLabel: "14-day free trial" },
      { id: "annual", label: "Annual", priceLabel: "$399/yr", trialLabel: "Save $69 annually" }
    ]
  });
}

export async function handleParishStewardshipSubscribe(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration, key: registrationKey } = ctx;
  if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();

  const limited = await rateLimit(request, env, "stewardship-subscribe", { limit: 5, windowSeconds: 60 });
  if (limited) return limited;

  const body = await parseJsonBody(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  const plan = body.plan === "annual" ? "annual" : "monthly";
  const priceId = plan === "annual"
    ? env.STEWARDSHIP_STRIPE_PRICE_ANNUAL
    : env.STEWARDSHIP_STRIPE_PRICE_MONTHLY;
  if (!priceId) {
    return json({ error: "Stewardship pricing is not configured yet." }, { status: 500 });
  }

  const base = absoluteWebsiteUrl(env);
  let customerId = registration.stewardshipStripeCustomerId;
  if (!customerId) {
    const customer = await stripePlatformPost(env, "/customers", {
      email: registration.email || registration.contactEmail || "",
      name: registration.parishName || registration.name || "",
      metadata: { parish_id: registration.parishId },
    });
    if (customer.error) return json({ error: customer.error?.message || "Could not create billing customer." }, { status: 500 });
    customerId = customer.id;
    registration.stewardshipStripeCustomerId = customerId;
    await saveRegistrationRecord(env, registrationKey, registration);
  }

  const session = await stripePlatformPost(env, "/checkout/sessions", {
    customer: customerId,
    mode: "subscription",
    "automatic_tax[enabled]": "true",
    billing_address_collection: "required",
    "customer_update[address]": "auto",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "14",
    "subscription_data[metadata][parish_id]": registration.parishId,
    "metadata[parish_id]": registration.parishId,
    "metadata[product_key]": STEWARDSHIP_PRODUCT_KEY,
    success_url: base + "/parish/dashboard?tab=stewardship&subscribed=1",
    cancel_url: base + "/parish/dashboard?tab=stewardship",
  });

  if (session.error || !session.url) {
    return json({ error: session.error?.message || "Could not create checkout session." }, { status: 500 });
  }
  return json({ ok: true, checkoutUrl: session.url });
}

export async function handleParishStewardshipBillingPortal(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();

  const customerId = registration.stewardshipStripeCustomerId;
  if (!customerId) return json({ error: "No Stewardship billing customer found." }, { status: 400 });

  const portal = await stripePlatformPost(env, "/billing_portal/sessions", {
    customer: customerId,
    return_url: absoluteWebsiteUrl(env) + "/parish/dashboard?tab=stewardship",
  });
  if (portal.error || !portal.url) {
    return json({ error: portal.error?.message || "Could not open billing portal." }, { status: 500 });
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
    if (!hasStewardshipAccess(registration)) {
      return json({ error: "Stewardship subscription required.", stewardship: stewardshipPublicStatus(registration) }, { status: 402 });
    }

    if (request.method === "GET") {
      let meetings = [];
      try {
        meetings = await d1All(env, `
          SELECT *
          FROM stewardship_annual_meetings
          WHERE parish_id = ?
          ORDER BY fiscal_year DESC, created_at DESC
          LIMIT 50
        `, registration.parishId);
      } catch (error) {
        if (!isMissingStewardshipSchema(error)) throw error;
        return json({ ok: false, error: "Stewardship database tables are not installed yet.", setupRequired: true }, { status: 503 });
      }
      return json({ ok: true, meetings: (meetings || []).map(publicMeeting) });
    }

    if (request.method !== "POST") {
      return json({ error: `Method not allowed: ${request.method} is not supported on /stewardship/meetings (use GET or POST)` }, { status: 405 });
    }
    const body = await parseJsonBody(request);
    if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
    const form = apiFormFromMeetingPayload(body);
    const meetingId = await newId();
    const now = new Date().toISOString();

    await d1Run(env, `
      INSERT INTO stewardship_annual_meetings
        (id, parish_id, title, fiscal_year, meeting_date, meeting_time, location,
         parish_name_override, jurisdiction, address, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 
      meetingId, registration.parishId,
      form.title || "Annual Meeting",
      parseInt(form.fiscal_year) || new Date().getFullYear(),
      form.meeting_date || null,
      form.meeting_time || null,
      form.location || null,
      form.parish_name_override || null,
      form.jurisdiction || null,
      form.address || null,
      form.action === "ready" ? "ready" : "draft",
      null,
      now, now,
    );

    await saveMeetingSubRecords(env, meetingId, form);

    // Build the response directly instead of delegating to
    // handleParishStewardshipMeetingDetail — that function only accepts
    // GET/PATCH, but this request's method is still POST, which made a
    // successful creation look like a failed "Method not allowed" save.
    const created = await d1First(env,
      "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
      meetingId, registration.parishId
    );
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);
    return json({
      ok: true,
      meeting: publicMeetingDetails(created, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions)
    });
  } catch (err) {
    return json({ error: "Stewardship meetings request failed: " + (err?.message || String(err)) }, { status: 500 });
  }
}

export async function handleParishStewardshipMeetingDetail(request, env, parishId, meetingId) {
  try {
    if (!hasProductionStore(env)) return missingProductionStoreResponse();
    const ctx = await requireParishApiContext(request, env, parishId);
    if (!ctx.ok) return ctx.response;
    const { registration } = ctx;
    if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();
    if (!hasStewardshipAccess(registration)) {
      return json({ error: "Stewardship subscription required.", stewardship: stewardshipPublicStatus(registration) }, { status: 402 });
    }

    const meeting = await d1First(env,
      "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
      meetingId, registration.parishId
    );
    if (!meeting) return json({ error: "Meeting not found" }, { status: 404 });

    if (request.method === "GET") {
      const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
        await loadMeetingSubRecords(env, meetingId);
      return json({
        ok: true,
        meeting: publicMeetingDetails(meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions)
      });
    }

    if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
    const body = await parseJsonBody(request);
    if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
    const form = apiFormFromMeetingPayload(body);
    const now = new Date().toISOString();

    await d1Run(env, `
      UPDATE stewardship_annual_meetings SET
        title = ?, fiscal_year = ?, meeting_date = ?, meeting_time = ?, location = ?,
        parish_name_override = ?, jurisdiction = ?, address = ?,
        status = ?, updated_at = ?
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
      form.action === "ready" ? "ready" : "draft",
      now,
      meetingId, registration.parishId,
    );
    await deleteMeetingSubRecords(env, meetingId);
    await saveMeetingSubRecords(env, meetingId, form);

    const updated = await d1First(env,
      "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
      meetingId, registration.parishId
    );
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);
    return json({
      ok: true,
      meeting: publicMeetingDetails(updated, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions)
    });
  } catch (err) {
    // Surface the real failure instead of letting it become an opaque
    // Cloudflare 1101/500 with no body the client can read.
    return json({ error: "Stewardship meeting request failed: " + (err?.message || String(err)) }, { status: 500 });
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
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  if (!hasStewardshipAccess(registration)) {
    return new Response(paywallHtml(registration, env), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  const meetings = await d1All(env, `
    SELECT id, title, fiscal_year, meeting_date, status
    FROM stewardship_annual_meetings
    WHERE parish_id = ?
    ORDER BY fiscal_year DESC, created_at DESC
    LIMIT 50
  `, registration.parishId);

  return new Response(stewardshipHomeHtml(registration, meetings || [], env), {
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}

// POST /parish/stewardship/subscribe
export async function handleStewardshipSubscribe(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration, key: registrationKey } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      status: 409,
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  const limited = await rateLimit(request, env, "stewardship-subscribe", { limit: 5, windowSeconds: 60 });
  if (limited) return limited;

  const form = await parseFormBody(request);
  const plan = form.plan === "annual" ? "annual" : "monthly";

  // Determine Stripe Price ID from env
  const priceId = plan === "annual"
    ? env.STEWARDSHIP_STRIPE_PRICE_ANNUAL
    : env.STEWARDSHIP_STRIPE_PRICE_MONTHLY;

  if (!priceId) {
    return json({ error: "Stewardship pricing not configured. Set STEWARDSHIP_STRIPE_PRICE_MONTHLY and STEWARDSHIP_STRIPE_PRICE_ANNUAL." }, { status: 500 });
  }

  const base = absoluteWebsiteUrl(env);

  // Create or retrieve Stripe customer for this parish
  let customerId = registration.stewardshipStripeCustomerId;
  if (!customerId) {
    const customer = await stripePlatformPost(env, "/customers", {
      email: registration.email || registration.contactEmail || "",
      name: registration.parishName || registration.name || "",
      metadata: { parish_id: registration.parishId },
    });
    if (customer.error) return json({ error: "Could not create billing customer." }, { status: 500 });
    customerId = customer.id;
    registration.stewardshipStripeCustomerId = customerId;
    await saveRegistrationRecord(env, registrationKey, registration);
  }

  // Create Stripe Checkout Session
  const session = await stripePlatformPost(env, "/checkout/sessions", {
    customer: customerId,
    mode: "subscription",
    "automatic_tax[enabled]": "true",
    billing_address_collection: "required",
    "customer_update[address]": "auto",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "14",
    "subscription_data[metadata][parish_id]": registration.parishId,
    "metadata[parish_id]": registration.parishId,
    "metadata[product_key]": STEWARDSHIP_PRODUCT_KEY,
    success_url: base + "/parish/stewardship?subscribed=1",
    cancel_url: base + "/parish/stewardship",
  });

  if (session.error || !session.url) {
    return json({ error: session.error?.message || "Could not create checkout session." }, { status: 500 });
  }

  return Response.redirect(session.url, 303);
}

// GET /parish/stewardship/billing
export async function handleStewardshipBilling(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  return new Response(billingHtml(registration, null, env), {
    headers: { "Content-Type": "text/html;charset=utf-8" },
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
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  const customerId = registration.stewardshipStripeCustomerId;
  if (!customerId) {
    return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship", 303);
  }

  const base = absoluteWebsiteUrl(env);
  const portal = await stripePlatformPost(env, "/billing_portal/sessions", {
    customer: customerId,
    return_url: base + "/parish/stewardship/billing",
  });

  if (portal.error || !portal.url) {
    return json({ error: "Could not open billing portal." }, { status: 500 });
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
      status: request.method === "GET" ? 200 : 409,
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  if (!hasStewardshipAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship", 303);
  }

  if (request.method === "GET") {
    return new Response(annualMeetingFormHtml(registration, null, [], [], null, [], [], [], env), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  // POST — create new meeting and all sub-records
  const form = await parseFormBody(request);
  const meetingId = await newId();
  const now = new Date().toISOString();

  await d1Run(env, `
    INSERT INTO stewardship_annual_meetings
      (id, parish_id, title, fiscal_year, meeting_date, meeting_time, location,
       parish_name_override, jurisdiction, address, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, 
    meetingId, registration.parishId,
    form.title || "Annual Meeting",
    parseInt(form.fiscal_year) || new Date().getFullYear(),
    form.meeting_date || null,
    form.meeting_time || null,
    form.location || null,
    form.parish_name_override || null,
    form.jurisdiction || null,
    form.address || null,
    form.action === "ready" ? "ready" : "draft",
    ctx.userEmail || null,
    now, now,
  );

  await saveMeetingSubRecords(env, meetingId, form);

  return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship/annual-meetings/" + meetingId, 303);
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
      status: request.method === "GET" ? 200 : 409,
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  if (!hasStewardshipAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship", 303);
  }

  const meeting = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    meetingId, registration.parishId
  );
  if (!meeting) return json({ error: "Not found" }, { status: 404 });

  if (request.method === "GET") {
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);

    return new Response(
      annualMeetingFormHtml(registration, meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions, env),
      { headers: { "Content-Type": "text/html;charset=utf-8" } }
    );
  }

  // POST — update
  const form = await parseFormBody(request);
  const now = new Date().toISOString();

  await d1Run(env, `
    UPDATE stewardship_annual_meetings SET
      title = ?, fiscal_year = ?, meeting_date = ?, meeting_time = ?, location = ?,
      parish_name_override = ?, jurisdiction = ?, address = ?,
      status = ?, updated_at = ?
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
    form.action === "ready" ? "ready" : (form.action === "save" ? "draft" : meeting.status),
    now,
    meetingId, registration.parishId,
  );

  // Delete and re-insert sub-records (simplest approach for MVP)
  await deleteMeetingSubRecords(env, meetingId);
  await saveMeetingSubRecords(env, meetingId, form);

  return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship/annual-meetings/" + meetingId, 303);
}

// GET /parish/stewardship/annual-meetings/:id/preview
export async function handleStewardshipMeetingPreview(request, env, meetingId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  if (!hasStewardshipAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship", 303);
  }

  const meeting = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    meetingId, registration.parishId
  );
  if (!meeting) return json({ error: "Not found" }, { status: 404 });

  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
    await loadMeetingSubRecords(env, meetingId);

  return new Response(
    packetPreviewHtml(registration, meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions, false, env),
    { headers: { "Content-Type": "text/html;charset=utf-8" } }
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
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  if (!hasStewardshipAccess(registration)) {
    return unauthorized("Stewardship subscription required");
  }

  const meeting = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    meetingId, registration.parishId
  );
  if (!meeting) return json({ error: "Not found" }, { status: 404 });

  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
    await loadMeetingSubRecords(env, meetingId);

  // Log generation
  await d1Run(env, `
    INSERT INTO stewardship_generated_packets (id, annual_meeting_id, generated_by, generated_at)
    VALUES (?, ?, ?, ?)
  `, await newId(), meetingId, ctx.userEmail || null, new Date().toISOString());

  // Update status to generated
  await d1Run(env,
    "UPDATE stewardship_annual_meetings SET status = 'generated', updated_at = ? WHERE id = ?",
    new Date().toISOString(), meetingId
  );

  const html = packetPreviewHtml(registration, meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions, true, env);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Content-Disposition": `inline; filename="annual-meeting-${meeting.fiscal_year}.html"`,
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
  if (!hasStewardshipAccess(registration)) {
    return new Response(paywallHtml(registration, env), { headers: { "Content-Type": "text/html;charset=utf-8" } });
  }

  const base = absoluteWebsiteUrl(env);
  const parishName = registration.parishName || registration.name || "Parish";
  const currentYear = new Date().getFullYear();
  const yearOptions = [0,1,2,3,4].map(n => {
    const y = currentYear - n;
    return `<option value="${y}">${y}</option>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Giving Metrics — AGAPAY Stewardship</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <link rel="stylesheet" href="${base}/styles/stewardship.css" />
</head>
<body class="dashboard-body">
  <div class="dashboard-shell">
    ${dashboardNav(registration, "stewardship", base)}
    <main class="dashboard-main">
      <div class="page-header">
        <div>
          <h1>Giving Metrics</h1>
          <p style="color:var(--text-muted);margin:0"><a href="/parish/stewardship">← Back to Stewardship</a></p>
        </div>
        <div style="display:flex;gap:.75rem;align-items:center">
          <select id="year-select" class="form-select" onchange="loadAll()">
            ${yearOptions}
          </select>
          <button onclick="downloadReport()" class="btn btn-primary" id="pdf-btn">Download Report PDF</button>
        </div>
      </div>

      <!-- KPIs -->
      <div id="kpi-grid" class="giving-kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem"></div>

      <!-- Pledge progress -->
      <section class="module-card" style="margin-bottom:1.5rem">
        <h2 style="font-size:1rem;margin-bottom:.75rem">Pledge vs. Actual &amp; Run Rate</h2>
        <div id="progress-bars"></div>
      </section>

      <!-- Fund breakdown -->
      <section class="module-card" style="margin-bottom:1.5rem">
        <h2 style="font-size:1rem;margin-bottom:.75rem">Giving by Fund</h2>
        <div id="funds-table" style="overflow-x:auto"></div>
      </section>

      <!-- Two-col: distribution + retention -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem">
        <section class="module-card">
          <h2 style="font-size:1rem;margin-bottom:.75rem">Giving Distribution</h2>
          <p style="font-size:.75rem;color:var(--text-muted);margin-bottom:.75rem">Anonymized — no individual identities disclosed.</p>
          <div id="tier-chart"></div>
        </section>
        <section class="module-card">
          <h2 style="font-size:1rem;margin-bottom:.75rem">Donor Retention</h2>
          <div id="retention-cards" style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem"></div>
        </section>
      </div>
    </main>
  </div>

  <style>
    .giving-kpi-card { background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem; }
    .giving-kpi-label { font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:.3rem; }
    .giving-kpi-value { font-family:var(--font-serif,Georgia,serif);font-size:1.65rem;font-weight:600;color:var(--gold,#C49C50);line-height:1; }
    .giving-kpi-sub { font-size:.72rem;color:var(--text-muted);margin-top:.25rem; }
    .progress-track { background:rgba(255,255,255,.08);border-radius:6px;height:10px;overflow:hidden;margin:.3rem 0 .2rem; }
    .progress-fill { height:100%;background:linear-gradient(90deg,var(--gold,#C49C50) 0%,#DABB70 100%);border-radius:6px;transition:width .5s ease; }
    .progress-fill.dim { opacity:.35;border-right:2px dashed var(--gold,#C49C50); }
    .giving-fund-table { width:100%;border-collapse:collapse;font-size:.85rem; }
    .giving-fund-table th { font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--border); }
    .giving-fund-table td { padding:.55rem .5rem;border-bottom:1px solid rgba(255,255,255,.04); }
    .tier-row { display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem; }
    .tier-label { width:120px;flex-shrink:0;font-size:.78rem;color:var(--text-muted); }
    .tier-bar-wrap { flex:1;background:rgba(255,255,255,.06);border-radius:5px;height:18px;overflow:hidden; }
    .tier-bar-fill { height:100%;background:var(--gold,#C49C50);border-radius:5px; }
    .tier-count { width:80px;font-size:.78rem;text-align:right; }
    .ret-card { background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem;text-align:center; }
    .ret-num { font-family:var(--font-serif,Georgia,serif);font-size:1.8rem;font-weight:600;color:var(--gold,#C49C50); }
    .ret-lbl { font-size:.72rem;color:var(--text-muted);margin-top:.2rem; }
    @media(max-width:640px) { div[style*="grid-template-columns:1fr 1fr"] { grid-template-columns:1fr!important; } }
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
          "<div style='font-size:.8rem;color:var(--text-muted);margin-bottom:.2rem'>Collected — " + fmt(s.total_actual_cents) + " (" + pct + "% of goal)</div>" +
          "<div class='progress-track'><div class='progress-fill' style='width:" + pct + "%'></div></div>" +
          "<div style='font-size:.78rem;color:var(--text-muted);margin:1rem 0 .2rem'>Run Rate Projection — " + fmt(s.run_rate_cents) + " <span style='opacity:.5;font-size:.72rem'>(day " + s.day_of_year + " of " + s.days_in_year + ")</span></div>" +
          "<div class='progress-track'><div class='progress-fill dim' style='width:" + rrPct + "%'></div></div>" +
          "<div style='font-size:.72rem;color:var(--text-muted);margin-top:.2rem'>Pledge goal: " + fmt(s.total_pledged_cents) + "</div>";
      }

      function renderFunds(f) {
        if (!f || f.error) return;
        var rows = (f.funds || []).map(function(fd) {
          return "<tr><td>" + escH(fd.fund_name) + "</td><td style='text-align:center;color:var(--text-muted)'>" + fd.transaction_count + "</td><td style='text-align:right;color:var(--gold,#C49C50)'>" + fmt(fd.total_cents) + "</td><td style='text-align:right;color:var(--text-muted)'>" + fd.pct_of_total + "%</td><td style='width:80px'><div style='background:rgba(255,255,255,.07);border-radius:3px;height:5px'><div style='width:" + fd.pct_of_total + "%;height:100%;background:var(--gold,#C49C50);border-radius:3px'></div></div></td></tr>";
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
          a.href = url; a.download = "AGAPAY-Stewardship-" + year + ".pdf"; a.click();
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

  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

// GET  /api/parish/dashboard/:parishId/stewardship/financials?year=YYYY
// POST /api/parish/dashboard/:parishId/stewardship/financials
// Standalone financial snapshots — income, expenses, and restricted funds for a fiscal year,
// aggregated across all annual meeting packets for the parish (or as a standalone record).
export async function handleStewardshipFinancials(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found" }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();
  if (!hasStewardshipAccess(found.registration)) return json({ error: "Stewardship Suite not active." }, { status: 403 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get("year") || new Date().getFullYear(), 10);

  // ── GET: return aggregated financials for the year ──────────────────────
  if (request.method === "GET") {
    // Pull all meetings for this parish + year
    const meetings = await d1All(env,
      `SELECT id, title, fiscal_year, meeting_date, status FROM stewardship_annual_meetings
       WHERE parish_id = ? AND fiscal_year = ? ORDER BY created_at ASC`,
      parishId, year
    );

    if (!meetings.length) {
      return json({ year, meetings: [], financialSummaries: [], restrictedFunds: [], totals: null });
    }

    const meetingIds = meetings.map(m => m.id);
    const placeholders = meetingIds.map(() => "?").join(",");

    const [financialSummaries, restrictedFunds] = await Promise.all([
      d1All(env,
        `SELECT fs.*, am.title AS meeting_title, am.fiscal_year, am.meeting_date
         FROM stewardship_financial_summaries fs
         JOIN stewardship_annual_meetings am ON am.id = fs.annual_meeting_id
         WHERE fs.annual_meeting_id IN (${placeholders})
         ORDER BY am.meeting_date ASC`,
        ...meetingIds
      ),
      d1All(env,
        `SELECT rf.*, am.title AS meeting_title, am.fiscal_year
         FROM stewardship_restricted_fund_snapshots rf
         JOIN stewardship_annual_meetings am ON am.id = rf.annual_meeting_id
         WHERE rf.annual_meeting_id IN (${placeholders})
         ORDER BY rf.sort_order ASC`,
        ...meetingIds
      )
    ]);

    // Aggregate totals across all summaries for the year
    const totals = financialSummaries.length ? financialSummaries.reduce((acc, fs) => ({
      totalIncomeCents:  acc.totalIncomeCents  + (fs.total_income_cents  || 0),
      totalExpenseCents: acc.totalExpenseCents + (fs.total_expense_cents || 0),
      netCents:          acc.netCents          + (fs.net_cents           || 0),
    }), { totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0 }) : null;

    return json({
      year,
      meetings: meetings.map(m => ({ id: m.id, title: m.title, fiscalYear: m.fiscal_year, meetingDate: m.meeting_date, status: m.status })),
      financialSummaries: financialSummaries.map(fs => ({
        id: fs.id,
        annualMeetingId: fs.annual_meeting_id,
        meetingTitle: fs.meeting_title,
        meetingDate: fs.meeting_date,
        totalIncomeCents:  fs.total_income_cents  || 0,
        totalExpenseCents: fs.total_expense_cents || 0,
        netCents:          fs.net_cents           || 0,
        notes:             fs.notes               || "",
        snapshotTakenAt:   fs.snapshot_taken_at   || ""
      })),
      restrictedFunds: restrictedFunds.map(rf => ({
        id:                    rf.id,
        annualMeetingId:       rf.annual_meeting_id,
        meetingTitle:          rf.meeting_title,
        fundName:              rf.fund_name              || "",
        beginningBalanceCents: rf.beginning_balance_cents || 0,
        totalReceivedCents:    rf.total_received_cents   || 0,
        totalDisbursedCents:   rf.total_disbursed_cents  || 0,
        endingBalanceCents:    rf.ending_balance_cents   || 0,
        notes:                 rf.notes                  || "",
        sortOrder:             rf.sort_order             || 0
      })),
      totals
    });
  }

  // ── POST: save a standalone financial snapshot (not tied to a meeting packet) ──
  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }

    const meetingId = body.annualMeetingId || null;

    // If annualMeetingId provided, upsert into that meeting's financial summary
    if (meetingId) {
      const meeting = await d1First(env,
        "SELECT id FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
        meetingId, parishId
      );
      if (!meeting) return json({ error: "Meeting not found for this parish" }, { status: 404 });

      const existing = await d1First(env,
        "SELECT id FROM stewardship_financial_summaries WHERE annual_meeting_id = ?",
        meetingId
      );
      const income  = Math.round(Number(body.totalIncomeCents  || 0));
      const expense = Math.round(Number(body.totalExpenseCents || 0));
      const net     = Math.round(Number(body.netCents ?? (income - expense)));
      const now     = new Date().toISOString();

      if (existing) {
        await d1Run(env,
          `UPDATE stewardship_financial_summaries
           SET total_income_cents = ?, total_expense_cents = ?, net_cents = ?, notes = ?,
               snapshot_taken_at = ?, updated_at = ?
           WHERE id = ?`,
          income, expense, net, body.notes || null, now, now, existing.id
        );
      } else {
        await d1Run(env,
          `INSERT INTO stewardship_financial_summaries
             (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents, notes, snapshot_taken_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          await newId(), meetingId, income, expense, net, body.notes || null, now, now, now
        );
      }

      // Upsert restricted funds if provided
      if (Array.isArray(body.restrictedFunds) && body.restrictedFunds.length) {
        // Delete and re-insert for simplicity (same pattern as packet editor)
        await d1Run(env,
          "DELETE FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ?",
          meetingId
        );
        for (let i = 0; i < body.restrictedFunds.length; i++) {
          const rf = body.restrictedFunds[i];
          if (!rf.fundName?.trim()) continue;
          await d1Run(env,
            `INSERT INTO stewardship_restricted_fund_snapshots
               (id, annual_meeting_id, fund_name, beginning_balance_cents, total_received_cents,
                total_disbursed_cents, ending_balance_cents, notes, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            await newId(), meetingId, rf.fundName.trim(),
             Math.round(Number(rf.beginningBalanceCents || 0)),
             Math.round(Number(rf.totalReceivedCents    || 0)),
             Math.round(Number(rf.totalDisbursedCents   || 0)),
             Math.round(Number(rf.endingBalanceCents    || 0)),
             rf.notes || null, i, now
          );
        }
      }

      return json({ ok: true });
    }

    // No meeting ID — create a new minimal meeting record as the container
    const fiscalYear = parseInt(body.fiscalYear || year, 10);
    const newMeetingId = await newId();
    const now = new Date().toISOString();
    await d1Run(env,
      `INSERT INTO stewardship_annual_meetings
         (id, parish_id, title, fiscal_year, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
      newMeetingId, parishId,
       body.title || (fiscalYear + " Financial Snapshot"),
       fiscalYear, now, now
    );

    const income  = Math.round(Number(body.totalIncomeCents  || 0));
    const expense = Math.round(Number(body.totalExpenseCents || 0));
    const net     = Math.round(Number(body.netCents ?? (income - expense)));
    await d1Run(env,
      `INSERT INTO stewardship_financial_summaries
         (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents, notes, snapshot_taken_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      await newId(), newMeetingId, income, expense, net, body.notes || null, now, now, now
    );

    if (Array.isArray(body.restrictedFunds)) {
      for (let i = 0; i < body.restrictedFunds.length; i++) {
        const rf = body.restrictedFunds[i];
        if (!rf.fundName?.trim()) continue;
        await d1Run(env,
          `INSERT INTO stewardship_restricted_fund_snapshots
             (id, annual_meeting_id, fund_name, beginning_balance_cents, total_received_cents,
              total_disbursed_cents, ending_balance_cents, notes, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          await newId(), newMeetingId, rf.fundName.trim(),
           Math.round(Number(rf.beginningBalanceCents || 0)),
           Math.round(Number(rf.totalReceivedCents    || 0)),
           Math.round(Number(rf.totalDisbursedCents   || 0)),
           Math.round(Number(rf.endingBalanceCents    || 0)),
           rf.notes || null, i, now
        );
      }
    }

    return json({ ok: true, annualMeetingId: newMeetingId });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

// POST /api/parish/dashboard/:parishId/stewardship/nudge
// Identifies donors who are behind on their pledge and writes a notification
// record for each. Returns a preview list before sending (dry_run=true) or
// sends and returns the count (dry_run=false).
export async function handleStewardshipNudge(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (!hasStewardshipAccess(registration)) {
    return json({ error: "Stewardship Suite not active." }, { status: 403 });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const url        = new URL(request.url);
  const year       = parseInt(url.searchParams.get("year") || new Date().getFullYear(), 10);
  const dryRun     = request.method === "GET" || url.searchParams.get("dry_run") === "true";
  const parishName = registration.parishName || registration.name || "your parish";

  // A donor is "3 months behind" if their actual giving is less than what
  // they should have given by 3 months ago (92 days). This avoids nudging
  // donors who are only a few weeks off pace.
  const today          = new Date();
  const yearStart      = new Date(`${year}-01-01`);
  const daysInYear     = (year % 4 === 0) ? 366 : 365;
  const threeMonthsAgo = new Date(today.getTime() - 92 * 86400000);
  // If 3 months ago was before the fiscal year started, no one can be 3 months behind yet.
  const comparisonDate = threeMonthsAgo < yearStart ? yearStart : threeMonthsAgo;
  const daysElapsed    = Math.max(0, Math.ceil((comparisonDate - yearStart) / 86400000));
  // Donors must be behind relative to what they should have given 3 months ago.
  const expectedRate   = daysElapsed / daysInYear;

  // Load all pledges for this parish + year
  const pledges = await d1All(env,
    `SELECT donor_email, target_amount_cents FROM household_pledges
     WHERE parish_id = ? AND fiscal_year = ? AND target_amount_cents > 0`,
    parishId, year
  );

  if (!pledges.length) {
    return json({ ok: true, behind: [], message: "No pledging donors found for " + year + "." });
  }

  // Load actual giving for each pledging donor this year
  const yearEnd = year + "-12-31";
  const yearStartStr = year + "-01-01";
  const givenRows = await d1All(env,
    `SELECT donor_email, SUM(json_extract(data, '$.giftAmountCents')) AS given_cents
     FROM donor_offerings
     WHERE parish_id = ? AND payment_status IN ('paid','succeeded')
       AND created_at BETWEEN ? AND ?
       AND donor_email IN (${pledges.map(() => "?").join(",")})
     GROUP BY donor_email`,
    parishId, yearStartStr, yearEnd, ...pledges.map(p => p.donor_email)
  );

  const givenMap = {};
  for (const row of givenRows) {
    givenMap[row.donor_email] = Number(row.given_cents || 0);
  }

  // Identify behind donors
  const behind = pledges
    .map(p => {
      const given    = givenMap[p.donor_email] || 0;
      const expected = Math.round(p.target_amount_cents * expectedRate);
      const behind   = given < expected;
      return { donorEmail: p.donor_email, pledgeCents: p.target_amount_cents, givenCents: given, expectedCents: expected, behind };
    })
    .filter(d => d.behind);

  if (dryRun) {
    return json({ ok: true, behind, year, dryRun: true, parishName, thresholdActive: daysElapsed >= 1 });
  }

  // Send: write a notification row for each behind donor
  const now = new Date().toISOString();
  const message =
    "Your stewardship campaign team at " + parishName + " wanted to gently reach out. " +
    "Based on your " + year + " pledge, you may be a little behind schedule. " +
    "If life has been full this season, please don’t be discouraged — " +
    "any gift, large or small, makes a difference. Thank you for your faithfulness.";

  let sent = 0;
  for (const donor of behind) {
    await d1Run(env,
      `INSERT INTO donor_notifications
         (id, donor_email, parish_id, type, fiscal_year, pledge_cents, given_cents, message, sent_at)
       VALUES (?, ?, ?, 'pledge_nudge', ?, ?, ?, ?, ?)`,
      await newId(), donor.donorEmail, parishId, year,
      donor.pledgeCents, donor.givenCents, message, now
    );
    sent++;
  }

  return json({ ok: true, sent, year, parishName });
}

export async function handleStewardshipWebhook(request, env) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") || "";
  const secret = env.STEWARDSHIP_STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return json({ error: "STEWARDSHIP_STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }
  const valid = await verifyStripeWebhook(body, sig, secret);
  if (!valid) return json({ error: "Invalid signature" }, { status: 400 });

  let event;
  try { event = JSON.parse(body); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }

  // Deduplicate — claimStripeEvent expects an event object {id, type}, not a bare string.
  // We namespace the id with "sw_" so stewardship events don't collide with the main webhook log.
  const syntheticEvent = { id: "sw_" + event.id, type: event.type };
  const claim = await claimStripeEvent(env, syntheticEvent);
  if (!claim.claimed) return json({ received: true, duplicate: true });

  try {
    await processWebhookEvent(event, env);
    await finishStripeEvent(env, syntheticEvent.id, "processed");
  } catch (err) {
    await finishStripeEvent(env, syntheticEvent.id, "failed", err?.message || String(err));
    throw err;
  }

  return json({ received: true });
}

async function processWebhookEvent(event, env) {
  const obj = event.data?.object;
  if (!obj) return;

  const parishId = obj.metadata?.parish_id
    || obj.subscription_data?.metadata?.parish_id;

  if (!parishId) return; // not a stewardship event

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const status = event.type === "customer.subscription.deleted" ? "canceled" : obj.status;
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
    case "invoice.payment_failed": {
      const subId = obj.subscription;
      if (subId) {
        const reg = await loadRegistrationByStripeCustomer(env, obj.customer);
        if (reg && reg.stewardshipStripeSubscriptionId === subId) {
          await updateStewardshipStatus(env, reg.parishId, {
            status: "past_due",
            stripeSubscriptionId: subId,
            stripeCustomerId: obj.customer,
          });
        }
      }
      break;
    }
  }
}

async function updateStewardshipStatus(env, parishId, data) {
  // Load the registration, update stewardship fields, save back
  const reg = await env.AGAPAY_REGISTRATIONS.get("parish_id_index:" + parishId, { type: "json" });
  if (!reg) return;

  reg.stewardshipStatus = data.status;
  if (data.stripeSubscriptionId) reg.stewardshipStripeSubscriptionId = data.stripeSubscriptionId;
  if (data.stripeCustomerId) reg.stewardshipStripeCustomerId = data.stripeCustomerId;
  if (data.stripePriceId) reg.stewardshipStripePriceId = data.stripePriceId;
  if (data.currentPeriodEnd !== undefined) reg.stewardshipPeriodEnd = data.currentPeriodEnd;
  if (data.cancelAtPeriodEnd !== undefined) reg.stewardshipCancelAtPeriodEnd = data.cancelAtPeriodEnd;
  if (data.trialEnd !== undefined) reg.stewardshipTrialEnd = data.trialEnd;

  await env.AGAPAY_REGISTRATIONS.put("parish_id_index:" + parishId, JSON.stringify(reg));

  // Also maintain a reverse index: stripe customer → parish
  if (data.stripeCustomerId) {
    await env.AGAPAY_REGISTRATIONS.put(
      "stewardship_customer_index:" + data.stripeCustomerId,
      JSON.stringify({ parishId })
    );
  }

  // Bundled Stewardship Suite: sync D1 feature flag with subscription status
  if (hasProductionStore(env)) {
    const isActive = ["active", "trialing"].includes(data.status);
    if (isActive) {
      await env.AGAPAY_DB.prepare(`
        INSERT INTO parish_stewardship_settings (parish_id, has_stewardship_suite, stripe_subscription_item_id)
        VALUES (?, 1, ?)
        ON CONFLICT(parish_id) DO UPDATE SET
          has_stewardship_suite = 1,
          stripe_subscription_item_id = excluded.stripe_subscription_item_id,
          updated_at = datetime('now')
      `).bind(parishId, data.stripeSubscriptionItemId || null).run().catch(() => {});

      // Seed default giving funds (INSERT OR IGNORE — safe to call repeatedly)
      const defaults = [
        { name: "General Stewardship",    code: "stewardship", is_default: 1, sort_order: 0 },
        { name: "Candles / Vigil Lights", code: "candle",      is_default: 0, sort_order: 1 },
        { name: "Building Fund",          code: "building",    is_default: 0, sort_order: 2 },
        { name: "Poor Box / Alms",        code: "alms",        is_default: 0, sort_order: 3 },
        { name: "Campaign / Appeal",      code: "campaign",    is_default: 0, sort_order: 4 },
        { name: "Iconography Fund",       code: "iconography", is_default: 0, sort_order: 5 },
        { name: "Memorial / Panakhida",   code: "memorial",    is_default: 0, sort_order: 6 },
      ];
      await env.AGAPAY_DB.batch(
        defaults.map(f =>
          env.AGAPAY_DB.prepare(
            `INSERT OR IGNORE INTO giving_funds (parish_id, name, code, is_default, sort_order)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(parishId, f.name, f.code, f.is_default, f.sort_order)
        )
      ).catch(() => {});
    } else if (data.status === "canceled") {
      await env.AGAPAY_DB.prepare(`
        UPDATE parish_stewardship_settings
        SET has_stewardship_suite = 0, updated_at = datetime('now')
        WHERE parish_id = ?
      `).bind(parishId).run().catch(() => {});
    }
  }
}

async function loadRegistrationByStripeCustomer(env, customerId) {
  const idx = await env.AGAPAY_REGISTRATIONS.get("stewardship_customer_index:" + customerId, { type: "json" });
  if (!idx?.parishId) return null;
  return env.AGAPAY_REGISTRATIONS.get("parish_id_index:" + idx.parishId, { type: "json" });
}

// Stripe webhook signature verification (HMAC-SHA256)
// ─── D1 sub-record helpers ────────────────────────────────────────────────────

async function loadMeetingSubRecords(env, meetingId) {
  return Promise.all([
    d1All(env, "SELECT * FROM stewardship_agenda_items WHERE annual_meeting_id = ? ORDER BY sort_order", meetingId),
    d1All(env, "SELECT * FROM stewardship_reports WHERE annual_meeting_id = ? ORDER BY sort_order", meetingId),
    d1First(env, "SELECT * FROM stewardship_financial_summaries WHERE annual_meeting_id = ?", meetingId),
    d1All(env, "SELECT * FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ? ORDER BY sort_order", meetingId),
    d1All(env, "SELECT * FROM stewardship_nominees WHERE annual_meeting_id = ? ORDER BY sort_order", meetingId),
    d1All(env, "SELECT * FROM stewardship_resolutions WHERE annual_meeting_id = ? ORDER BY sort_order", meetingId),
  ]);
}

async function deleteMeetingSubRecords(env, meetingId) {
  await Promise.all([
    d1Run(env, "DELETE FROM stewardship_agenda_items WHERE annual_meeting_id = ?", meetingId),
    d1Run(env, "DELETE FROM stewardship_reports WHERE annual_meeting_id = ?", meetingId),
    d1Run(env, "DELETE FROM stewardship_financial_summaries WHERE annual_meeting_id = ?", meetingId),
    d1Run(env, "DELETE FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ?", meetingId),
    d1Run(env, "DELETE FROM stewardship_nominees WHERE annual_meeting_id = ?", meetingId),
    d1Run(env, "DELETE FROM stewardship_resolutions WHERE annual_meeting_id = ?", meetingId),
  ]);
}

async function saveMeetingSubRecords(env, meetingId, form) {
  const now = new Date().toISOString();

  // Agenda items
  const agendaTitles = [].concat(form.agenda_title || []);
  const agendaDurations = [].concat(form.agenda_duration || []);
  const agendaIds = [].concat(form.agenda_id || []);
  for (let i = 0; i < agendaTitles.length; i++) {
    if (!agendaTitles[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_agenda_items (id, annual_meeting_id, title, duration_minutes, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, await newId(), meetingId, agendaTitles[i].trim(), parseInt(agendaDurations[i]) || null, i, now);
  }

  // Reports
  const rTypes = [].concat(form.report_type || []);
  const rTitles = [].concat(form.report_title || []);
  const rBodies = [].concat(form.report_body || []);
  const rSignedBy = [].concat(form.report_signed_by || []);
  for (let i = 0; i < rTitles.length; i++) {
    if (!rTitles[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_reports (id, annual_meeting_id, report_type, title, body, created_by, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, await newId(), meetingId, rTypes[i] || "custom", rTitles[i].trim(), rBodies[i] || "", rSignedBy[i]?.trim() || null, i, now, now);
  }

  // Financial summary
  if (form.fin_income || form.fin_expense) {
    const income = displayToCents(form.fin_income);
    const expense = displayToCents(form.fin_expense);
    await d1Run(env, `
      INSERT INTO stewardship_financial_summaries
        (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents, notes, snapshot_taken_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, await newId(), meetingId, income, expense, income - expense, form.fin_notes || null, now, now, now);
  }

  // Restricted funds
  const fNames = [].concat(form.fund_name || []);
  const fBegin = [].concat(form.fund_begin || []);
  const fReceived = [].concat(form.fund_received || []);
  const fDisbursed = [].concat(form.fund_disbursed || []);
  const fEnding = [].concat(form.fund_ending || []);
  for (let i = 0; i < fNames.length; i++) {
    if (!fNames[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_restricted_fund_snapshots
        (id, annual_meeting_id, fund_name, beginning_balance_cents, total_received_cents,
         total_disbursed_cents, ending_balance_cents, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, await newId(), meetingId, fNames[i].trim(),
       displayToCents(fBegin[i]), displayToCents(fReceived[i]),
       displayToCents(fDisbursed[i]), displayToCents(fEnding[i]), i, now);
  }

  // Nominees
  const nNames = [].concat(form.nominee_name || []);
  const nPositions = [].concat(form.nominee_position || []);
  const nBios = [].concat(form.nominee_bio || []);
  const nNominatedBy = [].concat(form.nominee_nominated_by || []);
  for (let i = 0; i < nNames.length; i++) {
    if (!nNames[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_nominees (id, annual_meeting_id, full_name, position, bio, nominated_by, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, await newId(), meetingId, nNames[i].trim(), nPositions[i] || null, nBios[i]?.trim() || null, nNominatedBy[i]?.trim() || null, i, now);
  }

  // Resolutions
  const resTitles = [].concat(form.resolution_title || []);
  const resResolved = [].concat(form.resolution_resolved || []);
  for (let i = 0; i < resTitles.length; i++) {
    if (!resTitles[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_resolutions (id, annual_meeting_id, title, resolved_text, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, await newId(), meetingId, resTitles[i].trim(), resResolved[i] || null, i, now);
  }
}
