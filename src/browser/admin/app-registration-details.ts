import type {
  AdminAppRegistration,
  AdminAppPayload,
  AdminAppSummary,
  AdminAppOptions,
  AdminAppOnboardingCheck,
  AdminAppError,
} from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare const escapeHtml: AdminAppBindings['escapeHtml'];
declare const moneyShort: AdminAppBindings['moneyShort'];
declare const shortDate: AdminAppBindings['shortDate'];
declare const givingSummaryCache: AdminAppBindings['givingSummaryCache'];
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const readable: AdminAppBindings['readable'];
declare const onboardingManualFields: AdminAppBindings['onboardingManualFields'];
declare const escapeAttr: AdminAppBindings['escapeAttr'];
declare const onboardingPhases: AdminAppBindings['onboardingPhases'];
declare const jsAttr: AdminAppBindings['jsAttr'];

function renderRegistrationGivingSummary(summary: AdminAppSummary | null) {
  const panel = document.getElementById('registrationGivingSummary');
  if (!panel) return;
  if (!summary) {
    panel.innerHTML = '<div class="giving-summary-empty">Loading giving summary…</div>';
    return;
  }
  if (summary.dataSource === 'not_connected') {
    panel.innerHTML = '<div class="giving-summary-empty">Stripe is not connected yet for this parish.</div>';
    return;
  }
  if (summary.dataSource === 'not_configured') {
    panel.innerHTML = '<div class="giving-summary-empty">Stripe reporting is not configured on this environment.</div>';
    return;
  }
  if (summary.error) {
    panel.innerHTML = `<div class="giving-summary-empty">${escapeHtml(summary.error)}</div>`;
    return;
  }

  panel.innerHTML = `
        <div class="giving-summary-grid">
          <div class="giving-summary-stat">
            <strong>${moneyShort(summary.ytdCents || 0)}</strong>
            <span>${summary.year || new Date().getFullYear()} received</span>
          </div>
          <div class="giving-summary-stat">
            <strong>${summary.giftCount || 0}</strong>
            <span>Total gifts</span>
          </div>
          <div class="giving-summary-stat">
            <strong>${summary.lastGiftAt ? shortDate(summary.lastGiftAt) : 'No gifts yet'}</strong>
            <span>Last gift date</span>
          </div>
        </div>
      `;
}

async function loadRegistrationGivingSummary(reference: string, options: AdminAppOptions = {}) {
  const { force = false } = options;
  const cached = givingSummaryCache.get(reference);
  if (cached && !force) {
    renderRegistrationGivingSummary(cached);
    return cached;
  }
  renderRegistrationGivingSummary(null);
  try {
    const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/giving-summary', {
      headers: authHeaders(),
    });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return null;
    if (!response.ok) throw new Error(result.detail || result.error || 'Unable to load giving summary');
    const summary = result.summary || {};
    givingSummaryCache.set(reference, summary);
    renderRegistrationGivingSummary(summary);
    return summary;
  } catch (err) {
    const summary = { error: (err as AdminAppError).message || 'Unable to load giving summary.' };
    renderRegistrationGivingSummary(summary);
    return summary;
  }
}

function renderAdminAuditLog(reg: AdminAppRegistration) {
  const entries = Array.isArray(reg.adminAuditLog) ? reg.adminAuditLog.slice().reverse() : [];
  if (!entries.length) {
    return '<div class="audit-log-empty">No admin actions logged for this registration yet.</div>';
  }
  return entries
    .map((entry) => {
      const details =
        entry.details && typeof entry.details === 'object'
          ? Object.entries(entry.details).filter(([, value]) => value !== '' && value !== null && value !== undefined)
          : [];
      const detailText = details.length
        ? details
            .map(([key, value]) => `${readable(key)}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join(' · ')
        : 'No extra details.';
      return `
          <div class="audit-log-entry">
            <div class="audit-log-head">
              <strong>${escapeHtml(readable(entry.action || 'unknown'))}</strong>
              <span>${escapeHtml(shortDate(entry.at))}</span>
            </div>
            <div class="audit-log-meta">By ${escapeHtml(entry.actor || 'Admin')}</div>
            <div class="audit-log-detail">${escapeHtml(detailText)}</div>
          </div>
        `;
    })
    .join('');
}

function onboardingStatusOptions(status: string, key: string) {
  const values = [
    ['not_started', 'Not started'],
    ['in_progress', 'In progress'],
    ['blocked', 'Blocked'],
    ['passed', 'Passed'],
  ];
  if (key === 'importDecision') values.push(['not_applicable', 'Not applicable']);
  return values
    .map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function renderOnboardingManualChecks(checks: Record<string, AdminAppOnboardingCheck>, keys: string[]) {
  return `<div class="onboarding-manual-list">${keys
    .map((key) => {
      const definition = onboardingManualFields.find(([fieldKey]) => fieldKey === key);
      if (!definition) return '';
      const [
        ,
        label,
        help,
        evidenceLabel = 'Evidence reference',
        evidencePlaceholder = 'Payment ID, screenshot, ticket, or source link',
        noteLabel = 'Operator note',
        notePlaceholder = 'What was checked and by whom?',
      ] = definition;
      const check = checks[key] || {};
      return `<details class="onboarding-manual-row" ${check.status === 'blocked' || check.status === 'in_progress' || check.status === 'not_started' ? 'open' : ''}>
          <summary><span class="onboarding-manual-state ${escapeAttr(check.status || 'not_started')}"></span><strong>${escapeHtml(label)}</strong><em>${escapeHtml(readable(check.status || 'not_started'))}</em></summary>
          <p>${escapeHtml(help)}</p>
          <div class="form-grid">
            <div><label for="onboarding-${key}-status">Status</label><select id="onboarding-${key}-status">${onboardingStatusOptions(check.status || 'not_started', key)}</select></div>
            <div><label for="onboarding-${key}-evidence">${escapeHtml(evidenceLabel)}</label><input id="onboarding-${key}-evidence" value="${escapeAttr(check.evidence || '')}" placeholder="${escapeAttr(evidencePlaceholder)}" /></div>
            <div class="full"><label for="onboarding-${key}-note">${escapeHtml(noteLabel)}</label><textarea id="onboarding-${key}-note" rows="2" placeholder="${escapeAttr(notePlaceholder)}">${escapeHtml(check.note || '')}</textarea></div>
          </div>
        </details>`;
    })
    .join('')}</div>`;
}

function renderOnboardingProgress(reg: AdminAppRegistration) {
  const workflow = reg.onboardingWorkflow || {};
  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const completed = Number(workflow.completedSteps || 0);
  const total = Number(workflow.totalSteps || steps.length || 17);
  return `
        <details class="onboarding-workflow-audit">
          <summary><span>Audit checklist</span><strong>${completed} of ${total} gates complete</strong><em>View details</em></summary>
          <div class="onboarding-gates-disclosure">
            <div class="onboarding-step-grid">
            ${steps.map((item, index) => `<div class="onboarding-step ${item.passed ? 'done' : 'pending'}"><span>${item.passed ? '✓' : index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail || '')}</small></div></div>`).join('')}
            </div>
          </div>
        </details>`;
}

function onboardingCurrentPhase(reg: AdminAppRegistration) {
  const workflow = reg.onboardingWorkflow || {};
  if (workflow.state === 'LIVE' || workflow.canGoLive) return 'subscription';
  const key = workflow.blockers?.[0]?.key || 'registration';
  if (['registration', 'canonical', 'representative', 'verifiedHidden'].includes(key)) return 'identity';
  if (['invite', 'credential'].includes(key)) return 'access';
  if (['stripeConnected', 'stripeReady'].includes(key)) return 'stripe';
  if (['subscription', 'generalFund', 'givingConfiguration', 'importDecision'].includes(key)) return 'subscription';
  return 'subscription';
}

function onboardingPhaseState(reg: AdminAppRegistration, phase: string) {
  if (reg.onboardingWorkflow?.state === 'LIVE') return 'done';
  const currentIndex = onboardingPhases.findIndex(([key]) => key === onboardingCurrentPhase(reg));
  const index = onboardingPhases.findIndex(([key]) => key === phase);
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

function activateOnboardingPhase(phase: string) {
  document
    .querySelectorAll<HTMLElement>('.onboarding-phase-card')
    .forEach((card) => card.classList.remove('is-current'));
  const target = document.getElementById(`onboarding-phase-${phase}`);
  if (!target) return;
  target.classList.add('is-current');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onboardingActionTitle(title: string | undefined) {
  const actions: Record<string, string> = {
    'Registration received': 'Review registration',
    'Canonical parish confirmed': 'Confirm canonical parish',
    'Approving priest confirmed treasurer': 'Record priest confirmation of the treasurer',
    'Organization verified and hidden': 'Verify organization and keep giving hidden',
    'Dashboard invite delivered': 'Send parish dashboard access',
    'Parish dashboard access secured': 'Wait for the parish credential to be secured',
    'Treasurer dashboard access secured': 'Send or confirm the paid treasurer account',
    'Stripe connected': 'Connect Stripe',
    'Stripe charges and payouts ready': 'Confirm Stripe charges and payouts',
    'Subscription configured': 'Configure the subscription',
    'General Operating Fund configured': 'Configure the General Operating Fund',
    'Designated funds and campaigns approved': 'Approve designated funds and campaigns',
    'Donor and pledge import decided': 'Decide the donor and pledge import',
    'Giving URL and QR verified': 'Verify the giving URL and QR code',
  };
  return actions[title!] || title || 'Continue onboarding';
}

function renderOnboardingCommandHeader(reg: AdminAppRegistration) {
  const workflow = reg.onboardingWorkflow || {};
  const state = workflow.state || (reg.status === 'verified' ? 'VERIFIED_HIDDEN' : 'IDENTITY_REVIEW');
  const next = (workflow.blockers || [])[0];
  const actionTitle =
    state === 'LIVE'
      ? 'Launch complete'
      : workflow.canGoLive
        ? 'Waiting for treasurer Go-Live signoff'
        : onboardingActionTitle(next?.title || 'Confirm the canonical parish');
  const actionDetail =
    state === 'LIVE'
      ? 'Giving is public and the treasurer-approved snapshot is on record.'
      : workflow.canGoLive
        ? 'The configuration is locked. The verified treasurer must review all eight attestations and publish from the parish dashboard.'
        : next?.detail ||
          'Verify the canonical parish and priest from an official source. The verified priest or parish leader confirms the treasurer.';
  const location = [reg.communityType, reg.jurisdiction, [reg.city, reg.state].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
  const currentPhase = onboardingCurrentPhase(reg);
  const completed = Number(workflow.completedSteps || 0);
  const total = Number(workflow.totalSteps || 17);
  return `<section class="onboarding-command-header">
        <div class="onboarding-command-main">
          <button class="onboarding-back-link" type="button" onclick="collapseRegistrationDetail()">← Parish queue</button>
          <div class="onboarding-command-eyebrow">${escapeHtml(reg.reference || '')}</div>
          <h2>${escapeHtml(reg.parishName || 'Unnamed parish')}</h2>
          <p>${escapeHtml(location || 'Registration details pending')}</p>
        </div>
        <div class="onboarding-command-next ${state === 'LIVE' ? 'complete' : ''}">
          <span>${state === 'LIVE' ? 'Complete' : 'Do this now'}</span>
          <strong>${escapeHtml(actionTitle)}</strong>
          <p>${escapeHtml(actionDetail)}</p>
          ${state === 'LIVE' ? '' : `<button class="gold btn-sm" type="button" onclick="activateOnboardingPhase('${currentPhase}')">Open this step</button>`}
        </div>
        <div class="onboarding-command-actions">
          <span><b id="registrationAutosaveState" data-state="saved">Changes save automatically</b> &middot; ${completed} of ${total} required checks complete</span>
          <button class="secondary btn-sm" type="button" onclick="copyRegistrationSummary()">Copy</button>
          <button class="gold btn-sm" type="button" onclick="saveReview('${jsAttr(reg.reference)}', this)">Save progress</button>
        </div>
        <nav class="onboarding-phase-nav" aria-label="Onboarding phases">
          ${onboardingPhases
            .map(([key, label], index) => {
              const phaseState = onboardingPhaseState(reg, key);
              return `<button class="${phaseState}" type="button" onclick="activateOnboardingPhase('${key}')"><span>${phaseState === 'done' ? '✓' : index + 1}</span><strong>${escapeHtml(label)}</strong><small>${phaseState === 'current' ? 'Current step' : phaseState === 'done' ? 'Complete' : 'Later'}</small></button>`;
            })
            .join('')}
        </nav>
      </section>`;
}

function renderOnboardingControls(reg: AdminAppRegistration) {
  const workflow = reg.onboardingWorkflow || {};
  const signoff = workflow.signoff || {};
  return `<div class="admin-section onboarding-admin-section onboarding-ready-panel">
        <div class="onboarding-signoff-state ${signoff.status === 'signed' ? 'signed' : workflow.canGoLive ? 'ready' : 'waiting'}">
          <span>${signoff.status === 'signed' ? 'Launch complete' : workflow.canGoLive ? 'Waiting for treasurer' : 'Launch readiness'}</span>
          <strong>${signoff.status === 'signed' ? `${escapeHtml(signoff.signerName || 'Treasurer')} approved launch ${escapeHtml(shortDate(signoff.signedAt))}` : workflow.canGoLive ? 'The parish has one final action: review and launch.' : 'Complete the current setup action. AGAPAY handles internal launch checks.'}</strong>
          <small>The parish sees only three steps: accept access, connect payments, and review and launch.</small>
        </div>
        ${reg.onboardingTestMode ? `<div class="onboarding-staging-tools"><div><span>Staging only</span><strong>Test the 10-minute parish setup</strong><p>Prepare a ready parish record, then open the parish dashboard to test the treasurer review and launch.</p></div><div class="btn-row"><button class="secondary btn-sm" type="button" onclick="runOnboardingTestAction('${jsAttr(reg.reference)}','reset_workflow',this)">Reset test</button><button class="gold btn-sm" type="button" onclick="runOnboardingTestAction('${jsAttr(reg.reference)}','prepare_ready',this)">Prepare parish test</button></div><div id="stagingOnboardingResult" class="staging-onboarding-result" aria-live="polite"></div></div>` : ''}
      </div>`;
}

function readOnboardingChecks() {
  return Object.fromEntries(
    onboardingManualFields.map(([key]) => [
      key,
      {
        status:
          (
            document.getElementById(`onboarding-${key}-status`) as
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value || 'not_started',
        evidence:
          (
            document.getElementById(`onboarding-${key}-evidence`) as
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value.trim() || '',
        note:
          (
            document.getElementById(`onboarding-${key}-note`) as
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value.trim() || '',
      },
    ])
  );
}
export type AdminAppPart5 = {
  renderRegistrationGivingSummary: typeof renderRegistrationGivingSummary;
  loadRegistrationGivingSummary: typeof loadRegistrationGivingSummary;
  renderAdminAuditLog: typeof renderAdminAuditLog;
  onboardingStatusOptions: typeof onboardingStatusOptions;
  renderOnboardingManualChecks: typeof renderOnboardingManualChecks;
  renderOnboardingProgress: typeof renderOnboardingProgress;
  onboardingCurrentPhase: typeof onboardingCurrentPhase;
  onboardingPhaseState: typeof onboardingPhaseState;
  activateOnboardingPhase: typeof activateOnboardingPhase;
  onboardingActionTitle: typeof onboardingActionTitle;
  renderOnboardingCommandHeader: typeof renderOnboardingCommandHeader;
  renderOnboardingControls: typeof renderOnboardingControls;
  readOnboardingChecks: typeof readOnboardingChecks;
};
