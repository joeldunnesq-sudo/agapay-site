(function () {
  'use strict';

  const state = {
    organization: null,
    organizationId: '',
    amount: 50,
    frequency: 'once',
    loading: false,
  };

  const amountFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  function el(id) {
    return document.getElementById(id);
  }

  function money(value) {
    return amountFormatter.format(Number(value) || 0);
  }

  function cleanText(value) {
    return String(value || '').trim();
  }

  function isGeneralFund(fund = {}) {
    return [fund.id, fund.code, fund.reportCode, fund.name]
      .filter(Boolean)
      .map((value) => cleanText(value).toLowerCase())
      .some((value) => ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value));
  }

  function isCandleFund(fund = {}) {
    return [fund.id, fund.code, fund.reportCode, fund.name]
      .filter(Boolean)
      .map((value) => cleanText(value).toLowerCase())
      .some((value) => ['candle', 'candles', 'candles / vigil lights', 'candle fund'].includes(value));
  }

  function organizationIdFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const requested = cleanText(params.get('parish'));
    if (requested) return requested;
    const parts = window.location.pathname.split('/').filter(Boolean);
    const embedIndex = parts.findIndex((part, index) => part === 'embed' && parts[index - 1] === 'give');
    return embedIndex >= 0 ? cleanText(parts[embedIndex + 1]) : '';
  }

  function isLocalPreview() {
    const host = window.location.hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(host)
      && Boolean(new URLSearchParams(window.location.search).get('preview'));
  }

  function previewOrganization() {
    const previewKind = cleanText(new URLSearchParams(window.location.search).get('preview')).toLowerCase();
    const profiles = {
      parish: {
        id: 'st-fiacre',
        name: 'St. Fiacre Orthodox Church',
        communityType: 'Parish',
        jurisdictionLabel: 'Antiochian Orthodox Christian Archdiocese',
        city: 'Munster',
        state: 'Indiana',
        funds: [
          { id: 'general', name: 'General Operating Fund' },
          { id: 'benevolence-fund', name: 'Benevolence Fund' },
          { id: 'building-fund', name: 'Building & Iconography Fund' },
          { id: 'youth-education', name: 'Youth & Christian Education' },
        ],
      },
      school: {
        id: 'st-katherine-academy',
        name: 'St. Katherine Orthodox Academy',
        communityType: 'School / Academy',
        city: 'Naperville',
        state: 'Illinois',
        funds: [
          { id: 'general', name: 'Academy Annual Fund' },
          { id: 'scholarships', name: 'Student Scholarship Fund' },
          { id: 'arts', name: 'Sacred Arts & Music' },
          { id: 'campus', name: 'Campus Improvement Fund' },
        ],
      },
      business: {
        id: 'theophany-books',
        name: 'Theophany Books & Gifts',
        communityType: 'Business',
        city: 'Franklin',
        state: 'Tennessee',
        tributeGivingEnabled: false,
        funds: [
          { id: 'general', name: 'Community Support Fund' },
          { id: 'authors', name: 'Emerging Orthodox Authors' },
          { id: 'outreach', name: 'Parish Library Outreach' },
        ],
      },
      nonprofit: {
        id: 'st-phoebe-foundation',
        name: 'St. Phoebe Community Foundation',
        communityType: 'Ministry / Nonprofit',
        city: 'Chicago',
        state: 'Illinois',
        funds: [
          { id: 'general', name: 'Where Most Needed' },
          { id: 'family-relief', name: 'Family Relief Fund' },
          { id: 'food', name: 'Community Food Program' },
          { id: 'housing', name: 'Emergency Housing Support' },
        ],
      },
    };
    const profile = profiles[previewKind] || profiles.nonprofit;
    return {
      ...profile,
      id: state.organizationId || profile.id,
      status: 'verified',
      designatedFundsEnabled: true,
    };
  }

  function setStatus(message, tone = 'error') {
    const status = el('givingStatus');
    if (!status) return;
    status.textContent = message || '';
    status.hidden = !message;
    status.classList.toggle('is-success', tone === 'success');
    notifyHeight();
  }

  function clearStatus() {
    setStatus('');
  }

  function notifyHeight() {
    if (window.parent === window) return;
    window.requestAnimationFrame(() => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      window.parent.postMessage({
        type: 'agapay:giving-box-resize',
        organizationId: state.organizationId,
        parishId: state.organizationId,
        height,
      }, '*');
    });
  }

  function frequencyLabel(frequency = state.frequency) {
    return {
      once: 'One-time gift',
      monthly: 'Monthly gift',
      quarterly: 'Quarterly gift',
      yearly: 'Yearly gift',
    }[frequency] || 'One-time gift';
  }

  function updateGiftSummary() {
    const amount = money(state.amount);
    el('continueAmount').textContent = amount;
    el('summaryAmount').textContent = amount;
    el('summaryFrequency').textContent = frequencyLabel();
    const fundOption = el('fundSelect').selectedOptions[0];
    el('summaryFund').textContent = fundOption?.textContent || 'General Fund';
  }

  function chooseFrequency(frequency) {
    const supported = ['once', 'monthly', 'quarterly', 'yearly'];
    state.frequency = supported.includes(frequency) ? frequency : 'once';
    document.querySelectorAll('[data-frequency]').forEach((button) => {
      const active = button.dataset.frequency === state.frequency;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    el('frequencyNote').textContent = {
      once: 'A single gift, given securely.',
      monthly: 'A steady rhythm that keeps the mission moving.',
      quarterly: 'A meaningful gift, renewed every three months.',
      yearly: 'One annual gift with lasting impact.',
    }[state.frequency];
    updateGiftSummary();
  }

  function chooseAmount(amount, activeButton = null) {
    state.amount = Math.max(0, Number(amount) || 0);
    document.querySelectorAll('[data-amount]').forEach((button) => {
      button.classList.toggle('is-active', button === activeButton);
      button.setAttribute('aria-pressed', String(button === activeButton));
    });
    if (activeButton) el('customAmount').value = '';
    updateGiftSummary();
  }

  function revealOptionalFields() {
    el('noteField').hidden = !el('addNote').checked;
    el('tributeFields').hidden = !el('addTribute').checked;
    notifyHeight();
  }

  function updateStepMarkers(step) {
    document.querySelectorAll('[data-step-marker]').forEach((marker) => {
      const value = Number(marker.dataset.stepMarker);
      marker.classList.toggle('is-active', value === step);
      marker.classList.toggle('is-complete', value < step);
      const number = marker.querySelector('i');
      if (number) number.textContent = value < step ? '✓' : String(value);
    });
  }

  function showStep(step) {
    clearStatus();
    el('giftStep').hidden = step !== 1;
    el('detailsStep').hidden = step !== 2;
    el('completionState').hidden = step !== 3;
    updateStepMarkers(step);
    if (step === 2) {
      updateGiftSummary();
      window.requestAnimationFrame(() => el('firstName').focus({ preventScroll: true }));
    }
    notifyHeight();
  }

  function selectedFund() {
    const select = el('fundSelect');
    const option = select.selectedOptions[0];
    if (!option || option.value === 'general') return null;
    return {
      id: option.value,
      name: option.textContent,
    };
  }

  function populateFunds(organization) {
    const select = el('fundSelect');
    const requestedFund = cleanText(new URLSearchParams(window.location.search).get('fund'));
    const available = (Array.isArray(organization.funds) ? organization.funds : [])
      .filter((fund) => fund && fund.enabled !== false && fund.active !== false);
    const general = available.find(isGeneralFund);
    const designated = available
      .filter((fund) => fund && fund.enabled !== false && fund.active !== false)
      .filter((fund) => !isGeneralFund(fund) && !isCandleFund(fund));
    select.replaceChildren(new Option(cleanText(general?.name) || 'General Fund', 'general'));
    designated.forEach((fund) => {
      const value = cleanText(fund.id || fund.code || fund.name);
      const option = new Option(cleanText(fund.name) || 'Designated fund', value);
      select.add(option);
    });
    el('fundField').hidden = designated.length === 0;
    if (requestedFund) {
      const match = Array.from(select.options).find((option) => [option.value, option.textContent].includes(requestedFund));
      if (match) select.value = match.value;
    }
    updateGiftSummary();
  }

  function organizationTypeLabel(organization = {}) {
    const value = cleanText(organization.communityType || organization.type).toLowerCase();
    if (value.includes('school') || value.includes('academy')) return 'School & Academy';
    if (value.includes('nonprofit') || value.includes('ministry')) return 'Ministry & Nonprofit';
    if (value.includes('business')) return 'Values-aligned Business';
    if (value.includes('monastery') || value.includes('skete')) return 'Monastery & Skete';
    if (value.includes('cathedral')) return 'Cathedral';
    if (value.includes('mission')) return 'Mission';
    if (value.includes('parish') || value.includes('church')) return 'Parish';
    return cleanText(organization.communityType || organization.type) || 'Community Organization';
  }

  function renderOrganization(organization) {
    state.organization = organization;
    state.organizationId = organization.id || state.organizationId;
    document.title = `Give to ${organization.name || 'this organization'} with AGAPAY`;
    el('organizationName').textContent = organization.name || 'Community organization';
    const jurisdiction = cleanText(organization.jurisdictionLabel || organization.jurisdiction);
    const meta = [
      organizationTypeLabel(organization),
      jurisdiction && !/^other canonical jurisdiction$/i.test(jurisdiction) ? jurisdiction : '',
      [organization.city, organization.state].filter(Boolean).join(', '),
    ]
      .filter(Boolean)
      .join(' · ');
    el('organizationMeta').textContent = meta;
    const logo = el('organizationLogo');
    if (organization.logoUrl || organization.imageUrl) {
      logo.src = organization.logoUrl || organization.imageUrl;
      logo.alt = `${organization.name || 'Organization'} logo`;
      logo.hidden = false;
      el('organizationMonogram').hidden = true;
    } else {
      const genericWords = ['st.', 'saint', 'holy', 'orthodox', 'church', 'parish', 'mission', 'ministry', 'nonprofit', 'foundation', 'organization', 'school', 'academy', 'business'];
      const words = cleanText(organization.name).split(/\s+/).filter((word) => !genericWords.includes(word.toLowerCase()));
      el('organizationMonogram').textContent = (words[0]?.[0] || 'A').toUpperCase();
    }
    const tributeEnabled = organization.tributeGivingEnabled !== false
      && !organizationTypeLabel(organization).toLowerCase().includes('business');
    el('tributeOption').hidden = !tributeEnabled;
    if (!tributeEnabled) {
      el('addTribute').checked = false;
      el('tributeFields').hidden = true;
    }
    populateFunds(organization);
    el('giveAgainLink').href = `/give/embed/${encodeURIComponent(state.organizationId)}`;
    notifyHeight();
  }

  function showUnavailable() {
    el('giftStep').hidden = true;
    el('detailsStep').hidden = true;
    el('completionState').hidden = true;
    el('unavailableState').hidden = false;
    document.querySelector('.step-ribbon').hidden = true;
    el('organizationName').textContent = 'AGAPAY Giving';
    el('organizationMeta').textContent = '';
    notifyHeight();
  }

  async function loadOrganization() {
    if (isLocalPreview()) return previewOrganization();
    const response = await fetch(`/api/parishes?id=${encodeURIComponent(state.organizationId)}`, {
      headers: { Accept: 'application/json' },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.parish) throw new Error(result.error || 'Organization not found');
    return result.parish;
  }

  function applyQueryDefaults() {
    const params = new URLSearchParams(window.location.search);
    chooseFrequency(cleanText(params.get('frequency')) || 'once');
    const requestedAmount = Number(params.get('amount'));
    if (requestedAmount > 0 && requestedAmount <= 50000) {
      const preset = Array.from(document.querySelectorAll('[data-amount]'))
        .find((button) => Number(button.dataset.amount) === requestedAmount);
      chooseAmount(requestedAmount, preset || null);
      if (!preset) el('customAmount').value = String(requestedAmount);
    }
  }

  function validateGiftStep() {
    if (!Number.isFinite(state.amount) || state.amount < 1) {
      setStatus('Choose or enter a gift amount of at least $1.');
      el('customAmount').focus();
      return false;
    }
    if (state.amount > 50000) {
      setStatus('Online gifts are limited to $50,000 per transaction.');
      el('customAmount').focus();
      return false;
    }
    if (el('addTribute').checked && !cleanText(el('tributeName').value)) {
      setStatus('Add the name of the person you would like to honor or remember.');
      el('tributeName').focus();
      return false;
    }
    return true;
  }

  function checkoutPayload() {
    const fund = selectedFund();
    const tributeName = cleanText(el('tributeName').value);
    const tribute = el('addTribute').checked && tributeName
      ? `${el('tributeType').value === 'memory' ? 'In memory of' : 'In honor of'} ${tributeName}`
      : '';
    return {
      parishId: state.organizationId,
      giftType: fund ? 'fund' : 'stewardship',
      amount: state.amount,
      frequency: state.frequency,
      fund: fund?.name || '',
      fundId: fund?.id || '',
      firstName: cleanText(el('firstName').value),
      lastName: cleanText(el('lastName').value),
      email: cleanText(el('email').value),
      inMemoriam: tribute,
      publicComment: el('addNote').checked ? cleanText(el('giftNote').value) : '',
      paymentMethod: 'card',
      coverFees: el('coverFees').checked,
      source: 'embed',
      ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {}),
    };
  }

  function checkoutErrorMessage(result, fallback) {
    const message = cleanText(result.detail || result.error || fallback);
    if (/turnstile|verification/i.test(message)) return 'Please complete the security check and try again.';
    return message || fallback;
  }

  async function submitCheckout(event) {
    event.preventDefault();
    if (state.loading || !el('donorForm').reportValidity()) return;
    state.loading = true;
    clearStatus();
    const button = el('checkoutButton');
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Preparing secure checkout…';
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(checkoutPayload()),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(checkoutErrorMessage(result, 'Checkout could not be started.'));
      if (result.url) {
        if (window.top && window.top !== window) {
          try {
            window.top.location.href = result.url;
            return;
          } catch {
            // Some host sites intentionally restrict top-frame navigation.
          }
        }
        window.location.href = result.url;
        return;
      }
      throw new Error(result.message || 'Secure checkout is not available yet.');
    } catch (error) {
      setStatus(error.message || 'Checkout could not be started. Please try again.');
    } finally {
      state.loading = false;
      button.disabled = false;
      button.innerHTML = original;
      notifyHeight();
    }
  }

  async function reconcileCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') !== '1') {
      if (params.get('canceled') === '1') setStatus('Checkout was canceled. Your gift was not processed.');
      return false;
    }
    el('giftStep').hidden = true;
    el('detailsStep').hidden = true;
    el('completionState').hidden = false;
    updateStepMarkers(3);
    const sessionId = cleanText(params.get('session_id'));
    if (!sessionId) return true;
    el('completionCopy').textContent = 'Confirming your gift with Stripe…';
    try {
      const response = await fetch(`/api/checkout-session-status?session_id=${encodeURIComponent(sessionId)}`, {
        headers: { Accept: 'application/json' },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Confirmation is still processing.');
      el('completionCopy').textContent = result.paymentStatus === 'paid' || result.status === 'completed'
        ? 'Your payment was successful. A receipt will arrive by email.'
        : 'Your payment is processing. A receipt will arrive as soon as Stripe confirms it.';
    } catch {
      el('completionCopy').textContent = 'Your payment is being confirmed. A receipt will arrive by email.';
    }
    notifyHeight();
    return true;
  }

  function bindEvents() {
    document.querySelectorAll('[data-frequency]').forEach((button) => {
      button.addEventListener('click', () => chooseFrequency(button.dataset.frequency));
    });
    document.querySelectorAll('[data-amount]').forEach((button) => {
      button.addEventListener('click', () => chooseAmount(Number(button.dataset.amount), button));
    });
    el('customAmount').addEventListener('input', (event) => chooseAmount(event.target.value, null));
    el('fundSelect').addEventListener('change', updateGiftSummary);
    el('addNote').addEventListener('change', revealOptionalFields);
    el('addTribute').addEventListener('change', revealOptionalFields);
    el('continueButton').addEventListener('click', () => {
      if (validateGiftStep()) showStep(2);
    });
    el('backButton').addEventListener('click', () => showStep(1));
    el('donorForm').addEventListener('submit', submitCheckout);
  }

  async function init() {
    state.organizationId = organizationIdFromLocation();
    bindEvents();
    applyQueryDefaults();
    revealOptionalFields();
    if (!state.organizationId) {
      showUnavailable();
      return;
    }
    try {
      const organization = await loadOrganization();
      renderOrganization(organization);
      if (!(await reconcileCheckoutReturn())) showStep(1);
    } catch {
      showUnavailable();
    }
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(notifyHeight);
      observer.observe(document.body);
    }
    notifyHeight();
  }

  init();
})();
