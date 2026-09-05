'use strict';

// Onboarding owns setup rendering, the temporary wizard draft, and save/signoff
// actions. Shared parish identity, catalogs, billing, and navigation stay in core.
// Read core globals only inside actions after app.js has initialized; never cache
// a separate parish or catalog snapshot here. Inline action names stay compatible.
/* global currentParish:writable, editableFunds:writable, editableCampaigns:writable,
  fundPresets, campaignPresets, hasGivingPlusAccess, fallbackFundsArray,
  isGeneralDashboardFund, isCandleDashboardFund, escapeHtml, escapeAttr,
  slugifyLocal, setStatus, givingCatalogSnapshot, givingCatalogBaseline,
  accountingCatalogSnapshot, accountingCatalogBaseline, authHeaders,
  loadDashboard, renderDashboard, tierOptionsMarkup, setupCheckMarkup,
  parishHouseholdPickerMarkup, syncParishHouseholdPricing */
/* exported openGivingSetupWizard, setGivingSetupWizardStep, addGivingSetupPreset,
  addGivingSetupCustom, removeGivingSetupChoice, saveGivingSetupWizard,
  submitTreasurerGoLive */

const treasurerAffirmationCopy = {
  stripeAccount: 'The connected Stripe account belongs to this parish.',
  payoutBank: 'The payout bank account shown in Stripe is correct.',
  organizationName: 'The public and legal organization names are correct.',
  generalFund: 'The General Operating Fund is correct.',
  designatedFunds: 'The designated funds and campaigns are correct.',
  recurringGiving: 'Recurring giving is enabled or disabled as intended.',
  receiptDetails: 'The receipt name and contact details are correct.',
  agapayPlan: 'The selected AGAPAY plan is correct.',
};
function onboardingSignoffMarkup(workflow) {
  const summary = workflow.summary || {};
  const org = summary.organization || {};
  const stripe = summary.stripe || {};
  const plan = summary.plan || {};
  const giving = summary.giving || {};
  const receipt = summary.receipt || {};
  const stripeCheckedAt = workflow.stripe?.checkedAt
    ? new Date(workflow.stripe.checkedAt).toLocaleString()
    : 'not refreshed';
  const designated = [...(giving.designatedFunds || []), ...(giving.campaigns || []), ...(giving.feastCampaigns || [])];
  const general = (giving.generalFunds || [])[0];
  const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const fundDetail = (item) => {
    const destination = (giving.generalFunds || [])
      .concat(giving.designatedFunds || [])
      .find((fund) => fund.id === item.destinationFundId);
    return [
      item.description,
      String(item.restrictionType || 'unrestricted').replaceAll('_', ' '),
      item.destinationFundId ? `Destination: ${destination?.name || item.destinationFundId}` : '',
      item.accountingFundId ? `Accounting fund: ${item.accountingFundId}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const moduleNames = {
    givingPlus: 'Enhanced giving',
    stewardshipHealth: 'Stewardship Health',
    sacraments: 'Sacraments & Services',
    directory: 'Directory',
    library: 'Parish Library',
    bookstore: 'Bookstore',
    commerceSuite: 'Commerce',
    communications: 'Koinonia',
    textToGive: 'Text-to-Give',
    accounting: 'Accounting',
  };
  const planDetails = [
    plan.status,
    plan.totalMonthlyCents === null
      ? 'Custom pricing: confirm your agreed terms with AGAPAY'
      : Number.isFinite(plan.totalMonthlyCents ?? plan.monthlyCents)
        ? `${money(plan.totalMonthlyCents ?? plan.monthlyCents)}/month${plan.status === 'trialing' ? ' if you continue after the free trial' : ''}`
        : 'Confirm pricing with AGAPAY',
    plan.trialEndsAt ? `Trial ends ${new Date(plan.trialEndsAt).toLocaleDateString()}` : '',
    ...(plan.addOns || []).map((item) => `${item.label}: ${money(item.monthlyCents)}/month`),
    (plan.modules || []).map((id) => moduleNames[id] || id).join(', '),
    plan.transactionRateLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  const bankLabel = stripe.payoutBankName
    ? `${stripe.payoutBankName}${stripe.payoutBankLast4 ? ` ending ${stripe.payoutBankLast4}` : ''}`
    : 'Confirm the payout bank directly in Stripe';
  const rows = {
    organizationName: [
      'Organization',
      org.publicName || 'Not set',
      org.legalReceiptName && org.legalReceiptName !== org.publicName
        ? `Receipt name: ${org.legalReceiptName}`
        : 'Public and receipt names match',
    ],
    stripeAccount: [
      'Stripe account',
      stripe.accountId || 'Not connected',
      `Charges ${stripe.chargesEnabled ? 'enabled' : 'blocked'} · payouts ${stripe.payoutsEnabled ? 'enabled' : 'blocked'} · refreshed ${stripeCheckedAt}`,
    ],
    payoutBank: ['Payout bank', bankLabel, 'Bank details remain visible in Stripe only'],
    generalFund: [
      'General fund',
      general?.name || 'Not configured',
      general ? fundDetail(general) : 'Unrestricted operating fund',
    ],
    designatedFunds: [
      'Designated giving',
      `${designated.length} active item${designated.length === 1 ? '' : 's'}`,
      designated
        .map((item) => item.name)
        .filter(Boolean)
        .join(', ') || 'No designated funds or campaigns',
    ],
    recurringGiving: [
      'Recurring giving',
      giving.recurringGivingEnabled ? 'Enabled' : 'Disabled',
      'Parish-selected setting',
    ],
    receiptDetails: [
      'Receipt',
      receipt.legalName || org.publicName || 'Not set',
      receipt.contact || 'No contact configured',
    ],
    agapayPlan: ['AGAPAY plan', plan.label || plan.id || 'Not selected', planDetails],
  };
  const reviewGroups = [
    {
      title: 'Where donations go',
      detail: 'Confirm the connected account and payout destination.',
      keys: ['stripeAccount', 'payoutBank'],
    },
    {
      title: 'Parish identity and receipts',
      detail: 'Confirm the names and contact information donors will receive.',
      keys: ['organizationName', 'receiptDetails'],
    },
    {
      title: 'Giving choices',
      detail: 'Confirm the general fund, designated options, and recurring gifts.',
      keys: ['generalFund', 'designatedFunds', 'recurringGiving'],
    },
    {
      title: 'AGAPAY plan',
      detail: 'Confirm the subscription selected for this parish.',
      keys: ['agapayPlan'],
    },
  ];
  const reviewMarkup = reviewGroups
    .map(
      (group, index) => `<section class="signoff-review-group">
        <div class="signoff-review-group-head"><span>${index + 1}</span><div><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.detail)}</small></div></div>
        <div class="signoff-summary">${group.keys
          .map((key) => {
            const [label, value, detail] = rows[key];
            return `<div class="signoff-summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small>${key === 'designatedFunds' ? designated.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(fundDetail(item))}</small></div>`).join('') : ''}</div>`;
          })
          .join('')}</div>
        <div class="signoff-affirmations">${group.keys.map((key) => `<label><input class="treasurer-affirmation" type="checkbox" data-key="${key}"><span>${escapeHtml(treasurerAffirmationCopy[key])}</span></label>`).join('')}</div>
      </section>`
    )
    .join('');
  return `<div class="treasurer-signoff" id="treasurerSignoff">
      <div class="treasurer-signoff-head"><div><span>Required final approval</span><h3>Treasurer go-live signoff</h3><p>Review four short sections. Check each confirmation, add your name and title, then launch giving. Your shared parish dashboard session can approve initial launch; accounting still requires its separate treasurer PIN.</p></div></div>
      <div class="signoff-review-grid">${reviewMarkup}</div>
      <div class="signoff-record-note"><strong>Review record</strong><span class="onboarding-snapshot">Configuration ${escapeHtml(String(workflow.materialVersion || '').slice(0, 10))} · Stripe refreshed ${escapeHtml(stripeCheckedAt)}</span></div>
      <section class="signoff-approval"><div class="signoff-approval-head"><span>5</span><div><strong>Approve the launch</strong><small>Your identity and authority are stored with all eight confirmations.</small></div></div><div class="signoff-identity">
        <div><label for="goLiveSignerName">Treasurer name</label><input id="goLiveSignerName" autocomplete="name" placeholder="Full legal name"></div>
        <div><label for="goLiveSignerTitle">Title</label><input id="goLiveSignerTitle" value="Parish Treasurer" autocomplete="organization-title"></div>
        <div><label for="goLiveSignerEmail">Treasurer email on file</label><input id="goLiveSignerEmail" type="email" value="${escapeHtml(summary.treasurerEmail || '')}" readonly aria-describedby="goLiveSignerEmailNote"><small id="goLiveSignerEmailNote">This email will be recorded with the signoff. No separate treasurer login is required.</small></div>
      </div>
      <label class="signoff-authority"><input id="goLiveAuthority" type="checkbox"><span>I am authorized to approve online giving for this parish.</span></label>
      <div class="signoff-submit"><p id="goLiveError" role="alert"></p><button class="btn btn-gold" type="button" onclick="submitTreasurerGoLive(this)">Go Live</button></div></section>
    </div>`;
}
function renderSimpleParishSetupWizard(workflow) {
  const pane = document.getElementById('setupWizardPane');
  if (!pane) return;
  const live = workflow.state === 'LIVE';
  const givingUrl = workflow.summary?.givingUrl || `/give/${encodeURIComponent(currentParish.parishId || '')}`;
  const stages = workflow.parishStages || [
    { key: 'access', title: 'Accept access', detail: 'Create your personal password.', passed: true },
    {
      key: 'payments',
      title: 'Connect payments',
      detail: 'Choose a plan and connect Stripe.',
      passed: Boolean(workflow.stripe?.ready),
    },
    {
      key: 'launch',
      title: 'Review and launch',
      detail: 'Confirm the parish details and approve launch.',
      passed: live,
    },
  ];
  const stageMarkup = stages
    .map((stage, index) => {
      const current = !stage.passed && stages.slice(0, index).every((item) => item.passed);
      return `<div class="parish-setup-stage ${stage.passed ? 'done' : current ? 'current' : 'later'}"><span>${stage.passed ? '&#10003;' : index + 1}</span><div><strong>${escapeHtml(stage.title)}</strong><small>${escapeHtml(stage.detail || '')}</small></div><em>${stage.passed ? 'Complete' : current ? 'Now' : 'Next'}</em></div>`;
    })
    .join('');
  const blockerKeys = new Set((workflow.blockers || []).map((item) => item.key));
  const needsPlan = blockerKeys.has('subscription');
  const needsStripe = blockerKeys.has('stripeConnected') || blockerKeys.has('stripeReady');
  const needsGivingReview = ['generalFund', 'givingConfiguration', 'importDecision'].some((key) =>
    blockerKeys.has(key)
  );
  const waiting = blockerKeys.has('credential')
    ? 'Open the parish invitation and finish creating the dashboard password. Contact AGAPAY if the link has expired.'
    : blockerKeys.has('givingHidden')
      ? 'AGAPAY needs to prepare the giving page for a fresh launch approval.'
      : 'AGAPAY is completing parish verification and preparing your launch review.';
  const action = live
    ? `<div class="onboarding-live-mark" aria-hidden="true">&#10003;</div><strong>Giving is live</strong><p class="setup-copy setup-action-copy">Open your giving page, then share the link or download your QR code for the parish bulletin.</p><a class="btn btn-gold onboarding-link-button" href="${escapeHtml(givingUrl)}" target="_blank" rel="noopener">Open giving page</a><button class="btn btn-ghost" type="button" onclick="copyGivingLink()">Copy giving link</button><button class="btn btn-ghost" type="button" onclick="downloadQrPng()">Download giving QR code</button>`
    : workflow.canGoLive
      ? `<strong>Review and launch</strong><p class="setup-copy setup-action-copy">Everything is ready. The treasurer reviews the parish details once and approves giving.</p><button class="btn btn-gold" type="button" onclick="document.getElementById('treasurerSignoff')?.scrollIntoView({behavior:'smooth',block:'start'})">Review and launch</button>`
      : needsPlan
        ? `<strong>Choose your AGAPAY plan</strong><p class="setup-copy setup-action-copy">Confirm the plan your parish selected. Stripe opens immediately after billing is ready.</p><button class="btn btn-gold" type="button" onclick="switchTab('settings')">Choose plan</button>`
        : needsStripe
          ? `<strong>${workflow.stripe?.connected ? 'Finish connecting Stripe' : 'Connect the parish Stripe account'}</strong><p class="setup-copy setup-action-copy">Stripe securely collects the parish and payout-bank details. AGAPAY never sees the full bank account number.</p>${workflow.stripe?.connected ? '<button class="btn btn-gold" type="button" onclick="refreshStripeStatus({force:true})">Check Stripe status</button><button class="btn btn-gold" type="button" onclick="startStripeOnboarding(this)">Continue Stripe setup</button>' : '<button class="btn btn-gold" type="button" onclick="startStripeOnboarding(this)">Connect Stripe</button>'}`
          : needsGivingReview
            ? `<strong>Review the giving setup</strong><p class="setup-copy setup-action-copy">A short wizard will show only the giving choices included with ${escapeHtml(currentParish.subscriptionTierLabel || 'your plan')}.</p><button class="btn btn-gold" type="button" onclick="openGivingSetupWizard()">Review giving setup</button>`
            : `<strong>Next step: ${blockerKeys.has('credential') ? 'secure parish access' : 'AGAPAY review'}</strong><p class="setup-copy setup-action-copy">${escapeHtml(waiting)}</p><a href="mailto:onboarding@agapay.app">Contact onboarding support</a><button class="btn btn-ghost" type="button" onclick="loadDashboard()">Check for updates</button>`;
  pane.innerHTML = `<div class="setup-wizard-card deterministic-onboarding parish-simple-setup"><div class="setup-wizard-body"><div><div class="onboarding-kicker">Parish setup</div><div class="setup-title">Three steps to start giving</div><p class="setup-copy">${live ? 'Launch is complete.' : 'AGAPAY handles the internal checks. Your parish only completes the three steps below.'}</p><div class="parish-setup-stages">${stageMarkup}</div></div><div class="setup-action-panel">${action}${workflow.updatedAt ? `<p class="setup-copy">Last updated ${escapeHtml(new Date(workflow.updatedAt).toLocaleString())}</p>` : ''}<div class="setup-link-box" id="setupLinkBox"><a id="setupActionLink" href="#" target="_blank" rel="noopener">Open Stripe setup</a><p id="setupLinkHelp"></p></div></div></div>${workflow.canGoLive ? onboardingSignoffMarkup(workflow) : ''}</div>`;
}

function renderDeterministicOnboardingWizard(workflow) {
  renderSimpleParishSetupWizard(workflow);
}

let givingSetupWizardStep = 0;
let givingSetupDraft = null;
let givingSetupSaving = false;
let givingSetupReturnFocus = null;

function givingSetupKeydown(event) {
  const modal = document.getElementById('givingSetupModal');
  if (!modal) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeGivingSetupWizard();
  }
  if (event.key !== 'Tab') return;
  const controls = [
    ...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'),
  ];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

function givingSetupTierDetails() {
  const tier = String(currentParish?.subscriptionTier || 'starter').toLowerCase();
  const label = currentParish?.subscriptionTierLabel || (tier === 'starter' ? 'Give' : 'Give +');
  const givingPlus = hasGivingPlusAccess();
  const featureCopy =
    tier === 'starter'
      ? 'General Operating, unlimited designated funds, candles, and recurring giving'
      : tier === 'stewardship'
        ? 'Unlimited funds and campaigns, recurring giving, donor tools, and Stewardship Health'
        : ['parish', 'diocese'].includes(tier)
          ? 'Unlimited funds and campaigns, recurring giving, stewardship, and the complete parish operations suite'
          : 'Unlimited funds and campaigns, recurring giving, receipts, and enhanced giving reports';
  return { tier, label, givingPlus, designatedLimit: Infinity, featureCopy };
}

function activeGivingSetupItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item && item.enabled !== false && item.active !== false);
}

function buildGivingSetupDraft() {
  const activeFunds = activeGivingSetupItems(
    editableFunds.length ? editableFunds : fallbackFundsArray(currentParish?.funds)
  );
  const savedGeneral = activeFunds.find(isGeneralDashboardFund) || fundPresets.general;
  return {
    general: {
      ...savedGeneral,
      id: 'general',
      name: savedGeneral.name || 'General Operating Fund',
      description: savedGeneral.description || fundPresets.general.description,
    },
    designatedFunds: activeFunds
      .filter((fund) => !isGeneralDashboardFund(fund) && !isCandleDashboardFund(fund))
      .map((fund) => ({ ...fund })),
    campaigns: activeGivingSetupItems(editableCampaigns.length ? editableCampaigns : currentParish?.campaigns).map(
      (campaign) => ({ ...campaign })
    ),
    recurringGivingEnabled: currentParish?.recurringGivingEnabled !== false,
    candlesEnabled: currentParish?.candlesEnabled !== false,
    importDecision: /requested help importing/i.test(currentParish?.onboarding?.checks?.importDecision?.note || '')
      ? 'requested'
      : 'none',
  };
}

function closeGivingSetupWizard() {
  if (givingSetupSaving) return;
  document.getElementById('givingSetupModal')?.remove();
  document.removeEventListener('keydown', givingSetupKeydown);
  document.body.classList.remove('giving-setup-modal-open');
  givingSetupDraft = null;
  givingSetupWizardStep = 0;
  givingSetupReturnFocus?.focus();
}

function captureGivingSetupWizardStep() {
  if (!givingSetupDraft) return;
  if (givingSetupWizardStep === 0) {
    givingSetupDraft.general.name = document.getElementById('givingSetupGeneralName')?.value.trim() || '';
    givingSetupDraft.general.description = document.getElementById('givingSetupGeneralDescription')?.value.trim() || '';
    givingSetupDraft.recurringGivingEnabled = Boolean(document.getElementById('givingSetupRecurring')?.checked);
    givingSetupDraft.candlesEnabled = Boolean(document.getElementById('givingSetupCandles')?.checked);
  }
  if (givingSetupWizardStep === 2) {
    givingSetupDraft.importDecision =
      document.querySelector('input[name="givingSetupImportDecision"]:checked')?.value || 'none';
  }
}

function givingSetupChoiceRows(items, kind) {
  const label = kind === 'fund' ? 'designated fund' : 'campaign';
  if (!items.length)
    return `<div class="giving-setup-empty">No ${label}s selected. That is okay—you can add them later.</div>`;
  return `<div class="giving-setup-selected">${items.map((item, index) => `<div class="giving-setup-selected-row"><span><strong>${escapeHtml(item.name || 'Giving option')}</strong><small>${escapeHtml(item.description || (kind === 'fund' ? 'Parish-designated giving destination' : 'Time-limited parish campaign'))}</small></span><button type="button" aria-label="Remove ${escapeHtml(item.name || label)}" onclick="removeGivingSetupChoice('${kind}',${index})">Remove</button></div>`).join('')}</div>`;
}

function givingSetupPresetButtons(kind) {
  const source = kind === 'fund' ? fundPresets : campaignPresets;
  const selected = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
  const entries = Object.entries(source)
    .filter(([key]) => kind !== 'fund' || key !== 'general')
    .slice(0, kind === 'fund' ? 6 : 4);
  return `<div class="giving-setup-presets">${entries
    .map(([key, preset]) => {
      const alreadyAdded = selected.some(
        (item) => item.id === preset.id || String(item.name || '').toLowerCase() === preset.name.toLowerCase()
      );
      return `<button type="button" class="giving-setup-preset ${alreadyAdded ? 'is-selected' : ''}" ${alreadyAdded ? 'disabled' : ''} onclick="addGivingSetupPreset('${kind}','${key}')"><strong>${alreadyAdded ? '&#10003; ' : '+ '}${escapeHtml(preset.name)}</strong><small>${escapeHtml(preset.description)}</small></button>`;
    })
    .join('')}</div>`;
}

function givingSetupBasicsMarkup(tier) {
  return `<div class="giving-setup-screen">
      <div class="giving-setup-screen-heading"><span>Step 1 of 3</span><h3>Set the giving basics</h3><p>These are the choices every parish needs before accepting a gift.</p></div>
      <div class="giving-setup-field"><label for="givingSetupGeneralName">Primary giving destination</label><input id="givingSetupGeneralName" maxlength="120" value="${escapeAttr(givingSetupDraft.general.name)}"><small>This is the default destination for donations. Choose a name your parishioners will recognize.</small></div>
      <div class="giving-setup-field"><label for="givingSetupGeneralDescription">What this fund supports</label><textarea id="givingSetupGeneralDescription" maxlength="500">${escapeHtml(givingSetupDraft.general.description)}</textarea></div>
      <div class="giving-setup-toggle-grid">
        <label class="giving-setup-toggle"><input id="givingSetupRecurring" type="checkbox" ${givingSetupDraft.recurringGivingEnabled ? 'checked' : ''}><span><strong>Allow recurring gifts</strong><small>Donors can give weekly, monthly, quarterly, or annually.</small></span></label>
        <label class="giving-setup-toggle"><input id="givingSetupCandles" type="checkbox" ${givingSetupDraft.candlesEnabled ? 'checked' : ''}><span><strong>Accept candle offerings</strong><small>Keep the built-in candles and vigil lights giving choice.</small></span></label>
      </div>
      <div class="giving-setup-plan-note"><strong>${escapeHtml(tier.label)} includes</strong><span>${escapeHtml(tier.featureCopy)}</span></div>
    </div>`;
}

function givingSetupChoicesMarkup(tier) {
  const fundLimit = Number.isFinite(tier.designatedLimit)
    ? `Choose up to ${tier.designatedLimit}`
    : 'Choose any that apply';
  return `<div class="giving-setup-screen">
      <div class="giving-setup-screen-heading"><span>Step 2 of 3</span><h3>Choose giving destinations</h3><p>${escapeHtml(fundLimit)}. Start small—these can always be changed later.</p></div>
      <section class="giving-setup-choice-section"><div class="giving-setup-choice-head"><div><strong>Designated funds</strong><small>Every plan supports unlimited active designated funds.</small></div><em>${givingSetupDraft.designatedFunds.length}${Number.isFinite(tier.designatedLimit) ? ` / ${tier.designatedLimit}` : ''} selected</em></div>${givingSetupChoiceRows(givingSetupDraft.designatedFunds, 'fund')}${givingSetupPresetButtons('fund')}<div class="giving-setup-custom"><input id="givingSetupCustomFund" maxlength="120" placeholder="Or name a different fund"><button type="button" onclick="addGivingSetupCustom('fund')">Add fund</button></div></section>
      ${tier.givingPlus ? `<section class="giving-setup-choice-section"><div class="giving-setup-choice-head"><div><strong>Launch campaigns</strong><small>Optional, time-limited needs. Skip this if there is no current campaign.</small></div><em>${givingSetupDraft.campaigns.length} selected</em></div>${givingSetupChoiceRows(givingSetupDraft.campaigns, 'campaign')}${givingSetupPresetButtons('campaign')}<div class="giving-setup-custom"><input id="givingSetupCustomCampaign" maxlength="120" placeholder="Or name a current campaign"><button type="button" onclick="addGivingSetupCustom('campaign')">Add campaign</button></div></section>` : '<div class="giving-setup-upgrade-note"><strong>Campaigns are not part of Give.</strong><span>You can launch now with General Operating, unlimited designated funds, and candles. Upgrade later if the parish needs campaigns.</span></div>'}
    </div>`;
}

function givingSetupReviewMarkup(tier) {
  const rows = [
    ['AGAPAY plan', tier.label],
    ['Primary fund', givingSetupDraft.general.name || 'General Operating Fund'],
    [
      'Designated funds',
      givingSetupDraft.designatedFunds.length
        ? givingSetupDraft.designatedFunds.map((item) => item.name).join(', ')
        : 'None for launch',
    ],
    ...(tier.givingPlus
      ? [
          [
            'Campaigns',
            givingSetupDraft.campaigns.length
              ? givingSetupDraft.campaigns.map((item) => item.name).join(', ')
              : 'None for launch',
          ],
        ]
      : []),
    ['Recurring giving', givingSetupDraft.recurringGivingEnabled ? 'Enabled' : 'Disabled'],
    ['Candle offerings', givingSetupDraft.candlesEnabled ? 'Enabled' : 'Disabled'],
    [
      'Existing donor records',
      givingSetupDraft.importDecision === 'requested' ? 'Ask AGAPAY about an import' : 'Launch without an import',
    ],
  ];
  return `<div class="giving-setup-screen">
      <div class="giving-setup-screen-heading"><span>Step 3 of 3</span><h3>Review and save</h3><p>This is what donors will see at launch. Saving sends the setup to AGAPAY for the final launch review.</p></div>
      <div class="giving-setup-review">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
      <fieldset class="giving-setup-import"><legend>Do you need help importing existing donors or pledges?</legend><label><input type="radio" name="givingSetupImportDecision" value="none" ${givingSetupDraft.importDecision !== 'requested' ? 'checked' : ''}><span><strong>No, launch without an import</strong><small>You can request an import later.</small></span></label><label><input type="radio" name="givingSetupImportDecision" value="requested" ${givingSetupDraft.importDecision === 'requested' ? 'checked' : ''}><span><strong>Yes, contact me about an import</strong><small>AGAPAY will follow up about your records. You can finish setup now.</small></span></label></fieldset>
      <div class="giving-setup-ready"><span aria-hidden="true">&#10003;</span><div><strong>Ready to save</strong><small>You can reopen this wizard or use Funds &amp; Alms to make changes before launch.</small></div></div>
      <div class="giving-setup-save-status" id="givingSetupSaveStatus" role="status" aria-live="polite"></div>
    </div>`;
}

function renderGivingSetupWizard() {
  const modal = document.getElementById('givingSetupModal');
  if (!modal || !givingSetupDraft) return;
  const tier = givingSetupTierDetails();
  const screen =
    givingSetupWizardStep === 0
      ? givingSetupBasicsMarkup(tier)
      : givingSetupWizardStep === 1
        ? givingSetupChoicesMarkup(tier)
        : givingSetupReviewMarkup(tier);
  modal.innerHTML = `<div class="giving-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="givingSetupTitle">
      <header class="giving-setup-dialog-head"><div><span class="giving-setup-tier">${escapeHtml(tier.label)} setup</span><h2 id="givingSetupTitle">Review giving setup</h2></div><button type="button" class="giving-setup-close" aria-label="Close giving setup" onclick="closeGivingSetupWizard()">&times;</button></header>
      <div class="giving-setup-progress" aria-label="Giving setup progress">${[0, 1, 2].map((step) => `<span class="${step < givingSetupWizardStep ? 'done' : step === givingSetupWizardStep ? 'current' : ''}"><i>${step < givingSetupWizardStep ? '&#10003;' : step + 1}</i>${['Basics', 'Destinations', 'Review'][step]}</span>`).join('')}</div>
      <div class="giving-setup-dialog-body">${screen}</div>
      <footer class="giving-setup-dialog-actions"><button type="button" class="btn btn-ghost" onclick="${givingSetupWizardStep ? 'setGivingSetupWizardStep(' + (givingSetupWizardStep - 1) + ')' : 'closeGivingSetupWizard()'}">${givingSetupWizardStep ? 'Back' : 'Cancel'}</button>${givingSetupWizardStep < 2 ? `<button type="button" class="btn btn-gold" onclick="setGivingSetupWizardStep(${givingSetupWizardStep + 1})">Continue</button>` : '<button type="button" class="btn btn-gold" onclick="saveGivingSetupWizard(this)">Save giving setup</button>'}</footer>
    </div>`;
}

function openGivingSetupWizard() {
  if (givingSetupSaving) return;
  givingSetupReturnFocus = document.activeElement;
  document.getElementById('givingSetupModal')?.remove();
  givingSetupDraft = buildGivingSetupDraft();
  givingSetupWizardStep = 0;
  const modal = document.createElement('div');
  modal.id = 'givingSetupModal';
  modal.className = 'giving-setup-modal';
  document.body.appendChild(modal);
  document.body.classList.add('giving-setup-modal-open');
  document.addEventListener('keydown', givingSetupKeydown);
  renderGivingSetupWizard();
  setTimeout(() => document.getElementById('givingSetupGeneralName')?.focus(), 0);
}

function setGivingSetupWizardStep(step) {
  if (givingSetupSaving) return;
  captureGivingSetupWizardStep();
  if (!givingSetupDraft.general.name) {
    setStatus('Enter the primary giving destination before continuing.', 'error');
    document.getElementById('givingSetupGeneralName')?.focus();
    return;
  }
  givingSetupWizardStep = Math.max(0, Math.min(2, Number(step) || 0));
  renderGivingSetupWizard();
  document.querySelector('#givingSetupModal input, #givingSetupModal button')?.focus();
}

function addGivingSetupPreset(kind, key) {
  if (!givingSetupDraft) return;
  const tier = givingSetupTierDetails();
  const target = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
  if (kind === 'campaign' && !tier.givingPlus) return;
  const preset = (kind === 'fund' ? fundPresets : campaignPresets)[key];
  if (!preset || target.some((item) => item.id === preset.id)) return;
  target.push({
    ...preset,
    enabled: true,
    active: true,
    donorVisible: true,
    givingEnabled: true,
    restrictionType: preset.restrictionType || (kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted'),
  });
  renderGivingSetupWizard();
}

function addGivingSetupCustom(kind) {
  if (!givingSetupDraft) return;
  const tier = givingSetupTierDetails();
  const input = document.getElementById(kind === 'fund' ? 'givingSetupCustomFund' : 'givingSetupCustomCampaign');
  const name = input?.value.trim() || '';
  if (!name) {
    setStatus(`Enter a ${kind === 'fund' ? 'fund' : 'campaign'} name first.`, 'error');
    return;
  }
  const target = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
  if (kind === 'campaign' && !tier.givingPlus) return;
  const id = slugifyLocal(name);
  if (
    !/[a-z0-9]/i.test(name) ||
    ['general', 'stewardship', 'general-operating-fund', 'general-stewardship', 'candles', 'candle'].includes(id) ||
    target.some((item) => String(item.id || '').toLowerCase() === id)
  ) {
    setStatus('Choose a different name. This giving destination already exists or is reserved.', 'error');
    input?.focus();
    return;
  }
  if (target.some((item) => String(item.name || '').toLowerCase() === name.toLowerCase())) {
    setStatus('That giving destination is already selected.', 'error');
    return;
  }
  target.push({
    id,
    name,
    description: kind === 'fund' ? 'Designated support for this parish.' : 'Parish-approved alms for this need.',
    enabled: true,
    active: true,
    donorVisible: true,
    givingEnabled: true,
    restrictionType: kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted',
  });
  renderGivingSetupWizard();
}

function removeGivingSetupChoice(kind, index) {
  if (!givingSetupDraft) return;
  const target = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
  target.splice(Number(index), 1);
  renderGivingSetupWizard();
}

async function saveGivingSetupWizard(button) {
  if (!currentParish || !givingSetupDraft || givingSetupSaving) return;
  captureGivingSetupWizardStep();
  const general = {
    ...givingSetupDraft.general,
    id: 'general',
    code: givingSetupDraft.general.code || 'general',
    reportCode: givingSetupDraft.general.reportCode || 'general',
    name: givingSetupDraft.general.name || 'General Operating Fund',
    description: givingSetupDraft.general.description || fundPresets.general.description,
    restrictionType: 'unrestricted',
    isDefault: true,
    enabled: true,
    active: true,
    donorVisible: true,
    givingEnabled: true,
  };
  const selectedFundIds = new Set(
    givingSetupDraft.designatedFunds.map((fund) => String(fund.id || fund.name || '').toLowerCase())
  );
  const selectedCampaignIds = new Set(
    givingSetupDraft.campaigns.map((campaign) => String(campaign.id || campaign.name || '').toLowerCase())
  );
  const inactiveFunds = editableFunds.filter(
    (fund) =>
      fund &&
      !isGeneralDashboardFund(fund) &&
      !isCandleDashboardFund(fund) &&
      (fund.enabled === false || fund.active === false) &&
      !selectedFundIds.has(String(fund.id || fund.name || '').toLowerCase())
  );
  const candleFunds = editableFunds.filter(isCandleDashboardFund);
  const inactiveCampaigns = editableCampaigns.filter(
    (campaign) =>
      campaign &&
      (campaign.enabled === false || campaign.active === false) &&
      !selectedCampaignIds.has(String(campaign.id || campaign.name || '').toLowerCase())
  );
  const previousFunds = editableFunds;
  const previousCampaigns = editableCampaigns;
  editableFunds = [general, ...givingSetupDraft.designatedFunds, ...candleFunds, ...inactiveFunds];
  if (hasGivingPlusAccess()) editableCampaigns = [...givingSetupDraft.campaigns, ...inactiveCampaigns];
  const recurring = document.getElementById('recurringGivingEnabled');
  const candles = document.getElementById('candlesEnabled');
  const body = {
    funds: editableFunds,
    recurringGivingEnabled: givingSetupDraft.recurringGivingEnabled,
    candlesEnabled: givingSetupDraft.candlesEnabled,
    givingCatalogChanged: givingCatalogSnapshot() !== givingCatalogBaseline,
    accountingCatalogChanged: accountingCatalogSnapshot() !== accountingCatalogBaseline,
    givingSetupReviewed: true,
    importDecision: givingSetupDraft.importDecision === 'requested' ? 'requested' : 'none',
    ...(hasGivingPlusAccess() ? { campaigns: editableCampaigns } : {}),
  };
  // Snapshot helpers read the shared catalog. Restore it before any asynchronous
  // work so failed saves cannot turn an unsaved draft into dashboard state.
  editableFunds = previousFunds;
  editableCampaigns = previousCampaigns;
  givingSetupSaving = true;
  document.querySelectorAll('#givingSetupModal button, #givingSetupModal input').forEach((el) => {
    el.disabled = true;
  });
  const saveStatus = document.getElementById('givingSetupSaveStatus');
  if (saveStatus) {
    saveStatus.className = 'giving-setup-save-status visible';
    saveStatus.textContent = 'Saving your giving setup\u2026';
  }
  if (button) {
    button.classList.add('loading');
    button.disabled = true;
    button.textContent = 'Saving\u2026';
  }
  try {
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || data.detail || 'Unable to save the giving setup.');
    givingSetupSaving = false;
    if (recurring) recurring.checked = body.recurringGivingEnabled;
    if (candles) candles.checked = body.candlesEnabled;
    closeGivingSetupWizard();
    await loadDashboard();
    setStatus('Giving setup saved. AGAPAY can now complete the final launch review.', 'success');
  } catch (error) {
    givingSetupSaving = false;
    document.querySelectorAll('#givingSetupModal button, #givingSetupModal input').forEach((el) => {
      el.disabled = false;
    });
    setStatus(error.message, 'error');
    if (saveStatus?.isConnected) {
      saveStatus.className = 'giving-setup-save-status visible error';
      saveStatus.textContent = error.message || 'Unable to save the giving setup.';
    }
    if (button?.isConnected) {
      button.classList.remove('loading');
      button.disabled = false;
      button.textContent = 'Save giving setup';
    }
  }
}
async function submitTreasurerGoLive(button) {
  const workflow = currentParish?.onboarding;
  const errorEl = document.getElementById('goLiveError');
  if (!workflow?.canGoLive || button.disabled) return;
  const missingConfirmation = document.querySelector('.treasurer-affirmation:not(:checked)');
  const missingIdentity = ['goLiveSignerName', 'goLiveSignerTitle']
    .map((id) => document.getElementById(id))
    .find((input) => !input?.value.trim());
  const authority = document.getElementById('goLiveAuthority');
  const missing = missingConfirmation || missingIdentity || (!authority?.checked && authority);
  if (missing) {
    const message = missingConfirmation
      ? 'Confirm all launch affirmations.'
      : missingIdentity
        ? 'Enter your name and title before launching.'
        : 'Confirm that you are authorized to approve online giving.';
    if (errorEl) errorEl.textContent = message;
    missing.focus();
    return;
  }
  const affirmations = {};
  document.querySelectorAll('.treasurer-affirmation').forEach((input) => {
    affirmations[input.dataset.key] = input.checked;
  });
  const body = {
    snapshotVersion: workflow.materialVersion,
    affirmations,
    signerName: document.getElementById('goLiveSignerName')?.value || '',
    signerTitle: document.getElementById('goLiveSignerTitle')?.value || '',
    authorityConfirmed: Boolean(document.getElementById('goLiveAuthority')?.checked),
  };
  if (errorEl) errorEl.textContent = '';
  button.disabled = true;
  button.textContent = 'Publishing…';
  try {
    const res = await fetch(`/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/onboarding`, {
      method: 'POST',
      headers: { ...authHeaders(), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && ['onboarding_snapshot_changed', 'onboarding_blocked'].includes(data.code) && data.onboarding) {
      if (data.parish) currentParish = { ...currentParish, ...data.parish };
      currentParish.onboarding = data.onboarding;
      renderDashboard();
      const signerName = document.getElementById('goLiveSignerName');
      const signerTitle = document.getElementById('goLiveSignerTitle');
      if (signerName) signerName.value = body.signerName;
      if (signerTitle) signerTitle.value = body.signerTitle;
      const refreshedError = document.getElementById('goLiveError');
      const refreshMessage = data.onboarding.canGoLive
        ? 'The latest launch summary is shown below. Review it, check the confirmations again, and click Go Live.'
        : 'Your setup changed and needs attention before launch. Follow the next step shown above.';
      if (refreshedError) refreshedError.textContent = refreshMessage;
      document.getElementById('treasurerSignoff')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStatus(refreshMessage, 'info');
      return;
    }
    if (!res.ok) throw new Error(data.error || data.errors?.[0] || 'Unable to complete go-live signoff');
    if (data.parish) currentParish = { ...currentParish, ...data.parish };
    if (data.onboarding) currentParish.onboarding = data.onboarding;
    renderDashboard();
    setStatus('Treasurer signoff recorded. The parish giving page is live.', 'success');
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
    setStatus(err.message, 'error');
    button.disabled = false;
    button.textContent = 'Go Live';
  }
}
function renderOnboardingSetup() {
  const pane = document.getElementById('setupWizardPane');
  if (!pane || !currentParish) return;
  if (currentParish.onboarding?.enabled) {
    if (currentParish.onboarding.state === 'LIVE') {
      const credentialStep = (currentParish.onboarding.steps || []).find((step) => step.key === 'credential');
      const paidTreasurerAccessNeeded =
        String(currentParish.subscriptionStatus || '').toLowerCase() === 'active' &&
        credentialStep &&
        !credentialStep.passed;
      renderSimpleParishSetupWizard(currentParish.onboarding);
      pane.innerHTML += paidTreasurerAccessNeeded
        ? `<div class="setup-wizard-card"><div class="setup-wizard-body"><div><div class="onboarding-kicker">Paid account security</div><div class="setup-title">Treasurer access needs one final step</div><p class="setup-copy">Your giving page remains live. We sent the treasurer an individual access link now that the parish subscription is paid.</p></div><div class="setup-action-panel"><strong>Check the treasurer email</strong><p class="setup-copy setup-action-copy">The treasurer creates a personal password once. Trial setup and Go Live never require this second login.</p></div></div></div>`
        : '';
      return;
    }
    renderDeterministicOnboardingWizard(currentParish.onboarding);
    return;
  }
  const setup = currentParish.setup || {};
  const stripeDone = Boolean(setup.stripeConnected);
  const billingDone = Boolean(setup.billingActive);
  if (stripeDone && billingDone) {
    pane.innerHTML = '';
    return;
  }
  const tierOptions = tierOptionsMarkup(currentParish.subscriptionTier);
  const demoEligible = Boolean(currentParish.subscriptionIntroDemoEligible);
  const pendingDemo = currentParish.subscriptionStatus === 'trial_checkout_created';
  const freeDemoPath = demoEligible || pendingDemo;
  pane.innerHTML = `<div class="setup-wizard-card"><div class="setup-wizard-body"><div><div class="setup-title">${freeDemoPath ? 'First-time setup' : 'Continue with AGAPAY'}</div><p class="setup-copy">${freeDemoPath ? 'Start with a free 30-day AGAPAY demo, then connect Stripe so the parish can receive gifts.' : 'Your free demo has ended. Choose a tier and add billing information to restore subscription access.'}</p><div class="setup-steps"><div class="setup-step done">${setupCheckMarkup()}<div><strong>1. Contact info verified</strong><span>Your canonical parish registration has been verified.</span></div></div><div class="setup-step done">${setupCheckMarkup()}<div><strong>2. Choose your ${freeDemoPath ? 'demo ' : ''}tier</strong><span>${escapeHtml(currentParish.subscriptionTierLabel || currentParish.subscriptionTier || 'Your selected tier')} determines which tools are available.</span></div></div><div class="setup-step ${billingDone ? 'done' : ''}">${setupCheckMarkup()}<div><strong>3. ${freeDemoPath ? 'Start the free demo' : 'Activate the subscription'}</strong><span>${billingDone ? 'Your free demo is active. No card was required.' : pendingDemo ? 'Finish the no-card demo confirmation to activate AGAPAY.' : demoEligible ? 'Confirm the free 30-day demo. No card is required.' : 'Add billing information to continue with the selected tier.'}</span></div></div><div class="setup-step ${stripeDone ? 'done' : ''}">${setupCheckMarkup()}<div><strong>4. Connect Stripe for donations</strong><span>${stripeDone ? 'Stripe is connected for parish giving.' : billingDone ? 'Connect the parish payout account. This is separate from AGAPAY billing.' : freeDemoPath ? 'Donation setup unlocks after the demo begins.' : 'Donation setup remains separate from the AGAPAY subscription.'}</span></div></div></div></div><div class="setup-action-panel">${billingDone ? '' : `<label for="setupSubscriptionTier">AGAPAY ${freeDemoPath ? 'demo ' : ''}tier</label><select id="setupSubscriptionTier" onchange="syncParishHouseholdPricing('setupSubscriptionTier','setupParishHouseholdBand','setupParishHouseholdBandGroup','setupParishHouseholdPrice')">${tierOptions}</select>${parishHouseholdPickerMarkup({ tierSelectId: 'setupSubscriptionTier', bandSelectId: 'setupParishHouseholdBand', groupId: 'setupParishHouseholdBandGroup', summaryId: 'setupParishHouseholdPrice' })}<button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startSubscriptionCheckout(this)">${pendingDemo ? 'Continue demo setup' : demoEligible ? 'Start free 30-day demo' : 'Activate subscription'}</button><p class="setup-copy setup-action-copy">${freeDemoPath ? 'No card required. You will add billing information only if you choose to continue after the demo.' : 'Secure checkout collects the billing information needed to reactivate AGAPAY.'}</p>`}${billingDone && !stripeDone ? '<button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startStripeOnboarding(this)">Connect Stripe for donations</button><p class="setup-copy setup-action-copy">This asks for parish payout and organization details—not payment for AGAPAY.</p>' : ''}<div class="setup-link-box" id="setupLinkBox"><a id="setupActionLink" href="#" target="_blank" rel="noopener">${freeDemoPath ? 'Open free demo setup' : 'Open subscription setup'}</a><p id="setupLinkHelp"></p></div></div></div></div>`;
  if (!billingDone)
    syncParishHouseholdPricing(
      'setupSubscriptionTier',
      'setupParishHouseholdBand',
      'setupParishHouseholdBandGroup',
      'setupParishHouseholdPrice'
    );
}

window.ParishFeatureRegistry.register('onboarding', {
  load: renderOnboardingSetup,
  refresh: renderOnboardingSetup,
});
