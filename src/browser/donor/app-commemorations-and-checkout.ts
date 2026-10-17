import type {
  DonorAppProfile,
  DonorAppParish,
  DonorAppCommemoration,
  DonorAppPayload,
  DonorAppError,
} from './app-contracts.js';
import type { DonorAppBindings } from './app.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
declare const truthyDonor: DonorAppBindings['truthyDonor'];

declare const donorProfile: DonorAppBindings['donorProfile'];
declare const escapeHtml: DonorAppBindings['escapeHtml'];
declare const shortDate: DonorAppBindings['shortDate'];
declare const commemorationEntriesForDisplay: DonorAppBindings['commemorationEntriesForDisplay'];
declare const money: DonorAppBindings['money'];
declare const setText: DonorAppBindings['setText'];
declare const donorSession: DonorAppBindings['donorSession'];
declare const readDonorCache: DonorAppBindings['readDonorCache'];
declare const setDonorProfile: DonorAppBindings['setDonorProfile'];
declare const fetchPublicParishes: DonorAppBindings['fetchPublicParishes'];
declare const donorApi: DonorAppBindings['donorApi'];
declare const isDonorUnauthorized: DonorAppBindings['isDonorUnauthorized'];
declare const writeDonorCache: DonorAppBindings['writeDonorCache'];
declare const clearDonorSession: DonorAppBindings['clearDonorSession'];
declare const setDonorStatus: DonorAppBindings['setDonorStatus'];
declare const normalizeDonorGiftType: DonorAppBindings['normalizeDonorGiftType'];
declare const parishHasGivingPlus: DonorAppBindings['parishHasGivingPlus'];
declare const isGivingPlusGiftType: DonorAppBindings['isGivingPlusGiftType'];
declare const openGivingPlusPaywall: DonorAppBindings['openGivingPlusPaywall'];
declare const selectedCampaign: DonorAppBindings['selectedCampaign'];
declare const campaignLabel: DonorAppBindings['campaignLabel'];
declare let _nudgeQueue: DonorAppBindings['_nudgeQueue'];
declare let _nudgeCurrent: DonorAppBindings['_nudgeCurrent'];

function commemorationRow(item: DonorAppCommemoration, tone: string = 'pending') {
  const living = (item.living || []).join(', ') || 'None';
  const departed = (item.departed || []).join(', ') || 'None';
  const parish =
    item.parishName ||
    (window.agapayPublicParishes || []).find((entry) => entry.id === item.parishId)?.name ||
    item.parishId ||
    donorProfile()?.defaultParishId ||
    'Parish';
  return `<div class="list-item"><div class="list-main"><strong>${escapeHtml(item.giftType || 'Commemoration')}</strong><span>${escapeHtml(parish)} - ${shortDate(item.createdAt)}</span><span>Living: ${escapeHtml(living)}</span><span>Departed: ${escapeHtml(departed)}</span><span class="status-pill ${tone}">${tone === 'success' ? 'submitted this week' : 'queued for Saturday'}</span></div></div>`;
}

function commemorationSection(title: string, entries: DonorAppCommemoration[], tone: string) {
  if (!entries.length) return '';
  return `<div class="section-gap"><div class="form-label" style="margin-bottom:10px;">${escapeHtml(title)}</div>${entries.map((item) => commemorationRow(item, tone)).join('')}</div>`;
}

function commemorationRows(entries: DonorAppCommemoration[]) {
  if (!entries.length) return '<div class="notice">No commemoration submissions have been recorded yet.</div>';
  const grouped = commemorationEntriesForDisplay(entries);
  return (
    [
      commemorationSection('Submitted this week', grouped.thisWeek, 'success'),
      commemorationSection('Earlier this year', grouped.thisYear, 'pending'),
      commemorationSection('Older commemorations', grouped.older, 'pending'),
    ].join('') || '<div class="notice">No commemoration submissions have been recorded yet.</div>'
  );
}

function donorDefaultParish() {
  const donor = donorProfile();
  if (!donor?.defaultParishId) return null;
  return (
    (window.agapayPublicParishes || []).find((parish) => parish.id === donor!.defaultParishId) ||
    donor.defaultParish ||
    null
  );
}

function primeCommemorationParishDisplay() {
  const donor = donorProfile();
  const parish =
    donorDefaultParish() ||
    (donor?.defaultParishId
      ? { id: donor!.defaultParishId, name: donor.defaultParishName || donor!.defaultParishId }
      : null);
  renderCommemorationParish(parish);
}

function renderCommemorationParish(parish: DonorAppParish | null | undefined) {
  const display = document.getElementById('commemorationParishDisplay');
  const hidden = document.getElementById('commemorationParishId');
  if (display) {
    display.textContent = parish
      ? [parish.name, [parish.city, parish.state].filter(truthyDonor).join(', ')].filter(truthyDonor).join(' - ')
      : 'Choose your parish in Settings before submitting commemorations.';
  }
  if (hidden) (hidden as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = parish?.id || '';
}

function commemorationNameCount(list: unknown) {
  return (Array.isArray(list) ? list : []).reduce(
    (sum: number, entry: DonorOffering) =>
      sum +
      (Array.isArray(entry.living) ? entry.living.length : 0) +
      (Array.isArray(entry.departed) ? entry.departed.length : 0),
    0
  );
}

function renderCandleList(candleOfferings: DonorOffering[]) {
  const el = document.getElementById('candleList');
  if (!el) return;
  if (!candleOfferings.length) {
    el.innerHTML =
      '<div class="notice">No candle offerings yet. Offer a candle above and its intentions join your parish prayer list.</div>';
    return;
  }
  el.innerHTML = candleOfferings
    .slice(0, 8)
    .map((offering) => {
      const names = [
        ...(Array.isArray(offering.living) ? offering.living : []),
        ...(Array.isArray(offering.departed) ? offering.departed : []),
      ];
      const when = typeof shortDate === 'function' ? shortDate(offering.createdAt || offering.date) : '';
      const parish = offering.parishName || offering.parishId || 'Parish';
      const cents = offering.amountCents || offering.giftAmountCents;
      const amount = cents && typeof money === 'function' ? money(cents) : '';
      return `<div class="commem-candle-row">
      <span class="commem-candle-flame" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3c0 0-4 3-4 8s4 5 4 5 4 0 4-5-4-8-4-8z" fill="#DABB70"/><path d="M12 16v5" stroke="#8a6a2a" stroke-width="1.6" stroke-linecap="round"/></svg></span>
      <span class="commem-candle-main"><strong>${names.length ? escapeHtml(names.join(', ')) : 'Candle offering'}</strong><small>${escapeHtml(parish)}${when ? ' &middot; ' + escapeHtml(when) : ''}</small></span>
      ${amount ? `<span class="commem-candle-amt">${amount}</span>` : ''}
    </div>`;
    })
    .join('');
}

function renderCommemorationInsights(entries: DonorAppCommemoration[], dashboard: DonorAppPayload | null | undefined) {
  if (!document.getElementById('commemMetricNames')) return;
  const offerings = Array.isArray(dashboard?.offerings) ? dashboard.offerings : [];
  const summary = dashboard?.summary || {};
  const candleOfferings = offerings.filter((o) => /candle/i.test(String(o.giftType || o.type || '')));
  const totalNames =
    Number.isFinite(summary.commemorationCount) && summary.commemorationCount > 0
      ? summary.commemorationCount
      : commemorationNameCount(entries);
  const now = new Date();
  const thisYear = now.getFullYear();
  const inThisYear = (ts: string | undefined) => {
    const d = new Date(ts as string);
    return !isNaN(Number(d)) && d.getFullYear() === thisYear;
  };
  const namesThisYear = commemorationNameCount(
    entries.filter((e) => inThisYear(e.createdAt || e.submittedAt || e.date))
  );
  const allDates = [...offerings, ...entries]
    .map((x) => new Date((x.createdAt || x.submittedAt || x.date) as string))
    .filter((d) => !isNaN(Number(d)));
  const sinceYear = allDates.length ? Math.min(...allDates.map((d) => d.getFullYear())) : thisYear;
  setText('commemMetricNames', String(totalNames));
  setText('commemMetricCandles', String(candleOfferings.length));
  setText('commemMetricYear', String(namesThisYear));
  setText('commemMetricSince', String(sinceYear));
  renderCandleList(candleOfferings);
}

function renderCommemorationsPayload(payload: DonorAppPayload = {}, fallbackDashboard: DonorAppPayload | null = null) {
  const entries =
    Array.isArray(payload.entries) && payload.entries.length
      ? payload.entries
      : fallbackDashboard?.recentCommemorations || [];
  const list = document.getElementById('commemorationList');
  if (list) {
    list.innerHTML = entries.length
      ? commemorationRows(entries)
      : '<div class="notice">No commemoration submissions have been recorded yet.</div>';
  }
  renderCommemorationInsights(entries, fallbackDashboard);
  return { entries };
}

async function loadDonorCommemorationsPage() {
  const session = donorSession();
  toggleCommemorationGiftFields();
  primeCommemorationParishDisplay();
  const list = document.getElementById('commemorationList');
  if (!session.email || !session.token) {
    if (list) list.innerHTML = '<div class="notice">Sign in to view your commemoration history.</div>';
    return;
  }

  const cachedParishes = readDonorCache('parishes');
  if (Array.isArray(cachedParishes?.parishes)) {
    window.agapayPublicParishes = cachedParishes.parishes;
    primeCommemorationParishDisplay();
  }
  const cachedDashboard = readDonorCache('dashboard');
  const cachedCommemorations = readDonorCache('commemorations');
  if (cachedDashboard?.donor) setDonorProfile(cachedDashboard.donor);
  if (cachedDashboard?.parish) renderCommemorationParish(cachedDashboard.parish);
  if (cachedCommemorations || cachedDashboard) renderCommemorationsPayload(cachedCommemorations || {}, cachedDashboard);

  try {
    const [parishesResult, dashboardResult, commemorationsResult] = await Promise.allSettled([
      fetchPublicParishes(),
      donorApi('/api/donor/dashboard'),
      donorApi('/api/donor/commemorations'),
    ]);

    if (dashboardResult.status === 'rejected' && isDonorUnauthorized(dashboardResult.reason))
      throw dashboardResult.reason;
    if (commemorationsResult.status === 'rejected' && isDonorUnauthorized(commemorationsResult.reason))
      throw commemorationsResult.reason;

    if (parishesResult.status === 'fulfilled') {
      window.agapayPublicParishes = parishesResult.value || [];
      writeDonorCache('parishes', { parishes: window.agapayPublicParishes });
      primeCommemorationParishDisplay();
    }

    const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value : cachedDashboard;
    if (dashboard?.donor) setDonorProfile(dashboard.donor);
    renderCommemorationParish(dashboard?.parish || donorDefaultParish());
    if (dashboardResult.status === 'fulfilled') writeDonorCache('dashboard', dashboard);

    const commemorations =
      commemorationsResult.status === 'fulfilled' ? commemorationsResult.value : cachedCommemorations;
    if (!commemorations && !dashboard)
      throw (
        (commemorationsResult as PromiseRejectedResult).reason ||
        (dashboardResult as PromiseRejectedResult).reason ||
        new Error('Unable to load commemorations')
      );
    const rendered = renderCommemorationsPayload(commemorations || {}, dashboard);
    writeDonorCache('commemorations', rendered);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      return;
    }
    renderCommemorationParish(donorDefaultParish());
    if (list)
      list.innerHTML = `<div class="notice">${escapeHtml((err as DonorAppError).message)} Sign in from the donor home page first.</div>`;
  }
}

function linesFromField(id: string) {
  return ((document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '')
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(truthyDonor);
}

function toggleCommemorationGiftFields() {
  const includeGift = (document.getElementById('commemorationIncludeGift') as HTMLInputElement)?.checked === true;
  ['commemorationAmountField', 'commemorationCoverFeesField', 'commemorationPaymentField'].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.hidden = !includeGift;
  });
  const submit = document.getElementById('commemorationSubmitButton');
  if (submit) submit.textContent = includeGift ? 'Continue to checkout' : 'Submit commemoration';
}

function selectedDonorPaymentMethod(frequency: string = 'once') {
  return 'card';
}

async function submitCommemoration(event: Event) {
  event.preventDefault();
  const living = linesFromField('commemorationLivingNames');
  const departed = linesFromField('commemorationDepartedNames');
  const parishId =
    (document.getElementById('commemorationParishId') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
      ?.value ||
    donorProfile()?.defaultParishId ||
    '';
  const amount = (document.getElementById('amount') as HTMLInputElement | null)?.value || '5';
  const commemorationKind =
    document.querySelector<HTMLInputElement>('input[name="commemorationServiceKind"]:checked')?.value ||
    'proskomedia_liturgy';
  if (!living.length && !departed.length) {
    setDonorStatus('Add at least one living or departed name.', 'error');
    return;
  }
  if (!parishId) {
    setDonorStatus('Choose your parish in Settings before submitting commemorations.', 'error');
    return;
  }
  try {
    const session = donorSession();
    const donor = donorProfile();
    if (!session.email || !session.token) {
      setDonorStatus('Sign in from the donor home page before submitting commemorations.', 'error');
      return;
    }
    const name = donor!.donorName || donor!.householdName || session.email.split('@')[0];
    const [firstName, ...rest] = name.split(/\s+/);
    const includeGift = (document.getElementById('commemorationIncludeGift') as HTMLInputElement)?.checked === true;
    const rawNote = (document.getElementById('commemorationIntentionNote') as HTMLInputElement | null)?.value || '';
    const liturgyDate =
      (
        document.getElementById('commemorationLiturgyDate') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value || '';
    const note = [liturgyDate ? `Requested Liturgy date: ${liturgyDate}` : '', rawNote].filter(truthyDonor).join('\n');
    if (!includeGift) {
      setDonorStatus('Submitting commemoration...');
      const data = await donorApi('/api/donor/commemorations', {
        method: 'POST',
        body: JSON.stringify({
          parishId,
          namesLiving: living.join('\n'),
          namesDeparted: departed.join('\n'),
          commemorationKind,
          note,
        }),
      });
      renderCommemorationsPayload(data);
      (document.getElementById('commemorationLivingNames') as HTMLTextAreaElement | null)!.value = '';
      (document.getElementById('commemorationDepartedNames') as HTMLTextAreaElement | null)!.value = '';
      const liturgyDateInput = document.getElementById('commemorationLiturgyDate');
      if (liturgyDateInput) (liturgyDateInput as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = '';
      (document.getElementById('commemorationIntentionNote') as HTMLInputElement | null)!.value = '';
      setDonorStatus('Commemoration submitted. Thank you for sending these names.', 'success');
      return;
    }

    setDonorStatus('Preparing commemoration checkout...');
    const data = await donorApi('/api/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({
        parishId,
        giftType: 'commemoration',
        amount,
        frequency: 'once',
        firstName: firstName || 'AGAPAY',
        lastName: rest.join(' '),
        email: session.email,
        namesLiving: living.join('\n'),
        namesDeparted: departed.join('\n'),
        commemorationKind,
        inMemoriam: note,
        paymentMethod: selectedDonorPaymentMethod('once'),
        coverFees: (document.getElementById('coverFees') as HTMLInputElement | null)?.checked !== false,
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {}),
      }),
    });
    if (data.url) window.location.href = data.url;
    else setDonorStatus(data.message || 'Checkout is not available yet.', 'error');
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

async function startDonorCheckout(event: Event) {
  event.preventDefault();
  const session = donorSession();
  const donor = donorProfile();
  if (!session.email || !session.token) {
    setDonorStatus('Sign in from the donor home page before starting checkout.', 'error');
    return;
  }
  const name = donor!.donorName || donor!.householdName || session.email.split('@')[0];
  const [firstName, ...rest] = name.split(/\s+/);
  const giftType = (document.getElementById('giftType') as HTMLSelectElement | null)?.value;
  const normalizedGiftType = normalizeDonorGiftType(giftType);
  const parish = (window.agapayPublicParishes || []).find(
    (item) =>
      item.id ===
      (document.getElementById('parish') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value
  );
  if (!parishHasGivingPlus(parish) && isGivingPlusGiftType(normalizedGiftType)) {
    openGivingPlusPaywall(null, parish, normalizedGiftType);
    return;
  }
  const selectedFund = parish?.funds?.find((fund) =>
    [fund.id, fund.name]
      .filter(truthyDonor)
      .map(String)
      .includes((document.getElementById('fund') as HTMLSelectElement | null)?.value as string)
  );
  const campaign = selectedCampaign();
  const feastDestinationId = campaign?.destinationFundId || 'benevolence-fund';
  const feastDestinationFund =
    normalizedGiftType === 'feast'
      ? (Array.isArray(parish?.funds) ? parish.funds : []).find((fund) =>
          [fund?.id, fund?.code, fund?.name].filter(truthyDonor).map(String).includes(String(feastDestinationId))
        )
      : null;
  const livingNames =
    normalizedGiftType === 'candles'
      ? (document.getElementById('candleLivingNames') as HTMLTextAreaElement | null)?.value || ''
      : normalizedGiftType === 'commemoration'
        ? (document.getElementById('commemorationLivingNames') as HTMLTextAreaElement | null)?.value || ''
        : '';
  const departedNames =
    normalizedGiftType === 'candles'
      ? (document.getElementById('candleDepartedNames') as HTMLTextAreaElement | null)?.value || ''
      : normalizedGiftType === 'commemoration'
        ? (document.getElementById('commemorationDepartedNames') as HTMLTextAreaElement | null)?.value || ''
        : '';
  const intentionNote =
    normalizedGiftType === 'candles'
      ? (document.getElementById('candleIntentionNote') as HTMLInputElement | null)?.value || ''
      : normalizedGiftType === 'commemoration'
        ? (document.getElementById('commemorationIntentionNote') as HTMLInputElement | null)?.value || ''
        : '';
  const commemorationKind =
    normalizedGiftType === 'commemoration'
      ? document.querySelector<HTMLInputElement>('input[name="commemorationKind"]:checked')?.value ||
        'proskomedia_liturgy'
      : '';
  // Same "give anonymously" + "message of encouragement" opportunity the
  // public campaign slug page offers, so a My AGAPAY gift surfaces on that
  // page the same way a public-page gift would.
  const publicAnonymous =
    normalizedGiftType === 'campaign'
      ? Boolean((document.getElementById('campaignAnonymous') as HTMLInputElement | null)?.checked)
      : false;
  const publicComment =
    normalizedGiftType === 'campaign'
      ? String((document.getElementById('campaignPublicComment') as HTMLTextAreaElement | null)?.value || '')
          .trim()
          .slice(0, 280)
      : '';
  try {
    setDonorStatus('Preparing checkout...');
    const frequency = (document.getElementById('frequency') as HTMLInputElement | null)?.value || 'once';
    const paymentMethod = selectedDonorPaymentMethod(frequency);
    const data = await donorApi('/api/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({
        parishId: (document.getElementById('parish') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
          ?.value,
        giftType,
        amount: (document.getElementById('amount') as HTMLInputElement | null)?.value,
        frequency,
        firstName: firstName || 'AGAPAY',
        lastName: rest.join(' '),
        email: session.email,
        fund:
          normalizedGiftType === 'feast'
            ? feastDestinationFund?.name || 'Benevolence Fund'
            : normalizedGiftType === 'fund'
              ? selectedFund?.name || (document.getElementById('fund') as HTMLSelectElement | null)?.value || ''
              : '',
        fundId:
          normalizedGiftType === 'feast'
            ? feastDestinationFund?.id || feastDestinationFund?.code || 'benevolence-fund'
            : normalizedGiftType === 'fund'
              ? selectedFund?.id || (document.getElementById('fund') as HTMLSelectElement | null)?.value || ''
              : '',
        campaign: ['campaign', 'feast'].includes(normalizedGiftType) ? campaignLabel(campaign) : '',
        campaignId: ['campaign', 'feast'].includes(normalizedGiftType)
          ? campaign?.id ||
            campaign?.feastId ||
            (document.getElementById('campaign') as HTMLSelectElement | null)?.value ||
            ''
          : '',
        campaignDescription: ['campaign', 'feast'].includes(normalizedGiftType) ? campaign?.description || '' : '',
        namesLiving: livingNames,
        namesDeparted: departedNames,
        commemorationKind,
        inMemoriam: intentionNote,
        publicAnonymous,
        publicComment,
        paymentMethod,
        coverFees: (document.getElementById('coverFees') as HTMLInputElement | null)?.checked !== false,
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {}),
      }),
    });
    if (data.url) window.location.href = data.url;
    else setDonorStatus(data.message || 'Checkout is not available yet.', 'error');
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

async function handleDonorCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('gift_success') !== '1') return false;

  const sessionId = params.get('session_id');
  if (!sessionId) {
    setDonorStatus("Your payment was successful. We are still waiting for Stripe's final confirmation.", 'success');
    window.history.replaceState(null, '', '/myagapay');
    return true;
  }

  setDonorStatus('Confirming your offering...');
  try {
    const data = await donorApi(`/api/checkout-session-status?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
    });
    if (data.paymentStatus === 'paid' || data.status === 'completed') {
      setDonorStatus('Payment successful. Your offering has been recorded in your dashboard.', 'success');
    } else {
      setDonorStatus(`Stripe returned payment status: ${data.paymentStatus || data.status || 'processing'}.`, 'info');
    }
  } catch (err) {
    setDonorStatus(
      'Your payment was successful. Stripe confirmation is still processing, so your history may update shortly.',
      'success'
    );
    console.warn('AGAPAY donor checkout confirmation warning:', err);
  }
  window.history.replaceState(null, '', '/myagapay');
  return true;
}

// ── PLEDGE TRACKER ────────────────────────────────────────────────────────
function renderPledgeTracker(
  donor: DonorAppProfile | null | undefined,
  summary: Record<string, number>,
  parish: DonorAppParish | null | undefined
) {
  if (!donor) return;
  const trackerEnabled = parish?.pledgeTrackerEnabled === true;
  const pledgeCents = Number(donor.pledgeAmountCents || 0);
  const cadence = donor.pledgeCadence === 'monthly' ? 'monthly' : 'annual';
  const pledgeYear = String(new Date().getFullYear());
  // Pledge progress counts parish offerings (tithe/stewardship) only — not designated
  // funds, campaigns, candles, or commemorations. See donorSummaryFromOfferings.
  const ytdCents = Number(summary?.stewardshipYtdCents || 0);
  const trackedCents = cadence === 'monthly' ? Number(summary?.stewardshipMonthCents || 0) : ytdCents;
  const periodTitle =
    cadence === 'monthly'
      ? new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ' Pledge'
      : pledgeYear + ' Annual Pledge';

  // Both layouts show the same pledge state; only their element IDs differ.
  for (const [cardId, prefix, labelId] of [
    ['pledgeTrackerCard', 'pledge', 'pledgeTrackerLabel'],
    ['desktopPledgeTracker', 'desktopPledge', 'desktopPledgeTitle'],
  ]) {
    const card = document.getElementById(cardId);
    if (!card) continue;
    card.hidden = !parish;
    const activeState = document.getElementById(prefix + 'ActiveState');
    const emptyState = document.getElementById(prefix + 'EmptyState');
    const lockedState = document.getElementById(prefix + 'LockedState');
    if (lockedState) lockedState.hidden = trackerEnabled;
    if (!trackerEnabled || !pledgeCents) {
      if (activeState) activeState.hidden = true;
      if (emptyState) emptyState.hidden = !trackerEnabled;
      continue;
    }
    if (activeState) activeState.hidden = false;
    if (emptyState) emptyState.hidden = true;
    const pct = Math.min(100, Math.round((trackedCents / pledgeCents) * 100));
    const fill = document.getElementById(prefix + 'BarFill');
    const track = document.getElementById(prefix + 'BarTrack');
    if (fill) {
      setTimeout(() => {
        fill.style.width = pct + '%';
      }, 120);
      fill.classList.toggle('pledge-complete', pct >= 100);
    }
    if (track) track.setAttribute('aria-valuenow', String(pct));
    const label = document.getElementById(labelId);
    if (label) label.textContent = periodTitle;
    const raised = document.getElementById(prefix + 'Raised');
    if (raised) raised.textContent = money(trackedCents) + ' given';
    const pctEl = document.getElementById(prefix + 'Pct');
    if (pctEl) pctEl.textContent = pct + '%';
    const goal = document.getElementById(prefix + 'Goal');
    if (goal) goal.textContent = 'of ' + money(pledgeCents) + ' pledge';
    if (prefix === 'pledge') {
      const editLink = card.querySelector<HTMLAnchorElement>('.pledge-tracker-edit');
      if (editLink) editLink.href = '/myagapay/account#pledge';
    }
  }
}

async function checkDonorNotifications() {
  const session = donorSession();
  if (!session.email || !session.token) return;
  try {
    const data = await donorApi('/api/donor/notifications');
    const notifications = data.notifications || [];
    if (!notifications.length) return;
    _nudgeQueue = notifications;
    showNextNudge();
  } catch {
    // Silent — never block the dashboard for a failed notification fetch
  }
}

function showNextNudge() {
  if (!_nudgeQueue.length) return;
  _nudgeCurrent = _nudgeQueue.shift();
  const modal = document.getElementById('pledgeNudgeModal');
  const parishEl = document.getElementById('nudgeModalParish');
  const messageEl = document.getElementById('nudgeModalMessage');
  const figuresEl = document.getElementById('nudgeModalFigures');
  const giveBtn = document.getElementById('nudgeModalGiveBtn') as HTMLAnchorElement | null;
  const dismissBtn = document.getElementById('nudgeModalDismissBtn') as HTMLButtonElement | null;
  if (!modal) return;

  const fmt = (cents: number) =>
    '$' + ((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const year = _nudgeCurrent!.fiscalYear;
  const pledge = _nudgeCurrent!.pledgeCents;
  const given = _nudgeCurrent!.givenCents;
  const remaining = Math.max(0, pledge - given);
  const parishId = _nudgeCurrent!.parishId;

  if (parishEl) parishEl.textContent = parishId || 'Your parish';
  if (messageEl) messageEl.textContent = _nudgeCurrent!.message || '';

  if (figuresEl) {
    figuresEl.innerHTML =
      '<div class="nudge-figure"><span>' +
      year +
      ' Pledge</span><strong>' +
      fmt(pledge) +
      '</strong></div>' +
      '<div class="nudge-figure"><span>Given so far</span><strong>' +
      fmt(given) +
      '</strong></div>' +
      '<div class="nudge-figure nudge-figure--remaining"><span>Remaining</span><strong>' +
      fmt(remaining) +
      '</strong></div>';
  }

  if (giveBtn) {
    giveBtn.href = '/myagapay?parish=' + encodeURIComponent(parishId) + '&giftType=stewardship';
  }

  if (dismissBtn) {
    dismissBtn.onclick = () => dismissNudge(_nudgeCurrent!.id);
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // Also close on backdrop click
  modal.addEventListener(
    'click',
    (e) => {
      if (e.target === modal) dismissNudge(_nudgeCurrent?.id);
    },
    { once: true }
  );
}

async function dismissNudge(id: string | undefined) {
  const modal = document.getElementById('pledgeNudgeModal');
  if (modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  if (id) {
    try {
      await donorApi('/api/donor/notifications/' + encodeURIComponent(id) + '/dismiss', { method: 'POST' });
    } catch {
      /* silent */
    }
  }
  // Show next nudge if any
  if (_nudgeQueue.length) {
    setTimeout(showNextNudge, 300);
  }
}
export type DonorAppPart4 = {
  commemorationRow: typeof commemorationRow;
  commemorationSection: typeof commemorationSection;
  commemorationRows: typeof commemorationRows;
  donorDefaultParish: typeof donorDefaultParish;
  primeCommemorationParishDisplay: typeof primeCommemorationParishDisplay;
  renderCommemorationParish: typeof renderCommemorationParish;
  commemorationNameCount: typeof commemorationNameCount;
  renderCandleList: typeof renderCandleList;
  renderCommemorationInsights: typeof renderCommemorationInsights;
  renderCommemorationsPayload: typeof renderCommemorationsPayload;
  loadDonorCommemorationsPage: typeof loadDonorCommemorationsPage;
  linesFromField: typeof linesFromField;
  toggleCommemorationGiftFields: typeof toggleCommemorationGiftFields;
  selectedDonorPaymentMethod: typeof selectedDonorPaymentMethod;
  submitCommemoration: typeof submitCommemoration;
  startDonorCheckout: typeof startDonorCheckout;
  handleDonorCheckoutReturn: typeof handleDonorCheckoutReturn;
  renderPledgeTracker: typeof renderPledgeTracker;
  checkDonorNotifications: typeof checkDonorNotifications;
  showNextNudge: typeof showNextNudge;
  dismissNudge: typeof dismissNudge;
};
