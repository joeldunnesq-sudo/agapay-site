// src/handlers/stewardship-presentation.js
// Stewardship HTML pages and annual-meeting packet rendering.

import { stewardshipStatus } from '../lib/core.js';
import { stewardshipToolAccess as hasStewardshipToolAccess } from '../lib/entitlements.js';
import { absoluteWebsiteUrl } from './parish.js';
import {
  centsToDisplay,
  dashboardNav,
  escAttr,
  escHtml,
  packetLineCount,
  registrationAddressLine,
  stewardshipSessionScript,
} from './stewardship-http.js';

export function paywallHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stewardship Health — AGAPAY</title></head><body><main><h1>Stewardship Health is included in Give +</h1><p>Choose Give + or Parish in your dashboard settings to access stewardship reports, pledge context, and giving-health insights.</p><a href="/parish/dashboard">Review current plans</a></main></body></html>`;
}

// ─── Module home (when subscribed) ───────────────────────────────────────────

export function stewardshipHomeHtml(registration, meetings, env) {
  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const status = stewardshipStatus(registration);
  const statusLabel =
    {
      active: 'Active',
      trialing: 'Trial',
      past_due: 'Past Due',
      canceled: 'Canceled',
      unpaid: 'Unpaid',
      incomplete: 'Incomplete',
    }[status] || status;
  const statusColor = hasStewardshipToolAccess(registration) ? 'var(--green, #4ade80)' : 'var(--red, #f87171)';

  const meetingRows =
    meetings
      .map(
        (m) => `
    <tr>
      <td><a href="/parish/stewardship/annual-meetings/${m.id}">${escHtml(m.title)}</a></td>
      <td>${m.fiscal_year}</td>
      <td>${m.meeting_date || '—'}</td>
      <td><span class="status-badge status-${m.status}">${m.status}</span></td>
      <td>
        <a href="/parish/stewardship/annual-meetings/${m.id}">Edit</a> ·
        <a href="/parish/stewardship/annual-meetings/${m.id}/preview">Preview</a>
      </td>
    </tr>`
      )
      .join('') ||
    `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No annual meetings yet. <a href="/parish/stewardship/annual-meetings/new">Create your first packet →</a></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AGAPAY Stewardship</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <link rel="stylesheet" href="${base}/styles/stewardship.css" />
</head>
<body class="dashboard-body">
  <div class="dashboard-shell">
    ${dashboardNav(registration, 'stewardship', base)}
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

      <!-- ── Stewardship Reports ── -->
      <section class="module-card" id="giving-metrics-card">
        <div class="module-card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
          <h2>📊 Stewardship Reports</h2>
          <div style="display:flex;align-items:center;gap:.75rem">
            <select id="giving-year-select" class="form-select" style="font-size:.85rem;padding:.3rem .6rem" onchange="loadGivingMetrics()">
              ${[0, 1, 2, 3, 4]
                .map((n) => {
                  const y = new Date().getFullYear() - n;
                  return `<option value="${y}">${y}</option>`;
                })
                .join('')}
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
          <p style="color:var(--text-muted);margin:0 0 1rem;font-size:.9rem">Stewardship Reports are included with the Parish tier.</p>
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

export function billingHtml(registration, subscription, env) {
  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const status = stewardshipStatus(registration);
  const periodEnd = registration.stewardshipPeriodEnd
    ? new Date(registration.stewardshipPeriodEnd * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AGAPAY Stewardship Billing</title>
  <link rel="stylesheet" href="${base}/site-chrome.css" />
  <link rel="stylesheet" href="${base}/parish/style.css" />
  <link rel="stylesheet" href="${base}/styles/stewardship.css" />
</head>
<body class="dashboard-body">
  <div class="dashboard-shell">
    ${dashboardNav(registration, 'stewardship', base)}
    <main class="dashboard-main">
      <div class="page-header">
        <div>
          <h1>AGAPAY Stewardship Billing</h1>
          <p style="color:var(--text-muted);margin:0"><a href="/parish/stewardship">← Back to Stewardship</a></p>
        </div>
      </div>

      <div class="module-card" style="max-width:520px">
        <table class="info-table">
          <tr><th>Plan</th><td>AGAPAY Stewardship</td></tr>
          <tr><th>Status</th><td><strong>${escHtml(status)}</strong></td></tr>
          <tr><th>Renewal Date</th><td>${periodEnd}</td></tr>
          ${registration.stewardshipCancelAtPeriodEnd ? `<tr><th></th><td style="color:var(--red,#f87171)">Cancels at end of period</td></tr>` : ''}
        </table>

        ${
          hasStewardshipToolAccess(registration)
            ? `
        <div style="margin-top:1.5rem">
          <form method="POST" action="/parish/stewardship/billing-portal">
            <button type="submit" class="btn btn-secondary">Manage Billing in Stripe →</button>
          </form>
        </div>`
            : `
        <div style="margin-top:1.5rem">
          <a href="/parish/stewardship" class="btn btn-primary">Back to Stewardship →</a>
        </div>`
        }
      </div>
    </main>
  </div>
  ${stewardshipSessionScript()}
</body>
</html>`;
}

// ─── Annual meeting list / new / edit ─────────────────────────────────────────

export function annualMeetingFormHtml(
  registration,
  meeting,
  agendaItems,
  reports,
  financialSummary,
  restrictedFunds,
  nominees,
  resolutions,
  env
) {
  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const isNew = !meeting;
  const title = isNew ? 'New Annual Meeting Packet' : `Edit: ${meeting.title}`;
  const action = isNew
    ? '/parish/stewardship/annual-meetings/new'
    : `/parish/stewardship/annual-meetings/${meeting.id}`;
  const parishName = registration.parishName || registration.name || '';
  const currentYear = new Date().getFullYear();

  const agendaHtml = (agendaItems || [])
    .map(
      (item, i) => `
    <div class="agenda-row" data-index="${i}">
      <input type="hidden" name="agenda_id[]" value="${escAttr(item.id || '')}" />
      <input class="form-input" type="text" name="agenda_title[]" value="${escAttr(item.title)}" placeholder="Agenda item" required />
      <input class="form-input" type="number" name="agenda_duration[]" value="${item.duration_minutes || ''}" placeholder="Min" style="width:80px" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`
    )
    .join('');

  const reportEntries = Array.isArray(reports) ? [...reports] : [];
  [
    { report_type: 'brotherhood', title: 'Brotherhood Report', body: '', created_by: '' },
    { report_type: 'sisterhood', title: 'Sisterhood Report', body: '', created_by: '' },
  ].forEach((required) => {
    if (!reportEntries.some((report) => report.report_type === required.report_type)) reportEntries.push(required);
  });
  const reportsHtml = reportEntries
    .map(
      (r, i) => `
    <div class="report-row">
      <input type="hidden" name="report_id[]" value="${escAttr(r.id || '')}" />
      <select name="report_type[]" class="form-select">
        ${['priest', 'warden', 'treasurer', 'stewardship', 'brotherhood', 'sisterhood', 'ministry', 'custom']
          .map(
            (t) =>
              `<option value="${t}"${r.report_type === t ? ' selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
          )
          .join('')}
      </select>
      <input class="form-input" type="text" name="report_title[]" value="${escAttr(r.title)}" placeholder="Report title" required />
      <textarea class="form-textarea" name="report_body[]" rows="4" placeholder="Report content…">${escHtml(r.body || '')}</textarea>
      <input class="form-input" type="text" name="report_signed_by[]" value="${escAttr(r.created_by || '')}" placeholder="Leader / presenter (optional)" aria-label="Report leader or presenter" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`
    )
    .join('');

  const fundsHtml = (restrictedFunds || [])
    .map(
      (f, i) => `
    <div class="fund-row">
      <input type="hidden" name="fund_id[]" value="${escAttr(f.id || '')}" />
      <input class="form-input" type="text" name="fund_name[]" value="${escAttr(f.fund_name || '')}" placeholder="Fund name" required />
      <input class="form-input" type="number" name="fund_begin[]" value="${centsToDisplay(f.beginning_balance_cents)}" placeholder="Beginning" step="0.01" />
      <input class="form-input" type="number" name="fund_received[]" value="${centsToDisplay(f.total_received_cents)}" placeholder="Received" step="0.01" />
      <input class="form-input" type="number" name="fund_disbursed[]" value="${centsToDisplay(f.total_disbursed_cents)}" placeholder="Disbursed" step="0.01" />
      <input class="form-input" type="number" name="fund_ending[]" value="${centsToDisplay(f.ending_balance_cents)}" placeholder="Ending" step="0.01" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`
    )
    .join('');

  const nomineesHtml = (nominees || [])
    .map(
      (n, i) => `
    <div class="nominee-row">
      <input type="hidden" name="nominee_id[]" value="${escAttr(n.id || '')}" />
      <input class="form-input" type="text" name="nominee_name[]" value="${escAttr(n.full_name || '')}" placeholder="Full name" required />
      <input class="form-input" type="text" name="nominee_position[]" value="${escAttr(n.position || '')}" placeholder="Position (e.g. Warden)" />
      <textarea class="form-textarea" name="nominee_bio[]" rows="2" placeholder="Short bio (optional)">${escHtml(n.bio || '')}</textarea>
      <input class="form-input" type="text" name="nominee_nominated_by[]" value="${escAttr(n.nominated_by || '')}" placeholder="Nominated by (optional)" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`
    )
    .join('');

  const resolutionsHtml = (resolutions || [])
    .map(
      (r, i) => `
    <div class="resolution-row">
      <input type="hidden" name="resolution_id[]" value="${escAttr(r.id || '')}" />
      <input class="form-input" type="text" name="resolution_title[]" value="${escAttr(r.title || '')}" placeholder="Resolution title" required />
      <textarea class="form-textarea" name="resolution_resolved[]" rows="2" placeholder="RESOLVED THAT…">${escHtml(r.resolved_text || '')}</textarea>
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
    </div>`
    )
    .join('');

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
    ${dashboardNav(registration, 'stewardship', base)}
    <main class="dashboard-main">
      <div class="page-header">
        <div>
          <h1>${escHtml(title)}</h1>
          <p style="color:var(--text-muted);margin:0"><a href="/parish/stewardship">← Back to Stewardship</a></p>
        </div>
        ${
          !isNew
            ? `<div style="display:flex;gap:.75rem">
          <a href="/parish/stewardship/annual-meetings/${meeting.id}/preview" class="btn btn-secondary">Preview</a>
          <a href="/parish/stewardship/annual-meetings/${meeting.id}/pdf" class="btn btn-ghost" target="_blank">Download PDF</a>
        </div>`
            : ''
        }
      </div>

      <form method="POST" action="${action}" class="stewardship-form">
        <!-- SECTION: Meeting Details -->
        <section class="form-section">
          <h2>Meeting Details</h2>
          <div class="form-grid">
            <label class="form-field">
              <span>Packet Title</span>
              <input class="form-input" type="text" name="title" value="${escAttr(meeting?.title || parishName + ' Annual Parish Meeting')}" required />
            </label>
            <label class="form-field">
              <span>Fiscal Year</span>
              <input class="form-input" type="number" name="fiscal_year" value="${meeting?.fiscal_year || currentYear}" min="2000" max="2100" required />
            </label>
            <label class="form-field">
              <span>Meeting Date</span>
              <input class="form-input" type="date" name="meeting_date" value="${escAttr(meeting?.meeting_date || '')}" />
            </label>
            <label class="form-field">
              <span>Meeting Time</span>
              <input class="form-input" type="time" name="meeting_time" value="${escAttr(meeting?.meeting_time || '')}" />
            </label>
            <label class="form-field form-field--full">
              <span>Location</span>
              <input class="form-input" type="text" name="location" value="${escAttr(meeting?.location || (isNew && parishName ? `${parishName} Parish Hall` : ''))}" placeholder="e.g. Parish Hall" />
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
              <input class="form-input" type="text" name="jurisdiction" value="${escAttr(meeting?.jurisdiction || registration.jurisdiction || '')}" />
            </label>
            <label class="form-field form-field--full">
              <span>Address</span>
              <input class="form-input" type="text" name="address" value="${escAttr(meeting?.address || registrationAddressLine(registration) || '')}" />
            </label>
          </div>
        </section>

        <section class="form-section">
          <h2>Printed Packet Layout</h2>
          <p class="section-note">Choose how much handwriting space to include in the finished packet.</p>
          <div class="form-grid">
            <label class="form-field">
              <span>Sign-in Lines</span>
              <input class="form-input" type="number" name="signature_line_count" min="1" max="200" value="${packetLineCount(meeting?.signature_line_count, 24, { min: 1 })}" />
              <small>Numbered attendee signature rows on the sign-in sheet.</small>
            </label>
            <label class="form-field">
              <span>Note-taking Lines</span>
              <input class="form-input" type="number" name="note_line_count" min="0" max="200" value="${packetLineCount(meeting?.note_line_count, 12)}" />
              <small>Blank ruled lines on the meeting-minutes page.</small>
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
              <textarea class="form-textarea" name="fin_notes" rows="3" placeholder="Budget notes, audit status, etc.">${escHtml(financialSummary?.notes || '')}</textarea>
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
      report: () => \`<div class="report-row"><input type="hidden" name="report_id[]" value="" /><select name="report_type[]" class="form-select"><option>priest</option><option>warden</option><option>treasurer</option><option>stewardship</option><option>brotherhood</option><option>sisterhood</option><option>ministry</option><option>custom</option></select><input class="form-input" type="text" name="report_title[]" placeholder="Report title" required /><textarea class="form-textarea" name="report_body[]" rows="4" placeholder="Report content…"></textarea><input class="form-input" type="text" name="report_signed_by[]" placeholder="Leader / presenter (optional)" aria-label="Report leader or presenter" /><button type="button" class="btn btn-ghost btn-sm remove-row">✕</button></div>\`,
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
