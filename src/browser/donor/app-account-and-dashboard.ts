import type {
  DonorAppCommemoration,
  DonorAppBilling,
  DonorAppPayload,
  DonorAppError,
  DonorAppOptions,
  DonorAppStatement,
} from './app-contracts.js';
import type { DonorAppBindings } from './app.js';
declare const setDonorStatus: DonorAppBindings['setDonorStatus'];
declare const donorApi: DonorAppBindings['donorApi'];
declare const setDonorProfile: DonorAppBindings['setDonorProfile'];
declare const donorSession: DonorAppBindings['donorSession'];
declare const saveDonorSession: DonorAppBindings['saveDonorSession'];
declare const clearDonorSession: DonorAppBindings['clearDonorSession'];
declare const writeDonorCache: DonorAppBindings['writeDonorCache'];
declare const shortDate: DonorAppBindings['shortDate'];
declare const setText: DonorAppBindings['setText'];
declare const setHtml: DonorAppBindings['setHtml'];
declare const donorDisplayName: DonorAppBindings['donorDisplayName'];
declare const money: DonorAppBindings['money'];
declare const escapeHtml: DonorAppBindings['escapeHtml'];
declare const renderPledgeTracker: DonorAppBindings['renderPledgeTracker'];
declare const updateQuickGiveLinks: DonorAppBindings['updateQuickGiveLinks'];
declare const renderActiveCampaigns: DonorAppBindings['renderActiveCampaigns'];
declare const renderNextFeast: DonorAppBindings['renderNextFeast'];
declare const renderActiveFunds: DonorAppBindings['renderActiveFunds'];
declare const setGivingTierTilesLoading: DonorAppBindings['setGivingTierTilesLoading'];
declare const renderHomeParishWidgetsLoading: DonorAppBindings['renderHomeParishWidgetsLoading'];
declare const redirectToMyAgapayLogin: DonorAppBindings['redirectToMyAgapayLogin'];
declare const showGuestDonorDashboard: DonorAppBindings['showGuestDonorDashboard'];
declare const isDonorUnauthorized: DonorAppBindings['isDonorUnauthorized'];
declare const clearDonorCache: DonorAppBindings['clearDonorCache'];
declare const loadPublicParishes: DonorAppBindings['loadPublicParishes'];

async function signupFromPage(event: Event) {
  event.preventDefault();
  const donorName = (document.getElementById('donorName') as HTMLInputElement | null)?.value.trim();
  const email = (document.getElementById('donorEmail') as HTMLInputElement | null)?.value.trim();
  const password = (document.getElementById('donorPassword') as HTMLInputElement | null)?.value;
  const parishId =
    (document.getElementById('parish') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '';
  const termsAccepted = (document.getElementById('agreeTerms') as HTMLInputElement | null)?.checked === true;
  if (!donorName || !email || !password) {
    setDonorStatus('Enter your name, email, and password.', 'error');
    return;
  }
  if (!termsAccepted) {
    setDonorStatus('Agree to the Terms of Service before creating your account.', 'error');
    return;
  }
  setDonorStatus('Creating your donor account...');
  try {
    const data = await donorApi('/api/donor/signup', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donorName,
        householdName: donorName,
        next: new URLSearchParams(window.location.search).get('next') || '',
        email,
        password,
        parishId,
        addressLine1: (document.getElementById('addressLine1') as HTMLInputElement | null)?.value.trim() || '',
        addressLine2: (document.getElementById('addressLine2') as HTMLInputElement | null)?.value.trim() || '',
        city: (document.getElementById('city') as HTMLInputElement | null)?.value.trim() || '',
        state:
          (
            document.getElementById('state') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value.trim() || '',
        postalCode: (document.getElementById('postalCode') as HTMLInputElement | null)?.value.trim() || '',
        country: (document.getElementById('country') as HTMLInputElement | null)?.value.trim() || 'US',
        termsAccepted,
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {}),
      }),
    });
    window.AGAPAYDonorSession.saveSession({ donor: data.donor }, email);
    setDonorProfile(data.donor);
    if (data.verificationUrl) {
      setDonorStatus(
        'Account created. Email is not configured, so a test verification link is shown below.',
        'success'
      );
      const box = document.getElementById('verificationLinkBox');
      const link = document.getElementById('verificationLink') as HTMLAnchorElement | null;
      if (box && link) {
        link.href = data.verificationUrl;
        link.textContent = 'Open test verification link';
        box.style.display = 'block';
      }
      return;
    }
    setDonorStatus('Account created. Check your email to verify your AGAPAY account.', 'success');
    const next = document.getElementById('signupNextStep');
    if (next) next.style.display = 'block';
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

async function verifyDonorEmail() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') || donorSession().email;
  const token = params.get('token') || '';
  if (!email || !token) {
    setDonorStatus(
      'This verification link is missing information. Please sign up again to request a new link.',
      'error'
    );
    return;
  }
  setDonorStatus('Verifying your email...');
  try {
    const data = await donorApi('/api/donor/verify', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    });
    if (!data.token) {
      setDonorStatus('Email already verified. Please log in to open My AGAPAY.', 'success');
      setTimeout(() => {
        window.location.href = '/myagapay/login';
      }, 900);
      return;
    }
    saveDonorSession(data);
    setDonorStatus('Email verified. Opening My AGAPAY...', 'success');
    setTimeout(() => {
      window.location.href = '/myagapay';
    }, 900);
  } catch (err) {
    clearDonorSession();
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

function cacheDonorDashboardPayload(data: DonorAppPayload | null | undefined) {
  if (!data) return;
  writeDonorCache('dashboard', data);
  if (data.recentOfferings) {
    writeDonorCache('offerings', {
      offerings: data.recentOfferings,
      summary: data.summary || {},
    });
  }
  if (data.recentCommemorations) {
    writeDonorCache('commemorations', { entries: data.recentCommemorations });
  }
}

function learnTermSummary(dashboard: DonorAppPayload | null | undefined) {
  const term = dashboard?.termProgress || {};
  const percent = Number(term.percent || 0);
  const currentWeek = Number(term.currentWeek || 0);
  const totalWeeks = Number(term.totalWeeks || 0);
  if (currentWeek > 0 && totalWeeks > 0) {
    return `${Math.max(0, Math.min(100, Math.round(percent)))}% complete`;
  }
  return 'Set up term';
}

function learnPlannerSummary(dashboard: DonorAppPayload | null | undefined) {
  const term = dashboard?.termProgress || {};
  if (Number(term.currentWeek || 0) > 0 && Number(term.totalWeeks || 0) > 0) {
    return term.label || 'Current term active';
  }
  return 'Ready';
}

function renderLearnTierStatus(billing: DonorAppBilling | null | undefined) {
  const familyAccess = Boolean(billing?.fullAccess || billing?.plan === 'family');
  const tier = document.getElementById('myAgapayLearnTier');
  if (!tier) return;
  tier.classList.toggle('status-good', familyAccess);
  if (familyAccess) {
    tier.textContent = 'Ready';
    return;
  }
  tier.innerHTML = `<span class="learn-tier-limited">Limited Free</span><button type="button" class="learn-upgrade-mini" data-myagapay-learn-upgrade>Upgrade now</button>`;
}

function renderLearnSubscriptionSettings(payload: DonorAppPayload = {}) {
  const billing = payload.billing || {};
  const fullAccess = Boolean(payload.fullAccess || payload.plan === 'family');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the existing input read during the runtime migration.
  const status = String(billing.status || (fullAccess ? 'active' : 'free')).toLowerCase();
  const cancelPending = Boolean(billing.cancelAtPeriodEnd || billing.cancelledAt);
  const currentPeriodEnd = billing.currentPeriodEnd ? shortDate(billing.currentPeriodEnd) : '';

  const statusPill = document.getElementById('learnBillingStatusPill');
  if (statusPill) {
    statusPill.textContent = cancelPending ? 'Cancelling' : fullAccess ? 'Family Plan' : 'Limited Free';
    statusPill.classList.toggle('pending', cancelPending);
  }
  setText('learnBillingPlan', fullAccess ? 'AGAPAY Learn Family access is active.' : 'Limited Free access is active.');
  setText(
    'learnBillingRenewal',
    cancelPending
      ? `Cancels at period end${currentPeriodEnd ? ` (${currentPeriodEnd})` : ''}.`
      : fullAccess && currentPeriodEnd
        ? `Renews through Stripe on ${currentPeriodEnd}.`
        : fullAccess
          ? 'Full access is enabled for this account.'
          : 'Upgrade to unlock unlimited children, printing, and full reports.'
  );
  setText(
    'learnBillingHelp',
    cancelPending
      ? 'Your Learn subscription has been scheduled for cancellation. You can keep using Learn until Stripe completes the billing-period change.'
      : fullAccess
        ? 'Canceling stops future renewal through Stripe. Your current My AGAPAY login remains active.'
        : 'The free plan supports up to two children and limited printing.'
  );

  const cancelButton = document.getElementById('learnCancelSubscriptionButton') as HTMLButtonElement | null;
  if (cancelButton) {
    cancelButton.hidden = !billing.stripeSubscriptionId || !fullAccess || cancelPending;
  }
  const upgradeLink = document.getElementById('learnBillingUpgradeLink') as HTMLAnchorElement | null;
  if (upgradeLink) {
    upgradeLink.hidden = fullAccess && !cancelPending;
  }
}

async function loadLearnSubscriptionSettings() {
  if (!document.getElementById('learnSubscriptionCard')) return;
  try {
    const data = await donorApi('/api/learn/billing/status');
    renderLearnSubscriptionSettings(data);
  } catch (err) {
    setText('learnBillingStatusPill', 'Unavailable');
    setText('learnBillingPlan', 'AGAPAY Learn billing could not be loaded.');
    setText('learnBillingRenewal', (err as DonorAppError).message || 'Please try again later.');
    const cancelButton = document.getElementById('learnCancelSubscriptionButton') as HTMLButtonElement | null;
    if (cancelButton) cancelButton.hidden = true;
  }
}

async function cancelLearnSubscription(button: HTMLButtonElement | null) {
  if (!confirm('Cancel your AGAPAY Learn subscription at the end of the current billing period?')) return;
  const original = button?.textContent || 'Cancel Learn subscription';
  if (button) {
    button.disabled = true;
    button.textContent = 'Cancelling...';
  }
  try {
    const data = await donorApi('/api/learn/billing/cancel', { method: 'POST' });
    renderLearnSubscriptionSettings({ fullAccess: true, plan: 'family', billing: data.billing });
    setDonorStatus(data.message || 'AGAPAY Learn subscription cancellation scheduled.', 'success');
  } catch (err) {
    setDonorStatus((err as DonorAppError).message || 'Unable to cancel AGAPAY Learn subscription.', 'error');
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

async function renderMyAgapayLearnCard() {
  const session = donorSession();
  if (!session.email || !session.token) return;
  setText('myAgapayLearnPlanner', 'Loading...');
  setText('myAgapayLearnTerm', 'Loading...');
  setHtml('myAgapayLearnTier', 'Checking...');

  const [dashboardResult, billingResult] = await Promise.allSettled([
    donorApi('/api/learn/dashboard'),
    donorApi('/api/learn/billing/status'),
  ]);

  if (dashboardResult.status === 'fulfilled') {
    const dashboard = dashboardResult.value?.dashboard || {};
    setText('myAgapayLearnPlanner', learnPlannerSummary(dashboard));
    setText('myAgapayLearnTerm', learnTermSummary(dashboard));
  } else {
    setText('myAgapayLearnPlanner', 'Ready');
    setText('myAgapayLearnTerm', 'Set up term');
  }

  if (billingResult.status === 'fulfilled') {
    renderLearnTierStatus(billingResult.value);
  } else {
    renderLearnTierStatus({ plan: 'free', fullAccess: false });
  }
}

async function openMyAgapayLearnCheckout(button: HTMLButtonElement | null) {
  const original = button?.textContent || 'Upgrade now';
  if (button) {
    button.disabled = true;
    button.textContent = 'Opening...';
  }
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true) {
      window.open('https://agapay.app/learn/pricing?source=myagapay-app', '_blank', 'noopener,noreferrer');
      return;
    }
    const data = await donorApi('/api/learn/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'family' }),
    });
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    throw new Error('Stripe checkout did not return a checkout link.');
  } catch (err) {
    setDonorStatus((err as DonorAppError).message || 'Unable to open Learn checkout.', 'error');
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function renderMyAgapayDashboard(data: DonorAppPayload | null | undefined) {
  const donor = data?.donor || {};
  const summary = data?.summary || {};
  const parish = data?.parish || null;
  const recentOfferings = Array.isArray(data?.recentOfferings) ? data.recentOfferings : [];
  const monthCents = summary.parishNetMonthCents ?? summary.monthCents;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the existing input read during the runtime migration.
  const ytdCents = summary.parishNetYtdCents ?? summary.ytdCents;
  const latestOffering = recentOfferings[0] || null;

  setText('myAgapayGreetingName', donorDisplayName(donor));
  setText('myAgapayDefaultParish', parish?.name || 'Choose a church in Settings');
  renderMyAgapayLearnCard();
  setText('myAgapayGivingParish', parish?.name || 'Choose church');
  setText('myAgapayRecurringCount', `${summary.recurringCount || 0} Active`);
  setText('myAgapayRecentAmount', latestOffering ? money(latestOffering.amountCents) : 'No gifts yet');
  setText('myAgapayGivingMonth', money(monthCents));
  setText('myAgapaySnapshotMonth', money(monthCents));
  setText('myAgapaySnapshotRecurring', String(summary.recurringCount || 0));
  setText('myAgapaySnapshotCommemorations', String(summary.commemorationCount || 0));

  const activity = document.getElementById('myAgapayActivity');
  if (!activity) return;

  const offeringActivities = recentOfferings.slice(0, 4).map((offering) => ({
    glyph: 'G',
    title: `Donation to ${offering.parishName || parish?.name || 'your parish'}`,
    meta: `${offering.giftType || 'Offering'} - ${shortDate(offering.createdAt)}`,
    value: money(offering.amountCents),
    href: '/myagapay/giving/history',
  }));

  const fallbackActivities = [
    {
      glyph: 'L',
      title: 'AGAPAY Learn is ready',
      meta: 'Open your Orthodox homeschool dashboard',
      value: 'View',
      href: '/myagapay/learn',
    },
    {
      glyph: 'C',
      title: `${summary.commemorationCount || 0} commemorations recorded`,
      meta: 'Names submitted through AGAPAY',
      value: 'View',
      href: '/myagapay/giving/commemorations',
    },
  ];

  const activities = offeringActivities.length
    ? offeringActivities.concat(fallbackActivities).slice(0, 5)
    : fallbackActivities;

  activity.innerHTML = activities
    .map(
      (item) => `
    <div class="my-agapay-activity-item">
      <span class="activity-dot">${escapeHtml(item.glyph)}</span>
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>
      <a class="activity-amount" href="${escapeHtml(item.href)}">${escapeHtml(item.value)}</a>
    </div>
  `
    )
    .join('');
}

function renderDonorDashboardPayload(
  data: DonorAppPayload | null | undefined,
  { renderPledge = true, syncGivingTier = true }: DonorAppOptions = {}
) {
  if (!data) return;
  setDonorProfile(data.donor);
  const summary = data.summary || {};
  const parish = data.parish || null;
  const recentOfferings = data.recentOfferings || [];
  renderMyAgapayDashboard(data);

  setText('metricMonth', money(summary.parishNetMonthCents ?? summary.monthCents));
  setText('metricYtd', money(summary.parishNetYtdCents ?? summary.ytdCents));
  setText('metricOfferings', String(summary.offeringCount || 0));
  setText('metricCommemorations', String(summary.commemorationCount || 0));
  setText('metricRecurring', String(summary.recurringCount || 0));
  setText('donorParishName', parish?.name || 'Choose a church in Settings');
  setText('desktopMetricMonth', money(summary.parishNetMonthCents ?? summary.monthCents));
  setText('desktopMetricYtd', money(summary.parishNetYtdCents ?? summary.ytdCents));
  setText('desktopMetricOfferings', String(summary.offeringCount || 0));
  setText('desktopMetricCommemorations', String(summary.commemorationCount || 0));
  setText('desktopParishName', parish?.name || 'Choose a church in Settings to personalize your dashboard.');
  renderRecurringHomeCard(summary);

  if (renderPledge) renderPledgeTracker(data.donor, summary, parish);
  updateQuickGiveLinks(parish, { syncGivingTier });
  renderActiveCampaigns(parish, { confirmed: true });
  renderNextFeast(parish, { confirmed: true });
  renderActiveFunds(parish, { confirmed: true });

  const recent = document.getElementById('recentOfferings');
  if (recent) recent.innerHTML = offeringRows(recentOfferings);
  const desktopRecent = document.getElementById('desktopRecentOfferings');
  if (desktopRecent) desktopRecent.innerHTML = offeringRows(recentOfferings);
}

function renderRecurringHomeCard(summary: Record<string, number> = {}) {
  const hasRecurring = Number(summary.recurringCount || 0) > 0;
  ['desktop', 'mobile', 'history'].forEach((layout) => {
    const button = document.getElementById(`${layout}RecurringHomeAction`);
    const copy = document.getElementById(`${layout}RecurringHomeCopy`);
    if (!button || !copy) return;
    if (hasRecurring) {
      (button as HTMLButtonElement).type = 'button';
      button.innerHTML = `${layout === 'mobile' ? 'Manage' : 'Manage recurring giving'} <span aria-hidden="true">→</span>`;
      button.onclick = () => openDonorRecurringPortal('', button as HTMLButtonElement);
      copy.textContent =
        layout === 'mobile'
          ? 'Update a recurring offering or payment method securely.'
          : 'Review recurring offerings, update payment details, or make changes securely through Stripe.';
    } else {
      (button as HTMLButtonElement).type = 'button';
      button.innerHTML = `Start recurring giving <span aria-hidden="true">→</span>`;
      button.onclick = () => {
        window.location.href = '/myagapay/giving/give?frequency=monthly';
      };
      copy.textContent = 'Set up a dependable monthly offering to support your parish.';
    }
  });
}

async function requestDonorAccountDeletion(event: Event) {
  event.preventDefault();
  const button = document.getElementById('deleteAccountButton') as HTMLButtonElement | null;
  const status = document.getElementById('deleteAccountStatus');
  const confirmation = (document.getElementById('deletionConfirmation') as HTMLInputElement | null)?.value || '';
  const currentPassword = (document.getElementById('deletionCurrentPassword') as HTMLInputElement | null)?.value || '';
  if (confirmation !== 'DELETE') {
    if (status) status.textContent = 'Type DELETE exactly to continue.';
    return;
  }
  if (!confirm('Request permanent deletion of your My AGAPAY account and associated personal data?')) return;
  if (button) {
    button.disabled = true;
    button.textContent = 'Submitting request…';
  }
  try {
    const data = await donorApi('/api/donor/account-deletion', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, confirmation, source: 'myagapay-account-settings' }),
    });
    if (status) status.textContent = data.message || 'Your account deletion request was received.';
    clearDonorSession();
    window.setTimeout(() => {
      window.location.href = '/account-deletion?requested=1';
    }, 900);
  } catch (err) {
    if (status) status.textContent = (err as DonorAppError).message || 'Unable to submit the deletion request.';
    if (button) {
      button.disabled = false;
      button.textContent = 'Request account deletion';
    }
  }
}

function primeDonorDashboardParishUi() {
  if (!document.body.classList.contains('showing-giving-dashboard')) return;
  // Do not paint personalized dashboard cache on navigation. Even a recent,
  // correctly keyed cache can become wrong immediately after a parish,
  // pledge, campaign, fund, or publication change. The page-level hydration
  // shield keeps this honest loading state visible until the live snapshot is
  // rendered atomically.
  setGivingTierTilesLoading();
  renderHomeParishWidgetsLoading();
}

async function loadDonorDashboardPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    if (redirectToMyAgapayLogin('signin-required')) return;
    showGuestDonorDashboard();
    return;
  }
  try {
    const data = await donorApi('/api/donor/dashboard');
    cacheDonorDashboardPayload(data);
    renderDonorDashboardPayload(data);
    setDonorStatus('');
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      if (redirectToMyAgapayLogin('session-expired')) return;
      clearDonorSession();
      showGuestDonorDashboard();
      return;
    }
    clearDonorCache('dashboard');
    ['pledgeTrackerCard', 'desktopPledgeTracker'].forEach((id) => {
      const card = document.getElementById(id);
      if (card) card.hidden = true;
    });
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

async function loadDonorSettingsPage() {
  await loadPublicParishes('defaultParishId');
  const session = donorSession();
  if (!session.email || !session.token) {
    setDonorStatus('Log in to update My AGAPAY account settings.', 'error');
    return;
  }
  try {
    const data = await donorApi('/api/donor/dashboard?view=context');
    setDonorProfile(data.donor);
    const donor = data.donor || {};
    const setValue = (id: string, value: string | number | undefined) => {
      const el = document.getElementById(id);
      if (el) (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = (value || '') as string;
    };
    setValue('settingsName', donor!.donorName || donor!.householdName);
    setValue('settingsEmail', donor!.email);
    setValue('settingsPhone', donor.contactPhone);
    setValue('defaultParishId', donor!.defaultParishId);
    const pledgeEl = document.getElementById('pledgeAmount') as HTMLInputElement | null;
    if (pledgeEl) pledgeEl.value = donor.pledgeAmountCents ? (donor.pledgeAmountCents / 100).toFixed(2) : '';
    const pledgeCadence = donor.pledgeCadence === 'monthly' ? 'monthly' : 'annual';
    const pledgeCadenceEl = document.querySelector<HTMLElement>(
      `input[name="pledgeCadence"][value="${pledgeCadence}"]`
    );
    if (pledgeCadenceEl) (pledgeCadenceEl as HTMLInputElement).checked = true;
    updatePledgeCadenceHelp();
    setValue('settingsAddressLine1', donor.addressLine1);
    setValue('settingsAddressLine2', donor.addressLine2);
    setValue('settingsCity', donor.city);
    setValue('settingsState', donor.state);
    setValue('settingsPostalCode', donor.postalCode);
    setValue('settingsCountry', donor.country || 'US');
    const parishName = document.getElementById('settingsParishName');
    if (parishName) parishName.textContent = data.parish?.name || 'Choose a parish below';
    const directorySettingsCard = document.getElementById('directorySettingsCard');
    if (directorySettingsCard) directorySettingsCard.hidden = data.parish?.directoryEnabled !== true;
    await loadLearnSubscriptionSettings();
    await loadGivingStatements();
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
    await loadLearnSubscriptionSettings();
    await loadGivingStatements();
  }
}

async function loadGivingStatements() {
  const wrap = document.getElementById('givingStatementsList');
  if (!wrap) return;
  try {
    const data = await donorApi('/api/donor/giving-statements');
    const statements = data.statements || [];
    if (!statements.length) {
      wrap.innerHTML =
        '<p class="form-help">No giving statements yet. A parish will generate one after they run their annual statement batch.</p>';
      return;
    }
    const byYear = new Map<string | number | undefined, DonorAppStatement[]>();
    for (const s of statements) {
      if (!byYear.has(s.fiscalYear)) byYear.set(s.fiscalYear, []);
      byYear.get(s.fiscalYear)!.push(s);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => (b as number) - (a as number));
    wrap.innerHTML = years
      .map(
        (year) => `
      <div class="section-divider"><span>${year}</span></div>
      <div class="giving-statement-rows">
        ${byYear
          .get(year)!
          .map(
            (s) => `
          <div class="giving-statement-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--hairline, #e5e5e5);">
            <div>
              <div style="font-weight:600;">${escapeHtml(s.parishName)}</div>
              <div class="form-help" style="margin:0;">${(s.totalCents! / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} · ${s.giftCount} gift${s.giftCount === 1 ? '' : 's'}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="downloadGivingStatement('${s.id}', ${s.fiscalYear})">Download PDF</button>
          </div>`
          )
          .join('')}
      </div>`
      )
      .join('');
  } catch (err) {
    wrap.innerHTML = `<p class="form-help">${escapeHtml((err as DonorAppError).message)}</p>`;
  }
}

async function downloadGivingStatement(id: string, fiscalYear: string) {
  try {
    const session = donorSession();
    const res = await fetch(`/api/donor/giving-statements/${encodeURIComponent(id)}/download`, {
      headers: { Authorization: `Bearer ${session.token}`, 'X-AGAPAY-Donor-Email': session.email },
    });
    if (!res.ok) throw new Error('Unable to download that statement.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fiscalYear}-giving-statement.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

async function saveDonorSettings(event: Event) {
  event.preventDefault();
  const body = {
    donorName: (document.getElementById('settingsName') as HTMLInputElement | null)?.value.trim(),
    householdName: (document.getElementById('settingsName') as HTMLInputElement | null)?.value.trim(),
    email: (document.getElementById('settingsEmail') as HTMLInputElement | null)?.value.trim(),
    contactPhone: (document.getElementById('settingsPhone') as HTMLInputElement | null)?.value.trim(),
    defaultParishId: (document.getElementById('defaultParishId') as HTMLSelectElement | null)?.value,
    pledgeAmountCents: Math.round(
      (parseFloat((document.getElementById('pledgeAmount') as HTMLInputElement | null)?.value || '0') || 0) * 100
    ),
    pledgeCadence:
      document.querySelector<HTMLInputElement>('input[name="pledgeCadence"]:checked')?.value === 'monthly'
        ? 'monthly'
        : 'annual',
    pledgeYear: String(new Date().getFullYear()),
    addressLine1: (document.getElementById('settingsAddressLine1') as HTMLInputElement | null)?.value.trim() || '',
    addressLine2: (document.getElementById('settingsAddressLine2') as HTMLInputElement | null)?.value.trim() || '',
    city: (document.getElementById('settingsCity') as HTMLInputElement | null)?.value.trim() || '',
    state: (document.getElementById('settingsState') as HTMLInputElement | null)?.value.trim() || '',
    postalCode: (document.getElementById('settingsPostalCode') as HTMLInputElement | null)?.value.trim() || '',
    country: (document.getElementById('settingsCountry') as HTMLInputElement | null)?.value.trim() || 'US',
    currentPassword: (document.getElementById('currentPassword') as HTMLInputElement | null)?.value,
    newPassword: (document.getElementById('newPassword') as HTMLInputElement | null)?.value,
  };
  if (!body.donorName || !body.email) {
    setDonorStatus('Name and email are required.', 'error');
    return;
  }
  if (body.newPassword && body.newPassword.length < 8) {
    setDonorStatus('New password must be at least 8 characters.', 'error');
    return;
  }
  try {
    setDonorStatus('Saving My AGAPAY account settings...');
    const data = await donorApi('/api/donor/dashboard', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setDonorProfile(data.donor);
    (document.getElementById('currentPassword') as HTMLInputElement | null)!.value = '';
    (document.getElementById('newPassword') as HTMLInputElement | null)!.value = '';
    setDonorStatus('Donor settings saved.', 'success');
    await loadDonorSettingsPage();
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

function updatePledgeCadenceHelp() {
  const cadence =
    document.querySelector<HTMLInputElement>('input[name="pledgeCadence"]:checked')?.value === 'monthly'
      ? 'monthly'
      : 'annual';
  setText('pledgeAmountLabel', cadence === 'monthly' ? 'Monthly pledge amount' : 'Annual pledge amount');
  setText(
    'pledgeCadenceHelp',
    cadence === 'monthly'
      ? "Your monthly stewardship pledge in dollars. Your dashboard compares it with this month's stewardship giving."
      : "Your annual stewardship pledge in dollars. Your dashboard compares it with this year's stewardship giving."
  );
}

function commemorationWeekStart(date: Date = new Date()) {
  const end = new Date(date);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return start;
}

function isCurrentWeekCommemoration(
  item: DonorAppCommemoration,
  weekStart: Date = commemorationWeekStart(),
  now: Date = new Date()
) {
  const created = new Date(item?.createdAt || item?.updatedAt || 0);
  return !Number.isNaN(created.getTime()) && created >= weekStart && created <= now;
}

function commemorationEntriesForDisplay(entries: DonorAppCommemoration[]) {
  const now = new Date();
  const weekStart = commemorationWeekStart(now);
  const year = now.getFullYear();
  const sorted = [...entries].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    thisWeek: sorted.filter((item) => isCurrentWeekCommemoration(item, weekStart, now)),
    thisYear: sorted.filter(
      (item) =>
        !isCurrentWeekCommemoration(item, weekStart, now) && new Date(item.createdAt || 0).getFullYear() === year
    ),
    older: sorted.filter(
      (item) =>
        !isCurrentWeekCommemoration(item, weekStart, now) && new Date(item.createdAt || 0).getFullYear() !== year
    ),
  };
}
export type DonorAppPart3 = {
  signupFromPage: typeof signupFromPage;
  verifyDonorEmail: typeof verifyDonorEmail;
  cacheDonorDashboardPayload: typeof cacheDonorDashboardPayload;
  learnTermSummary: typeof learnTermSummary;
  learnPlannerSummary: typeof learnPlannerSummary;
  renderLearnTierStatus: typeof renderLearnTierStatus;
  renderLearnSubscriptionSettings: typeof renderLearnSubscriptionSettings;
  loadLearnSubscriptionSettings: typeof loadLearnSubscriptionSettings;
  cancelLearnSubscription: typeof cancelLearnSubscription;
  renderMyAgapayLearnCard: typeof renderMyAgapayLearnCard;
  openMyAgapayLearnCheckout: typeof openMyAgapayLearnCheckout;
  renderMyAgapayDashboard: typeof renderMyAgapayDashboard;
  renderDonorDashboardPayload: typeof renderDonorDashboardPayload;
  renderRecurringHomeCard: typeof renderRecurringHomeCard;
  requestDonorAccountDeletion: typeof requestDonorAccountDeletion;
  primeDonorDashboardParishUi: typeof primeDonorDashboardParishUi;
  loadDonorDashboardPage: typeof loadDonorDashboardPage;
  loadDonorSettingsPage: typeof loadDonorSettingsPage;
  loadGivingStatements: typeof loadGivingStatements;
  downloadGivingStatement: typeof downloadGivingStatement;
  saveDonorSettings: typeof saveDonorSettings;
  updatePledgeCadenceHelp: typeof updatePledgeCadenceHelp;
  commemorationWeekStart: typeof commemorationWeekStart;
  isCurrentWeekCommemoration: typeof isCurrentWeekCommemoration;
  commemorationEntriesForDisplay: typeof commemorationEntriesForDisplay;
};
