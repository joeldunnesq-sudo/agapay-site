'use strict';

// Parish dashboard commerce: commerce.
// Classic script; preserve global names used by the dashboard and inline actions.

let bookstoreCatalogState = {
  loaded: false,
  products: [],
  lowStockProducts: [],
  countSessions: [],
  starterCatalog: [],
};

let bookstoreLowStockOnly = false;

let commerceProductState = 'overview';

function switchCommerceProduct(product, focus = true) {
  const fullSuite = moduleIncluded('commerceSuite');
  const allowed = fullSuite ? new Set(['overview', 'bookstore', 'events', 'meals']) : new Set(['bookstore']);
  commerceProductState = allowed.has(product) ? product : fullSuite ? 'overview' : 'bookstore';
  document.querySelectorAll('.commerce-product-tab').forEach((tab) => {
    const fullSuiteOnly = tab.dataset.commerceProduct !== 'bookstore';
    tab.hidden = fullSuiteOnly && !fullSuite;
    const active = tab.dataset.commerceProduct === commerceProductState;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active && focus) tab.focus({ preventScroll: true });
  });
  document.querySelectorAll('.commerce-workspace-panel').forEach((panel) => {
    const active = panel.dataset.commercePanel === commerceProductState;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  if (commerceProductState === 'overview') renderCommerceOverview();
  if (commerceProductState === 'events') loadEventsOversightPanel('event');
  if (commerceProductState === 'meals') loadEventsOversightPanel('meal');
}

function setCommerceOverviewRange(range) {
  bookstoreSalesState.range = ['30d', '90d', 'ytd', 'all'].includes(range) ? range : '90d';
  document.querySelectorAll('[data-commerce-range], .bk-range-btn').forEach((button) => {
    const active =
      button.getAttribute('data-commerce-range') === bookstoreSalesState.range ||
      button.getAttribute('data-range') === bookstoreSalesState.range;
    button.classList.toggle('is-active', active);
  });
  loadBookstoreSalesPanel(true);
}

function refreshCommerceOverview() {
  loadBookstoreCatalogTab(true);
}

function renderCommerceOverview() {
  const body = document.getElementById('commerceOverviewBody');
  if (!body) return;
  if (!moduleIncluded('commerceSuite')) {
    body.replaceChildren();
    return;
  }
  const sales = bookstoreSalesState.data;
  const catalogReady = bookstoreCatalogState.loaded;
  if (!sales || !catalogReady) {
    body.innerHTML = '<p class="sw-tool-loading">Loading Commerce activity…</p>';
    return;
  }

  const kpis = sales.kpis || {};
  const products = bookstoreCatalogState.products || [];
  const activeProducts = products.filter((product) => String(product.status || 'active').toLowerCase() === 'active');
  const lowStockCount = (bookstoreCatalogState.lowStockProducts || []).length;
  const orders = bookstoreSalesState.orders || [];
  const hasActivity = Number(kpis.orderCount || 0) > 0;
  const bookstoreState = currentParish?.bookstoreEnabled ? 'Live in My AGAPAY' : 'Hidden from My AGAPAY';

  body.innerHTML = `
      <section class="commerce-overview-kpis" aria-label="Commerce metrics">
        <article class="commerce-overview-kpi commerce-overview-kpi--primary">
          <span>Net revenue</span>
          <strong>${money(kpis.netCents || 0)}</strong>
          <small>After payment fees${kpis.taxCents ? ` · ${money(kpis.taxCents)} tax collected` : ''}</small>
        </article>
        <article class="commerce-overview-kpi">
          <span>Gross sales</span>
          <strong>${money(kpis.grossCents || 0)}</strong>
          <small>${Number(kpis.orderCount || 0)} order${Number(kpis.orderCount || 0) === 1 ? '' : 's'} across Commerce</small>
        </article>
        <article class="commerce-overview-kpi">
          <span>Customers</span>
          <strong>${Number(kpis.uniqueCustomers || 0)}</strong>
          <small>${Number(kpis.repeatCustomers || 0)} returning customer${Number(kpis.repeatCustomers || 0) === 1 ? '' : 's'}</small>
        </article>
        <article class="commerce-overview-kpi">
          <span>Active offerings</span>
          <strong>${activeProducts.length}</strong>
          <small>${Number(kpis.unitsSold || 0)} item${Number(kpis.unitsSold || 0) === 1 ? '' : 's'} sold this period</small>
        </article>
      </section>

      <div class="commerce-overview-grid">
        <section class="commerce-overview-card commerce-product-summary">
          <header>
            <div><span class="commerce-card-eyebrow">Products</span><h2>Commerce activity</h2></div>
            <span class="commerce-card-note">All products</span>
          </header>
          <button class="commerce-product-summary-row" type="button" onclick="switchCommerceProduct('bookstore')">
            <span class="commerce-product-summary-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </span>
            <span class="commerce-product-summary-copy"><strong>Bookstore</strong><small>${escapeHtml(bookstoreState)} · ${activeProducts.length} active offering${activeProducts.length === 1 ? '' : 's'}${lowStockCount ? ` · ${lowStockCount} item${lowStockCount === 1 ? '' : 's'} low on stock` : ''}</small></span>
            <span class="commerce-product-summary-metrics"><strong>${money(kpis.netCents || 0)}</strong><small>${Number(kpis.orderCount || 0)} order${Number(kpis.orderCount || 0) === 1 ? '' : 's'}</small></span>
            <span class="commerce-product-summary-arrow" aria-hidden="true">→</span>
          </button>
          <div class="commerce-coming-products">
            <span>Events</span><span>Meals</span><span>Retreats</span><span>Camp</span><span>Tuition</span>
            <small>Additional product activity will roll into this overview as each product launches.</small>
          </div>
        </section>

        <section class="commerce-overview-card commerce-recent-activity">
          <header>
            <div><span class="commerce-card-eyebrow">Latest</span><h2>Recent activity</h2></div>
            ${hasActivity ? `<button type="button" onclick="switchCommerceProduct('bookstore')">View Bookstore</button>` : ''}
          </header>
          ${
            orders.length
              ? `<div class="commerce-activity-list">${orders
                  .slice(0, 5)
                  .map(
                    (order) => `
            <article>
              <span class="commerce-activity-avatar">${escapeHtml(bkInitials(order.donorName))}</span>
              <span class="commerce-activity-copy"><strong>${escapeHtml(order.donorName || 'Parishioner')}</strong><small>${escapeHtml(order.summary || 'Bookstore purchase')} · ${bkAgo(order.createdAt)}</small></span>
              <span class="commerce-activity-amount"><strong>${moneyFull(order.grossCents || 0)}</strong><small>Bookstore</small></span>
            </article>`
                  )
                  .join('')}</div>`
              : `<div class="commerce-overview-empty"><strong>No Commerce sales yet</strong><p>Orders from every active Commerce product will appear here as parishioners make purchases.</p><button type="button" onclick="switchCommerceProduct('bookstore')">Set up Bookstore</button></div>`
          }
        </section>
      </div>`;
}

// Commerce owns every product: Bookstore, Events, Meals, and future offerings.
// Retreats, Camp, and Tuition remain disabled until their implementations ship.
function loadCommerceTab(force = false) {
  switchCommerceProduct(moduleIncluded('commerceSuite') ? 'overview' : 'bookstore', false);
  return loadBookstoreCatalogTab(force);
}
window.ParishFeatureRegistry.register('commerce', {
  load: loadCommerceTab,
  refresh: () => loadBookstoreCatalogTab(true),
});
