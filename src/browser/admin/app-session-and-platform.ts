import type {
  AdminAppRegistration,
  AdminAppPayload,
  AdminAppSummary,
  AdminAppRevenueProduct,
  AdminAppRevenue,
  AdminAppProductCard,
  AdminAppError,
} from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare const adminSessionKey: AdminAppBindings['adminSessionKey'];
declare const adminActorKey: AdminAppBindings['adminActorKey'];
declare const adminNoticeKey: AdminAppBindings['adminNoticeKey'];
declare let lastDataLoadedAt: AdminAppBindings['lastDataLoadedAt'];
declare const formatClock: AdminAppBindings['formatClock'];
declare let autoRefreshTimer: AdminAppBindings['autoRefreshTimer'];
declare const autoRefreshKey: AdminAppBindings['autoRefreshKey'];
declare const token: AdminAppBindings['token'];
declare let isLoadingRegistrations: AdminAppBindings['isLoadingRegistrations'];
declare const loadRegistrations: AdminAppBindings['loadRegistrations'];
declare let activeTab: AdminAppBindings['activeTab'];
declare const setStatus: AdminAppBindings['setStatus'];
declare const switchTab: AdminAppBindings['switchTab'];
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const onboardingActionTitle: AdminAppBindings['onboardingActionTitle'];
declare const escapeHtml: AdminAppBindings['escapeHtml'];
declare const moneyShort: AdminAppBindings['moneyShort'];
declare const escapeAttr: AdminAppBindings['escapeAttr'];
declare let latestPlatformSummary: AdminAppBindings['latestPlatformSummary'];
declare const readable: AdminAppBindings['readable'];
declare const computeLocalPlatformSummary: AdminAppBindings['computeLocalPlatformSummary'];
declare let registrationsCache: AdminAppBindings['registrationsCache'];
declare let latestLearnAdmin: AdminAppBindings['latestLearnAdmin'];
declare const nextActionPriority: AdminAppBindings['nextActionPriority'];
declare const monthLabel: AdminAppBindings['monthLabel'];

function saveAdminSession(value: string) {
  try {
    sessionStorage.setItem(adminSessionKey, value);
    const input = document.getElementById('adminToken') as HTMLInputElement | null;
    if (input) input.value = value;
  } catch {}
}

function clearAdminSession() {
  try {
    sessionStorage.removeItem(adminSessionKey);
  } catch {}
  const input = document.getElementById('adminToken') as HTMLInputElement | null;
  if (input) input.value = '';
}

function adminActor() {
  const inline = (document.getElementById('adminActor') as HTMLInputElement | null)?.value.trim();
  if (inline) return inline;
  return sessionStorage.getItem(adminActorKey) || 'Admin';
}

function setAdminNotice(message: string | undefined) {
  if (!message) return;
  try {
    sessionStorage.setItem(adminNoticeKey, message);
  } catch {}
}

function consumeAdminNotice() {
  try {
    const message = sessionStorage.getItem(adminNoticeKey) || '';
    if (message) sessionStorage.removeItem(adminNoticeKey);
    return message;
  } catch {
    return '';
  }
}

function refreshDataAsOf() {
  const el = document.getElementById('dataAsOf');
  if (!el) return;
  const stamp = lastDataLoadedAt ? formatClock(lastDataLoadedAt) : '—';
  el.textContent = `Data as of ${stamp}`;
}

function isLoginPage() {
  return Boolean(document.body?.classList.contains('admin-login-simple'));
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

function toggleAutoRefresh(enabled: boolean) {
  try {
    sessionStorage.setItem(autoRefreshKey, enabled ? '1' : '0');
  } catch {}
  stopAutoRefresh();
  if (!enabled || isLoginPage()) return;
  autoRefreshTimer = setInterval(() => {
    if (!token() || isLoadingRegistrations) return;
    loadRegistrations({ silent: true, preserveSelection: activeTab === 'giving' });
  }, 90000);
}

function restoreAdminSession() {
  const onLoginPage = isLoginPage();
  const storedToken = sessionStorage.getItem(adminSessionKey) || '';
  const requestedTab = new URLSearchParams(window.location.search).get('tab');
  const input = document.getElementById('adminToken') as HTMLInputElement | null;
  if (storedToken && input) input.value = storedToken;
  refreshDataAsOf();
  const notice = consumeAdminNotice();
  if (notice) setStatus(notice, 'info');
  const autoRefreshEnabled = (sessionStorage.getItem(autoRefreshKey) || '0') === '1';
  const autoRefreshToggle = document.getElementById('autoRefreshToggle') as HTMLInputElement | null;
  if (autoRefreshToggle) {
    autoRefreshToggle.checked = autoRefreshEnabled;
  }
  if (!onLoginPage && !storedToken) {
    window.location.replace('/admin/login');
    return;
  }
  if (onLoginPage && storedToken) {
    window.location.replace('/admin');
    return;
  }
  if (!onLoginPage && storedToken) {
    if (requestedTab && document.getElementById('tab-' + requestedTab)) switchTab(requestedTab);
    toggleAutoRefresh(autoRefreshEnabled);
    setTimeout(() => loadRegistrations(), 80);
  }
}

async function loginFromAdminPage(event: SubmitEvent) {
  event.preventDefault();
  const password = (document.getElementById('adminToken') as HTMLInputElement | null)?.value.trim();
  const actor = adminActor();
  const submit = event.submitter;
  if (!password) {
    setStatus('Enter the admin password.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
  }
  try {
    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, actor }),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (!response.ok) throw new Error(result.error || 'Unable to log in');
    const authenticated = result.mfaRequired
      ? await window.AgapayMfa.runFlow(result, { displayName: actor || 'AGAPAY administrator' })
      : result;
    if (!authenticated.token) throw new Error('Session token missing from response');
    saveAdminSession(authenticated.token as string);
    try {
      sessionStorage.setItem(adminActorKey, (authenticated.actor as string) || actor || 'Admin');
    } catch {}
    window.location.href = '/admin';
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
    }
  }
}

function logoutAdmin() {
  stopAutoRefresh();
  clearAdminSession();
  window.location.href = '/admin/login';
}

function setPaymentStatus(message: string | undefined, tone: string = '') {
  const paymentStatus = document.getElementById('paymentStatus');
  if (paymentStatus) paymentStatus.textContent = message || '';
  setStatus(message, tone);
}

async function changeAdminPassword(btn?: HTMLButtonElement | null) {
  if (!token()) {
    setStatus('Log in first to update the admin password.', 'error');
    return;
  }

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  const newPasswordInput = document.getElementById('newAdminPassword') as HTMLInputElement | null;
  const confirmPasswordInput = document.getElementById('confirmAdminPassword') as HTMLInputElement | null;
  const newAdminPassword = newPasswordInput!.value.trim();
  const confirmAdminPassword = confirmPasswordInput!.value.trim();

  if (newAdminPassword.length < 12) {
    setStatus('Admin password must be at least 12 characters.', 'error');
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    return;
  }
  if (newAdminPassword !== confirmAdminPassword) {
    setStatus('Admin passwords do not match.', 'error');
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    return;
  }

  setStatus('Updating admin password...');
  try {
    const response = await fetch('/api/admin/password', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAdminPassword, confirmAdminPassword }),
    });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to update admin password');

    newPasswordInput!.value = '';
    confirmPasswordInput!.value = '';
    if (result.sessionsInvalidated) {
      stopAutoRefresh();
      clearAdminSession();
      setAdminNotice('Admin password updated. Please log in again with the new password.');
      window.location.href = '/admin/login';
      return;
    }
    setStatus('Admin password updated successfully.', 'success');
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function nextAction(reg: AdminAppRegistration | null | undefined) {
  if (!reg)
    return { title: 'No registration selected', body: 'Load registrations, then choose a parish from the list.' };
  const workflowBlocker = reg.onboardingWorkflow?.blockers?.[0];
  if (workflowBlocker)
    return {
      title: onboardingActionTitle(workflowBlocker.title),
      body: workflowBlocker.detail || 'Open the parish record to continue.',
    };
  if (reg.onboardingWorkflow?.canGoLive)
    return {
      title: 'Waiting for treasurer',
      body: 'The parish has one final action: review the launch summary and click Go Live.',
    };
  if (reg.onboardingWorkflow?.state === 'LIVE')
    return { title: 'Parish is live', body: 'Giving is active and the treasurer signoff is recorded.' };
  if ((reg.status || 'pending') !== 'verified')
    return {
      title: 'Review canonical standing',
      body: 'Confirm jurisdiction, bishop/deanery, website, and contact details before marking verified.',
    };
  if (reg.dashboardInviteEmailStatus !== 'sent')
    return {
      title: 'Send parish dashboard access',
      body: 'The trial uses one parish dashboard credential. Individual treasurer access begins after the subscription becomes paid.',
    };
  if (!['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus!))
    return {
      title: 'Confirm Stripe',
      body: 'The parish connects Stripe in its dashboard. Check the saved connection and readiness here.',
    };
  if (!['active', 'trialing', 'free_forever'].includes(reg.subscriptionStatus!))
    return {
      title: 'Set up AGAPAY subscription',
      body: 'Create subscription checkout, start a free demo, or mark a monastery/skete as free forever.',
    };
  return {
    title: 'Parish is ready',
    body: 'Canonical verification, dashboard invite, Stripe, and subscription status are all in place.',
  };
}

function renderQueueNext(reg: AdminAppRegistration) {
  const action = nextAction(reg);
  const queueNext = document.getElementById('queueNext');
  if (!queueNext) return;
  queueNext.innerHTML = `
        <div>
          <strong>${escapeHtml(action.title)}</strong>
          <span>${escapeHtml(action.body)}</span>
        </div>
        <button class="secondary" onclick="loadRegistrations()">Refresh queue</button>
      `;
}

// --- REBUILT WITH ANIMATION DELAYS ---
function renderGrowthBars(summary: AdminAppSummary, mode: string) {
  const monthly = summary.monthly || [];
  const maxValue = Math.max(
    ...monthly.map((item) =>
      mode === 'donations'
        ? Number(item.ytdDonationsCents || 0)
        : Math.max(Number(item.registered || 0), Number(item.verified || 0))
    ),
    1
  );

  return monthly
    .map((item, index) => {
      const primary = mode === 'donations' ? Number(item.ytdDonationsCents || 0) : Number(item.registered || 0);
      const secondary = mode === 'donations' ? Number(item.giftCount || 0) : Number(item.verified || 0);
      const primaryHeight = Math.max(primary ? 5 : 3, Math.round((primary / maxValue) * 145));
      const secondaryHeight =
        mode === 'donations' ? 0 : Math.max(secondary ? 5 : 0, Math.round((secondary / maxValue) * 145));
      const title =
        mode === 'donations'
          ? `${item.label}: ${moneyShort(primary)} / ${secondary} gifts`
          : `${item.label}: ${primary} registered / ${secondary} verified`;
      return `
          <div class="growth-bar-wrap" title="${escapeAttr(title)}">
            <div class="growth-bar-stack" style="animation-delay: ${index * 0.04}s">
              ${secondaryHeight ? `<div class="growth-bar alt" style="height:${secondaryHeight}px;"></div>` : ''}
              <div class="growth-bar" style="height:${primaryHeight}px;"></div>
            </div>
            <div class="growth-label">${escapeHtml(item.label)}</div>
          </div>
        `;
    })
    .join('');
}

function renderPlatformGrowth(summary: AdminAppSummary) {
  if (summary?.overviewMetrics) renderAdminOverviewMetrics(summary.overviewMetrics);
  latestPlatformSummary = summary || null;
  renderProductOverview();
  const pane = document.getElementById('platformGrowthPane');
  if (!pane) return;
  const donationSource = summary.donationDataSource || 'local_only';
  const donationNote =
    donationSource === 'stripe'
      ? 'Donation volume is based on successful Stripe charges for connected parish accounts.'
      : donationSource === 'partial'
        ? `Stripe data is partially available. ${summary.donationError || ''}`
        : donationSource === 'not_connected'
          ? 'Donation volume will appear after parishes connect Stripe and receive gifts.'
          : 'Donation volume needs admin Stripe reporting; registration growth is shown from AGAPAY records.';

  pane.innerHTML = `
        <div class="growth-stats">
          <div class="growth-stat"><strong>${summary.totalRegistered || 0}</strong><span>Total registrations</span></div>
          <div class="growth-stat"><strong>${summary.totalVerified || 0}</strong><span>Verified parishes</span></div>
          <div class="growth-stat"><strong>${summary.connectedStripeAccounts || 0}</strong><span>Stripe connected</span></div>
          <div class="growth-stat"><strong>${moneyShort(summary.ytdDonationsCents || 0)}</strong><span>${summary.year || new Date().getFullYear()} donations</span></div>
        </div>
        <div class="growth-chart-card">
          <div class="growth-chart-title">Parish Growth <span>Gold registered / navy verified</span></div>
          <div class="growth-bars">${renderGrowthBars(summary, 'registrations')}</div>
          <div class="growth-note">${summary.year || new Date().getFullYear()} monthly registration activity.</div>
        </div>
        <div class="growth-chart-card">
          <div class="growth-chart-title">Donation Volume <span>${escapeHtml(readable(donationSource))}</span></div>
          <div class="growth-bars">${renderGrowthBars(summary, 'donations')}</div>
          <div class="growth-note">${escapeHtml(donationNote)}</div>
        </div>
      `;
  renderRevenueCards(summary.revenue || {});
}

function productCard({
  slug,
  title,
  status,
  statusTone = 'good',
  metric,
  metricLabel,
  body,
  action,
  tab,
}: AdminAppProductCard) {
  return `
        <article class="product-overview-card product-${escapeAttr(slug)}">
          <div class="product-overview-head">
            <span>${escapeHtml(title)}</span>
            <b class="product-status ${escapeAttr(statusTone)}">${escapeHtml(status)}</b>
          </div>
          <strong>${escapeHtml(metric)}</strong>
          <small>${escapeHtml(metricLabel)}</small>
          <p>${escapeHtml(body)}</p>
          <button class="secondary btn-sm" onclick="switchTab('${escapeAttr(tab)}')">${escapeHtml(action)}</button>
        </article>
      `;
}

function renderProductOverview() {
  const grid = document.getElementById('productOverviewGrid');
  if (!grid) return;
  const summary = latestPlatformSummary || computeLocalPlatformSummary(registrationsCache);
  const learn = latestLearnAdmin || {};
  const learnSubs = learn.subscriptions || {};
  const learnCounts = learnSubs.counts || {};
  const verified = Number(summary.totalVerified || 0);
  const connected = Number(summary.connectedStripeAccounts || 0);
  const pending = registrationsCache.filter((item) =>
    ['pending', 'needs_more_info'].includes(item.status || 'pending')
  ).length;
  const learnActive =
    Number(learnCounts.active || 0) + Number(learnCounts.trialing || 0) + Number(learnCounts.freeForever || 0);
  const attentionCount = registrationsCache.filter((item) => Boolean(nextActionPriority(item))).length;
  const healthScore = registrationsCache.length
    ? Math.round(((registrationsCache.length - attentionCount) / registrationsCache.length) * 100)
    : 100;

  const healthEl = document.getElementById('overviewHealthScore');
  const healthNote = document.getElementById('overviewHealthNote');
  if (healthEl) healthEl.textContent = `${Math.max(0, Math.min(100, healthScore))}%`;
  healthEl
    ?.closest<HTMLElement>('.admin-focus-score-ring')
    ?.style.setProperty('--admin-score', `${Math.max(0, Math.min(100, healthScore))}%`);
  if (healthNote)
    healthNote.textContent = attentionCount
      ? `${attentionCount} parish record${attentionCount === 1 ? '' : 's'} need an admin action.`
      : 'No parish onboarding actions are waiting.';

  grid.innerHTML = [
    productCard({
      slug: 'giving',
      title: 'AGAPAY Give',
      status: connected ? 'Live' : verified ? 'Needs Stripe' : 'Onboarding',
      statusTone: connected ? 'good' : 'warn',
      metric: `${verified} verified`,
      metricLabel: `${connected} Stripe connected · ${pending} pending`,
      body: `${moneyShort(summary.ytdDonationsCents || 0)} in ${summary.year || new Date().getFullYear()} gifts tracked through the admin summary.`,
      action: 'Manage Giving',
      tab: 'giving',
    }),
    productCard({
      slug: 'learn',
      title: 'AGAPAY Learn',
      status: learnActive ? 'Live' : 'Ready',
      statusTone: learnActive ? 'good' : 'warn',
      metric: moneyShort(learnSubs.monthlyRecurringCents || 0),
      metricLabel: `${learnActive} active/full-access household${learnActive === 1 ? '' : 's'}`,
      body: `${Number(learnCounts.cancelled || 0)} cancellations and ${(learn.scholarships || []).length} scholarship code${(learn.scholarships || []).length === 1 ? '' : 's'} tracked.`,
      action: 'Manage Learn',
      tab: 'learn',
    }),
    productCard({
      slug: 'marketplace',
      title: 'Marketplace',
      status: 'Coming Soon',
      statusTone: 'soon',
      metric: 'Waitlist',
      metricLabel: 'Vendor and catalog tooling pending',
      body: 'Admin will track vendors, products, orders, refunds, shipments, and seller payout readiness.',
      action: 'View Roadmap',
      tab: 'marketplace',
    }),
    productCard({
      slug: 'directory',
      title: 'Directory',
      status: 'Coming Soon',
      statusTone: 'soon',
      metric: `${verified} seed records`,
      metricLabel: 'Verified Giving communities can seed launch',
      body: 'Admin will manage verified Orthodox organizations, claims, location quality, and public listing status.',
      action: 'View Roadmap',
      tab: 'directory',
    }),
  ].join('');
}

function revenueProductRows(products: AdminAppRevenueProduct[] | undefined) {
  const rows = Array.isArray(products) ? products : [];
  return (
    rows
      .map((product) => {
        const count = Number(product.activeCount || 0) + Number(product.trialingCount || 0);
        return `
          <div class="revenue-row">
            <div>
              <strong>${escapeHtml(product.label || 'AGAPAY Product')}</strong>
              <span>${count} active${product.trialingCount ? ` · ${product.trialingCount} trialing` : ''}</span>
            </div>
            <b>${moneyShort(product.monthlyCents || 0)}</b>
          </div>
        `;
      })
      .join('') || '<div class="revenue-empty">No active subscription records yet.</div>'
  );
}

function renderRevenueCards(revenue: AdminAppRevenue) {
  const grid = document.getElementById('adminRevenueGrid');
  if (!grid) return;
  const subscription = revenue.subscriptionRevenue || {};
  const fees = revenue.donationFeeRevenue || {};
  grid.innerHTML = `
        <article class="revenue-card revenue-card-subscriptions">
          <div class="revenue-card-head">
            <div>
              <span>Monthly subscriptions</span>
              <h3>${moneyShort(subscription.totalMonthlyCents || 0)}</h3>
            </div>
            <small>${escapeHtml(subscription.monthLabel || monthLabel(new Date().getMonth()))}</small>
          </div>
          <div class="revenue-rows">${revenueProductRows(subscription.products)}</div>
          <p>${escapeHtml(subscription.note || 'Estimated monthly subscription revenue by product.')}</p>
        </article>
        <article class="revenue-card revenue-card-fees">
          <div class="revenue-card-head">
            <div>
              <span>Legacy donation fees</span>
              <h3>${moneyShort(fees.agapayFeeCents || 0)}</h3>
            </div>
            <small>${escapeHtml(fees.monthLabel || monthLabel(new Date().getMonth()))}</small>
          </div>
          <div class="revenue-fee-stats">
            <div><strong>${moneyShort(fees.grossGiftCents || 0)}</strong><span>Gross gifts</span></div>
            <div><strong>${fees.giftCount || 0}</strong><span>Gifts</span></div>
            <div><strong>${fees.connectedAccounts || 0}</strong><span>Accounts</span></div>
          </div>
          <p>${escapeHtml(fees.note || 'AGAPAY no longer charges a donation fee; this reflects legacy application-fee revenue from before the change.')}</p>
        </article>
      `;
}
export type AdminAppPart1 = {
  saveAdminSession: typeof saveAdminSession;
  clearAdminSession: typeof clearAdminSession;
  adminActor: typeof adminActor;
  setAdminNotice: typeof setAdminNotice;
  consumeAdminNotice: typeof consumeAdminNotice;
  refreshDataAsOf: typeof refreshDataAsOf;
  isLoginPage: typeof isLoginPage;
  stopAutoRefresh: typeof stopAutoRefresh;
  toggleAutoRefresh: typeof toggleAutoRefresh;
  restoreAdminSession: typeof restoreAdminSession;
  loginFromAdminPage: typeof loginFromAdminPage;
  logoutAdmin: typeof logoutAdmin;
  setPaymentStatus: typeof setPaymentStatus;
  changeAdminPassword: typeof changeAdminPassword;
  nextAction: typeof nextAction;
  renderQueueNext: typeof renderQueueNext;
  renderGrowthBars: typeof renderGrowthBars;
  renderPlatformGrowth: typeof renderPlatformGrowth;
  productCard: typeof productCard;
  renderProductOverview: typeof renderProductOverview;
  revenueProductRows: typeof revenueProductRows;
  renderRevenueCards: typeof renderRevenueCards;
};
