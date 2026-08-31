'use strict';

/* global currentParish, isStarterTier, isParishTier, isParishPlusActive, syncDashboardPaywall,
  renderParishPlusMeetingsPane, authHeaders, updateStewardshipBadges, loadStewardshipHealthScorePanel,
  loadGivingMetricsPanel, loadFinancialSnapshotsPanel, loadManualIncomePanel, loadDonorConcentrationPanel,
  loadRecurringGivingPanel, loadGivingIntelligencePanels, escapeHtml, setStatus */
/* exported dismissStewardshipCompNotice, startStewardshipSubscription, openStewardshipBilling */

// Plan status, lifecycle, billing, and founding-parish notices.
// Shared navigation and entitlement decisions remain in the core.
// Read shared parish identity and authentication only when actions run.
let stewardshipState = { loaded: false, stewardship: null, meetings: [], selectedMeeting: null };

function stewardshipApi(path = '') {
  if (!currentParish?.parishId) throw new Error('Load a parish first.');
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stewardship' + path;
}

async function loadStewardshipPanel(force = false) {
  const status = document.getElementById('stewardshipStatusLabel');
  const planPane = document.getElementById('stewardshipPlanPane');
  if (!planPane) return;
  if (!currentParish) {
    if (status) status.textContent = 'Not loaded';
    return;
  }
  const stewardshipLocked = isStarterTier() || (!isParishTier() && !isParishPlusActive());
  syncDashboardPaywall(document.getElementById('tab-stewardship'), 'stewardship', 'Stewardship', stewardshipLocked);
  if (stewardshipLocked) {
    renderStewardshipUnavailableForTier();
    return;
  }
  if (stewardshipState.loaded && !force) {
    renderStewardshipPanel();
    renderParishPlusMeetingsPane(document.getElementById('parishPlusMeetingsPane'), isParishPlusActive());
    // Always reload metrics/financials when switching to the tab
    const _active = isParishPlusActive();
    if (_active) loadStewardshipEssentialPanels();
    return;
  }
  if (status) status.textContent = 'Loading…';
  try {
    const res = await fetch(stewardshipApi(), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    stewardshipState = {
      loaded: true,
      stewardship: data.stewardship || { status: 'coming_soon', active: false },
      meetings: data.meetings || [],
      subscribePlans: data.subscribePlans || [],
      setupRequired: !!data.setupRequired,
      comingSoon: !!data.comingSoon,
      selectedMeeting: null,
    };
  } catch {
    stewardshipState = {
      loaded: true,
      stewardship: { status: 'coming_soon', active: false },
      meetings: [],
      subscribePlans: [],
      setupRequired: false,
      comingSoon: true,
      selectedMeeting: null,
    };
  }
  updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });
  renderStewardshipPanel();
  loadStewardshipEssentialPanels();
}

function loadStewardshipEssentialPanels() {
  loadStewardshipHealthScorePanel();
  loadGivingIntelligencePanels();
  setTimeout(() => loadGivingMetricsPanel(), 300);
  setTimeout(() => loadFinancialSnapshotsPanel(), 600);
  setTimeout(() => loadManualIncomePanel(), 900);
  setTimeout(() => loadDonorConcentrationPanel(), 1200);
  setTimeout(() => loadRecurringGivingPanel(), 1500);
}

// ── SACRAMENTS & SERVICES ──────────────────────────────────
// A Parish tier feature — gated server-side by the exact same
// hasStewardshipAccess() check as the rest of the tier features. This panel
// reuses stewardshipState (already fetched by loadStewardshipPanel) to
// decide whether to show the upsell or the actual request list, so
// switching to this tab never needs a second status round-trip.
async function prefetchStewardshipBadge() {
  if (!currentParish) return;
  try {
    const res = await fetch(stewardshipApi(), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    stewardshipState = {
      loaded: true,
      stewardship: data.stewardship || { status: 'coming_soon', active: false },
      meetings: data.meetings || [],
      subscribePlans: data.subscribePlans || [],
      setupRequired: !!data.setupRequired,
      comingSoon: !!data.comingSoon,
      selectedMeeting: null,
    };
    const sw = stewardshipState.stewardship || {};
    updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });
    maybeShowStewardshipCompExpiryNotice(sw);
  } catch {
    /* silent — badge stays gold */
  }
}

// Shows a one-time-per-day pop-up when a Founding 20 free-year
// Parish tier feature grant is within 30 days of expiring. Dismissal
// is remembered in localStorage per parish + grant expiry date, so it
// won't nag more than once a day, and stops entirely once the grant
// itself changes (renewed, converted to paid, or expired).
function maybeShowStewardshipCompExpiryNotice(sw) {
  const comp = sw?.comp;
  if (sw?.status !== 'comped' || !comp?.expiresAt) return;

  const expiresAt = new Date(comp.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return;
  const msUntilExpiry = expiresAt - Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  if (msUntilExpiry > THIRTY_DAYS_MS || msUntilExpiry < 0) return;

  const dismissKey = 'agapay.stewardshipCompNotice.' + (currentParish?.parishId || '') + '.' + comp.expiresAt;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(dismissKey) === today) return;

  localStorage.setItem(dismissKey, today);
  showStewardshipCompExpiryModal(comp);
}

function showStewardshipCompExpiryModal(comp) {
  document.getElementById('stewardshipCompNoticeOverlay')?.remove();

  const expiresLabel = new Date(comp.expiresAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const daysLeft = Math.max(1, Math.round((new Date(comp.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  const overlay = document.createElement('div');
  overlay.id = 'stewardshipCompNoticeOverlay';
  overlay.className = 'sw-comp-notice-overlay';
  overlay.innerHTML =
    '<div class="sw-comp-notice-card" role="dialog" aria-modal="true" aria-labelledby="swCompNoticeTitle">' +
    '<button class="sw-comp-notice-close" type="button" aria-label="Close" onclick="dismissStewardshipCompNotice()">\u00d7</button>' +
    '<div class="sw-comp-notice-icon">' +
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 4 6v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V6l-8-4z" fill="currentColor"/></svg>' +
    '</div>' +
    '<span class="sw-comp-notice-eyebrow">Founding Parish</span>' +
    '<h2 id="swCompNoticeTitle">Your free year is ending soon</h2>' +
    '<p>Your complimentary year of <strong>Parish tier features</strong> ends on <strong>' +
    escapeHtml(expiresLabel) +
    '</strong> \u2014 about ' +
    daysLeft +
    ' days from now.</p>' +
    '<p class="sw-comp-notice-sub">No action is needed if you would like to let it lapse. If your parish council would like to continue, you can add it as a paid feature at any time.</p>' +
    '<div class="sw-comp-notice-actions">' +
    '<button class="sw-comp-notice-btn-primary" type="button" onclick="dismissStewardshipCompNotice(); switchTab(\'settings\')">Review Parish tier</button>' +
    '<button class="sw-comp-notice-btn-secondary" type="button" onclick="dismissStewardshipCompNotice()">Remind me later</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('sw-comp-notice-overlay--visible'));
}

function dismissStewardshipCompNotice() {
  const overlay = document.getElementById('stewardshipCompNoticeOverlay');
  if (!overlay) return;
  overlay.classList.remove('sw-comp-notice-overlay--visible');
  setTimeout(() => overlay.remove(), 200);
}

function renderStewardshipUnavailableForTier() {
  const statusEl = document.getElementById('stewardshipStatusLabel');
  const planPane = document.getElementById('stewardshipPlanPane');
  const metricPane = document.getElementById('givingMetricsPane');
  const finPane = document.getElementById('stewardshipFinancialsPane');
  const healthPane = document.getElementById('stewardshipHealthScorePane');
  const concentrationPane = document.getElementById('stewardshipConcentrationPane');
  const recurringPane = document.getElementById('stewardshipRecurringPane');
  const manualIncomePane = document.getElementById('stewardshipManualIncomePane');
  if (statusEl) {
    statusEl.textContent = 'Parish tier';
    statusEl.className = 'sw-suite-status-label sw-suite-status--upsell';
  }
  if (planPane) {
    planPane.innerHTML =
      '<div class="sw-upsell-row-inner">' +
      '<div class="sw-upsell-row-copy">' +
      '<strong>Stewardship plan</strong>' +
      '<p>Upgrade to Stewardship or Parish to use pledge reports, donor insights, and Stewardship Health.</p>' +
      '</div>' +
      '<div class="sw-upsell-row-actions">' +
      '<button class="sw-subscribe-btn" type="button" onclick="switchTab(\'settings\')">Review tier settings</button>' +
      '</div>' +
      '</div>';
  }
  const locked =
    '<div class="sw-tool-locked"><div class="sw-tool-locked-items"><div><span>✓</span> Included with Stewardship and Parish</div></div><div class="sw-tool-locked-badge">Stewardship required</div></div>';
  if (metricPane) metricPane.innerHTML = locked;
  if (finPane) finPane.innerHTML = locked;
  if (healthPane) healthPane.innerHTML = locked;
  if (concentrationPane) concentrationPane.innerHTML = locked;
  if (recurringPane) recurringPane.innerHTML = locked;
  if (manualIncomePane) manualIncomePane.innerHTML = locked;
  for (const id of ['stewardshipDistributionPane', 'stewardshipRetentionPane']) {
    const pane = document.getElementById(id);
    if (pane) pane.innerHTML = locked;
  }
}

function renderStewardshipPanel() {
  const statusEl = document.getElementById('stewardshipStatusLabel');
  const planPane = document.getElementById('stewardshipPlanPane');
  if (!planPane) return;

  const sw = stewardshipState.stewardship || {};
  const isActive = sw.active || ['active', 'trialing', 'comped'].includes(sw.status);
  const isTrialing = sw.status === 'trialing';
  const isComped = sw.status === 'comped' && sw.comp;

  // Hero status label
  if (statusEl) {
    statusEl.textContent = isActive
      ? sw.includedInParishTier
        ? 'Included in Parish tier'
        : isComped
          ? 'Free — Founding Parish'
          : isTrialing
            ? 'Trial active'
            : 'Active'
      : 'Parish tier';
    statusEl.className = 'sw-suite-status-label ' + (isActive ? 'sw-suite-status--active' : 'sw-suite-status--upsell');
  }

  updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });

  if (isActive) {
    renderStewardshipActiveState(planPane, sw, isTrialing);
  } else {
    renderStewardshipUpsellState(planPane);
  }
}

// Active state: populate the plan row (billing management) and Stewardship-only tools
function renderStewardshipActiveState(planPane, sw, isTrialing) {
  // ── Plan row — billing status + manage button ──────────────────────────
  const isComped = sw.status === 'comped' && sw.comp;
  const expiresLabel =
    isComped && sw.comp.expiresAt
      ? new Date(sw.comp.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
  planPane.innerHTML =
    '<div class="sw-plan-row-inner">' +
    '<div class="sw-plan-row-copy">' +
    '<span class="sw-plan-badge">' +
    (sw.includedInParishTier ? 'Included' : isComped ? 'Free Year' : isTrialing ? 'Trial' : 'Active') +
    '</span>' +
    '<span class="sw-plan-name">Stewardship</span>' +
    '<span class="sw-plan-parish">' +
    escapeHtml(currentParish?.parishName || '') +
    '</span>' +
    (isComped
      ? '<span class="sw-plan-parish" style="opacity:.75;">Founding parish — free through ' +
        escapeHtml(expiresLabel) +
        '</span>'
      : '') +
    '</div>' +
    (sw.includedInParishTier || isComped
      ? ''
      : '<button class="sw-manage-btn" type="button" onclick="openStewardshipBilling(this)">Manage billing</button>') +
    '</div>';

  // Show the financials year select + new button
  const finActions = document.getElementById('financialsHeaderActions');
  if (finActions) finActions.hidden = false;
}

function renderStewardshipUpsellState(planPane) {
  // ── Plan row — subscribe CTA ───────────────────────────────────────────
  planPane.innerHTML =
    '<div class="sw-upsell-row-inner">' +
    '<div class="sw-upsell-row-copy">' +
    '<strong>Stewardship plan</strong>' +
    '<p>Stewardship reports, pledge context, and giving-health insights are included with Stewardship and Parish.</p>' +
    '</div>' +
    '<div class="sw-upsell-row-actions">' +
    '<button class="sw-subscribe-btn" type="button" onclick="switchTab(\'settings\')">Review tier settings</button>' +
    '</div>' +
    '</div>';

  // ── Giving metrics tool card — locked ─────────────────────────────────
  const metricPane = document.getElementById('givingMetricsPane');
  if (metricPane) {
    metricPane.innerHTML =
      '<div class="sw-tool-locked">' +
      '<div class="sw-tool-locked-items">' +
      '<div><span>✓</span> Pledge vs. actual fulfillment</div>' +
      '<div><span>✓</span> Fund breakdown &amp; share</div>' +
      '<div><span>✓</span> Run-rate projection</div>' +
      '<div><span>✓</span> Year-over-year comparison</div>' +
      '</div>' +
      '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
      '</div>';
  }

  // ── Financials tool card — locked ──────────────────────────────────────
  const finPane = document.getElementById('stewardshipFinancialsPane');
  if (finPane) {
    finPane.innerHTML =
      '<div class="sw-tool-locked">' +
      '<div class="sw-tool-locked-items">' +
      '<div><span>✓</span> Income &amp; expense by fiscal year</div>' +
      '<div><span>✓</span> Restricted fund ledger</div>' +
      '<div><span>✓</span> Net surplus / deficit tracking</div>' +
      '<div><span>✓</span> Year-end stewardship records</div>' +
      '</div>' +
      '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
      '</div>';
  }

  // ── Health Score tool card — locked ─────────────────────────────────────
  const healthPane = document.getElementById('stewardshipHealthScorePane');
  if (healthPane) {
    healthPane.innerHTML =
      '<div class="sw-tool-locked">' +
      '<div class="sw-tool-locked-items">' +
      '<div><span>✓</span> One composite score from six giving signals</div>' +
      '<div><span>✓</span> Pledge fulfillment, retention, and concentration risk at a glance</div>' +
      '</div>' +
      '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
      '</div>';
  }

  // ── Concentration Risk tool card — locked ───────────────────────────────
  for (const id of ['stewardshipDistributionPane', 'stewardshipRetentionPane']) {
    const pane = document.getElementById(id);
    if (pane)
      pane.innerHTML =
        '<div class="sw-tool-locked"><div class="sw-tool-locked-badge">Subscribe to unlock Giving intelligence</div></div>';
  }
  const concentrationPane = document.getElementById('stewardshipConcentrationPane');
  if (concentrationPane) {
    concentrationPane.innerHTML =
      '<div class="sw-tool-locked">' +
      '<div class="sw-tool-locked-items">' +
      '<div><span>✓</span> Top 5 / top 10 household giving concentration</div>' +
      '<div><span>✓</span> No individual donor identities shown</div>' +
      '</div>' +
      '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
      '</div>';
  }

  // ── Recurring Giving Health tool card — locked ──────────────────────────
  const recurringPane = document.getElementById('stewardshipRecurringPane');
  if (recurringPane) {
    recurringPane.innerHTML =
      '<div class="sw-tool-locked">' +
      '<div class="sw-tool-locked-items">' +
      '<div><span>✓</span> Recurring donors, MRR, and average gift</div>' +
      '<div><span>✓</span> Failed payments and canceled gifts</div>' +
      '</div>' +
      '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
      '</div>';
  }

  // ── Outside-AGAPAY contribution intake — locked ─────────────────────────
  const manualIncomePane = document.getElementById('stewardshipManualIncomePane');
  if (manualIncomePane) {
    manualIncomePane.innerHTML =
      '<div class="sw-tool-locked">' +
      '<div class="sw-tool-locked-items">' +
      '<div><span>✓</span> Log weekly cash &amp; check totals</div>' +
      '<div><span>✓</span> Add contributions from Tithe.ly, PayPal, and other giving platforms</div>' +
      '</div>' +
      '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
      '</div>';
  }
}

async function startStewardshipSubscription(plan, btn) {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const res = await fetch(stewardshipApi('/subscribe'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to start Stewardship checkout.');
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
  } catch (err) {
    setStatus(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function openStewardshipBilling(btn) {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const res = await fetch(stewardshipApi('/billing-portal'), { method: 'POST', headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to open Stewardship billing.');
    if (data.portalUrl) window.location.href = data.portalUrl;
  } catch (err) {
    setStatus(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

window.ParishFeatureRegistry.register('stewardship', {
  load: loadStewardshipPanel,
  refresh: () => loadStewardshipPanel(true),
  getStatus: () => stewardshipState.stewardship,
  invalidate: () => {
    stewardshipState.loaded = false;
  },
  renderMeetings: (active) => renderParishPlusMeetingsPane(document.getElementById('parishPlusMeetingsPane'), active),
  prefetch: prefetchStewardshipBadge,
});
