import type { AdminAppPayload, AdminAppOptions, AdminAppError } from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare const setStatus: AdminAppBindings['setStatus'];
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const loadDetail: AdminAppBindings['loadDetail'];
declare const loadRegistrations: AdminAppBindings['loadRegistrations'];
declare const renderQueueNext: AdminAppBindings['renderQueueNext'];
declare const setPaymentStatus: AdminAppBindings['setPaymentStatus'];

function generateDashboardToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const tokenValue = 'agp_tmp_' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const tokenInput = document.getElementById('parishDashboardToken');
  if (tokenInput) (tokenInput as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = tokenValue;
  setStatus('Temporary dashboard token generated. Saving will email the invite.');
}

async function sendDashboardInvite(reference: string, btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  try {
    const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/dashboard-invite', {
      method: 'POST',
      headers: authHeaders(),
    });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.detail || result.error || 'Unable to send dashboard invite');

    await loadDetail(reference, { silent: true, noScroll: true });
    await loadRegistrations();
    if (result.email?.status === 'sent') {
      setStatus(`Dashboard invite sent to ${(result.email.recipients || []).join(', ')}.`, 'success');
      return;
    }
    if (result.email?.status === 'not_configured') {
      setStatus('Invite prepared, but email was not sent (RESEND_API_KEY missing).', 'info');
      return;
    }
    if (result.email?.status === 'missing_recipient') {
      setStatus('Invite prepared, but no priest or treasurer email is on this registration.', 'error');
      return;
    }
    throw new Error(result.email?.detail || `Email status: ${result.email?.status || 'unknown'}`);
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function setSubscriptionStatus(message: string | undefined, tone: string = '') {
  const box = document.getElementById('subscriptionStatusMessage');
  if (box) box.textContent = message || '';
  setStatus(message, tone);
}

async function createSubscriptionCheckout(
  reference: string,
  btn?: HTMLButtonElement | null,
  options: AdminAppOptions = {}
) {
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  try {
    const response = await fetch(
      '/api/admin/registrations/' + encodeURIComponent(reference) + '/subscription-checkout',
      {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionTier: (document.getElementById('subscriptionTier') as HTMLSelectElement | null)!.value,
          parishHouseholdBand: (document.getElementById('parishHouseholdBand') as HTMLSelectElement | null)!.value,
          trialDays: options.trialDays || 0,
        }),
      }
    );
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.detail || result.error || 'Unable to create subscription checkout');

    await loadDetail(reference, { silent: true, noScroll: true });
    renderQueueNext(result.registration!);
    await loadRegistrations();

    if (!result.checkoutUrl) {
      setSubscriptionStatus('Subscription updated. This tier does not require Stripe checkout.', 'info');
      return;
    }

    const linkBox = document.getElementById('subscriptionLinkBox');
    const link = document.getElementById('subscriptionCheckoutLink') as HTMLAnchorElement | null;
    const help = document.getElementById('subscriptionLinkHelp');
    if (linkBox && link) {
      link.href = result.checkoutUrl;
      linkBox.classList.add('visible');
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(result.checkoutUrl);
      copied = true;
    } catch {
      copied = false;
    }
    const isTrial = Number(options.trialDays || 0) > 0;
    if (help)
      help.textContent = isTrial
        ? copied
          ? 'The 30-day demo link was copied. No card is required; Stripe cancels the subscription at the end unless the church adds a payment method.'
          : 'The 30-day demo link is ready here. No card is required; Stripe cancels the subscription at the end unless the church adds a payment method.'
        : copied
          ? 'The subscription checkout link was copied to your clipboard. Send it to the parish treasurer when they are ready to activate AGAPAY billing.'
          : 'Clipboard access was blocked, but the subscription checkout link is ready here.';
    setSubscriptionStatus(
      isTrial
        ? copied
          ? '30-day free demo created and copied.'
          : '30-day free demo created.'
        : copied
          ? 'Subscription checkout created and copied.'
          : 'Subscription checkout created.',
      'success'
    );
  } catch (err) {
    setSubscriptionStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function refreshStripeStatus(reference: string, btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  try {
    const response = await fetch('/api/admin/registrations/' + encodeURIComponent(reference) + '/stripe-refresh', {
      method: 'POST',
      headers: authHeaders(),
    });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.detail || result.error || 'Unable to refresh Stripe status');

    await loadDetail(reference, { silent: true, noScroll: true });
    await loadRegistrations();
    setPaymentStatus(
      result.recovered
        ? `Existing Stripe connection recovered and confirmed: ${result.registration!.stripeAccountStatus || 'unknown'}.`
        : `Stripe connection confirmed: ${result.registration!.stripeAccountStatus || 'unknown'}.`,
      'success'
    );
  } catch (err) {
    setPaymentStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function toggleMobileMore(force?: boolean | 'until-found' | undefined) {
  const menu = document.getElementById('mobileMoreMenu');
  const button = document.getElementById('mobileMoreButton') as HTMLButtonElement | null;
  if (!menu || !button) return;
  const shouldOpen = typeof force === 'boolean' ? force : menu.hidden;
  menu.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  button.classList.toggle('active', shouldOpen as boolean);
}
export type AdminAppPart7 = {
  generateDashboardToken: typeof generateDashboardToken;
  sendDashboardInvite: typeof sendDashboardInvite;
  setSubscriptionStatus: typeof setSubscriptionStatus;
  createSubscriptionCheckout: typeof createSubscriptionCheckout;
  refreshStripeStatus: typeof refreshStripeStatus;
  toggleMobileMore: typeof toggleMobileMore;
};
