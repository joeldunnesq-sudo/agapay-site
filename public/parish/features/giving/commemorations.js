'use strict';

/* global shortDate, escapeHtml, currentParish, authHeaders, allGifts, manualAccountingGifts, money */
/* exported loadCommemorations, renderCandleGiving */

// Giving commemorations; read shared identity and catalog state only when actions run.

// ── COMMUNICATIONS ────────────────────────────────────────
// koinonia implementations live under features/koinonia/.

// ── COMMEMORATIONS ────────────────────────────────────────
function renderCommemorations(data) {
  const pane = document.getElementById('commemorationQueuePane');
  if (!pane) return;
  const entries = data.entries || [];
  if (!entries.length) {
    pane.innerHTML =
      '<div class="pdx-commemoration-empty">No commemoration names submitted this week yet. Names will appear here as donors submit them.</div>';
    return;
  }
  const cards = [];
  entries.forEach((entry) => {
    const from = entry.donorName || entry.name || entry.donorEmail || 'Anonymous';
    const when = shortDate(entry.createdAt || entry.date || entry.paidAt);
    const service = entry.commemorationKind === 'molieben_panikhida' ? 'Molieben / Panikhida' : 'Proskomedia / Liturgy';
    const meta = when
      ? `${escapeHtml(service)} · from ${escapeHtml(from)} · ${escapeHtml(when)}`
      : `${escapeHtml(service)} · from ${escapeHtml(from)}`;
    const living = Array.isArray(entry.living) ? entry.living.filter(Boolean) : [];
    const departed = Array.isArray(entry.departed) ? entry.departed.filter(Boolean) : [];
    if (living.length) {
      cards.push(`<div class="pdx-commemoration-card">
          <span class="pdx-commemoration-kind">For the Living</span>
          <span class="pdx-commemoration-names">${escapeHtml(living.join(', '))}</span>
          <span class="pdx-commemoration-from">${meta}</span>
        </div>`);
    }
    if (departed.length) {
      cards.push(`<div class="pdx-commemoration-card">
          <span class="pdx-commemoration-kind">For the Departed</span>
          <span class="pdx-commemoration-names">${escapeHtml(departed.join(', '))}</span>
          <span class="pdx-commemoration-from">${meta}</span>
        </div>`);
    }
  });
  pane.innerHTML = cards.length
    ? `<div class="pdx-commemoration-grid">${cards.join('')}</div>`
    : '<div class="pdx-commemoration-empty">Commemoration gifts were found this week but no names were attached.</div>';
}

async function loadCommemorations(btn) {
  const pane = document.getElementById('commemorationQueuePane');
  if (!currentParish || !pane) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  pane.innerHTML = '<p class="section-note">Loading this week\'s commemoration names...</p>';
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/commemorations', {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load commemorations');
    renderCommemorations(data);
  } catch (err) {
    pane.innerHTML = `<p class="section-note">${escapeHtml(err.message)}</p>`;
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

// Candle giving totals and donor intentions.
function candleGiftSignals(gift = {}) {
  return [
    gift.giftType,
    gift.fund,
    gift.fundId,
    gift.campaign,
    gift.campaignId,
    gift.description,
    gift.label,
    gift.memo,
    gift.note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isCandleGift(gift) {
  const text = candleGiftSignals(gift);
  return /\bcandle|candles|vigil|intention|intentions\b/.test(text);
}

function renderCandleGiving() {
  const pane = document.getElementById('candleGivingPane');
  if (!pane) return;
  const gifts = [...allGifts, ...manualAccountingGifts].filter(isCandleGift);
  if (!gifts.length) {
    pane.innerHTML =
      '<div class="pdx-candle-empty">No candle gifts found yet. Candle activity will appear here once donors choose a candle-related fund.</div>';
    return;
  }

  // Bucket last 6 months
  const now = new Date();
  const monthLabels = [];
  const monthKeys = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    monthLabels.push(d.toLocaleDateString(undefined, { month: 'short' }));
  }
  const monthTotals = Object.fromEntries(monthKeys.map((k) => [k, 0]));
  const priorSixMonthsTotal = { cents: 0 };
  gifts.forEach((gift) => {
    const dateStr = gift.createdAt || gift.date || gift.paidAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cents = Number(gift.parishNetCents || gift.amountCents || 0);
    if (key in monthTotals) monthTotals[key] += cents;
    else {
      // Compute prior 6mo for trend comparison
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (monthsAgo >= 6 && monthsAgo < 12) priorSixMonthsTotal.cents += cents;
    }
  });
  const last6Total = Object.values(monthTotals).reduce((a, b) => a + b, 0);
  const maxMonth = Math.max(...Object.values(monthTotals), 1);
  const trend =
    priorSixMonthsTotal.cents > 0
      ? Math.round(((last6Total - priorSixMonthsTotal.cents) / priorSixMonthsTotal.cents) * 100)
      : null;

  const rows = monthKeys
    .map((k, i) => {
      const pct = Math.round((monthTotals[k] / maxMonth) * 100);
      return `<div class="pdx-candle-row">
        <span class="pdx-candle-name">${escapeHtml(monthLabels[i])}</span>
        <div class="pdx-candle-bar-track"><div class="pdx-candle-bar-fill" data-fill="${pct}"></div></div>
        <span class="pdx-candle-value">${escapeHtml(money(monthTotals[k]))}</span>
      </div>`;
    })
    .join('');

  const trendChip =
    trend === null
      ? ''
      : trend > 0
        ? `<span class="pdx-delta up" style="font-size:12px;">${trend}% vs. prior 6mo</span>`
        : trend < 0
          ? `<span class="pdx-delta down" style="font-size:12px;">${Math.abs(trend)}% vs. prior 6mo</span>`
          : `<span class="pdx-delta flat" style="font-size:12px;">Flat vs. prior 6mo</span>`;

  pane.innerHTML = `
      <div class="pdx-candle-list">${rows}</div>
      <div class="pdx-candle-summary">
        <div>
          <div class="pdx-candle-summary-label">6-month total</div>
          <div class="pdx-candle-summary-total">${escapeHtml(money(last6Total))}</div>
        </div>
        ${trendChip}
      </div>`;

  // Animate bar fills
  requestAnimationFrame(() =>
    setTimeout(() => {
      pane.querySelectorAll('.pdx-candle-bar-fill').forEach((el, i) => {
        setTimeout(() => {
          el.style.width = el.dataset.fill + '%';
        }, i * 80);
      });
    }, 100)
  );
}
