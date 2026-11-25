import type { AdminAppPart1 } from './app-session-and-platform.js';
declare const saveAdminSession: AdminAppPart1['saveAdminSession'];
declare const clearAdminSession: AdminAppPart1['clearAdminSession'];
declare const adminActor: AdminAppPart1['adminActor'];
declare const setAdminNotice: AdminAppPart1['setAdminNotice'];
declare const consumeAdminNotice: AdminAppPart1['consumeAdminNotice'];
declare const refreshDataAsOf: AdminAppPart1['refreshDataAsOf'];
declare const isLoginPage: AdminAppPart1['isLoginPage'];
declare const stopAutoRefresh: AdminAppPart1['stopAutoRefresh'];
declare const toggleAutoRefresh: AdminAppPart1['toggleAutoRefresh'];
declare const restoreAdminSession: AdminAppPart1['restoreAdminSession'];
declare const loginFromAdminPage: AdminAppPart1['loginFromAdminPage'];
declare const logoutAdmin: AdminAppPart1['logoutAdmin'];
declare const setPaymentStatus: AdminAppPart1['setPaymentStatus'];
declare const changeAdminPassword: AdminAppPart1['changeAdminPassword'];
declare const nextAction: AdminAppPart1['nextAction'];
declare const renderQueueNext: AdminAppPart1['renderQueueNext'];
declare const renderGrowthBars: AdminAppPart1['renderGrowthBars'];
declare const renderPlatformGrowth: AdminAppPart1['renderPlatformGrowth'];
declare const productCard: AdminAppPart1['productCard'];
declare const renderProductOverview: AdminAppPart1['renderProductOverview'];
declare const revenueProductRows: AdminAppPart1['revenueProductRows'];
declare const renderRevenueCards: AdminAppPart1['renderRevenueCards'];
import type { AdminAppPart2 } from './app-learn-and-support.js';
declare const renderLearnGrowthBars: AdminAppPart2['renderLearnGrowthBars'];
declare const renderLearnScholarships: AdminAppPart2['renderLearnScholarships'];
declare const renderLearnCommunityModeration: AdminAppPart2['renderLearnCommunityModeration'];
declare const renderLearnFeedbackQueue: AdminAppPart2['renderLearnFeedbackQueue'];
declare const renderParishSupportTickets: AdminAppPart2['renderParishSupportTickets'];
declare const loadParishSupportTickets: AdminAppPart2['loadParishSupportTickets'];
declare const updateParishSupportTicket: AdminAppPart2['updateParishSupportTicket'];
declare const renderLearnAdmin: AdminAppPart2['renderLearnAdmin'];
declare const acknowledgeLearnFeedback: AdminAppPart2['acknowledgeLearnFeedback'];
declare const moderateLearnCommunity: AdminAppPart2['moderateLearnCommunity'];
declare const clearLearnCuratedResourceForm: AdminAppPart2['clearLearnCuratedResourceForm'];
declare const editLearnCuratedResource: AdminAppPart2['editLearnCuratedResource'];
declare const createLearnCuratedResource: AdminAppPart2['createLearnCuratedResource'];
declare const loadLearnAdmin: AdminAppPart2['loadLearnAdmin'];
declare const copyLearnText: AdminAppPart2['copyLearnText'];
declare const createLearnScholarship: AdminAppPart2['createLearnScholarship'];
import type { AdminAppPart3 } from './app-parish-tools-and-diagnostics.js';
declare const seedDemoParish: AdminAppPart3['seedDemoParish'];
declare const weeklyCommemorationSummary: AdminAppPart3['weeklyCommemorationSummary'];
declare const runWeeklyCommemorationEmail: AdminAppPart3['runWeeklyCommemorationEmail'];
declare const moneyPlain: AdminAppPart3['moneyPlain'];
declare const weeklyTreasurerSummary: AdminAppPart3['weeklyTreasurerSummary'];
declare const runWeeklyTreasurerEmail: AdminAppPart3['runWeeklyTreasurerEmail'];
declare const loadStewardshipCompStatus: AdminAppPart3['loadStewardshipCompStatus'];
declare const submitStewardshipCompGrant: AdminAppPart3['submitStewardshipCompGrant'];
declare const grantStewardshipComp: AdminAppPart3['grantStewardshipComp'];
declare const grantStewardshipCompFromDetail: AdminAppPart3['grantStewardshipCompFromDetail'];
declare const submitSacramentsEnabled: AdminAppPart3['submitSacramentsEnabled'];
declare const setSacramentsEnabled: AdminAppPart3['setSacramentsEnabled'];
declare const setSacramentsEnabledFromDetail: AdminAppPart3['setSacramentsEnabledFromDetail'];
declare const loadPlatformSummary: AdminAppPart3['loadPlatformSummary'];
declare const diagnosticsBadge: AdminAppPart3['diagnosticsBadge'];
declare const deploymentCheckOk: AdminAppPart3['deploymentCheckOk'];
declare const loadDeploymentDiagnostics: AdminAppPart3['loadDeploymentDiagnostics'];
declare const runEmailDiagnostics: AdminAppPart3['runEmailDiagnostics'];
import type { AdminAppPart4 } from './app-registration-queue.js';
declare const emptyDetailMarkup: AdminAppPart4['emptyDetailMarkup'];
declare const collapseRegistrationDetail: AdminAppPart4['collapseRegistrationDetail'];
declare const setRegistrationAutosaveState: AdminAppPart4['setRegistrationAutosaveState'];
declare const scheduleRegistrationAutosave: AdminAppPart4['scheduleRegistrationAutosave'];
declare const runRegistrationAutosave: AdminAppPart4['runRegistrationAutosave'];
declare const bindRegistrationAutosave: AdminAppPart4['bindRegistrationAutosave'];
declare const upsertRegistrationCache: AdminAppPart4['upsertRegistrationCache'];
declare const loadRegistrations: AdminAppPart4['loadRegistrations'];
declare const renderMetrics: AdminAppPart4['renderMetrics'];
declare const renderOverviewEmailLog: AdminAppPart4['renderOverviewEmailLog'];
declare const loadRecentActivity: AdminAppPart4['loadRecentActivity'];
declare const renderRecentActivity: AdminAppPart4['renderRecentActivity'];
declare const communityTypeOf: AdminAppPart4['communityTypeOf'];
declare const renderCommunitySnapshot: AdminAppPart4['renderCommunitySnapshot'];
declare const renderOnboardingHealth: AdminAppPart4['renderOnboardingHealth'];
declare const parseDateMs: AdminAppPart4['parseDateMs'];
declare const daysSince: AdminAppPart4['daysSince'];
declare const currentWorkflowStep: AdminAppPart4['currentWorkflowStep'];
declare const workflowLastActivityAt: AdminAppPart4['workflowLastActivityAt'];
declare const nextActionPriority: AdminAppPart4['nextActionPriority'];
declare const renderNextActionQueue: AdminAppPart4['renderNextActionQueue'];
declare const renderFilteredList: AdminAppPart4['renderFilteredList'];
declare const renderList: AdminAppPart4['renderList'];
declare const copyText: AdminAppPart4['copyText'];
declare const loadDetail: AdminAppPart4['loadDetail'];
import type { AdminAppPart5 } from './app-registration-details.js';
declare const renderRegistrationGivingSummary: AdminAppPart5['renderRegistrationGivingSummary'];
declare const loadRegistrationGivingSummary: AdminAppPart5['loadRegistrationGivingSummary'];
declare const renderAdminAuditLog: AdminAppPart5['renderAdminAuditLog'];
declare const onboardingStatusOptions: AdminAppPart5['onboardingStatusOptions'];
declare const renderOnboardingManualChecks: AdminAppPart5['renderOnboardingManualChecks'];
declare const renderOnboardingProgress: AdminAppPart5['renderOnboardingProgress'];
declare const onboardingCurrentPhase: AdminAppPart5['onboardingCurrentPhase'];
declare const onboardingPhaseState: AdminAppPart5['onboardingPhaseState'];
declare const activateOnboardingPhase: AdminAppPart5['activateOnboardingPhase'];
declare const onboardingActionTitle: AdminAppPart5['onboardingActionTitle'];
declare const renderOnboardingCommandHeader: AdminAppPart5['renderOnboardingCommandHeader'];
declare const renderOnboardingControls: AdminAppPart5['renderOnboardingControls'];
declare const readOnboardingChecks: AdminAppPart5['readOnboardingChecks'];
import type { AdminAppPart6 } from './app-onboarding-and-review.js';
declare const runOnboardingTestAction: AdminAppPart6['runOnboardingTestAction'];
declare const renderDetail: AdminAppPart6['renderDetail'];
declare const copyRegistrationSummary: AdminAppPart6['copyRegistrationSummary'];
declare const dashboardInviteMessage: AdminAppPart6['dashboardInviteMessage'];
declare const saveReview: AdminAppPart6['saveReview'];
import type { AdminAppPart7 } from './app-subscription-and-navigation.js';
declare const generateDashboardToken: AdminAppPart7['generateDashboardToken'];
declare const sendDashboardInvite: AdminAppPart7['sendDashboardInvite'];
declare const setSubscriptionStatus: AdminAppPart7['setSubscriptionStatus'];
declare const createSubscriptionCheckout: AdminAppPart7['createSubscriptionCheckout'];
declare const refreshStripeStatus: AdminAppPart7['refreshStripeStatus'];
declare const toggleMobileMore: AdminAppPart7['toggleMobileMore'];
declare const switchTab: AdminAppPart8['switchTab'];
import type { AdminAppPart8 } from './app-accounting-and-audit.js';
declare const populateAdminAccountingParishes: AdminAppPart8['populateAdminAccountingParishes'];
declare const loadAdminAccountingTargets: AdminAppPart8['loadAdminAccountingTargets'];
declare const selectedAdminAccountingTarget: AdminAppPart8['selectedAdminAccountingTarget'];
declare const adminAccountingParish: AdminAppPart8['adminAccountingParish'];
declare const adminAccountingFetch: AdminAppPart8['adminAccountingFetch'];
declare const activateAdminPreparedAccounting: AdminAppPart8['activateAdminPreparedAccounting'];
declare const loadAdminAccountingOperations: AdminAppPart8['loadAdminAccountingOperations'];
declare const renderAdminAccountingHealth: AdminAppPart8['renderAdminAccountingHealth'];
declare const renderAdminIntegrityScans: AdminAppPart8['renderAdminIntegrityScans'];
declare const renderAdminRecoveryVerifications: AdminAppPart8['renderAdminRecoveryVerifications'];
declare const runAdminIntegrityScan: AdminAppPart8['runAdminIntegrityScan'];
declare const changeAdminProtectiveState: AdminAppPart8['changeAdminProtectiveState'];
declare const verifyAdminRecoveryEvidence: AdminAppPart8['verifyAdminRecoveryEvidence'];
declare const loadAdminNonprofitPricing: AdminAppPart8['loadAdminNonprofitPricing'];
declare const calculateNonprofitProjection: AdminAppPart8['calculateNonprofitProjection'];
declare const runNonprofitPricingAlerts: AdminAppPart8['runNonprofitPricingAlerts'];
declare const auditActionLabel: AdminAppPart8['auditActionLabel'];
declare const auditActorTypeLabel: AdminAppPart8['auditActorTypeLabel'];
declare const auditTargetTypeLabel: AdminAppPart8['auditTargetTypeLabel'];
declare const populateAuditLogFilterOptions: AdminAppPart8['populateAuditLogFilterOptions'];
declare const refreshAuditLogOrgOptions: AdminAppPart8['refreshAuditLogOrgOptions'];
declare const setAuditLogQuickRange: AdminAppPart8['setAuditLogQuickRange'];
declare const resetAuditLogFilters: AdminAppPart8['resetAuditLogFilters'];
declare const auditActionBadgeClass: AdminAppPart8['auditActionBadgeClass'];
declare const renderAuditLogTable: AdminAppPart8['renderAuditLogTable'];
declare const loadAuditLog: AdminAppPart8['loadAuditLog'];
import type { AdminAppPart9 } from './app-bulk-and-history.js';
declare const updateBulkBar: AdminAppPart9['updateBulkBar'];
declare const toggleSelectAll: AdminAppPart9['toggleSelectAll'];
declare const clearSelection: AdminAppPart9['clearSelection'];
declare const renderBulkResults: AdminAppPart9['renderBulkResults'];
declare const bulkAction: AdminAppPart9['bulkAction'];
declare const renderEmailLog: AdminAppPart9['renderEmailLog'];
declare const renderNotesHistory: AdminAppPart9['renderNotesHistory'];
import type {
  AdminAppRegistration,
  AdminAppPayload,
  AdminAppSummary,
  AdminAppAccountingHealth,
} from './app-contracts.js';
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let selectedReference = '';
window.AgapayMfa?.installFetchStepUp();
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let registrationsCache: AdminAppRegistration[] = [];
const adminSessionKey = 'agapay_admin_token';
const adminActorKey = 'agapay_admin_actor';
const adminNoticeKey = 'agapay_admin_notice';
const autoRefreshKey = 'agapay_admin_auto_refresh';
const givingSummaryCache = new Map<string, AdminAppSummary>();
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let isLoadingRegistrations = false;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let registrationAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let registrationAutosaveInFlight = false;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let registrationAutosaveQueued = false;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let registrationAutosavePromise: Promise<unknown> | null = null;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let lastDataLoadedAt: Date | null = null;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let latestPlatformSummary: AdminAppSummary | null = null;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let latestLearnAdmin: AdminAppPayload | null = null;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let adminAccountingHealth: AdminAppAccountingHealth | null = null;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let adminAccountingTargets: AdminAppRegistration[] = [];
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let adminAccountingTargetsLoaded = false;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let adminAccountingEnvironment = '';

function token() {
  return (
    (document.getElementById('adminToken') as HTMLInputElement | null)?.value.trim() ||
    sessionStorage.getItem(adminSessionKey) ||
    ''
  );
}

function handleAuthFailure(response: Response, payload: AdminAppPayload) {
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

// --- REBUILT SET STATUS FOR FLOATING TOASTS ---
function setStatus(message: string | undefined, tone: string = '') {
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

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Accept: 'application/json',
    Authorization: 'Bearer ' + token(),
    ...extra,
  };
}

const onboardingManualFields = [
  [
    'authorizedRepresentative',
    'Priest confirms treasurer access',
    "Do not search for a public treasurer listing. Verify the parish and priest from an official source, then have that verified priest or parish leader confirm the treasurer's name and email.",
    'Confirmation source',
    'Priest email, call to published parish number, or diocesan introduction',
    'Confirmation note',
    'Who confirmed the treasurer, by what channel, and when?',
  ],
  ['givingConfiguration', 'Funds and campaigns', 'Confirm the donor-facing catalog and restrictions.'],
  ['importDecision', 'Donor and pledge import', 'Choose Passed when reconciled, or Not applicable.'],
];

const onboardingPhases = [
  ['identity', 'Verify parish'],
  ['access', 'Give access'],
  ['stripe', 'Connect Stripe'],
  ['subscription', 'Configure giving'],
];

// ── TAB NAVIGATION ────────────────────────────────────────────────────
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let activeTab = 'overview';

// ── AUDIT LOG (Phase 6) ──────────────────────────────────────────────
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let auditLogLoadedOnce = false;
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let auditLogCursor = '';
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let auditLogOptionsPopulated = false;

// Every `action` value that recordAuditEvent() is actually called with
// anywhere in the codebase, grouped by the area of the app that writes
// it. Kept here (not fetched from the server) so the dropdown/legend
// work even before any matching event exists yet. If you add a new
// recordAuditEvent() call site with a new action string, add it here too
// so it shows up as a real filter option instead of only reachable by
// typing the raw string.
const AUDIT_ACTION_CATALOG = [
  {
    group: 'Nonprofit Pricing',
    value: 'nonprofit_pricing.alert_check_run',
    label: 'Threshold alert check run',
    description: 'An admin manually ran the site-wide nonprofit-pricing threshold notification check.',
  },
  {
    group: 'Registrations',
    value: 'registration.status_changed',
    label: 'Registration status changed',
    description: "An admin moved a parish's registration through the verification pipeline (e.g. pending → verified).",
  },
  {
    group: 'Registrations',
    value: 'admin.index_rebuild',
    label: 'Registration index rebuilt',
    description: 'An admin manually rebuilt the parish-ID lookup index — a bulk operation, not tied to one parish.',
  },

  {
    group: 'Revenue Streams',
    value: 'settlement_profile.renamed',
    label: 'Revenue stream renamed',
    description: 'A settlement profile (how giving/bookstore money gets routed to a bank account) was renamed.',
  },
  {
    group: 'Revenue Streams',
    value: 'settlement_profile.active_changed',
    label: 'Revenue stream activated/deactivated',
    description: 'A settlement profile was turned on or off.',
  },
  {
    group: 'Revenue Streams',
    value: 'settlement_profile.default_giving_changed',
    label: 'Default giving stream changed',
    description: "A parish's default revenue stream for donations was changed.",
  },
  {
    group: 'Revenue Streams',
    value: 'settlement_profile.default_commerce_changed',
    label: 'Default bookstore stream changed',
    description: "A parish's default revenue stream for bookstore sales was changed.",
  },
  {
    group: 'Revenue Streams',
    value: 'settlement_profile.module_assigned',
    label: 'Module routed to a revenue stream',
    description: 'Giving or Bookstore was explicitly pointed at a specific revenue stream/Stripe account.',
  },

  {
    group: 'Sales-Tax Exemptions',
    value: 'claim_created',
    label: 'Exemption claim submitted',
    description: 'A parish submitted a new sales-tax exemption claim.',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'document_viewed',
    label: 'Exemption certificate viewed',
    description: 'An admin opened an uploaded exemption certificate/document.',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'admin_note_added',
    label: 'Internal note added',
    description: 'An admin added a private review note to an exemption claim (never shown to the parish).',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'approved',
    label: 'Exemption claim approved',
    description: "An admin approved a parish's exemption claim.",
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'rejected',
    label: 'Exemption claim rejected',
    description: "An admin rejected a parish's exemption claim.",
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'replacement_requested',
    label: 'Replacement documentation requested',
    description: 'An admin asked the parish to re-submit their exemption certificate.',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'revoked',
    label: 'Exemption revoked',
    description: 'A previously-approved exemption was revoked.',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'reconciliation_required',
    label: 'Stripe mismatch flagged',
    description:
      "The system found Stripe's exemption state no longer matches AGAPAY's record — needs manual reconciliation.",
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'stripe_sync_attempted',
    label: 'Stripe sync attempted',
    description: 'AGAPAY tried to push the exemption status to a Stripe customer.',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'stripe_sync_succeeded',
    label: 'Stripe sync succeeded',
    description: 'The exemption status was successfully applied in Stripe.',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'stripe_sync_partial',
    label: 'Stripe sync partially succeeded',
    description: 'One of two linked Stripe customers synced; the other still needs attention.',
  },
  {
    group: 'Sales-Tax Exemptions',
    value: 'expiration_processed',
    label: 'Exemption expired/processed',
    description: 'An approved exemption passed its expiration date and was disabled (automatically or by an admin).',
  },
];

const AUDIT_ACTOR_TYPES = [
  { value: 'admin', label: 'Admin', description: 'An AGAPAY staff member, acting from the admin dashboard.' },
  { value: 'parish', label: 'Parish', description: "A parish's own dashboard user (priest or treasurer)." },
  { value: 'donor', label: 'Donor', description: 'A donor, acting from My AGAPAY.' },
  { value: 'system', label: 'System', description: 'Automated — a scheduled job or webhook. No human involved.' },
];

const AUDIT_TARGET_TYPES = [
  { value: 'registration', label: 'Registration', description: "A single parish's registration record." },
  {
    value: 'registrations',
    label: 'Registrations (bulk)',
    description: 'A platform-wide operation affecting the whole registration index, not one parish.',
  },
  {
    value: 'settlement_profile',
    label: 'Revenue stream',
    description: 'A settlement profile — how a parish routes giving/bookstore money to a bank account.',
  },
];

// ── BULK ACTIONS ──────────────────────────────────────────────────────
// eslint-disable-next-line prefer-const -- Preserve the writable classic binding used by composed helpers.
let selectedRefs = new Set();

const adminSearchParams = new URLSearchParams(window.location.search);

const stripeReturnReference = adminSearchParams.get('stripe_return');
if (stripeReturnReference) {
  setStatus(`Stripe onboarding returned for ${stripeReturnReference}. Log in, then refresh Stripe status.`);
}

const subscriptionReturnReference = adminSearchParams.get('subscription_return');
if (subscriptionReturnReference) {
  setStatus(
    `Subscription checkout returned for ${subscriptionReturnReference}. Log in to review the registration. The Stripe webhook will mark it active after payment is confirmed.`
  );
}

restoreAdminSession();

declare const formatClock: AdminPresentationGlobals['formatClock'];
declare const escapeHtml: AdminPresentationGlobals['escapeHtml'];
declare const escapeAttr: AdminPresentationGlobals['escapeAttr'];
declare const jsString: AdminPresentationGlobals['jsString'];
declare const jsAttr: AdminPresentationGlobals['jsAttr'];
declare const field: AdminPresentationGlobals['field'];
declare const readableStripeRequirement: AdminPresentationGlobals['readableStripeRequirement'];
declare const renderStripeRequirements: AdminPresentationGlobals['renderStripeRequirements'];
declare const money: AdminPresentationGlobals['money'];
declare const moneyShort: AdminPresentationGlobals['moneyShort'];
declare const monthLabel: AdminPresentationGlobals['monthLabel'];
declare const readable: AdminPresentationGlobals['readable'];
declare const shortDate: AdminPresentationGlobals['shortDate'];
declare const subscriptionTierLabel: AdminPresentationGlobals['subscriptionTierLabel'];
declare const transactionFeeLabel: AdminPresentationGlobals['transactionFeeLabel'];
declare const jsonForTextarea: AdminPresentationGlobals['jsonForTextarea'];
declare const computeLocalPlatformSummary: AdminPresentationGlobals['computeLocalPlatformSummary'];

export type AdminAppBindings = {
  toggleMobileMore: AdminAppPart7['toggleMobileMore'];
  adminSessionKey: typeof adminSessionKey;
  adminActorKey: typeof adminActorKey;
  adminNoticeKey: typeof adminNoticeKey;
  lastDataLoadedAt: Date | null;
  formatClock: AdminPresentationGlobals['formatClock'];
  autoRefreshTimer: ReturnType<typeof setInterval> | null;
  autoRefreshKey: typeof autoRefreshKey;
  token: typeof token;
  isLoadingRegistrations: boolean;
  loadRegistrations: typeof loadRegistrations;
  activeTab: typeof activeTab;
  setStatus: typeof setStatus;
  switchTab: typeof switchTab;
  authHeaders: typeof authHeaders;
  handleAuthFailure: typeof handleAuthFailure;
  onboardingActionTitle: typeof onboardingActionTitle;
  escapeHtml: AdminPresentationGlobals['escapeHtml'];
  moneyShort: AdminPresentationGlobals['moneyShort'];
  escapeAttr: AdminPresentationGlobals['escapeAttr'];
  latestPlatformSummary: AdminAppSummary | null;
  readable: AdminPresentationGlobals['readable'];
  computeLocalPlatformSummary: AdminPresentationGlobals['computeLocalPlatformSummary'];
  registrationsCache: AdminAppRegistration[];
  latestLearnAdmin: AdminAppPayload | null;
  nextActionPriority: typeof nextActionPriority;
  monthLabel: AdminPresentationGlobals['monthLabel'];
  jsAttr: AdminPresentationGlobals['jsAttr'];
  shortDate: AdminPresentationGlobals['shortDate'];
  renderProductOverview: typeof renderProductOverview;
  field: AdminPresentationGlobals['field'];
  renderPlatformGrowth: typeof renderPlatformGrowth;
  registrationAutosaveTimer: ReturnType<typeof setTimeout> | null;
  registrationAutosaveQueued: boolean;
  selectedReference: typeof selectedReference;
  registrationAutosaveInFlight: boolean;
  registrationAutosavePromise: Promise<unknown> | null;
  saveReview: typeof saveReview;
  sendDashboardInvite: typeof sendDashboardInvite;
  loadAdminAccountingTargets: typeof loadAdminAccountingTargets;
  populateAdminAccountingParishes: typeof populateAdminAccountingParishes;
  loadPlatformSummary: typeof loadPlatformSummary;
  loadLearnAdmin: typeof loadLearnAdmin;
  loadStewardshipCompStatus: typeof loadStewardshipCompStatus;
  loadDeploymentDiagnostics: typeof loadDeploymentDiagnostics;
  refreshDataAsOf: typeof refreshDataAsOf;
  nextAction: typeof nextAction;
  renderDetail: typeof renderDetail;
  renderQueueNext: typeof renderQueueNext;
  loadRegistrationGivingSummary: typeof loadRegistrationGivingSummary;
  givingSummaryCache: typeof givingSummaryCache;
  onboardingManualFields: typeof onboardingManualFields;
  onboardingPhases: typeof onboardingPhases;
  onboardingCurrentPhase: typeof onboardingCurrentPhase;
  renderOnboardingCommandHeader: typeof renderOnboardingCommandHeader;
  renderOnboardingProgress: typeof renderOnboardingProgress;
  subscriptionTierLabel: AdminPresentationGlobals['subscriptionTierLabel'];
  money: AdminPresentationGlobals['money'];
  transactionFeeLabel: AdminPresentationGlobals['transactionFeeLabel'];
  renderStripeRequirements: AdminPresentationGlobals['renderStripeRequirements'];
  renderOnboardingControls: typeof renderOnboardingControls;
  adminActor: typeof adminActor;
  renderOnboardingManualChecks: typeof renderOnboardingManualChecks;
  jsonForTextarea: AdminPresentationGlobals['jsonForTextarea'];
  renderEmailLog: typeof renderEmailLog;
  renderAdminAuditLog: typeof renderAdminAuditLog;
  renderNotesHistory: typeof renderNotesHistory;
  bindRegistrationAutosave: typeof bindRegistrationAutosave;
  setRegistrationAutosaveState: typeof setRegistrationAutosaveState;
  readOnboardingChecks: typeof readOnboardingChecks;
  upsertRegistrationCache: typeof upsertRegistrationCache;
  renderMetrics: typeof renderMetrics;
  renderFilteredList: typeof renderFilteredList;
  activateOnboardingPhase: typeof activateOnboardingPhase;
  loadDetail: typeof loadDetail;
  setPaymentStatus: typeof setPaymentStatus;
  loadParishSupportTickets: typeof loadParishSupportTickets;
  loadAdminAccountingOperations: typeof loadAdminAccountingOperations;
  loadAdminNonprofitPricing: typeof loadAdminNonprofitPricing;
  populateAuditLogFilterOptions: typeof populateAuditLogFilterOptions;
  refreshAuditLogOrgOptions: typeof refreshAuditLogOrgOptions;
  auditLogLoadedOnce: boolean;
  loadAuditLog: typeof loadAuditLog;
  adminAccountingTargetsLoaded: boolean;
  adminAccountingTargets: AdminAppRegistration[];
  adminAccountingEnvironment: typeof adminAccountingEnvironment;
  adminAccountingHealth: AdminAppAccountingHealth | null;
  AUDIT_ACTION_CATALOG: typeof AUDIT_ACTION_CATALOG;
  AUDIT_ACTOR_TYPES: typeof AUDIT_ACTOR_TYPES;
  AUDIT_TARGET_TYPES: typeof AUDIT_TARGET_TYPES;
  auditLogOptionsPopulated: boolean;
  auditLogCursor: typeof auditLogCursor;
  selectedRefs: typeof selectedRefs;
};
