import type {
  DonorAppProfile,
  DonorAppParish,
  DonorAppFund,
  DonorAppPayload,
  DonorAppError,
  DonorAppOptions,
  DonorGiftOptions,
  DonorStatusElement,
} from './app-contracts.js';
import type { DonorAppBindings } from './app.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyDonor<T>(value: T | null | undefined | false): value is NonNullable<T> {
  return Boolean(value);
}

declare const donorStore: DonorAppBindings['donorStore'];
declare const DONOR_SHELL_VERSION: DonorAppBindings['DONOR_SHELL_VERSION'];
declare const donorSession: DonorAppBindings['donorSession'];
declare const donorProfile: DonorAppBindings['donorProfile'];
declare const setDonorProfile: DonorAppBindings['setDonorProfile'];
declare const renderActiveCampaigns: DonorAppBindings['renderActiveCampaigns'];
declare const renderNextFeast: DonorAppBindings['renderNextFeast'];
declare const renderActiveFunds: DonorAppBindings['renderActiveFunds'];
declare const readDonorCache: DonorAppBindings['readDonorCache'];
declare const toggleGiftDetailFields: DonorAppBindings['toggleGiftDetailFields'];
declare const writeDonorCache: DonorAppBindings['writeDonorCache'];
declare const donorApi: DonorAppBindings['donorApi'];
declare const selectedPublicParish: DonorAppBindings['selectedPublicParish'];
declare const donorGiftTypeCopy: DonorAppBindings['donorGiftTypeCopy'];
declare let donorGiftAmountEdited: DonorAppBindings['donorGiftAmountEdited'];

async function refreshStaleDashboardShell() {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return;
  if (!location.pathname.startsWith('/myagapay') && !location.pathname.startsWith('/donor')) return;
  if (localStorage.getItem(donorStore.shellVersion) === DONOR_SHELL_VERSION) return;

  localStorage.setItem(donorStore.shellVersion, DONOR_SHELL_VERSION);
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('agapay-static-')).map((key) => caches.delete(key)));
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));
  } catch {
    // Cache refresh should never block the dashboard.
  }
  if (navigator.serviceWorker.controller) location.reload();
}

function setDonorStatus(message: string | undefined, tone: string = 'info') {
  ['donorStatus', 'desktopDonorStatus'].forEach((id) => {
    const el = document.getElementById(id) as DonorStatusElement | null;
    if (!el) return;
    const isBookstoreToast = id === 'donorStatus' && document.body?.classList.contains('donor-bookstore-page');
    if (isBookstoreToast) {
      window.clearTimeout(el.bookstoreToastTimer);
      window.clearTimeout(el.bookstoreToastCleanupTimer);
      el.textContent = message || '';
      el.className = message ? `notice ${tone} bookstore-toast` : 'notice bookstore-toast';
      el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      el.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
      if (!message) {
        el.classList.remove('is-visible');
        el.hidden = true;
        el.style.display = 'none';
        return;
      }
      el.hidden = false;
      el.style.display = 'block';
      window.requestAnimationFrame(() => el.classList.add('is-visible'));
      if (tone !== 'error') {
        el.bookstoreToastTimer = window.setTimeout(() => {
          el.classList.remove('is-visible');
          el.bookstoreToastCleanupTimer = window.setTimeout(() => {
            el.hidden = true;
            el.style.display = 'none';
          }, 240);
        }, 2800);
      }
      return;
    }
    el.textContent = message || '';
    el.className = message ? `notice ${tone}` : 'notice';
    el.style.display = message ? 'block' : 'none';
  });
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function isDonorUnauthorized(err: unknown) {
  return (
    (err as DonorAppError)?.status === 401 ||
    String((err as DonorAppError)?.message || '').toLowerCase() === 'unauthorized'
  );
}

function redirectToMyAgapayLogin(reason: string = 'expired') {
  if (window.MyAgapayShell?.redirectToLogin) {
    window.MyAgapayShell.redirectToLogin(reason);
    return true;
  }
  clearDonorSession();
  const next = `${window.location.pathname}${window.location.search || ''}`;
  const loginUrl = new URL('/myagapay/login', window.location.origin);
  loginUrl.searchParams.set('next', next);
  if (reason) loginUrl.searchParams.set('reason', reason);
  window.location.replace(loginUrl.toString());
  return true;
}

function donorLoginReturnPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next') || '/myagapay/';

  // Keep My AGAPAY PWA navigation inside its installed scope.
  // /donor/* is legacy/out-of-scope and can cause Android to open a browser header.
  return next.startsWith('/myagapay/') ? next : '/myagapay/';
}

function donorCacheEmail() {
  return String(donorSession().email || donorProfile()?.email || '')
    .trim()
    .toLowerCase();
}

function donorCacheKey(name: string) {
  return `${donorStore.cachePrefix}:${donorCacheEmail()}:${name}`;
}

function clearDonorCache(name: string) {
  try {
    localStorage.removeItem(donorCacheKey(name));
  } catch {
    // Cache cleanup must never block the live dashboard.
  }
}

function money(cents: unknown) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    (Number(cents) || 0) / 100
  );
}

function donorInitials(donor: DonorAppProfile | null | undefined) {
  const source = donor?.householdName || donor?.donorName || donor?.email || 'Faithful Member';
  const words = String(source).trim().split(/\s+/).filter(truthyDonor);
  if (!words.length) return 'FM';
  if (words.length === 1 && words[0].includes('@')) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function donorDisplayName(donor: DonorAppProfile | null | undefined) {
  if (donor?.householdName) return donor!.householdName;
  if (donor?.donorName) return donor!.donorName;
  if (donor?.email) return donor!.email.split('@')[0];
  return 'Faithful Member';
}

function shortDate(value: unknown) {
  if (!value) return 'No date';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value)
      .split('-')
      .map((part) => Number(part));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(year, month - 1, day)
    );
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value as string)
  );
}

function calendarLabel(value: unknown) {
  return (
    window.AGAPAYLiturgicalCalendar?.calendarLabel(value as string) ||
    (String(value || 'julian')
      .toLowerCase()
      .includes('gregorian')
      ? 'Revised-Julian'
      : 'Julian')
  );
}

function nextFeastForCalendar(calendar: string | undefined) {
  return window.AGAPAYLiturgicalCalendar?.nextLiturgicalFeast(calendar, new Date()) || null;
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateDonorAuthState() {
  const session = donorSession();
  const signedIn = Boolean(session.email && session.token);
  document.querySelectorAll<HTMLElement>('[data-auth-guest]').forEach((el) => {
    el.hidden = signedIn;
  });
  document.querySelectorAll<HTMLElement>('[data-auth-required]').forEach((el) => {
    el.hidden = !signedIn;
  });
}

function saveDonorSession(data: DonorAppPayload | null | undefined) {
  window.AGAPAYDonorSession.saveSession(data);
  if (data?.donor) setDonorProfile(data.donor);
  updateDonorAuthState();
}

function clearDonorSession() {
  window.AGAPAYDonorSession.clearSession();
  updateDonorAuthState();
}

function logoutDonor() {
  clearDonorSession();
  window.location.href = '/myagapay/login';
}

function closeDonorAccountMenus() {
  document.querySelectorAll<HTMLElement>('[data-donor-account-toggle]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll<HTMLElement>('.donor-home-account-dropdown').forEach((panel) => {
    panel.hidden = true;
  });
}

function showGuestDonorDashboard() {
  setDonorStatus('');
  setText('profileName', 'Faithful Account');
  setText('profileMeta', 'Sign in to load live giving history');
  setText('donorHomeTopbarName', 'Faithful Member');
  setText('greeting', 'Welcome, Faithful Member');
  setText('desktopGreeting', 'Welcome, Faithful Member');
  setText('myAgapayGreetingName', 'Faithful Member');
  setText('myAgapayDefaultParish', 'Choose a church in Settings');
  setText('myAgapayLearnPlanner', 'Ready');
  setText('myAgapayLearnTerm', 'Set up term');
  setHtml('myAgapayLearnTier', 'Limited Free');
  setText('myAgapayGivingParish', 'Choose church');
  setText('myAgapayRecurringCount', '0 Active');
  setText('myAgapayRecentAmount', '$0');
  setText('myAgapayGivingMonth', '$0');
  setText('myAgapaySnapshotMonth', '$0');
  setText('myAgapaySnapshotRecurring', '0');
  setText('myAgapaySnapshotCommemorations', '0');
  setText('donorParishName', '');
  setText('desktopParishName', 'Sign in to load your church, giving history, and saved offering preferences.');
  setText('metricMonth', '$0');
  setText('metricYtd', '$0');
  setText('metricOfferings', '0');
  setText('metricCommemorations', '0');
  setText('metricRecurring', '0');
  setText('desktopMetricMonth', '$0');
  setText('desktopMetricYtd', '$0');
  setText('desktopMetricOfferings', '0');
  setText('desktopMetricCommemorations', '0');
  const recent = document.getElementById('recentOfferings');
  if (recent) recent.innerHTML = '';
  const desktopRecent = document.getElementById('desktopRecentOfferings');
  if (desktopRecent) desktopRecent.innerHTML = '';
  const myAgapayActivity = document.getElementById('myAgapayActivity');
  if (myAgapayActivity) {
    myAgapayActivity.innerHTML = `
      <div class="my-agapay-activity-item">
        <span class="activity-dot">+</span>
        <div><strong>Sign in to load your AGAPAY activity</strong><span>Your giving, learning, and organization updates will appear here.</span></div>
        <a class="activity-amount" href="/myagapay/login">Log in</a>
      </div>
    `;
  }
  renderActiveCampaigns(null, { confirmed: true });
  renderNextFeast(null, { confirmed: true });
  renderActiveFunds(null, { confirmed: true });
  updateQuickGiveLinks(null);
  updateDonorAuthState();
}

async function loadPublicParishes(selectId: string = 'parish') {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return [];
  const cached = readDonorCache('parishes');
  if (Array.isArray(cached?.parishes) && cached.parishes.length) {
    window.agapayPublicParishes = cached.parishes;
    const donor = donorProfile();
    renderParishOptions(select, cached.parishes, donor!.defaultParishId || select.value);
    if (selectId === 'parish' && typeof toggleGiftDetailFields === 'function') toggleGiftDetailFields();
  }
  try {
    const parishes = await fetchPublicParishes();
    window.agapayPublicParishes = parishes;
    writeDonorCache('parishes', { parishes });
    if (parishes.length) {
      const donor = donorProfile();
      renderParishOptions(select, parishes, donor!.defaultParishId || select.value);
    }
    if (selectId === 'parish' && typeof toggleGiftDetailFields === 'function') toggleGiftDetailFields();
    return parishes;
  } catch {
    return [];
  }
}

async function fetchPublicParishes() {
  const parishes = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ limit: '250' });
    if (cursor) params.set('cursor', cursor);
    const data = await donorApi(`/api/parishes?${params.toString()}`, { headers: { Accept: 'application/json' } });
    parishes.push(...(data.parishes || []));
    cursor = data.cursor || '';
  } while (cursor);
  return parishes;
}

function parishOptionLabel(parish: DonorAppParish) {
  const place = [parish.city, parish.state].filter(truthyDonor).join(', ');
  const type = parish.type ? `${parish.type.charAt(0).toUpperCase()}${parish.type.slice(1)}` : 'Church';
  return [parish.name, place, type].filter(truthyDonor).join(' - ');
}

function renderParishOptions(
  select: HTMLSelectElement,
  parishes: DonorAppParish[],
  selectedValue: string = '',
  query: string = ''
) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  const filtered = parishes.filter((parish) => {
    const haystack = [
      parish.name,
      parish.city,
      parish.state,
      parish.type,
      parish.jurisdictionLabel,
      parish.jurisdiction,
    ]
      .filter(truthyDonor)
      .join(' ')
      .toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const placeholder = select.dataset.placeholder || 'Choose your parish';
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`].concat(
    filtered.map(
      (parish) => `<option value="${escapeHtml(parish.id)}">${escapeHtml(parishOptionLabel(parish))}</option>`
    )
  );
  select.innerHTML = options.join('');
  if (selectedValue && filtered.some((parish) => parish.id === selectedValue)) select.value = selectedValue;
}

function filterParishSelect(searchId: string, selectId: string) {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  const search = document.getElementById(searchId) as HTMLInputElement | null;
  if (!select || !search) return;
  renderParishOptions(select, window.agapayPublicParishes || [], select.value, search.value);
}

function donorGiftUrl(giftType: string, parish: DonorAppParish | null | undefined, extra: DonorGiftOptions = {}) {
  const params = new URLSearchParams({ giftType: normalizeDonorGiftType(giftType) });
  if (parish?.id) params.set('parish', parish.id);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) params.set(key, value as string);
  });
  return `/myagapay/giving/give?${params.toString()}`;
}

function quickDonorGiftUrl(giftType: string, parish: DonorAppParish | null | undefined, extra: DonorGiftOptions = {}) {
  return donorGiftUrl(giftType, parish, { quick: '1', ...extra });
}

function normalizeDonorGiftType(value: unknown) {
  const normalized = String(value || 'stewardship').toLowerCase();
  const aliases: Record<string, string> = {
    alms: 'feast',
    candle: 'candles',
    love: 'commemoration',
    memorial: 'commemoration',
    memorials: 'commemoration',
    funds: 'fund',
  };
  return aliases[normalized] || normalized;
}

function isGivingPlusGiftType(value: unknown) {
  return ['fund', 'candles', 'commemoration', 'campaign', 'feast'].includes(normalizeDonorGiftType(value));
}

function parishHasGivingPlus(parish: DonorAppParish | null | undefined) {
  return Boolean(parish?.givingPlusEnabled);
}

function isGeneralDonorFund(fund: DonorAppFund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(truthyDonor)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value));
}

function isCandleDonorFund(fund: DonorAppFund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(truthyDonor)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ['candle', 'candles', 'candles / vigil lights', 'candle fund'].includes(value));
}

function parishCanUseGiftType(parish: DonorAppParish | null | undefined, value: unknown) {
  const giftType = normalizeDonorGiftType(value);
  if (giftType === 'stewardship') return true;
  if (giftType === 'candles') return Boolean(parish?.candlesEnabled);
  if (giftType === 'fund') {
    return (
      Boolean(parish?.designatedFundsEnabled) &&
      (parish?.funds || []).some((fund) => fund && !isGeneralDonorFund(fund) && !isCandleDonorFund(fund))
    );
  }
  return parishHasGivingPlus(parish) && ['commemoration', 'campaign', 'feast'].includes(giftType);
}

function ensureGivingPlusPaywall() {
  let dialog = document.getElementById('givingPlusPaywall') as HTMLDialogElement | null;
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'givingPlusPaywall';
  dialog.className = 'giving-plus-paywall';
  dialog.innerHTML = `
    <div class="giving-plus-paywall-inner">
      <button class="giving-plus-paywall-close" type="button" aria-label="Close" onclick="closeGivingPlusPaywall()">×</button>
      <span class="giving-plus-paywall-badge">Give + feature</span>
      <h2 id="givingPlusPaywallTitle">Help your parish offer more ways to give</h2>
      <p id="givingPlusPaywallCopy">Give includes a General Operating Fund, one designated fund, and candles. Give + unlocks unlimited funds, campaigns, commemorations, and festal alms.</p>
      <div class="giving-plus-paywall-actions">
        <button class="btn btn-ghost" type="button" onclick="closeGivingPlusPaywall()">Not now</button>
        <button class="btn btn-gold" id="givingPlusEncourageButton" type="button" onclick="requestParishGivingPlusUpgrade(this)">Encourage my parish</button>
      </div>
      <p class="giving-plus-paywall-status" id="givingPlusPaywallStatus" aria-live="polite"></p>
    </div>`;
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeGivingPlusPaywall();
  });
  document.body.appendChild(dialog);
  return dialog;
}

function closeGivingPlusPaywall() {
  const dialog = document.getElementById('givingPlusPaywall') as HTMLDialogElement | null;
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function openGivingPlusPaywall(
  event: Event | null | undefined,
  parish: DonorAppParish | null | undefined,
  giftType: string = ''
) {
  event?.preventDefault();
  const selectedParish = parish || selectedPublicParish() || window.agapaySelectedGivingParish || null;
  window.agapaySelectedGivingParish = selectedParish;
  const dialog = ensureGivingPlusPaywall();
  const status = document.getElementById('givingPlusPaywallStatus');
  const button = document.getElementById('givingPlusEncourageButton') as HTMLButtonElement | null;
  const label = donorGiftTypeCopy[normalizeDonorGiftType(giftType)]?.detailsTitle || 'This giving option';
  const copy = document.getElementById('givingPlusPaywallCopy');
  if (copy) {
    const starterOption = ['fund', 'candles'].includes(normalizeDonorGiftType(giftType));
    copy.textContent = starterOption
      ? `${selectedParish?.name || 'This parish'} can offer ${label.toLowerCase()} on Give, but this option has not been configured or is currently paused.`
      : `${label} is available with Give +. Give includes General Operating, one designated fund, and candle giving.`;
  }
  if (status)
    status.textContent = selectedParish
      ? 'You can privately let parish leadership know that you want more giving options.'
      : 'Choose your home parish before sending an upgrade request.';
  if (button) {
    button.disabled = !selectedParish;
    button.textContent = 'Encourage my parish';
  }
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return false;
}

async function requestParishGivingPlusUpgrade(button: HTMLButtonElement | null) {
  const status = document.getElementById('givingPlusPaywallStatus');
  if (button) {
    button.disabled = true;
    button.textContent = 'Sending…';
  }
  if (status) status.textContent = 'Sending your request…';
  try {
    const result = await donorApi('/api/donor/giving-plus-feature-request', { method: 'POST' });
    if (status) status.textContent = result.message || 'Your parish will see your request in its dashboard.';
    if (button) button.textContent = 'Request sent';
  } catch (error) {
    if (status) status.textContent = (error as DonorAppError).message || 'Unable to send your request.';
    if (button) {
      button.disabled = false;
      button.textContent = 'Try again';
    }
  }
}

function setGivingTierTilesLoading() {
  document.body.classList.add('giving-tier-pending');
  document
    .querySelectorAll<HTMLElement>('[data-giving-tier-region]')
    .forEach((region) => region.setAttribute('aria-busy', 'true'));
  document.querySelectorAll<HTMLElement>('[data-giving-plus-gift]').forEach((tile) => {
    tile.classList.remove('giving-tier-locked');
    tile.classList.add('giving-tier-loading');
    tile.setAttribute('aria-busy', 'true');
    tile.setAttribute('aria-disabled', 'true');
    tile.setAttribute('tabindex', '-1');
    tile.setAttribute('aria-label', `${tile.textContent.trim()} — checking availability`);
    tile.onclick = (event) => event.preventDefault();
  });
}

function updateGivingTierTiles(parish: DonorAppParish | null | undefined) {
  if (parish) window.agapaySelectedGivingParish = parish;
  document.body.classList.remove('giving-tier-pending');
  document
    .querySelectorAll<HTMLElement>('[data-giving-tier-region]')
    .forEach((region) => region.removeAttribute('aria-busy'));
  document.querySelectorAll<HTMLElement>('[data-giving-plus-gift]').forEach((tile) => {
    const giftType = tile.getAttribute('data-giving-plus-gift') || '';
    const allowed = parishCanUseGiftType(parish, giftType);
    tile.classList.remove('giving-tier-loading');
    tile.classList.toggle('giving-tier-locked', !allowed);
    tile.removeAttribute('aria-busy');
    tile.removeAttribute('aria-disabled');
    tile.removeAttribute('tabindex');
    tile.setAttribute(
      'aria-label',
      !allowed ? `${tile.textContent.trim()} — not currently available` : tile.textContent.trim()
    );
    (tile as HTMLAnchorElement).href = allowed ? quickDonorGiftUrl(giftType, parish) : '#giving-plus';
    tile.onclick = allowed ? null : (event) => openGivingPlusPaywall(event, parish, giftType);
  });
}

function markDonorGiftAmountEdited() {
  donorGiftAmountEdited = true;
}

function syncDonorCommemorationAmount(kind: string, options: DonorAppOptions = {}) {
  const amountInput = document.getElementById('amount') as HTMLInputElement | null;
  if (!amountInput) return;
  const nextDefault = kind === 'molieben_panikhida' ? '25' : '1';
  const previousDefault = amountInput.dataset.commemorationDefault || '';
  const shouldApply =
    options.force || !donorGiftAmountEdited || !amountInput.value || amountInput.value === previousDefault;
  amountInput.dataset.commemorationDefault = nextDefault;
  if (shouldApply) amountInput.value = nextDefault;
}

function donorNavIcon(kind: string) {
  const sharedKind = kind === 'giving' ? 'give' : kind === 'marketplace' ? 'market' : kind;
  if (window.MyAgapayShell?.icons?.[sharedKind]) return window.MyAgapayShell.icons[sharedKind];
  const givingHandIcon =
    '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M8 15V8.5a1.8 1.8 0 0 1 3.6 0V15"/><path d="M11.6 15V6.5a1.8 1.8 0 0 1 3.6 0V15"/><path d="M15.2 15V8a1.8 1.8 0 0 1 3.6 0v8"/><path d="M18.8 16v-4.2a1.8 1.8 0 0 1 3.6 0V17c0 4.4-3 7-7.6 7H14a8 8 0 0 1-8-8v-2a1.8 1.8 0 0 1 2.4 0L10 16"/><path d="M6.5 21.5c1.6 1.6 3.8 2.5 6.2 2.5"/></svg>';
  const icons: Record<string, string> = {
    home: '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>',
    give: givingHandIcon,
    giving: givingHandIcon,
    learn:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 6.5A4.5 4.5 0 0 1 9.5 2H23v20H9.5A4.5 4.5 0 0 0 5 26z"/><path d="M5 6.5V26"/><path d="M10 7h8"/><path d="M10 11h7"/></svg>',
    bookstore:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 22.5A3 3 0 0 1 8 19.5h16"/><path d="M8 3h16v22H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/><path d="M10.5 8h8"/><path d="M10.5 12h7"/></svg>',
    marketplace:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M7 9h14l-1.2 15H8.2z"/><path d="M10 9a4 4 0 0 1 8 0"/><path d="M10.5 15h7"/></svg>',
    directory:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3.5l9 6.75V24H5V10.25z"/><path d="M10.5 24v-8h7v8"/><path d="M9.5 12h9"/><path d="M14 7.5v8.5"/></svg>',
    calendar:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="5" width="22" height="20" rx="3"/><path d="M3 11h22"/><path d="M9 3v4M19 3v4"/><path d="M8 16h4M8 20h8"/></svg>',
    history:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 22h20"/><path d="M6 22V14l3-2v10"/><path d="M12 22V10l3-2v14"/><path d="M18 22V6l3-2v18"/></svg>',
    commemorations:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 16c0-5 2-8 5-9 1.5-.5 3-.5 5-.5s3.5 0 5 .5c3 1 5 4 5 9"/><path d="M4 16c0 3 2 5 10 5s10-2 10-5"/><path d="M10 13c1-2 2-3 4-3s3 1 4 3"/><line x1="14" y1="7" x2="14" y2="10"/><line x1="12" y1="8" x2="16" y2="8"/></svg>',
    account:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="9" r="4"/><path d="M5.5 24a8.5 8.5 0 0 1 17 0"/></svg>',
    billing:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="7" width="22" height="14" rx="3"/><path d="M3 12h22"/><path d="M8 17h5"/></svg>',
    profile:
      '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="9" r="4"/><path d="M5.5 24a8.5 8.5 0 0 1 17 0"/></svg>',
  };
  return icons[kind] || icons.home;
}

function donorNavKind(href: string | null | undefined) {
  const path = String(href || '');
  if (path.includes('#giving-dashboard')) return 'give';
  if (path.includes('/myagapay/giving')) return 'give';
  if (path.includes('/bookstore')) return 'bookstore';
  if (path.includes('/learn')) return 'learn';
  if (path.includes('/marketplace')) return 'marketplace';
  if (path.includes('/directory')) return 'directory';
  if (path.includes('#billing')) return 'billing';
  if (path.includes('/settings')) return 'account';
  if (path.includes('/offerings')) return 'history';
  if (path.includes('/calendar')) return 'calendar';
  if (path.includes('/commemorations')) return 'commemorations';
  if (path.includes('/give')) return 'give';
  return 'home';
}

function applyDonorNavIcons() {
  document.querySelectorAll<HTMLElement>('.nav a, .mobile-tabbar a, .my-agapay-tabbar a').forEach((link) => {
    if (link.closest<HTMLElement>('[data-myagapay-global-nav]')) return;
    const existing = link.querySelector<HTMLElement>('svg');
    if (!existing) return;
    const wrapper = document.createElement('span');
    wrapper.innerHTML = donorNavIcon(donorNavKind(link.getAttribute('href')));
    existing.replaceWith(wrapper.firstElementChild!);
  });
}

function communityIconSvg(type: string | undefined) {
  const normalized = String(type || 'parish').toLowerCase();
  if (normalized === 'monastery') {
    return '<svg viewBox="0 0 38 38" aria-hidden="true"><rect x="4" y="14" width="30" height="18" rx="1"/><rect x="14" y="6" width="10" height="14" rx="1"/><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M15 32 L15 25 Q19 21 23 25 L23 32"/><rect x="7" y="18" width="5" height="6" rx="2.5"/><rect x="26" y="18" width="5" height="6" rx="2.5"/></svg>';
  }
  if (normalized === 'mission') {
    return '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M19 6 C10 10 8 17 11 22 C13 26 16 27 19 27 C22 27 25 26 27 22 C30 17 28 10 19 6Z"/><line x1="12" y1="27" x2="26" y2="27"/><line x1="13" y1="29" x2="25" y2="29"/></svg>';
  }
  return '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>';
}

function syncSacramentsEntry(parish: DonorAppParish | null | undefined) {
  const available = Boolean(parish?.sacramentsEnabled);
  document.querySelectorAll<HTMLElement>('[data-sacraments-entry]').forEach((el) => {
    el.hidden = !available;
  });
}

function updateQuickGiveLinks(
  parish: DonorAppParish | null | undefined,
  { syncGivingTier = true }: DonorAppOptions = {}
) {
  const tithesLink = document.getElementById('quickGiveTithes') as HTMLAnchorElement | null;
  const parishIcon = document.getElementById('quickGiveParishIcon');
  const desktopParishIcon = document.getElementById('desktopParishIcon');
  const desktopTithesLink = document.getElementById('desktopQuickTithes') as HTMLAnchorElement | null;
  if (tithesLink) tithesLink.href = quickDonorGiftUrl('stewardship', parish);
  if (desktopTithesLink) desktopTithesLink.href = quickDonorGiftUrl('stewardship', parish);
  if (parishIcon) parishIcon.innerHTML = communityIconSvg(parish?.type);
  if (desktopParishIcon) desktopParishIcon.innerHTML = communityIconSvg(parish?.type);
  if (syncGivingTier) updateGivingTierTiles(parish);
  syncSacramentsEntry(parish);
}

function activeParishCampaigns(parish: DonorAppParish | null | undefined) {
  const campaigns = Array.isArray(parish?.campaigns) ? parish.campaigns : [];
  return campaigns.filter((campaign) => {
    const status = String(campaign?.status || (campaign?.enabled === false ? 'hidden' : 'active')).toLowerCase();
    return campaign && !['hidden', 'paused', 'cancelled', 'ended', 'inactive'].includes(status);
  });
}

function activeParishFeastCampaigns(parish: DonorAppParish | null | undefined) {
  const campaigns = Array.isArray(parish?.feastCampaigns) ? parish.feastCampaigns : [];
  return campaigns.filter((campaign) => {
    const status = String(campaign?.status || (campaign?.enabled === false ? 'hidden' : 'active')).toLowerCase();
    return campaign && !['hidden', 'paused', 'cancelled', 'ended', 'inactive'].includes(status);
  });
}
export type DonorAppPart1 = {
  truthyDonor: typeof truthyDonor;
  refreshStaleDashboardShell: typeof refreshStaleDashboardShell;
  setDonorStatus: typeof setDonorStatus;
  setText: typeof setText;
  setHtml: typeof setHtml;
  isDonorUnauthorized: typeof isDonorUnauthorized;
  redirectToMyAgapayLogin: typeof redirectToMyAgapayLogin;
  donorLoginReturnPath: typeof donorLoginReturnPath;
  donorCacheEmail: typeof donorCacheEmail;
  donorCacheKey: typeof donorCacheKey;
  clearDonorCache: typeof clearDonorCache;
  money: typeof money;
  donorInitials: typeof donorInitials;
  donorDisplayName: typeof donorDisplayName;
  shortDate: typeof shortDate;
  calendarLabel: typeof calendarLabel;
  nextFeastForCalendar: typeof nextFeastForCalendar;
  escapeHtml: typeof escapeHtml;
  updateDonorAuthState: typeof updateDonorAuthState;
  saveDonorSession: typeof saveDonorSession;
  clearDonorSession: typeof clearDonorSession;
  logoutDonor: typeof logoutDonor;
  closeDonorAccountMenus: typeof closeDonorAccountMenus;
  showGuestDonorDashboard: typeof showGuestDonorDashboard;
  loadPublicParishes: typeof loadPublicParishes;
  fetchPublicParishes: typeof fetchPublicParishes;
  parishOptionLabel: typeof parishOptionLabel;
  renderParishOptions: typeof renderParishOptions;
  filterParishSelect: typeof filterParishSelect;
  donorGiftUrl: typeof donorGiftUrl;
  quickDonorGiftUrl: typeof quickDonorGiftUrl;
  normalizeDonorGiftType: typeof normalizeDonorGiftType;
  isGivingPlusGiftType: typeof isGivingPlusGiftType;
  parishHasGivingPlus: typeof parishHasGivingPlus;
  isGeneralDonorFund: typeof isGeneralDonorFund;
  isCandleDonorFund: typeof isCandleDonorFund;
  parishCanUseGiftType: typeof parishCanUseGiftType;
  ensureGivingPlusPaywall: typeof ensureGivingPlusPaywall;
  closeGivingPlusPaywall: typeof closeGivingPlusPaywall;
  openGivingPlusPaywall: typeof openGivingPlusPaywall;
  requestParishGivingPlusUpgrade: typeof requestParishGivingPlusUpgrade;
  setGivingTierTilesLoading: typeof setGivingTierTilesLoading;
  updateGivingTierTiles: typeof updateGivingTierTiles;
  markDonorGiftAmountEdited: typeof markDonorGiftAmountEdited;
  syncDonorCommemorationAmount: typeof syncDonorCommemorationAmount;
  donorNavIcon: typeof donorNavIcon;
  donorNavKind: typeof donorNavKind;
  applyDonorNavIcons: typeof applyDonorNavIcons;
  communityIconSvg: typeof communityIconSvg;
  syncSacramentsEntry: typeof syncSacramentsEntry;
  updateQuickGiveLinks: typeof updateQuickGiveLinks;
  activeParishCampaigns: typeof activeParishCampaigns;
  activeParishFeastCampaigns: typeof activeParishFeastCampaigns;
};
