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
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from "../lib/core.js";

import {
  absoluteWebsiteUrl,
  loadRegistrationByReference,
  saveRegistrationRecord,
  findRegistrationByParishId,
  verifyParishDashboardBearer,
} from "./parish.js";

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
  return { ok: true, registration: found.registration };
}

async function requireParishApiContext(request, env, parishId) {
  const token = getBearerToken(request);
  if (!parishId || !token) return { ok: false, response: unauthorized() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: json({ error: "Parish not found" }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, registration: found.registration };
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const STEWARDSHIP_PRODUCT_KEY = "stewardship";

// Active subscription states that unlock the module
const ACTIVE_STATES = new Set(["active", "trialing"]);

// ─── Subscription helpers ─────────────────────────────────────────────────────

export function stewardshipStatus(registration) {
  return registration?.stewardshipStatus || "no_subscription";
}

export function hasStewardshipAccess(registration) {
  return ACTIVE_STATES.has(stewardshipStatus(registration));
}

function stewardshipPublicStatus(registration) {
  return {
    status: stewardshipStatus(registration),
    active: hasStewardshipAccess(registration),
    cancelAtPeriodEnd: Boolean(registration?.stewardshipCancelAtPeriodEnd),
    currentPeriodEnd: registration?.stewardshipPeriodEnd || null,
    trialEnd: registration?.stewardshipTrialEnd || null,
    customerConfigured: Boolean(registration?.stewardshipStripeCustomerId),
    subscriptionConfigured: Boolean(registration?.stewardshipStripeSubscriptionId)
  };
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
  const statusColor = ACTIVE_STATES.has(status) ? "var(--green, #4ade80)" : "var(--red, #f87171)";

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

        ${ACTIVE_STATES.has(status) ? `
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
              <input class="form-input" type="text" name="location" value="${escAttr(meeting?.location || "")}" placeholder="e.g. Parish Hall" />
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
              <input class="form-input" type="text" name="address" value="${escAttr(meeting?.address || registration.address || "")}" />
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
      report: () => \`<div class="report-row"><input type="hidden" name="report_id[]" value="" /><select name="report_type[]" class="form-select"><option>priest</option><option>warden</option><option>treasurer</option><option>stewardship</option><option>ministry</option><option>custom</option></select><input class="form-input" type="text" name="report_title[]" placeholder="Report title" required /><textarea class="form-textarea" name="report_body[]" rows="4" placeholder="Report content…"></textarea><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
      fund: () => \`<div class="fund-row"><input type="hidden" name="fund_id[]" value="" /><input class="form-input" type="text" name="fund_name[]" placeholder="Fund name" required /><input class="form-input" type="number" name="fund_begin[]" placeholder="Beginning" step="0.01" /><input class="form-input" type="number" name="fund_received[]" placeholder="Received" step="0.01" /><input class="form-input" type="number" name="fund_disbursed[]" placeholder="Disbursed" step="0.01" /><input class="form-input" type="number" name="fund_ending[]" placeholder="Ending" step="0.01" /><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
      nominee: () => \`<div class="nominee-row"><input type="hidden" name="nominee_id[]" value="" /><input class="form-input" type="text" name="nominee_name[]" placeholder="Full name" required /><input class="form-input" type="text" name="nominee_position[]" placeholder="Position" /><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
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
  const base = absoluteWebsiteUrl(env);
  const parishName = meeting.parish_name_override || registration.parishName || registration.name || "Parish";
  const jurisdiction = meeting.jurisdiction || registration.jurisdiction || "";
  const address = meeting.address || registration.address || "";
  const meetingDate = meeting.meeting_date
    ? new Date(meeting.meeting_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "Date TBD";
  const meetingTime = meeting.meeting_time || "";
  const location = meeting.location || "";

  const formatMoney = (cents) => cents
    ? "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "$0.00";

  const agendaSection = agendaItems?.length ? `
    <section class="packet-section">
      <h2>Order of Business — Agenda</h2>
      <ol class="agenda-list">
        ${agendaItems.map((item, i) => `<li>
          <strong>${escHtml(item.title)}</strong>
          ${item.duration_minutes ? `<span class="duration">(${item.duration_minutes} min)</span>` : ""}
        </li>`).join("")}
      </ol>
    </section>` : "";

  const reportsSection = reports?.length ? reports.map(r => `
    <section class="packet-section report-section">
      <h2>${escHtml(r.title)}</h2>
      <div class="report-body">${r.body ? r.body.split("\n").filter(Boolean).map(p => `<p>${escHtml(p)}</p>`).join("") : "<p><em>[Report content will appear here.]</em></p>"}</div>
    </section>`).join("") : "";

  const finSection = financialSummary ? `
    <section class="packet-section">
      <h2>Financial Summary — Fiscal Year ${meeting.fiscal_year}</h2>
      <table class="fin-table">
        <tr><th>Total Income</th><td>${formatMoney(financialSummary.total_income_cents)}</td></tr>
        <tr><th>Total Expenses</th><td>${formatMoney(financialSummary.total_expense_cents)}</td></tr>
        <tr class="net-row"><th>Net</th><td>${formatMoney(financialSummary.net_cents)}</td></tr>
      </table>
      ${financialSummary.notes ? `<p class="fin-notes">${escHtml(financialSummary.notes)}</p>` : ""}
    </section>` : "";

  const fundsSection = restrictedFunds?.length ? `
    <section class="packet-section">
      <h2>Restricted Fund Report</h2>
      <table class="funds-table">
        <thead><tr><th>Fund</th><th>Beginning</th><th>Received</th><th>Disbursed</th><th>Ending</th></tr></thead>
        <tbody>
          ${restrictedFunds.map(f => `<tr>
            <td>${escHtml(f.fund_name)}</td>
            <td>${formatMoney(f.beginning_balance_cents)}</td>
            <td>${formatMoney(f.total_received_cents)}</td>
            <td>${formatMoney(f.total_disbursed_cents)}</td>
            <td>${formatMoney(f.ending_balance_cents)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>` : "";

  const nomineesSection = nominees?.length ? `
    <section class="packet-section">
      <h2>Parish Council Nominations</h2>
      <ul class="nominees-list">
        ${nominees.map(n => `<li><strong>${escHtml(n.full_name)}</strong>${n.position ? ` — ${escHtml(n.position)}` : ""}</li>`).join("")}
      </ul>
    </section>` : "";

  const resolutionsSection = resolutions?.length ? `
    <section class="packet-section">
      <h2>Proposed Resolutions</h2>
      ${resolutions.map((r, i) => `
        <div class="resolution-item">
          <h3>Resolution ${i + 1}: ${escHtml(r.title)}</h3>
          ${r.resolved_text ? `<blockquote class="resolved-text">RESOLVED THAT ${escHtml(r.resolved_text)}</blockquote>` : ""}
        </div>`).join("")}
    </section>` : "";

  const signInSection = `
    <section class="packet-section page-break">
      <h2>Sign-In Sheet</h2>
      <p><em>Please print and bring to the annual meeting.</em></p>
      <table class="signin-table">
        <thead><tr><th>#</th><th>Name (Print)</th><th>Signature</th><th>Email</th></tr></thead>
        <tbody>
          ${Array.from({length: 20}, (_, i) => `<tr><td>${i+1}</td><td></td><td></td><td></td></tr>`).join("")}
        </tbody>
      </table>
    </section>`;

  const navBar = isPdf ? "" : `
    <div class="preview-toolbar">
      <a href="/parish/stewardship/annual-meetings/${meeting.id}" class="btn btn-ghost">← Edit</a>
      <a href="/parish/stewardship/annual-meetings/${meeting.id}/pdf" class="btn btn-primary" target="_blank">Download PDF</a>
      <button onclick="window.print()" class="btn btn-secondary">Print</button>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(meeting.title)} — Annual Meeting Packet</title>
  <link rel="stylesheet" href="${base}/styles/stewardship-packet.css" />
  ${isPdf ? "" : `<link rel="stylesheet" href="${base}/site-chrome.css" />`}
  <style>
    @media print {
      .preview-toolbar { display: none !important; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body class="${isPdf ? "pdf-body" : "preview-body"}">
  ${navBar}
  <div class="packet-container">
    <!-- Cover Page -->
    <div class="packet-cover ${isPdf ? "page-break" : ""}">
      <div class="cover-content">
        <p class="cover-jurisdiction">${escHtml(jurisdiction)}</p>
        <h1 class="cover-parish">${escHtml(parishName)}</h1>
        <div class="cover-rule"></div>
        <h2 class="cover-title">${escHtml(meeting.title)}</h2>
        <p class="cover-year">Fiscal Year ${meeting.fiscal_year}</p>
        <div class="cover-details">
          ${meetingDate ? `<p>${meetingDate}${meetingTime ? " at " + meetingTime : ""}</p>` : ""}
          ${location ? `<p>${escHtml(location)}</p>` : ""}
          ${address ? `<p>${escHtml(address)}</p>` : ""}
        </div>
      </div>
    </div>

    <!-- Body sections -->
    <section class="packet-section page-break">
      <h2>Notice of Annual Parish Meeting</h2>
      <p>Notice is hereby given that the Annual Parish Meeting of <strong>${escHtml(parishName)}</strong> will be held on <strong>${meetingDate}</strong>${meetingTime ? " at " + meetingTime : ""}${location ? " at " + escHtml(location) : ""}.</p>
      <p>The purpose of the meeting is to receive annual reports, review the financial statement, elect parish council members, consider resolutions, and transact such other business as may properly come before the meeting.</p>
    </section>

    ${agendaSection}

    <section class="packet-section page-break">
      <h2>Opening Prayer</h2>
      <p><em>[The meeting will be opened with prayer led by the Rector or a designated clergy member.]</em></p>
    </section>

    <section class="packet-section">
      <h2>Minutes of Prior Annual Meeting</h2>
      <p><em>[Minutes of the prior annual meeting to be read and approved.]</em></p>
    </section>

    ${reportsSection}
    ${finSection}
    ${fundsSection}
    ${nomineesSection}
    ${resolutionsSection}
    ${signInSection}

    <section class="packet-section page-break">
      <h2>Minutes Template</h2>
      <p><strong>Minutes of the Annual Meeting of ${escHtml(parishName)}</strong></p>
      <p>Date: ${meetingDate} &nbsp;&nbsp; Location: ${escHtml(location)}</p>
      <p>The meeting was called to order at _______. The following were present: _______ members.</p>
      <p>The Rector opened the meeting in prayer.</p>
      <p><em>[Record proceedings here.]</em></p>
      <br/><br/>
      <p>Respectfully submitted,</p>
      <p>_______________________________</p>
      <p>Parish Secretary</p>
    </section>

    <div class="packet-footer">
      <p>Generated by AGAPAY Stewardship · agapay.app · ${new Date().toLocaleDateString()}</p>
    </div>
  </div>

  ${isPdf ? "" : `
  <script>
    // Auto-trigger print dialog for PDF download
    if (window.location.hash === '#print') window.print();
  </script>`}
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
      <li class="${activeSection === "giving" ? "active" : ""}"><a href="/parish/giving">Giving</a></li>
      <li class="${activeSection === "commemorations" ? "active" : ""}"><a href="/parish/commemorations">Commemorations</a></li>
      <li class="${activeSection === "campaigns" ? "active" : ""}"><a href="/parish/campaigns">Campaigns</a></li>
      <li class="${activeSection === "stewardship" ? "active" : ""}"><a href="/parish/stewardship">Stewardship</a></li>
      <li class="${activeSection === "settings" ? "active" : ""}"><a href="/parish/settings">Settings</a></li>
    </ul>
  </nav>`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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
      body: item.body || ""
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
      bio: item.bio || ""
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

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function handleParishStewardshipSummary(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  let meetings = [];
  let setupRequired = false;
  try {
    meetings = await d1All(env, `
      SELECT id, title, fiscal_year, meeting_date, status, created_at, updated_at
      FROM stewardship_annual_meetings
      WHERE parish_id = ?
      ORDER BY fiscal_year DESC, created_at DESC
      LIMIT 50
    `, [registration.parishId]);
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
  const { registration } = ctx;

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
    await saveRegistrationRecord(env, registration);
  }

  const session = await stripePlatformPost(env, "/checkout/sessions", {
    customer: customerId,
    mode: "subscription",
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
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
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
      `, [registration.parishId]);
    } catch (error) {
      if (!isMissingStewardshipSchema(error)) throw error;
      return json({ ok: false, error: "Stewardship database tables are not installed yet.", setupRequired: true }, { status: 503 });
    }
    return json({ ok: true, meetings: (meetings || []).map(publicMeeting) });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
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
  `, [
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
  ]);

  await saveMeetingSubRecords(env, meetingId, form);
  return handleParishStewardshipMeetingDetail(request, env, parishId, meetingId);
}

export async function handleParishStewardshipMeetingDetail(request, env, parishId, meetingId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (!hasStewardshipAccess(registration)) {
    return json({ error: "Stewardship subscription required.", stewardship: stewardshipPublicStatus(registration) }, { status: 402 });
  }

  const meeting = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    [meetingId, registration.parishId]
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
  `, [
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
  ]);
  await deleteMeetingSubRecords(env, meetingId);
  await saveMeetingSubRecords(env, meetingId, form);

  const updated = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    [meetingId, registration.parishId]
  );
  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
    await loadMeetingSubRecords(env, meetingId);
  return json({
    ok: true,
    meeting: publicMeetingDetails(updated, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions)
  });
}

// GET /parish/stewardship
export async function handleStewardshipHome(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;

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
  `, [registration.parishId]);

  return new Response(stewardshipHomeHtml(registration, meetings || [], env), {
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}

// POST /parish/stewardship/subscribe
export async function handleStewardshipSubscribe(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;

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
    await saveRegistrationRecord(env, registration);
  }

  // Create Stripe Checkout Session
  const session = await stripePlatformPost(env, "/checkout/sessions", {
    customer: customerId,
    mode: "subscription",
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
  `, [
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
  ]);

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

  if (!hasStewardshipAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship", 303);
  }

  const meeting = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    [meetingId, registration.parishId]
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
  `, [
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
  ]);

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

  if (!hasStewardshipAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env) + "/parish/stewardship", 303);
  }

  const meeting = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    [meetingId, registration.parishId]
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

  if (!hasStewardshipAccess(registration)) {
    return unauthorized("Stewardship subscription required");
  }

  const meeting = await d1First(env,
    "SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
    [meetingId, registration.parishId]
  );
  if (!meeting) return json({ error: "Not found" }, { status: 404 });

  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
    await loadMeetingSubRecords(env, meetingId);

  // Log generation
  await d1Run(env, `
    INSERT INTO stewardship_generated_packets (id, annual_meeting_id, generated_by, generated_at)
    VALUES (?, ?, ?, ?)
  `, [await newId(), meetingId, ctx.userEmail || null, new Date().toISOString()]);

  // Update status to generated
  await d1Run(env,
    "UPDATE stewardship_annual_meetings SET status = 'generated', updated_at = ? WHERE id = ?",
    [new Date().toISOString(), meetingId]
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

export async function handleStewardshipWebhook(request, env) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") || "";
  const secret = env.STEWARDSHIP_STRIPE_WEBHOOK_SECRET;

  // Verify signature
  if (secret) {
    const valid = await verifyStripeWebhookSignature(body, sig, secret);
    if (!valid) return json({ error: "Invalid signature" }, { status: 400 });
  }

  let event;
  try { event = JSON.parse(body); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }

  // Deduplicate
  const claimed = await claimStripeEvent(env, "sw_" + event.id);
  if (!claimed) return json({ received: true });

  try {
    await processWebhookEvent(event, env);
  } finally {
    await finishStripeEvent(env, "sw_" + event.id);
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
}

async function loadRegistrationByStripeCustomer(env, customerId) {
  const idx = await env.AGAPAY_REGISTRATIONS.get("stewardship_customer_index:" + customerId, { type: "json" });
  if (!idx?.parishId) return null;
  return env.AGAPAY_REGISTRATIONS.get("parish_id_index:" + idx.parishId, { type: "json" });
}

// Stripe webhook signature verification (HMAC-SHA256)
async function verifyStripeWebhookSignature(payload, sigHeader, secret) {
  try {
    const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=")));
    const timestamp = parts.t;
    const sig = parts.v1;
    if (!timestamp || !sig) return false;

    const signedPayload = timestamp + "." + payload;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const computed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const hex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Constant-time compare
    if (hex.length !== sig.length) return false;
    let mismatch = 0;
    for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
    return mismatch === 0;
  } catch { return false; }
}

// ─── D1 sub-record helpers ────────────────────────────────────────────────────

async function loadMeetingSubRecords(env, meetingId) {
  return Promise.all([
    d1All(env, "SELECT * FROM stewardship_agenda_items WHERE annual_meeting_id = ? ORDER BY sort_order", [meetingId]),
    d1All(env, "SELECT * FROM stewardship_reports WHERE annual_meeting_id = ? ORDER BY sort_order", [meetingId]),
    d1First(env, "SELECT * FROM stewardship_financial_summaries WHERE annual_meeting_id = ?", [meetingId]),
    d1All(env, "SELECT * FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ? ORDER BY sort_order", [meetingId]),
    d1All(env, "SELECT * FROM stewardship_nominees WHERE annual_meeting_id = ? ORDER BY sort_order", [meetingId]),
    d1All(env, "SELECT * FROM stewardship_resolutions WHERE annual_meeting_id = ? ORDER BY sort_order", [meetingId]),
  ]);
}

async function deleteMeetingSubRecords(env, meetingId) {
  await Promise.all([
    d1Run(env, "DELETE FROM stewardship_agenda_items WHERE annual_meeting_id = ?", [meetingId]),
    d1Run(env, "DELETE FROM stewardship_reports WHERE annual_meeting_id = ?", [meetingId]),
    d1Run(env, "DELETE FROM stewardship_financial_summaries WHERE annual_meeting_id = ?", [meetingId]),
    d1Run(env, "DELETE FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ?", [meetingId]),
    d1Run(env, "DELETE FROM stewardship_nominees WHERE annual_meeting_id = ?", [meetingId]),
    d1Run(env, "DELETE FROM stewardship_resolutions WHERE annual_meeting_id = ?", [meetingId]),
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
    `, [await newId(), meetingId, agendaTitles[i].trim(), parseInt(agendaDurations[i]) || null, i, now]);
  }

  // Reports
  const rTypes = [].concat(form.report_type || []);
  const rTitles = [].concat(form.report_title || []);
  const rBodies = [].concat(form.report_body || []);
  for (let i = 0; i < rTitles.length; i++) {
    if (!rTitles[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_reports (id, annual_meeting_id, report_type, title, body, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [await newId(), meetingId, rTypes[i] || "custom", rTitles[i].trim(), rBodies[i] || "", i, now, now]);
  }

  // Financial summary
  if (form.fin_income || form.fin_expense) {
    const income = displayToCents(form.fin_income);
    const expense = displayToCents(form.fin_expense);
    await d1Run(env, `
      INSERT INTO stewardship_financial_summaries
        (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents, notes, snapshot_taken_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [await newId(), meetingId, income, expense, income - expense, form.fin_notes || null, now, now, now]);
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
    `, [await newId(), meetingId, fNames[i].trim(),
       displayToCents(fBegin[i]), displayToCents(fReceived[i]),
       displayToCents(fDisbursed[i]), displayToCents(fEnding[i]), i, now]);
  }

  // Nominees
  const nNames = [].concat(form.nominee_name || []);
  const nPositions = [].concat(form.nominee_position || []);
  for (let i = 0; i < nNames.length; i++) {
    if (!nNames[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_nominees (id, annual_meeting_id, full_name, position, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [await newId(), meetingId, nNames[i].trim(), nPositions[i] || null, i, now]);
  }

  // Resolutions
  const resTitles = [].concat(form.resolution_title || []);
  const resResolved = [].concat(form.resolution_resolved || []);
  for (let i = 0; i < resTitles.length; i++) {
    if (!resTitles[i]?.trim()) continue;
    await d1Run(env, `
      INSERT INTO stewardship_resolutions (id, annual_meeting_id, title, resolved_text, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [await newId(), meetingId, resTitles[i].trim(), resResolved[i] || null, i, now]);
  }
}
