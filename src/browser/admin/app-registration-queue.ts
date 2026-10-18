import type {
  AdminAppRegistration,
  AdminAppPayload,
  AdminAppOptions,
  AdminAppAuditEvent,
  AdminAppError,
} from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare let registrationAutosaveTimer: AdminAppBindings['registrationAutosaveTimer'];
declare let registrationAutosaveQueued: AdminAppBindings['registrationAutosaveQueued'];
declare let selectedReference: AdminAppBindings['selectedReference'];
declare let registrationAutosaveInFlight: AdminAppBindings['registrationAutosaveInFlight'];
declare let registrationAutosavePromise: AdminAppBindings['registrationAutosavePromise'];
declare const saveReview: AdminAppBindings['saveReview'];
declare const sendDashboardInvite: AdminAppBindings['sendDashboardInvite'];
declare let registrationsCache: AdminAppBindings['registrationsCache'];
declare const token: AdminAppBindings['token'];
declare const setStatus: AdminAppBindings['setStatus'];
declare let isLoadingRegistrations: AdminAppBindings['isLoadingRegistrations'];
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const loadAdminAccountingTargets: AdminAppBindings['loadAdminAccountingTargets'];
declare const populateAdminAccountingParishes: AdminAppBindings['populateAdminAccountingParishes'];
declare const loadPlatformSummary: AdminAppBindings['loadPlatformSummary'];
declare const loadLearnAdmin: AdminAppBindings['loadLearnAdmin'];
declare const loadStewardshipCompStatus: AdminAppBindings['loadStewardshipCompStatus'];
declare const loadDeploymentDiagnostics: AdminAppBindings['loadDeploymentDiagnostics'];
declare let lastDataLoadedAt: AdminAppBindings['lastDataLoadedAt'];
declare const refreshDataAsOf: AdminAppBindings['refreshDataAsOf'];
declare const renderProductOverview: AdminAppBindings['renderProductOverview'];
declare const escapeHtml: AdminAppBindings['escapeHtml'];
declare const shortDate: AdminAppBindings['shortDate'];
declare const escapeAttr: AdminAppBindings['escapeAttr'];
declare const onboardingActionTitle: AdminAppBindings['onboardingActionTitle'];
declare const jsAttr: AdminAppBindings['jsAttr'];
declare const nextAction: AdminAppBindings['nextAction'];
declare const readable: AdminAppBindings['readable'];
declare let activeTab: AdminAppBindings['activeTab'];
declare const switchTab: AdminAppBindings['switchTab'];
declare const renderDetail: AdminAppBindings['renderDetail'];
declare const renderQueueNext: AdminAppBindings['renderQueueNext'];
declare const loadRegistrationGivingSummary: AdminAppBindings['loadRegistrationGivingSummary'];

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
  if (registrationAutosaveTimer) clearTimeout(registrationAutosaveTimer);
  registrationAutosaveTimer = null;
  registrationAutosaveQueued = false;
  selectedReference = '';

  const refEl = document.getElementById('selectedReference');
  if (refEl) {
    refEl.textContent = 'No selection';
  }

  (document.getElementById('backToQueueBtn') as HTMLButtonElement | null)?.classList.add('hidden');
  (document.getElementById('copySummaryBtn') as HTMLButtonElement | null)?.classList.add('hidden');
  document.getElementById('registrationDetail')!.innerHTML = '';
  renderFilteredList();
  document.getElementById('registrationQueue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setRegistrationAutosaveState(message: string | undefined, state = '') {
  const indicator = document.getElementById('registrationAutosaveState');
  if (!indicator) return;
  indicator.textContent = message ?? '';
  indicator.dataset.state = state;
}

function scheduleRegistrationAutosave(reference: string) {
  if (!reference || reference !== selectedReference) return;
  if (registrationAutosaveTimer) clearTimeout(registrationAutosaveTimer);
  setRegistrationAutosaveState('Unsaved changes', 'pending');
  registrationAutosaveTimer = setTimeout(() => runRegistrationAutosave(reference), 900);
}

async function runRegistrationAutosave(reference: string) {
  registrationAutosaveTimer = null;
  if (!reference || reference !== selectedReference) return;
  if (registrationAutosaveInFlight) {
    registrationAutosaveQueued = true;
    return;
  }
  registrationAutosaveInFlight = true;
  setRegistrationAutosaveState('Saving...', 'saving');
  registrationAutosavePromise = saveReview(reference, null, {
    autosave: true,
    sendDashboardInvite: false,
    includeReviewerNotes: false,
  });
  try {
    await registrationAutosavePromise;
  } finally {
    registrationAutosavePromise = null;
    registrationAutosaveInFlight = false;
    if (registrationAutosaveQueued && reference === selectedReference) {
      registrationAutosaveQueued = false;
      registrationAutosaveTimer = setTimeout(() => runRegistrationAutosave(reference), 150);
    }
  }
}

function bindRegistrationAutosave(reference: string) {
  const detail = document.getElementById('registrationDetail');
  if (!detail) return;
  const excluded = new Set(['autoDashboardInvite', 'reviewerNotes', 'parishDashboardToken']);
  detail.querySelectorAll<HTMLInputElement>('input, select, textarea').forEach((control) => {
    if (!control.id || excluded.has(control.id) || control.disabled || control.readOnly || control.type === 'file')
      return;
    const eventName =
      control.matches('select, input[type="checkbox"], input[type="radio"]') ||
      control.id === 'fundsJson' ||
      control.id === 'campaignsJson'
        ? 'change'
        : 'input';
    control.addEventListener(eventName, () => scheduleRegistrationAutosave(reference));
  });
}

function upsertRegistrationCache(registration: AdminAppRegistration) {
  if (!registration?.reference) return;
  const index = registrationsCache.findIndex((item) => item.reference === registration.reference);
  if (index >= 0) registrationsCache[index] = { ...registrationsCache[index], ...registration };
  else registrationsCache.push(registration);
}

async function loadRegistrations(options: AdminAppOptions = {}) {
  const { silent = false, preserveSelection = false } = options;
  if (!token()) {
    if (!silent) setStatus('Log in to load registrations.', 'error');
    return;
  }
  if (isLoadingRegistrations) return;
  isLoadingRegistrations = true;

  const btn = document.getElementById('loadBtn');
  if (btn) {
    btn.classList.add('loading');
    (btn as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
  }
  if (!silent) setStatus('Loading registrations...');

  try {
    const loaded = [];
    let cursor = '';
    do {
      const params = new URLSearchParams({ limit: '250' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch('/api/admin/registrations?' + params.toString(), { headers: authHeaders() });
      const result = (await response.json()) as AdminAppPayload;
      if (handleAuthFailure(response, result)) return;
      if (!response.ok) throw new Error(result.error || 'Unable to load registrations');
      loaded.push(...(result.registrations || []));
      cursor = result.cursor || '';
    } while (cursor);

    registrationsCache = loaded;
    await loadAdminAccountingTargets({ silent: true });
    populateAdminAccountingParishes();
    const hasCurrent =
      preserveSelection && selectedReference && registrationsCache.some((item) => item.reference === selectedReference);
    if (!hasCurrent) {
      collapseRegistrationDetail();
    }
    renderMetrics(registrationsCache);
    renderFilteredList();
    if (hasCurrent) {
      await loadDetail(selectedReference, { silent: true, noScroll: true });
    }
    loadPlatformSummary();
    loadTaxExemptionSummary();
    loadRecentActivity();
    loadLearnAdmin();
    loadStewardshipCompStatus();
    loadDeploymentDiagnostics();
    lastDataLoadedAt = new Date();
    refreshDataAsOf();
    if (!silent) setStatus(`Loaded ${registrationsCache.length} registration(s).`, 'success');
  } catch (err) {
    if (!silent) setStatus((err as AdminAppError).message, 'error');
  } finally {
    isLoadingRegistrations = false;
    if (btn) {
      btn.classList.remove('loading');
      (btn as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
    }
  }
}

function renderMetrics(registrations: AdminAppRegistration[]) {
  const attentionCount = registrations.filter((item) => {
    const action = nextActionPriority(item);
    return action && action.priority < 99;
  }).length;
  document.getElementById('metricTotal')!.textContent = String(registrations.length);
  document.getElementById('metricPending')!.textContent = String(
    registrations.filter((item) => ['pending', 'needs_more_info'].includes(item.status || 'pending')).length
  );
  document.getElementById('metricVerified')!.textContent = String(
    registrations.filter((item) => item.status === 'verified').length
  );
  document.getElementById('metricStripeReady')!.textContent = String(
    registrations.filter((item) => ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus as string))
      .length
  );
  const navCount = document.getElementById('navOnboardingCount');
  if (navCount) {
    navCount.textContent = String(attentionCount);
    navCount.hidden = attentionCount === 0;
  }
  renderCommunitySnapshot(registrations);
  renderNextActionQueue(registrations);
  renderOnboardingHealth(registrations);
  renderProductOverview();
  renderOverviewEmailLog(registrations);
}

function renderOverviewEmailLog(registrations: AdminAppRegistration[]) {
  const container = document.getElementById('overviewEmailLog');
  if (!container) return;

  // Collect all email events across all registrations, most recent first
  const events = [];
  for (const reg of registrations) {
    const name = reg.parishName || reg.reference || 'Unknown';
    const emailFields: { key: keyof AdminAppRegistration; label: string; to: string; time?: string }[] = [
      { key: 'adminNotificationEmailStatus', label: 'AGAPAY alert', to: 'hello@agapay.app', time: reg.receivedAt },
      {
        key: 'dashboardInviteEmailStatus',
        label: 'Dashboard invite',
        to: reg.priestEmail || reg.treasurerEmail || '',
        time: reg.dashboardInviteEmailSentAt || reg.reviewedAt,
      },
      {
        key: 'stripeOnboardingEmailStatus',
        label: 'Stripe invite',
        to: reg.treasurerEmail || reg.priestEmail || '',
        time: reg.stripeOnboardingEmailSentAt || reg.reviewedAt,
      },
    ];
    for (const f of emailFields) {
      const status = reg[f.key] as string | undefined;
      if (!status || status === 'not_configured' || status === 'not_sent' || status === 'pending') continue;
      events.push({ name, type: f.label, status, to: f.to, time: f.time || reg.updatedAt || reg.receivedAt || '' });
    }
    for (const e of reg.emailLog || []) {
      events.push({ name, type: e.type || 'Email', status: e.status || 'sent', to: e.to || '', time: e.sentAt || '' });
    }
  }

  if (!events.length) {
    container.innerHTML =
      '<div class="email-log-empty">No email activity recorded yet. Load registrations to populate this log.</div>';
    return;
  }

  // Sort by time descending, show 12 most recent
  events.sort((a, b) => (parseDateMs(b.time) || 0) - (parseDateMs(a.time) || 0));
  const recent = events.slice(0, 12);

  container.innerHTML = recent
    .map((e) => {
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
    })
    .join('');
}

async function loadRecentActivity() {
  const container = document.getElementById('recentActivityFeed');
  if (!container) return;
  container.innerHTML = '<div class="activity-feed-empty">Loading…</div>';
  try {
    const response = await fetch('/api/admin/recent-activity', { headers: authHeaders() });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Failed to load activity');
    renderRecentActivity(result.events || []);
  } catch (err) {
    container.innerHTML = `<div class="activity-feed-empty">${escapeHtml((err as AdminAppError).message)}</div>`;
  }
}

function renderRecentActivity(events: AdminAppAuditEvent[]) {
  const container = document.getElementById('recentActivityFeed');
  if (!container) return;

  if (!events.length) {
    container.innerHTML = '<div class="activity-feed-empty">No activity yet.</div>';
    return;
  }

  const iconFor = (type: string | undefined) => {
    if (type === 'donor_signup')
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    if (type === 'stewardship_activated')
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
  };

  container.innerHTML = events
    .map((e) => {
      const isDonor = e.type === 'donor_signup';
      const name = isDonor && e.name ? `<div class="activity-name">${escapeHtml(e.name)}</div>` : '';
      const email =
        isDonor && e.detail
          ? `<a class="activity-email" href="mailto:${escapeAttr(e.detail)}">${escapeHtml(e.detail)}</a>`
          : escapeHtml(e.detail || '');
      const church =
        isDonor && (e.church || e.sub)
          ? `<span class="activity-chip">${escapeHtml(e.church || e.sub)}</span>`
          : e.sub
            ? `<div class="activity-sub">${escapeHtml(e.sub)}</div>`
            : '';
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
    })
    .join('');
}

function communityTypeOf(registration: AdminAppRegistration) {
  const raw = `${registration.communityType || ''} ${registration.parishName || ''}`.toLowerCase();
  if (raw.includes('monastery') || raw.includes('skete')) return 'monastery';
  if (raw.includes('cathedral')) return 'cathedral';
  if (raw.includes('mission')) return 'mission';
  return 'church';
}

function renderCommunitySnapshot(registrations: AdminAppRegistration[]) {
  const active = registrations.filter(
    (item) => item.status === 'verified' && item.givingStatus !== 'cancelled' && item.givingStatus !== 'hidden'
  );
  const counts = active.reduce(
    (acc, item) => {
      acc[communityTypeOf(item)] += 1;
      return acc;
    },
    { mission: 0, church: 0, cathedral: 0, monastery: 0 }
  );

  document.getElementById('snapshotMissions')!.textContent = String(counts.mission);
  document.getElementById('snapshotChurches')!.textContent = String(counts.church);
  document.getElementById('snapshotCathedrals')!.textContent = String(counts.cathedral);
  document.getElementById('snapshotMonasteries')!.textContent = String(counts.monastery);
  const directoryVerified = document.getElementById('directoryVerifiedCount');
  const directoryChurch = document.getElementById('directoryChurchCount');
  const directoryMonastery = document.getElementById('directoryMonasteryCount');
  if (directoryVerified) directoryVerified.textContent = String(active.length);
  if (directoryChurch) directoryChurch.textContent = String(counts.church + counts.mission + counts.cathedral);
  if (directoryMonastery) directoryMonastery.textContent = String(counts.monastery);
}

function renderOnboardingHealth(registrations: AdminAppRegistration[]) {
  const pane = document.getElementById('onboardingHealthPane');
  if (!pane) return;

  const total = registrations.length;
  const awaitingReview = registrations.filter((item) =>
    ['pending', 'needs_more_info'].includes(item.status || 'pending')
  ).length;
  const verified = registrations.filter((item) => item.status === 'verified');
  const invitesNeeded = verified.filter((item) => item.dashboardInviteEmailStatus !== 'sent').length;
  const stripeNeeded = verified.filter(
    (item) => !['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus!)
  ).length;
  const stripeReady = verified.filter((item) =>
    ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus!)
  );
  const billingNeeded = stripeReady.filter(
    (item) => !['active', 'trialing', 'free_forever'].includes(item.subscriptionStatus!)
  ).length;
  const ready = verified.filter(
    (item) =>
      item.dashboardInviteEmailStatus === 'sent' &&
      ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus!) &&
      ['active', 'trialing', 'free_forever'].includes(item.subscriptionStatus!)
  ).length;
  const readyPercent = total ? Math.round((ready / total) * 100) : 0;

  const readyEl = document.getElementById('healthReadyPercent');
  if (readyEl) readyEl.textContent = `${readyPercent}%`;
  const ringEl = document.getElementById('healthReadyRing');
  if (ringEl) ringEl.style.strokeDasharray = `${readyPercent} 100`;
  const readinessEl = document.querySelector<HTMLElement>('.health-readiness');
  if (readinessEl) readinessEl.setAttribute('aria-label', `${readyPercent} percent ready`);

  pane.innerHTML = `
        <div class="health-item"><strong>${awaitingReview}</strong><span>Awaiting review</span><p>Canonical standing still needs a decision.</p></div>
        <div class="health-item"><strong>${invitesNeeded}</strong><span>Invites needed</span><p>Verified parishes that still need dashboard access.</p></div>
        <div class="health-item"><strong>${stripeNeeded}</strong><span>Stripe needed</span><p>Verified parishes without connected payments.</p></div>
        <div class="health-item"><strong>${billingNeeded}</strong><span>Billing needed</span><p>Stripe-ready parishes without active billing.</p></div>
      `;
}

function parseDateMs(value: unknown) {
  if (!value) return 0;
  const ms = new Date(value as string | number | Date).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function daysSince(value: unknown) {
  const ms = parseDateMs(value);
  if (!ms) return 0;
  const diff = Date.now() - ms;
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function currentWorkflowStep(reg: AdminAppRegistration) {
  const blocker = reg.onboardingWorkflow?.blockers?.[0];
  if (blocker) return { key: blocker.key, label: onboardingActionTitle(blocker.title).toLowerCase() };
  if (reg.onboardingWorkflow?.canGoLive) return { key: 'signoff', label: 'treasurer review and launch' };
  if (reg.onboardingWorkflow?.state === 'LIVE') return { key: 'complete', label: 'completed onboarding' };
  const status = reg.status || 'pending';
  const stripeDone = ['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus!);
  const subscriptionDone = ['active', 'trialing', 'free_forever'].includes(reg.subscriptionStatus!);
  if (status === 'pending') return { key: 'review', label: 'canonical review' };
  if (status === 'needs_more_info') return { key: 'follow_up', label: 'follow-up review' };
  if (status !== 'verified') return { key: 'inactive', label: 'inactive status' };
  if (reg.dashboardInviteEmailStatus !== 'sent') return { key: 'invite', label: 'dashboard invite' };
  if (!stripeDone) return { key: 'stripe', label: 'Stripe connection' };
  if (!subscriptionDone) return { key: 'subscription', label: 'subscription setup' };
  return { key: 'complete', label: 'completed onboarding' };
}

function workflowLastActivityAt(reg: AdminAppRegistration) {
  const candidates = [
    reg.subscriptionUpdatedAt,
    reg.stripeStatusUpdatedAt,
    reg.stripeAccountUpdatedAt,
    reg.stripeOnboardingEmailSentAt,
    reg.dashboardInviteEmailSentAt,
    reg.reviewedAt,
    reg.updatedAt,
    reg.receivedAt,
  ].filter(Boolean);
  if (!candidates.length) return '';
  return candidates.sort((a, b) => parseDateMs(b) - parseDateMs(a))[0] || '';
}

function nextActionPriority(reg: AdminAppRegistration) {
  const status = reg.status || 'pending';
  const stripeDone = ['charges_enabled', 'payouts_enabled'].includes(reg.stripeAccountStatus!);
  const subscriptionDone = ['active', 'trialing', 'free_forever'].includes(reg.subscriptionStatus!);
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

function renderNextActionQueue(registrations: AdminAppRegistration[]) {
  const container = document.getElementById('nextActionQueue');
  if (!container) return;

  const items = registrations
    .map((reg) => ({ reg, action: nextActionPriority(reg) }))
    .filter((item) => item.action)
    .sort((a, b) => {
      if (a.action!.priority !== b.action!.priority) return a.action!.priority - b.action!.priority;
      return String(b.reg.receivedAt || '').localeCompare(String(a.reg.receivedAt || ''));
    })
    .slice(0, 5);

  if (!items.length) {
    container.innerHTML = '<div class="next-action-empty">Nothing needs attention right now.</div>';
    return;
  }

  container.innerHTML = items
    .map(
      ({ reg, action }) => `
        <button type="button" class="next-action-item" onclick="loadDetail('${jsAttr(reg.reference)}')">
          <div class="next-action-name">${escapeHtml(reg.parishName || reg.reference)}</div>
          <div class="next-action-label">${escapeHtml(action!.label)}</div>
        </button>
      `
    )
    .join('');
}

function renderFilteredList() {
  const query = ((document.getElementById('searchInputMain') as HTMLInputElement | null)?.value || '')
    .trim()
    .toLowerCase();
  const status = (document.getElementById('statusFilterMain') as HTMLSelectElement | null)?.value || 'needs_attention';
  const sort = (document.getElementById('sortOrderMain') as HTMLSelectElement | null)?.value || 'urgency';

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
      item.stripeAccountStatus,
    ]
      .join(' ')
      .toLowerCase();
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

function renderList(registrations: AdminAppRegistration[]) {
  const list = document.getElementById('registrationList');
  const queueCount = document.getElementById('queueCount');
  if (queueCount) {
    queueCount.textContent = registrations.length
      ? `${registrations.length} shown / ${registrationsCache.length} total`
      : registrationsCache.length
        ? 'No matches'
        : 'No registrations loaded';
  }
  if (!registrations.length) {
    list!.innerHTML =
      '<div class="queue-empty">No matching registrations found. Adjust the filters or refresh the queue.</div>';
    return;
  }

  list!.innerHTML = `
        <div class="queue-list">
          ${registrations
            .map((item) => {
              const action = nextAction(item);
              const priority = nextActionPriority(item);
              const location = [item.city, item.state].filter(Boolean).join(', ') || 'Location pending';
              const community = item.communityType || 'Community';
              const jurisdiction = item.jurisdiction || 'Jurisdiction';
              const firstContact = item.priestEmail || item.treasurerEmail || 'No email on file';
              const age = daysSince(item.receivedAt);
              const stalledAge = daysSince(workflowLastActivityAt(item));
              const ageLabel = age === 0 ? 'Today' : age === 1 ? '1d ago' : `${age}d ago`;
              const urgencyClass =
                priority && priority.priority <= 2 ? 'urgent' : stalledAge >= 10 ? 'stale' : age <= 2 ? 'fresh' : '';
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
            })
            .join('')}
        </div>
      `;
}

async function copyText(value: string) {
  if (!value) {
    setStatus('Nothing to copy.');
    return;
  }
  await navigator.clipboard.writeText(value);
  setStatus('Copied to clipboard.');
}

async function loadDetail(reference: string, options: AdminAppOptions = {}) {
  const { silent = false, noScroll = false } = options;
  selectedReference = reference;

  const refEl = document.getElementById('selectedReference');
  if (refEl) {
    refEl.textContent = reference;
  }

  (document.getElementById('backToQueueBtn') as HTMLButtonElement | null)?.classList.remove('hidden');
  (document.getElementById('copySummaryBtn') as HTMLButtonElement | null)?.classList.remove('hidden');
  if (activeTab !== 'giving') switchTab('giving');
  if (!silent) setStatus('Loading details...');

  try {
    const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference), {
      headers: authHeaders(),
    });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to load registration');

    renderDetail(result.registration!);
    renderQueueNext(result.registration!);
    renderFilteredList();
    loadRegistrationGivingSummary(reference, { force: true });
    if (!noScroll) {
      document.getElementById('registrationDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    if (!silent) setStatus((err as AdminAppError).message, 'error');
  }
}
export type AdminAppPart4 = {
  emptyDetailMarkup: typeof emptyDetailMarkup;
  collapseRegistrationDetail: typeof collapseRegistrationDetail;
  setRegistrationAutosaveState: typeof setRegistrationAutosaveState;
  scheduleRegistrationAutosave: typeof scheduleRegistrationAutosave;
  runRegistrationAutosave: typeof runRegistrationAutosave;
  bindRegistrationAutosave: typeof bindRegistrationAutosave;
  upsertRegistrationCache: typeof upsertRegistrationCache;
  loadRegistrations: typeof loadRegistrations;
  renderMetrics: typeof renderMetrics;
  renderOverviewEmailLog: typeof renderOverviewEmailLog;
  loadRecentActivity: typeof loadRecentActivity;
  renderRecentActivity: typeof renderRecentActivity;
  communityTypeOf: typeof communityTypeOf;
  renderCommunitySnapshot: typeof renderCommunitySnapshot;
  renderOnboardingHealth: typeof renderOnboardingHealth;
  parseDateMs: typeof parseDateMs;
  daysSince: typeof daysSince;
  currentWorkflowStep: typeof currentWorkflowStep;
  workflowLastActivityAt: typeof workflowLastActivityAt;
  nextActionPriority: typeof nextActionPriority;
  renderNextActionQueue: typeof renderNextActionQueue;
  renderFilteredList: typeof renderFilteredList;
  renderList: typeof renderList;
  copyText: typeof copyText;
  loadDetail: typeof loadDetail;
};
