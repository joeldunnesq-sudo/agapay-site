'use strict';

// Parish dashboard commerce: bookstore-catalog.
// Classic script; preserve global names used by the dashboard and inline actions.

let bookstoreEditingProductId = null;

let bookstoreEditingOriginalStock = 0;

function bookstoreApi(path = '') {
  if (!currentParish?.parishId) throw new Error('Load a parish first.');
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/bookstore' + path;
}

function syncBookstoreLowStockNavigation() {
  const badge = document.getElementById('bookstoreLowStockNavBadge');
  if (!badge) return;
  const count = (bookstoreCatalogState.lowStockProducts || []).length;
  badge.hidden = count === 0;
  badge.textContent = count ? `${count} item${count === 1 ? '' : 's'} low on stock` : '';
}

async function loadBookstoreLowStockBadge() {
  if (!currentParish || isStarterTier() || !moduleIncluded('bookstore')) return;
  try {
    const res = await fetch(bookstoreApi('/products/low-stock'), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load low-stock items.');
    bookstoreCatalogState.lowStockProducts = data.products || [];
    syncBookstoreLowStockNavigation();
    renderCommerceOverview();
  } catch (error) {
    console.warn('Unable to load bookstore low-stock badge.', error);
  }
}

const BOOKSTORE_CATEGORY_LABELS = {
  book: 'Book',
  prayer_rope: 'Prayer Rope',
  icon: 'Icon',
  candle: 'Candle',
  jewelry: 'Jewelry / Cross',
  incense: 'Incense',
  cd_dvd: 'CD / DVD',
  other: 'Other',
};

function bookstoreCategoryOptions(selected = 'other') {
  return Object.entries(BOOKSTORE_CATEGORY_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`
    )
    .join('');
}

const BOOKSTORE_NO_STATEWIDE_SALES_TAX_STATES = new Set(['DE', 'MT', 'NH', 'OR']);

function normalizeStateCode(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase();
  const names = {
    ALABAMA: 'AL',
    ALASKA: 'AK',
    ARIZONA: 'AZ',
    ARKANSAS: 'AR',
    CALIFORNIA: 'CA',
    COLORADO: 'CO',
    CONNECTICUT: 'CT',
    DELAWARE: 'DE',
    FLORIDA: 'FL',
    GEORGIA: 'GA',
    HAWAII: 'HI',
    IDAHO: 'ID',
    ILLINOIS: 'IL',
    INDIANA: 'IN',
    IOWA: 'IA',
    KANSAS: 'KS',
    KENTUCKY: 'KY',
    LOUISIANA: 'LA',
    MAINE: 'ME',
    MARYLAND: 'MD',
    MASSACHUSETTS: 'MA',
    MICHIGAN: 'MI',
    MINNESOTA: 'MN',
    MISSISSIPPI: 'MS',
    MISSOURI: 'MO',
    MONTANA: 'MT',
    NEBRASKA: 'NE',
    NEVADA: 'NV',
    'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM',
    'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC',
    'NORTH DAKOTA': 'ND',
    OHIO: 'OH',
    OKLAHOMA: 'OK',
    OREGON: 'OR',
    PENNSYLVANIA: 'PA',
    'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD',
    TENNESSEE: 'TN',
    TEXAS: 'TX',
    UTAH: 'UT',
    VERMONT: 'VT',
    VIRGINIA: 'VA',
    WASHINGTON: 'WA',
    'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI',
    WYOMING: 'WY',
    'DISTRICT OF COLUMBIA': 'DC',
  };
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return names[raw] || raw.slice(0, 2);
}

function renderBookstoreTaxReminder() {
  const box = document.getElementById('bookstoreTaxReminder');
  if (!box || !currentParish) return;
  const stateCode = normalizeStateCode(currentParish.state);
  const stateLabel = currentParish.state || 'your state';
  box.hidden = false;
  box.classList.remove('error');
  if (BOOKSTORE_NO_STATEWIDE_SALES_TAX_STATES.has(stateCode)) {
    box.innerHTML = `<strong>Sales tax:</strong> ${escapeHtml(stateLabel)} does not have a general statewide sales tax, so you do not need to worry about Stripe Tax setup for ordinary bookstore checkout. If your parish sells unusual taxable items, confirm locally.`;
    return;
  }
  if (stateCode === 'AK') {
    box.innerHTML = `<strong>Sales tax:</strong> Alaska has no statewide sales tax, but some local jurisdictions do collect sales tax. Check your local rules and turn on Stripe Tax if your parish needs to collect it.`;
    return;
  }
  box.innerHTML = `<strong>Sales tax reminder:</strong> ${escapeHtml(stateLabel)} may require sales tax on bookstore items. Set up Stripe Tax in your connected Stripe account before taking live bookstore payments so Stripe can show any required tax on the payment page.`;
}

function renderBookstoreFeatureToggle() {
  const root = document.getElementById('bookstoreFeatureToggle');
  if (!root) return;
  const enabled = Boolean(currentParish?.bookstoreEnabled);
  root.innerHTML = `<label class="sac-admin-switch agapay-feature-switch" title="Show or hide Bookstore in My AGAPAY">
      <input type="checkbox" aria-label="Show Bookstore in My AGAPAY" ${enabled ? 'checked' : ''} onchange="toggleBookstoreFeature(this)" />
      <span aria-hidden="true"></span>
      <em>${enabled ? 'On' : 'Off'}</em>
    </label>`;
}

async function toggleBookstoreFeature(input) {
  if (!currentParish) return;
  const enabled = Boolean(input?.checked);
  const previous = Boolean(currentParish.bookstoreEnabled);
  if (input) input.disabled = true;
  try {
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookstoreEnabled: enabled }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to update Bookstore.');
    currentParish = {
      ...currentParish,
      ...(payload.parish || {}),
      bookstoreEnabled: Boolean(payload.parish?.bookstoreEnabled ?? enabled),
    };
    syncModuleStatusNavigation('bookstore', moduleIncluded('bookstore'), currentParish.bookstoreEnabled);
    setStatus(
      currentParish.bookstoreEnabled ? 'Bookstore is on for parishioners.' : 'Bookstore is off for parishioners.',
      'success'
    );
    loadBookstoreCatalogTab();
  } catch (error) {
    currentParish.bookstoreEnabled = previous;
    if (input) input.checked = previous;
    renderBookstoreFeatureToggle();
    setStatus(error.message, 'error');
  } finally {
    if (input) input.disabled = false;
  }
}

async function loadBookstoreCatalogTab(force = false) {
  const upsell = document.getElementById('bookstoreUpsellBanner');
  const live = document.getElementById('bookstoreLiveContent');
  const status = document.getElementById('bookstoreStatusLabel');
  if (!currentParish) return;

  const swActive = !isStarterTier() && moduleIncluded('bookstore');
  syncDashboardPaywall(document.getElementById('tab-bookstore'), 'bookstore', 'Stewardship', !swActive);
  updateStewardshipBadges(swActive, { renderPanel: false });
  if (!swActive) {
    if (upsell) upsell.hidden = true;
    if (live) live.hidden = true;
    return;
  }
  if (upsell) upsell.hidden = true;
  if (live) live.hidden = false;
  switchCommerceProduct(moduleIncluded('commerceSuite') ? commerceProductState : 'bookstore', false);
  renderBookstoreFeatureToggle();
  if (status) {
    status.textContent = currentParish.bookstoreEnabled ? 'Live in My AGAPAY' : 'Hidden until enabled';
    status.className =
      'sw-suite-status-label ' +
      (currentParish.bookstoreEnabled ? 'sw-suite-status--active' : 'sw-suite-status--upsell');
  }
  renderBookstoreTaxReminder();
  renderBookstoreGuestCheckout();
  setTimeout(() => loadBookstoreSalesPanel(force), 250);

  if (bookstoreCatalogState.loaded && !force) {
    renderBookstoreCurrentItems(bookstoreCatalogState.products);
    renderBookstoreCountSessions(bookstoreCatalogState.countSessions);
    renderBookstoreStarterCatalogUI(bookstoreCatalogState.starterCatalog);
    syncBookstoreLowStockNavigation();
    renderCommerceOverview();
    return;
  }

  const itemsPane = document.getElementById('bookstoreCurrentItems');
  const starterPane = document.getElementById('bookstoreStarterCatalog');
  if (itemsPane) itemsPane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  if (starterPane) starterPane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';

  try {
    const [productsRes, lowStockRes, countSessionsRes, catalogRes] = await Promise.all([
      fetch(bookstoreApi('/products'), { headers: authHeaders() }),
      fetch(bookstoreApi('/products/low-stock'), { headers: authHeaders() }),
      fetch(bookstoreApi('/count-sessions'), { headers: authHeaders() }),
      fetch(bookstoreApi('/starter-catalog'), { headers: authHeaders() }),
    ]);
    const productsData = await productsRes.json().catch(() => ({}));
    const lowStockData = await lowStockRes.json().catch(() => ({}));
    const countSessionsData = await countSessionsRes.json().catch(() => ({}));
    const catalogData = await catalogRes.json().catch(() => ({}));
    if (!productsRes.ok) throw new Error(productsData.error || 'Unable to load your bookstore items.');
    if (!lowStockRes.ok) throw new Error(lowStockData.error || 'Unable to load low-stock items.');
    if (!countSessionsRes.ok) throw new Error(countSessionsData.error || 'Unable to load physical counts.');
    if (!catalogRes.ok) throw new Error(catalogData.error || 'Unable to load the starter catalog.');

    bookstoreCatalogState = {
      loaded: true,
      products: productsData.products || [],
      lowStockProducts: lowStockData.products || [],
      countSessions: countSessionsData.sessions || [],
      starterCatalog: catalogData.catalog || [],
    };
    renderBookstoreCurrentItems(bookstoreCatalogState.products);
    renderBookstoreCountSessions(bookstoreCatalogState.countSessions);
    renderBookstoreStarterCatalogUI(bookstoreCatalogState.starterCatalog);
    syncBookstoreLowStockNavigation();
    renderCommerceOverview();
  } catch (err) {
    if (itemsPane) itemsPane.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
    if (starterPane) starterPane.innerHTML = '';
  }
}
