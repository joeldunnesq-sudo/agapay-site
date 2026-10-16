import type {
  ParishAppPriest,
  ParishAppVolume,
  ParishAppPayload,
  ParishAppTruthyFilter,
  ParishAppError,
  ParishAppAccountingFeature,
} from './app-contracts.js';
import type { ParishAppBindings } from './app.js';
declare const setStatus: ParishAppBindings['setStatus'];
declare let currentParish: ParishAppBindings['currentParish'];
declare const authHeaders: ParishAppBindings['authHeaders'];
declare const payload: ParishAppBindings['payload'];
declare const saveSession: ParishAppBindings['saveSession'];
declare const selectedSubscriptionAddOns: ParishAppBindings['selectedSubscriptionAddOns'];
declare const escapeHtml: ParishAppBindings['escapeHtml'];
declare const money: ParishAppBindings['money'];
declare const escapeAttr: ParishAppBindings['escapeAttr'];

async function uploadParishLogo(btn?: HTMLButtonElement | null) {
  const file = (document.getElementById('parishLogoFile') as HTMLInputElement | null)?.files?.[0];
  if (!file) {
    setStatus('Choose a logo image first.', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setStatus('Logo must be 5MB or smaller.', 'error');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish!.parishId) + '/logo', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': file.type },
      body: file,
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to upload logo.');
    setStatus('Parish logo uploaded.', 'success');
    await loadDashboard();
  } catch (err) {
    setStatus((err as ParishAppError).message || 'Unable to upload logo.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function removeParishLogo(btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish!.parishId) + '/logo', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to remove logo.');
    setStatus('Parish logo removed.', 'success');
    await loadDashboard();
  } catch (err) {
    setStatus((err as ParishAppError).message || 'Unable to remove logo.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

function formatSacramentPriestsForSettings(priests: ParishAppPriest[]) {
  const rows = Array.isArray(priests) ? priests : [];
  return rows
    .map((priest) => [priest.name, priest.email].filter(Boolean as unknown as ParishAppTruthyFilter).join(' | '))
    .join('\n');
}

function parseSacramentPriestsFromSettings() {
  const raw = (document.getElementById('sacramentPriestsText') as HTMLTextAreaElement | null)?.value || '';
  const existing = Array.isArray(currentParish?.sacramentPriests) ? currentParish.sacramentPriests : [];
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const [name, email = ''] = line.split('|').map((part) => part.trim());
      const saved = existing.find(
        (priest) =>
          (email && String(priest.email || '').toLowerCase() === email.toLowerCase()) ||
          String(priest.name || '').toLowerCase() === name.toLowerCase()
      );
      return {
        name,
        email,
        serviceTypes: Array.isArray(saved?.serviceTypes) ? saved.serviceTypes : defaultSacramentServiceTypes(),
        customServices: Array.isArray(saved?.customServices) ? saved.customServices : [],
      };
    })
    .filter((priest) => priest.name)
    .slice(0, 12);
}

async function saveDashboard(btn?: HTMLButtonElement | null) {
  if (!currentParish) return;
  let body;
  try {
    body = payload();
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
    return;
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) {
      setStatus(data.error || data.detail || 'Unable to save dashboard.', 'error');
      return;
    }
    if (body.newDashboardPassword && data.token) {
      (document.getElementById('parishToken') as HTMLInputElement | null)!.value = data.token;
      saveSession();
    }
    setStatus(body.newDashboardPassword ? 'Settings saved. Password updated.' : 'Parish settings saved.', 'success');
    await loadDashboard();
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function copyPayload() {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  navigator.clipboard.writeText(JSON.stringify(payload(), null, 2));
  setStatus('Current settings copied.', 'success');
}

// ── STRIPE ONBOARDING ─────────────────────────────────────
async function startStripeOnboarding(btn?: HTMLButtonElement | null) {
  if (!currentParish) return;
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-onboarding',
      { method: 'POST', headers: authHeaders() }
    );
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to create onboarding link');
    const lb = document.getElementById('stripeLinkBox');
    const ll = document.getElementById('stripeOnboardingLink') as HTMLAnchorElement | null;
    if (lb && ll) {
      ll.href = data.onboardingUrl!;
      lb.classList.add('visible');
    }
    const sb = document.getElementById('setupLinkBox');
    const sl = document.getElementById('setupActionLink');
    const sh = document.getElementById('setupLinkHelp');
    if (sb && sl) {
      (sl as HTMLAnchorElement).href = data.onboardingUrl!;
      sl.textContent = 'Open Stripe onboarding';
      sb.classList.add('visible');
      if (sh)
        sh.textContent = win
          ? 'Stripe onboarding opened in a new tab.'
          : 'Your browser blocked the new tab. Use this link.';
    }
    if (win) win.location.href = data.onboardingUrl!;
    setStatus(win ? 'Stripe onboarding opened in a new tab.' : 'Stripe onboarding link created.', 'success');
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

// ── SUBSCRIPTION CHECKOUT ─────────────────────────────────
async function startSubscriptionCheckout(btn?: HTMLButtonElement | null, tierSelectId?: string) {
  if (!currentParish) return;
  const startingFreeDemo =
    Boolean(currentParish.subscriptionIntroDemoEligible) ||
    currentParish.subscriptionStatus === 'trial_checkout_created';
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const tier = document.getElementById(tierSelectId || 'setupSubscriptionTier');
    const householdBandId =
      tierSelectId === 'subscriptionTierUpgrade' ? 'subscriptionHouseholdBandUpgrade' : 'setupParishHouseholdBand';
    const householdBand = document.getElementById(householdBandId);
    const addOnGroupId =
      tierSelectId === 'subscriptionTierUpgrade' ? 'subscriptionAddOnUpgradeGroup' : 'setupSubscriptionAddOnGroup';
    if (
      ((tier as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value ||
        currentParish.subscriptionTier) === 'parish' &&
      !(householdBand as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value
    ) {
      throw new Error('Choose the parish active-household range before continuing.');
    }
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-checkout',
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionTier: tier
            ? (tier as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
            : currentParish.subscriptionTier,
          parishHouseholdBand:
            (householdBand as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '',
          subscriptionAddOns: selectedSubscriptionAddOns(addOnGroupId),
        }),
      }
    );
    const data = (await res.json()) as ParishAppPayload;
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to create checkout');
    if (data.registration) currentParish = { ...currentParish, ...data.registration };
    if (!data.checkoutUrl) {
      if (win) win.close();
      await loadDashboard();
      setStatus('Subscription updated. No checkout required.', 'success');
      await (window.ParishFeatureRegistry?.get('accounting') as ParishAppAccountingFeature | null)?.activate?.();
      return;
    }
    const sb = tierSelectId
      ? document.getElementById('subscriptionUpgradeLinkBox') || document.getElementById('setupLinkBox')
      : document.getElementById('setupLinkBox') || document.getElementById('subscriptionUpgradeLinkBox');
    const sl = tierSelectId
      ? (document.getElementById('subscriptionUpgradeLink') as HTMLAnchorElement | null) ||
        document.getElementById('setupActionLink')
      : document.getElementById('setupActionLink') ||
        (document.getElementById('subscriptionUpgradeLink') as HTMLAnchorElement | null);
    const sh = tierSelectId
      ? document.getElementById('subscriptionUpgradeHelp') || document.getElementById('setupLinkHelp')
      : document.getElementById('setupLinkHelp') || document.getElementById('subscriptionUpgradeHelp');
    if (sb && sl) {
      (sl as HTMLAnchorElement).href = data.checkoutUrl;
      sl.textContent = startingFreeDemo ? 'Open free demo setup' : 'Open billing checkout';
      sb.classList.add('visible');
      if (sh)
        sh.textContent = win
          ? startingFreeDemo
            ? 'Free demo setup opened in a new tab. No card is required.'
            : 'Billing checkout opened in a new tab.'
          : 'Your browser blocked the new tab. Use this link.';
    }
    if (win) win.location.href = data.checkoutUrl;
    setStatus(
      win
        ? startingFreeDemo
          ? 'Free demo setup opened in a new tab.'
          : 'Subscription checkout opened in a new tab.'
        : startingFreeDemo
          ? 'Free demo setup is ready.'
          : 'Checkout created.',
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

async function loadStripeVolume(btn?: HTMLButtonElement | null) {
  const body = document.getElementById('stripeVolumeBody');
  if (!currentParish || !body) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-volume', {
      headers: authHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok && !data.volume) throw new Error(data.detail || data.error || 'Unable to load Stripe volume');
    renderStripeVolume(data.volume || {});
    await loadNonprofitPricing();
  } catch (err) {
    body.innerHTML = `<div class="insights-empty-dark">${escapeHtml((err as ParishAppError).message)}</div>`;
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function renderStripeVolume(volume: ParishAppVolume) {
  const body = document.getElementById('stripeVolumeBody');
  const panel = document.getElementById('stripeVolumePanel');
  if (!body) return;
  panel?.classList.toggle('npp-panel-expanded', Boolean(volume.connected));
  if (!volume.connected) {
    const billingReady = Boolean(currentParish?.setup?.billingActive);
    body.innerHTML = `
        <div class="npp-empty-state">
          <div class="npp-empty-mark" aria-hidden="true">S</div>
          <div class="npp-empty-content">
            <span class="npp-eyebrow">Required first step</span>
            <h3>Connect your parish Stripe account</h3>
            <p>AGAPAY needs a Standard connected account before it can measure donation and non-donation payment volume.</p>
            <div class="npp-benefit-row" aria-label="What happens after connecting Stripe">
              <span>Automatic volume tracking</span>
              <span>80% eligibility monitoring</span>
              <span>Secure parish-level reporting</span>
            </div>
            <div class="npp-empty-actions">
              <button class="btn btn-primary" type="button" onclick="startStripeOnboarding(this)" ${billingReady ? '' : 'disabled title="Complete AGAPAY subscription billing first"'}>
                ${billingReady ? 'Connect Stripe' : 'Complete billing to connect Stripe'}
              </button>
              <small>${billingReady ? 'You will finish securely in Stripe.' : 'Stripe connection unlocks after subscription billing is active.'}</small>
            </div>
          </div>
        </div>`;
    return;
  }
  const complete = Boolean(volume.scan?.complete);
  const percent = Number(volume.donationPercent || 0);
  const thresholdMet = complete && percent >= Number(volume.thresholdPercent || 80);
  const status = !complete ? 'Scan in progress' : thresholdMet ? 'Volume threshold met' : 'Below 80% threshold';
  body.innerHTML = `
      <div class="pdx-kpi-band" style="margin:0;">
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Donation share</div><div class="pdx-kpi-value">${percent.toFixed(2)}%</div><div class="pdx-kpi-meta">${escapeHtml(status)}</div></div>
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Donations</div><div class="pdx-kpi-value">${money(volume.donationNetCents || 0)}</div><div class="pdx-kpi-meta">Net Stripe volume</div></div>
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Non-donations</div><div class="pdx-kpi-value">${money(volume.nonDonationNetCents || 0)}</div><div class="pdx-kpi-meta">Commerce and other classified payments</div></div>
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Unclassified</div><div class="pdx-kpi-value">${money(volume.unclassifiedNetCents || 0)}</div><div class="pdx-kpi-meta">Included in total, not counted as donations</div></div>
      </div>
      <p style="margin:14px 0 0;color:var(--muted);font-size:13px;">${escapeHtml(volume.note || '')} This is an operational estimate; Stripe makes the pricing decision.</p>
    `;
}

async function nonprofitPricingFetch(path: string = '', init: RequestInit = {}) {
  const response = await fetch(
    '/api/parish/dashboard/' + encodeURIComponent(currentParish!.parishId) + '/nonprofit-pricing' + path,
    {
      ...init,
      headers: { ...authHeaders(), ...(init.headers || {}) },
    }
  );
  const data = (await response.json().catch(() => ({}))) as ParishAppPayload;
  if (!response.ok) throw new Error(data.error || data.detail || 'Unable to update the nonprofit-pricing application');
  return data;
}

async function loadNonprofitPricing(btn?: HTMLButtonElement | null) {
  const body = document.getElementById('nonprofitPricingApplicationBody');
  if (!currentParish || !body) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const data = await nonprofitPricingFetch();
    renderNonprofitPricingApplication(data);
  } catch (err) {
    if (/connect the parish standard stripe account/i.test((err as ParishAppError).message || '')) {
      renderNonprofitPricingDisconnected();
    } else {
      document.getElementById('nonprofitPricingApplicationPanel')?.classList.remove('npp-panel-expanded');
      body.innerHTML = `<div class="insights-empty-dark">${escapeHtml((err as ParishAppError).message)}</div>`;
    }
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function renderNonprofitPricingDisconnected() {
  const body = document.getElementById('nonprofitPricingApplicationBody');
  if (!body) return;
  document.getElementById('nonprofitPricingApplicationPanel')?.classList.remove('npp-panel-expanded');
  body.innerHTML = `
      <div class="npp-empty-state npp-empty-state-secondary">
        <div class="npp-empty-mark npp-empty-mark-muted" aria-hidden="true">%</div>
        <div class="npp-empty-content">
          <span class="npp-eyebrow">Unlocks after Stripe connection</span>
          <h3>Your application workspace will appear here</h3>
          <p>Once Stripe is connected, AGAPAY will calculate the parish’s donation share and guide you through attestation, document upload, and submission to Stripe.</p>
          <div class="npp-mini-steps" aria-label="Nonprofit pricing application steps">
            <div class="is-current"><strong>1</strong><span>Connect Stripe</span></div>
            <div><strong>2</strong><span>Verify 80% donation volume</span></div>
            <div><strong>3</strong><span>Prepare and submit</span></div>
          </div>
          <button class="btn btn-primary npp-stripe-account-button" type="button" onclick="document.getElementById('stripeVolumePanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })">Manage Stripe Account</button>
        </div>
      </div>`;
}

function renderNonprofitPricingApplication(data: ParishAppPayload) {
  const body = document.getElementById('nonprofitPricingApplicationBody');
  if (!body) return;
  document.getElementById('nonprofitPricingApplicationPanel')?.classList.add('npp-panel-expanded');
  const application = data.application || {};
  const readiness = application.readiness || {};
  const confirmations = application.confirmations || {};
  const documents = (application.documents || []).filter((document) => document.isCurrent);
  const statusLabel = String(application.status || 'not_started').replaceAll('_', ' ');
  const measuredPercent = Number(data.volume?.donationPercent || 0).toFixed(2);
  const applicationParishName = currentParish!.parishName || currentParish!.name || 'The parish';
  const applicationStatement = `${applicationParishName} confirms that ${measuredPercent}% of its measured year-to-date Stripe payment volume is from tax-deductible donations. The parish is a registered nonprofit organization and requests review for Stripe nonprofit pricing for connected account ${application.stripeAccountId || ''}. An authorized account owner is submitting this request while logged into the parish Stripe account.`;
  const checks = [
    ['Complete Stripe volume scan', readiness.measurementComplete],
    ['At least 80% measured donation volume', readiness.measuredAtOrAbove80],
    ['Signed parish attestation', readiness.attestationComplete],
    ['Nonprofit documentation uploaded', readiness.hasNonprofitProof],
  ];
  body.innerHTML = `
      <div style="display:grid;gap:18px;">
        <div class="insights-empty-dark" style="text-align:left;">
          <strong>Stripe confirmed:</strong> each Standard connected parish must apply separately. The account owner must be logged into the parish Stripe account and contact Stripe directly. AGAPAY prepares and tracks the packet but cannot submit it for the parish.
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><strong>Application status</strong><span>${escapeHtml(statusLabel)}</span></div>
          <div style="display:grid;gap:6px;margin-top:10px;">${checks.map(([label, done]) => `<div>${done ? '✓' : '○'} ${escapeHtml(label)}</div>`).join('')}</div>
        </div>
        <div style="display:grid;gap:8px;">
          <strong>Application statement</strong>
          <textarea id="nppApplicationStatement" rows="4" readonly>${escapeHtml(applicationStatement)}</textarea>
          <button class="btn btn-secondary btn-sm" type="button" onclick="copyNonprofitPricingStatement()">Copy statement</button>
          <small style="color:var(--muted);">AGAPAY uses year-to-date volume because Stripe did not confirm its review team’s measurement period. Stripe makes the final determination.</small>
        </div>
        <form onsubmit="saveNonprofitPricingAttestation(event)" style="display:grid;gap:10px;">
          <strong>Authorized representative attestation</strong>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
            <input id="nppAttestedName" required maxlength="160" placeholder="Representative name" value="${escapeAttr(application.attestedByName || '')}" />
            <input id="nppAttestedTitle" required maxlength="160" placeholder="Title, e.g. Treasurer" value="${escapeAttr(application.attestedByTitle || '')}" />
            <input id="nppEinLastFour" required maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="EIN last four" value="${escapeAttr(application.einLastFour || '')}" />
          </div>
          <label><input id="nppRegistered" type="checkbox" ${confirmations.registeredNonprofit ? 'checked' : ''}> I confirm the parish is a registered nonprofit organization.</label>
          <label><input id="nppTaxDeductible" type="checkbox" ${confirmations.taxDeductibleDonations ? 'checked' : ''}> I confirm the payments classified as donations are tax-deductible donations.</label>
          <label><input id="nppOver80" type="checkbox" ${confirmations.over80Percent ? 'checked' : ''}> I confirm that more than 80% of this Stripe account’s payment volume comes from tax-deductible donations.</label>
          <label><input id="nppOwnerSubmit" type="checkbox" ${confirmations.accountOwnerSubmission ? 'checked' : ''}> I understand an authorized parish account owner must sign in to Stripe and submit the request directly.</label>
          <button class="btn btn-primary btn-sm" type="submit">Sign and save attestation</button>
        </form>
        <form onsubmit="uploadNonprofitPricingDocument(event)" style="display:grid;gap:10px;">
          <strong>Private supporting documents</strong>
          <p style="margin:0;color:var(--muted);font-size:13px;">Upload an IRS determination letter, tax-exempt proof, or Stripe’s eventual approval message. Files remain private and are served only through authenticated dashboard routes.</p>
          <div style="display:grid;grid-template-columns:minmax(180px,0.5fr) minmax(220px,1fr) auto;gap:10px;">
            <select id="nppDocumentType"><option value="irs_determination">IRS determination letter</option><option value="tax_exempt_proof">Other tax-exempt proof</option><option value="stripe_approval">Stripe approval message</option><option value="other">Other</option></select>
            <input id="nppDocumentFile" type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
            <button class="btn btn-secondary btn-sm" type="submit">Upload</button>
          </div>
          <div>${documents.length ? documents.map((document) => `<button type="button" class="pdx-link-btn" onclick="viewNonprofitPricingDocument('${escapeAttr(document.id)}')">${escapeHtml(document.documentType.replaceAll('_', ' '))}: ${escapeHtml(document.filename)}</button>`).join('<br>') : '<span style="color:var(--muted);">No documents uploaded yet.</span>'}</div>
        </form>
        <div style="display:grid;gap:10px;">
          <strong>Submit through the parish Stripe account</strong>
          <p style="margin:0;color:var(--muted);font-size:13px;">When all four readiness checks are complete, sign in to Stripe, open Support, and request nonprofit pricing. Include the account ID, registered email, donation-volume confirmation, tax registration details, and tax-exempt documentation.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;"><a class="btn btn-secondary btn-sm" href="https://support.stripe.com/contact" target="_blank" rel="noopener">Open Stripe Support</a><input id="nppStripeCaseId" maxlength="120" placeholder="Stripe support case ID (if provided)" value="${escapeAttr(application.stripeSupportCaseId || '')}" /><button class="btn btn-primary btn-sm" type="button" onclick="markNonprofitPricingSubmitted(this)" ${readiness.readyToSubmit ? '' : 'disabled'}>I submitted this to Stripe</button></div>
        </div>
        ${
          application.status === 'submitted_to_stripe' ||
          application.status === 'stripe_approved' ||
          application.status === 'stripe_declined'
            ? `
          <div style="display:grid;gap:10px;">
            <strong>Record Stripe’s response</strong>
            <p style="margin:0;color:var(--muted);font-size:13px;">Stripe said its review team will notify the connected account when pricing is applied. Upload that message above before recording approval.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;"><input id="nppEffectiveDate" type="date" value="${escapeAttr(application.stripeEffectiveDate || '')}" /><button class="btn btn-primary btn-sm" type="button" onclick="recordNonprofitPricingDecision('approved',this)">Stripe approved</button><button class="btn btn-secondary btn-sm" type="button" onclick="recordNonprofitPricingDecision('declined',this)">Stripe declined</button></div>
          </div>`
            : ''
        }
      </div>
    `;
}

async function copyNonprofitPricingStatement() {
  const statement = (document.getElementById('nppApplicationStatement') as HTMLTextAreaElement | null)?.value || '';
  try {
    await navigator.clipboard.writeText(statement);
    setStatus('Application statement copied.', 'success');
  } catch {
    const field = document.getElementById('nppApplicationStatement') as HTMLTextAreaElement | null;
    field?.select();
    setStatus('Select and copy the application statement.', '');
  }
}

async function saveNonprofitPricingAttestation(event: SubmitEvent) {
  event.preventDefault();
  try {
    const data = await nonprofitPricingFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_attestation',
        name: (document.getElementById('nppAttestedName') as HTMLInputElement | null)?.value || '',
        title: (document.getElementById('nppAttestedTitle') as HTMLInputElement | null)?.value || '',
        einLastFour: (document.getElementById('nppEinLastFour') as HTMLInputElement | null)?.value || '',
        registeredNonprofit: Boolean((document.getElementById('nppRegistered') as HTMLInputElement | null)?.checked),
        taxDeductibleDonations: Boolean(
          (document.getElementById('nppTaxDeductible') as HTMLInputElement | null)?.checked
        ),
        over80Percent: Boolean((document.getElementById('nppOver80') as HTMLInputElement | null)?.checked),
        accountOwnerSubmission: Boolean(
          (document.getElementById('nppOwnerSubmit') as HTMLInputElement | null)?.checked
        ),
      }),
    });
    renderNonprofitPricingApplication(data);
    setStatus('Nonprofit-pricing attestation saved.', 'success');
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  }
}

async function uploadNonprofitPricingDocument(event: SubmitEvent) {
  event.preventDefault();
  const file = (document.getElementById('nppDocumentFile') as HTMLInputElement | null)?.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.set('documentType', (document.getElementById('nppDocumentType') as HTMLSelectElement | null)?.value || '');
  form.set('document', file);
  try {
    await nonprofitPricingFetch('/documents', { method: 'POST', body: form });
    await loadNonprofitPricing();
    setStatus('Private nonprofit document uploaded.', 'success');
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  }
}

async function markNonprofitPricingSubmitted(btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const data = await nonprofitPricingFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark_submitted',
        stripeSupportCaseId: (document.getElementById('nppStripeCaseId') as HTMLInputElement | null)?.value || '',
      }),
    });
    renderNonprofitPricingApplication(data);
    setStatus('Stripe submission recorded.', 'success');
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function recordNonprofitPricingDecision(decision: string, btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const data = await nonprofitPricingFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record_decision',
        decision,
        effectiveDate: (document.getElementById('nppEffectiveDate') as HTMLInputElement | null)?.value || '',
      }),
    });
    renderNonprofitPricingApplication(data);
    setStatus(`Stripe ${decision} decision recorded.`, 'success');
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function viewNonprofitPricingDocument(documentId: string) {
  try {
    const response = await fetch(
      '/api/parish/dashboard/' +
        encodeURIComponent(currentParish!.parishId) +
        '/nonprofit-pricing/documents/' +
        encodeURIComponent(documentId),
      { headers: authHeaders() }
    );
    if (!response.ok) throw new Error('Unable to open document');
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  }
}
export type ParishAppPart4 = {
  uploadParishLogo: typeof uploadParishLogo;
  removeParishLogo: typeof removeParishLogo;
  formatSacramentPriestsForSettings: typeof formatSacramentPriestsForSettings;
  parseSacramentPriestsFromSettings: typeof parseSacramentPriestsFromSettings;
  saveDashboard: typeof saveDashboard;
  copyPayload: typeof copyPayload;
  startStripeOnboarding: typeof startStripeOnboarding;
  startSubscriptionCheckout: typeof startSubscriptionCheckout;
  loadStripeVolume: typeof loadStripeVolume;
  renderStripeVolume: typeof renderStripeVolume;
  nonprofitPricingFetch: typeof nonprofitPricingFetch;
  loadNonprofitPricing: typeof loadNonprofitPricing;
  renderNonprofitPricingDisconnected: typeof renderNonprofitPricingDisconnected;
  renderNonprofitPricingApplication: typeof renderNonprofitPricingApplication;
  copyNonprofitPricingStatement: typeof copyNonprofitPricingStatement;
  saveNonprofitPricingAttestation: typeof saveNonprofitPricingAttestation;
  uploadNonprofitPricingDocument: typeof uploadNonprofitPricingDocument;
  markNonprofitPricingSubmitted: typeof markNonprofitPricingSubmitted;
  recordNonprofitPricingDecision: typeof recordNonprofitPricingDecision;
  viewNonprofitPricingDocument: typeof viewNonprofitPricingDocument;
};
