'use strict';

// Parish dashboard commerce: bookstore-sales.
// Classic script; preserve global names used by the dashboard and inline actions.

let bookstoreSalesState = { loaded: false, loading: false, range: '90d', data: null, orders: [], nextCursor: null };

function setBookstoreSalesRange(range) {
  if (bookstoreSalesState.range === range && bookstoreSalesState.loaded) return;
  bookstoreSalesState.range = range;
  document
    .querySelectorAll('.bk-range-btn')
    .forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-range') === range));
  loadBookstoreSalesPanel(true);
}

async function loadBookstoreSalesPanel(force = false) {
  const body = document.getElementById('bookstoreSalesBody');
  if (!body || !currentParish) return;
  if (bookstoreSalesState.loaded && !force) {
    renderBookstoreSalesPanel();
    return;
  }
  if (bookstoreSalesState.loading) return;
  bookstoreSalesState.loading = true;
  if (!bookstoreSalesState.loaded) body.innerHTML = '<p class="sw-tool-loading">Loading sales…</p>';
  try {
    const res = await fetch(bookstoreApi('/sales?range=' + encodeURIComponent(bookstoreSalesState.range)), {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load bookstore sales.');
    bookstoreSalesState.data = data;
    bookstoreSalesState.orders = data.orders || [];
    bookstoreSalesState.nextCursor = data.nextCursor || null;
    bookstoreSalesState.loaded = true;
    renderBookstoreSalesPanel();
    renderCommerceOverview();
  } catch (err) {
    body.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
  } finally {
    bookstoreSalesState.loading = false;
  }
}

function bkAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!then) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function bkInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '•';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function bkPaymentPill(status) {
  const map = {
    paid: ['Paid', 'ok'],
    refunded: ['Refunded', 'muted'],
    partially_refunded: ['Part. refund', 'warn'],
  };
  const [label, tone] = map[status] || [status || '—', 'muted'];
  return `<span class="bk-pill bk-pill--${tone}">${escapeHtml(label)}</span>`;
}

function bkFulfillPill(status) {
  if (!status || status === 'none') return '';
  const map = {
    pending: ['Pending pickup', 'warn'],
    ready: ['Ready', 'info'],
    picked_up: ['Picked up', 'ok'],
    shipped: ['Shipped', 'ok'],
    fulfilled: ['Fulfilled', 'ok'],
    cancelled: ['Cancelled', 'muted'],
  };
  const [label, tone] = map[status] || [status, 'muted'];
  return `<span class="bk-pill bk-pill--${tone}">${escapeHtml(label)}</span>`;
}

function bkSparkline(trend) {
  const max = Math.max(1, ...trend.map((t) => t.grossCents));
  return `
      <div class="bk-spark">
        ${trend
          .map((t) => {
            const h = Math.round((t.grossCents / max) * 100);
            return `<div class="bk-spark-col" title="${escapeAttr(t.label)}: ${money(t.grossCents)} · ${t.orders} order${t.orders === 1 ? '' : 's'}">
            <div class="bk-spark-bar-wrap"><div class="bk-spark-bar${t.grossCents ? '' : ' is-empty'}" style="height:${Math.max(h, t.grossCents ? 6 : 2)}%"></div></div>
            <span class="bk-spark-label">${escapeHtml(t.label)}</span>
          </div>`;
          })
          .join('')}
      </div>`;
}

function renderBookstoreSalesPanel() {
  const body = document.getElementById('bookstoreSalesBody');
  const d = bookstoreSalesState.data;
  if (!body || !d) return;
  const k = d.kpis || {};
  const at = d.allTime || {};
  const hasSales = (k.orderCount || 0) > 0 || (bookstoreSalesState.orders || []).length > 0;

  if (!hasSales) {
    body.innerHTML = `
        <div class="bk-empty">
          <div class="bk-empty-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3h2l.4 2M7 13h10l3-8H5.4"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg></div>
          <h3>No bookstore sales yet</h3>
          <p>When parishioners buy from My AGAPAY, each order will appear here with the buyer, the items, and your net.</p>
          <a class="btn btn-ghost btn-sm" href="/myagapay/bookstore" target="_blank" rel="noopener">Preview the storefront →</a>
        </div>`;
    return;
  }

  const refundNote =
    d.refunds && d.refunds.orderCount
      ? `<span class="bk-refund-note">${d.refunds.orderCount} refund${d.refunds.orderCount === 1 ? '' : 's'} · ${money(d.refunds.grossCents)}</span>`
      : '';

  body.innerHTML = `
      <div class="bk-kpis">
        <div class="bk-kpi bk-kpi--hero">
          <span class="bk-kpi-label">Gross sales</span>
          <b class="bk-kpi-num">${money(k.grossCents)}</b>
          <span class="bk-kpi-foot">${k.orderCount} order${k.orderCount === 1 ? '' : 's'} · avg ${money(k.avgOrderCents)}</span>
        </div>
        <div class="bk-kpi bk-kpi--net">
          <span class="bk-kpi-label">Net to parish</span>
          <b class="bk-kpi-num">${money(k.netCents)}</b>
          <span class="bk-kpi-foot">after Stripe fees${k.taxCents ? ` · ${money(k.taxCents)} tax` : ''}</span>
        </div>
        <div class="bk-kpi">
          <span class="bk-kpi-label">Customers</span>
          <b class="bk-kpi-num">${k.uniqueCustomers}</b>
          <span class="bk-kpi-foot">${k.repeatCustomers} returning · ${k.unitsSold} item${k.unitsSold === 1 ? '' : 's'} sold</span>
        </div>
        <div class="bk-kpi bk-kpi--alltime">
          <span class="bk-kpi-label">All time</span>
          <b class="bk-kpi-num">${money(at.netCents)}</b>
          <span class="bk-kpi-foot">${at.orderCount} order${at.orderCount === 1 ? '' : 's'} · ${at.uniqueCustomers} buyer${at.uniqueCustomers === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div class="bk-mid">
        <section class="bk-panel bk-trend">
          <header class="bk-panel-head"><h3>Sales trend</h3><span class="bk-panel-sub">last 6 months ${refundNote}</span></header>
          ${bkSparkline(d.trend || [])}
        </section>
        <section class="bk-panel bk-top">
          <header class="bk-panel-head"><h3>Top items</h3><span class="bk-panel-sub">this range</span></header>
          ${
            (d.topProducts || []).length
              ? `<ol class="bk-toplist">${d.topProducts
                  .map(
                    (p) => `
            <li><span class="bk-toplist-name">${escapeHtml(p.name)}</span>
              <span class="bk-toplist-meta">${p.units}× · ${money(p.grossCents)}</span></li>`
                  )
                  .join('')}</ol>`
              : '<p class="bk-panel-empty">No items sold in this range.</p>'
          }
        </section>
      </div>

      <section class="bk-panel bk-customers">
        <header class="bk-panel-head"><h3>Top customers</h3><span class="bk-panel-sub">by spend, from My AGAPAY</span></header>
        <div class="bk-cust-grid">
          ${(d.topCustomers || [])
            .map(
              (c) => `
            <article class="bk-cust">
              <div class="bk-cust-avatar">${escapeHtml(bkInitials(c.name))}</div>
              <div class="bk-cust-main">
                <strong>${escapeHtml(c.name)}${c.isHomeParish ? '<span class="bk-cust-home" title="Home parish">★</span>' : ''}</strong>
                <span class="bk-cust-email">${escapeHtml(c.email)}</span>
              </div>
              <div class="bk-cust-metrics">
                <b>${money(c.grossCents)}</b>
                <span>${c.orders} order${c.orders === 1 ? '' : 's'} · ${bkAgo(c.lastOrderAt)}</span>
              </div>
            </article>`
            )
            .join('')}
        </div>
      </section>

      <section class="bk-panel bk-ledger">
        <header class="bk-panel-head">
          <h3>Order ledger</h3>
          <div class="bk-search">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="7" r="5"/><path d="m11 11 3 3"/></svg>
            <input type="search" id="bookstoreOrderSearch" placeholder="Search buyer or item…" value="${escapeAttr(bookstoreSalesState.query || '')}" onkeydown="if(event.key==='Enter')searchBookstoreOrders(this.value)" />
          </div>
        </header>
        <div id="bookstoreOrderList" class="bk-order-list">${renderBookstoreOrderRows(bookstoreSalesState.orders)}</div>
        <div class="bk-ledger-foot">${
          bookstoreSalesState.nextCursor
            ? '<button class="btn btn-ghost btn-sm" type="button" onclick="loadMoreBookstoreOrders(this)">Load more orders</button>'
            : '<span class="bk-ledger-end">End of orders</span>'
        }</div>
      </section>`;
}

function renderBookstoreOrderRows(orders) {
  if (!orders || !orders.length) return '<p class="bk-panel-empty">No orders match.</p>';
  return orders
    .map((o) => {
      const dateLabel = new Date(o.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const items = (o.items || [])
        .map(
          (it) =>
            `<li><span>${escapeHtml(it.name)}${it.quantity > 1 ? ` <em>×${it.quantity}</em>` : ''}</span><span>${moneyFull(it.totalCents)}</span></li>`
        )
        .join('');
      const refunded = o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded';
      const inventoryAttention = Boolean(o.inventoryAttention);
      return `
        <div class="bk-order${refunded ? ' is-refunded' : ''}${inventoryAttention ? ' needs-inventory-attention' : ''}">
          <button class="bk-order-head" type="button" onclick="this.closest('.bk-order').classList.toggle('is-open')">
            <div class="bk-order-buyer">
              <div class="bk-order-avatar">${escapeHtml(bkInitials(o.donorName))}</div>
              <div>
                <strong>${escapeHtml(o.donorName)}${o.isMyAgapay ? '<span class="bk-tag">My AGAPAY</span>' : ''}${inventoryAttention ? '<span class="bk-tag bk-tag--danger bk-oversold-badge">Oversold · needs review</span>' : ''}</strong>
                <span class="bk-order-sub">${escapeHtml(o.summary)}${o.quantity > 1 ? ` · ${o.quantity} items` : ''}</span>
              </div>
            </div>
            <div class="bk-order-side">
              <div class="bk-order-amounts"><b>${moneyFull(o.grossCents)}</b><span>net ${moneyFull(o.netCents)}</span></div>
              <div class="bk-order-tags">${inventoryAttention ? '<span class="bk-pill bk-pill--danger bk-oversold-badge">Oversold · needs review</span>' : ''}${bkPaymentPill(o.paymentStatus)}${bkFulfillPill(o.fulfillmentStatus)}</div>
              <span class="bk-order-date">${dateLabel}</span>
              <svg class="bk-order-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m3 5 3 3 3-3"/></svg>
            </div>
          </button>
          <div class="bk-order-detail">
            <div class="bk-order-detail-inner">
              ${inventoryAttention ? `<div class="bk-inventory-alert"><strong>Paid past available stock</strong><span>This order needs treasurer review. Confirm the count, arrange a backorder, or refund the donor as appropriate.</span></div>` : ''}
              <div class="bk-order-detail-meta">
                <span>${escapeHtml(o.donorEmail)}</span>
                ${o.orderNumber ? `<span>#${escapeHtml(o.orderNumber)}</span>` : ''}
                <span>${escapeHtml((o.source || '').replace(/_/g, ' '))}</span>
                ${o.settlementProfileName ? `<span>${escapeHtml(o.settlementProfileName)}</span>` : ''}
              </div>
              <ul class="bk-order-items">${items || '<li><span>Bookstore order</span><span>' + moneyFull(o.grossCents) + '</span></li>'}</ul>
              <div class="bk-order-detail-totals">
                ${o.taxCents ? `<span>Tax <b>${moneyFull(o.taxCents)}</b></span>` : ''}
                ${o.stripeFeeCents || o.agapayFeeCents ? `<span>Fees <b>${moneyFull((o.stripeFeeCents || 0) + (o.agapayFeeCents || 0))}</b></span>` : ''}
                <span>Gross <b>${moneyFull(o.grossCents)}</b></span>
                <span>Net to parish <b>${moneyFull(o.netCents)}</b></span>
              </div>
            </div>
          </div>
        </div>`;
    })
    .join('');
}

async function searchBookstoreOrders(query) {
  if (!currentParish) return;
  bookstoreSalesState.query = (query || '').trim();
  const list = document.getElementById('bookstoreOrderList');
  if (list) list.innerHTML = '<p class="sw-tool-loading">Searching…</p>';
  try {
    const url = bookstoreApi(
      '/sales?range=' +
        encodeURIComponent(bookstoreSalesState.range) +
        '&q=' +
        encodeURIComponent(bookstoreSalesState.query)
    );
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Search failed.');
    bookstoreSalesState.orders = data.orders || [];
    bookstoreSalesState.nextCursor = data.nextCursor || null;
    if (list) list.innerHTML = renderBookstoreOrderRows(bookstoreSalesState.orders);
    const foot = document.querySelector('.bk-ledger-foot');
    if (foot)
      foot.innerHTML = bookstoreSalesState.nextCursor
        ? '<button class="btn btn-ghost btn-sm" type="button" onclick="loadMoreBookstoreOrders(this)">Load more orders</button>'
        : '<span class="bk-ledger-end">End of orders</span>';
  } catch (err) {
    if (list) list.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadMoreBookstoreOrders(btn) {
  if (!currentParish || !bookstoreSalesState.nextCursor) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
  }
  try {
    const url = bookstoreApi(
      '/sales?range=' +
        encodeURIComponent(bookstoreSalesState.range) +
        (bookstoreSalesState.query ? '&q=' + encodeURIComponent(bookstoreSalesState.query) : '') +
        '&cursor=' +
        encodeURIComponent(bookstoreSalesState.nextCursor)
    );
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load more.');
    bookstoreSalesState.orders = bookstoreSalesState.orders.concat(data.orders || []);
    bookstoreSalesState.nextCursor = data.nextCursor || null;
    const list = document.getElementById('bookstoreOrderList');
    if (list) list.innerHTML = renderBookstoreOrderRows(bookstoreSalesState.orders);
    const foot = document.querySelector('.bk-ledger-foot');
    if (foot)
      foot.innerHTML = bookstoreSalesState.nextCursor
        ? '<button class="btn btn-ghost btn-sm" type="button" onclick="loadMoreBookstoreOrders(this)">Load more orders</button>'
        : '<span class="bk-ledger-end">End of orders</span>';
  } catch (err) {
    setStatus(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Load more orders';
    }
  }
}
