'use strict';

/* exported loadDashboard, bookstoreCatalogState, bookstoreLowStockOnly, parishFeatureRequests */
/* global dashboardLoadPromise:writable, currentParish:writable,
  bookstoreCatalogState:writable, bookstoreLowStockOnly:writable, parishFeatureRequests:writable,
  activeTab, stewardshipState, setStatus, authHeaders, refreshSubscriptionStatus,
  refreshStripeStatus, refreshParishLibraryNavigationStatus, saveSession, renderDashboard,
  syncBookstoreLowStockNavigation, loadBookstoreLowStockBadge, switchTab, setSacramentsDashboardTab,
  showParishFeatureRequestPopup, updateStewardshipBadges, isParishPlusActive, loadGivingSummary,
  loadRecurringHealth, renderQrCode, loadCommemorations, loadGivingHistory, loadStewardshipPanel,
  loadReconciliation */

// Dashboard boot/retry lifecycle. Read legacy shared state only when called.
function setDashboardBootMessage(title, message) {
  const titleEl = document.getElementById('dashboardBootTitle');
  const messageEl = document.getElementById('dashboardBootMessage');
  if (titleEl && title) titleEl.textContent = title;
  if (messageEl && message) messageEl.textContent = message;
}

function finishDashboardBoot() {
  document.body.classList.remove('dashboard-booting', 'dashboard-load-failed');
  document.body.classList.add('dashboard-ready');
  document.querySelector('.app')?.setAttribute('aria-busy', 'false');
  document.getElementById('dashboardBootRetry')?.setAttribute('hidden', '');
  document.getElementById('dashboardBootRecovery')?.setAttribute('hidden', '');
}

function failDashboardBoot(message) {
  setDashboardBootMessage('We could not open the dashboard', message || 'Please sign in again and retry.');
  document.body.classList.add('dashboard-load-failed');
  document.querySelector('.app')?.setAttribute('aria-busy', 'false');
  document.getElementById('dashboardBootRetry')?.removeAttribute('hidden');
  document.getElementById('dashboardBootRecovery')?.removeAttribute('hidden');
}

function setDashboardRefreshing(refreshing) {
  document.body.classList.toggle('dashboard-refreshing', refreshing);
  document.querySelector('.app')?.setAttribute('aria-busy', refreshing ? 'true' : 'false');
}

async function loadDashboard(btn) {
  if (dashboardLoadPromise) return dashboardLoadPromise;
  dashboardLoadPromise = loadDashboardInner(btn);
  try {
    return await dashboardLoadPromise;
  } finally {
    dashboardLoadPromise = null;
  }
}

async function loadDashboardInner(btn) {
  const parishId = document.getElementById('parishId').value.trim();
  const previousParish = currentParish;
  const initialLoad = !previousParish;
  if (!parishId || !document.getElementById('parishToken').value.trim()) {
    if (initialLoad) failDashboardBoot('Your parish session has expired. Please sign in again.');
    setStatus('Enter the parish ID and password.', 'error');
    return;
  }
  if (initialLoad) {
    setDashboardBootMessage('Preparing your parish workspace', 'Loading your parish, plan, and available tools.');
    document.querySelector('.app')?.setAttribute('aria-busy', 'true');
    document.body.classList.remove('dashboard-load-failed');
    document.getElementById('dashboardBootRecovery')?.setAttribute('hidden', '');
  } else {
    setDashboardRefreshing(true);
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  const loadBtn = document.getElementById('loadBtn');
  if (loadBtn) {
    loadBtn.classList.add('loading');
    loadBtn.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId), { headers: authHeaders() });
    if (!res.ok) throw Object.assign(new Error('Dashboard request failed'), { status: res.status });
    const data = await res.json();
    if (!data.parish || typeof data.parish !== 'object' || Array.isArray(data.parish) || !data.parish.parishId) {
      throw new TypeError('Dashboard response is missing its parish');
    }
    currentParish = data.parish;
    await Promise.all([
      refreshSubscriptionStatus({ quiet: true }),
      refreshStripeStatus({ quiet: true }),
      refreshParishLibraryNavigationStatus(),
    ]);
    bookstoreCatalogState = {
      loaded: false,
      products: [],
      lowStockProducts: [],
      countSessions: [],
      starterCatalog: [],
    };
    bookstoreLowStockOnly = false;
    saveSession();
    renderDashboard();
    syncBookstoreLowStockNavigation();
    setTimeout(() => loadBookstoreLowStockBadge(), 150);
    const googleCalendarResult = new URLSearchParams(window.location.search).get('googleCalendar');
    if (googleCalendarResult) {
      switchTab('sacraments');
      setSacramentsDashboardTab('calendar');
      setStatus(
        googleCalendarResult === 'connected'
          ? 'Google Calendar connected. Scheduled requests for this priest will now sync automatically.'
          : new URLSearchParams(window.location.search).get('message') || 'Google Calendar could not be connected.',
        googleCalendarResult === 'connected' ? 'success' : 'error'
      );
      window.history.replaceState({}, '', '/parish/dashboard');
    }
    parishFeatureRequests = data.featureRequests || [];
    showParishFeatureRequestPopup(data.featureRequests || []);
    updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });
    setTimeout(() => loadGivingSummary(), 250);
    setTimeout(() => loadRecurringHealth(), 500);
    setTimeout(async () => {
      await renderQrCode();
    }, 750);
    setTimeout(() => loadCommemorations(), 1000);
    if (['history', 'givers', 'options'].includes(activeTab)) {
      loadGivingHistory();
    } else {
      setTimeout(() => loadGivingHistory(), 1250);
    }
    stewardshipState.loaded = false;
    if (activeTab === 'stewardship') loadStewardshipPanel(true);
    if (activeTab === 'reconcile') loadReconciliation();
    if (initialLoad) finishDashboardBoot();
  } catch (err) {
    currentParish = previousParish;
    const message =
      window.AgapayDiagnostics?.report(err, 'dashboard.load') || 'Unable to load the dashboard. Please try again.';
    if (initialLoad) failDashboardBoot(message);
    setStatus(message, 'error');
  } finally {
    if (!initialLoad) setDashboardRefreshing(false);
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (loadBtn) {
      loadBtn.classList.remove('loading');
      loadBtn.disabled = false;
    }
  }
}
