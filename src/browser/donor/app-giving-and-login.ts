import type {
  DonorAppParish,
  DonorAppFund,
  DonorAppCampaign,
  DonorAppError,
  DonorAppOptions,
} from './app-contracts.js';
import type { DonorAppBindings } from './app.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
declare const truthyDonor: DonorAppBindings['truthyDonor'];

declare const normalizeDonorGiftType: DonorAppBindings['normalizeDonorGiftType'];
declare const activeParishFeastCampaigns: DonorAppBindings['activeParishFeastCampaigns'];
declare const activeParishCampaigns: DonorAppBindings['activeParishCampaigns'];
declare const escapeHtml: DonorAppBindings['escapeHtml'];
declare const money: DonorAppBindings['money'];
declare const donorGiftUrl: DonorAppBindings['donorGiftUrl'];
declare const parishHasGivingPlus: DonorAppBindings['parishHasGivingPlus'];
declare const isGeneralDonorFund: DonorAppBindings['isGeneralDonorFund'];
declare const quickDonorGiftUrl: DonorAppBindings['quickDonorGiftUrl'];
declare const isCandleDonorFund: DonorAppBindings['isCandleDonorFund'];
declare const nextFeastForCalendar: DonorAppBindings['nextFeastForCalendar'];
declare const shortDate: DonorAppBindings['shortDate'];
declare const calendarLabel: DonorAppBindings['calendarLabel'];
declare const donorGiftTypeCopy: DonorAppBindings['donorGiftTypeCopy'];
declare const setText: DonorAppBindings['setText'];
declare let activeDonorGiftType: DonorAppBindings['activeDonorGiftType'];
declare const updateGivingTierTiles: DonorAppBindings['updateGivingTierTiles'];
declare const isGivingPlusGiftType: DonorAppBindings['isGivingPlusGiftType'];
declare const parishCanUseGiftType: DonorAppBindings['parishCanUseGiftType'];
declare const openGivingPlusPaywall: DonorAppBindings['openGivingPlusPaywall'];
declare const syncDonorCommemorationAmount: DonorAppBindings['syncDonorCommemorationAmount'];
declare let donorGiftAmountEdited: DonorAppBindings['donorGiftAmountEdited'];
declare const setDonorStatus: DonorAppBindings['setDonorStatus'];
declare const donorApi: DonorAppBindings['donorApi'];
declare const saveDonorSession: DonorAppBindings['saveDonorSession'];
declare const loadDonorDashboardPage: DonorAppBindings['loadDonorDashboardPage'];
declare const loadDonorCommemorationsPage: DonorAppBindings['loadDonorCommemorationsPage'];
declare const donorLoginReturnPath: DonorAppBindings['donorLoginReturnPath'];
declare const clearDonorSession: DonorAppBindings['clearDonorSession'];
declare const isDonorUnauthorized: DonorAppBindings['isDonorUnauthorized'];

function selectedPublicParish() {
  const selected =
    (document.getElementById('parish') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '';
  return (window.agapayPublicParishes || []).find((parish) => parish.id === selected) || null;
}

function campaignLabel(campaign: DonorAppCampaign | null | undefined) {
  return campaign?.name || campaign?.campaignName || 'Parish Campaign';
}

function campaignGoalCents(campaign: DonorAppCampaign | null | undefined) {
  return Number(campaign?.goalCents || campaign?.targetCents || campaign?.goalAmountCents || 0);
}

function campaignRaisedCents(campaign: DonorAppCampaign | null | undefined) {
  return Number(campaign?.raisedCents || campaign?.amountCents || campaign?.currentCents || 0);
}

function campaignImageUrl(campaign: DonorAppCampaign | null | undefined) {
  const photos = Array.isArray(campaign?.photos) ? campaign.photos : [];
  const firstPhoto = photos.find(Boolean);
  return (
    campaign?.coverPhotoUrl ||
    campaign?.coverUrl ||
    campaign?.imageUrl ||
    campaign?.photoUrl ||
    (typeof firstPhoto === 'string' ? firstPhoto : (firstPhoto as { url?: string } | undefined)?.url) ||
    ''
  );
}

function selectedCampaign() {
  const selected = (document.getElementById('campaign') as HTMLSelectElement | null)?.value || '';
  if (!selected) return null;
  const giftType = normalizeDonorGiftType((document.getElementById('giftType') as HTMLSelectElement | null)?.value);
  const campaigns =
    giftType === 'feast'
      ? activeParishFeastCampaigns(selectedPublicParish())
      : activeParishCampaigns(selectedPublicParish());
  return (
    campaigns.find((campaign) => {
      const keys = [campaign.id, campaign.feastId, campaign.name, campaign.campaignName]
        .filter(truthyDonor)
        .map(String);
      return keys.includes(selected);
    }) || null
  );
}

function populateGiftOptionFields() {
  const parish = selectedPublicParish();
  const fundSelect = document.getElementById('fund') as HTMLSelectElement | null;
  if (fundSelect) {
    const current = fundSelect.value;
    const funds = Array.isArray(parish?.funds) ? parish.funds : [];
    fundSelect.innerHTML = funds.length
      ? funds
          .map(
            (fund) =>
              `<option value="${escapeHtml(fund.id || fund.name)}">${escapeHtml(fund.name || fund.id || 'Designated fund')}</option>`
          )
          .join('')
      : '<option value="">No designated funds listed</option>';
    if (current && Array.from(fundSelect.options).some((option) => option.value === current))
      fundSelect.value = current;
  }

  const campaignSelect = document.getElementById('campaign') as HTMLSelectElement | null;
  if (campaignSelect) {
    const current = campaignSelect.value;
    const giftType = normalizeDonorGiftType((document.getElementById('giftType') as HTMLSelectElement | null)?.value);
    const campaigns = giftType === 'feast' ? activeParishFeastCampaigns(parish) : activeParishCampaigns(parish);
    campaignSelect.innerHTML = campaigns.length
      ? campaigns
          .map(
            (campaign) =>
              `<option value="${escapeHtml(campaign.id || campaign.feastId || campaign.name || campaign.campaignName)}">${escapeHtml(campaignLabel(campaign))}${campaign.patronal ? ' · Parish feast day' : ''}</option>`
          )
          .join('')
      : '<option value="">No active campaigns</option>';
    if (current && Array.from(campaignSelect.options).some((option) => option.value === current))
      campaignSelect.value = current;
  }
}

function renderCampaignChoicePreview(campaign: DonorAppCampaign | null | undefined) {
  const target = document.getElementById('campaignPreview');
  if (!target) return;
  if (!campaign) {
    target.innerHTML = '<p class="form-help">No active parish campaign is available for this church right now.</p>';
    return;
  }
  const goalCents = campaignGoalCents(campaign);
  const raisedCents = campaignRaisedCents(campaign);
  const percent = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  target.innerHTML = `
    <div class="gift-option-preview">
      <strong>${escapeHtml(campaignLabel(campaign))}</strong>
      ${campaign.description ? `<span>${escapeHtml(campaign.description)}</span>` : ''}
      ${goalCents > 0 ? `<div class="campaign-track"><span style="width:${percent}%"></span></div><small>${money(raisedCents)} of ${money(goalCents)} raised (${percent}%)</small>` : '<small>No public goal set yet.</small>'}
    </div>
  `;
}

function donorSlugify(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function campaignShareUrl(parish: DonorAppParish | null | undefined, campaign: DonorAppCampaign | null | undefined) {
  const parishId = parish?.id;
  if (!parishId || !campaign) return '';
  const slug = campaign.slug || donorSlugify(campaign.name || campaign.campaignName || campaign.id || '');
  if (!slug) return '';
  const origin = String(window.location.origin || '').replace(/\/+$/, '');
  return `${origin}/give/${encodeURIComponent(parishId)}/${slug}-campaign`;
}

async function shareCampaign(event: Event, btn: HTMLElement | null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const url = btn?.getAttribute('data-share-url') || '';
  const title = btn?.getAttribute('data-share-title') || 'Parish Campaign';
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `Support ${title} through AGAPAY`, url });
      return;
    } catch (err) {
      if (err && (err as DonorAppError).name === 'AbortError') return;
    }
  }
  const label = btn!.querySelector<HTMLElement>('span');
  try {
    await navigator.clipboard.writeText(url);
    if (label) {
      const prev = label.textContent;
      label.textContent = 'Link copied';
      setTimeout(() => {
        label.textContent = prev;
      }, 1800);
    }
  } catch {
    window.prompt('Copy this campaign link', url);
  }
}

function renderActiveCampaigns(parish: DonorAppParish | null | undefined, { confirmed = false }: DonorAppOptions = {}) {
  const targets = [
    document.getElementById('activeCampaigns'),
    document.getElementById('desktopActiveCampaigns'),
  ].filter(truthyDonor);
  if (!targets.length) return;
  const campaign = activeParishCampaigns(parish)[0];
  if (!campaign) {
    if (!confirmed) return;
    const empty = `
      <article class="campaign-card campaign-empty">
        <span class="campaign-pill">Campaigns</span>
        <h3>No Active Campaigns</h3>
        <p>${parish?.name ? 'This church does not have an active campaign right now.' : 'Sign in and select a church to see parish-approved campaigns here.'}</p>
      </article>
    `;
    targets.forEach((target) => {
      target.innerHTML = empty;
    });
    return;
  }

  const goalCents = Number(campaign.goalCents || campaign.targetCents || campaign.goalAmountCents || 0);
  const raisedCents = Number(campaign.raisedCents || campaign.amountCents || campaign.currentCents || 0);
  const percent = goalCents > 0 ? Math.min(100, Math.floor((raisedCents / goalCents) * 100)) : 0;
  const link = donorGiftUrl('campaign', parish, { campaign: campaign.id || campaign.feastId || campaign.name });
  const imageUrl = campaignImageUrl(campaign);
  const description = campaign.description || 'Support this parish-approved campaign.';
  // Show the donor their own contribution to this campaign (server attaches
  // donorGivenCents only for an authenticated donor, so this stays hidden in
  // the signed-out/public view). A $0 state gently invites a first gift.
  const hasDonorContext = typeof campaign.donorGivenCents === 'number';
  const givenCents = Number(campaign.donorGivenCents || 0);
  const giftCount = Number(campaign.donorGiftCount || 0);
  const cygHeart =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const youGaveBlock = !hasDonorContext
    ? ''
    : givenCents > 0
      ? `<div class="campaign-you-gave has-given"><span class="cyg-icon">${cygHeart}</span><span class="cyg-body"><span class="cyg-label">Your giving to this campaign</span><span class="cyg-amount">${money(givenCents)}</span>${giftCount > 1 ? `<span class="cyg-sub">across ${giftCount} gifts</span>` : ''}</span></div>`
      : `<div class="campaign-you-gave no-given"><span class="cyg-icon">${cygHeart}</span><span class="cyg-body"><span class="cyg-label">You haven't given to this campaign yet</span><span class="cyg-sub">Be part of it &mdash; every gift helps.</span></span></div>`;
  const shareUrl = campaignShareUrl(parish, campaign);
  const shareBtn = shareUrl
    ? `<button type="button" class="campaign-share-btn" onclick="shareCampaign(event, this)" data-share-url="${escapeHtml(shareUrl)}" data-share-title="${escapeHtml(campaign.name || 'Parish Campaign')}" aria-label="Share this campaign" style="position:absolute;top:10px;right:10px;z-index:2;display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border:0;border-radius:999px;background:rgba(6,21,34,.82);color:#fff;font:600 12px/1 'DM Sans',system-ui,sans-serif;cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(6,21,34,.28);"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg><span>Share</span></button>`
    : '';
  const html = `
    <div class="campaign-card-shell" style="position:relative;">
      <a class="campaign-card campaign-media-card" href="${escapeHtml(link)}">
        <div class="campaign-media-thumb">
          ${
            imageUrl
              ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`
              : `<span>${escapeHtml((campaign.name || 'Campaign').slice(0, 1))}</span>`
          }
        </div>
        <div class="campaign-media-body">
          <h3>${escapeHtml(campaign.name || 'Parish Campaign')}</h3>
          ${goalCents > 0 ? `<div class="campaign-track"><span style="width:${percent}%"></span></div>` : ''}
          ${goalCents > 0 ? `<div class="campaign-progress-row"><strong>${money(raisedCents)} raised</strong><span>${percent}% of ${money(goalCents)}</span></div>` : ''}
          <p class="campaign-description">${escapeHtml(description)}</p>
          ${youGaveBlock}
        </div>
      </a>
      ${shareBtn}
    </div>
  `;
  targets.forEach((target) => {
    target.innerHTML = html;
  });
}

function fundLabel(fund: DonorAppFund) {
  return fund?.name || fund?.label || fund?.id || 'Designated fund';
}

function renderActiveFunds(parish: DonorAppParish | null | undefined, { confirmed = false }: DonorAppOptions = {}) {
  const targets = [document.getElementById('activeFunds'), document.getElementById('desktopActiveFunds')].filter(
    truthyDonor
  );
  if (!targets.length) return;
  if (parish && !parishHasGivingPlus(parish)) {
    const starterFunds =
      Array.isArray(parish.funds) && parish.funds.length
        ? parish.funds.slice(0, 2)
        : [{ name: 'General Operating Fund', description: "Support your parish's day-to-day mission." }];
    const html = starterFunds
      .map((starterFund) => {
        const general = isGeneralDonorFund(starterFund);
        return `
      <article class="active-funds-card">
        <div>
          <span class="campaign-pill">${general ? 'General fund' : 'Designated fund'}</span>
          <h3>${escapeHtml(fundLabel(starterFund))}</h3>
          <p>${escapeHtml(starterFund.description || "Support your parish's day-to-day mission.")}</p>
        </div>
        <div class="starter-fund-actions">
          <a href="${escapeHtml(quickDonorGiftUrl(general ? 'stewardship' : 'fund', parish, general ? { frequency: 'once' } : { fund: starterFund.id || starterFund.name }))}">${general ? 'One-time' : 'Give'}</a>
          ${general ? `<a href="${escapeHtml(quickDonorGiftUrl('stewardship', parish, { frequency: 'monthly' }))}">Recurring</a>` : ''}
        </div>
      </article>`;
      })
      .join('');
    targets.forEach((target) => {
      target.innerHTML = html;
    });
    return;
  }
  const funds = (Array.isArray(parish?.funds) ? parish.funds : [])
    .filter(
      (fund) =>
        fund &&
        !isCandleDonorFund(fund) &&
        fund.active !== false &&
        String(fund.status || 'active').toLowerCase() !== 'archived'
    )
    .slice(0, 4);
  if (!funds.length) {
    if (!confirmed) return;
    const empty = `
      <article class="active-funds-card active-funds-empty">
        <span class="campaign-pill">Funds</span>
        <h3>No Active Funds</h3>
        <p>${parish?.name ? 'This church has not listed designated funds yet.' : 'Sign in and select a church to see its active giving funds.'}</p>
      </article>
    `;
    targets.forEach((target) => {
      target.innerHTML = empty;
    });
    return;
  }
  const html = funds
    .map((fund) => {
      const label = fundLabel(fund);
      const description = fund.description || fund.note || 'Give directly to this parish fund.';
      const link = donorGiftUrl('fund', parish, { fund: fund.id || fund.name || label });
      return `
      <article class="active-funds-card">
        <div>
          <span class="campaign-pill">Fund</span>
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <a href="${escapeHtml(link)}">Donate</a>
      </article>
    `;
    })
    .join('');
  targets.forEach((target) => {
    target.innerHTML = html;
  });
}

function renderNextFeast(parish: DonorAppParish | null | undefined, { confirmed = false }: DonorAppOptions = {}) {
  const targets = [
    {
      name: document.getElementById('nextFeastName'),
      date: document.getElementById('nextFeastDate'),
      calendar: document.getElementById('nextFeastCalendar'),
      link: document.getElementById('nextFeastLink') as HTMLAnchorElement | null,
    },
    {
      name: document.getElementById('desktopNextFeastName'),
      date: document.getElementById('desktopNextFeastDate'),
      calendar: document.getElementById('desktopNextFeastCalendar'),
      link: document.getElementById('desktopNextFeastLink') as HTMLAnchorElement | null,
    },
  ].filter((target) => target.name && target.date && target.calendar);
  if (!targets.length) return;
  if (!parish) {
    if (!confirmed) return;
    targets.forEach((target) => {
      target.calendar!.textContent = 'Next Feast Day:';
      target.name!.textContent = 'Next feast day';
      target.date!.textContent = 'Sign in and select a church to see the next feast for its calendar.';
      if (target.link) target.link.href = '/myagapay/giving/give?giftType=feast';
    });
    return;
  }
  const feast = nextFeastForCalendar(parish.liturgicalCalendar);
  targets.forEach((target) => {
    target.calendar!.textContent = 'Next Feast Day:';
    target.name!.textContent = feast?.name || 'Next feast day';
    target.date!.textContent = feast?.date
      ? `${shortDate(feast.date)} for ${parish.name || 'your church'}`
      : `Based on ${calendarLabel(parish.liturgicalCalendar)}`;
    if (target.link) target.link.href = donorGiftUrl('feast', parish, { feast: feast?.name });
  });
}

function renderHomeParishWidgetsLoading() {
  const campaignLoading =
    '<article class="campaign-card campaign-empty sw-tool-loading"><span class="campaign-pill">Campaigns</span><h3>Loading parish campaigns…</h3><p>Checking the giving opportunities available through your parish.</p></article>';
  [document.getElementById('activeCampaigns'), document.getElementById('desktopActiveCampaigns')]
    .filter(truthyDonor)
    .forEach((target) => {
      target.innerHTML = campaignLoading;
    });

  const fundsLoading =
    '<article class="active-funds-card active-funds-empty sw-tool-loading"><span class="campaign-pill">Funds</span><h3>Loading parish funds…</h3><p>Checking the funds available through your parish.</p></article>';
  [document.getElementById('activeFunds'), document.getElementById('desktopActiveFunds')]
    .filter(truthyDonor)
    .forEach((target) => {
      target.innerHTML = fundsLoading;
    });

  [
    [document.getElementById('nextFeastName'), document.getElementById('nextFeastDate')],
    [document.getElementById('desktopNextFeastName'), document.getElementById('desktopNextFeastDate')],
  ].forEach(([name, date]) => {
    if (name) name.textContent = 'Loading parish feast…';
    if (date) date.textContent = 'Checking your parish calendar.';
  });
}

function applyDonorGiveParams() {
  const params = new URLSearchParams(window.location.search);
  const parish = params.get('parish');
  const giftType = normalizeDonorGiftType(params.get('giftType'));
  const frequency = params.get('frequency');
  const isQuick = params.get('quick') === '1';
  const parishSelect = document.getElementById('parish');
  const giftTypeSelect = document.getElementById('giftType') as HTMLSelectElement | null;
  if (parish && parishSelect)
    (parishSelect as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = parish;
  if (giftType && giftTypeSelect) giftTypeSelect.value = giftType;
  setDonorGiftFrequency(
    frequency || (document.getElementById('frequency') as HTMLInputElement | null)?.value || 'once'
  );
  toggleGiftDetailFields();
  if (params.get('campaign') && (document.getElementById('campaign') as HTMLSelectElement | null)) {
    (document.getElementById('campaign') as HTMLSelectElement | null)!.value = params.get('campaign')!;
    renderCampaignChoicePreview(selectedCampaign());
  }
  if (params.get('fund') && (document.getElementById('fund') as HTMLSelectElement | null)) {
    (document.getElementById('fund') as HTMLSelectElement | null)!.value = params.get('fund')!;
  }
  if (!isQuick) return;

  const copy = donorGiftTypeCopy[giftType] || donorGiftTypeCopy.stewardship;
  document.body.classList.add('quick-give-mode');
  setText('giveEyebrow', copy.eyebrow);
  setText('giveTitle', copy.title);
  setText('giveIntro', copy.intro);
  setText('giftDetailsTitle', copy.detailsTitle);
  const context = document.getElementById('quickGiveContext');
  if (context) {
    context.textContent = copy.context;
    context.hidden = false;
  }
  const giftTypeField = document.getElementById('giftTypeField');
  if (giftTypeField) giftTypeField.hidden = true;
  const changeLink = document.getElementById('changeGiftLink') as HTMLAnchorElement | null;
  if (changeLink) changeLink.hidden = false;
  const card = document.getElementById('giftDetailsCard');
  if (card) {
    window.requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstField =
        giftType === 'commemoration'
          ? document.querySelector<HTMLInputElement>('input[name="commemorationKind"]:checked')
          : (document.getElementById('amount') as HTMLInputElement | null);
      firstField?.focus({ preventScroll: true });
    });
  }
}

function setDonorGiftFrequency(value: unknown = 'once') {
  const frequencyInput = document.getElementById('frequency') as HTMLInputElement | null;
  const recurringSelect = document.getElementById('recurringFrequency') as HTMLSelectElement | null;
  const recurringField = document.getElementById('recurringFrequencyField');
  if (!frequencyInput) return;
  const recurringValues = new Set(['weekly', 'biweekly', 'monthly']);
  const requested = String(value || 'once').toLowerCase();
  const recurring = requested === 'recurring' || recurringValues.has(requested);
  if (recurringValues.has(requested) && recurringSelect) recurringSelect.value = requested;
  const cadence = recurringSelect?.value || 'monthly';
  frequencyInput.value = recurring ? cadence : 'once';
  if (recurringField) recurringField.hidden = !recurring;
  document.querySelectorAll<HTMLElement>('[data-gift-frequency-mode]').forEach((button) => {
    const active = button.dataset.giftFrequencyMode === (recurring ? 'recurring' : 'once');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function toggleCandleIntentionFields() {
  toggleGiftDetailFields();
}

function toggleGiftDetailFields() {
  const giftTypeSelect = document.getElementById('giftType') as HTMLSelectElement | null;
  let giftType = normalizeDonorGiftType(giftTypeSelect?.value);
  const giftTypeChanged = giftType !== activeDonorGiftType;
  const parish = selectedPublicParish();
  updateGivingTierTiles(parish);
  if (giftTypeSelect) {
    Array.from(giftTypeSelect.options).forEach((option) => {
      option.disabled = isGivingPlusGiftType(option.value) && !parishCanUseGiftType(parish, option.value);
    });
  }
  if (isGivingPlusGiftType(giftType) && !parishCanUseGiftType(parish, giftType)) {
    const lockedGiftType = giftType;
    giftType = 'stewardship';
    if (giftTypeSelect) giftTypeSelect.value = giftType;
    openGivingPlusPaywall(null, parish, lockedGiftType);
  }
  populateGiftOptionFields();
  const candleFields = document.getElementById('candleIntentionFields');
  const commemorationKindFields = document.getElementById('commemorationKindFields');
  const commemorationFields = document.getElementById('commemorationIntentionFields');
  const fundFields = document.getElementById('fundFields');
  const campaignFields = document.getElementById('campaignFields');
  if (candleFields) candleFields.hidden = giftType !== 'candles';
  if (commemorationKindFields) commemorationKindFields.hidden = giftType !== 'commemoration';
  if (commemorationFields) commemorationFields.hidden = giftType !== 'commemoration';
  if (fundFields) fundFields.hidden = giftType !== 'fund';
  if (campaignFields) campaignFields.hidden = !['campaign', 'feast'].includes(giftType);
  if (giftType === 'commemoration') {
    const kind =
      document.querySelector<HTMLInputElement>('input[name="commemorationKind"]:checked')?.value ||
      'proskomedia_liturgy';
    syncDonorCommemorationAmount(kind, { force: giftTypeChanged && !donorGiftAmountEdited });
  }
  activeDonorGiftType = giftType;
  renderCampaignChoicePreview(['campaign', 'feast'].includes(giftType) ? selectedCampaign() : null);
}

async function loginFromDashboard() {
  const email = (document.getElementById('donorEmail') as HTMLInputElement | null)?.value.trim();
  const password = (document.getElementById('donorPassword') as HTMLInputElement | null)?.value;
  if (!email || !password) {
    setDonorStatus('Enter your donor email and password.', 'error');
    return;
  }
  setDonorStatus('Loading donor account...');
  try {
    const data = await donorApi('/api/donor/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    saveDonorSession(data);
    setDonorStatus('Donor account loaded.', 'success');
    if (typeof loadDonorDashboardPage === 'function') await loadDonorDashboardPage();
    if (typeof loadDonorOfferingsPage === 'function') await loadDonorOfferingsPage();
    if (typeof loadDonorCommemorationsPage === 'function') await loadDonorCommemorationsPage();
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

async function loginFromPage(event: Event) {
  event.preventDefault();
  const email = (document.getElementById('donorEmail') as HTMLInputElement | null)?.value.trim();
  const password = (document.getElementById('donorPassword') as HTMLInputElement | null)?.value;
  if (!email || !password) {
    setDonorStatus('Enter your email and password.', 'error');
    return;
  }
  setDonorStatus('Signing you in...');
  try {
    const data = await donorApi('/api/donor/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    saveDonorSession(data);
    setDonorStatus('Signed in. Opening My AGAPAY...', 'success');
    window.location.href = donorLoginReturnPath();
  } catch (err) {
    clearDonorSession();
    const message = isDonorUnauthorized(err)
      ? 'We could not sign you in with that email and password. Check your password or use Forgot password.'
      : (err as DonorAppError).message;
    setDonorStatus(message, 'error');
  }
}

function showDonorAuthForm(formId: string) {
  ['donorLoginForm', 'donorResetRequestForm', 'donorResetConfirmForm'].forEach((id) => {
    const form = document.getElementById(id);
    if (form) form.hidden = id !== formId;
  });
}

function showDonorLogin() {
  showDonorAuthForm('donorLoginForm');
  setDonorStatus('', '');
}

function showDonorPasswordReset() {
  const email = (document.getElementById('donorEmail') as HTMLInputElement | null)?.value.trim();
  const resetEmail = document.getElementById('donorResetEmail') as HTMLInputElement | null;
  if (email && resetEmail) resetEmail.value = email;
  showDonorAuthForm('donorResetRequestForm');
  setDonorStatus('', '');
}

async function requestDonorPasswordReset(event: Event) {
  event.preventDefault();
  const email = (document.getElementById('donorResetEmail') as HTMLInputElement | null)?.value.trim();
  if (!email) {
    setDonorStatus('Enter your email address.', 'error');
    return;
  }
  setDonorStatus('Sending reset link...');
  try {
    const data = await donorApi('/api/donor/password-reset-request', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setDonorStatus('If that email is verified, a reset link has been sent.', 'success');
    if (data.resetUrl) {
      const actions = (
        document.getElementById('donorResetRequestForm') as HTMLFormElement | null
      )?.querySelector<HTMLElement>('.donor-auth-actions');
      if (actions) {
        const link = document.getElementById('donorTestResetLink') || document.createElement('a');
        link.id = 'donorTestResetLink';
        (link as HTMLAnchorElement).href = data.resetUrl;
        link.textContent = 'Open test reset link';
        link.className = 'btn btn-ghost';
        if (!link.parentElement) actions.appendChild(link);
      }
    }
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

async function confirmDonorPasswordReset(event: Event) {
  event.preventDefault();
  const email = (document.getElementById('donorResetConfirmEmail') as HTMLInputElement | null)?.value.trim();
  const token = (document.getElementById('donorResetToken') as HTMLInputElement | null)?.value.trim();
  const newPassword = (document.getElementById('donorNewPassword') as HTMLInputElement | null)?.value;
  const confirmPassword = (document.getElementById('donorConfirmPassword') as HTMLInputElement | null)?.value;
  if (!email || !token || !newPassword) {
    setDonorStatus('Enter your email and new password.', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    setDonorStatus('Passwords do not match.', 'error');
    return;
  }
  setDonorStatus('Updating password...');
  try {
    await donorApi('/api/donor/password-reset-confirm', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword, confirmPassword }),
    });
    clearDonorSession();
    const loginEmail = document.getElementById('donorEmail') as HTMLInputElement | null;
    if (loginEmail) loginEmail.value = email;
    showDonorAuthForm('donorLoginForm');
    setDonorStatus('Password updated. Please log in with your new password.', 'success');
  } catch (err) {
    setDonorStatus((err as DonorAppError).message, 'error');
  }
}

function initDonorPasswordResetPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  if (!token && params.get('reset') !== '1') return;
  const tokenField = document.getElementById('donorResetToken') as HTMLInputElement | null;
  const emailField = document.getElementById('donorResetConfirmEmail') as HTMLInputElement | null;
  if (tokenField) tokenField.value = token;
  if (emailField) emailField.value = email;
  showDonorAuthForm(token ? 'donorResetConfirmForm' : 'donorResetRequestForm');
}

function initDonorLoginPageControls() {
  if (window.__agapayDonorLoginControlsReady) return;
  const loginForm = document.getElementById('donorLoginForm') as HTMLFormElement | null;
  const resetRequestForm = document.getElementById('donorResetRequestForm') as HTMLFormElement | null;
  const resetConfirmForm = document.getElementById('donorResetConfirmForm') as HTMLFormElement | null;
  if (!loginForm && !resetRequestForm && !resetConfirmForm) return;
  window.__agapayDonorLoginControlsReady = true;

  loginForm?.addEventListener('submit', loginFromPage);
  resetRequestForm?.addEventListener('submit', requestDonorPasswordReset);
  resetConfirmForm?.addEventListener('submit', confirmDonorPasswordReset);

  document.querySelectorAll<HTMLElement>('[data-donor-auth-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.getAttribute('data-donor-auth-view');
      if (view === 'reset') showDonorPasswordReset();
      if (view === 'login') showDonorLogin();
    });
  });
}
export type DonorAppPart2 = {
  selectedPublicParish: typeof selectedPublicParish;
  campaignLabel: typeof campaignLabel;
  campaignGoalCents: typeof campaignGoalCents;
  campaignRaisedCents: typeof campaignRaisedCents;
  campaignImageUrl: typeof campaignImageUrl;
  selectedCampaign: typeof selectedCampaign;
  populateGiftOptionFields: typeof populateGiftOptionFields;
  renderCampaignChoicePreview: typeof renderCampaignChoicePreview;
  donorSlugify: typeof donorSlugify;
  campaignShareUrl: typeof campaignShareUrl;
  shareCampaign: typeof shareCampaign;
  renderActiveCampaigns: typeof renderActiveCampaigns;
  fundLabel: typeof fundLabel;
  renderActiveFunds: typeof renderActiveFunds;
  renderNextFeast: typeof renderNextFeast;
  renderHomeParishWidgetsLoading: typeof renderHomeParishWidgetsLoading;
  applyDonorGiveParams: typeof applyDonorGiveParams;
  setDonorGiftFrequency: typeof setDonorGiftFrequency;
  toggleCandleIntentionFields: typeof toggleCandleIntentionFields;
  toggleGiftDetailFields: typeof toggleGiftDetailFields;
  loginFromDashboard: typeof loginFromDashboard;
  loginFromPage: typeof loginFromPage;
  showDonorAuthForm: typeof showDonorAuthForm;
  showDonorLogin: typeof showDonorLogin;
  showDonorPasswordReset: typeof showDonorPasswordReset;
  requestDonorPasswordReset: typeof requestDonorPasswordReset;
  confirmDonorPasswordReset: typeof confirmDonorPasswordReset;
  initDonorPasswordResetPage: typeof initDonorPasswordResetPage;
  initDonorLoginPageControls: typeof initDonorLoginPageControls;
};
