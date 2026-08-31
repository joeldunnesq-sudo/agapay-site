'use strict';

/* global allGifts, pdxAnimateCount, money, shortDate, escapeHtml, populateGivingStatementsPanel,
  checkNudgeEligibility */
/* exported setGiversSort, scrollToGiverDirectory, renderGiversPanel */

// Giving givers; read shared identity and catalog state only when actions run.

let pdxGiversSort = 'amount';

function setGiversSort(mode, btn) {
  pdxGiversSort = mode;
  if (btn) {
    btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderGiversDirectory();
}

function scrollToGiverDirectory() {
  const el = document.getElementById('pdxGvDirectorySection');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderGiversPanel() {
  const groups = new Map();
  allGifts.forEach((gift) => {
    const key = (gift.donorEmail || gift.donorName || 'anonymous').toLowerCase();
    const existing = groups.get(key) || {
      name: gift.donorName || 'Anonymous giver',
      email: gift.donorEmail || '',
      giftCount: 0,
      totalCents: 0,
      recurring: false,
      lastGiftAt: '',
      firstGiftAt: '',
    };
    existing.giftCount += 1;
    existing.totalCents += Number(gift.amountCents || 0);
    existing.recurring = existing.recurring || Boolean(gift.recurring);
    const date = gift.date || gift.createdAt || '';
    if (date) {
      if (!existing.lastGiftAt || date > existing.lastGiftAt) existing.lastGiftAt = date;
      if (!existing.firstGiftAt || date < existing.firstGiftAt) existing.firstGiftAt = date;
    }
    groups.set(key, existing);
  });
  const givers = Array.from(groups.values()).sort((a, b) => b.totalCents - a.totalCents);
  window.pdxGiversAll = givers;

  const total = givers.reduce((sum, g) => sum + g.totalCents, 0);
  const recurring = givers.filter((g) => g.recurring).length;
  const last = givers
    .map((g) => g.lastGiftAt)
    .filter(Boolean)
    .sort()
    .pop();

  // Median gift (across all gifts, not per-donor)
  const amounts = allGifts
    .map((g) => Number(g.amountCents || 0))
    .filter((a) => a > 0)
    .sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;

  // "New this month" = donors whose first gift was in the current month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const newThisMonth = givers.filter((g) => g.firstGiftAt && g.firstGiftAt >= monthStart).length;

  // KPIs — use the shared count-up helper if available
  const setCount = (id, val, opts = {}) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof pdxAnimateCount === 'function') pdxAnimateCount(el, val, opts);
    else el.textContent = opts.money ? money(val) : String(val);
  };
  setCount('giverStatCount', givers.length);
  setCount('giverStatTotal', total, { money: true });
  setCount('pdxGvKpiMedian', median, { money: true });
  setCount('giverStatRecurring', recurring);

  const countMeta = document.getElementById('pdxGvKpiCountMeta');
  if (countMeta)
    countMeta.innerHTML =
      newThisMonth > 0
        ? `<span class="pdx-delta up">${newThisMonth}</span>new this month`
        : `<span style="opacity:0.7;">Distinct households</span>`;
  const totalMeta = document.getElementById('pdxGvKpiTotalMeta');
  if (totalMeta)
    totalMeta.innerHTML = `<span style="opacity:0.7;">Across ${allGifts.length} gift${allGifts.length === 1 ? '' : 's'}</span>`;
  const recurringMeta = document.getElementById('pdxGvKpiRecurringMeta');
  if (recurringMeta) {
    const pct = givers.length ? Math.round((recurring / givers.length) * 100) : 0;
    recurringMeta.innerHTML = `<span style="opacity:0.7;">${pct}% of households</span>`;
  }

  // Legacy hidden binding for "last gift" (still referenced elsewhere in app.js)
  const legacyLast = document.getElementById('giverStatLast');
  if (legacyLast) legacyLast.textContent = shortDate(last);

  // Hero: title with count, mini-donut ratio
  const heroTitle = document.getElementById('pdxGvTitle');
  if (heroTitle)
    heroTitle.innerHTML = givers.length
      ? `<em>${givers.length}</em> household${givers.length === 1 ? ' has' : 's have'} given<br>to your parish this year.`
      : `Load giving history to see your parish community.`;
  const donutPct = document.getElementById('pdxGvRecurringPct');
  const donutSub = document.getElementById('pdxGvRecurringSub');
  const donut = document.getElementById('pdxGvDonut');
  const ratio = givers.length ? recurring / givers.length : 0;
  if (donutPct) donutPct.textContent = `${Math.round(ratio * 100)}%`;
  if (donutSub) donutSub.textContent = `${recurring} of ${givers.length} household${givers.length === 1 ? '' : 's'}`;
  if (donut) {
    const C = 2 * Math.PI * 82; // ≈ 515
    donut.setAttribute('stroke-dasharray', C);
    donut.setAttribute('stroke-dashoffset', C);
    requestAnimationFrame(() =>
      setTimeout(() => {
        donut.style.strokeDashoffset = String(C * (1 - ratio));
      }, 300)
    );
  }

  // Leaderboard: top 6
  const lbEl = document.getElementById('pdxGvLeaderboard');
  if (lbEl) {
    const topSix = givers.slice(0, 6);
    lbEl.innerHTML = topSix.length
      ? `<div class="pdx-gv-leaderboard">${topSix
          .map((g, i) => {
            const avgCents = g.giftCount ? Math.round(g.totalCents / g.giftCount) : 0;
            const top = i < 3 ? 'top' : '';
            return `<div class="pdx-gv-lb-row ${top}">
          <div class="pdx-gv-lb-rank">${i + 1}</div>
          <div class="pdx-gv-lb-copy">
            <div class="pdx-gv-lb-name">${escapeHtml(g.name)}</div>
            <div class="pdx-gv-lb-meta">${g.giftCount} gift${g.giftCount === 1 ? '' : 's'}${g.recurring ? ' <span class="pdx-gv-lb-recur">Recurring</span>' : ''}</div>
          </div>
          <div class="pdx-gv-lb-amount">${escapeHtml(money(g.totalCents))}<small>${escapeHtml(money(avgCents))} avg</small></div>
        </div>`;
          })
          .join('')}</div>`
      : '<div class="pdx-recurring-empty">No paid gifts have been recorded yet.</div>';
  }

  // Nudge list: recurring donors whose last gift is > 30 days old
  const nudgeEl = document.getElementById('pdxGvNudgeList');
  if (nudgeEl) {
    const dayMs = 86400000;
    const nudgeCandidates = givers
      .filter((g) => g.recurring && g.lastGiftAt)
      .map((g) => ({ ...g, daysQuiet: Math.floor((now - new Date(g.lastGiftAt)) / dayMs) }))
      .filter((g) => g.daysQuiet >= 30)
      .sort((a, b) => b.daysQuiet - a.daysQuiet)
      .slice(0, 6);
    if (nudgeCandidates.length === 0) {
      nudgeEl.innerHTML = `<div class="pdx-gv-nudge-empty">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>All caught up</strong>
          <span>No recurring givers have gone quiet.</span>
        </div>`;
    } else {
      nudgeEl.innerHTML = `<div class="pdx-gv-nudge-list">${nudgeCandidates
        .map((g) => {
          const lapsed = g.daysQuiet >= 90;
          const avgCents = g.giftCount ? Math.round(g.totalCents / g.giftCount) : 0;
          return `<div class="pdx-gv-nudge ${lapsed ? 'lapsed' : ''}">
            <div class="pdx-gv-nudge-copy">
              <div class="pdx-gv-nudge-name">${escapeHtml(g.name)}</div>
              <div class="pdx-gv-nudge-meta">Avg ${escapeHtml(money(avgCents))}/gift · Last gift ${escapeHtml(shortDate(g.lastGiftAt))}</div>
            </div>
            <div class="pdx-gv-nudge-status">
              <div class="pdx-gv-nudge-days">${g.daysQuiet}</div>
              <div class="pdx-gv-nudge-days-label">${lapsed ? 'days · lapsed' : 'days quiet'}</div>
            </div>
          </div>`;
        })
        .join('')}</div>`;
    }
  }

  renderGiversDirectory();
  populateGivingStatementsPanel();
  checkNudgeEligibility();
}

function renderGiversDirectory() {
  const pane = document.getElementById('giversPane');
  if (!pane) return;
  const all = Array.isArray(window.pdxGiversAll) ? window.pdxGiversAll : [];
  if (!all.length) {
    pane.innerHTML = '<div class="pdx-gv-dir-empty">No paid gifts have been recorded yet.</div>';
    return;
  }
  const search = (document.getElementById('pdxGvSearch')?.value || '').trim().toLowerCase();
  let filtered = search
    ? all.filter((g) => (g.name || '').toLowerCase().includes(search) || (g.email || '').toLowerCase().includes(search))
    : all.slice();
  switch (pdxGiversSort) {
    case 'recency':
      filtered.sort((a, b) => (b.lastGiftAt || '').localeCompare(a.lastGiftAt || ''));
      break;
    case 'gifts':
      filtered.sort((a, b) => b.giftCount - a.giftCount);
      break;
    case 'name':
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'amount':
    default:
      filtered.sort((a, b) => b.totalCents - a.totalCents);
  }
  if (!filtered.length) {
    pane.innerHTML = '<div class="pdx-gv-dir-empty">No givers match that search.</div>';
    return;
  }
  pane.innerHTML = `<div class="pdx-gv-dir-grid">${filtered
    .map(
      (g) => `
      <div class="pdx-gv-dir-card">
        <div class="pdx-gv-dir-top">
          <span class="pdx-gv-dir-name">${escapeHtml(g.name)}</span>
          <span class="pdx-gv-dir-amount">${escapeHtml(money(g.totalCents))}</span>
        </div>
        <div class="pdx-gv-dir-email">${escapeHtml(g.email || 'No email shown')}</div>
        <div class="pdx-gv-dir-meta">
          <span>${g.giftCount} gift${g.giftCount === 1 ? '' : 's'}</span>
          ${g.recurring ? '<span class="pdx-gv-dir-recur">Recurring</span>' : `<span>Last ${escapeHtml(shortDate(g.lastGiftAt))}</span>`}
        </div>
      </div>
    `
    )
    .join('')}</div>`;
}
