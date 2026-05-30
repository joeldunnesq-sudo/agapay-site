    let selectedReference = '';
    let registrationsCache = [];
    const adminSessionKey = 'agapay_admin_token';

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

    function restoreAdminSession() {
      const onLoginPage = document.body?.classList.contains('admin-login-simple');
      const storedToken = sessionStorage.getItem(adminSessionKey) || '';
      const input = document.getElementById('adminToken');
      if (storedToken && input) input.value = storedToken;
      if (!onLoginPage && !storedToken) {
        window.location.replace('/admin/login');
        return;
      }
      if (!onLoginPage && storedToken) {
        setTimeout(() => loadRegistrations(), 80);
      }
    }

    async function loginFromAdminPage(event) {
      event.preventDefault();
      const password = document.getElementById('adminToken')?.value.trim();
      const submit = event.submitter;
      if (!password) { setStatus('Enter the admin password.', 'error'); return; }
      if (submit) { submit.classList.add('loading'); submit.disabled = true; }
      try {
        const response = await fetch('/api/admin/registrations', {
          headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + password }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to log in');
        saveAdminSession(password);
        window.location.href = '/admin';
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (submit) { submit.classList.remove('loading'); submit.disabled = false; }
      }
    }

    function logoutAdmin() {
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

    function authHeaders() {
      return {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token()
      };
    }

    async function changeAdminPassword(btn) {
      if (!token()) {
        setStatus('Enter your current admin password first.', 'error');
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
        if (!response.ok) throw new Error(result.error || 'Unable to update admin password');

        saveAdminSession(newAdminPassword);
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        setStatus('Admin password updated. Use this password for future dashboard logins.', 'success');
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
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
          <div class="growth-chart-title">Parish Growth <span>Gold registered / green verified</span></div>
          <div class="growth-bars">${renderGrowthBars(summary, 'registrations')}</div>
          <div class="growth-note">${summary.year || new Date().getFullYear()} monthly registration activity.</div>
        </div>
        <div class="growth-chart-card">
          <div class="growth-chart-title">Donation Volume <span>${escapeHtml(readable(donationSource))}</span></div>
          <div class="growth-bars">${renderGrowthBars(summary, 'donations')}</div>
          <div class="growth-note">${escapeHtml(donationNote)}</div>
        </div>
      `;
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
            <p>Choose a parish from the queue to begin review.</p>
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
      document.getElementById('registrationDetail').innerHTML = '';
      renderFilteredList();
      document.getElementById('registrationQueue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function loadRegistrations() {
      if (!token()) {
        setStatus('Log in to load registrations.', 'error');
        return;
      }

      const btn = document.getElementById('loadBtn');
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      setStatus('Loading registrations...');

      try {
        const response = await fetch('/api/admin/registrations', { headers: authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load registrations');

        registrationsCache = result.registrations || [];
        collapseRegistrationDetail();
        renderMetrics(registrationsCache);
        renderFilteredList();
        loadPlatformSummary();
        setStatus(`Loaded ${(result.registrations || []).length} registration(s).`, 'success');
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
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

      pane.innerHTML = `
        <div class="health-item"><strong>${awaitingReview}</strong><span>Awaiting review</span><p>Canonical standing still needs a decision.</p></div>
        <div class="health-item"><strong>${invitesNeeded}</strong><span>Invites needed</span><p>Verified parishes that still need dashboard access.</p></div>
        <div class="health-item"><strong>${stripeNeeded}</strong><span>Stripe needed</span><p>Verified parishes without connected payments.</p></div>
        <div class="health-item"><strong>${billingNeeded}</strong><span>Billing needed</span><p>Stripe-ready parishes without active billing.</p></div>
      `;
    }

    function nextActionPriority(reg) {
      const status = reg.status || 'pending';
      const stripeDone = ['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus);
      const subscriptionDone = ['active', 'free_forever'].includes(reg.subscriptionStatus);

      if (status === 'pending') return { priority: 1, label: 'Review canonical standing' };
      if (status === 'needs_more_info') return { priority: 2, label: 'Follow up for more info' };
      if (status !== 'verified') return null;
      if (reg.dashboardInviteEmailStatus !== 'sent') return { priority: 3, label: 'Send dashboard invite' };
      if (!stripeDone) return { priority: 4, label: 'Connect Stripe account' };
      if (!subscriptionDone) return { priority: 5, label: 'Set platform subscription' };
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
      const query = document.getElementById('searchInput').value.trim().toLowerCase();
      const status = document.getElementById('statusFilter').value;
      const sort = document.getElementById('sortOrder').value;

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
        const matchesStatus = status === 'all' || item.status === status;
        return matchesQuery && matchesStatus;
      });

      filtered = filtered.sort((a, b) => {
        if (sort === 'oldest') return String(a.receivedAt).localeCompare(String(b.receivedAt));
        if (sort === 'name') return String(a.parishName).localeCompare(String(b.parishName));
        return String(b.receivedAt).localeCompare(String(a.receivedAt));
      });

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
            const location = [item.city, item.state].filter(Boolean).join(', ') || 'Location pending';
            const community = item.communityType || 'Community';
            const jurisdiction = item.jurisdiction || 'Jurisdiction';
            return `
              <div class="queue-row ${item.reference === selectedReference ? 'active' : ''}" onclick="loadDetail('${jsAttr(item.reference)}')">
                <label class="queue-check" onclick="event.stopPropagation()" aria-label="Select ${escapeAttr(item.parishName || item.reference)}">
                  <input class="row-chk" type="checkbox" value="${escapeAttr(item.reference)}" onchange="updateBulkBar()" />
                </label>

                <div class="queue-primary">
                  <div class="queue-name">${escapeHtml(item.parishName || item.reference)}</div>
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
                  <div class="queue-received">Received ${escapeHtml(shortDate(item.receivedAt))}</div>
                  <div class="queue-next"><strong>${escapeHtml(action.title)}</strong><br>${escapeHtml(action.body)}</div>
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

    async function loadDetail(reference) {
      selectedReference = reference;
      
      const refEl = document.getElementById('selectedReference');
      if (refEl) {
        refEl.textContent = reference;
      }
      
      document.getElementById('backToQueueBtn')?.classList.remove('hidden');
      if (activeTab !== 'queue') switchTab('queue');
      setStatus('Loading details...');

      try {
        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference), { headers: authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load registration');

        renderDetail(result.registration);
        renderQueueNext(result.registration);
        renderFilteredList();
        document.getElementById('registrationDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        setStatus(err.message, 'error');
      }
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
        <button class="secondary btn-sm back-to-queue" onclick="collapseRegistrationDetail()">Back to registration queue</button>
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
          ${field('Parish Dashboard Token', reg.parishDashboardToken ? 'Set' : 'Not set')}
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
              Public giving URL: <code>/give/form?parish=${publicParishId}</code>
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
                <input id="reviewedBy" value="${escapeAttr(reg.reviewedBy)}" placeholder="Reviewer Name" />
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
                  <option value="julian" ${(reg.liturgicalCalendar || 'julian') === 'julian' ? 'selected' : ''}>Julian / Old Calendar</option>
                  <option value="gregorian" ${reg.liturgicalCalendar === 'gregorian' ? 'selected' : ''}>Revised Julian / Gregorian</option>
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
            <p style="margin:0.65rem 0 0; color:var(--stone); font-size:12px; line-height:1.55;">
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
                <textarea id="campaignsJson" spellcheck="false">${jsonForTextarea(reg.campaigns, [{ id: 'alms', name: 'Alms Campaign', description: 'Parish-approved alms for a specific need.' }])}</textarea>
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
            <p style="margin:0.65rem 0 0; color:var(--stone); font-size:12px; line-height:1.55;">
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
            <div class="admin-section-title">Internal Notes</div>
            <div class="notes-history">${renderNotesHistory(reg)}</div>
            <label for="reviewerNotes">Reviewer notes</label>
            <textarea id="reviewerNotes" placeholder="Write a note — saved entries stay in history with a timestamp and your name"></textarea>
          </div>
          <div class="button-row">
            <button class="gold" onclick="saveReview('${reference}', this)">Save review</button>
            <button class="secondary" onclick="copyRegistrationSummary()">Copy summary</button>
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

      const inviteResponse = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/dashboard-invite', {
        method: 'POST',
        headers: authHeaders()
      });
      const invite = await inviteResponse.json();
      if (inviteResponse.ok) {
        registration = invite.registration || registration;
        messages.push(invite.email?.status === 'sent' ? 'Dashboard invite sent.' : 'Dashboard invite prepared.');
      } else {
        messages.push(`Dashboard invite skipped: ${invite.detail || invite.error || 'unknown error'}.`);
      }

      const stripeResponse = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/stripe-onboarding', {
        method: 'POST',
        headers: authHeaders()
      });
      const stripe = await stripeResponse.json();
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
        await saveReview(reference, null, { sendDashboardInvite: false, skipAutoVerifiedWorkflow: true });

        const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/dashboard-invite', {
          method: 'POST',
          headers: authHeaders()
        });
        const result = await response.json();
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
        await saveReview(reference, null, { sendDashboardInvite: false, skipAutoVerifiedWorkflow: true });

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
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.sidebar-nav-item, .mobile-tab-link').forEach(n => n.classList.remove('active'));
      const panel = document.getElementById('tab-' + tab);
      const nav   = document.getElementById('nav-' + tab);
      const mobileNav = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
      if (panel) panel.classList.add('active');
      if (nav)   nav.classList.add('active');
      if (mobileNav) mobileNav.classList.add('active');
      activeTab = tab;
      const titles = { overview: 'Overview', queue: 'Registration Queue', settings: 'Settings' };
      const titleEl = document.getElementById('topbarTitle');
      if (titleEl) titleEl.textContent = titles[tab] || 'Admin Console';
      // Show/hide sidebar filters (only relevant on queue tab)
      const sf = document.querySelector('.sidebar-filters');
      if (sf) sf.style.display = tab === 'queue' ? '' : 'none';
      // Sync inline filters when entering queue tab
      if (tab === 'queue') syncInlineFilters();
      document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function syncInlineFilters() {
      const sm = document.getElementById('searchInputMain');
      const fm = document.getElementById('statusFilterMain');
      const om = document.getElementById('sortOrderMain');
      if (sm) sm.value = document.getElementById('searchInput').value;
      if (fm) fm.value = document.getElementById('statusFilter').value;
      if (om) om.value = document.getElementById('sortOrder').value;
    }

    function syncFilter(type, value) {
      if (type === 'search') {
        document.getElementById('searchInput').value = value;
      } else if (type === 'status') {
        document.getElementById('statusFilter').value = value;
      } else if (type === 'sort') {
        document.getElementById('sortOrder').value = value;
      }
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

    async function bulkAction(action) {
      if (!selectedRefs.size) return;
      const refs = Array.from(selectedRefs);
      const labels = { invite: 'dashboard invites', verify: 'verified status', stripe: 'Stripe onboarding links' };
      if (!confirm(`Send ${labels[action]} to ${refs.length} parish(es)?`)) return;

      setStatus(`Running bulk action on ${refs.length} parishes...`);
      let done = 0, failed = 0;

      for (const ref of refs) {
        try {
          if (action === 'invite') {
            const r = await fetch('/api/admin/registrations/' + encodeURIComponent(ref) + '/dashboard-invite', { method: 'POST', headers: authHeaders() });
            if (!r.ok) throw new Error();
          } else if (action === 'verify') {
            const r = await fetch('/api/admin/registrations/' + encodeURIComponent(ref), {
              method: 'PATCH',
              headers: { ...authHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'verified' })
            });
            if (!r.ok) throw new Error();
          } else if (action === 'stripe') {
            const r = await fetch('/api/admin/registrations/' + encodeURIComponent(ref) + '/stripe-onboarding', { method: 'POST', headers: authHeaders() });
            if (!r.ok) throw new Error();
          }
          done++;
        } catch {
          failed++;
        }
      }

      clearSelection();
      await loadRegistrations();
      setStatus(`Bulk action complete: ${done} succeeded${failed ? ', ' + failed + ' failed' : ''}.`, failed ? 'error' : 'success');
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
