import type {
  ParishAppIdentity,
  ParishAppTier,
  ParishAppPriceBand,
  ParishAppAddOn,
  ParishAppPayload,
  ParishAppOptions,
  ParishAppPicker,
  ParishAppError,
  ParishAppStewardshipFeature,
} from './app-contracts.js';
import type { ParishAppBindings } from './app.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyParishSubscriptions<T>(value: T | null | undefined | false): value is NonNullable<T> {
  return Boolean(value);
}

declare const hasGivingPlusAccess: ParishAppBindings['hasGivingPlusAccess'];
declare const syncDashboardPaywall: ParishAppBindings['syncDashboardPaywall'];
declare const syncTierRequirementNavigation: ParishAppBindings['syncTierRequirementNavigation'];
declare const hasFundManagementAccess: ParishAppBindings['hasFundManagementAccess'];
declare let currentParish: ParishAppBindings['currentParish'];
declare const syncModuleStatusNavigation: ParishAppBindings['syncModuleStatusNavigation'];
declare let settlementProfilesState: ParishAppBindings['settlementProfilesState'];
declare const authHeaders: ParishAppBindings['authHeaders'];
declare const escapeHtml: ParishAppBindings['escapeHtml'];
declare const SETTLEMENT_MODULE_LABELS: ParishAppBindings['SETTLEMENT_MODULE_LABELS'];
declare const escapeAttr: ParishAppBindings['escapeAttr'];
declare const SETTLEMENT_TYPE_LABELS: ParishAppBindings['SETTLEMENT_TYPE_LABELS'];
declare const setStatus: ParishAppBindings['setStatus'];
declare const money: ParishAppBindings['money'];
declare const loadRegisteredParishFeature: ParishAppBindings['loadRegisteredParishFeature'];
declare const switchTab: ParishAppBindings['switchTab'];

function updateStarterPaywalls() {
  const givingPlusLocked = !hasGivingPlusAccess();
  const givingPlusTargets = {
    campaigns: document.getElementById('tab-campaigns'),
    statements: document.getElementById('pdxGsSection'),
  };
  Object.entries(givingPlusTargets).forEach(([key, element]) => {
    syncDashboardPaywall(element, key, 'Give +', givingPlusLocked);
    if (key === 'campaigns') syncTierRequirementNavigation(key, 'Give +', !givingPlusLocked);
  });
  syncDashboardPaywall(document.getElementById('tab-givers'), 'givers', 'Give', false);
  syncTierRequirementNavigation('givers', 'Give', true);
  syncDashboardPaywall(document.getElementById('tab-reconcile'), 'reconcile', 'Give', false);
  syncTierRequirementNavigation('reconcile', 'Give', true);
  const optionsIncluded = hasFundManagementAccess();
  syncDashboardPaywall(document.getElementById('tab-options'), 'options', 'Give +', !optionsIncluded);
  syncTierRequirementNavigation('options', 'Give +', optionsIncluded);

  const stewardshipLocked = !moduleIncluded('stewardshipHealth');
  syncDashboardPaywall(document.getElementById('tab-stewardship'), 'stewardship', 'Give +', stewardshipLocked);
  syncTierRequirementNavigation('stewardship', 'Give +', !stewardshipLocked);
  const bookstoreLocked = !moduleIncluded('bookstore');
  syncDashboardPaywall(document.getElementById('tab-bookstore'), 'bookstore', 'Give +', bookstoreLocked);
  syncTierRequirementNavigation('bookstore', 'Give +', !bookstoreLocked);

  const parishTargets = {
    text: document.getElementById('tab-text'),
  };
  Object.entries(parishTargets).forEach(([key, element]) => {
    const moduleKey = key === 'text' ? 'textToGive' : key;
    const locked = !moduleIncluded(moduleKey);
    syncDashboardPaywall(element, key, 'Parish', locked);
    syncTierRequirementNavigation(key, 'Parish', !locked);
  });
  syncDashboardPaywall(document.getElementById('tab-directory'), 'directory', 'Give +', !moduleIncluded('directory'));
  syncTierRequirementNavigation('directory', 'Give +', moduleIncluded('directory'));
  syncDashboardPaywall(
    document.getElementById('tab-sacraments'),
    'sacraments',
    'Sacraments add-on',
    !moduleIncluded('sacraments')
  );
  syncTierRequirementNavigation('sacraments', 'Sacraments add-on', moduleIncluded('sacraments'));
  syncDashboardPaywall(
    document.getElementById('tab-accounting'),
    'accounting',
    'Accounting add-on',
    !moduleIncluded('accounting')
  );
  syncTierRequirementNavigation('accounting', 'Accounting add-on', moduleIncluded('accounting'));
}

function moduleIncluded(moduleId: string) {
  return Boolean(currentParish?.entitlements?.modules?.[moduleId]?.included);
}

function accountingStaffSessionKey() {
  return `agapay.accountingStaff.${currentParish?.parishId || 'unknown'}`;
}

function accountingStaffSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(accountingStaffSessionKey()) || 'null');
    return value?.expiresAt && Date.parse(value.expiresAt) > Date.now() ? value : null;
  } catch {
    return null;
  }
}

function updateStewardshipBadges(isActive: boolean, options: ParishAppOptions | undefined = {}) {
  (window.ParishFeatureRegistry?.get('stewardship') as ParishAppStewardshipFeature | null)?.renderMeetings(isActive);
  const stewardshipActive = moduleIncluded('stewardshipHealth');
  const bookstoreActive = moduleIncluded('bookstore');
  const sacramentsActive = moduleIncluded('sacraments');
  const parishLifeAvailable = Boolean(currentParish?.parishLifeAvailable);
  const communicationsNav = document.getElementById('nav-communications');
  const mobileCommunicationsNav = document.querySelector<HTMLElement>(
    '.mobile-tab-link[data-nav-tab="communications"]'
  );
  if (communicationsNav) communicationsNav.hidden = !parishLifeAvailable;
  if (mobileCommunicationsNav) mobileCommunicationsNav.hidden = !parishLifeAvailable;
  syncTierRequirementNavigation('stewardship', 'Give +', stewardshipActive);
  const bookstoreBadge = document.getElementById('bookstoreNavBadge');
  const mobileBookstoreBadge = document.getElementById('mobileBookstoreBadge');
  syncTierRequirementNavigation('bookstore', 'Give +', bookstoreActive);
  if (bookstoreBadge) {
    bookstoreBadge.hidden = bookstoreActive;
    bookstoreBadge.textContent = 'Upgrade';
    bookstoreBadge.classList.remove('nav-upgrade-badge--active');
  }
  if (mobileBookstoreBadge) {
    mobileBookstoreBadge.hidden = bookstoreActive;
    mobileBookstoreBadge.textContent = 'Upgrade';
    mobileBookstoreBadge.classList.remove('mobile-upgrade-badge--active');
  }
  syncModuleStatusNavigation('bookstore', bookstoreActive, Boolean(currentParish?.bookstoreEnabled));

  // Entitlement and the parish's donor-facing on/off switch stay separate.
  const sacIsOn = Boolean(currentParish?.sacramentsEnabled);
  const sacBadge = document.getElementById('sacramentsNavBadge');
  syncTierRequirementNavigation('sacraments', 'Sacraments add-on', sacramentsActive);
  if (sacBadge) {
    sacBadge.hidden = sacramentsActive;
    sacBadge.textContent = 'Upgrade';
    sacBadge.classList.remove('nav-upgrade-badge--active');
  }
  syncModuleStatusNavigation('sacraments', sacramentsActive, sacIsOn);
  const libraryIncluded = moduleIncluded('library');
  syncTierRequirementNavigation('library', 'Give +', libraryIncluded);
  syncModuleStatusNavigation(
    'library',
    libraryIncluded && typeof currentParish?.libraryEnabled === 'boolean',
    Boolean(currentParish?.libraryEnabled)
  );
  syncModuleStatusNavigation('directory', moduleIncluded('directory'), Boolean(currentParish?.directoryEnabled));
  syncModuleStatusNavigation(
    'communications',
    moduleIncluded('communications'),
    Boolean(currentParish?.communicationsEnabled)
  );
}

// ── BOOKSTORE ───────────────────────────────────────────────
// Bookstore is available with Stewardship. The broader Commerce overview
// and future product workspaces require the Parish-only commerceSuite
// entitlement.
// Two pieces: what's already in the parish's catalog, and a starter
// list of common items they can check off instead of typing each one
// in by hand. Prices on the starter list are suggestions, not fixed —
// the parish edits them before anything gets added.
function settlementProfilesApi(path: string = '') {
  if (!currentParish?.parishId) throw new Error('Load a parish first.');
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/settlement-profiles' + path;
}

async function loadSettlementProfilesPanel(force: boolean = false) {
  const body = document.getElementById('settlementProfilesBody');
  if (!body || !currentParish) return;
  if (settlementProfilesState.loaded && !force) {
    renderSettlementProfilesPanel();
    return;
  }
  if (settlementProfilesState.loading) return;
  settlementProfilesState.loading = true;
  if (!settlementProfilesState.loaded) body.innerHTML = '<p class="sw-tool-loading">Loading payment routes&hellip;</p>';
  try {
    const res = await fetch(settlementProfilesApi(), { headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to load payment routes.');
    settlementProfilesState.profiles = data.profiles || [];
    settlementProfilesState.profileTypes = data.profileTypes || [];
    settlementProfilesState.stewardshipActive = Boolean(data.stewardshipActive);
    settlementProfilesState.loaded = true;
    renderSettlementProfilesPanel();
  } catch (err) {
    body.innerHTML = `<div class="notice error">${escapeHtml((err as ParishAppError).message)}</div>`;
  } finally {
    settlementProfilesState.loading = false;
  }
}

function renderSettlementProfilesPanel() {
  const body = document.getElementById('settlementProfilesBody');
  if (!body) return;
  const profiles = settlementProfilesState.profiles;

  const rows = profiles
    .map((p) => {
      const badges = [
        p.isDefaultGiving ? '<span class="sp-badge sp-badge--giving">Giving default</span>' : '',
        p.isDefaultCommerce ? '<span class="sp-badge sp-badge--commerce">Bookstore default</span>' : '',
        !p.isActive ? '<span class="sp-badge sp-badge--inactive">Inactive</span>' : '',
      ]
        .filter(truthyParishSubscriptions)
        .join('');
      const moduleLabels = (p.modules || []).map((m) => SETTLEMENT_MODULE_LABELS[m] || m).join(', ');
      return `
        <div class="sp-row${p.isActive ? '' : ' is-inactive'}" data-profile-id="${escapeAttr(p.id)}">
          <div class="sp-row-main">
            <input class="sp-name-input" type="text" value="${escapeAttr(p.name)}" maxlength="80"
              onkeydown="if(event.key==='Enter'){event.target.blur();}"
              onchange="renameSettlementProfile('${escapeAttr(p.id)}', this.value)" />
            <span class="sp-type-pill">${escapeHtml(SETTLEMENT_TYPE_LABELS[p.profileType] || p.profileType)}</span>
            ${badges}
          </div>
          <div class="sp-row-meta">${moduleLabels ? `Used by: ${escapeHtml(moduleLabels)}` : '<em>Not assigned to any module yet</em>'}</div>
          <details class="sp-row-menu"><summary>Manage route</summary><div class="sp-row-actions">
            ${!p.isDefaultGiving ? `<button class="btn btn-ghost btn-sm" type="button" onclick="setDefaultGivingProfile('${escapeAttr(p.id)}')">Use for Giving</button>` : ''}
            ${!p.isDefaultCommerce ? `<button class="btn btn-ghost btn-sm" type="button" onclick="setDefaultCommerceProfile('${escapeAttr(p.id)}')">Use for Bookstore</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" onclick="toggleSettlementProfileActive('${escapeAttr(p.id)}', ${p.isActive ? 'false' : 'true'})">${p.isActive ? 'Deactivate' : 'Activate'}</button>
          </div></details>
        </div>`;
    })
    .join('');

  const activeProfiles = profiles.filter((p) => p.isActive);
  const moduleAssignmentRows = Object.keys(SETTLEMENT_MODULE_LABELS)
    .filter((key) => key !== 'bookstore' || settlementProfilesState.stewardshipActive)
    .map((key) => {
      const current = profiles.find((p) => (p.modules || []).includes(key));
      const options = activeProfiles
        .map(
          (p) =>
            `<option value="${escapeAttr(p.id)}" ${current?.id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
        )
        .join('');
      return `
          <div class="sp-module-row">
            <span class="sp-module-label">${escapeHtml(SETTLEMENT_MODULE_LABELS[key])} activity</span>
            <select class="form-select" onchange="assignSettlementModule('${key}', this.value)">${options}</select>
          </div>`;
    })
    .join('');

  body.innerHTML = `
      <div class="sp-modules">
        <h4 class="sp-subhead">Send each activity to</h4>
        ${moduleAssignmentRows}
      </div>

      <details class="sp-route-list"><summary>${profiles.length} payment route${profiles.length === 1 ? '' : 's'}</summary><div class="sp-list">${rows || '<p class="bk-panel-empty">No payment routes yet.</p>'}</div></details>

      <details class="sp-new-route"><summary>Add another payment route</summary><form class="sp-new-form" onsubmit="createSettlementProfile(event)">
        <div class="sp-new-fields">
          <input class="form-input" id="spNewName" type="text" placeholder="Route name (e.g. Festival payments)" maxlength="80" required />
          <select class="form-select" id="spNewType">
            ${(settlementProfilesState.profileTypes.length ? settlementProfilesState.profileTypes : ['general_giving'])
              .map((t) => `<option value="${escapeAttr(t)}">${escapeHtml(SETTLEMENT_TYPE_LABELS[t] || t)}</option>`)
              .join('')}
          </select>
          <button class="btn btn-primary btn-sm" type="submit">Add route</button>
        </div>
      </form></details>`;
}

async function createSettlementProfile(event: SubmitEvent) {
  event.preventDefault();
  const name = (document.getElementById('spNewName') as HTMLInputElement | null)?.value.trim();
  const profileType = (document.getElementById('spNewType') as HTMLSelectElement | null)?.value;
  if (!name) {
    setStatus('Enter a payment route name.', 'error');
    return;
  }
  try {
    const res = await fetch(settlementProfilesApi(), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, profileType }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to create payment route.');
    setStatus(`"${name}" created.`, 'success');
    await loadSettlementProfilesPanel(true);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  }
}

async function renameSettlementProfile(profileId: string, name: string) {
  const clean = String(name || '').trim();
  if (!clean) {
    setStatus('Payment route name cannot be empty.', 'error');
    await loadSettlementProfilesPanel(true);
    return;
  }
  try {
    const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to rename payment route.');
    setStatus('Payment route renamed.', 'success');
    await loadSettlementProfilesPanel(true);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
    await loadSettlementProfilesPanel(true);
  }
}

async function toggleSettlementProfileActive(profileId: string, makeActive: boolean) {
  try {
    const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: makeActive }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to update payment route.');
    setStatus(makeActive ? 'Payment route activated.' : 'Payment route deactivated.', 'success');
    await loadSettlementProfilesPanel(true);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  }
}

async function setDefaultGivingProfile(profileId: string) {
  try {
    const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/default-giving'), {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to set the Giving payment route.');
    setStatus('Giving payment route updated.', 'success');
    await loadSettlementProfilesPanel(true);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  }
}

async function setDefaultCommerceProfile(profileId: string) {
  try {
    const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/default-commerce'), {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to set the Bookstore payment route.');
    setStatus('Bookstore payment route updated.', 'success');
    await loadSettlementProfilesPanel(true);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  }
}

async function assignSettlementModule(moduleKey: string, profileId: string) {
  if (!profileId) return;
  try {
    const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/assign-module'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleKey }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to assign module.');
    setStatus(`${SETTLEMENT_MODULE_LABELS[moduleKey] || moduleKey} reassigned.`, 'success');
    await loadSettlementProfilesPanel(true);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
    await loadSettlementProfilesPanel(true);
  }
}

function formatSacramentDateRange(startDate: string, endDate: string) {
  const start = formatSacramentDisplayDate(startDate);
  const end = formatSacramentDisplayDate(endDate);
  return !end || startDate === endDate ? start : `${start} – ${end}`;
}

function syncSacramentsBlackoutEndDate() {
  const start = document.getElementById('sacAvailNewBlackoutStartDate');
  const end = document.getElementById('sacAvailNewBlackoutEndDate');
  if (
    start &&
    end &&
    (!(end as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value ||
      (end as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value <
        (start as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value)
  )
    (end as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = (
      start as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    ).value;
  if (start && end)
    (end as HTMLInputElement).min = (start as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

// ── LOAD DASHBOARD ────────────────────────────────────────
// ── SETUP WIZARD ─────────────────────────────────────────
function tierPriceLabel(tier: ParishAppTier | null | undefined) {
  if (!tier) return '';
  if (tier.id === 'parish' && tier.householdPriced) return 'priced by active households';
  if (tier.monthlyCents === null) return 'Custom';
  if (Number(tier.monthlyCents) === 0) return '$0/mo';
  return `${money(tier.monthlyCents)}/mo`;
}

function parishTierDefinition() {
  return (currentParish?.subscriptionTiers || []).find((tier) => tier.id === 'parish') || null;
}

function parishBandPriceCents(band: Partial<ParishAppPriceBand> = {}) {
  return band.standardMonthlyCents;
}

function parishHouseholdBandOptionsMarkup(selectedId: string = '') {
  const bands = parishTierDefinition()?.householdBands || [];
  return `<option value="">Select an active-household range</option>${bands
    .map((band) => {
      const cents = parishBandPriceCents(band);
      const price = cents === null || cents === undefined ? 'Custom pricing' : `${money(cents)}/mo`;
      return `<option value="${escapeHtml(band.id)}" ${band.id === selectedId ? 'selected' : ''}>${escapeHtml(band.label)} — ${escapeHtml(price)}</option>`;
    })
    .join('')}`;
}

function parishHouseholdPickerMarkup({ tierSelectId, bandSelectId, groupId, summaryId }: ParishAppPicker) {
  return `<div class="form-group full parish-household-pricing" id="${groupId}" hidden>
      <label class="form-label" for="${bandSelectId}">Active parish households</label>
      <select id="${bandSelectId}" onchange="syncParishHouseholdPricing('${tierSelectId}','${bandSelectId}','${groupId}','${summaryId}')">${parishHouseholdBandOptionsMarkup(currentParish?.parishHouseholdBand || '')}</select>
      <p class="section-note" id="${summaryId}">Choose a range to calculate the Parish monthly price.</p>
    </div>`;
}

function syncParishHouseholdPricing(tierSelectId: string, bandSelectId: string, groupId: string, summaryId: string) {
  const tier = document.getElementById(tierSelectId);
  const band = document.getElementById(bandSelectId);
  const group = document.getElementById(groupId);
  const summary = document.getElementById(summaryId);
  const isParish = (tier as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value === 'parish';
  if (group) group.hidden = !isParish;
  if (!isParish || !summary) return;
  const selected = (parishTierDefinition()?.householdBands || []).find(
    (item) => item.id === (band as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value
  );
  if (!selected) {
    summary.textContent = 'Choose a range to calculate the Parish monthly price.';
    return;
  }
  const cents = parishBandPriceCents(selected);
  summary.textContent =
    cents === null || cents === undefined
      ? `${selected.label} uses custom Parish pricing. AGAPAY will confirm the amount before billing.`
      : `${selected.label}: ${money(cents)}/month at the flat everyday rate.`;
}

function parishPricingUsageMarkup() {
  const usage = currentParish?.parishPricingUsage;
  if (!usage?.trackingAvailable)
    return '<div class="parish-pricing-usage is-neutral"><strong>Automatic household tracking</strong><span>AGAPAY will count represented households as parishioners link their My AGAPAY accounts.</span></div>';
  const userLabel = `${Number(usage.linkedUsers || 0)} linked user${Number(usage.linkedUsers || 0) === 1 ? '' : 's'}`;
  const householdLabel = `${Number(usage.representedHouseholds || 0)} represented household${Number(usage.representedHouseholds || 0) === 1 ? '' : 's'}`;
  const detail = usage.upgradeRequired
    ? `Your live household count has reached the ${usage.recommendedBandLabel} band. Select that band below to keep Parish pricing current.`
    : usage.nextThreshold === null
      ? 'This is the highest published Parish band; AGAPAY will coordinate custom pricing with your church.'
      : `${Number(usage.remainingUntilNextBand || 0)} more represented household${Number(usage.remainingUntilNextBand || 0) === 1 ? '' : 's'} before the ${usage.nextBandLabel} band.`;
  return `<div class="parish-pricing-usage ${usage.upgradeRequired ? 'needs-upgrade' : 'is-current'}"><strong>${usage.upgradeRequired ? 'Household-band update needed' : 'Household usage is being tracked'}</strong><span>${escapeHtml(userLabel)} across ${escapeHtml(householdLabel)}. ${escapeHtml(detail)}</span></div>`;
}

function subscriptionDemoActive(parish: ParishAppIdentity | null = currentParish) {
  return String(parish?.subscriptionStatus || '').toLowerCase() === 'trialing';
}

function subscriptionDemoEnd(parish: ParishAppIdentity | null = currentParish) {
  const explicit = new Date(parish?.subscriptionTrialEndsAt || '');
  if (!Number.isNaN(explicit.getTime())) return explicit;
  const started = new Date(parish?.subscriptionTrialStartedAt || parish?.subscriptionActivatedAt || '');
  const days = Number(parish?.subscriptionTrialDays || 0);
  if (!Number.isNaN(started.getTime()) && days > 0) return new Date(started.getTime() + days * 86400000);
  return null;
}

function subscriptionDemoDateLabel(parish: ParishAppIdentity | null = currentParish) {
  const end = subscriptionDemoEnd(parish);
  return end ? end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
}

function subscriptionDemoDaysRemaining(parish: ParishAppIdentity | null = currentParish) {
  const end = subscriptionDemoEnd(parish);
  return end
    ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))
    : Number(parish?.subscriptionTrialDays || 30);
}

function tierOptionsMarkup(selectedId: string | undefined) {
  const tiers = currentParish?.subscriptionTiers || [];
  return tiers
    .map(
      (t) =>
        `<option value="${escapeHtml(t.id)}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.label)} - ${escapeHtml(tierPriceLabel(t))}</option>`
    )
    .join('');
}

function subscriptionAddOnPriceCents(addOn: Partial<ParishAppAddOn> = {}) {
  return addOn.standardMonthlyCents;
}

function subscriptionAddOnPickerMarkup({ tierSelectId, groupId }: Pick<ParishAppPicker, 'tierSelectId' | 'groupId'>) {
  const selected = new Set(currentParish?.subscriptionAddOns || []);
  const catalog = currentParish?.subscriptionAddOnCatalog || [];
  return `<div class="form-group full" id="${groupId}" data-tier-select-id="${tierSelectId}" hidden><label class="form-label">Optional Give + add-ons</label><div class="toggle-row">${catalog.map((addOn) => `<label class="check-card"><input type="checkbox" data-subscription-add-on="${escapeHtml(addOn.id)}" ${selected.has(addOn.id) ? 'checked' : ''} onchange="syncSubscriptionAddOnChoice('${groupId}')" /> <span><strong>${escapeHtml(addOn.label)}</strong><small>${escapeHtml(money(subscriptionAddOnPriceCents(addOn)))}/mo${addOn.id === 'accounting' ? ' · includes Full Commerce' : addOn.id === 'full_commerce' ? ' · adds Events & Meals' : ''}</small></span></label>`).join('')}</div><p class="section-note">Give + already includes Koinonia, Parish Library, Directory, and Bookstore. Add Sacraments &amp; Services, Full Commerce, or Accounting Suite individually; included capabilities never stack, and Parish includes every module.</p><p class="section-note" data-subscription-price-summary aria-live="polite"></p></div>`;
}

function syncSubscriptionAddOnVisibility(tierSelectId: string, groupId: string) {
  const group = document.getElementById(groupId);
  if (group)
    group.hidden =
      (document.getElementById(tierSelectId) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value !==
      'giving';
  syncSubscriptionAddOnChoice(groupId);
}

function syncSubscriptionAddOnChoice(groupId: string) {
  const group = document.getElementById(groupId);
  const accounting = group?.querySelector<HTMLElement>('[data-subscription-add-on="accounting"]');
  const fullCommerce = group?.querySelector<HTMLElement>('[data-subscription-add-on="full_commerce"]');
  if (fullCommerce) {
    if ((accounting as HTMLInputElement)?.checked) (fullCommerce as HTMLInputElement).checked = false;
    (fullCommerce as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = Boolean(
      (accounting as HTMLInputElement)?.checked
    );
    fullCommerce
      .closest<HTMLElement>('.check-card')
      ?.classList.toggle('is-disabled', Boolean((accounting as HTMLInputElement)?.checked));
  }
  updateSubscriptionAddOnTotal(groupId);
}

function updateSubscriptionAddOnTotal(groupId: string) {
  const group = document.getElementById(groupId);
  const summary = group?.querySelector<HTMLElement>('[data-subscription-price-summary]');
  const tierId = (
    document.getElementById(group?.dataset.tierSelectId || '') as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  )?.value;
  const tier = (currentParish?.subscriptionTiers || []).find((item) => item.id === tierId);
  if (!summary || tierId !== 'giving' || !tier) return;
  const selected = new Set(selectedSubscriptionAddOns(groupId));
  const addOnCents = (currentParish?.subscriptionAddOnCatalog || [])
    .filter((addOn) => selected.has(addOn.id))
    .reduce((total, addOn) => total + Number(subscriptionAddOnPriceCents(addOn) || 0), 0);
  const totalCents = Number(tier.monthlyCents || 0) + addOnCents;
  summary.innerHTML = `<strong>Estimated monthly subscription: ${escapeHtml(money(totalCents))}/month.</strong> Stripe checkout will show this same recurring total before payment.`;
}

function selectedSubscriptionAddOns(groupId: string) {
  const group = document.getElementById(groupId);
  if (!group || group.hidden) return [];
  return Array.from(group.querySelectorAll<HTMLElement>('[data-subscription-add-on]:checked')).map(
    (input) => input.dataset.subscriptionAddOn
  );
}

function setupCheckMarkup() {
  return '<span class="setup-check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>';
}

function billingStatusDone(status: string) {
  return ['active', 'trialing', 'free_forever'].includes(status);
}

async function refreshSubscriptionStatus(options?: ParishAppOptions | undefined) {
  if (
    !currentParish ||
    !currentParish.parishId ||
    !['checkout_created', 'trial_checkout_created'].includes(currentParish.subscriptionStatus as string)
  )
    return;
  try {
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-refresh',
      { method: 'POST', headers: authHeaders() }
    );
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to refresh billing status');
    if (data.subscriptionStatus) {
      currentParish.subscriptionStatus = data.subscriptionStatus;
      currentParish.stripeSubscriptionId = data.stripeSubscriptionId || currentParish.stripeSubscriptionId || '';
      currentParish.stripeCustomerId = data.stripeCustomerId || currentParish.stripeCustomerId || '';
      currentParish.subscriptionTrialStartedAt =
        data.subscriptionTrialStartedAt || currentParish.subscriptionTrialStartedAt || '';
      currentParish.subscriptionTrialEndsAt =
        data.subscriptionTrialEndsAt || currentParish.subscriptionTrialEndsAt || '';
      currentParish.setup = {
        ...(currentParish.setup || {}),
        billingActive: billingStatusDone(data.subscriptionStatus),
      };
    }
  } catch (err) {
    const message =
      window.AgapayDiagnostics?.report(err, 'billing.refresh') || 'Unable to refresh billing status. Please try again.';
    if (!options || !options.quiet) setStatus(message, 'error');
  }
}

async function refreshStripeStatus(options?: ParishAppOptions | undefined) {
  if (!currentParish || !currentParish.parishId) return;
  const status = currentParish.stripeAccountStatus || '';
  if (!options?.force && ['charges_enabled', 'payouts_enabled'].includes(status)) return;
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-refresh', {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to refresh Stripe status');
    if (data.parish) currentParish = { ...currentParish, ...data.parish };
    if (data.onboarding) currentParish.onboarding = data.onboarding;
    if (options?.force) renderSetupWizard();
    if (options?.force && data.recovered)
      setStatus('Your existing Stripe connection was found and restored.', 'success');
  } catch (err) {
    const message =
      window.AgapayDiagnostics?.report(err, 'stripe.refresh') || 'Unable to refresh Stripe status. Please try again.';
    if (!options || !options.quiet) setStatus(message, 'error');
  }
}

function communityTypeKey(parish: ParishAppIdentity | null) {
  const raw = `${parish?.communityType || ''} ${parish?.parishName || ''}`.toLowerCase();
  if (raw.includes('monastery') || raw.includes('skete')) return 'monastery';
  if (raw.includes('mission')) return 'mission';
  return 'parish';
}

function communityMarkIcon(parish: ParishAppIdentity | null) {
  const type = communityTypeKey(parish);
  if (type === 'monastery')
    return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><rect x="4" y="14" width="30" height="18" rx="1"/><rect x="14" y="6" width="10" height="14" rx="1"/><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M15 32 L15 25 Q19 21 23 25 L23 32"/><rect x="7" y="18" width="5" height="6" rx="2.5"/><rect x="26" y="18" width="5" height="6" rx="2.5"/></svg>';
  if (type === 'mission')
    return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M19 6 C10 10 8 17 11 22 C13 26 16 27 19 27 C22 27 25 26 27 22 C30 17 28 10 19 6Z"/><line x1="12" y1="27" x2="26" y2="27"/><line x1="13" y1="29" x2="25" y2="29"/></svg>';
  return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>';
}

// Preserve the shell entry point while onboarding owns its implementation.
function renderSetupWizard() {
  return loadRegisteredParishFeature('onboarding');
}

// Dashboard-homepage "Your Subscription" panel: current plan, modules
// included (driven by the same entitlements payload the server computes
// in src/lib/entitlements.js), Stripe/billing status, and an upgrade
// nudge when a module isn't included on the parish's current tier.
function renderSubscriptionPanel() {
  const p = currentParish!;
  const body = document.getElementById('pdxSubscriptionBody');
  if (!p || !body) return;
  const ent = p.entitlements || {};
  const modules = ent.modules || {};
  const tierLabel = p.subscriptionTierLabel || 'Parish';
  const demoActive = subscriptionDemoActive(p);
  const demoEndLabel = subscriptionDemoDateLabel(p);
  const demoDays = subscriptionDemoDaysRemaining(p);
  const parishBandMissing = p.subscriptionTier === 'parish' && !p.parishHouseholdBand;
  const standardPriceLabel = parishBandMissing
    ? 'Household band needed'
    : p.subscriptionMonthlyCents === 0
      ? 'Free forever'
      : p.subscriptionMonthlyCents
        ? money(p.subscriptionMonthlyCents) + '/mo'
        : 'Custom pricing';
  const priceLabel = demoActive ? `${demoDays} day${demoDays === 1 ? '' : 's'} remaining` : standardPriceLabel;
  const billingActive = Boolean(p.setup?.billingActive);
  const stripeConnected = Boolean(p.setup?.stripeConnected);
  const pricingUsage = p.parishPricingUsage || {};

  const statusChip = (label: string, active: boolean) =>
    `<span class="pdx-sub-status ${active ? 'is-ready' : 'needs-attention'}"><span aria-hidden="true">${active ? '✓' : '!'}</span>${escapeHtml(label)}</span>`;
  const moduleRow = (label: string, moduleKey: string, description: string, includedTier: string) => {
    const mod = modules[moduleKey] || {};
    const included = Boolean(mod.included);
    const sourceLabel = included ? `Included with ${includedTier}` : 'Upgrade';
    return `<div class="pdx-sub-module ${included ? 'is-included' : 'is-locked'}">
        <span class="pdx-sub-module-mark" aria-hidden="true">${included ? '✓' : '◇'}</span>
        <div class="pdx-sub-module-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div>
        <span class="pdx-sub-module-state">${escapeHtml(sourceLabel)}</span>
      </div>`;
  };

  body.innerHTML = `
      <div class="pdx-sub-plan">
        <div class="pdx-sub-plan-glow" aria-hidden="true"></div>
        <div class="pdx-sub-plan-kicker">${demoActive ? 'Free 30-day demo' : 'Current plan'}</div>
        <div class="pdx-sub-plan-name">${escapeHtml(tierLabel)}</div>
        <div class="pdx-sub-plan-price">${escapeHtml(priceLabel)} <span>${demoActive ? `Then ${escapeHtml(standardPriceLabel)}` : 'Simple monthly subscription'}</span></div>
        <p class="pdx-sub-plan-copy">${demoActive ? `No card is required during your demo${demoEndLabel ? `, which runs through ${escapeHtml(demoEndLabel)}` : ''}. Add billing information before it ends only if you want to continue.` : 'Your plan controls which parish tools are ready now. Giving deposits continue to flow directly through your connected Stripe account.'}</p>
        <div class="pdx-sub-status-row">
          ${statusChip(demoActive ? 'Free demo active' : billingActive ? 'Billing active' : 'Billing not started', billingActive)}
          ${statusChip(stripeConnected ? 'Stripe connected' : 'Stripe not connected', stripeConnected)}
          ${pricingUsage.upgradeRequired ? statusChip('Household band update needed', false) : ''}
        </div>
        <button class="pdx-sub-plan-action" type="button" onclick="switchTab('settings')">${demoActive ? 'Add billing details or manage demo' : ent.parishPlusIncludedInTier ? 'Manage subscription' : 'Explore upgrade options'}<span aria-hidden="true">→</span></button>
      </div>
      <div class="pdx-sub-modules">
        <div class="pdx-sub-modules-head"><div><span>Plan access</span><strong>Included parish tools</strong></div><button type="button" onclick="switchTab('settings')">Compare tiers</button></div>
        <div class="pdx-sub-module-grid">
          ${moduleRow('Give +', 'givingPlus', 'Campaigns, branding, and annual statements', 'Give +')}
          ${moduleRow('Stewardship Health', 'stewardshipHealth', 'Pledges, insights, and stewardship reporting', 'Give +')}
          ${moduleRow('Bookstore', 'bookstore', 'Parish commerce and Stripe-powered sales', 'Give +')}
          ${moduleRow('Parish Directory', 'directory', 'Member, household, and ministry records', 'Give +')}
          ${moduleRow('Sacraments & Services', 'sacraments', 'Pastoral requests and clergy coordination', 'Sacraments add-on')}
          ${moduleRow('Text-to-Give', 'textToGive', 'Keywords that route donors to your giving page', 'Parish')}
        </div>
      </div>`;
}

function updateTierScopedNavigation() {
  const stewardshipIncluded = moduleIncluded('stewardshipHealth');
  const directoryActive = moduleIncluded('directory');
  const accountingIncluded = moduleIncluded('accounting');
  const accountingNav = document.getElementById('nav-accounting');
  const stewardshipNav = document.getElementById('nav-stewardship');
  stewardshipNav?.removeAttribute('hidden');
  syncTierRequirementNavigation('stewardship', 'Give +', stewardshipIncluded);
  if (stewardshipNav) stewardshipNav.title = stewardshipIncluded ? 'Stewardship Health' : 'Requires Give +';
  document.getElementById('nav-directory')?.removeAttribute('hidden');
  document.querySelectorAll<HTMLElement>('.mobile-tab-link[data-nav-tab="directory"]').forEach((el) => {
    el.hidden = false;
  });
  syncTierRequirementNavigation('directory', 'Give +', directoryActive);
  syncTierRequirementNavigation('library', 'Give +', moduleIncluded('library'));
  syncTierRequirementNavigation('accounting', 'Accounting add-on', accountingIncluded);
  syncModuleStatusNavigation('accounting', accountingIncluded, accountingIncluded);
  if (accountingNav)
    accountingNav.title = accountingIncluded ? 'Accounting workspace' : 'Requires Accounting add-on or Parish';
  document.querySelectorAll<HTMLElement>('.mobile-tab-link[data-nav-tab="stewardship"]').forEach((el) => {
    el.hidden = false;
    el.classList.toggle('mobile-tab-link--gated', !stewardshipIncluded);
  });
  orderTierNavigation();
}

function orderTierNavigation() {
  const groups = [
    { id: 'give', label: 'Give', tabs: ['giving', 'history', 'givers', 'reconcile', 'options', 'qr'] },
    {
      id: 'giving-plus',
      label: 'Give +',
      tabs: ['campaigns', 'stewardship', 'directory', 'library', 'communications', 'bookstore'],
    },
    { id: 'parish', label: 'Parish', tabs: ['sacraments', 'accounting', 'text'] },
  ];
  const sidebar = document.querySelector<HTMLElement>('.sidebar-nav');
  const mobile = document.querySelector<HTMLElement>('.mobile-tabbar');
  groups.forEach(({ id, label, tabs }) => {
    const group = document.getElementById(`nav-tier-${id}`);
    if (sidebar && group) sidebar.appendChild(group);
    if (mobile) {
      let heading = mobile.querySelector<HTMLElement>(`[data-tier-heading="${id}"]`);
      if (!heading) {
        heading = document.createElement('span');
        heading.className = 'mobile-tier-heading';
        heading.dataset.tierHeading = id;
        heading.textContent = label;
      }
      mobile.appendChild(heading);
    }
    tabs.forEach((tab) => {
      const item = document.getElementById(`nav-${tab}`);
      if (group && item) group.appendChild(item);
      const mobileItem = document.querySelector<HTMLElement>(`.mobile-tab-link[data-nav-tab="${tab}"]`);
      if (mobile && mobileItem) mobile.appendChild(mobileItem);
    });
  });
  const settings = document.getElementById('nav-settings');
  if (sidebar && settings) sidebar.appendChild(settings);
  const mobileSettings = document.querySelector<HTMLElement>('.mobile-tab-link[data-nav-tab="settings"]');
  if (mobile && mobileSettings) mobile.appendChild(mobileSettings);
}

async function changeDemoTier(btn?: HTMLButtonElement | null) {
  if (currentParish?.parishId !== 'st-fiacre') return;
  const tier = (document.getElementById('subscriptionTierUpgrade') as HTMLSelectElement | null)?.value || '';
  const parishHouseholdBand =
    (
      document.getElementById('subscriptionHouseholdBandUpgrade') as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value || '';
  if (tier === 'parish' && !parishHouseholdBand) {
    setStatus('Choose the parish active-household range first.', 'error');
    return;
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/st-fiacre/demo-tier', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionTier: tier, parishHouseholdBand }),
    });
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to change the demo tier');
    currentParish = { ...currentParish, ...(data.parish || {}) };
    await loadDashboard();
    switchTab('settings');
    setStatus(`St. Fiacre is now demonstrating the ${data.parish?.subscriptionTierLabel || tier} tier.`, 'success');
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function openSubscriptionPortal(btn?: HTMLButtonElement | null) {
  if (!currentParish) return;
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    await refreshSubscriptionStatus({ quiet: true });
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-portal',
      { method: 'POST', headers: authHeaders() }
    );
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to open subscription management');
    if (win) win.location.href = data.portalUrl!;
    setStatus(
      win ? 'Subscription management opened in a new tab.' : 'Subscription management link created.',
      'success'
    );
  } catch (err) {
    if (win) win.close();
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function openSubscriptionCancellation(btn?: HTMLButtonElement | null) {
  if (!currentParish) return;
  if (
    !window.confirm(
      'Cancel AGAPAY Give? Stripe will show the cancellation date and ask you to confirm before anything changes.'
    )
  )
    return;
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    await refreshSubscriptionStatus({ quiet: true });
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-portal',
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cancel' }),
      }
    );
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to open subscription cancellation');
    if (win) win.location.href = data.portalUrl!;
    setStatus(
      win
        ? 'Subscription cancellation opened in a new tab. Confirm the change in Stripe.'
        : 'Subscription cancellation link created.',
      'success'
    );
  } catch (err) {
    if (win) win.close();
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
export type ParishAppPart2 = {
  updateStarterPaywalls: typeof updateStarterPaywalls;
  moduleIncluded: typeof moduleIncluded;
  accountingStaffSessionKey: typeof accountingStaffSessionKey;
  accountingStaffSession: typeof accountingStaffSession;
  updateStewardshipBadges: typeof updateStewardshipBadges;
  settlementProfilesApi: typeof settlementProfilesApi;
  loadSettlementProfilesPanel: typeof loadSettlementProfilesPanel;
  renderSettlementProfilesPanel: typeof renderSettlementProfilesPanel;
  createSettlementProfile: typeof createSettlementProfile;
  renameSettlementProfile: typeof renameSettlementProfile;
  toggleSettlementProfileActive: typeof toggleSettlementProfileActive;
  setDefaultGivingProfile: typeof setDefaultGivingProfile;
  setDefaultCommerceProfile: typeof setDefaultCommerceProfile;
  assignSettlementModule: typeof assignSettlementModule;
  formatSacramentDateRange: typeof formatSacramentDateRange;
  syncSacramentsBlackoutEndDate: typeof syncSacramentsBlackoutEndDate;
  tierPriceLabel: typeof tierPriceLabel;
  parishTierDefinition: typeof parishTierDefinition;
  parishBandPriceCents: typeof parishBandPriceCents;
  parishHouseholdBandOptionsMarkup: typeof parishHouseholdBandOptionsMarkup;
  parishHouseholdPickerMarkup: typeof parishHouseholdPickerMarkup;
  syncParishHouseholdPricing: typeof syncParishHouseholdPricing;
  parishPricingUsageMarkup: typeof parishPricingUsageMarkup;
  subscriptionDemoActive: typeof subscriptionDemoActive;
  subscriptionDemoEnd: typeof subscriptionDemoEnd;
  subscriptionDemoDateLabel: typeof subscriptionDemoDateLabel;
  subscriptionDemoDaysRemaining: typeof subscriptionDemoDaysRemaining;
  tierOptionsMarkup: typeof tierOptionsMarkup;
  subscriptionAddOnPriceCents: typeof subscriptionAddOnPriceCents;
  subscriptionAddOnPickerMarkup: typeof subscriptionAddOnPickerMarkup;
  syncSubscriptionAddOnVisibility: typeof syncSubscriptionAddOnVisibility;
  syncSubscriptionAddOnChoice: typeof syncSubscriptionAddOnChoice;
  updateSubscriptionAddOnTotal: typeof updateSubscriptionAddOnTotal;
  selectedSubscriptionAddOns: typeof selectedSubscriptionAddOns;
  setupCheckMarkup: typeof setupCheckMarkup;
  billingStatusDone: typeof billingStatusDone;
  refreshSubscriptionStatus: typeof refreshSubscriptionStatus;
  refreshStripeStatus: typeof refreshStripeStatus;
  communityTypeKey: typeof communityTypeKey;
  communityMarkIcon: typeof communityMarkIcon;
  renderSetupWizard: typeof renderSetupWizard;
  renderSubscriptionPanel: typeof renderSubscriptionPanel;
  updateTierScopedNavigation: typeof updateTierScopedNavigation;
  orderTierNavigation: typeof orderTierNavigation;
  changeDemoTier: typeof changeDemoTier;
  openSubscriptionPortal: typeof openSubscriptionPortal;
  openSubscriptionCancellation: typeof openSubscriptionCancellation;
};
