(function installAdminPresentation(global) {
  function formatClock(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function jsString(value) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  function jsAttr(value) {
    return escapeAttr(jsString(value));
  }

  function field(label, value, className = '') {
    const safeValue = value || '-';
    return `<div class="field ${className}"><div class="field-key">${escapeHtml(label)}</div><div class="field-val">${escapeHtml(safeValue)}</div></div>`;
  }

  function readableStripeRequirement(value) {
    return String(value || '')
      .replace(/\./g, ' / ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function renderStripeRequirements(reg) {
    const requirements = Array.isArray(reg.stripeRequirementsDue) ? reg.stripeRequirementsDue.filter(Boolean) : [];
    const disabledReason = reg.stripeDisabledReason || '';
    const hasStripeAccount = Boolean(reg.stripeAccountId);
    const needsAction = Boolean(disabledReason || requirements.length);

    let title = 'Stripe requirements';
    let copy = 'No open Stripe requirements are currently reported for this parish.';

    if (!hasStripeAccount) {
      copy = 'This area will show any missing Stripe onboarding items after the parish has a connected Stripe account.';
    } else if (needsAction) {
      title = 'Stripe needs parish action';
      copy =
        'Stripe is asking the parish to provide or correct information before payments or payouts can be fully enabled.';
    }

    const items = requirements.map((item) => `<li>${escapeHtml(readableStripeRequirement(item))}</li>`).join('');
    const disabled = disabledReason
      ? `<p class="requirements-panel-note"><strong>Stripe reason:</strong> ${escapeHtml(readableStripeRequirement(disabledReason))}</p>`
      : '';
    const list = items ? `<ul class="requirements-list">${items}</ul>` : '';

    return `
        <div class="requirements-panel ${needsAction ? '' : 'clear'}">
          <div class="requirements-panel-title">${escapeHtml(title)}</div>
          <p class="requirements-panel-copy">${escapeHtml(copy)}</p>
          ${disabled}
          ${list}
        </div>
      `;
  }

  function money(cents) {
    if (cents === null || cents === undefined || cents === '') return 'Custom';
    if (Number(cents) === 0) return 'Free';
    return '$' + (Number(cents) / 100).toFixed(0) + '/mo';
  }

  function moneyShort(cents) {
    const amount = (Number(cents) || 0) / 100;
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(1) + 'K';
    return '$' + amount.toFixed(0);
  }

  function monthLabel(index) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index] || '';
  }

  function readable(value) {
    return String(value || 'not_started').replace(/_/g, ' ');
  }

  function shortDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: '2-digit' }).format(date);
  }

  function subscriptionTierLabel(reg) {
    if (reg.subscriptionTierLabel) return reg.subscriptionTierLabel;
    if (reg.subscriptionTier === 'monastery_free') return 'Monastery / Skete';
    if (reg.subscriptionTier === 'giving' || reg.subscriptionTier === 'mission') return 'Giving';
    if (reg.subscriptionTier === 'stewardship') return 'Stewardship';
    if (reg.subscriptionTier === 'diocese') return 'Cathedral / Diocese';
    return 'Parish';
  }

  function transactionFeeLabel(reg) {
    return 'No AGAPAY donation fee (Stripe processing only)';
  }

  function jsonForTextarea(value, fallback) {
    return escapeHtml(JSON.stringify(value && value.length ? value : fallback, null, 2));
  }

  function computeLocalPlatformSummary(registrations) {
    const year = new Date().getFullYear();
    const monthly = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      label: monthLabel(index),
      registered: 0,
      verified: 0,
      ytdDonationsCents: 0,
      giftCount: 0,
    }));

    for (const registration of registrations) {
      const received = registration.receivedAt ? new Date(registration.receivedAt) : null;
      if (!received || Number.isNaN(received.getTime()) || received.getFullYear() !== year) continue;
      const month = received.getMonth();
      monthly[month].registered += 1;
      if (registration.status === 'verified') monthly[month].verified += 1;
    }

    return {
      year,
      totalRegistered: registrations.length,
      totalVerified: registrations.filter((item) => item.status === 'verified').length,
      connectedStripeAccounts: registrations.filter((item) =>
        ['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus)
      ).length,
      ytdDonationsCents: 0,
      giftCount: 0,
      donationDataSource: 'local_only',
      monthly,
    };
  }

  Object.assign(global, {
    computeLocalPlatformSummary,
    escapeAttr,
    escapeHtml,
    field,
    formatClock,
    jsAttr,
    jsString,
    jsonForTextarea,
    money,
    moneyShort,
    monthLabel,
    readable,
    readableStripeRequirement,
    renderStripeRequirements,
    shortDate,
    subscriptionTierLabel,
    transactionFeeLabel,
  });
})(globalThis);
