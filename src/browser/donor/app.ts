import type { DonorAppPart1 } from './app-session-and-parish.js';
declare const refreshStaleDashboardShell: DonorAppPart1['refreshStaleDashboardShell'];
declare const setDonorStatus: DonorAppPart1['setDonorStatus'];
declare const setText: DonorAppPart1['setText'];
declare const setHtml: DonorAppPart1['setHtml'];
declare const isDonorUnauthorized: DonorAppPart1['isDonorUnauthorized'];
declare const redirectToMyAgapayLogin: DonorAppPart1['redirectToMyAgapayLogin'];
declare const donorLoginReturnPath: DonorAppPart1['donorLoginReturnPath'];
declare const donorCacheEmail: DonorAppPart1['donorCacheEmail'];
declare const donorCacheKey: DonorAppPart1['donorCacheKey'];
declare const clearDonorCache: DonorAppPart1['clearDonorCache'];
declare const money: DonorAppPart1['money'];
declare const donorInitials: DonorAppPart1['donorInitials'];
declare const donorDisplayName: DonorAppPart1['donorDisplayName'];
declare const shortDate: DonorAppPart1['shortDate'];
declare const calendarLabel: DonorAppPart1['calendarLabel'];
declare const nextFeastForCalendar: DonorAppPart1['nextFeastForCalendar'];
declare const escapeHtml: DonorAppPart1['escapeHtml'];
declare const updateDonorAuthState: DonorAppPart1['updateDonorAuthState'];
declare const saveDonorSession: DonorAppPart1['saveDonorSession'];
declare const clearDonorSession: DonorAppPart1['clearDonorSession'];
declare const logoutDonor: DonorAppPart1['logoutDonor'];
declare const closeDonorAccountMenus: DonorAppPart1['closeDonorAccountMenus'];
declare const showGuestDonorDashboard: DonorAppPart1['showGuestDonorDashboard'];
declare const loadPublicParishes: DonorAppPart1['loadPublicParishes'];
declare const fetchPublicParishes: DonorAppPart1['fetchPublicParishes'];
declare const donorGiftUrl: DonorAppPart1['donorGiftUrl'];
declare const quickDonorGiftUrl: DonorAppPart1['quickDonorGiftUrl'];
declare const normalizeDonorGiftType: DonorAppPart1['normalizeDonorGiftType'];
declare const isGivingPlusGiftType: DonorAppPart1['isGivingPlusGiftType'];
declare const parishHasGivingPlus: DonorAppPart1['parishHasGivingPlus'];
declare const isGeneralDonorFund: DonorAppPart1['isGeneralDonorFund'];
declare const isCandleDonorFund: DonorAppPart1['isCandleDonorFund'];
declare const parishCanUseGiftType: DonorAppPart1['parishCanUseGiftType'];
declare const openGivingPlusPaywall: DonorAppPart1['openGivingPlusPaywall'];
declare const setGivingTierTilesLoading: DonorAppPart1['setGivingTierTilesLoading'];
declare const updateGivingTierTiles: DonorAppPart1['updateGivingTierTiles'];
declare const syncDonorCommemorationAmount: DonorAppPart1['syncDonorCommemorationAmount'];
declare const applyDonorNavIcons: DonorAppPart1['applyDonorNavIcons'];
declare const updateQuickGiveLinks: DonorAppPart1['updateQuickGiveLinks'];
declare const activeParishCampaigns: DonorAppPart1['activeParishCampaigns'];
declare const activeParishFeastCampaigns: DonorAppPart1['activeParishFeastCampaigns'];
import type { DonorAppPart2 } from './app-giving-and-login.js';
declare const selectedPublicParish: DonorAppPart2['selectedPublicParish'];
declare const campaignLabel: DonorAppPart2['campaignLabel'];
declare const selectedCampaign: DonorAppPart2['selectedCampaign'];
declare const renderActiveCampaigns: DonorAppPart2['renderActiveCampaigns'];
declare const renderActiveFunds: DonorAppPart2['renderActiveFunds'];
declare const renderNextFeast: DonorAppPart2['renderNextFeast'];
declare const renderHomeParishWidgetsLoading: DonorAppPart2['renderHomeParishWidgetsLoading'];
declare const toggleGiftDetailFields: DonorAppPart2['toggleGiftDetailFields'];
declare const loginFromPage: DonorAppPart2['loginFromPage'];
declare const showDonorLogin: DonorAppPart2['showDonorLogin'];
declare const showDonorPasswordReset: DonorAppPart2['showDonorPasswordReset'];
declare const requestDonorPasswordReset: DonorAppPart2['requestDonorPasswordReset'];
declare const confirmDonorPasswordReset: DonorAppPart2['confirmDonorPasswordReset'];
declare const initDonorPasswordResetPage: DonorAppPart2['initDonorPasswordResetPage'];
declare const initDonorLoginPageControls: DonorAppPart2['initDonorLoginPageControls'];
import type { DonorAppPart3 } from './app-account-and-dashboard.js';
declare const openMyAgapayLearnCheckout: DonorAppPart3['openMyAgapayLearnCheckout'];
declare const primeDonorDashboardParishUi: DonorAppPart3['primeDonorDashboardParishUi'];
declare const loadDonorDashboardPage: DonorAppPart3['loadDonorDashboardPage'];
declare const commemorationEntriesForDisplay: DonorAppPart3['commemorationEntriesForDisplay'];
import type { DonorAppPart4 } from './app-commemorations-and-checkout.js';
declare const loadDonorCommemorationsPage: DonorAppPart4['loadDonorCommemorationsPage'];
declare const renderPledgeTracker: DonorAppPart4['renderPledgeTracker'];
declare const checkDonorNotifications: DonorAppPart4['checkDonorNotifications'];
import type {
  DonorAppProfile,
  DonorAppNudge,
  DonorAppPayload,
  DonorAppError,
  DonorAppOptions,
} from './app-contracts.js';
const donorStore = {
  email: window.AGAPAYDonorSession.storageKeys.email,
  token: window.AGAPAYDonorSession.storageKeys.token,
  donor: window.AGAPAYDonorSession.storageKeys.profile,
  cachePrefix: 'agapayDonorCache',
  shellVersion: 'agapayDonorShellVersion',
};

const DONOR_SHELL_VERSION = '2026-08-01-atomic-page-hydration';

refreshStaleDashboardShell();

function donorSession() {
  return window.AGAPAYDonorSession.session();
}

function donorAuthHeaders(extra: Record<string, string> = {}) {
  return window.AGAPAYDonorSession.authHeaders({ 'Content-Type': 'application/json', ...extra });
}

async function donorApi<T = DonorAppPayload>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: options.headers || donorAuthHeaders(),
  });
  const publicAuthRequest = [
    '/api/donor/login',
    '/api/donor/signup',
    '/api/donor/verify',
    '/api/donor/password-reset-request',
    '/api/donor/password-reset-confirm',
  ].some((route) => String(path).startsWith(route));
  if (!publicAuthRequest && window.MyAgapayShell?.handleUnauthorized?.(res)) {
    return new Promise<never>(() => {});
  }
  const data = (await res.json().catch(() => ({}))) as DonorAppPayload;
  if (!res.ok) {
    const err: DonorAppError = new Error(data.error || data.detail || 'AGAPAY request failed');
    (err as DonorAppError).status = res.status;
    (err as DonorAppError).data = data;
    throw err;
  }
  return data as T;
}

function readDonorCache<T = DonorAppPayload>(name: string, { maxAgeMs = 0 }: DonorAppOptions = {}) {
  const email = donorCacheEmail();
  if (!email) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(donorCacheKey(name)) || 'null') as {
      email?: string;
      savedAt?: string | number;
      data: T;
    } | null;
    if (cached?.email !== email) return null;
    if (maxAgeMs > 0) {
      const savedAt = new Date(cached.savedAt || 0).getTime();
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > maxAgeMs) return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function writeDonorCache(name: string, data: unknown) {
  const email = donorCacheEmail();
  if (!email || !data) return;
  try {
    localStorage.setItem(
      donorCacheKey(name),
      JSON.stringify({
        email,
        savedAt: new Date().toISOString(),
        data,
      })
    );
  } catch {
    // Cache is only for instant paint; ignore storage pressure or privacy mode.
  }
}

function donorProfile() {
  return window.AGAPAYDonorSession.profile() as DonorAppProfile | null;
}

function setDonorProfile(donor: DonorAppProfile | null | undefined) {
  if (!donor) return;
  window.AGAPAYDonorSession.setProfile(donor);
  const name = donor!.householdName || donor!.donorName || donor!.email || 'AGAPAY faithful';
  const profileName = document.getElementById('profileName');
  const profileMeta = document.getElementById('profileMeta');
  if (profileName) profileName.textContent = name;
  if (profileMeta)
    profileMeta.textContent = donor!.defaultParishId
      ? `${donor!.email} - ${donor!.defaultParishId}`
      : donor!.email || 'Faithful account loaded';
  setText('donorHomeTopbarName', donorDisplayName(donor));
  document.querySelectorAll<HTMLElement>('.mobile-avatar, .desktop-avatar').forEach((avatar) => {
    avatar.textContent = donorInitials(donor);
  });
  const greeting = document.getElementById('greeting');
  if (greeting) greeting.textContent = `Welcome, ${donorDisplayName(donor)}`;
  const desktopGreeting = document.getElementById('desktopGreeting');
  if (desktopGreeting) desktopGreeting.textContent = `Welcome, ${donorDisplayName(donor)}`;
  updateDonorAuthState();
}

const donorGiftTypeCopy: Record<
  string,
  { eyebrow: string; title: string; detailsTitle: string; intro: string; context: string }
> = {
  stewardship: {
    eyebrow: 'Quick Tithes',
    title: 'Give your tithes.',
    detailsTitle: 'Tithes',
    intro: 'Make a one-time tithe or establish a recurring rhythm of parish support in one clean flow.',
    context:
      'Your gift will be prepared as a parish offering. Use Designated Fund if this should go to a specific parish fund.',
  },
  fund: {
    eyebrow: 'Quick Designated Fund',
    title: 'Give to a designated fund.',
    detailsTitle: 'Designated Fund Offering',
    intro: 'Support building, clergy, education, icons, or another parish-approved fund.',
    context:
      'Your gift will be prepared as a designated fund offering. Add the fund name in the Stripe note if needed while this donor flow is being expanded.',
  },
  candles: {
    eyebrow: 'Quick Candle Offering',
    title: 'Offer a candle.',
    detailsTitle: 'Candle Offering',
    intro: 'Make a candle offering for prayer intentions without moving through the full giving menu.',
    context:
      'Your gift will be prepared as a candle offering. Add living or departed names below for the parish prayer list.',
  },
  commemoration: {
    eyebrow: 'Quick Memorial Offering',
    title: 'Give for memorials and commemorations.',
    detailsTitle: 'Memorial Offering',
    intro: 'Make an offering connected to memorials, proskomedia, and parish commemoration needs.',
    context: 'List the living and departed names below so the parish receives them in the commemoration queue.',
  },
  campaign: {
    eyebrow: 'Quick Campaign Offering',
    title: 'Support an active campaign.',
    detailsTitle: 'Campaign Offering',
    intro: 'Give directly toward parish-approved needs, relief efforts, building work, or other focused campaigns.',
    context: 'Your gift will be prepared as a campaign offering for the selected parish.',
  },
  feast: {
    eyebrow: 'Quick Festal Alms',
    title: 'Mark the feast with alms.',
    detailsTitle: 'Festal Alms Offering',
    intro: "Make an alms offering tied to the Church calendar and the parish's chosen destination fund.",
    context: 'Your parish chooses the fund that receives gifts for each Major Feast Alms campaign.',
  },
};

// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let donorGiftAmountEdited = false;
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let activeDonorGiftType = '';

window.loginFromPage = loginFromPage;
window.showDonorLogin = showDonorLogin;
window.showDonorPasswordReset = showDonorPasswordReset;
window.requestDonorPasswordReset = requestDonorPasswordReset;
window.confirmDonorPasswordReset = confirmDonorPasswordReset;

document.addEventListener('DOMContentLoaded', () => {
  initDonorLoginPageControls();
  initDonorPasswordResetPage();
});

document.addEventListener('DOMContentLoaded', () => {
  const saved = donorProfile();
  applyDonorNavIcons();
  document.body.removeAttribute('hx-boost');
  document.querySelectorAll<HTMLElement>('.nav').forEach((nav) => {
    nav.setAttribute('hx-boost', 'false');
    nav.removeAttribute('hx-target');
  });
  document
    .querySelectorAll<HTMLElement>(
      '.sidebar-footer a[href="/"], .sidebar-footer a[href="/give"], .sidebar-footer a[href="/give"]'
    )
    .forEach((link) => {
      link.setAttribute('hx-boost', 'false');
    });
  document.addEventListener('click', (event) => {
    const accountToggle = (event.target as HTMLElement).closest<HTMLElement>('[data-donor-account-toggle]');
    const accountMenu = (event.target as HTMLElement).closest<HTMLElement>('[data-donor-account-menu]');
    if (accountToggle) {
      const menu = accountToggle.closest<HTMLElement>('[data-donor-account-menu]');
      const dropdown = menu?.querySelector<HTMLElement>('.donor-home-account-dropdown');
      const open = accountToggle.getAttribute('aria-expanded') !== 'true';
      closeDonorAccountMenus();
      accountToggle.setAttribute('aria-expanded', String(open));
      if (dropdown) dropdown.hidden = !open;
      return;
    }
    if (!accountMenu) closeDonorAccountMenus();
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-donor-logout]')) {
      logoutDonor();
      return;
    }

    const upgradeButton = (event.target as HTMLElement).closest<HTMLElement>('[data-myagapay-learn-upgrade]');
    if (!upgradeButton) return;
    event.preventDefault();
    openMyAgapayLearnCheckout(upgradeButton as HTMLButtonElement);
  });
  if (saved!.email) {
    setDonorProfile(saved);
  } else {
    const profileName = document.getElementById('profileName');
    const profileMeta = document.getElementById('profileMeta');
    const greeting = document.getElementById('greeting');
    const desktopGreeting = document.getElementById('desktopGreeting');
    if (profileName) profileName.textContent = 'Faithful Account';
    if (profileMeta) profileMeta.textContent = 'Sign in to load live giving history';
    setText('donorHomeTopbarName', 'Faithful Member');
    if (greeting) greeting.textContent = 'Welcome, Faithful Member';
    if (desktopGreeting) desktopGreeting.textContent = 'Welcome, Faithful Member';
  }
  primeDonorDashboardParishUi();
  updateDonorAuthState();
  checkDonorNotifications();
  const emailInput = document.getElementById('donorEmail') as HTMLInputElement | null;
  if (emailInput && donorSession().email) emailInput.value = donorSession().email;
  initDonorPasswordResetPage();
});

// ── Pledge nudge notifications ────────────────────────────────────────────────

// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let _nudgeQueue: DonorAppNudge[] = [];
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let _nudgeCurrent: DonorAppNudge | null | undefined = null;

export type DonorAppWindowHandlers = {
  loginFromPage: typeof loginFromPage;
  showDonorLogin: typeof showDonorLogin;
  showDonorPasswordReset: typeof showDonorPasswordReset;
  requestDonorPasswordReset: typeof requestDonorPasswordReset;
  confirmDonorPasswordReset: typeof confirmDonorPasswordReset;
};

export type DonorAppBindings = {
  truthyDonor: DonorAppPart1['truthyDonor'];
  donorStore: typeof donorStore;
  DONOR_SHELL_VERSION: typeof DONOR_SHELL_VERSION;
  donorSession: typeof donorSession;
  donorProfile: typeof donorProfile;
  setDonorProfile: typeof setDonorProfile;
  renderActiveCampaigns: typeof renderActiveCampaigns;
  renderNextFeast: typeof renderNextFeast;
  renderActiveFunds: typeof renderActiveFunds;
  readDonorCache: typeof readDonorCache;
  toggleGiftDetailFields: typeof toggleGiftDetailFields;
  writeDonorCache: typeof writeDonorCache;
  donorApi: typeof donorApi;
  selectedPublicParish: typeof selectedPublicParish;
  donorGiftTypeCopy: typeof donorGiftTypeCopy;
  donorGiftAmountEdited: boolean;
  normalizeDonorGiftType: typeof normalizeDonorGiftType;
  activeParishFeastCampaigns: typeof activeParishFeastCampaigns;
  activeParishCampaigns: typeof activeParishCampaigns;
  escapeHtml: typeof escapeHtml;
  money: typeof money;
  donorGiftUrl: typeof donorGiftUrl;
  parishHasGivingPlus: typeof parishHasGivingPlus;
  isGeneralDonorFund: typeof isGeneralDonorFund;
  quickDonorGiftUrl: typeof quickDonorGiftUrl;
  isCandleDonorFund: typeof isCandleDonorFund;
  nextFeastForCalendar: typeof nextFeastForCalendar;
  shortDate: typeof shortDate;
  calendarLabel: typeof calendarLabel;
  setText: typeof setText;
  activeDonorGiftType: typeof activeDonorGiftType;
  updateGivingTierTiles: typeof updateGivingTierTiles;
  isGivingPlusGiftType: typeof isGivingPlusGiftType;
  parishCanUseGiftType: typeof parishCanUseGiftType;
  openGivingPlusPaywall: typeof openGivingPlusPaywall;
  syncDonorCommemorationAmount: typeof syncDonorCommemorationAmount;
  setDonorStatus: typeof setDonorStatus;
  saveDonorSession: typeof saveDonorSession;
  loadDonorDashboardPage: typeof loadDonorDashboardPage;
  loadDonorCommemorationsPage: typeof loadDonorCommemorationsPage;
  donorLoginReturnPath: typeof donorLoginReturnPath;
  clearDonorSession: typeof clearDonorSession;
  isDonorUnauthorized: typeof isDonorUnauthorized;
  setHtml: typeof setHtml;
  donorDisplayName: typeof donorDisplayName;
  renderPledgeTracker: typeof renderPledgeTracker;
  updateQuickGiveLinks: typeof updateQuickGiveLinks;
  setGivingTierTilesLoading: typeof setGivingTierTilesLoading;
  renderHomeParishWidgetsLoading: typeof renderHomeParishWidgetsLoading;
  redirectToMyAgapayLogin: typeof redirectToMyAgapayLogin;
  showGuestDonorDashboard: typeof showGuestDonorDashboard;
  clearDonorCache: typeof clearDonorCache;
  loadPublicParishes: typeof loadPublicParishes;
  commemorationEntriesForDisplay: typeof commemorationEntriesForDisplay;
  fetchPublicParishes: typeof fetchPublicParishes;
  selectedCampaign: typeof selectedCampaign;
  campaignLabel: typeof campaignLabel;
  _nudgeQueue: typeof _nudgeQueue;
  _nudgeCurrent: DonorAppNudge | null | undefined;
};
