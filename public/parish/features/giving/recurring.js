'use strict';

/* global currentParish, authHeaders, escapeHtml, pdxAnimateCount, money */
/* exported loadRecurringHealth */

// Giving recurring; read shared identity and catalog state only when actions run.

async function loadRecurringHealth(btn) {
  const pane = document.getElementById('recurringHealthPane');
  if (!currentParish || !pane) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  pane.innerHTML = '<div class="recurring-health-empty">Checking recurring giving health...</div>';
  try {
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/recurring-health',
      { headers: authHeaders() }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to load recurring giving health');
    renderRecurringHealth(data.health || {});
  } catch (err) {
    pane.innerHTML = `<div class="recurring-health-empty">${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function renderRecurringHealth(health) {
  const pane = document.getElementById('recurringHealthPane');
  if (!pane) return;
  const activeCount = Number(health.activeCount || 0);
  const failedCount = Number(health.failedThisMonthCount || 0);
  const lapsedCount = Number(health.lapsedCount || 0);
  const total = activeCount + failedCount + lapsedCount;
  const monthlyRecurring = Number(health.monthlyRecurringCents || 0);

  // Update the "Recurring givers" KPI card to reflect active recurring
  const kpiRecurring = document.getElementById('pdxKpiRecurring');
  const kpiRecurringMeta = document.getElementById('pdxKpiRecurringMeta');
  if (kpiRecurring) pdxAnimateCount(kpiRecurring, activeCount);
  if (kpiRecurringMeta) {
    const needsAttention = failedCount + lapsedCount;
    kpiRecurringMeta.innerHTML =
      needsAttention > 0
        ? `<span class="pdx-delta down">${needsAttention}</span>need attention`
        : `<span class="pdx-delta up">healthy</span>no issues`;
  }

  if (total === 0) {
    pane.innerHTML =
      '<div class="pdx-recurring-empty">No recurring gifts yet. Recurring giving health will appear here once donors set up monthly gifts.</div>';
    return;
  }

  const C = 2 * Math.PI * 70; // donut circumference
  const activeShare = activeCount / total;
  const lapsedShare = lapsedCount / total;
  const failedShare = failedCount / total;
  const needsAttention = failedCount + lapsedCount;
  const noteText =
    needsAttention === 0
      ? 'All recurring gifts are healthy.'
      : `Reach out to ${needsAttention} giver${needsAttention === 1 ? '' : 's'} to restore monthly gifts.`;

  pane.innerHTML = `
      <div class="pdx-recurring-layout">
        <div class="pdx-donut-wrap">
          <svg viewBox="0 0 170 170">
            <circle cx="85" cy="85" r="70" fill="none" stroke="rgba(6,21,34,0.06)" stroke-width="16"/>
            <circle class="pdx-donut-arc" data-arc="active" cx="85" cy="85" r="70" fill="none" stroke="#4A7C59" stroke-width="16" stroke-linecap="round"
              stroke-dasharray="0 ${C}" stroke-dashoffset="0"/>
            <circle class="pdx-donut-arc" data-arc="lapsed" cx="85" cy="85" r="70" fill="none" stroke="#C4922A" stroke-width="16" stroke-linecap="round"
              stroke-dasharray="0 ${C}" stroke-dashoffset="0"/>
            <circle class="pdx-donut-arc" data-arc="failed" cx="85" cy="85" r="70" fill="none" stroke="#B04A3F" stroke-width="16" stroke-linecap="round"
              stroke-dasharray="0 ${C}" stroke-dashoffset="0"/>
          </svg>
          <div class="pdx-donut-center">
            <div class="pdx-donut-num">${total}</div>
            <div class="pdx-donut-label">Recurring</div>
          </div>
        </div>
        <div class="pdx-recurring-legend">
          <div class="pdx-legend-row">
            <span class="pdx-legend-dot" style="background:#4A7C59;"></span>
            <span class="pdx-legend-label">Active</span>
            <span class="pdx-legend-value">${activeCount}</span>
          </div>
          <div class="pdx-legend-row">
            <span class="pdx-legend-dot" style="background:#C4922A;"></span>
            <span class="pdx-legend-label">Lapsed <small>(30+ days)</small></span>
            <span class="pdx-legend-value">${lapsedCount}</span>
          </div>
          <div class="pdx-legend-row">
            <span class="pdx-legend-dot" style="background:#B04A3F;"></span>
            <span class="pdx-legend-label">Failed this month</span>
            <span class="pdx-legend-value">${failedCount}</span>
          </div>
          ${monthlyRecurring > 0 ? `<div class="pdx-legend-note">Expected monthly: ${escapeHtml(money(monthlyRecurring))}. ${escapeHtml(noteText)}</div>` : `<div class="pdx-legend-note">${escapeHtml(noteText)}</div>`}
        </div>
      </div>`;

  // Animate arcs after paint
  requestAnimationFrame(() =>
    setTimeout(() => {
      const active = pane.querySelector('[data-arc="active"]');
      const lapsed = pane.querySelector('[data-arc="lapsed"]');
      const failed = pane.querySelector('[data-arc="failed"]');
      if (active) {
        active.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
        active.style.strokeDasharray = `${C * activeShare} ${C}`;
      }
      if (lapsed) {
        lapsed.style.transition =
          'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.1s, stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.1s';
        lapsed.style.strokeDasharray = `${C * lapsedShare} ${C}`;
        lapsed.style.strokeDashoffset = -C * activeShare;
      }
      if (failed) {
        failed.style.transition =
          'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s, stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s';
        failed.style.strokeDasharray = `${C * failedShare} ${C}`;
        failed.style.strokeDashoffset = -C * (activeShare + lapsedShare);
      }
    }, 100)
  );
}
