const GIVING_FREQUENCIES = new Set(['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);

const RECURRING_SCHEDULES = Object.freeze({
  weekly: Object.freeze({ interval: 'week', count: 1 }),
  biweekly: Object.freeze({ interval: 'week', count: 2 }),
  monthly: Object.freeze({ interval: 'month', count: 1 }),
  quarterly: Object.freeze({ interval: 'month', count: 3 }),
  yearly: Object.freeze({ interval: 'year', count: 1 }),
});

export function normalizeGivingFrequency(value) {
  const raw = String(value || 'once')
    .trim()
    .toLowerCase();
  const frequency = raw === 'annual' ? 'yearly' : raw;
  return GIVING_FREQUENCIES.has(frequency) ? frequency : '';
}

export function stripeRecurringSchedule(frequency) {
  return RECURRING_SCHEDULES[frequency] || null;
}

export function givingCheckoutReturnUrls({ appUrl, parishId, source, returnPath, donorDashboardReturn, campaign }) {
  if (donorDashboardReturn) {
    return {
      successUrl: `${appUrl}/myagapay?gift_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/myagapay/giving/give?checkout_canceled=1`,
    };
  }

  const checkoutSource = String(source || '').toLowerCase();
  if (checkoutSource === 'embed') {
    const embedPath = `/give/embed/${encodeURIComponent(parishId)}`;
    return {
      successUrl: `${appUrl}${embedPath}?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}${embedPath}?canceled=1`,
    };
  }

  const safeReturnPath = String(returnPath || '').startsWith('/') ? String(returnPath) : '';
  const encodedParishId = encodeURIComponent(parishId);
  const campaignCheckout = checkoutSource === 'campaign_page';
  return {
    successUrl: campaignCheckout
      ? `${appUrl}/give/${encodedParishId}?giftType=campaign&campaign=${encodeURIComponent(campaign || '')}&success=1&session_id={CHECKOUT_SESSION_ID}`
      : `${appUrl}/give/${encodedParishId}?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl:
      campaignCheckout && safeReturnPath
        ? `${appUrl}${safeReturnPath}${safeReturnPath.includes('?') ? '&' : '?'}checkout_canceled=1`
        : `${appUrl}/give/${encodedParishId}?canceled=1`,
  };
}
