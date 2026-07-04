let selectedReference = '';
    let registrationsCache = [];
    const adminSessionKey = 'agapay_admin_token';
    const adminActorKey = 'agapay_admin_actor';
    const adminNoticeKey = 'agapay_admin_notice';
    const autoRefreshKey = 'agapay_admin_auto_refresh';
    const givingSummaryCache = new Map();
    let autoRefreshTimer = null;
    let isLoadingRegistrations = false;
    let lastDataLoadedAt = null;
    let latestPlatformSummary = null;
    let latestLearnAdmin = null;
    let latestMyAgapayReleaseFlags = { marketplaceDirectoryLive: false };

    function token() {
      return document.getElementById('adminToken')?.value.trim() || sessionStorage.getItem(adminSessionKey) || '';
    }

    function saveAdminSession(value) {
      try {
        sessionStorage.setItem(adminSessionKey, value);
        const input = document.getElementById('adminToken');
        if (input) input.value = value;
      } catch {}
    }

    function clearAdminSession() {
      try { sessionStorage.removeItem(adminSessionKey); } catch {}
      const input = document.getElementById('adminToken');
      if (input) input.value = '';
    }

    function adminActor() {
      const inline = document.getElementById('adminActor')?.value.trim();
      if (inline) return inline;
      return sessionStorage.getItem(adminActorKey) || 'Admin';
    }

    function setAdminNotice(message) {
      if (!message) return;
      try { sessionStorage.setItem(adminNoticeKey, message); } catch {}
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

    function formatClock(value) {
      if (!value) return '—';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      }).format(date);
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

    function toggleAutoRefresh(enabled) {
      try { sessionStorage.setItem(autoRefreshKey, enabled ? '1' : '0'); } catch {}
      stopAutoRefresh();
      if (!enabled || isLoginPage()) return;
      autoRefreshTimer = setInterval(() => {
        if (!token() || isLoadingRegistrations) return;
        loadRegistrations({ silent: true, preserveSelection: activeTab === 'giving' });
      }, 90000);
    }

    function handleAuthFailure(response, payload) {
      if (response.status !== 401) return false;
      clearAdminSession();
      setAdminNotice(payload?.error || 'Your admin session expired. Please log in again.');
      if (!isLoginPage()) {
        window.location.replace('/admin/login');
      } else {
        setStatus(payload?.error || 'Your admin session expired. Please log in again.', 'error');
      }
      return true;
    }

    function restoreAdminSession() {
      const onLoginPage = isLoginPage();
      const storedToken = sessionStorage.getItem(adminSessionKey) || '';
      const requestedTab = new URLSearchParams(window.location.search).get('tab');
      const input = document.getElementById('adminToken');
      if (storedToken && input) input.value = storedToken;
      refreshDataAsOf();
      const notice = consumeAdminNotice();
      if (notice) setStatus(notice, 'info');
      const autoRefreshEnabled = (sessionStorage.getItem(autoRefreshKey) || '0') === '1';
      const autoRefreshToggle = document.getElementById('autoRefreshToggle');
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

    async function loginFromAdminPage(event) {
      event.preventDefault();
      const password = document.getElementById('adminToken')?.value.trim();
      const actor = adminActor();
      const submit = event.submitter;
      if (!password) { setStatus('Enter the admin password.', 'error'); return; }
      if (submit) { submit.classList.add('loading'); submit.disabled = true; }
      try {
        const response = await fetch('/api/admin/session', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, actor })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to log in');
        if (!result.token) throw new Error('Session token missing from response');
        saveAdminSession(result.token);
        try { sessionStorage.setItem(adminActorKey, result.actor || actor || 'Admin'); } catch {}
        window.location.href = '/admin';
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (submit) { submit.classList.remove('loading'); submit.disabled = false; }
      }
    }

    function logoutAdmin() {
      stopAutoRefresh();
      clearAdminSession();
      window.location.href = '/admin/login';
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    function jsString(value) {
      return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
    }

    function jsAttr(value) {
      return escapeAttr(jsString(value));
    }

    // --- REBUILT SET STATUS FOR FLOATING TOASTS ---
    function setStatus(message, tone = '') {
      if (!message) return;
      const container = document.getElementById('toastContainer');
      if (!container) return;
      
      const toast = document.createElement('div');
      toast.className = tone ? `toast ${tone}` : 'toast';
      toast.textContent = message;
      
      container.appendChild(toast);
      
      // Trigger reflow to apply animation
      void toast.offsetWidth;
      toast.classList.add('show');
      
      setTimeout(() => {
        toast.classList.remove('show');
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300); // Remove from DOM after fade out
      }, 4000);
    }

    function setPaymentStatus(message, tone = '') {
      const paymentStatus = document.getElementById('paymentStatus');
      if (paymentStatus) paymentStatus.textContent = message || '';
      setStatus(message, tone);
    }

    function authHeaders(extra = {}) {
      return {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token(),
        ...extra
      };
    }

    async function changeAdminPassword(btn) {
      if (!token()) {
        setStatus('Log in first to update the admin password.', 'error');
        return;
      }
      
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }

      const newPasswordInput = document.getElementById('newAdminPassword');
      const confirmPasswordInput = document.getElementById('confirmAdminPassword');
      const newAdminPassword = newPasswordInput.value.trim();
      const confirmAdminPassword = confirmPasswordInput.value.trim();

      if (newAdminPassword.length < 12) {
        setStatus('Admin password must be at least 12 characters.', 'error');
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
        return;
      }
      if (newAdminPassword !== confirmAdminPassword) {
        setStatus('Admin passwords do not match.', 'error');
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
        return;
      }

      setStatus('Updating admin password...');
      try {
        const response = await fetch('/api/admin/password', {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ newAdminPassword, confirmAdminPassword })
        });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to update admin password');

        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        if (result.sessionsInvalidated) {
          stopAutoRefresh();
          clearAdminSession();
          setAdminNotice('Admin password updated. Please log in again with the new password.');
          window.location.href = '/admin/login';
          return;
        }
        setStatus('Admin password updated successfully.', 'success');
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    function renderMyAgapayReleaseFlags(flags = latestMyAgapayReleaseFlags) {
      latestMyAgapayReleaseFlags = {
        marketplaceDirectoryLive: flags.marketplaceDirectoryLive === true
      };
      const toggle = document.getElementById('myAgapayMarketplaceDirectoryToggle');
      const state = document.getElementById('myAgapayLaunchState');
      if (toggle) toggle.checked = latestMyAgapayReleaseFlags.marketplaceDirectoryLive;
      if (state) state.textContent = latestMyAgapayReleaseFlags.marketplaceDirectoryLive ? 'Live' : 'Hidden';
    }

    async function loadMyAgapayReleaseFlags() {
      if (!token()) return;
      try {
        const response = await fetch('/api/admin/myagapay/release-flags', { headers: authHeaders() });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to load My AGAPAY launch controls');
        renderMyAgapayReleaseFlags(result.flags || {});
      } catch (err) {
        setStatus(err.message, 'error');
      }
    }

    async function saveMyAgapayReleaseFlags(marketplaceDirectoryLive) {
      if (!token()) {
        setStatus('Log in first to update launch controls.', 'error');
        renderMyAgapayReleaseFlags();
        return;
      }
      const previous = latestMyAgapayReleaseFlags.marketplaceDirectoryLive;
      renderMyAgapayReleaseFlags({ marketplaceDirectoryLive });
      try {
        const response = await fetch('/api/admin/myagapay/release-flags', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ marketplaceDirectoryLive })
        });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to update My AGAPAY launch controls');
        renderMyAgapayReleaseFlags(result.flags || {});
        setStatus(marketplaceDirectoryLive ? 'Marketplace and Directory are live in My AGAPAY.' : 'Marketplace and Directory are hidden from My AGAPAY.', 'success');
      } catch (err) {
        renderMyAgapayReleaseFlags({ marketplaceDirectoryLive: previous });
        setStatus(err.message, 'error');
      }
    }

    function field(label, value, className = '') {
      const safeValue = value || '-';
      return `<div class="field ${className}"><div class="field-key">${escapeHtml(label)}</div><div class="field-val">${escapeHtml(safeValue)}</div></div>`;
    }

    function readableStripeRequirement(value) {
      return String(value || '')
        .replace(/\./g, ' / ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function renderStripeRequirements(reg) {
      const requirements = Array.isArray(reg.stripeRequirementsDue) ? reg.stripeRequirementsDue.filter(Boolean) : [];
      const disabledReason = reg.stripeDisabledReason || '';
      const hasStripeAccount = Boolean(reg.stripeAccountId);
      const needsAction = Boolean(disabledReason || requirements.length);

      let title = 'Stripe requirements';
      let copy = 'No open Stripe requirements are currently reported for this parish.';

      if (!hasStripeAccount) {
        copy = 'This area will show any missing Stripe onboarding items after the parish has a connected Stripe account.';
      } else if (needsAction) {
        title = 'Stripe needs parish action';
        copy = 'Stripe is asking the parish to provide or correct information before payments or payouts can be fully enabled.';
      }

      const items = requirements.map((item) => `<li>${escapeHtml(readableStripeRequirement(item))}</li>`).join('');
      const disabled = disabledReason
        ? `<p class="requirements-panel-note"><strong>Stripe reason:</strong> ${escapeHtml(readableStripeRequirement(disabledReason))}</p>`
        : '';
      const list = items ? `<ul class="requirements-list">${items}</ul>` : '';

      return `
        <div class="requirements-panel ${needsAction ? '' : 'clear'}">
          <div class="requirements-panel-title">${escapeHtml(title)}</div>
          <p class="requirements-panel-copy">${escapeHtml(copy)}</p>
          ${disabled}
          ${list}
        </div>
      `;
    }

    function money(cents) {
      if (cents === null || cents === undefined || cents === '') return 'Custom';
      if (Number(cents) === 0) return 'Free';
      return '$' + (Number(cents) / 100).toFixed(0) + '/mo';
    }

    function moneyShort(cents) {
      const amount = (Number(cents) || 0) / 100;
      if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
      if (amount >= 1000) return '$' + (amount / 1000).toFixed(1) + 'K';
      return '$' + amount.toFixed(0);
    }

    function monthLabel(index) {
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index] || '';
    }

    function readable(value) {
      return String(value || 'not_started').replace(/_/g, ' ');
    }

    function shortDate(value) {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return '-';
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: '2-digit' }).format(date);
    }

    function subscriptionTierLabel(reg) {
      if (reg.subscriptionTierLabel) return reg.subscriptionTierLabel;
      if (reg.subscriptionTier === 'monastery_free') return 'Monastery / Skete';
      if (reg.subscriptionTier === 'mission') return 'Mission';
      if (reg.subscriptionTier === 'diocese') return 'Cathedral / Diocese';
      return 'Parish';
    }

    function transactionFeeLabel(reg) {
      if (reg.subscriptionTier === 'diocese') return 'Negotiated';
      return '5% + $0.30 per transaction';
    }

    function nextAction(reg) {
      if (!reg) return { title: 'No registration selected', body: 'Load registrations, then choose a parish from the list.' };
      if ((reg.status || 'pending') !== 'verified') return { title: 'Review canonical standing', body: 'Confirm jurisdiction, bishop/deanery, website, and contact details before marking verified.' };
      if (reg.dashboardInviteEmailStatus !== 'sent') return { title: 'Send dashboard invite', body: 'Email the priest and treasurer their parish ID, temporary token, and Stripe onboarding instructions.' };
      if (!['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus)) return { title: 'Connect Stripe', body: 'Create onboarding or ask the parish to finish Stripe from the dashboard.' };
      if (!['active', 'free_forever'].includes(reg.subscriptionStatus)) return { title: 'Set up AGAPAY subscription', body: 'Create subscription checkout or mark monastery/skete as free forever.' };
      return { title: 'Parish is ready', body: 'Canonical verification, dashboard invite, Stripe, and subscription status are all in place.' };
    }

    function renderQueueNext(reg) {
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

    function jsonForTextarea(value, fallback) {
      return escapeHtml(JSON.stringify(value && value.length ? value : fallback, null, 2));
    }

    function computeLocalPlatformSummary(registrations) {
      const year = new Date().getFullYear();
      const monthly = Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: monthLabel(index),
        registered: 0,
        verified: 0,
        ytdDonationsCents: 0,
        giftCount: 0
      }));

      for (const registration of registrations) {
        const received = registration.receivedAt ? new Date(registration.receivedAt) : null;
        if (!received || Number.isNaN(received.getTime()) || received.getFullYear() !== year) continue;
        const month = received.getMonth();
        monthly[month].registered += 1;
        if (registration.status === 'verified') monthly[month].verified += 1;
      }

      return {
        year,
        totalRegistered: registrations.length,
        totalVerified: registrations.filter(item => item.status === 'verified').length,
        connectedStripeAccounts: registrations.filter(item => ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus)).length,
        ytdDonationsCents: 0,
        giftCount: 0,
        donationDataSource: 'local_only',
        monthly
      };
    }

    // --- REBUILT WITH ANIMATION DELAYS ---
    function renderGrowthBars(summary, mode) {
      const monthly = summary.monthly || [];
      const maxValue = Math.max(
        ...monthly.map(item => mode === 'donations'
          ? Number(item.ytdDonationsCents || 0)
          : Math.max(Number(item.registered || 0), Number(item.verified || 0))
        ),
        1
      );

      return monthly.map((item, index) => {
        const primary = mode === 'donations' ? Number(item.ytdDonationsCents || 0) : Number(item.registered || 0);
        const secondary = mode === 'donations' ? Number(item.giftCount || 0) : Number(item.verified || 0);
        const primaryHeight = Math.max(primary ? 5 : 3, Math.round((primary / maxValue) * 145));
        const secondaryHeight = mode === 'donations'
          ? 0
          : Math.max(secondary ? 5 : 0, Math.round((secondary / maxValue) * 145));
        const title = mode === 'donations'
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
      }).join('');
    }

    function renderPlatformGrowth(summary) {
      latestPlatformSummary = summary || null;
      renderProductOverview();
      const pane = document.getElementById('platformGrowthPane');
      if (!pane) return;
      const donationSource = summary.donationDataSource || 'local_only';
      const donationNote = donationSource === 'stripe'
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

    function productCard({ slug, title, status, statusTone = 'good', metric, metricLabel, body, action, tab }) {
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
      const pending = registrationsCache.filter(item => ['pending', 'needs_more_info'].includes(item.status || 'pending')).length;
      const givingHealth = verified ? Math.round((connected / verified) * 100) : pending ? 50 : 0;
      const learnActive = Number(learnCounts.active || 0) + Number(learnCounts.trialing || 0) + Number(learnCounts.freeForever || 0);
      const totalProducts = 4;
      const liveProducts = 2;
      const healthScore = Math.round(((givingHealth || 0) + (learnActive ? 100 : 65) + 40 + 40) / totalProducts);

      const healthEl = document.getElementById('overviewHealthScore');
      const healthNote = document.getElementById('overviewHealthNote');
      if (healthEl) healthEl.textContent = `${Math.max(0, Math.min(100, healthScore))}%`;
      if (healthNote) healthNote.textContent = `${liveProducts} products live, ${pending} Giving registration${pending === 1 ? '' : 's'} awaiting action.`;

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
          tab: 'giving'
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
          tab: 'learn'
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
          tab: 'marketplace'
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
          tab: 'directory'
        })
      ].join('');
    }

    function revenueProductRows(products) {
      const rows = Array.isArray(products) ? products : [];
      return rows.map(product => {
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
      }).join('') || '<div class="revenue-empty">No active subscription records yet.</div>';
    }

    function renderRevenueCards(revenue) {
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
              <span>Monthly donation fees</span>
              <h3>${moneyShort(fees.agapayFeeCents || 0)}</h3>
            </div>
            <small>${escapeHtml(fees.monthLabel || monthLabel(new Date().getMonth()))}</small>
          </div>
          <div class="revenue-fee-stats">
            <div><strong>${moneyShort(fees.grossGiftCents || 0)}</strong><span>Gross gifts</span></div>
            <div><strong>${fees.giftCount || 0}</strong><span>Gifts</span></div>
            <div><strong>${fees.connectedAccounts || 0}</strong><span>Accounts</span></div>
          </div>
          <p>${escapeHtml(fees.note || 'Current-month AGAPAY application fees from connected Stripe gifts.')}</p>
        </article>
      `;
    }

    function renderLearnGrowthBars(monthly = []) {
      const maxValue = Math.max(...monthly.map(item => Math.max(Number(item.newSubscriptions || 0), Number(item.cancellations || 0), Number(item.active || 0))), 1);
      return monthly.map((item, index) => {
        const activeHeight = Math.max(item.active ? 5 : 3, Math.round((Number(item.active || 0) / maxValue) * 130));
        const newHeight = Math.max(item.newSubscriptions ? 5 : 0, Math.round((Number(item.newSubscriptions || 0) / maxValue) * 130));
        const cancelHeight = Math.max(item.cancellations ? 5 : 0, Math.round((Number(item.cancellations || 0) / maxValue) * 130));
        return `
          <div class="growth-bar-wrap" title="${escapeAttr(`${item.label}: ${item.newSubscriptions || 0} new / ${item.cancellations || 0} cancelled / ${item.active || 0} net active`)}">
            <div class="growth-bar-stack" style="animation-delay:${index * 0.04}s">
              ${cancelHeight ? `<div class="growth-bar danger" style="height:${cancelHeight}px;"></div>` : ''}
              ${newHeight ? `<div class="growth-bar alt" style="height:${newHeight}px;"></div>` : ''}
              <div class="growth-bar" style="height:${activeHeight}px;"></div>
            </div>
            <div class="growth-label">${escapeHtml(item.label)}</div>
          </div>
        `;
      }).join('');
    }

    function renderLearnScholarships(scholarships = []) {
      const list = document.getElementById('learnScholarshipList');
      if (!list) return;
      if (!scholarships.length) {
        list.innerHTML = '<div class="revenue-empty">No Learn scholarship codes have been generated yet.</div>';
        return;
      }
      list.innerHTML = scholarships.map((item) => `
        <div class="learn-scholarship-row">
          <div>
            <strong>${escapeHtml(item.code || '')}</strong>
            <span>${escapeHtml(item.label || 'AGAPAY Learn scholarship')} · ${escapeHtml(String(item.percentOff || 0))}% off · ${escapeHtml(String(item.maxRedemptions || 1))} redemption${Number(item.maxRedemptions || 1) === 1 ? '' : 's'}</span>
          </div>
          <button class="secondary btn-sm" onclick="copyLearnText('${jsAttr(item.code || '')}', 'Scholarship code copied.')">Copy</button>
        </div>
      `).join('');
    }

    function renderLearnCommunityModeration(moderation = {}) {
      const list = document.getElementById('learnCommunityModeration');
      if (!list) return;
      const counts = moderation.counts || {};
      const resources = moderation.resources || [];
      list.innerHTML = `
        <div class="learn-moderation-summary">
          <span><strong>${Number(counts.pending || 0)}</strong> Pending</span>
          <span><strong>${Number(counts.flagged || 0)}</strong> Flagged</span>
          <span><strong>${Number(counts.approved || 0)}</strong> Approved</span>
          <span><strong>${Number(counts.hidden || 0)}</strong> Hidden</span>
        </div>
        <div class="learn-moderation-list">${resources.map((item) => {
          const flags = Array.isArray(item.flags) ? item.flags : [];
          const curated = item.vetted || item.source === 'agapay-curated';
          return `<article class="learn-moderation-row ${flags.length ? 'is-flagged' : ''}">
            <div class="learn-moderation-copy"><span class="learn-moderation-status">${escapeHtml(readable(item.status || 'pending'))}${curated ? ' · AGAPAY CURATED' : ''}${flags.length ? ` · ${flags.length} flag${flags.length === 1 ? '' : 's'}` : ''}</span><strong>${escapeHtml(item.title || 'Untitled resource')}</strong><a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url || '')}</a><small>${escapeHtml(item.description || '')}</small><small>${curated ? 'Published by' : 'Submitted by'} ${escapeHtml(item.submittedBy || 'Unknown')} · ${escapeHtml(shortDate(item.createdAt))}</small>${flags.length ? `<div class="learn-flag-reasons">${flags.map((flag) => `<span>${escapeHtml(flag.reason || 'Flagged for review')}</span>`).join('')}</div>` : ''}</div>
            <div class="learn-moderation-actions">${curated ? `<button class="secondary btn-sm" onclick="editLearnCuratedResource('${jsAttr(item.id || '')}')">Edit</button>` : ''}<button class="gold btn-sm" onclick="moderateLearnCommunity('${jsAttr(item.id || '')}','approved',this)">Approve</button><button class="secondary btn-sm" onclick="moderateLearnCommunity('${jsAttr(item.id || '')}','hidden',this)">Hide</button><button class="danger btn-sm" onclick="moderateLearnCommunity('${jsAttr(item.id || '')}','removed',this)">Remove</button></div>
          </article>`;
        }).join('') || '<div class="revenue-empty">No community submissions are waiting for review.</div>'}</div>`;
    }

    function renderLearnFeedbackQueue(feedback = {}) {
      const list = document.getElementById('learnFeedbackQueue');
      if (!list) return;
      const counts = feedback.counts || {};
      const suggestions = feedback.suggestions || [];
      list.innerHTML = `
        <div class="learn-moderation-summary">
          <span><strong>${Number(counts.new || 0)}</strong> New</span>
          <span><strong>${Number(counts['seen-considered'] || 0)}</strong> Seen</span>
          <span><strong>${Number(counts.archived || 0)}</strong> Archived</span>
          <span><strong>${Number(counts.total || 0)}</strong> Total</span>
        </div>
        <div class="learn-feedback-list">${suggestions.map((item) => {
          const isNew = (item.status || 'new') === 'new';
          const notification = item.userNotification || {};
          return `<article class="learn-feedback-row ${isNew ? 'is-new' : ''}">
            <div class="learn-moderation-copy">
              <span class="learn-moderation-status">${escapeHtml(readable(item.status || 'new'))}${notification.status ? ` · Notification: ${escapeHtml(readable(notification.status))}` : ''}</span>
              <strong>${escapeHtml(item.subject || 'Learn Dashboard suggestion')}</strong>
              <p>${escapeHtml(item.message || '')}</p>
              <small>${escapeHtml(item.submittedBy || 'Unknown household')} · ${escapeHtml(item.familyName || 'AGAPAY Learn')} · ${escapeHtml(item.page || 'dashboard')} · ${escapeHtml(shortDate(item.createdAt))}</small>
              ${item.consideredBy ? `<small>Considered by ${escapeHtml(item.consideredBy)} · ${escapeHtml(shortDate(item.consideredAt))}</small>` : ''}
            </div>
            <div class="learn-moderation-actions">
              ${isNew ? `<button class="gold btn-sm" onclick="acknowledgeLearnFeedback('${jsAttr(item.id || '')}',this)">Seen & considered</button>` : '<span class="learn-feedback-done">Done</span>'}
            </div>
          </article>`;
        }).join('') || '<div class="revenue-empty">No Learn dashboard suggestions have been submitted yet.</div>'}</div>`;
    }

    function renderLearnAdmin(data = {}) {
      const pane = document.getElementById('learnAdminPane');
      if (!pane) return;
      const subscriptions = data.subscriptions || {};
      const counts = subscriptions.counts || {};
      latestLearnAdmin = data || {};
      renderProductOverview();

      // Update Learn hero header
      const learnHeaderSubs = document.getElementById('learnHeaderSubs');
      const learnHeaderMrr = document.getElementById('learnHeaderMrr');
      const learnActive = Number(counts.active || 0) + Number(counts.trialing || 0) + Number(counts.freeForever || 0);
      if (learnHeaderSubs) learnHeaderSubs.textContent = learnActive || '0';
      const newFeedbackCount = Number(data.feedback?.counts?.new || 0);
      if (learnHeaderMrr) learnHeaderMrr.textContent = `${moneyShort(subscriptions.monthlyRecurringCents || 0)}/mo · ${counts.cancelled || 0} cancelled · ${newFeedbackCount} new suggestion${newFeedbackCount === 1 ? '' : 's'}`;

      pane.innerHTML = `
        <article class="revenue-card">
          <div class="revenue-card-head">
            <div>
              <span>Learn monthly revenue</span>
              <h3>${moneyShort(subscriptions.monthlyRecurringCents || 0)}</h3>
            </div>
            <small>${escapeHtml(String(subscriptions.year || new Date().getFullYear()))}</small>
          </div>
          <div class="revenue-fee-stats">
            <div><strong>${counts.active || 0}</strong><span>Active</span></div>
            <div><strong>${counts.trialing || 0}</strong><span>Trialing</span></div>
            <div><strong>${counts.cancelled || 0}</strong><span>Cancelled</span></div>
          </div>
          <p>Revenue is normalized to monthly value from active Learn billing records.</p>
        </article>
        <article class="revenue-card">
          <div class="revenue-card-head">
            <div>
              <span>Scholarships</span>
              <h3>${(data.scholarships || []).length}</h3>
            </div>
            <small>${data.stripeConfigured ? 'Stripe live' : 'Tracking only'}</small>
          </div>
          <div class="revenue-fee-stats">
            <div><strong>${counts.freeForever || 0}</strong><span>Full access</span></div>
            <div><strong>${counts.pastDue || 0}</strong><span>Past due</span></div>
            <div><strong>${subscriptions.totalRecords || 0}</strong><span>Records</span></div>
          </div>
          <p>${data.stripeConfigured ? 'New scholarship codes are created as Stripe promotion codes.' : 'Set STRIPE_SECRET_KEY to create live Stripe promotion codes.'}</p>
        </article>
        <article class="growth-chart-card learn-admin-chart">
          <div class="growth-chart-title">Learn Growth <span>Net active / new / cancellations</span></div>
          <div class="growth-bars">${renderLearnGrowthBars(subscriptions.monthly || [])}</div>
          <div class="growth-note">Current-year Learn subscription movement.</div>
        </article>
        <article class="growth-chart-card">
          <div class="growth-chart-title">Recent Learn Accounts <span>Latest billing records</span></div>
          <div class="learn-admin-recent">
            ${(subscriptions.recent || []).map((item) => `
              <div class="revenue-row">
                <div>
                  <strong>${escapeHtml(item.email || 'Unknown household')}</strong>
                  <span>${escapeHtml(item.plan || 'family')} · ${escapeHtml(readable(item.status || 'active'))}</span>
                </div>
                <b>${escapeHtml(shortDate(item.updatedAt || item.createdAt))}</b>
              </div>
            `).join('') || '<div class="revenue-empty">No Learn billing records yet.</div>'}
          </div>
        </article>
      `;
      renderLearnScholarships(data.scholarships || []);
      renderLearnFeedbackQueue(data.feedback || {});
      renderLearnCommunityModeration(data.communityModeration || {});
    }

    async function acknowledgeLearnFeedback(feedbackId, btn) {
      if (!feedbackId) return;
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      try {
        const response = await fetch(`/api/admin/learn/feedback/${encodeURIComponent(feedbackId)}`, {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status: 'seen-considered' })
        });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to acknowledge suggestion');
        const notice = result.feedback?.userNotification?.status === 'sent'
          ? 'Suggestion marked seen and considered. Thank-you notification sent.'
          : `Suggestion marked seen and considered. Notification status: ${readable(result.feedback?.userNotification?.status || 'unknown')}.`;
        setStatus(notice, 'success');
        await loadLearnAdmin();
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    async function moderateLearnCommunity(resourceId, status, btn) {
      if (!resourceId) return;
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      try {
        const response = await fetch(`/api/admin/learn/community/${encodeURIComponent(resourceId)}`, {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status })
        });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to update community resource');
        setStatus(`Community resource marked ${status}.`, 'success');
        await loadLearnAdmin();
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    function clearLearnCuratedResourceForm() {
      const idField = document.getElementById('learnCuratedResourceId');
      if (idField) idField.value = '';
      [
        'learnCuratedTitle',
        'learnCuratedUrl',
        'learnCuratedCategory',
        'learnCuratedResourceType',
        'learnCuratedMediaType',
        'learnCuratedAgeRange',
        'learnCuratedTags',
        'learnCuratedDescription'
      ].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.value = '';
      });
      const pinned = document.getElementById('learnCuratedPinned');
      if (pinned) pinned.checked = false;
      const submit = document.getElementById('learnCuratedResourceSubmit');
      if (submit) submit.textContent = 'Publish curated resource';
      const status = document.getElementById('learnCuratedResourceStatus');
      if (status) {
        status.textContent = '';
        status.className = 'payment-status';
      }
    }

    function editLearnCuratedResource(resourceId) {
      const resources = latestLearnAdmin?.communityModeration?.resources || [];
      const item = resources.find((resource) => resource.id === resourceId);
      if (!item) {
        setStatus('Unable to find that curated resource. Refresh and try again.', 'error');
        return;
      }
      const setValue = (id, value) => {
        const field = document.getElementById(id);
        if (field) field.value = value || '';
      };
      setValue('learnCuratedResourceId', item.id);
      setValue('learnCuratedTitle', item.title);
      setValue('learnCuratedUrl', item.url);
      setValue('learnCuratedCategory', item.category);
      setValue('learnCuratedResourceType', item.resourceType);
      setValue('learnCuratedMediaType', item.mediaType);
      setValue('learnCuratedAgeRange', item.ageRange);
      setValue('learnCuratedTags', Array.isArray(item.tags) ? item.tags.join(', ') : item.tags);
      setValue('learnCuratedDescription', item.description);
      const pinned = document.getElementById('learnCuratedPinned');
      if (pinned) pinned.checked = Boolean(item.pinned);
      const submit = document.getElementById('learnCuratedResourceSubmit');
      if (submit) submit.textContent = 'Save curated resource';
      const status = document.getElementById('learnCuratedResourceStatus');
      if (status) {
        status.textContent = `Editing: ${item.title || 'Curated resource'}`;
        status.className = 'payment-status';
      }
      document.getElementById('learnCuratedTitle')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function createLearnCuratedResource(btn) {
      const status = document.getElementById('learnCuratedResourceStatus');
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      if (status) {
        status.textContent = 'Publishing curated resource...';
        status.className = 'payment-status';
      }
      try {
        const payload = {
          action: 'update',
          title: document.getElementById('learnCuratedTitle')?.value || '',
          url: document.getElementById('learnCuratedUrl')?.value || '',
          category: document.getElementById('learnCuratedCategory')?.value || '',
          resourceType: document.getElementById('learnCuratedResourceType')?.value || '',
          mediaType: document.getElementById('learnCuratedMediaType')?.value || '',
          ageRange: document.getElementById('learnCuratedAgeRange')?.value || '',
          tags: document.getElementById('learnCuratedTags')?.value || '',
          description: document.getElementById('learnCuratedDescription')?.value || '',
          pinned: Boolean(document.getElementById('learnCuratedPinned')?.checked)
        };
        const resourceId = document.getElementById('learnCuratedResourceId')?.value || '';
        const response = await fetch(resourceId ? `/api/admin/learn/community/${encodeURIComponent(resourceId)}` : '/api/admin/learn/community', {
          method: resourceId ? 'PATCH' : 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || (resourceId ? 'Unable to save curated resource' : 'Unable to publish curated resource'));
        clearLearnCuratedResourceForm();
        if (status) {
          status.textContent = `${resourceId ? 'Saved' : 'Published'}: ${result.resource?.title || payload.title}`;
          status.className = 'payment-status success';
        }
        setStatus(resourceId ? 'AGAPAY curated Learn resource saved.' : 'AGAPAY curated Learn resource published.', 'success');
        await loadLearnAdmin();
      } catch (err) {
        if (status) {
          status.textContent = err.message;
          status.className = 'payment-status error';
        }
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    async function loadLearnAdmin(btn) {
      if (!token()) {
        setStatus('Log in to load AGAPAY Learn admin.', 'error');
        return;
      }
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      try {
        const response = await fetch('/api/admin/learn/summary', { headers: authHeaders() });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to load AGAPAY Learn admin');
        renderLearnAdmin(result.learn || {});
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    async function copyLearnText(value, message = 'Copied.') {
      try {
        await navigator.clipboard.writeText(value);
        setStatus(message, 'success');
      } catch {
        setStatus(value, 'info');
      }
    }

    async function createLearnScholarship(btn) {
      const status = document.getElementById('learnScholarshipStatus');
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      if (status) {
        status.textContent = 'Generating scholarship code...';
        status.className = 'payment-status';
      }
      try {
        const payload = {
          label: document.getElementById('learnScholarshipLabel')?.value || 'AGAPAY Learn scholarship',
          percentOff: document.getElementById('learnScholarshipPercent')?.value || 100,
          maxRedemptions: document.getElementById('learnScholarshipMax')?.value || 1,
          code: document.getElementById('learnScholarshipCode')?.value || ''
        };
        const response = await fetch('/api/admin/learn/scholarships', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to generate scholarship code');
        if (status) {
          status.textContent = `Scholarship code ready: ${result.scholarship?.code || ''}`;
          status.className = 'payment-status success';
        }
        document.getElementById('learnScholarshipCode').value = '';
        await copyLearnText(result.scholarship?.code || '', 'Scholarship code copied.');
        await loadLearnAdmin();
      } catch (err) {
        if (status) {
          status.textContent = err.message;
          status.className = 'payment-status error';
        }
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    async function seedDemoParish(btn) {
      const status = document.getElementById('seedDemoStatus');
      const parishInput = document.getElementById('seedDemoParishId');
      const parishId = (parishInput?.value || '').trim();
      if (!parishId) {
        if (status) {
          status.textContent = 'Enter the parish dashboard ID first.';
          status.style.color = 'var(--red, #8b2020)';
        }
        parishInput?.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Seeding...';
      if (status) status.textContent = '';
      try {
        const res = await fetch('/api/admin/seed-demo', {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ parishId })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'Seed failed');
        btn.textContent = 'Seeded';
        if (status) {
          status.textContent = `${data.message || 'Demo data seeded.'} Dashboard: ${data.dashboardUrl || '/parish/dashboard'} · Give: ${data.giveUrl || `/give/${parishId}`}`;
          status.style.color = 'var(--green, #2a7a4b)';
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Seed demo data';
        if (status) {
          status.textContent = err.message;
          status.style.color = 'var(--red, #8b2020)';
        }
      } finally {
        btn.disabled = false;
      }
    }

    function weeklyCommemorationSummary(results = [], dryRun = true) {
      if (!results.length) return 'No matching parish was found for that dashboard ID.';
      return results.map((row) => {
        if (row.status === 'skipped') {
          return `${row.parishName || row.parishId}: skipped (${row.reason || 'not eligible'}).`;
        }
        const counts = `${Number(row.entryCount || 0)} submissions, ${Number(row.livingCount || 0)} living names, ${Number(row.departedCount || 0)} departed names`;
        const destination = row.to ? ` to ${row.to}` : '';
        const action = dryRun ? 'Ready to send' : row.status === 'sent' ? 'Sent' : `Result: ${row.status || 'unknown'}`;
        return `${action}${destination} for ${row.parishName || row.parishId}: ${counts}.`;
      }).join(' ');
    }

    async function runWeeklyCommemorationEmail(dryRun, btn) {
      const status = document.getElementById('weeklyCommemorationStatus');
      const parishInput = document.getElementById('weeklyCommemorationParishId');
      const parishId = (parishInput?.value || '').trim();
      if (!parishId) {
        if (status) {
          status.textContent = 'Enter the parish dashboard ID first.';
          status.style.color = 'var(--red, #8b2020)';
        }
        parishInput?.focus();
        return;
      }
      if (!dryRun && !window.confirm(`Send this week's commemoration email for ${parishId} now?`)) return;

      const previewBtn = document.getElementById('weeklyCommemorationPreviewBtn');
      const sendBtn = document.getElementById('weeklyCommemorationSendBtn');
      if (previewBtn) previewBtn.disabled = true;
      if (sendBtn) sendBtn.disabled = true;
      if (btn) {
        btn.classList.add('loading');
        btn.textContent = dryRun ? 'Previewing...' : 'Sending...';
      }
      if (status) {
        status.textContent = dryRun ? "Checking this week's submissions..." : 'Sending weekly commemoration email...';
        status.style.color = 'var(--muted)';
      }

      try {
        const response = await fetch('/api/admin/commemorations/send-weekly', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ parishId, dryRun })
        });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to run weekly commemoration email');
        const message = weeklyCommemorationSummary(result.results || [], result.dryRun);
        if (status) {
          status.textContent = message;
          status.style.color = result.dryRun ? 'var(--deep)' : 'var(--green, #2a7a4b)';
        }
        setStatus(result.dryRun ? 'Weekly commemoration email preview loaded.' : 'Weekly commemoration email sent.', 'success');
      } catch (err) {
        if (status) {
          status.textContent = err.message;
          status.style.color = 'var(--red, #8b2020)';
        }
        setStatus(err.message, 'error');
      } finally {
        if (previewBtn) previewBtn.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (btn) {
          btn.classList.remove('loading');
          btn.textContent = dryRun ? 'Preview email' : 'Send email now';
        }
      }
    }

    function moneyPlain(cents) {
      return (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }

    function weeklyTreasurerSummary(results = [], dryRun = true) {
      if (!results.length) return 'No matching bookstore-enabled parish was found for that dashboard ID.';
      return results.map((row) => {
        if (row.status === 'skipped') {
          const reason = row.reason === 'already_sent'
            ? 'already sent for this week'
            : row.reason === 'no_paid_orders'
              ? 'no paid bookstore orders in this week window'
              : row.reason || 'not eligible';
          return `${row.parishName || row.parishId}: skipped (${reason}).`;
        }
        const destination = row.to ? ` to ${row.to}` : '';
        const action = dryRun ? 'Ready to send' : row.status === 'sent' ? 'Sent' : `Result: ${row.status || 'unknown'}`;
        return `${action}${destination} for ${row.parishName || row.parishId}: ${Number(row.orderCount || 0)} orders, ${moneyPlain(row.totalChargedCents)} gross, ${moneyPlain(row.taxCents)} tax, ${moneyPlain(row.parishNetCents)} parish net.`;
      }).join(' ');
    }

    async function runWeeklyTreasurerEmail(dryRun, btn) {
      const status = document.getElementById('weeklyTreasurerStatus');
      const parishInput = document.getElementById('weeklyTreasurerParishId');
      const parishId = (parishInput?.value || '').trim();
      if (!parishId) {
        if (status) {
          status.textContent = 'Enter the parish dashboard ID first.';
          status.style.color = 'var(--red, #8b2020)';
        }
        parishInput?.focus();
        return;
      }
      if (!dryRun && !window.confirm(`Send this week's bookstore treasurer report for ${parishId} now?`)) return;

      const previewBtn = document.getElementById('weeklyTreasurerPreviewBtn');
      const sendBtn = document.getElementById('weeklyTreasurerSendBtn');
      if (previewBtn) previewBtn.disabled = true;
      if (sendBtn) sendBtn.disabled = true;
      if (btn) {
        btn.classList.add('loading');
        btn.textContent = dryRun ? 'Previewing...' : 'Sending...';
      }
      if (status) {
        status.textContent = dryRun ? "Checking this week's paid bookstore orders..." : 'Sending weekly treasurer report...';
        status.style.color = 'var(--muted)';
      }

      try {
        const response = await fetch('/api/admin/commerce/send-weekly-treasurer', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ parishId, dryRun, force: !dryRun })
        });
        const result = await response.json().catch(() => ({}));
        if (handleAuthFailure(response, result)) return;
        if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to run weekly treasurer report');
        const message = weeklyTreasurerSummary(result.results || [], result.dryRun);
        if (status) {
          status.textContent = message;
          status.style.color = result.dryRun ? 'var(--deep)' : 'var(--green, #2a7a4b)';
        }
        setStatus(result.dryRun ? 'Weekly treasurer report preview loaded.' : 'Weekly treasurer report sent.', 'success');
      } catch (err) {
        if (status) {
          status.textContent = err.message;
          status.style.color = 'var(--red, #8b2020)';
        }
        setStatus(err.message, 'error');
      } finally {
        if (previewBtn) previewBtn.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (btn) {
          btn.classList.remove('loading');
          btn.textContent = dryRun ? 'Preview report' : 'Send report now';
        }
      }
    }

    async function loadStewardshipCompStatus() {
      const counter = document.getElementById('stewardshipCompCounter');
      if (!counter) return;
      try {
        const res = await fetch('/api/admin/stewardship/comp-status', { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Unable to load comp status');
        counter.textContent = `${data.claimed} of ${data.limit} claimed — ${data.remaining} remaining`;
        counter.style.color = data.remaining > 0 ? 'var(--green, #2a7a4b)' : 'var(--red, #8b2020)';
      } catch (err) {
        counter.textContent = 'Unable to load claimed count: ' + err.message;
        counter.style.color = 'var(--red, #8b2020)';
      }
    }

    // Shared core used by both the Developer Tools card and the per-parish
    // "Grant free year" shortcut in the registration detail view. Returns
    // the parsed response so each caller can render its own status message.
    async function submitStewardshipCompGrant(parishId) {
      const res = await fetch('/api/admin/stewardship/comp', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parishId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Grant failed');
      return data;
    }

    async function grantStewardshipComp(btn) {
      const status = document.getElementById('stewardshipCompStatus');
      const parishInput = document.getElementById('stewardshipCompParishId');
      const parishId = (parishInput?.value || '').trim();
      if (!parishId) {
        if (status) {
          status.textContent = 'Enter the parish dashboard ID first.';
          status.style.color = 'var(--red, #8b2020)';
        }
        parishInput?.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Granting...';
      if (status) status.textContent = '';
      try {
        const data = await submitStewardshipCompGrant(parishId);
        btn.textContent = 'Granted';
        if (status) {
          const expires = data.comp?.expiresAt ? new Date(data.comp.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
          status.textContent = `Free year granted to ${parishId}${expires ? ' — expires ' + expires : ''}. ${data.claimed} of 20 claimed.`;
          status.style.color = 'var(--green, #2a7a4b)';
        }
        await loadStewardshipCompStatus();
        if (parishInput) parishInput.value = '';
      } catch (err) {
        if (status) {
          status.textContent = err.message;
          status.style.color = 'var(--red, #8b2020)';
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Grant free year';
      }
    }

    async function grantStewardshipCompFromDetail(parishId, btn) {
      const status = document.getElementById('detailCompGrantStatus');
      if (!parishId) return;
      btn.disabled = true;
      btn.textContent = 'Granting...';
      if (status) status.textContent = '';
      try {
        const data = await submitStewardshipCompGrant(parishId);
        btn.textContent = 'Granted';
        if (status) {
          const expires = data.comp?.expiresAt ? new Date(data.comp.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
          status.textContent = `Granted${expires ? ' — expires ' + expires : ''}. ${data.claimed} of 20 claimed.`;
          status.style.color = 'var(--green, #2a7a4b)';
        }
        await loadStewardshipCompStatus();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Grant free year to ' + parishId;
        if (status) {
          status.textContent = err.message;
          status.style.color = 'var(--red, #8b2020)';
        }
      }
    }

    async function loadPlatformSummary(btn) {
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      if (!registrationsCache.length) {
        renderPlatformGrowth(computeLocalPlatformSummary([]));
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
        return;
      }

      renderPlatformGrowth(computeLocalPlatformSummary(registrationsCache));
      try {
        const response = await fetch('/api/admin/platform-summary', { headers: authHeaders() });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to load platform summary');
        renderPlatformGrowth(result.summary);
      } catch (err) {
        const localSummary = computeLocalPlatformSummary(registrationsCache);
        localSummary.donationDataSource = 'local_only';
        renderPlatformGrowth(localSummary);
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    function emptyDetailMarkup() {
      return `
        <div class="detail-empty">
          <div class="detail-empty-inner">
            <div class="detail-empty-icon">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <h2>Select a registration</h2>
            <p>Choose a parish from the Giving queue to begin review.</p>
          </div>
        </div>
      `;
    }

    function collapseRegistrationDetail() {
      selectedReference = '';
      
      const refEl = document.getElementById('selectedReference');
      if (refEl) {
        refEl.textContent = 'No selection';
      }
      
      document.getElementById('backToQueueBtn')?.classList.add('hidden');
      document.getElementById('copySummaryBtn')?.classList.add('hidden');
      document.getElementById('registrationDetail').innerHTML = '';
      renderFilteredList();
      document.getElementById('registrationQueue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function loadRegistrations(options = {}) {
      const { silent = false, preserveSelection = false } = options;
      if (!token()) {
        if (!silent) setStatus('Log in to load registrations.', 'error');
        return;
      }
      if (isLoadingRegistrations) return;
      isLoadingRegistrations = true;

      const btn = document.getElementById('loadBtn');
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      if (!silent) setStatus('Loading registrations...');

      try {
        const loaded = [];
        let cursor = '';
        do {
          const params = new URLSearchParams({ limit: '250' });
          if (cursor) params.set('cursor', cursor);
          const response = await fetch('/api/admin/registrations?' + params.toString(), { headers: authHeaders() });
          const result = await response.json();
          if (handleAuthFailure(response, result)) return;
          if (!response.ok) throw new Error(result.error || 'Unable to load registrations');
          loaded.push(...(result.registrations || []));
          cursor = result.cursor || '';
        } while (cursor);

        registrationsCache = loaded;
        const hasCurrent = preserveSelection && selectedReference && registrationsCache.some(item => item.reference === selectedReference);
        if (!hasCurrent) {
          collapseRegistrationDetail();
        }
        renderMetrics(registrationsCache);
        renderFilteredList();
        if (hasCurrent) {
          await loadDetail(selectedReference, { silent: true, noScroll: true });
        }
        loadPlatformSummary();
        loadRecentActivity();
        loadLearnAdmin();
        loadStewardshipCompStatus();
        lastDataLoadedAt = new Date();
        refreshDataAsOf();
        if (!silent) setStatus(`Loaded ${registrationsCache.length} registration(s).`, 'success');
      } catch (err) {
        if (!silent) setStatus(err.message, 'error');
      } finally {
        isLoadingRegistrations = false;
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    function renderMetrics(registrations) {
      document.getElementById('metricTotal').textContent = registrations.length;
      document.getElementById('metricPending').textContent = registrations.filter(item => item.status === 'pending').length;
      document.getElementById('metricVerified').textContent = registrations.filter(item => item.status === 'verified').length;
      document.getElementById('metricStripeReady').textContent = registrations.filter(item => ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus)).length;
      renderCommunitySnapshot(registrations);
      renderNextActionQueue(registrations);
      renderOnboardingHealth(registrations);
      renderProductOverview();
      renderOverviewEmailLog(registrations);
    }

    function renderOverviewEmailLog(registrations) {
      const container = document.getElementById('overviewEmailLog');
      if (!container) return;

      // Collect all email events across all registrations, most recent first
      const events = [];
      for (const reg of registrations) {
        const name = reg.parishName || reg.reference || 'Unknown';
        const emailFields = [
          { key: 'adminNotificationEmailStatus', label: 'AGAPAY alert', to: 'hello@agapay.app', time: reg.receivedAt },
          { key: 'dashboardInviteEmailStatus',    label: 'Dashboard invite', to: reg.priestEmail || reg.treasurerEmail || '', time: reg.dashboardInviteEmailSentAt || reg.reviewedAt },
          { key: 'stripeOnboardingEmailStatus',   label: 'Stripe invite', to: reg.treasurerEmail || reg.priestEmail || '', time: reg.stripeOnboardingEmailSentAt || reg.reviewedAt },
        ];
        for (const f of emailFields) {
          const status = reg[f.key];
          if (!status || status === 'not_configured' || status === 'not_sent' || status === 'pending') continue;
          events.push({ name, type: f.label, status, to: f.to, time: f.time || reg.updatedAt || reg.receivedAt || '' });
        }
        for (const e of (reg.emailLog || [])) {
          events.push({ name, type: e.type || 'Email', status: e.status || 'sent', to: e.to || '', time: e.sentAt || '' });
        }
      }

      if (!events.length) {
        container.innerHTML = '<div class="email-log-empty">No email activity recorded yet. Load registrations to populate this log.</div>';
        return;
      }

      // Sort by time descending, show 12 most recent
      events.sort((a, b) => (parseDateMs(b.time) || 0) - (parseDateMs(a.time) || 0));
      const recent = events.slice(0, 12);

      container.innerHTML = recent.map(e => {
        const dotClass = e.status === 'sent' ? 'sent' : e.status === 'failed' ? 'failed' : 'skipped';
        const to = e.to ? ` → ${escapeHtml(e.to)}` : '';
        return `<div class="email-log-entry">
          <div class="email-log-dot ${dotClass}"></div>
          <div>
            <div class="email-log-type">${escapeHtml(e.name)} — ${escapeHtml(e.type)}</div>
            <div class="email-log-detail">${escapeHtml(e.status)}${to}</div>
          </div>
          <div class="email-log-time">${e.time ? escapeHtml(shortDate(e.time)) : ''}</div>
        </div>`;
      }).join('');
    }

    async function loadRecentActivity() {
      const container = document.getElementById('recentActivityFeed');
      if (!container) return;
      container.innerHTML = '<div class="activity-feed-empty">Loading…</div>';
      try {
        const response = await fetch('/api/admin/recent-activity', { headers: authHeaders() });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Failed to load activity');
        renderRecentActivity(result.events || []);
      } catch (err) {
        container.innerHTML = `<div class="activity-feed-empty">${escapeHtml(err.message)}</div>`;
      }
    }

    function renderRecentActivity(events) {
      const container = document.getElementById('recentActivityFeed');
      if (!container) return;

      if (!events.length) {
        container.innerHTML = '<div class="activity-feed-empty">No activity yet.</div>';
        return;
      }

      const iconFor = (type) => {
        if (type === 'donor_signup') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        if (type === 'stewardship_activated') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
      };

      container.innerHTML = events.map(e => {
        const isDonor = e.type === 'donor_signup';
        const name = isDonor && e.name ? `<div class="activity-name">${escapeHtml(e.name)}</div>` : '';
        const email = isDonor && e.detail ? `<a class="activity-email" href="mailto:${escapeAttr(e.detail)}">${escapeHtml(e.detail)}</a>` : escapeHtml(e.detail || '');
        const church = isDonor && (e.church || e.sub)
          ? `<span class="activity-chip">${escapeHtml(e.church || e.sub)}</span>`
          : e.sub ? `<div class="activity-sub">${escapeHtml(e.sub)}</div>` : '';
        return `<div class="activity-entry activity-${escapeAttr(e.type)}">
          <div class="activity-icon">${iconFor(e.type)}</div>
          <div class="activity-body">
            <div class="activity-label">${escapeHtml(e.label)}</div>
            ${name}
            <div class="activity-detail">${email}</div>
            ${church ? `<div class="activity-meta">${church}</div>` : ''}
          </div>
          <div class="activity-time">${e.time ? escapeHtml(shortDate(e.time)) : ''}</div>
        </div>`;
      }).join('');
    }


    function communityTypeOf(registration) {
      const raw = `${registration.communityType || ''} ${registration.parishName || ''}`.toLowerCase();
      if (raw.includes('monastery') || raw.includes('skete')) return 'monastery';
      if (raw.includes('cathedral')) return 'cathedral';
      if (raw.includes('mission')) return 'mission';
      return 'church';
    }

    function renderCommunitySnapshot(registrations) {
      const active = registrations.filter(item => item.status === 'verified' && item.givingStatus !== 'cancelled' && item.givingStatus !== 'hidden');
      const counts = active.reduce((acc, item) => {
        acc[communityTypeOf(item)] += 1;
        return acc;
      }, { mission: 0, church: 0, cathedral: 0, monastery: 0 });

      document.getElementById('snapshotMissions').textContent = counts.mission;
      document.getElementById('snapshotChurches').textContent = counts.church;
      document.getElementById('snapshotCathedrals').textContent = counts.cathedral;
      document.getElementById('snapshotMonasteries').textContent = counts.monastery;
      const directoryVerified = document.getElementById('directoryVerifiedCount');
      const directoryChurch = document.getElementById('directoryChurchCount');
      const directoryMonastery = document.getElementById('directoryMonasteryCount');
      if (directoryVerified) directoryVerified.textContent = String(active.length);
      if (directoryChurch) directoryChurch.textContent = String(counts.church + counts.mission + counts.cathedral);
      if (directoryMonastery) directoryMonastery.textContent = String(counts.monastery);
    }

    function renderOnboardingHealth(registrations) {
      const pane = document.getElementById('onboardingHealthPane');
      if (!pane) return;

      const total = registrations.length;
      const awaitingReview = registrations.filter(item => ['pending', 'needs_more_info'].includes(item.status || 'pending')).length;
      const verified = registrations.filter(item => item.status === 'verified');
      const invitesNeeded = verified.filter(item => item.dashboardInviteEmailStatus !== 'sent').length;
      const stripeNeeded = verified.filter(item => !['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus)).length;
      const stripeReady = verified.filter(item => ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus));
      const billingNeeded = stripeReady.filter(item => !['active', 'free_forever'].includes(item.subscriptionStatus)).length;
      const ready = verified.filter(item =>
        item.dashboardInviteEmailStatus === 'sent' &&
        ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus) &&
        ['active', 'free_forever'].includes(item.subscriptionStatus)
      ).length;
      const readyPercent = total ? Math.round((ready / total) * 100) : 0;

      const readyEl = document.getElementById('healthReadyPercent');
      if (readyEl) readyEl.textContent = `${readyPercent}%`;
      const ringEl = document.getElementById('healthReadyRing');
      if (ringEl) ringEl.style.strokeDasharray = `${readyPercent} 100`;
      const readinessEl = document.querySelector('.health-readiness');
      if (readinessEl) readinessEl.setAttribute('aria-label', `${readyPercent} percent ready`);

      pane.innerHTML = `
        <div class="health-item"><strong>${awaitingReview}</strong><span>Awaiting review</span><p>Canonical standing still needs a decision.</p></div>
        <div class="health-item"><strong>${invitesNeeded}</strong><span>Invites needed</span><p>Verified parishes that still need dashboard access.</p></div>
        <div class="health-item"><strong>${stripeNeeded}</strong><span>Stripe needed</span><p>Verified parishes without connected payments.</p></div>
        <div class="health-item"><strong>${billingNeeded}</strong><span>Billing needed</span><p>Stripe-ready parishes without active billing.</p></div>
      `;
    }

    function parseDateMs(value) {
      if (!value) return 0;
      const ms = new Date(value).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    function daysSince(value) {
      const ms = parseDateMs(value);
      if (!ms) return 0;
      const diff = Date.now() - ms;
      if (diff <= 0) return 0;
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    function currentWorkflowStep(reg) {
      const status = reg.status || 'pending';
      const stripeDone = ['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus);
      const subscriptionDone = ['active', 'free_forever'].includes(reg.subscriptionStatus);
      if (status === 'pending') return { key: 'review', label: 'canonical review' };
      if (status === 'needs_more_info') return { key: 'follow_up', label: 'follow-up review' };
      if (status !== 'verified') return { key: 'inactive', label: 'inactive status' };
      if (reg.dashboardInviteEmailStatus !== 'sent') return { key: 'invite', label: 'dashboard invite' };
      if (!stripeDone) return { key: 'stripe', label: 'Stripe onboarding' };
      if (!subscriptionDone) return { key: 'subscription', label: 'subscription setup' };
      return { key: 'complete', label: 'completed onboarding' };
    }

    function workflowLastActivityAt(reg) {
      const candidates = [
        reg.subscriptionUpdatedAt,
        reg.stripeStatusUpdatedAt,
        reg.stripeAccountUpdatedAt,
        reg.stripeOnboardingEmailSentAt,
        reg.dashboardInviteEmailSentAt,
        reg.reviewedAt,
        reg.updatedAt,
        reg.receivedAt
      ].filter(Boolean);
      if (!candidates.length) return '';
      return candidates.sort((a, b) => parseDateMs(b) - parseDateMs(a))[0] || '';
    }

    function nextActionPriority(reg) {
      const status = reg.status || 'pending';
      const stripeDone = ['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus);
      const subscriptionDone = ['active', 'free_forever'].includes(reg.subscriptionStatus);
      const step = currentWorkflowStep(reg);
      const stalledDays = daysSince(workflowLastActivityAt(reg));

      if (status === 'verified' && reg.stripeAccountStatus === 'restricted') {
        return { priority: 1, label: 'Stripe account regressed to restricted' };
      }
      if (status === 'verified' && reg.subscriptionStatus === 'past_due') {
        return { priority: 1, label: 'Subscription is past due' };
      }
      if (step.key !== 'complete' && stalledDays >= 10) {
        return { priority: 2, label: `Stalled ${stalledDays}d at ${step.label}` };
      }
      if (status === 'pending') return { priority: 3, label: 'Review canonical standing' };
      if (status === 'needs_more_info') return { priority: 4, label: 'Follow up for more info' };
      if (status !== 'verified') return null;
      if (reg.dashboardInviteEmailStatus !== 'sent') return { priority: 5, label: 'Send dashboard invite' };
      if (!stripeDone) return { priority: 6, label: 'Connect Stripe account' };
      if (!subscriptionDone) return { priority: 7, label: 'Set platform subscription' };
      return null;
    }

    function renderNextActionQueue(registrations) {
      const container = document.getElementById('nextActionQueue');
      if (!container) return;

      const items = registrations
        .map(reg => ({ reg, action: nextActionPriority(reg) }))
        .filter(item => item.action)
        .sort((a, b) => {
          if (a.action.priority !== b.action.priority) return a.action.priority - b.action.priority;
          return String(b.reg.receivedAt || '').localeCompare(String(a.reg.receivedAt || ''));
        })
        .slice(0, 5);

      if (!items.length) {
        container.innerHTML = '<div class="next-action-empty">Nothing needs attention right now.</div>';
        return;
      }

      container.innerHTML = items.map(({ reg, action }) => `
        <div class="next-action-item" onclick="loadDetail('${jsAttr(reg.reference)}')">
          <div class="next-action-name">${escapeHtml(reg.parishName || reg.reference)}</div>
          <div class="next-action-label">${escapeHtml(action.label)}</div>
        </div>
      `).join('');
    }

    function renderFilteredList() {
      const query = (document.getElementById('searchInputMain')?.value || '').trim().toLowerCase();
      const status = document.getElementById('statusFilterMain')?.value || 'needs_attention';
      const sort = document.getElementById('sortOrderMain')?.value || 'urgency';

      let filtered = registrationsCache.filter((item) => {
        const haystack = [
          item.reference,
          item.parishName,
          item.communityType,
          item.jurisdiction,
          item.city,
          item.state,
          item.priestEmail,
          item.treasurerEmail,
          item.status,
          item.subscriptionTier,
          item.subscriptionStatus,
          item.stripeAccountStatus
        ].join(' ').toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        const itemStatus = item.status || 'pending';
        let matchesStatus;
        if (status === 'needs_attention') {
          matchesStatus = Boolean(nextActionPriority(item));
        } else if (status === 'all') {
          matchesStatus = true;
        } else {
          matchesStatus = itemStatus === status;
        }
        return matchesQuery && matchesStatus;
      });

      if (sort === 'urgency') {
        filtered = filtered.sort((a, b) => {
          const pa = nextActionPriority(a);
          const pb = nextActionPriority(b);
          const priorityA = pa ? pa.priority : 99;
          const priorityB = pb ? pb.priority : 99;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return daysSince(workflowLastActivityAt(b)) - daysSince(workflowLastActivityAt(a));
        });
      } else {
        filtered = filtered.sort((a, b) => {
          if (sort === 'oldest') return String(a.receivedAt).localeCompare(String(b.receivedAt));
          if (sort === 'name') return String(a.parishName).localeCompare(String(b.parishName));
          return String(b.receivedAt).localeCompare(String(a.receivedAt));
        });
      }

      renderList(filtered);
    }

    function renderList(registrations) {
      const list = document.getElementById('registrationList');
      const queueCount = document.getElementById('queueCount');
      if (queueCount) {
        queueCount.textContent = registrations.length
          ? `${registrations.length} shown / ${registrationsCache.length} total`
          : registrationsCache.length ? 'No matches' : 'No registrations loaded';
      }
      if (!registrations.length) {
        list.innerHTML = '<div class="queue-empty">No matching registrations found. Adjust the filters or refresh the queue.</div>';
        return;
      }

      list.innerHTML = `
        <div class="queue-list">
          ${registrations.map((item) => {
            const action = nextAction(item);
            const priority = nextActionPriority(item);
            const location = [item.city, item.state].filter(Boolean).join(', ') || 'Location pending';
            const community = item.communityType || 'Community';
            const jurisdiction = item.jurisdiction || 'Jurisdiction';
            const firstContact = item.priestEmail || item.treasurerEmail || 'No email on file';
            const age = daysSince(item.receivedAt);
            const stalledAge = daysSince(workflowLastActivityAt(item));
            const ageLabel = age === 0 ? 'Today' : age === 1 ? '1d ago' : `${age}d ago`;
            const urgencyClass = priority && priority.priority <= 2 ? 'urgent'
              : stalledAge >= 10 ? 'stale'
              : age <= 2 ? 'fresh'
              : '';
            return `
              <div class="queue-row ${item.reference === selectedReference ? 'active' : ''}" onclick="loadDetail('${jsAttr(item.reference)}')">
                <label class="queue-check" onclick="event.stopPropagation()" aria-label="Select ${escapeAttr(item.parishName || item.reference)}">
                  <input class="row-chk" type="checkbox" value="${escapeAttr(item.reference)}" onchange="updateBulkBar()" />
                </label>

                <div class="queue-primary">
                  <div class="queue-name">${escapeHtml(item.parishName || item.reference)}${item.promo === 'founding-20' ? '<span class="queue-promo-badge" title="Signed up via the Founding 20 free-year offer">Founding 20</span>' : ''}</div>
                  <div class="queue-meta-line">
                    <span>${escapeHtml(community)}</span>
                    <span>${escapeHtml(jurisdiction)}</span>
                    <span>${escapeHtml(location)}</span>
                  </div>
                  <div class="queue-reference">${escapeHtml(item.reference || '')}</div>
                </div>

                <div class="queue-middle-panel">
                  <div class="queue-status-grid">
                    <div class="queue-status-item">
                      <span class="queue-status-label">Canonical</span>
                      <span class="badge ${escapeAttr(item.status || 'pending')}">${escapeHtml(readable(item.status || 'pending'))}</span>
                    </div>
                    <div class="queue-status-item">
                      <span class="queue-status-label">Stripe</span>
                      <span class="badge ${escapeAttr(item.stripeAccountStatus || 'not_started')}">${escapeHtml(readable(item.stripeAccountStatus))}</span>
                    </div>
                    <div class="queue-status-item">
                      <span class="queue-status-label">Billing</span>
                      <span class="badge ${escapeAttr(item.subscriptionStatus || 'not_started')}">${escapeHtml(readable(item.subscriptionStatus))}</span>
                    </div>
                  </div>
                  <div class="queue-contact">
                    <span><strong>Priest</strong> ${escapeHtml(item.priestEmail || 'Not provided')}</span>
                    <span><strong>Treasurer</strong> ${escapeHtml(item.treasurerEmail || 'Not provided')}</span>
                  </div>
                </div>

                <div class="queue-action-panel">
                  <div class="queue-received">
                    Received ${escapeHtml(shortDate(item.receivedAt))}
                    <span class="queue-age-badge ${escapeAttr(urgencyClass)}">${escapeHtml(ageLabel)}</span>
                  </div>
                  <div class="queue-next"><strong>${escapeHtml(action.title)}</strong><br>${escapeHtml(action.body)}</div>
                  <div class="queue-mobile-summary">
                    <span>${escapeHtml(readable(item.status || 'pending'))}</span>
                    <span>${escapeHtml(firstContact)}</span>
                  </div>
                  ${priority && priority.priority <= 2 ? `<div class="queue-urgent-flag">${escapeHtml(priority.label)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    async function copyText(value) {
      if (!value) {
        setStatus('Nothing to copy.');
        return;
      }
      await navigator.clipboard.writeText(value);
      setStatus('Copied to clipboard.');
    }

    async function loadDetail(reference, options = {}) {
      const { silent = false, noScroll = false } = options;
      selectedReference = reference;
      
      const refEl = document.getElementById('selectedReference');
      if (refEl) {
        refEl.textContent = reference;
      }
      
      document.getElementById('backToQueueBtn')?.classList.remove('hidden');
      document.getElementById('copySummaryBtn')?.classList.remove('hidden');
      if (activeTab !== 'giving') switchTab('giving');
      if (!silent) setStatus('Loading details...');

      try {
        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference), { headers: authHeaders() });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to load registration');

        renderDetail(result.registration);
        renderQueueNext(result.registration);
        renderFilteredList();
        loadRegistrationGivingSummary(reference, { force: true });
        if (!noScroll) {
          document.getElementById('registrationDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (err) {
        if (!silent) setStatus(err.message, 'error');
      }
    }

    function renderRegistrationGivingSummary(summary) {
      const panel = document.getElementById('registrationGivingSummary');
      if (!panel) return;
      if (!summary) {
        panel.innerHTML = '<div class="giving-summary-empty">Loading giving summary…</div>';
        return;
      }
      if (summary.dataSource === 'not_connected') {
        panel.innerHTML = '<div class="giving-summary-empty">Stripe is not connected yet for this parish.</div>';
        return;
      }
      if (summary.dataSource === 'not_configured') {
        panel.innerHTML = '<div class="giving-summary-empty">Stripe reporting is not configured on this environment.</div>';
        return;
      }
      if (summary.error) {
        panel.innerHTML = `<div class="giving-summary-empty">${escapeHtml(summary.error)}</div>`;
        return;
      }

      panel.innerHTML = `
        <div class="giving-summary-grid">
          <div class="giving-summary-stat">
            <strong>${moneyShort(summary.ytdCents || 0)}</strong>
            <span>${summary.year || new Date().getFullYear()} received</span>
          </div>
          <div class="giving-summary-stat">
            <strong>${summary.giftCount || 0}</strong>
            <span>Total gifts</span>
          </div>
          <div class="giving-summary-stat">
            <strong>${summary.lastGiftAt ? shortDate(summary.lastGiftAt) : 'No gifts yet'}</strong>
            <span>Last gift date</span>
          </div>
        </div>
      `;
    }

    async function loadRegistrationGivingSummary(reference, options = {}) {
      const { force = false } = options;
      const cached = givingSummaryCache.get(reference);
      if (cached && !force) {
        renderRegistrationGivingSummary(cached);
        return cached;
      }
      renderRegistrationGivingSummary(null);
      try {
        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/giving-summary', { headers: authHeaders() });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return null;
        if (!response.ok) throw new Error(result.detail || result.error || 'Unable to load giving summary');
        const summary = result.summary || {};
        givingSummaryCache.set(reference, summary);
        renderRegistrationGivingSummary(summary);
        return summary;
      } catch (err) {
        const summary = { error: err.message || 'Unable to load giving summary.' };
        renderRegistrationGivingSummary(summary);
        return summary;
      }
    }

    function renderAdminAuditLog(reg) {
      const entries = Array.isArray(reg.adminAuditLog) ? reg.adminAuditLog.slice().reverse() : [];
      if (!entries.length) {
        return '<div class="audit-log-empty">No admin actions logged for this registration yet.</div>';
      }
      return entries.map((entry) => {
        const details = entry.details && typeof entry.details === 'object'
          ? Object.entries(entry.details).filter(([, value]) => value !== '' && value !== null && value !== undefined)
          : [];
        const detailText = details.length
          ? details.map(([key, value]) => `${readable(key)}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ')
          : 'No extra details.';
        return `
          <div class="audit-log-entry">
            <div class="audit-log-head">
              <strong>${escapeHtml(readable(entry.action || 'unknown'))}</strong>
              <span>${escapeHtml(shortDate(entry.at))}</span>
            </div>
            <div class="audit-log-meta">By ${escapeHtml(entry.actor || 'Admin')}</div>
            <div class="audit-log-detail">${escapeHtml(detailText)}</div>
          </div>
        `;
      }).join('');
    }

    function renderDetail(reg) {
      const action = nextAction(reg);
      const reviewDone = reg.status === 'verified';
      const inviteDone = reg.dashboardInviteEmailStatus === 'sent';
      const stripeDone = ['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus);
      const subscriptionDone = ['active', 'free_forever'].includes(reg.subscriptionStatus);
      const reference = jsAttr(reg.reference);
      const publicParishId = escapeHtml(reg.parishId || '');
      document.getElementById('registrationDetail').innerHTML = `
        <button class="secondary btn-sm back-to-queue" onclick="collapseRegistrationDetail()">Back to Giving queue</button>
        <div class="workflow-card">
          <div class="workflow-top">
            <div>
              <div class="workflow-title">${escapeHtml(action.title)}</div>
              <div class="workflow-sub">${escapeHtml(action.body)}</div>
            </div>
            <span class="badge ${escapeAttr(reg.status || 'pending')}">${escapeHtml(readable(reg.status))}</span>
          </div>
          <div class="step-track">
            <div class="step-chip ${reviewDone ? 'done' : 'current'}"><strong>1. Verify</strong><span>${reviewDone ? 'Canonical review complete.' : 'Confirm canonical standing and contacts.'}</span></div>
            <div class="step-chip ${inviteDone ? 'done' : reviewDone ? 'current' : ''}"><strong>2. Invite</strong><span>${inviteDone ? 'Dashboard invite sent.' : 'Send parish dashboard access.'}</span></div>
            <div class="step-chip ${stripeDone ? 'done' : inviteDone ? 'current' : ''}"><strong>3. Stripe</strong><span>${stripeDone ? 'Payments are enabled.' : 'Connect the parish Stripe account.'}</span></div>
            <div class="step-chip ${subscriptionDone ? 'done' : stripeDone ? 'current' : ''}"><strong>4. Subscription</strong><span>${subscriptionDone ? 'AGAPAY billing is set.' : 'Set platform subscription tier/status.'}</span></div>
          </div>
        </div>
        ${reg.promo === 'founding-20' ? `
        <div class="admin-section founding-promo-callout">
          <div class="admin-section-title">Founding 20 &mdash; Free Year Offer</div>
          <p class="founding-promo-copy">This parish registered through the Founding 20 free-year AGAPAY Parish + offer. Grant the free year below, or from Developer Tools.</p>
          <div class="btn-row">
            <button class="secondary btn-sm" id="detailCompGrantBtn" onclick="grantStewardshipCompFromDetail('${publicParishId}', this)">Grant free year to ${publicParishId}</button>
          </div>
          <span id="detailCompGrantStatus" class="founding-promo-status"></span>
        </div>` : ''}
        <div class="admin-section">
          <div class="admin-section-title">Parish Giving Snapshot</div>
          <div class="giving-summary-panel" id="registrationGivingSummary">
            <div class="giving-summary-empty">Loading giving summary…</div>
          </div>
        </div>
        <div class="grid">
          ${field('Status', reg.status)}
          ${field('Giving Status', reg.givingStatus)}
          ${field('Stripe Status', reg.stripeAccountStatus)}
          ${field('Subscription', `${subscriptionTierLabel(reg)} / ${readable(reg.subscriptionStatus)} / ${money(reg.subscriptionMonthlyCents)}`)}
          ${field('Transaction fee', transactionFeeLabel(reg))}
          ${field('Stripe Account ID', reg.stripeAccountId)}
          ${field('Charges Enabled', reg.stripeChargesEnabled === undefined ? '' : String(reg.stripeChargesEnabled))}
          ${field('Payouts Enabled', reg.stripePayoutsEnabled === undefined ? '' : String(reg.stripePayoutsEnabled))}
          ${field('Stripe Invite Email', reg.stripeOnboardingEmailStatus)}
          ${field('Dashboard Invite Email', reg.dashboardInviteEmailStatus)}
          ${field('AGAPAY Alert Email', reg.adminNotificationEmailStatus)}
          ${field('Dashboard Invite Recipients', Array.isArray(reg.dashboardInviteEmailRecipients) ? reg.dashboardInviteEmailRecipients.join(', ') : '', 'full')}
          ${field('Public Parish ID', reg.parishId)}
          ${field('Parish Dashboard Password', (reg.parishDashboardToken || reg.parishDashboardPasswordRecord) ? 'Set' : 'Not set')}
          ${field('Received', reg.receivedAt)}
          ${field('Reviewed', reg.reviewedAt)}
          ${field('Community', reg.parishName)}
          ${field('Type', reg.communityType)}
          ${field('Liturgical Calendar', reg.liturgicalCalendar || 'julian')}
          ${field('Jurisdiction', reg.jurisdiction, 'full')}
          ${field('Location', `${reg.city || ''}, ${reg.state || ''}`)}
          ${field('Website', reg.website)}
          ${field('Priest/Admin', `${reg.priestFirst || ''} ${reg.priestLast || ''}`)}
          ${field('Priest Email', reg.priestEmail)}
          ${field('Priest Phone', reg.priestPhone)}
          ${field('Treasurer', `${reg.treasurerFirst || ''} ${reg.treasurerLast || ''}`)}
          ${field('Treasurer Email', reg.treasurerEmail)}
          ${field('Diocese / Deanery', reg.dioceseOrDeanery)}
          ${field('Bishop / Authority', reg.bishopOrAuthority)}
          ${field('Verification Source', reg.verificationSource)}
          ${field('Reviewed By', reg.reviewedBy)}
          ${field('Notes', reg.notes, 'full')}
          ${field('Reviewer Notes', reg.reviewerNotes, 'full')}
        </div>
        ${renderStripeRequirements(reg)}
        ${reg.status === 'verified' && reg.parishId ? `
          <div class="field full">
            <div class="field-key">Public profile</div>
            <div class="field-val">
              This registration is included in <code>/api/parishes</code> as <strong>${publicParishId}</strong> when giving status is active.
              <br><br>
              Public giving URL: <code>/give/${publicParishId}</code>
            </div>
          </div>
        ` : ''}
        <div class="actions">
          <div class="admin-section">
            <div class="admin-section-title">Review</div>
            <div class="form-grid">
              <div>
                <label for="statusSelect">Canonical review status</label>
                <select id="statusSelect">
                  <option value="pending" ${reg.status === 'pending' ? 'selected' : ''}>Pending</option>
                  <option value="needs_more_info" ${reg.status === 'needs_more_info' ? 'selected' : ''}>Needs more info</option>
                  <option value="verified" ${reg.status === 'verified' ? 'selected' : ''}>Verified</option>
                  <option value="rejected" ${reg.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                  <option value="cancelled" ${reg.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </div>
              <div>
                <label for="reviewedBy">Reviewed by</label>
                <input id="reviewedBy" value="${escapeAttr(reg.reviewedBy || adminActor())}" placeholder="Reviewer Name" />
              </div>
              <div>
                <label for="verificationSource">Verification source</label>
                <input id="verificationSource" value="${escapeAttr(reg.verificationSource)}" placeholder="Diocesan directory, parish website, clergy confirmation" />
              </div>
              <div>
                <label for="bishopOrAuthority">Bishop / authority</label>
                <input id="bishopOrAuthority" value="${escapeAttr(reg.bishopOrAuthority)}" placeholder="Bishop or diocesan authority" />
              </div>
              <div class="full">
                <label for="dioceseOrDeanery">Diocese / deanery</label>
                <input id="dioceseOrDeanery" value="${escapeAttr(reg.dioceseOrDeanery)}" placeholder="Diocese, metropolis, deanery, or vicariate" />
              </div>
            </div>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Giving Page</div>
            <div class="form-grid">
              <div>
                <label for="givingStatus">Giving page status</label>
                <select id="givingStatus">
                  <option value="active" ${(reg.givingStatus || 'active') === 'active' ? 'selected' : ''}>Active</option>
                  <option value="paused" ${reg.givingStatus === 'paused' ? 'selected' : ''}>Paused</option>
                  <option value="hidden" ${reg.givingStatus === 'hidden' ? 'selected' : ''}>Hidden</option>
                  <option value="cancelled" ${reg.givingStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </div>
              <div>
                <label for="platformFee">Platform fee setting</label>
                <input id="platformFee" value="${escapeAttr(reg.platformFee)}" placeholder="5% + $0.30 standard; negotiated for cathedral/diocese" />
              </div>
              <div>
                <label for="liturgicalCalendar">Liturgical calendar</label>
                <select id="liturgicalCalendar">
                  <option value="julian" ${(reg.liturgicalCalendar || 'julian') === 'julian' ? 'selected' : ''}>Julian</option>
                  <option value="gregorian" ${reg.liturgicalCalendar === 'gregorian' ? 'selected' : ''}>Revised-Julian</option>
                </select>
              </div>
              <div>
                <label for="parishDashboardToken">Parish dashboard token</label>
                <input id="parishDashboardToken" value="${escapeAttr(reg.parishDashboardToken)}" placeholder="Give this private token to the parish" />
              </div>
            </div>
            <div class="button-row" style="margin-top:0.75rem;">
              <button class="secondary" onclick="generateDashboardToken()">Generate temporary token</button>
              <button class="gold" onclick="sendDashboardInvite('${reference}', this)">Email dashboard invite</button>
            </div>
            <label class="check-card" style="margin-top:0.75rem;">
              <input id="autoDashboardInvite" type="checkbox" ${reg.status === 'verified' && reg.dashboardInviteEmailStatus === 'sent' ? '' : 'checked'} />
              Email dashboard invite when saving a verified parish
            </label>
            <p style="margin:0.65rem 0 0; color:var(--stone); font-size: 11px; line-height:1.55;">
              The invite email goes to the priest and treasurer with the dashboard link, parish ID, and temporary token.
            </p>
            <div class="toggle-row" style="margin-top:0.75rem;">
              <label class="check-card"><input id="recurringGivingEnabled" type="checkbox" ${(reg.recurringGivingEnabled ?? true) ? 'checked' : ''} /> Recurring giving</label>
              <label class="check-card"><input id="candlesEnabled" type="checkbox" ${(reg.candlesEnabled ?? true) ? 'checked' : ''} /> Candles</label>
              <label class="check-card"><input id="commemorationsEnabled" type="checkbox" ${(reg.commemorationsEnabled ?? true) ? 'checked' : ''} /> Commemorations</label>
            </div>
            <div class="form-grid" style="margin-top:0.75rem;">
              <div>
                <label for="fundsJson">Funds JSON</label>
                <textarea id="fundsJson" spellcheck="false">${jsonForTextarea(reg.funds, [{ id: 'general', name: 'General Operating Fund', description: 'Utilities, supplies, ministries, and day-to-day parish needs.' }])}</textarea>
              </div>
              <div>
                <label for="campaignsJson">Campaigns JSON</label>
                <textarea id="campaignsJson" spellcheck="false">${jsonForTextarea(reg.campaigns, [{ id: 'campaign', name: 'Parish Campaign', description: 'Parish-approved campaign for a specific need.' }])}</textarea>
              </div>
            </div>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">AGAPAY Subscription</div>
            <div class="form-grid">
              <div>
                <label for="subscriptionTier">Subscription tier</label>
                <select id="subscriptionTier">
                  <option value="mission" ${(reg.subscriptionTier || '') === 'mission' ? 'selected' : ''}>Mission - $49/mo + 5% + $0.30</option>
                  <option value="parish" ${(!reg.subscriptionTier || reg.subscriptionTier === 'parish') ? 'selected' : ''}>Parish - $99/mo + 5% + $0.30</option>
                  <option value="diocese" ${reg.subscriptionTier === 'diocese' ? 'selected' : ''}>Cathedral / Diocese - negotiated</option>
                  <option value="monastery_free" ${reg.subscriptionTier === 'monastery_free' ? 'selected' : ''}>Monastery / Skete - no monthly fee + 5% + $0.30</option>
                </select>
              </div>
              <div>
                <label for="subscriptionStatus">Subscription status</label>
                <select id="subscriptionStatus">
                  <option value="not_started" ${(reg.subscriptionStatus || 'not_started') === 'not_started' ? 'selected' : ''}>Not started</option>
                  <option value="checkout_created" ${reg.subscriptionStatus === 'checkout_created' ? 'selected' : ''}>Checkout created</option>
                  <option value="active" ${reg.subscriptionStatus === 'active' ? 'selected' : ''}>Active</option>
                  <option value="past_due" ${reg.subscriptionStatus === 'past_due' ? 'selected' : ''}>Past due</option>
                  <option value="cancelled" ${reg.subscriptionStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                  <option value="free_forever" ${reg.subscriptionStatus === 'free_forever' ? 'selected' : ''}>Free forever</option>
                </select>
              </div>
              <div>
                <label for="stripeCustomerId">Stripe customer ID</label>
                <input id="stripeCustomerId" value="${escapeAttr(reg.stripeCustomerId)}" placeholder="cus_..." />
              </div>
              <div>
                <label for="stripeSubscriptionId">Stripe subscription ID</label>
                <input id="stripeSubscriptionId" value="${escapeAttr(reg.stripeSubscriptionId)}" placeholder="sub_..." />
              </div>
            </div>
            <div class="button-row" style="margin-top:0.75rem;">
              <button class="gold" onclick="createSubscriptionCheckout('${reference}', this)">Create subscription checkout</button>
            </div>
            <div class="payment-status" id="subscriptionStatusMessage"></div>
            <div class="stripe-link-box" id="subscriptionLinkBox">
              <a id="subscriptionCheckoutLink" href="#" target="_blank" rel="noopener">Open subscription checkout</a>
              <p id="subscriptionLinkHelp">Use this link when the parish is ready to start its AGAPAY monthly platform subscription. Standard transaction fees are 5% + $0.30; cathedral/diocese pricing is negotiated.</p>
            </div>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Payments</div>
            <div class="form-grid">
              <div>
                <label for="stripeAccountStatus">Stripe onboarding status</label>
                <select id="stripeAccountStatus">
                  <option value="not_started" ${(reg.stripeAccountStatus || 'not_started') === 'not_started' ? 'selected' : ''}>Not started</option>
                  <option value="invited" ${reg.stripeAccountStatus === 'invited' ? 'selected' : ''}>Invited</option>
                  <option value="onboarding" ${reg.stripeAccountStatus === 'onboarding' ? 'selected' : ''}>Onboarding</option>
                  <option value="charges_enabled" ${reg.stripeAccountStatus === 'charges_enabled' ? 'selected' : ''}>Charges enabled</option>
                  <option value="payouts_enabled" ${reg.stripeAccountStatus === 'payouts_enabled' ? 'selected' : ''}>Payouts enabled</option>
                  <option value="restricted" ${reg.stripeAccountStatus === 'restricted' ? 'selected' : ''}>Restricted</option>
                </select>
              </div>
              <div>
                <label for="stripeAccountId">Stripe account ID</label>
                <input id="stripeAccountId" value="${escapeAttr(reg.stripeAccountId)}" placeholder="acct_..." />
              </div>
            </div>
            <div class="button-row" style="margin-top:0.75rem;">
              <button class="gold" onclick="startStripeOnboarding('${reference}', this)">Create onboarding link</button>
              <button class="secondary" onclick="refreshStripeStatus('${reference}', this)">Refresh Stripe status</button>
            </div>
            <div class="payment-status" id="paymentStatus"></div>
            <div class="stripe-link-box" id="stripeLinkBox">
              <a id="stripeOnboardingLink" href="#" target="_blank" rel="noopener">Open Stripe onboarding</a>
              <p id="stripeLinkHelp">This creates or opens a Standard connected Stripe account for the parish. Send this link to the parish treasurer if they should complete onboarding themselves.</p>
            </div>
            <p style="margin:0.65rem 0 0; color:var(--stone); font-size: 11px; line-height:1.55;">
              Onboarding links are single-use. If a link expires or the parish returns later, create a fresh one.
            </p>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Email Log</div>
            <div class="email-log" id="emailLogEntries">
              ${renderEmailLog(reg)}
            </div>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Admin Audit Log</div>
            <div class="audit-log">${renderAdminAuditLog(reg)}</div>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Internal Notes</div>
            <div class="notes-history">${renderNotesHistory(reg)}</div>
            <label for="reviewerNotes">Reviewer notes</label>
            <textarea id="reviewerNotes" placeholder="Write a note — saved entries stay in history with a timestamp and your name"></textarea>
          </div>
        <div class="button-row">
          <button class="gold" onclick="saveReview('${reference}', this)">Save review</button>
          <button class="secondary" onclick="copyRegistrationSummary()">Copy summary</button>
        </div>
        <div class="mobile-review-bar">
          <button class="secondary" onclick="copyRegistrationSummary()">Copy</button>
          <button class="gold" onclick="saveReview('${reference}', this)">Save review</button>
        </div>
      </div>
      `;
    }

    function copyRegistrationSummary() {
      const fields = Array.from(document.querySelectorAll('#registrationDetail .field')).map((field) => {
        const key = field.querySelector('.field-key')?.textContent || '';
        const value = field.querySelector('.field-val')?.textContent.trim() || '';
        return `${key}: ${value}`;
      }).filter(line => line.trim() !== ':');
      if (!fields.length) {
        setStatus('No registration loaded yet.', 'error');
        return;
      }
      navigator.clipboard.writeText(fields.join('\n'));
      setStatus('Registration summary copied.', 'success');
    }

    function dashboardInviteMessage(invite) {
      if (!invite) return '';
      if (invite.status === 'sent') return ` Dashboard invite sent to ${(invite.recipients || []).join(', ')}.`;
      if (invite.status === 'not_configured') return ' Dashboard invite prepared, but email was not sent because RESEND_API_KEY is not configured.';
      if (invite.status === 'missing_recipient') return ' Dashboard invite prepared, but no priest or treasurer email is on this registration.';
      if (invite.status === 'failed') return ` Dashboard invite email failed: ${invite.detail || 'provider rejected the message'}.`;
      return ` Dashboard invite status: ${invite.status || 'unknown'}.`;
    }

    async function saveReview(reference, btn, options = {}) {
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      
      try {
        const selectedStatus = document.getElementById('statusSelect').value;
        const shouldRunAutoVerifiedWorkflow = selectedStatus === 'verified' && !options.skipAutoVerifiedWorkflow;
        let funds = [];
        let campaigns = [];
        try {
          funds = JSON.parse(document.getElementById('fundsJson').value || '[]');
          campaigns = JSON.parse(document.getElementById('campaignsJson').value || '[]');
        } catch {
          setStatus('Funds or campaigns JSON is invalid.', 'error');
          return;
        }

        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference), {
          method: 'PATCH',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: selectedStatus,
            givingStatus: document.getElementById('givingStatus').value,
            stripeAccountStatus: document.getElementById('stripeAccountStatus').value,
            stripeAccountId: document.getElementById('stripeAccountId').value,
            reviewedBy: document.getElementById('reviewedBy').value,
            verificationSource: document.getElementById('verificationSource').value,
            bishopOrAuthority: document.getElementById('bishopOrAuthority').value,
            dioceseOrDeanery: document.getElementById('dioceseOrDeanery').value,
            platformFee: document.getElementById('platformFee').value,
            liturgicalCalendar: document.getElementById('liturgicalCalendar').value,
            subscriptionTier: document.getElementById('subscriptionTier').value,
            subscriptionStatus: document.getElementById('subscriptionStatus').value,
            stripeCustomerId: document.getElementById('stripeCustomerId').value,
            stripeSubscriptionId: document.getElementById('stripeSubscriptionId').value,
            recurringGivingEnabled: document.getElementById('recurringGivingEnabled').checked,
            candlesEnabled: document.getElementById('candlesEnabled').checked,
            commemorationsEnabled: document.getElementById('commemorationsEnabled').checked,
            funds,
            campaigns,
            parishDashboardToken: document.getElementById('parishDashboardToken').value.trim(),
            sendDashboardInvite: shouldRunAutoVerifiedWorkflow ? false : options.sendDashboardInvite ?? document.getElementById('autoDashboardInvite').checked,
            reviewerNotes: document.getElementById('reviewerNotes').value
          })
        });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.error || 'Unable to save review');

        let finalRegistration = result.registration;
        let workflowMessage = '';
        if (shouldRunAutoVerifiedWorkflow) {
          const workflow = await runAutoVerifiedWorkflow(reference);
          finalRegistration = workflow.registration || finalRegistration;
          workflowMessage = workflow.message ? ` ${workflow.message}` : '';
        }

        // Clear the notes textarea after successful save
        const notesEl = document.getElementById('reviewerNotes');
        if (notesEl) notesEl.value = '';
        const reviewerName = document.getElementById('reviewedBy')?.value.trim();
        if (reviewerName) {
          try { sessionStorage.setItem(adminActorKey, reviewerName); } catch {}
        }

        renderDetail(finalRegistration);
        renderQueueNext(finalRegistration);
        await loadRegistrations();
        const inviteMessage = dashboardInviteMessage(result.dashboardInvite);
        if (finalRegistration.status === 'verified' && finalRegistration.parishId) {
          setStatus(`Review saved. ${finalRegistration.parishName} is now live.${inviteMessage}${workflowMessage}`, 'success');
          return;
        }
        setStatus(`Review saved.${inviteMessage}${workflowMessage}`, 'success');
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    async function runAutoVerifiedWorkflow(reference) {
      const messages = [];
      let registration = null;

      const stripeResponse = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/stripe-onboarding', {
        method: 'POST',
        headers: authHeaders()
      });
      const stripe = await stripeResponse.json();
      if (handleAuthFailure(stripeResponse, stripe)) {
        return { registration, message: 'Auto workflow paused: session expired.' };
      }
      if (stripeResponse.ok) {
        registration = stripe.registration || registration;
        messages.push(stripe.email?.status === 'sent' ? 'Stripe onboarding email sent.' : 'Stripe onboarding link created.');
      } else {
        messages.push(`Stripe onboarding skipped: ${stripe.detail || stripe.error || 'unknown error'}.`);
      }

      return { registration, message: messages.join(' ') };
    }

    function generateDashboardToken() {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      const tokenValue = 'agp_tmp_' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const tokenInput = document.getElementById('parishDashboardToken');
      if (tokenInput) tokenInput.value = tokenValue;
      setStatus('Temporary dashboard token generated. Saving will email the invite.');
    }

    async function sendDashboardInvite(reference, btn) {
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      
      try {
        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/dashboard-invite', {
          method: 'POST',
          headers: authHeaders()
        });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.detail || result.error || 'Unable to send dashboard invite');

        renderDetail(result.registration);
        await loadRegistrations();
        if (result.email?.status === 'sent') {
          setStatus(`Dashboard invite sent to ${(result.email.recipients || []).join(', ')}.`, 'success');
          return;
        }
        if (result.email?.status === 'not_configured') {
          setStatus('Invite prepared, but email was not sent (RESEND_API_KEY missing).', 'info');
          return;
        }
        if (result.email?.status === 'missing_recipient') {
          setStatus('Invite prepared, but no priest or treasurer email is on this registration.', 'error');
          return;
        }
        throw new Error(result.email?.detail || `Email status: ${result.email?.status || 'unknown'}`);
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    function setSubscriptionStatus(message, tone = '') {
      const box = document.getElementById('subscriptionStatusMessage');
      if (box) box.textContent = message || '';
      setStatus(message, tone);
    }

    async function createSubscriptionCheckout(reference, btn) {
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      
      try {
        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/subscription-checkout', {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            subscriptionTier: document.getElementById('subscriptionTier').value
          })
        });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.detail || result.error || 'Unable to create subscription checkout');

        renderDetail(result.registration);
        renderQueueNext(result.registration);
        await loadRegistrations();

        if (!result.checkoutUrl) {
          setSubscriptionStatus('Subscription updated. This tier does not require Stripe checkout.', 'info');
          return;
        }

        const linkBox = document.getElementById('subscriptionLinkBox');
        const link = document.getElementById('subscriptionCheckoutLink');
        const help = document.getElementById('subscriptionLinkHelp');
        if (linkBox && link) {
          link.href = result.checkoutUrl;
          linkBox.classList.add('visible');
        }
        let copied = false;
        try {
          await navigator.clipboard.writeText(result.checkoutUrl);
          copied = true;
        } catch {
          copied = false;
        }
        if (help) help.textContent = copied
          ? 'The subscription checkout link was copied to your clipboard. Send it to the parish treasurer when they are ready to activate AGAPAY billing.'
          : 'Clipboard access was blocked, but the subscription checkout link is ready here.';
        setSubscriptionStatus(copied ? 'Subscription checkout created and copied.' : 'Subscription checkout created.', 'success');
      } catch (err) {
        setSubscriptionStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    async function startStripeOnboarding(reference, btn) {
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      
      try {
        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/stripe-onboarding', {
          method: 'POST',
          headers: authHeaders()
        });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.detail || result.error || 'Unable to create Stripe onboarding link');

        renderDetail(result.registration);
        await loadRegistrations();
        const linkBox = document.getElementById('stripeLinkBox');
        const link = document.getElementById('stripeOnboardingLink');
        const help = document.getElementById('stripeLinkHelp');
        if (linkBox && link) {
          link.href = result.onboardingUrl;
          linkBox.classList.add('visible');
        }
        let copied = false;
        try {
          await navigator.clipboard.writeText(result.onboardingUrl);
          copied = true;
        } catch {
          copied = false;
        }
        const emailStatus = result.email?.status || 'unknown';
        const emailNote = emailStatus === 'sent'
          ? ' Treasurer invite email sent.'
          : emailStatus === 'not_configured'
            ? ' Email not sent because RESEND_API_KEY is not configured.'
            : emailStatus === 'failed'
              ? ` Email failed: ${result.email.detail || 'provider rejected the message'}.`
              : '';
        const message = copied
          ? `Stripe onboarding link created and copied. Click Open Stripe onboarding.${emailNote}`
          : `Stripe onboarding link created. Click Open Stripe onboarding.${emailNote}`;
        if (help) help.textContent = copied
          ? 'The link has also been copied to your clipboard. Send it to the parish treasurer if they should complete onboarding themselves.'
          : 'Clipboard access was blocked, but the Standard account onboarding link is ready here.';
        setPaymentStatus(message, 'success');
      } catch (err) {
        setPaymentStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    async function refreshStripeStatus(reference, btn) {
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      
      try {
        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/stripe-refresh', {
          method: 'POST',
          headers: authHeaders()
        });
        const result = await response.json();
        if (handleAuthFailure(response, result)) return;
        if (!response.ok) throw new Error(result.detail || result.error || 'Unable to refresh Stripe status');

        renderDetail(result.registration);
        await loadRegistrations();
        setPaymentStatus(`Stripe status refreshed: ${result.registration.stripeAccountStatus || 'unknown'}.`, 'success');
      } catch (err) {
        setPaymentStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      }
    }

    // ── TAB NAVIGATION ────────────────────────────────────────────────────
    let activeTab = 'overview';

    function switchTab(tab) {
      if (tab === 'queue') tab = 'giving';
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.sidebar-nav-item, .mobile-tab-link').forEach(n => n.classList.remove('active'));
      const panel = document.getElementById('tab-' + tab);
      const nav   = document.getElementById('nav-' + tab);
      const mobileNav = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
      if (panel) panel.classList.add('active');
      if (nav)   nav.classList.add('active');
      if (mobileNav) mobileNav.classList.add('active');
      activeTab = tab;
      const titles = {
        overview: 'Platform Overview',
        giving: 'AGAPAY Give',
        learn: 'AGAPAY Learn',
        marketplace: 'AGAPAY Marketplace',
        directory: 'AGAPAY Directory',
        settings: 'Settings',
        developer: 'Developer Tools'
      };
      const titleEl = document.getElementById('topbarTitle');
      if (titleEl) titleEl.textContent = titles[tab] || 'Admin Console';
      document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
      if (tab === 'learn') loadLearnAdmin();
      if (tab === 'settings') loadMyAgapayReleaseFlags();
    }

    // ── BULK ACTIONS ──────────────────────────────────────────────────────
    let selectedRefs = new Set();

    function updateBulkBar() {
      selectedRefs = new Set(
        Array.from(document.querySelectorAll('.row-chk:checked')).map(c => c.value)
      );
      const bar = document.getElementById('bulkBar');
      const cnt = document.getElementById('bulkCount');
      if (!bar) return;
      if (selectedRefs.size > 0) {
        bar.classList.add('visible');
        cnt.textContent = selectedRefs.size + ' selected';
      } else {
        bar.classList.remove('visible');
      }
    }

    function toggleSelectAll(chk) {
      document.querySelectorAll('.row-chk').forEach(c => { c.checked = chk.checked; });
      updateBulkBar();
    }

    function clearSelection() {
      document.querySelectorAll('.row-chk').forEach(c => { c.checked = false; });
      const all = document.getElementById('selectAllChk');
      if (all) all.checked = false;
      updateBulkBar();
    }

    function renderBulkResults(title, rows = []) {
      const panel = document.getElementById('bulkResults');
      if (!panel) return;
      if (!rows.length) {
        panel.classList.remove('visible');
        panel.innerHTML = '';
        return;
      }
      panel.classList.add('visible');
      panel.innerHTML = `
        <div class="bulk-results-head">
          <strong>${escapeHtml(title)}</strong>
          <button class="secondary btn-sm" onclick="renderBulkResults('', [])">Clear log</button>
        </div>
        <div class="bulk-results-log">
          ${rows.map((row) => `
            <div class="bulk-result-row ${escapeAttr(row.tone || '')}">
              ${escapeHtml(row.message || '')}
            </div>
          `).join('')}
        </div>
      `;
    }

    async function bulkAction(action) {
      if (!selectedRefs.size) return;
      const refs = Array.from(selectedRefs);
      const labels = { invite: 'dashboard invites', stripe: 'Stripe onboarding links' };
      const label = labels[action];
      if (!label) return;
      if (!confirm(`Send ${label} to ${refs.length} parish(es)?`)) return;

      const rows = [];
      setStatus(`Running bulk action on ${refs.length} parish(es)...`);
      renderBulkResults(`Running ${label}`, rows);
      let done = 0;
      let failed = 0;

      for (const ref of refs) {
        try {
          if (action === 'invite') {
            const r = await fetch('/api/admin/registrations/' + encodeURIComponent(ref) + '/dashboard-invite', { method: 'POST', headers: authHeaders() });
            const body = await r.json().catch(() => ({}));
            if (handleAuthFailure(r, body)) return;
            if (!r.ok) throw new Error(body.detail || body.error || 'Invite failed');
          } else if (action === 'stripe') {
            const r = await fetch('/api/admin/registrations/' + encodeURIComponent(ref) + '/stripe-onboarding', { method: 'POST', headers: authHeaders() });
            const body = await r.json().catch(() => ({}));
            if (handleAuthFailure(r, body)) return;
            if (!r.ok) throw new Error(body.detail || body.error || 'Stripe link failed');
          }
          done++;
          rows.push({ tone: 'success', message: `${ref}: Success` });
        } catch (err) {
          failed++;
          rows.push({ tone: 'error', message: `${ref}: Failed (${err.message || 'unknown error'})` });
        }
        renderBulkResults(`Running ${label} (${done + failed}/${refs.length})`, rows);
      }

      clearSelection();
      await loadRegistrations({ silent: true, preserveSelection: true });
      const summary = `Bulk action complete: ${done} succeeded${failed ? `, ${failed} failed` : ''}.`;
      rows.push({ tone: failed ? 'error' : 'success', message: summary });
      renderBulkResults(`${label} complete`, rows);
      setStatus(summary, failed ? 'error' : 'success');
    }

    // ── EMAIL LOG ─────────────────────────────────────────────────────────
    function renderEmailLog(reg) {
      const emailFields = [
        { key: 'adminNotificationEmailStatus',  label: 'AGAPAY alert',     to: 'hello@agapay.app' },
        { key: 'dashboardInviteEmailStatus',     label: 'Dashboard invite',  to: reg.priestEmail || reg.treasurerEmail || 'priest/treasurer' },
        { key: 'stripeOnboardingEmailStatus',    label: 'Stripe invite',     to: reg.treasurerEmail || reg.priestEmail || 'treasurer' },
      ];
      const logEntries = (reg.emailLog || []);
      const combined = [];

      for (const f of emailFields) {
        const status = reg[f.key];
        if (!status || status === 'not_configured' || status === 'not_sent') continue;
        combined.push({ type: f.label, status, to: f.to, time: reg.reviewedAt || reg.receivedAt || '', source: 'field' });
      }

      for (const e of logEntries) {
        combined.push({ type: e.type || 'Email', status: e.status || 'sent', to: e.to || '', time: e.sentAt || '', detail: e.detail || '', source: 'log' });
      }

      if (!combined.length) {
        return '<div class="email-log-empty">No emails recorded for this registration yet.</div>';
      }

      return combined.map(e => {
        const dotClass = e.status === 'sent' ? 'sent' : e.status === 'failed' ? 'failed' : 'skipped';
        const detail = e.detail ? ` — ${escapeHtml(e.detail)}` : '';
        const to = e.to ? ` → ${escapeHtml(e.to)}` : '';
        return `<div class="email-log-entry">
          <div class="email-log-dot ${dotClass}"></div>
          <div>
            <div class="email-log-type">${escapeHtml(e.type)}</div>
            <div class="email-log-detail">${escapeHtml(e.status)}${to}${detail}</div>
          </div>
          <div class="email-log-time">${e.time ? escapeHtml(shortDate(e.time)) : ''}</div>
        </div>`;
      }).join('');
    }

    // ── NOTES HISTORY ─────────────────────────────────────────────────────
    function renderNotesHistory(reg) {
      const history = reg.notesHistory || [];
      if (!history.length) {
        const legacy = (reg.reviewerNotes || '').trim();
        if (!legacy) return '<div class="notes-empty">No notes yet. Use the field below to add the first note.</div>';
        return `<div class="notes-entry">
          <div class="notes-entry-meta">Legacy note (no timestamp)</div>
          <div class="notes-entry-text">${escapeHtml(legacy)}</div>
        </div>`;
      }
      return history.slice().reverse().map(n => `
        <div class="notes-entry">
          <div class="notes-entry-meta">${escapeHtml(n.author || 'Admin')} · ${n.createdAt ? escapeHtml(shortDate(n.createdAt)) : 'Unknown date'}</div>
          <div class="notes-entry-text">${escapeHtml(n.text || '')}</div>
        </div>
      `).join('');
    }

    const stripeReturnReference = new URLSearchParams(window.location.search).get('stripe_return');
    if (stripeReturnReference) {
      setStatus(`Stripe onboarding returned for ${stripeReturnReference}. Log in, then refresh Stripe status.`);
    }
    const subscriptionReturnReference = new URLSearchParams(window.location.search).get('subscription_return');
    if (subscriptionReturnReference) {
      setStatus(`Subscription checkout returned for ${subscriptionReturnReference}. Log in to review the registration. The Stripe webhook will mark it active after payment is confirmed.`);
    }

    restoreAdminSession();
