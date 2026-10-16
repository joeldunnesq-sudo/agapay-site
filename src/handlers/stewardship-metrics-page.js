// Generated from src/handlers/stewardship-metrics-page.ts by npm run build:server. Do not edit.
import { hasProductionStore, missingProductionStoreResponse } from '../lib/core.js';
import '../lib/entitlements.js';
import { absoluteWebsiteUrl } from './parish.js';
import './admin.js';
import '../lib/core.js';
import { dashboardNav, escHtml, stewardshipSessionScript } from './stewardship-http.js';
import { paywallHtml } from './stewardship-presentation.js';
import './stewardship-packet-presentation.js';
import './stewardship-financials.js';
import './stewardship-communications.js';
import './stewardship-shared.js';
import { requireParishContext, hasStewardshipToolAccess } from './stewardship-shared.js';
import './stewardship-billing.js';
import './stewardship.js';
import './stewardship-meeting-api.js';
import './stewardship-meeting-pages.js';
import './stewardship-meeting-storage.js';
async function handleStewardshipGivingMetricsPage(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (!hasStewardshipToolAccess(registration)) {
    return new Response(paywallHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const parishName = registration.parishName || registration.name || 'Parish';
  const currentYear = /* @__PURE__ */ new Date().getFullYear();
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
  <\/script>
  ${stewardshipSessionScript()}
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}
export { handleStewardshipGivingMetricsPage };
