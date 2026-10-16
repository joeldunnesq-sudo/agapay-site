import type {
  AdminAppRegistration,
  AdminAppPayload,
  AdminAppOptions,
  AdminAppInvite,
  AdminAppError,
} from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const renderQueueNext: AdminAppBindings['renderQueueNext'];
declare const escapeHtml: AdminAppBindings['escapeHtml'];
declare const jsAttr: AdminAppBindings['jsAttr'];
declare const readable: AdminAppBindings['readable'];
declare const setStatus: AdminAppBindings['setStatus'];
declare const onboardingCurrentPhase: AdminAppBindings['onboardingCurrentPhase'];
declare const renderOnboardingCommandHeader: AdminAppBindings['renderOnboardingCommandHeader'];
declare const renderOnboardingProgress: AdminAppBindings['renderOnboardingProgress'];
declare const shortDate: AdminAppBindings['shortDate'];
declare const escapeAttr: AdminAppBindings['escapeAttr'];
declare const subscriptionTierLabel: AdminAppBindings['subscriptionTierLabel'];
declare const money: AdminAppBindings['money'];
declare const field: AdminAppBindings['field'];
declare const transactionFeeLabel: AdminAppBindings['transactionFeeLabel'];
declare const renderStripeRequirements: AdminAppBindings['renderStripeRequirements'];
declare const renderOnboardingControls: AdminAppBindings['renderOnboardingControls'];
declare const adminActor: AdminAppBindings['adminActor'];
declare const renderOnboardingManualChecks: AdminAppBindings['renderOnboardingManualChecks'];
declare const jsonForTextarea: AdminAppBindings['jsonForTextarea'];
declare const renderEmailLog: AdminAppBindings['renderEmailLog'];
declare const renderAdminAuditLog: AdminAppBindings['renderAdminAuditLog'];
declare const renderNotesHistory: AdminAppBindings['renderNotesHistory'];
declare const bindRegistrationAutosave: AdminAppBindings['bindRegistrationAutosave'];
declare let registrationAutosaveTimer: AdminAppBindings['registrationAutosaveTimer'];
declare let registrationAutosaveQueued: AdminAppBindings['registrationAutosaveQueued'];
declare let registrationAutosavePromise: AdminAppBindings['registrationAutosavePromise'];
declare const setRegistrationAutosaveState: AdminAppBindings['setRegistrationAutosaveState'];
declare const readOnboardingChecks: AdminAppBindings['readOnboardingChecks'];
declare const sendDashboardInvite: AdminAppBindings['sendDashboardInvite'];
declare const upsertRegistrationCache: AdminAppBindings['upsertRegistrationCache'];
declare const adminActorKey: AdminAppBindings['adminActorKey'];
declare const renderMetrics: AdminAppBindings['renderMetrics'];
declare let registrationsCache: AdminAppBindings['registrationsCache'];
declare const renderFilteredList: AdminAppBindings['renderFilteredList'];
declare const formatClock: AdminAppBindings['formatClock'];
declare const loadRegistrations: AdminAppBindings['loadRegistrations'];
declare let selectedReference: AdminAppBindings['selectedReference'];
declare const activateOnboardingPhase: AdminAppBindings['activateOnboardingPhase'];

async function runOnboardingTestAction(reference: string, action: string, button?: HTMLButtonElement) {
  if (
    (action === 'reset_workflow' || action === 'reset_signoff') &&
    !window.confirm(
      'Reset this staging onboarding exercise? The giving page will be hidden until the treasurer signs again.'
    )
  )
    return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(`/api/admin/registrations/${encodeURIComponent(reference)}/onboarding-test`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to run staging onboarding control');
    renderDetail(result.registration!);
    renderQueueNext(result.registration!);
    const target = document.getElementById('stagingOnboardingResult');
    if (target) {
      const password = result.stagingPassword || '';
      target.innerHTML = password
        ? `<strong>Single parish trial access created.</strong><span>The parish password is shown once. Use it to test the complete trial setup and Go Live flow; no separate treasurer login is required.</span><code>${escapeHtml(password)}</code><button class="secondary btn-sm" type="button" onclick="copyText('${jsAttr(password)}')">Copy parish password</button>`
        : `<strong>${escapeHtml(readable(action))} complete.</strong><span>The workflow was recalculated from persisted staging data.</span>`;
    }
    setStatus('Staging onboarding state updated.', 'success');
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

function renderDetail(reg: AdminAppRegistration) {
  const reference = jsAttr(reg.reference);
  const publicParishId = escapeHtml(reg.parishId || '');
  const currentPhase = onboardingCurrentPhase(reg);
  const onboardingChecks = reg.onboardingWorkflow?.checks || reg.onboardingChecks || {};
  const paidSubscription = String(reg.subscriptionStatus || '').toLowerCase() === 'active';
  const parishAddress = [
    reg.addressLine1,
    reg.addressLine2,
    [reg.city, reg.state, reg.postalCode].filter(Boolean).join(' '),
    reg.country && reg.country !== 'US' ? reg.country : '',
  ]
    .filter(Boolean)
    .join(', ');
  const priestName = [reg.priestFirst, reg.priestLast].filter(Boolean).join(' ') || 'Not provided';
  const treasurerName = [reg.treasurerFirst, reg.treasurerLast].filter(Boolean).join(' ') || 'Not provided';
  const publicGivingPath = reg.status === 'verified' && reg.parishId ? `/give/${reg.parishId}` : '';
  document.getElementById('registrationDetail')!.innerHTML = `
        ${renderOnboardingCommandHeader(reg)}
        ${renderOnboardingProgress(reg)}
        <details class="onboarding-record-details">
          <summary>
            <span>Registration record &amp; supporting data</span>
            <small>${escapeHtml(reg.parishName || 'Unnamed parish')} &middot; ${escapeHtml(readable(reg.status || 'pending'))} &middot; received ${escapeHtml(shortDate(reg.receivedAt))}</small>
          </summary>
          <div class="onboarding-record-body">
        <div class="onboarding-record-summary-grid">
          <section class="onboarding-record-summary-card">
            <span>Organization</span>
            <strong>${escapeHtml(reg.parishName || 'Unnamed parish')}</strong>
            <p>${escapeHtml([reg.communityType, reg.jurisdiction].filter(Boolean).join(' · ') || 'Type and jurisdiction not provided')}</p>
            <p>${escapeHtml(parishAddress || 'Address not provided')}</p>
            ${reg.website ? `<p class="onboarding-record-emphasis">${escapeHtml(reg.website)}</p>` : ''}
          </section>
          <section class="onboarding-record-summary-card">
            <span>Parish contacts</span>
            <strong>${escapeHtml(priestName)}</strong>
            <p>Priest / administrator &middot; ${escapeHtml(reg.priestEmail || 'email not provided')}</p>
            <strong>${escapeHtml(treasurerName)}</strong>
            <p>Treasurer &middot; ${escapeHtml(reg.treasurerEmail || 'email not provided')}</p>
          </section>
          <section class="onboarding-record-summary-card">
            <span>Readiness</span>
            <div class="onboarding-record-badges">
              <span class="badge ${escapeAttr(reg.status || 'pending')}">${escapeHtml(readable(reg.status || 'pending'))}</span>
              <span class="badge ${escapeAttr(reg.stripeAccountStatus || 'not_started')}">Stripe: ${escapeHtml(readable(reg.stripeAccountStatus || 'not started'))}</span>
              <span class="badge ${escapeAttr(reg.subscriptionStatus || 'not_started')}">Plan: ${escapeHtml(readable(reg.subscriptionStatus || 'not started'))}</span>
            </div>
            <p>${escapeHtml(subscriptionTierLabel(reg))} &middot; ${escapeHtml(money(reg.subscriptionMonthlyCents))}</p>
            <p>Charges ${reg.stripeChargesEnabled ? 'enabled' : 'not enabled'} &middot; payouts ${reg.stripePayoutsEnabled ? 'enabled' : 'not enabled'}</p>
          </section>
          <section class="onboarding-record-summary-card">
            <span>Public giving</span>
            <strong>${escapeHtml(readable(reg.givingStatus || 'not active'))}</strong>
            ${
              publicGivingPath
                ? `<p class="onboarding-record-url">${escapeHtml(publicGivingPath)}</p><p>Published after every gate passes and the treasurer clicks Go Live.</p>`
                : '<p>The public giving URL is created after canonical verification and parish ID assignment.</p>'
            }
          </section>
        </div>
        <details class="onboarding-record-subdetails">
          <summary><span>Giving snapshot &amp; optional parish tools</span><small>Giving totals and Sacraments &amp; Services</small></summary>
          <div class="onboarding-record-subdetails-body">
        <div class="admin-section onboarding-record-tool-row">
          <div class="admin-section-title">Sacraments &amp; Services</div>
          <p class="founding-promo-copy">${reg.sacramentsEnabled ? 'Enabled for this parish.' : 'Not yet enabled for this parish.'}</p>
          <div class="btn-row">
            <button class="secondary btn-sm" onclick="setSacramentsEnabledFromDetail('${publicParishId}', ${!reg.sacramentsEnabled}, this)">${reg.sacramentsEnabled ? 'Disable' : 'Enable'}</button>
          </div>
          <span id="detailSacramentsStatus" class="founding-promo-status"></span>
        </div>
        <div class="admin-section onboarding-record-giving-panel">
          <div class="admin-section-title">Parish Giving Snapshot</div>
          <div class="giving-summary-panel" id="registrationGivingSummary">
            <div class="giving-summary-empty">Loading giving summary…</div>
          </div>
        </div>
          </div>
        </details>
        <details class="onboarding-record-subdetails onboarding-technical-details">
          <summary><span>Technical details &amp; review evidence</span><small>IDs, delivery records, timestamps, and reviewer notes</small></summary>
          <div class="onboarding-record-subdetails-body">
        <div class="grid onboarding-record-technical-grid">
          ${field('Status', reg.status)}
          ${field('Giving Status', reg.givingStatus)}
          ${field('Stripe Status', reg.stripeAccountStatus)}
          ${field('Subscription', `${subscriptionTierLabel(reg)} / ${readable(reg.subscriptionStatus)} / ${money(reg.subscriptionMonthlyCents)}`)}
          ${field('Transaction fee', transactionFeeLabel(reg))}
          ${field('Stripe Account ID', reg.stripeAccountId)}
          ${field('Charges Enabled', reg.stripeChargesEnabled === undefined ? '' : String(reg.stripeChargesEnabled))}
          ${field('Payouts Enabled', reg.stripePayoutsEnabled === undefined ? '' : String(reg.stripePayoutsEnabled))}
          ${field('Stripe Invite Email', reg.stripeOnboardingEmailStatus)}
          ${field('Dashboard Invite Email', reg.dashboardInviteEmailStatus)}
          ${field('AGAPAY Alert Email', reg.adminNotificationEmailStatus)}
          ${field('Dashboard Invite Recipients', Array.isArray(reg.dashboardInviteEmailRecipients) ? reg.dashboardInviteEmailRecipients.join(', ') : '', 'full')}
          ${field('Public Parish ID', reg.parishId)}
          ${field('Parish Dashboard Password', reg.parishDashboardToken || reg.parishDashboardPasswordRecord ? 'Set' : 'Not set')}
          ${field('Received', reg.receivedAt)}
          ${field('Reviewed', reg.reviewedAt)}
          ${field('Community', reg.parishName)}
          ${field('Type', reg.communityType)}
          ${field('Liturgical Calendar', reg.liturgicalCalendar || 'julian')}
          ${field('Jurisdiction', reg.jurisdiction, 'full')}
          ${field('Location', `${reg.city || ''}, ${reg.state || ''}`)}
          ${field('Website', reg.website)}
          ${field('Priest/Admin', `${reg.priestFirst || ''} ${reg.priestLast || ''}`)}
          ${field('Priest Email', reg.priestEmail)}
          ${field('Priest Phone', reg.priestPhone)}
          ${field('Treasurer', `${reg.treasurerFirst || ''} ${reg.treasurerLast || ''}`)}
          ${field('Treasurer Email', reg.treasurerEmail)}
          ${field('Diocese / Deanery', reg.dioceseOrDeanery)}
          ${field('Bishop / Authority', reg.bishopOrAuthority)}
          ${field('Verification Source', reg.verificationSource)}
          ${field('Reviewed By', reg.reviewedBy)}
          ${field('Notes', reg.notes, 'full')}
          ${field('Reviewer Notes', reg.reviewerNotes, 'full')}
        </div>
        ${renderStripeRequirements(reg)}
        ${
          reg.status === 'verified' && reg.parishId
            ? `
          <div class="field full">
            <div class="field-key">Public profile</div>
            <div class="field-val">
              This registration is included in <code>/api/parishes</code> as <strong>${publicParishId}</strong> when giving status is active.
              <br><br>
              Public giving URL: <code>/give/${publicParishId}</code>
            </div>
          </div>
        `
            : ''
        }
          </div>
        </details>
          </div>
        </details>
        <div class="actions onboarding-actions">
          ${renderOnboardingControls(reg)}
          <div class="admin-section onboarding-phase-card ${currentPhase === 'identity' ? 'is-current' : ''}" id="onboarding-phase-identity">
            <button class="onboarding-phase-heading" type="button" onclick="activateOnboardingPhase('identity')"><span>1</span><div><small>Verify parish</small><strong>Verify parish and approving priest</strong></div><em>${currentPhase === 'identity' ? 'Current' : 'Open'}</em></button>
            <div class="onboarding-verification-rule"><strong>Verify the priest, not a public treasurer listing.</strong><p>Confirm the canonical parish and priest through the diocese, jurisdiction, official parish website, or a call to the publicly listed parish number. Then record that verified leader's confirmation of the treasurer's name and email below.</p></div>
            <div class="form-grid">
              <div>
                <label for="statusSelect">Canonical review status</label>
                <select id="statusSelect">
                  <option value="pending" ${reg.status === 'pending' ? 'selected' : ''}>Pending</option>
                  <option value="needs_more_info" ${reg.status === 'needs_more_info' ? 'selected' : ''}>Needs more info</option>
                  <option value="verified" ${reg.status === 'verified' ? 'selected' : ''}>Verified</option>
                  <option value="rejected" ${reg.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                  <option value="cancelled" ${reg.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </div>
              <div>
                <label for="reviewedBy">Reviewed by</label>
                <input id="reviewedBy" value="${escapeAttr(reg.reviewedBy || adminActor())}" placeholder="Reviewer Name" />
              </div>
              <div>
                <label for="verificationSource">Official parish / priest source</label>
                <input id="verificationSource" value="${escapeAttr(reg.verificationSource)}" placeholder="Diocesan directory, jurisdiction site, parish website, or published phone number" />
              </div>
              <div>
                <label for="bishopOrAuthority">Bishop / authority</label>
                <input id="bishopOrAuthority" value="${escapeAttr(reg.bishopOrAuthority)}" placeholder="Bishop or diocesan authority" />
              </div>
              <div class="full">
                <label for="dioceseOrDeanery">Diocese / deanery</label>
                <input id="dioceseOrDeanery" value="${escapeAttr(reg.dioceseOrDeanery)}" placeholder="Diocese, metropolis, deanery, or vicariate" />
              </div>
            </div>
            ${renderOnboardingManualChecks(onboardingChecks, ['authorizedRepresentative'])}
          </div>

          <div class="admin-section onboarding-phase-card ${currentPhase === 'access' ? 'is-current' : ''}" id="onboarding-phase-access">
            <button class="onboarding-phase-heading" type="button" onclick="activateOnboardingPhase('access')"><span>2</span><div><small>Give access</small><strong>${paidSubscription ? 'Set up the treasurer account' : 'Send one parish dashboard credential'}</strong></div><em>${currentPhase === 'access' ? 'Current' : 'Open'}</em></button>
            <div class="onboarding-access-summary">
              ${
                paidSubscription
                  ? `<div class="${reg.onboardingAccess?.treasurer?.status === 'accepted' ? 'accepted' : ''}"><span>Paid treasurer account</span><strong>${escapeHtml(reg.treasurerEmail || 'Email required')}</strong><em>${escapeHtml(readable(reg.onboardingAccess?.treasurer?.status || 'not sent'))}</em></div>`
                  : `<div class="${reg.dashboardInviteEmailStatus === 'sent' ? 'accepted' : ''}"><span>Trial parish credential</span><strong>${escapeHtml(reg.parishId || 'Parish ID assigned after verification')}</strong><em>${reg.dashboardInviteEmailStatus === 'sent' ? 'Sent' : 'Not sent'}</em></div>`
              }
            </div>
            <div class="button-row" style="margin-top:0.75rem;">
              <button class="gold" onclick="sendDashboardInvite('${reference}', this)">${paidSubscription ? (reg.onboardingAccess?.treasurer?.status ? 'Resend treasurer invitation' : 'Send treasurer invitation') : reg.dashboardInviteEmailStatus === 'sent' ? 'Resend parish dashboard access' : 'Send parish dashboard access'}</button>
            </div>
            <label class="check-card" style="margin-top:0.75rem;">
              <input id="autoDashboardInvite" type="checkbox" ${reg.status === 'verified' && reg.dashboardInviteEmailStatus === 'sent' ? '' : 'checked'} />
              ${paidSubscription ? 'Send the treasurer invitation when saving' : 'Send the single parish dashboard credential when saving a verified parish'}
            </label>
            <p style="margin:0.65rem 0 0; color:var(--stone); font-size: 11px; line-height:1.55;">
              ${paidSubscription ? 'A paid subscription requires the treasurer to accept an individual invitation for ongoing financial access.' : 'The 30-day trial uses one parish ID and one dashboard password. No separate priest or treasurer account is required before Go Live.'}
            </p>
          </div>

          <div class="admin-section onboarding-phase-card ${currentPhase === 'subscription' ? 'is-current' : ''}" id="onboarding-phase-subscription">
            <button class="onboarding-phase-heading" type="button" onclick="activateOnboardingPhase('subscription')"><span>4</span><div><small>Configure giving</small><strong>Set the plan, funds, and campaigns</strong></div><em>${currentPhase === 'subscription' ? 'Current' : 'Open'}</em></button>
            <div class="form-grid">
              <div>
                <label for="subscriptionTier">Subscription tier</label>
                <select id="subscriptionTier">
                  <option value="starter" ${['starter', 'mission'].includes(reg.subscriptionTier || '') ? 'selected' : ''}>Give - $9/mo</option>
                  <option value="giving" ${reg.subscriptionTier === 'giving' ? 'selected' : ''}>Give + - $79/mo</option>
                  <option value="parish" ${!reg.subscriptionTier || reg.subscriptionTier === 'parish' ? 'selected' : ''}>Parish - household-priced</option>
                  <option value="diocese" ${reg.subscriptionTier === 'diocese' ? 'selected' : ''}>Cathedral / Diocese - negotiated subscription, no donation fee</option>
                  <option value="monastery_free" ${reg.subscriptionTier === 'monastery_free' ? 'selected' : ''}>Monastery / Skete - no monthly fee, no donation fee</option>
                </select>
              </div>
              <div>
                <label for="parishHouseholdBand">Active parish households</label>
                <select id="parishHouseholdBand">
                  <option value="">Not recorded / legacy</option>
                  <option value="under_50" ${reg.parishHouseholdBand === 'under_50' ? 'selected' : ''}>Fewer than 50</option>
                  <option value="50_149" ${reg.parishHouseholdBand === '50_149' ? 'selected' : ''}>50–149</option>
                  <option value="150_299" ${reg.parishHouseholdBand === '150_299' ? 'selected' : ''}>150–299</option>
                  <option value="300_599" ${reg.parishHouseholdBand === '300_599' ? 'selected' : ''}>300–599</option>
                  <option value="600_plus" ${reg.parishHouseholdBand === '600_plus' ? 'selected' : ''}>600+ / custom</option>
                </select>
              </div>
              <div>
                <label>Pricing program</label>
                <input value="Flat everyday pricing" disabled />
              </div>
              <div>
                <label for="subscriptionStatus">Subscription status</label>
                <select id="subscriptionStatus">
                  <option value="not_started" ${(reg.subscriptionStatus || 'not_started') === 'not_started' ? 'selected' : ''}>Not started</option>
                  <option value="checkout_created" ${reg.subscriptionStatus === 'checkout_created' ? 'selected' : ''}>Checkout created</option>
                  <option value="trial_checkout_created" ${reg.subscriptionStatus === 'trial_checkout_created' ? 'selected' : ''}>Demo checkout created</option>
                  <option value="trialing" ${reg.subscriptionStatus === 'trialing' ? 'selected' : ''}>Free demo</option>
                  <option value="active" ${reg.subscriptionStatus === 'active' ? 'selected' : ''}>Active</option>
                  <option value="past_due" ${reg.subscriptionStatus === 'past_due' ? 'selected' : ''}>Past due</option>
                  <option value="cancelled" ${reg.subscriptionStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                  <option value="free_forever" ${reg.subscriptionStatus === 'free_forever' ? 'selected' : ''}>Free forever</option>
                </select>
              </div>
              <div>
                <label for="stripeCustomerId">Stripe customer ID</label>
                <input id="stripeCustomerId" value="${escapeAttr(reg.stripeCustomerId)}" placeholder="cus_..." />
              </div>
              <div>
                <label for="stripeSubscriptionId">Stripe subscription ID</label>
                <input id="stripeSubscriptionId" value="${escapeAttr(reg.stripeSubscriptionId)}" placeholder="sub_..." />
              </div>
            </div>
            <div class="onboarding-form-divider">Subscription billing address</div>
            <p style="margin:0 0 0.75rem;color:var(--stone);font-size:11px;line-height:1.55;">Inherited from church registration. Stripe Checkout confirms the address and applies AGAPAY's platform-level automatic tax configuration; no parish-by-parish tax approval is required here.</p>
            <div class="form-grid">
              <div>
                <label for="billingLegalName">Billing legal name</label>
                <input id="billingLegalName" value="${escapeAttr(reg.billingLegalName)}" placeholder="Legal/church name for billing" />
              </div>
              <div>
                <label for="billingAddressLine1">Billing address line 1</label>
                <input id="billingAddressLine1" value="${escapeAttr(reg.billingAddressLine1)}" placeholder="Street address" />
              </div>
              <div>
                <label for="billingAddressLine2">Billing address line 2</label>
                <input id="billingAddressLine2" value="${escapeAttr(reg.billingAddressLine2)}" placeholder="Suite, unit (optional)" />
              </div>
              <div>
                <label for="billingCity">Billing city</label>
                <input id="billingCity" value="${escapeAttr(reg.billingCity)}" />
              </div>
              <div>
                <label for="billingState">Billing state / province</label>
                <input id="billingState" value="${escapeAttr(reg.billingState)}" />
              </div>
              <div>
                <label for="billingPostalCode">Billing postal code</label>
                <input id="billingPostalCode" value="${escapeAttr(reg.billingPostalCode)}" />
              </div>
              <div>
                <label for="billingCountry">Billing country</label>
                <input id="billingCountry" value="${escapeAttr(reg.billingCountry || 'US')}" placeholder="US" />
              </div>
            </div>
            <div class="button-row" style="margin-top:0.75rem;">
              <button class="gold" onclick="createSubscriptionCheckout('${reference}', this)">Create subscription checkout</button>
              <button class="secondary" onclick="createSubscriptionCheckout('${reference}', this, { trialDays: 30 })">Create 30-day free demo</button>
            </div>
            <p style="margin:0.65rem 0 0; color:var(--stone); font-size:11px; line-height:1.55;">The demo uses the selected tier, requires no card, and cancels automatically after 30 days unless the church intentionally adds a payment method in Stripe. Donation processing uses the church's separate connected Stripe account.</p>
            <div class="payment-status" id="subscriptionStatusMessage"></div>
            <div class="stripe-link-box" id="subscriptionLinkBox">
              <a id="subscriptionCheckoutLink" href="#" target="_blank" rel="noopener">Open subscription checkout</a>
              <p id="subscriptionLinkHelp">Use this link when the parish is ready to start its AGAPAY monthly platform subscription. AGAPAY does not charge a donation fee; cathedral/diocese subscription pricing is negotiated.</p>
            </div>
            <div class="onboarding-form-divider">Giving configuration</div>
            <div class="form-grid">
              <div>
                <label for="givingStatus">Giving page status</label>
                <select id="givingStatus">
                  <option value="active" ${reg.givingStatus === 'active' ? 'selected' : ''} ${reg.onboardingWorkflow?.enabled && reg.onboardingWorkflow?.state !== 'LIVE' ? 'disabled' : ''}>Active</option>
                  <option value="paused" ${reg.givingStatus === 'paused' ? 'selected' : ''}>Paused</option>
                  <option value="hidden" ${(reg.givingStatus || 'hidden') === 'hidden' ? 'selected' : ''}>Hidden</option>
                  <option value="cancelled" ${reg.givingStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </div>
              <div>
                <label for="liturgicalCalendar">Liturgical calendar</label>
                <select id="liturgicalCalendar">
                  <option value="julian" ${(reg.liturgicalCalendar || 'julian') === 'julian' ? 'selected' : ''}>Julian</option>
                  <option value="gregorian" ${reg.liturgicalCalendar === 'gregorian' ? 'selected' : ''}>Revised-Julian</option>
                </select>
              </div>
              <div class="full">
                <label for="platformFee">Pricing note</label>
                <input id="platformFee" value="${escapeAttr(reg.platformFee)}" placeholder="Standard subscription tier; negotiated for cathedral/diocese" />
              </div>
            </div>
            <div class="toggle-row" style="margin-top:0.75rem;">
              <label class="check-card"><input id="recurringGivingEnabled" type="checkbox" ${(reg.recurringGivingEnabled ?? true) ? 'checked' : ''} /> Recurring giving</label>
              <label class="check-card"><input id="candlesEnabled" type="checkbox" ${(reg.candlesEnabled ?? true) ? 'checked' : ''} /> Candles</label>
              <label class="check-card"><input id="commemorationsEnabled" type="checkbox" ${(reg.commemorationsEnabled ?? true) ? 'checked' : ''} /> Commemorations</label>
            </div>
            <div class="form-grid" style="margin-top:0.75rem;">
              <div>
                <label for="fundsJson">Funds JSON</label>
                <textarea id="fundsJson" spellcheck="false">${jsonForTextarea(reg.funds, [{ id: 'general', name: 'General Operating Fund', description: 'Utilities, supplies, ministries, and day-to-day parish needs.' }])}</textarea>
              </div>
              <div>
                <label for="campaignsJson">Campaigns JSON</label>
                <textarea id="campaignsJson" spellcheck="false">${jsonForTextarea(reg.campaigns, [])}</textarea>
              </div>
            </div>
            ${renderOnboardingManualChecks(onboardingChecks, ['givingConfiguration', 'importDecision'])}
          </div>

          <div class="admin-section onboarding-phase-card ${currentPhase === 'stripe' ? 'is-current' : ''}" id="onboarding-phase-stripe">
            <button class="onboarding-phase-heading" type="button" onclick="activateOnboardingPhase('stripe')"><span>3</span><div><small>Confirm Stripe</small><strong>Verify the parish connection</strong></div><em>${currentPhase === 'stripe' ? 'Current' : 'Open'}</em></button>
            <div class="onboarding-stripe-observer">
              <div><span>Connected account</span><strong>${escapeHtml(reg.stripeAccountId || 'Not detected yet')}</strong></div>
              <div><span>Stripe status</span><strong>${escapeHtml(readable(reg.stripeAccountStatus || 'not started'))}</strong></div>
              <div><span>Charges</span><strong>${reg.stripeChargesEnabled ? 'Enabled' : 'Not enabled'}</strong></div>
              <div><span>Payouts</span><strong>${reg.stripePayoutsEnabled ? 'Enabled' : 'Not enabled'}</strong></div>
            </div>
            <div class="button-row" style="margin-top:0.75rem;">
              <button class="gold" onclick="refreshStripeStatus('${reference}', this)">Check Stripe connection</button>
            </div>
            <div class="payment-status" id="paymentStatus"></div>
            <p style="margin:0.65rem 0 0; color:var(--stone); font-size: 11px; line-height:1.55;">
              The parish connects Stripe from its own dashboard. Admin only checks the saved connection and Stripe readiness; it does not create or send a second onboarding link. If an older Admin save erased the account ID, this check safely rediscovers the account using AGAPAY metadata.
            </p>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Email Log</div>
            <div class="email-log" id="emailLogEntries">
              ${renderEmailLog(reg)}
            </div>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Admin Audit Log</div>
            <div class="audit-log">${renderAdminAuditLog(reg)}</div>
          </div>

          <div class="admin-section">
            <div class="admin-section-title">Internal Notes</div>
            <div class="notes-history">${renderNotesHistory(reg)}</div>
            <label for="reviewerNotes">Reviewer notes</label>
            <textarea id="reviewerNotes" placeholder="Write a note — saved entries stay in history with a timestamp and your name"></textarea>
          </div>
        <div class="button-row">
          <button class="gold" onclick="saveReview('${reference}', this)">Save review</button>
          <button class="secondary" onclick="copyRegistrationSummary()">Copy summary</button>
        </div>
        <div class="mobile-review-bar">
          <button class="secondary" onclick="copyRegistrationSummary()">Copy</button>
          <button class="gold" onclick="saveReview('${reference}', this)">Save review</button>
        </div>
      </div>
      `;
  bindRegistrationAutosave(reg.reference!);
}

function copyRegistrationSummary() {
  const fields = Array.from(document.querySelectorAll<HTMLElement>('#registrationDetail .field'))
    .map((field) => {
      const key = field.querySelector<HTMLElement>('.field-key')?.textContent || '';
      const value = field.querySelector<HTMLElement>('.field-val')?.textContent.trim() || '';
      return `${key}: ${value}`;
    })
    .filter((line) => line.trim() !== ':');
  if (!fields.length) {
    setStatus('No registration loaded yet.', 'error');
    return;
  }
  navigator.clipboard.writeText(fields.join('\n'));
  setStatus('Registration summary copied.', 'success');
}

function dashboardInviteMessage(invite: AdminAppInvite | undefined) {
  if (!invite) return '';
  if (invite.status === 'sent') return ` Dashboard invite sent to ${(invite.recipients || []).join(', ')}.`;
  if (invite.status === 'not_configured')
    return ' Dashboard invite prepared, but email was not sent because RESEND_API_KEY is not configured.';
  if (invite.status === 'missing_recipient')
    return ' Dashboard invite prepared, but no priest or treasurer email is on this registration.';
  if (invite.status === 'failed')
    return ` Dashboard invite email failed: ${invite.detail || 'provider rejected the message'}.`;
  return ` Dashboard invite status: ${invite.status || 'unknown'}.`;
}

async function saveReview(reference: string, btn?: HTMLButtonElement | null, options: AdminAppOptions = {}) {
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  if (!options.autosave) {
    if (registrationAutosaveTimer) clearTimeout(registrationAutosaveTimer);
    registrationAutosaveTimer = null;
    registrationAutosaveQueued = false;
    if (registrationAutosavePromise) await registrationAutosavePromise;
  }

  try {
    const selectedStatus = (document.getElementById('statusSelect') as HTMLSelectElement | null)!.value;
    const shouldSendVerifiedInvite =
      !options.autosave &&
      selectedStatus === 'verified' &&
      (options.sendDashboardInvite ??
        (document.getElementById('autoDashboardInvite') as HTMLInputElement | null)!.checked);
    let funds = [];
    let campaigns = [];
    try {
      funds = JSON.parse((document.getElementById('fundsJson') as HTMLTextAreaElement | null)!.value || '[]');
      campaigns = JSON.parse((document.getElementById('campaignsJson') as HTMLTextAreaElement | null)!.value || '[]');
    } catch {
      if (options.autosave) setRegistrationAutosaveState('Fix invalid JSON to save', 'error');
      else setStatus('Funds or campaigns JSON is invalid.', 'error');
      return false;
    }

    const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference), {
      method: 'PATCH',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: selectedStatus,
        givingStatus: (
          document.getElementById('givingStatus') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        ).value,
        reviewedBy: (document.getElementById('reviewedBy') as HTMLInputElement | null)!.value,
        verificationSource: (document.getElementById('verificationSource') as HTMLInputElement | null)!.value,
        bishopOrAuthority: (document.getElementById('bishopOrAuthority') as HTMLInputElement | null)!.value,
        dioceseOrDeanery: (document.getElementById('dioceseOrDeanery') as HTMLInputElement | null)!.value,
        platformFee: (document.getElementById('platformFee') as HTMLInputElement | null)!.value,
        liturgicalCalendar: (document.getElementById('liturgicalCalendar') as HTMLSelectElement | null)!.value,
        subscriptionTier: (document.getElementById('subscriptionTier') as HTMLSelectElement | null)!.value,
        parishHouseholdBand: (document.getElementById('parishHouseholdBand') as HTMLSelectElement | null)!.value,
        subscriptionStatus: (document.getElementById('subscriptionStatus') as HTMLSelectElement | null)!.value,
        stripeCustomerId: (document.getElementById('stripeCustomerId') as HTMLInputElement | null)!.value,
        stripeSubscriptionId: (document.getElementById('stripeSubscriptionId') as HTMLInputElement | null)!.value,
        recurringGivingEnabled: (document.getElementById('recurringGivingEnabled') as HTMLInputElement | null)!.checked,
        candlesEnabled: (document.getElementById('candlesEnabled') as HTMLInputElement | null)!.checked,
        commemorationsEnabled: (document.getElementById('commemorationsEnabled') as HTMLInputElement | null)!.checked,
        funds,
        campaigns,
        onboardingChecks: readOnboardingChecks(),
        parishDashboardToken:
          (
            document.getElementById('parishDashboardToken') as
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value.trim() || undefined,
        sendDashboardInvite: shouldSendVerifiedInvite,
        reviewerNotes:
          options.includeReviewerNotes === false
            ? ''
            : (document.getElementById('reviewerNotes') as HTMLTextAreaElement | null)!.value,
        billingLegalName: (document.getElementById('billingLegalName') as HTMLInputElement | null)!.value,
        billingAddressLine1: (document.getElementById('billingAddressLine1') as HTMLInputElement | null)!.value,
        billingAddressLine2: (document.getElementById('billingAddressLine2') as HTMLInputElement | null)!.value,
        billingCity: (document.getElementById('billingCity') as HTMLInputElement | null)!.value,
        billingState: (document.getElementById('billingState') as HTMLInputElement | null)!.value,
        billingPostalCode: (document.getElementById('billingPostalCode') as HTMLInputElement | null)!.value,
        billingCountry: (document.getElementById('billingCountry') as HTMLInputElement | null)!.value,
      }),
    });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to save review');

    const finalRegistration = result.registration;
    upsertRegistrationCache(finalRegistration!);

    // Clear the notes textarea after successful save
    const notesEl = document.getElementById('reviewerNotes') as HTMLTextAreaElement | null;
    if (notesEl && options.includeReviewerNotes !== false) notesEl.value = '';
    const reviewerName = (document.getElementById('reviewedBy') as HTMLInputElement | null)?.value.trim();
    if (reviewerName) {
      try {
        sessionStorage.setItem(adminActorKey, reviewerName);
      } catch {}
    }

    renderQueueNext(finalRegistration!);
    if (options.autosave) {
      renderMetrics(registrationsCache);
      renderFilteredList();
      setRegistrationAutosaveState(`Saved ${formatClock(new Date())}`, 'saved');
      return true;
    }

    const activePhase =
      document.querySelector<HTMLElement>('.onboarding-phase-card.is-current')?.id?.replace('onboarding-phase-', '') ||
      '';
    await loadRegistrations({ silent: true, preserveSelection: true });
    if (activePhase && selectedReference === reference) activateOnboardingPhase(activePhase);
    const inviteMessage = dashboardInviteMessage(result.dashboardInvite);
    if (finalRegistration!.status === 'verified' && finalRegistration!.parishId) {
      setStatus(
        `Review saved. ${finalRegistration!.parishName} is verified and hidden while onboarding continues.${inviteMessage}`,
        'success'
      );
      return true;
    }
    setStatus(`Review saved.${inviteMessage}`, 'success');
    return true;
  } catch (err) {
    if (options.autosave) setRegistrationAutosaveState('Save failed - use Save progress', 'error');
    else setStatus((err as AdminAppError).message, 'error');
    return false;
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
export type AdminAppPart6 = {
  runOnboardingTestAction: typeof runOnboardingTestAction;
  renderDetail: typeof renderDetail;
  copyRegistrationSummary: typeof copyRegistrationSummary;
  dashboardInviteMessage: typeof dashboardInviteMessage;
  saveReview: typeof saveReview;
};
