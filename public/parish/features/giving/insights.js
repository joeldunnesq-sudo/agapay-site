'use strict';

/* global currentParish, isParishTier, isParishPlusActive, authHeaders, renderStewardshipFees */
/* exported loadGivingOverviewInsights, swGivingSourceComparison */

let givingOverviewInsightRequest = 0;
let givingOverviewInsightParish = '';

async function loadGivingOverviewInsights() {
  const section = document.getElementById('givingOverviewInsights');
  if (!section) return;
  if (!section.children.length)
    section.innerHTML = `<div class="gi-toolbar"><div><span class="gi-eyebrow">A clearer picture of generosity</span><h2>Giving at a glance</h2></div><label>Reporting year<input id="givingOverviewInsightYear" type="number" min="2000" step="1" required onchange="loadGivingOverviewInsights()" /></label></div><div class="gi-grid"><div id="givingOverviewComparison" aria-live="polite"></div><div id="givingOverviewFees" aria-live="polite"></div></div>`;
  const request = ++givingOverviewInsightRequest;
  const parishId = currentParish?.parishId;
  section.hidden = !parishId || (!isParishTier() && !isParishPlusActive());
  if (section.hidden) return;
  const selector = document.getElementById('givingOverviewInsightYear');
  if (givingOverviewInsightParish !== parishId) {
    givingOverviewInsightParish = parishId;
    const year = new Date().getFullYear();
    selector.max = String(year);
    selector.value = String(year);
  }
  if (!selector.reportValidity()) return;
  const year = Number(selector.value);
  const panels = [
    ['givingOverviewComparison', 'summary', (data) => swGivingSourceComparison(data, year)],
    ['givingOverviewFees', 'health-score', (data) => renderStewardshipFees(data.processing_fees, true)],
  ];
  await Promise.all(
    panels.map(async ([id, endpoint, render]) => {
      const pane = document.getElementById(id);
      pane.innerHTML = '<p class="sw-chart-note" role="status">Loading giving insights…</p>';
      try {
        const response = await fetch(
          '/api/parish/dashboard/' + encodeURIComponent(parishId) + '/stewardship/giving/' + endpoint + '?year=' + year,
          { headers: authHeaders() }
        );
        const data = await response.json();
        if (!response.ok || data.error) throw new Error('Report unavailable');
        if (request !== givingOverviewInsightRequest || currentParish?.parishId !== parishId) return;
        pane.innerHTML = render(data);
      } catch {
        if (request !== givingOverviewInsightRequest || currentParish?.parishId !== parishId) return;
        pane.innerHTML =
          '<p class="sw-chart-note" role="status">This giving insight is temporarily unavailable.</p><button type="button" class="sw-action-btn" onclick="loadGivingOverviewInsights()">Try again</button>';
      }
    })
  );
}

function swGivingSourceComparison(summary, year) {
  const total = summary.total_actual_cents;
  const outside = summary.manual_income_cents;
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(outside) || outside < 0 || total < outside)
    return '<section class="sw-giving-comparison"><h3>In-app and outside-app giving</h3><p class="sw-chart-note">The giving-source comparison is not available yet.</p></section>';
  const inside = total - outside;
  const money = (value) => (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const rows = [
    ['In AGAPAY', inside, 'green'],
    ['Outside AGAPAY', outside, 'gold'],
  ];
  return `<figure class="sw-giving-comparison"><figcaption class="gi-card-heading"><span class="gi-eyebrow">Giving sources</span><span class="gi-year">${Number(year)}</span><h3>Giving by source</h3><p>In-app and outside-app contributions, together.</p></figcaption><div class="gi-total"><span>Total contributions</span><strong>${money(total)}</strong><small>Across all recorded giving sources</small></div>
    ${total ? rows.map(([label, amount, tone]) => `<div class="sw-source-row"><div><strong>${label}</strong><span>${money(amount)} · ${((amount / total) * 100).toFixed(1)}%</span></div><div class="sw-source-track" aria-hidden="true"><i class="sw-chart-${tone}" style="width:${(amount / total) * 100}%"></i></div></div>`).join('') : '<p>No contributions recorded for this year yet. Record an outside gift in Stewardship Health or Givers to get started.</p>'}
    <details class="gi-details"><summary>About these totals</summary><p class="sw-chart-note">Outside giving includes recorded donor gifts and collection totals. This comparison uses Budget Pace gift amounts; AGAPAY fee-covering additions are excluded. Record each gift only once.</p></details></figure>`;
}
