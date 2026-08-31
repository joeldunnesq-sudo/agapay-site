'use strict';
/* global currentParish, authHeaders, escapeHtml, moneyFull */
/* exported loadWeeklyFunds, fundReportColor */
const weeklyFundsCache = new Map();
let weeklyFundsRequest = 0;

function fundReportColor(key) {
  const colors = ['#bb9138', '#23794e', '#9c7951', '#657d89', '#99777d'];
  let hash = 0;
  for (const char of String(key)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
async function loadWeeklyFunds(btn) {
  if (!currentParish) return;
  const parishId = currentParish.parishId;
  const requestId = ++weeklyFundsRequest;
  const pane = document.getElementById('weeklyFundsPane');
  if (!pane) return;
  if (btn) btn.disabled = true;
  const cached = weeklyFundsCache.get(parishId);
  const catalogKey = JSON.stringify(currentParish.funds || []);
  try {
    let data;
    if (!btn && cached?.catalogKey === catalogKey && Date.now() - cached.at < 60000) data = cached.data;
    else {
      const response = await fetch(
        '/api/parish/dashboard/' + encodeURIComponent(parishId) + '/giving-summary?view=weekly-funds',
        { headers: authHeaders() }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Weekly fund activity is unavailable.');
      data = payload.weeklyFunds;
      if (!data?.available || !data?.complete) throw new Error(data?.reason || 'Weekly totals could not be verified.');
      weeklyFundsCache.set(parishId, { data, catalogKey, at: Date.now() });
    }
    if (requestId !== weeklyFundsRequest || currentParish?.parishId !== parishId) return;
    const period = data.period || {};
    document.getElementById('weeklyFundsPeriod').textContent =
      'Last completed week · ' + (period.label || '') + ' · ' + (period.timezone || 'UTC');
    const rows = data.allocations || [];
    const total = Math.max(1, Number(data.parishNetCents || 0));
    const rowHtml = (row) =>
      '<div class="fr-weekly-row" style="--fund-color:' +
      fundReportColor(row.key) +
      '">' +
      '<div><span>' +
      escapeHtml(row.label) +
      '</span><strong>' +
      moneyFull(row.netCents) +
      '</strong></div>' +
      '<div class="fr-weekly-track" aria-hidden="true"><i style="width:' +
      Math.max(0, Math.min(100, (row.netCents / total) * 100)) +
      '%"></i></div></div>';
    const allRows = rows.slice(0, 4).map(rowHtml).join('');
    const more =
      rows.length > 4
        ? '<details class="fr-weekly-more"><summary>View all ' +
          rows.length +
          ' funds</summary><div class="fr-weekly-rows">' +
          rows.slice(4).map(rowHtml).join('') +
          '</div></details>'
        : '';
    pane.innerHTML =
      '<div class="fr-weekly-layout"><div class="fr-weekly-total"><strong>' +
      moneyFull(data.parishNetCents) +
      '</strong>' +
      '<span>Net giving before refunds<br>' +
      moneyFull(data.grossGiftCents) +
      ' in gifts · ' +
      data.giftCount +
      ' gift(s)</span></div>' +
      '<div><div class="fr-weekly-rows">' +
      (allRows || '<p class="fr-source">No recorded gifts in this week.</p>') +
      '</div>' +
      more +
      '</div></div>' +
      '<p class="fr-source">' +
      (data.estimatedFeeCount ? 'Includes estimated fees. ' : 'Uses recorded processing fees. ') +
      'Online gifts by paid date; refunds and disputes appear in monthly payout reconciliation. Not bank deposits or current fund balances.</p>' +
      '<div class="fr-actions"><span class="fr-source">Updated ' +
      escapeHtml(new Date(data.generatedAt).toLocaleString()) +
      '</span><button type="button" class="sw-action-btn" onclick="loadWeeklyFunds(this)">Refresh week</button></div>';
  } catch (error) {
    if (requestId === weeklyFundsRequest)
      pane.innerHTML =
        '<p class="fr-source">' +
        escapeHtml(error.message) +
        '</p><button type="button" class="sw-action-btn" onclick="loadWeeklyFunds(this)">Retry weekly totals</button>';
  } finally {
    if (btn) btn.disabled = false;
  }
}
