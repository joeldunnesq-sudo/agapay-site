'use strict';

/* global currentParish, setStatus, authHeaders, renderCandleGiving, escapeHtml, renderGivingOptionsEditor,
  renderGiversPanel, escapeAttr, moneyFull, money, fullDate, downloadBlob */
/* exported manualAccountingGifts, loadGivingHistory, exportHistoryCsv */

// Giving history; read shared identity and catalog state only when actions run.
let allGifts = []; // full history cache

let manualAccountingGifts = []; // posted manual contributions used by overview widgets

let filteredGifts = []; // filtered view

// ── GIVING HISTORY ────────────────────────────────────────
async function loadGivingHistory(btn) {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  const wrap = document.getElementById('historyTableWrap');
  if (wrap) wrap.innerHTML = '<div class="history-empty">Loading gift history...</div>';
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-history', {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to load giving history');
    allGifts = data.gifts || [];
    manualAccountingGifts = data.manualAccountingGifts || [];
    renderCandleGiving();
    // Populate fund filter
    const funds = [...new Set(allGifts.map((g) => g.fund || g.fundId || 'General').filter(Boolean))];
    const fundSel = document.getElementById('histFundFilter');
    if (fundSel) {
      fundSel.innerHTML =
        '<option value="all">All funds</option>' +
        funds.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
    }
    filterHistory();
    if (currentParish) renderGivingOptionsEditor();
    renderGiversPanel();
  } catch (err) {
    if (wrap) wrap.innerHTML = `<div class="history-empty">${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function filterHistory() {
  const q = (document.getElementById('histSearch')?.value || '').toLowerCase();
  const type = document.getElementById('histTypeFilter')?.value || 'all';
  const fund = document.getElementById('histFundFilter')?.value || 'all';
  const range = document.getElementById('histRangeFilter')?.value || 'ytd';
  const now = new Date();
  const rangeStart =
    range === '30d'
      ? new Date(now.getTime() - 30 * 86400000)
      : range === '90d'
        ? new Date(now.getTime() - 90 * 86400000)
        : range === 'ytd'
          ? new Date(now.getFullYear(), 0, 1)
          : null;
  filteredGifts = allGifts
    .filter((g) => {
      const haystack = [g.donorName, g.donorEmail, g.fund, g.fundId, g.description, ...(g.commemorationNames || [])]
        .join(' ')
        .toLowerCase();
      const matchQ = !q || haystack.includes(q);
      const matchType =
        type === 'all' ||
        g.type === type ||
        (type === 'recurring' && g.recurring) ||
        (type === 'one_time' && !g.recurring);
      const matchFund = fund === 'all' || (g.fund || g.fundId || 'General') === fund;
      const giftDate = new Date(g.date || g.createdAt || 0);
      const matchRange = !rangeStart || (!Number.isNaN(giftDate.getTime()) && giftDate >= rangeStart);
      return matchQ && matchType && matchFund && matchRange;
    })
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  renderHistoryTable();
  renderGiversPanel();
}

function renderHistoryInsights() {
  const trendPane = document.getElementById('historyTrendPanel');
  const fundPane = document.getElementById('historyFundPanel');
  const gifts = filteredGifts || [];
  const latestDate = gifts.reduce(
    (latest, gift) => {
      const date = new Date(gift.date || gift.createdAt || 0);
      return !Number.isNaN(date.getTime()) && date > latest ? date : latest;
    },
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(latestDate.getFullYear(), latestDate.getMonth() - offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      cents: 0,
      gifts: 0,
    });
  }
  const monthMap = new Map(months.map((month) => [month.key, month]));
  const fundMap = new Map();
  gifts.forEach((gift) => {
    const date = new Date(gift.date || gift.createdAt || 0);
    const cents = Number((gift.giftAmountCents ?? gift.amountCents) || 0);
    if (!Number.isNaN(date.getTime())) {
      const bucket = monthMap.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      if (bucket) {
        bucket.cents += cents;
        bucket.gifts += 1;
      }
    }
    const fund = gift.fund || gift.fundId || 'General';
    fundMap.set(fund, (fundMap.get(fund) || 0) + cents);
  });
  const maxMonth = Math.max(1, ...months.map((month) => month.cents));
  if (trendPane) {
    trendPane.innerHTML = gifts.length
      ? `
        <div class="parish-history-bars">${months
          .map(
            (month) => `
          <div class="parish-history-bar-column" title="${escapeAttr(month.label)} · ${moneyFull(month.cents)} · ${month.gifts} gift${month.gifts === 1 ? '' : 's'}">
            <div class="parish-history-bar-track"><span style="height:${Math.max(month.cents ? 9 : 2, Math.round((month.cents / maxMonth) * 100))}%"></span></div>
            <strong>${escapeHtml(month.label)}</strong>
            <small>${month.cents ? money(month.cents) : '—'}</small>
          </div>`
          )
          .join('')}</div>`
      : '<div class="parish-history-insight-empty">No giving activity matches this view.</div>';
  }
  const funds = [...fundMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxFund = Math.max(1, ...funds.map(([, cents]) => cents));
  if (fundPane) {
    fundPane.innerHTML = funds.length
      ? funds
          .map(
            ([fund, cents], index) => `
        <div class="parish-history-fund-row">
          <span class="parish-history-fund-rank">${index + 1}</span>
          <span class="parish-history-fund-copy"><strong>${escapeHtml(fund)}</strong><i><b style="width:${Math.max(4, Math.round((cents / maxFund) * 100))}%"></b></i></span>
          <span class="parish-history-fund-amount">${money(cents)}</span>
        </div>`
          )
          .join('')
      : '<div class="parish-history-insight-empty">Fund allocation will appear after gifts are recorded.</div>';
  }
}

function renderHistoryTable() {
  // Summary stats
  const total = filteredGifts.reduce((s, g) => s + ((g.giftAmountCents ?? g.amountCents) || 0), 0);
  const avg = filteredGifts.length ? Math.round(total / filteredGifts.length) : 0;
  const recurring = filteredGifts.filter((g) => g.recurring).length;
  const donors = new Set(
    filteredGifts
      .map((g) =>
        String(g.donorEmail || g.donorName || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  ).size;
  const feeCovered = filteredGifts.filter((g) => g.coverFees).length;
  document.getElementById('histStatTotal').textContent = filteredGifts.length;
  document.getElementById('histStatAmount').textContent = money(total);
  document.getElementById('histStatAvg').textContent = filteredGifts.length ? money(avg) : '—';
  document.getElementById('histStatRecurring').textContent = recurring;
  const donorStat = document.getElementById('histStatDonors');
  if (donorStat) donorStat.textContent = donors;
  const context = document.getElementById('historyHeroContext');
  if (context)
    context.textContent = `${recurring} recurring gift${recurring === 1 ? '' : 's'} · ${feeCovered} fee-covered · ${donors} distinct donor${donors === 1 ? '' : 's'}`;
  const resultCount = document.getElementById('historyResultCount');
  if (resultCount)
    resultCount.textContent = `Showing ${filteredGifts.length} of ${allGifts.length} gift${allGifts.length === 1 ? '' : 's'}`;
  renderHistoryInsights();

  const wrap = document.getElementById('historyTableWrap');
  if (!wrap) return;
  if (!filteredGifts.length) {
    wrap.innerHTML = `<div class="history-empty">${allGifts.length ? 'No gifts match the current filters.' : 'No gift history found. Connect Stripe to see recent gifts here.'}</div>`;
    return;
  }
  const rows = filteredGifts
    .map((g) => {
      const giftCents = Number((g.giftAmountCents ?? g.amountCents) || 0);
      const netCents = Number((g.parishNetCents ?? g.amountCents) || 0);
      const feeCents = Number(g.totalFeeCents || 0);
      const details = (g.commemorationNames || []).length
        ? `<span class="parish-history-row-note">For ${escapeHtml(g.commemorationNames.join(', '))}</span>`
        : '';
      return `
        <tr>
          <td data-label="Date"><strong class="parish-history-date">${escapeHtml(fullDate(g.date || g.createdAt))}</strong></td>
          <td data-label="Donor"><span class="parish-history-donor"><strong>${g.donorName ? escapeHtml(g.donorName) : 'Anonymous donor'}</strong><small>${g.donorEmail ? escapeHtml(g.donorEmail) : 'No email available'}</small></span></td>
          <td data-label="Fund"><span class="history-fund">${escapeHtml(g.fund || g.fundId || 'General')}</span>${details}</td>
          <td data-label="Gift"><span class="history-amount">${moneyFull(giftCents)}</span></td>
          <td data-label="Fees"><span class="history-fee ${g.coverFees ? 'covered' : 'absorbed'}">${g.source === 'outside' ? 'Not verified' : g.coverFees ? 'Donor covered' : feeCents ? '-' + moneyFull(feeCents) : 'No fee'}</span></td>
          <td data-label="Net"><span class="parish-history-net">${g.source === 'outside' ? '—' : moneyFull(netCents)}</span></td>
          <td data-label="Type"><span class="history-type">${g.source === 'outside' ? 'Outside · ' + escapeHtml(g.sourceLabel) : g.recurring ? 'Recurring' : 'One-time'}</span></td>
        </tr>`;
    })
    .join('');

  wrap.innerHTML = `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead><tr>
            <th>Date</th><th>Donor</th><th>Fund &amp; intention</th><th>Gift</th><th>Fees</th><th>Net</th><th>Type</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
}

// ── CSV EXPORT ────────────────────────────────────────────
function exportHistoryCsv() {
  if (!filteredGifts.length) {
    setStatus('No gifts to export. Load history first.', 'error');
    return;
  }
  const headers = [
    'Date',
    'Parish Received',
    'Gift Amount',
    'Fees',
    'Fees Covered By Donor',
    'Donor Name',
    'Donor Email',
    'Fund',
    'Type',
    'Commemorations',
  ];
  const rows = filteredGifts.map((g) =>
    [
      fullDate(g.date || g.createdAt),
      g.source === 'outside' ? '' : (((g.parishNetCents ?? g.amountCents) || 0) / 100).toFixed(2),
      (((g.giftAmountCents ?? g.amountCents) || 0) / 100).toFixed(2),
      g.source === 'outside' ? '' : ((g.totalFeeCents || 0) / 100).toFixed(2),
      g.source === 'outside' ? 'Not verified' : g.coverFees ? 'Yes' : 'No',
      g.donorName || 'Anonymous',
      g.donorEmail || '',
      g.fund || g.fundId || 'General',
      g.source === 'outside' ? 'Outside - ' + g.sourceLabel : g.recurring ? 'Recurring' : 'One-time',
      (g.commemorationNames || []).join('; '),
    ]
      .map(
        (cell) =>
          `"${String(cell)
            .replace(/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/, (match) => "'" + match)
            .replace(/"/g, '""')}"`
      )
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const name = `${currentParish?.parishId || 'parish'}-giving-history-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  setStatus(`Exported ${filteredGifts.length} gifts to ${name}.`, 'success');
}
