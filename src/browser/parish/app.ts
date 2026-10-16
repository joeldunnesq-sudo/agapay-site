import type { ParishAppPart1 } from './app-session-and-navigation.js';
declare const givingCatalogSnapshot: ParishAppPart1['givingCatalogSnapshot'];
declare const accountingCatalogSnapshot: ParishAppPart1['accountingCatalogSnapshot'];
declare const saveSession: ParishAppPart1['saveSession'];
declare const loadRegisteredParishFeature: ParishAppPart1['loadRegisteredParishFeature'];
declare const switchTab: ParishAppPart1['switchTab'];
declare const syncTopbarTabIcon: ParishAppPart1['syncTopbarTabIcon'];
declare const statusLabel: ParishAppPart1['statusLabel'];
declare const initParishPasswordResetPage: ParishAppPart1['initParishPasswordResetPage'];
declare const fallbackFundsArray: ParishAppPart1['fallbackFundsArray'];
declare const fallbackCampaignsArray: ParishAppPart1['fallbackCampaignsArray'];
declare const dedicatedGivingUrl: ParishAppPart1['dedicatedGivingUrl'];
declare const dedicatedGivingEmbedUrl: ParishAppPart1['dedicatedGivingEmbedUrl'];
declare const slugifyLocal: ParishAppPart1['slugifyLocal'];
declare const money: ParishAppPart1['money'];
declare const hasGivingPlusAccess: ParishAppPart1['hasGivingPlusAccess'];
declare const initParishAccessInvitationPage: ParishAppPart1['initParishAccessInvitationPage'];
declare const hasFundManagementAccess: ParishAppPart1['hasFundManagementAccess'];
declare const syncDashboardPaywall: ParishAppPart1['syncDashboardPaywall'];
declare const syncTierRequirementNavigation: ParishAppPart1['syncTierRequirementNavigation'];
declare const syncModuleStatusNavigation: ParishAppPart1['syncModuleStatusNavigation'];
import type { ParishAppPart2 } from './app-subscriptions-and-settlement.js';
declare const updateStarterPaywalls: ParishAppPart2['updateStarterPaywalls'];
declare const moduleIncluded: ParishAppPart2['moduleIncluded'];
declare const accountingStaffSession: ParishAppPart2['accountingStaffSession'];
declare const parishHouseholdPickerMarkup: ParishAppPart2['parishHouseholdPickerMarkup'];
declare const syncParishHouseholdPricing: ParishAppPart2['syncParishHouseholdPricing'];
declare const parishPricingUsageMarkup: ParishAppPart2['parishPricingUsageMarkup'];
declare const subscriptionDemoActive: ParishAppPart2['subscriptionDemoActive'];
declare const subscriptionDemoDateLabel: ParishAppPart2['subscriptionDemoDateLabel'];
declare const tierOptionsMarkup: ParishAppPart2['tierOptionsMarkup'];
declare const subscriptionAddOnPickerMarkup: ParishAppPart2['subscriptionAddOnPickerMarkup'];
declare const syncSubscriptionAddOnVisibility: ParishAppPart2['syncSubscriptionAddOnVisibility'];
declare const selectedSubscriptionAddOns: ParishAppPart2['selectedSubscriptionAddOns'];
declare const communityMarkIcon: ParishAppPart2['communityMarkIcon'];
declare const renderSetupWizard: ParishAppPart2['renderSetupWizard'];
declare const renderSubscriptionPanel: ParishAppPart2['renderSubscriptionPanel'];
declare const updateTierScopedNavigation: ParishAppPart2['updateTierScopedNavigation'];
import type { ParishAppPart3 } from './app-tax-exemption.js';
declare const loadParishTaxExemption: ParishAppPart3['loadParishTaxExemption'];
import type { ParishAppPart4 } from './app-settings-and-nonprofit.js';
declare const formatSacramentPriestsForSettings: ParishAppPart4['formatSacramentPriestsForSettings'];
declare const parseSacramentPriestsFromSettings: ParishAppPart4['parseSacramentPriestsFromSettings'];

import type {
  ParishAppIdentity,
  ParishAppFeatureRequest,
  ParishAppSettlementState,
  ParishAppTruthyFilter,
  ParishAppGivingFeature,
  ParishAppSettingsPayload,
} from './app-contracts.js';
// ── STATE ────────────────────────────────────────────────
window.AgapayMfa?.installFetchStepUp();
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let currentParish: ParishAppIdentity | null = null;
let editableFunds: ParishGivingOption[] = [];
let editableCampaigns: ParishGivingOption[] = [];
let editableFeastCampaigns: ParishGivingOption[] = [];
let givingCatalogBaseline = '';
let accountingCatalogBaseline = '';
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let activeTab = 'giving';
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let dashboardLoadPromise: Promise<unknown> | null = null;
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let activeParishFeatureRequest: ParishAppFeatureRequest | null = null;
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let parishFeatureRequests: ParishAppFeatureRequest[] = [];
const parishSessionStorageKey = 'agapay_parish_session_token';
const legacyParishTokenStorageKey = 'agapay_parish_token';
const identitySessionStorageKey = 'agapay_identity_session_token';
const identityEmailStorageKey = 'agapay_identity_email';

// ── SESSION PERSISTENCE ──────────────────────────────────
(function restoreSession() {
  try {
    const isDashboardPage = Boolean(document.getElementById('setupWizardPane'));
    const id = sessionStorage.getItem('agapay_parish_id');
    const token = sessionStorage.getItem(parishSessionStorageKey);
    const parishIdField = document.getElementById('parishId') as HTMLInputElement | null;
    const parishTokenField = document.getElementById('parishToken') as HTMLInputElement | null;
    const urlParish = new URLSearchParams(window.location.search).get('parish');
    sessionStorage.removeItem(legacyParishTokenStorageKey);
    if (isDashboardPage && (!id || !token)) {
      const suffix = urlParish || id;
      window.location.replace('/give/login' + (suffix ? `?parish=${encodeURIComponent(suffix)}` : ''));
      return;
    }
    if (id && parishIdField) parishIdField.value = id;
    if (token && parishTokenField) parishTokenField.value = token;
    if (id && token && isDashboardPage) {
      // Auto-load after a short delay so the page settles
      setTimeout(() => {
        const btn = document.getElementById('loadBtn');
        loadDashboard(btn as HTMLButtonElement | null);
      }, 120);
    }
  } catch {}
})();

// ── TOAST ────────────────────────────────────────────────
function setStatus(message: string, tone: string = '') {
  if (!message) return;
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = tone ? `toast ${tone}` : 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

window.addEventListener('offline', () => {
  if (activeTab === 'accounting')
    setStatus('Connection lost. Your open Accounting form is still here; reconnect before submitting again.', 'error');
});
window.addEventListener('online', () => {
  if (activeTab === 'accounting') setStatus('Connection restored. Review the open form, then retry once.', 'success');
});
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (activeTab === 'accounting')
    setStatus('AGAPAY was updated safely. Your open Accounting form was preserved.', 'success');
});

// ── AUTH ─────────────────────────────────────────────────
function authHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: 'Bearer ' + (document.getElementById('parishToken') as HTMLInputElement | null)!.value.trim(),
  };
  const accountingSession = accountingStaffSession();
  if (accountingSession?.profile?.id && accountingSession?.token) {
    headers['X-AGAPAY-Accounting-Profile'] = accountingSession.profile.id;
    headers['X-AGAPAY-Accounting-Token'] = accountingSession.token;
  }
  return headers;
}
function escapeHtml(v: unknown) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(v: unknown) {
  return escapeHtml(v).replace(/'/g, '&#39;');
}

const starterLockedFeatures: Record<string, string[]> = {
  options: [
    'Custom funds & alms',
    'Create and name custom funds, organize designated giving, and manage standing alms with Give +.',
  ],
  campaigns: ['Campaign pages', 'Create goal-based, shareable campaigns with Give +.'],
  givers: ['Giver insights', 'See donor-level history and deeper giving reports with Give +.'],
  reconcile: ['Monthly reconciliation', 'Understand Stripe payouts and fund allocations on every plan.'],
  commemorations: [
    'Commemorations',
    'Give includes candle giving. Liturgical commemorations, Moliebens, Panikhidas, and the priest queue are included with Give +.',
  ],
  statements: ['Annual giving statements', 'Generate and email annual donor statements with Give +.'],
  stewardship: [
    'Stewardship Health',
    'Track pledges, understand giving health, prepare stewardship reports, and keep annual records with Give +.',
  ],
  bookstore: [
    'Parish Commerce',
    'Manage bookstore sales now and add more parish commerce products as they become available with Give +; Events and Meals require Full Commerce or Parish.',
  ],
  sacraments: [
    'Sacraments & Services',
    'Receive pastoral requests, coordinate clergy schedules, and keep families informed with the Parish tier.',
  ],
  text: [
    'Text-to-Give',
    'Reserve parish keywords and route donors from the shared AGAPAY number to the right giving page with the Parish tier.',
  ],
  accounting: [
    'Parish Accounting',
    'Keep funds, ledgers, payables, budgets, reconciliation, and financial reports together with the Parish tier.',
  ],
  directory: [
    'Parish Directory',
    'Manage member and household records, privacy controls, namedays, ministries, and parish connections with the Parish tier.',
  ],
};
// eslint-disable-next-line prefer-const -- Mutable classic binding is assigned by the composed controller helpers.
let settlementProfilesState: ParishAppSettlementState = {
  loaded: false,
  loading: false,
  profiles: [],
  profileTypes: [],
  stewardshipActive: false,
};
const SETTLEMENT_MODULE_LABELS: Record<string, string> = {
  giving: 'Giving (donations)',
  bookstore: 'Bookstore Payments',
  events: 'Meals & Events',
};
const SETTLEMENT_TYPE_LABELS: Record<string, string> = {
  general_giving: 'General Giving',
  liturgical: 'Liturgical',
  bookstore: 'Bookstore',
  festival: 'Festival',
  school: 'School',
  cemetery: 'Cemetery',
  camp: 'Camp',
  hall_rental: 'Hall Rental',
  fundraisers: 'Fundraisers',
};

// ── SALES-TAX EXEMPTION ───────────────────────────────────
const taxExemptionJurisdictions = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'FEDERAL',
  'OTHER',
];

// ── RENDER DASHBOARD ──────────────────────────────────────
function renderDashboard() {
  const p = currentParish!;
  updateTierScopedNavigation();
  renderSubscriptionPanel();
  document.getElementById('sidebarProfile')!.classList.add('visible');
  document.getElementById('sidebarParishName')!.textContent = p.parishName || 'Parish';
  const sidebarLogo = document.getElementById('sidebarParishLogo') as HTMLImageElement | null;
  if (sidebarLogo) {
    sidebarLogo.hidden = !p.logoUrl;
    sidebarLogo.src = p.logoUrl || '';
    sidebarLogo.alt = p.logoUrl ? `${p.parishName || 'Parish'} logo` : '';
  }
  const parishMeta = [
    p.communityType,
    p.jurisdiction,
    [p.city, p.state].filter(Boolean as unknown as ParishAppTruthyFilter).join(', '),
  ]
    .filter(Boolean as unknown as ParishAppTruthyFilter)
    .join(' / ');
  document.getElementById('sidebarParishMeta')!.textContent = parishMeta;
  const chip = document.getElementById('sidebarStatusChip');
  const tierLabel = String(p.subscriptionTierLabel || p.subscriptionTier || 'Unassigned').trim();
  const tierDisplay = /\btier$/i.test(tierLabel) ? tierLabel : `${tierLabel} tier`;
  chip!.textContent = `${statusLabel(p.givingStatus || 'active')} · ${tierDisplay}`;
  const isOnboardingLive = p.onboarding?.state === 'LIVE';
  chip!.className = `sidebar-status-chip ${p.givingStatus || 'active'}${isOnboardingLive ? ' is-live' : ''}`;
  (window.ParishFeatureRegistry?.get('giving') as ParishAppGivingFeature | null)?.renderOverview();
  (document.getElementById('sidebarPublicLink') as HTMLAnchorElement | null)!.href = dedicatedGivingUrl();
  const embedPreviewLink = document.getElementById('givingEmbedPreviewLink') as HTMLAnchorElement | null;
  if (embedPreviewLink) embedPreviewLink.href = dedicatedGivingEmbedUrl();
  document.getElementById('topbarTitle')!.textContent = p.parishName || 'Parish Dashboard';
  syncTopbarTabIcon(activeTab);
  const commIcon = document.getElementById('commemorationCommunityIcon');
  if (commIcon) commIcon.innerHTML = communityMarkIcon(p);
  const overviewEmpty = document.getElementById('overviewEmpty');
  if (overviewEmpty) overviewEmpty.style.display = 'none';
  renderSetupWizard();
  updateStarterPaywalls();

  const billingActive = Boolean((p.setup || {}).billingActive);
  const demoActive = subscriptionDemoActive(p);
  const demoEligible = Boolean(p.subscriptionIntroDemoEligible);
  const demoEndLabel = subscriptionDemoDateLabel(p);
  const canCancelSubscription = Boolean(
    p.stripeSubscriptionId && ['active', 'trialing'].includes(String(p.subscriptionStatus || '').toLowerCase())
  );
  const cancelSubscriptionButton = canCancelSubscription
    ? '<button class="btn btn-danger" onclick="openSubscriptionCancellation(this)">Cancel AGAPAY Give</button>'
    : '';
  const tierOptions = tierOptionsMarkup(p.subscriptionTier);
  document.getElementById('settingsPane')!.innerHTML = `
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Parish logo</label>
          <div class="parish-logo-settings">
            ${
              !hasGivingPlusAccess()
                ? `<div class="parish-logo-preview parish-logo-placeholder">Give +<br>feature</div>
                <div>
                  <p class="section-note">Add your parish logo to the dashboard, public giving pages, campaign pages, and church search with Give +. Any logo previously uploaded is preserved and will reappear if you upgrade.</p>
                  <button class="btn btn-gold" type="button" onclick="switchTab('settings')">Upgrade to Give +</button>
                </div>`
                : p.logoUrl
                  ? `<img class="parish-logo-preview" src="${escapeHtml(p.logoUrl)}" alt="${escapeHtml((p.parishName || 'Parish') + ' logo')}" />`
                  : '<div class="parish-logo-preview parish-logo-placeholder">No logo<br>uploaded</div>'
            }
            ${
              hasGivingPlusAccess()
                ? `<div>
              <div class="parish-logo-actions">
                <input id="parishLogoFile" type="file" accept="image/png,image/jpeg,image/webp" />
                <button class="btn btn-gold" type="button" onclick="uploadParishLogo(this)">Upload logo</button>
                ${p.logoUrl ? '<button class="btn btn-ghost" type="button" onclick="removeParishLogo(this)">Remove</button>' : ''}
              </div>
              <p class="section-note">PNG, JPG, or WebP, up to 5MB. A square image with a transparent or white background works best. Your logo appears on the dashboard, giving pages, campaigns, and church search.</p>
            </div>`
                : ''
            }
          </div>
        </div>
        <div class="form-group full"><label class="form-label" for="parishName">Parish name</label><input id="parishName" value="${escapeHtml(p.parishName || '')}" placeholder="Parish name" /></div>
        <div class="form-group"><label class="form-label">Jurisdiction</label><input value="${escapeHtml(p.jurisdiction || '')}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="addressLine1">Address line 1</label><input id="addressLine1" value="${escapeHtml(p.addressLine1 || '')}" placeholder="Street address" /></div>
        <div class="form-group full"><label class="form-label" for="addressLine2">Address line 2</label><input id="addressLine2" value="${escapeHtml(p.addressLine2 || '')}" placeholder="Suite, unit, building (optional)" /></div>
        <div class="form-group"><label class="form-label" for="city">City</label><input id="city" value="${escapeHtml(p.city || '')}" placeholder="City" /></div>
        <div class="form-group"><label class="form-label" for="state">State</label><input id="state" value="${escapeHtml(p.state || '')}" placeholder="State" /></div>
        <div class="form-group"><label class="form-label" for="postalCode">Postal code</label><input id="postalCode" value="${escapeHtml(p.postalCode || '')}" placeholder="ZIP / postal code" /></div>
        <div class="form-group"><label class="form-label" for="country">Country</label><input id="country" value="${escapeHtml(p.country || 'US')}" placeholder="Country code" /></div>
        <div class="form-group full"><label class="form-label" for="website">Website</label><input id="website" value="${escapeHtml(p.website || '')}" placeholder="https://example.org" /></div>
        <div class="form-group full"><label class="form-label" for="taxLegalName">Legal name for tax receipts</label><input id="taxLegalName" value="${escapeHtml(p.taxLegalName || '')}" placeholder="Defaults to parish name if left blank" /></div>
        <div class="form-group"><label class="form-label" for="taxEin">Federal EIN</label><input id="taxEin" value="${escapeHtml(p.taxEin || '')}" placeholder="##-#######" /></div>
        <div class="form-group full"><label class="form-label" for="settingsLiturgicalCalendar">Liturgical calendar</label><select id="settingsLiturgicalCalendar"><option value="julian" ${(p.liturgicalCalendar || 'julian') === 'julian' ? 'selected' : ''}>Julian</option><option value="gregorian" ${p.liturgicalCalendar === 'gregorian' ? 'selected' : ''}>Revised-Julian</option></select></div>
        <div class="form-group full">
          <label class="form-label" for="patronalFeastName">Patronal saint or feast</label>
          <input id="patronalFeastName" list="patronalFeastSuggestions" value="${escapeHtml(patronalFeastDisplayName(p))}" placeholder="e.g. St. Nicholas the Wonderworker" onchange="syncPatronalFeastOptionsFromSettings()" />
          <datalist id="patronalFeastSuggestions">${allFeastPresets()
            .map((feast) => `<option value="${escapeHtml(feast.name)}"></option>`)
            .join('')}</datalist>
          <p class="section-note">Begin typing or enter any Orthodox saint or feast. The suggestions are conveniences, not the complete Church calendar.</p>
        </div>
        ${(() => {
          const observed = patronalMonthDay(p.patronalFeastDate);
          return `
        <div class="form-group">
          <label class="form-label" for="patronalFeastMonth">Observed feast month</label>
          <select id="patronalFeastMonth" onchange="updatePatronalFeastDays()">
            <option value="">Select month...</option>
            ${patronalMonthOptions(observed.month)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="patronalFeastDay">Observed feast day</label>
          <select id="patronalFeastDay">
            <option value="">Select day...</option>
            ${patronalDayOptions(observed.month, observed.day)}
          </select>
          <p class="section-note">The patronal feast recurs annually, so no year is needed.</p>
        </div>
        `;
        })()}
        <div class="form-group"><label class="form-label" for="givingStatus">Giving page status</label><select id="givingStatus"><option value="active" ${p.givingStatus === 'active' ? 'selected' : ''} ${p.onboarding?.enabled && p.onboarding?.state !== 'LIVE' ? 'disabled' : ''}>Active${p.onboarding?.enabled && p.onboarding?.state !== 'LIVE' ? ' — requires treasurer signoff' : ''}</option><option value="paused" ${p.givingStatus === 'paused' ? 'selected' : ''}>Paused</option><option value="hidden" ${p.givingStatus === 'hidden' ? 'selected' : ''}>Hidden</option></select>${p.onboarding?.enabled && p.onboarding?.state !== 'LIVE' ? '<p class="section-note">AGAPAY activates the page automatically when the treasurer completes Go Live.</p>' : ''}</div>
        <div class="form-group"><label class="form-label">Stripe onboarding</label><input value="${escapeHtml(p.stripeAccountStatus || 'not_started')}" disabled /></div>
      </div>
      <p class="section-note">Changes here affect the parish's public giving page and visibility in the AGAPAY directory. Legal name and EIN are used on annual donor giving statements (Givers tab).</p>
      <div class="section-divider"><span>Dashboard password</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label" for="newDashboardPassword">New password</label><input id="newDashboardPassword" type="password" placeholder="At least 8 characters" autocomplete="new-password" /></div>
        <div class="form-group"><label class="form-label" for="confirmDashboardPassword">Confirm password</label><input id="confirmDashboardPassword" type="password" placeholder="Re-enter new password" autocomplete="new-password" /></div>
      </div>
      <p class="section-note">Leave blank unless you want to change the parish dashboard password.</p>
      <div class="section-divider"><span>Team access</span></div>
      <div id="parishStaffAccessManager"><div class="staff-access-loading">Loading staff access…</div></div>
      <div class="section-divider"><span>Clergy scheduling contacts</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Priest access</label><input value="${escapeHtml(p.priestEmail || 'Not listed')}" disabled /></div>
        <div class="form-group"><label class="form-label">Treasurer access</label><input value="${escapeHtml(p.treasurerEmail || 'Not listed')}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="sacramentPriestsText">Sacraments &amp; Services priests</label><textarea id="sacramentPriestsText" rows="4" placeholder="Fr. Michael | fr.michael@example.org&#10;Fr. Andrew | fr.andrew@example.org">${escapeHtml(formatSacramentPriestsForSettings(p.sacramentPriests || []))}</textarea></div>
      </div>
      <p class="section-note">These addresses route Sacraments &amp; Services assignments and notifications; they do not create logins. Add personal access above for every person who signs in.</p>
      <div class="section-divider"><span>AGAPAY sales tax</span></div>
      <p class="section-note">A parish's nonprofit status does not automatically make every purchase tax-free. Submit the applicable exemption certificate here; AGAPAY will review it before changing subscription billing in Stripe.</p>
      <div id="taxExemptionPane" class="tax-exemption-pane"><p class="section-note">Loading sales-tax status…</p></div>
      <div class="section-divider"><span>AGAPAY subscription</span></div>
      ${parishPricingUsageMarkup()}
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Current tier</label><input value="${escapeHtml(p.subscriptionTierLabel || p.subscriptionTier || 'Not selected')}" disabled /></div>
        <div class="form-group"><label class="form-label">Billing status</label><input value="${escapeHtml(statusLabel(p.subscriptionStatus || 'not_started'))}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="subscriptionTierUpgrade">Change AGAPAY tier</label><select id="subscriptionTierUpgrade" onchange="syncParishHouseholdPricing('subscriptionTierUpgrade','subscriptionHouseholdBandUpgrade','subscriptionHouseholdBandGroup','subscriptionHouseholdBandPrice');syncSubscriptionAddOnVisibility('subscriptionTierUpgrade','subscriptionAddOnUpgradeGroup')">${tierOptions}</select></div>
        ${parishHouseholdPickerMarkup({ tierSelectId: 'subscriptionTierUpgrade', bandSelectId: 'subscriptionHouseholdBandUpgrade', groupId: 'subscriptionHouseholdBandGroup', summaryId: 'subscriptionHouseholdBandPrice' })}
        ${subscriptionAddOnPickerMarkup({ tierSelectId: 'subscriptionTierUpgrade', groupId: 'subscriptionAddOnUpgradeGroup' })}
      </div>
      <p class="section-note">${p.parishId === 'st-fiacre' ? 'Demo mode: switch tiers instantly to show churches how AGAPAY changes at each level. No Stripe billing is changed.' : demoActive ? `Your free 30-day demo is active${demoEndLabel ? ` through ${escapeHtml(demoEndLabel)}` : ''}. No card is required during the demo. Add billing information in the secure portal only if you want to continue afterward.` : billingActive ? "Choose a tier or individual Give + add-ons here to update the existing AGAPAY subscription. Use Stripe's secure billing portal for payment details or cancellation." : demoEligible ? 'Choose a tier and start the free 30-day demo. No card is required. Give + includes pledges, Stewardship Health, Parish Directory, and Bookstore; Parish includes the complete operations suite.' : 'Choose a tier and complete subscription checkout to reactivate AGAPAY.'}</p>
      <div class="btn-row">
        ${
          p.parishId === 'st-fiacre'
            ? '<button class="btn btn-gold" onclick="changeDemoTier(this)">Apply demo tier</button>'
            : demoActive
              ? '<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, \'subscriptionTierUpgrade\')">Apply demo tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Add billing details</button>' +
                cancelSubscriptionButton
              : billingActive
                ? '<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, \'subscriptionTierUpgrade\')">Apply tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Manage payment details</button>' +
                  cancelSubscriptionButton
                : `<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, 'subscriptionTierUpgrade')">${demoEligible ? 'Start free 30-day demo' : 'Start tier checkout'}</button>`
        }
      </div>
      <div class="setup-link-box" id="subscriptionUpgradeLinkBox"><a id="subscriptionUpgradeLink" href="#" target="_blank" rel="noopener">Open billing checkout</a><p id="subscriptionUpgradeHelp"></p></div>
      <div id="parishBackupCard"></div>
      <div class="section-divider"><span>Stripe account</span></div>
      <p class="section-note">Manage your parish Stripe account — update bank account details, payout schedule, business information, and view your full transaction history directly in Stripe.</p>
      <div class="btn-row">
        ${
          p.stripeAccountId && p.stripeChargesEnabled
            ? `<a class="btn btn-gold" href="https://dashboard.stripe.com" target="_blank" rel="noopener">Manage Stripe account ↗</a>`
            : `<button class="btn btn-ghost" disabled title="Complete Stripe onboarding to access your Stripe account">Stripe account not yet active</button>`
        }
      </div>
      <div class="section-divider"><span>Feature toggles</span></div>
      <div class="toggle-row">
        <label class="check-card"><input id="recurringGivingEnabled" type="checkbox" ${(p.recurringGivingEnabled ?? true) ? 'checked' : ''} /> Recurring giving</label>
        <label class="check-card"><input id="candlesEnabled" type="checkbox" ${(p.candlesEnabled ?? true) ? 'checked' : ''} /> Candles</label>
        <label class="check-card"><input id="commemorationsEnabled" type="checkbox" ${(p.commemorationsEnabled ?? true) ? 'checked' : ''} /> Commemorations</label>
        <label class="check-card" ${moduleIncluded('bookstore') ? '' : 'title="Requires Give + or Parish"'}>
          <input id="bookstoreEnabled" type="checkbox" ${moduleIncluded('bookstore') ? '' : 'disabled'} ${(p.bookstoreEnabled ?? false) ? 'checked' : ''} /> Bookstore Payments
        </label>
      </div>
      ${moduleIncluded('bookstore') ? '' : '<p class="section-note">Bookstore is included in Give +. Full Commerce adds Events and Meals; Parish includes the entire suite.</p>'}
      <div class="btn-row">
        <button class="btn btn-gold" onclick="saveDashboard(this)">Save changes</button>
        ${(p.setup || {}).billingActive ? '<button class="btn btn-primary" onclick="startStripeOnboarding(this)">Start Stripe onboarding</button>' : '<button class="btn btn-ghost" disabled title="Complete AGAPAY billing first">Stripe unlocks after billing</button>'}
        <button class="btn btn-ghost" onclick="loadDashboard()">Discard changes</button>
        <button class="btn btn-ghost" onclick="logoutParish()">Log out</button>
      </div>
      <div class="stripe-link-box" id="stripeLinkBox">
        <a id="stripeOnboardingLink" href="#" target="_blank" rel="noopener">Open Stripe onboarding</a>
        <p>Stripe onboarding links are single-use. If the link expires, return here and create a new one.</p>
      </div>`;
  window.ParishBackup?.mount({
    element: document.getElementById('parishBackupCard')!,
    parishId: p.parishId,
    headers: authHeaders,
  });
  syncParishHouseholdPricing(
    'subscriptionTierUpgrade',
    'subscriptionHouseholdBandUpgrade',
    'subscriptionHouseholdBandGroup',
    'subscriptionHouseholdBandPrice'
  );
  syncSubscriptionAddOnVisibility('subscriptionTierUpgrade', 'subscriptionAddOnUpgradeGroup');
  syncPatronalFeastOptionsFromSettings();
  loadParishTaxExemption();
  loadParishStaffAccess();

  editableFunds = fallbackFundsArray(p.funds);
  editableCampaigns = fallbackCampaignsArray(p.campaigns);
  editableFeastCampaigns = Array.isArray(p.feastCampaigns)
    ? p.feastCampaigns.map((campaign) => ({
        ...campaign,
        destinationFundId: campaign.destinationFundId || 'benevolence-fund',
      }))
    : [];
  if (p.patronalFeast && (p.patronalFeastName || p.parishPatronalFeastName)) {
    upsertPatronalFeastCampaign(
      p.patronalFeast,
      p.liturgicalCalendar || 'julian',
      p.patronalFeastName || (p.parishPatronalFeastName as string),
      p.patronalFeastDate || p.parishPatronalFeastDate || ''
    );
  }
  givingCatalogBaseline = givingCatalogSnapshot();
  accountingCatalogBaseline = accountingCatalogSnapshot();
  if (activeTab === 'options')
    (window.ParishFeatureRegistry?.get('giving') as ParishAppGivingFeature | null)?.renderOptions();
  if (activeTab === 'campaigns') loadRegisteredParishFeature('campaigns');
}

// ── SAVE DASHBOARD ────────────────────────────────────────
function payload() {
  const newPw = (document.getElementById('newDashboardPassword') as HTMLInputElement | null)?.value.trim() || '';
  const conPw = (document.getElementById('confirmDashboardPassword') as HTMLInputElement | null)?.value.trim() || '';
  if (newPw || conPw) {
    if (newPw.length < 8) throw new Error('Password must be at least 8 characters.');
    if (newPw !== conPw) throw new Error('Passwords do not match.');
  }
  const liturgicalCalendar =
    (document.getElementById('feastLiturgicalCalendar') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
      ?.value ||
    (document.getElementById('settingsLiturgicalCalendar') as HTMLSelectElement | null)?.value ||
    currentParish?.liturgicalCalendar ||
    'julian';
  const patronalFeastName =
    (document.getElementById('patronalFeastName') as HTMLInputElement | null)?.value.trim() || '';
  const patronalFeastMonth = Number(
    (document.getElementById('patronalFeastMonth') as HTMLSelectElement | null)?.value || 0
  );
  const patronalFeastDay = Number(
    (document.getElementById('patronalFeastDay') as HTMLSelectElement | null)?.value || 0
  );
  if (patronalFeastName && (!patronalFeastMonth || !patronalFeastDay))
    throw new Error('Select the patronal feast month and day.');
  const patronalFeastDate =
    patronalFeastMonth && patronalFeastDay
      ? `${String(patronalFeastMonth).padStart(2, '0')}-${String(patronalFeastDay).padStart(2, '0')}`
      : '';
  const knownPatronalFeast = allFeastPresets().find((feast) => feast.name === patronalFeastName);
  const patronalFeast = patronalFeastName ? knownPatronalFeast?.id || slugifyLocal(patronalFeastName) : '';
  upsertPatronalFeastCampaign(patronalFeast, liturgicalCalendar, patronalFeastName, patronalFeastDate);
  const body: ParishAppSettingsPayload = {
    parishName: (document.getElementById('parishName') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
      ?.value,
    addressLine1: (document.getElementById('addressLine1') as HTMLInputElement | null)?.value,
    addressLine2: (document.getElementById('addressLine2') as HTMLInputElement | null)?.value,
    city: (document.getElementById('city') as HTMLInputElement | null)?.value,
    state: (document.getElementById('state') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value,
    postalCode: (document.getElementById('postalCode') as HTMLInputElement | null)?.value,
    country: (document.getElementById('country') as HTMLInputElement | null)?.value,
    website: (document.getElementById('website') as HTMLInputElement | null)?.value,
    taxLegalName: (document.getElementById('taxLegalName') as HTMLInputElement | null)?.value,
    taxEin: (document.getElementById('taxEin') as HTMLInputElement | null)?.value,
    liturgicalCalendar,
    patronalFeast,
    patronalFeastName,
    patronalFeastDate,
    givingStatus: (
      document.getElementById('givingStatus') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value,
    recurringGivingEnabled: (document.getElementById('recurringGivingEnabled') as HTMLInputElement | null)?.checked,
    candlesEnabled: (document.getElementById('candlesEnabled') as HTMLInputElement | null)?.checked,
    commemorationsEnabled: (document.getElementById('commemorationsEnabled') as HTMLInputElement | null)?.checked,
    bookstoreEnabled: (document.getElementById('bookstoreEnabled') as HTMLInputElement | null)?.checked,
    sacramentPriests: parseSacramentPriestsFromSettings(),
    ...(hasFundManagementAccess()
      ? {
          funds: editableFunds,
          givingCatalogChanged: givingCatalogSnapshot() !== givingCatalogBaseline,
          accountingCatalogChanged: accountingCatalogSnapshot() !== accountingCatalogBaseline,
          ...(hasGivingPlusAccess()
            ? {
                campaigns: editableCampaigns,
                feastCampaigns: editableFeastCampaigns,
              }
            : {}),
        }
      : {}),
  };
  if (newPw) body.newDashboardPassword = newPw;
  return body;
}

const params = new URLSearchParams(window.location.search);
const parishIdField = document.getElementById('parishId') as HTMLInputElement | null;
if (params.get('parish') && parishIdField) parishIdField.value = params.get('parish')!;
(window.ParishFeatureRegistry?.get('giving') as ParishAppGivingFeature | null)?.init();
if (!initParishAccessInvitationPage()) initParishPasswordResetPage();

export type ParishAppBindings = {
  editableFunds: ParishGivingOption[];
  editableCampaigns: ParishGivingOption[];
  editableFeastCampaigns: ParishGivingOption[];
  parishSessionStorageKey: typeof parishSessionStorageKey;
  legacyParishTokenStorageKey: typeof legacyParishTokenStorageKey;
  identitySessionStorageKey: typeof identitySessionStorageKey;
  identityEmailStorageKey: typeof identityEmailStorageKey;
  setStatus: typeof setStatus;
  activeTab: typeof activeTab;
  currentParish: ParishAppIdentity | null;
  moduleIncluded: typeof moduleIncluded;
  activeParishFeatureRequest: ParishAppFeatureRequest | null;
  authHeaders: typeof authHeaders;
  escapeHtml: typeof escapeHtml;
  parishIdField: typeof parishIdField;
  starterLockedFeatures: Record<string, string[]>;
  hasGivingPlusAccess: typeof hasGivingPlusAccess;
  syncDashboardPaywall: typeof syncDashboardPaywall;
  syncTierRequirementNavigation: typeof syncTierRequirementNavigation;
  hasFundManagementAccess: typeof hasFundManagementAccess;
  syncModuleStatusNavigation: typeof syncModuleStatusNavigation;
  settlementProfilesState: ParishAppSettlementState;
  SETTLEMENT_MODULE_LABELS: Record<string, string>;
  escapeAttr: typeof escapeAttr;
  SETTLEMENT_TYPE_LABELS: Record<string, string>;
  money: typeof money;
  loadRegisteredParishFeature: typeof loadRegisteredParishFeature;
  switchTab: typeof switchTab;
  taxExemptionJurisdictions: typeof taxExemptionJurisdictions;
  payload: typeof payload;
  saveSession: typeof saveSession;
  selectedSubscriptionAddOns: typeof selectedSubscriptionAddOns;
  statusLabel: typeof statusLabel;
};
