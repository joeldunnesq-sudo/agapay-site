(function () {
  window.agapayTurnstileToken = '';
  let enabled = false;
  let securityError = '';
  let initialization: Promise<void> | undefined;

  function message(text: string) {
    document.querySelectorAll<HTMLElement>('[data-agapay-turnstile]').forEach((target) => {
      let notice = target.nextElementSibling as HTMLElement | null;
      if (!notice?.hasAttribute('data-security-status')) {
        notice = document.createElement('p');
        notice.setAttribute('data-security-status', '');
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        target.after(notice);
      }
      notice.textContent = text;
    });
  }

  function renderTurnstile(siteKey: string) {
    if (!window.turnstile || !siteKey) return;
    document.querySelectorAll<HTMLElement>('[data-agapay-turnstile]').forEach((target) => {
      if (target.dataset.rendered === 'true') return;
      target.dataset.rendered = 'true';
      window.turnstile!.render(target, {
        sitekey: siteKey,
        action: target.dataset.action || undefined,
        callback: (token) => {
          window.agapayTurnstileToken = token || '';
          securityError = '';
          message(token ? 'Security check complete.' : 'Complete the security check to continue.');
        },
        'expired-callback': () => {
          window.agapayTurnstileToken = '';
          message('Security check expired. Complete the check again to continue.');
        },
        'error-callback': () => {
          window.agapayTurnstileToken = '';
          securityError =
            'The security check could not complete. Allow the Cloudflare security challenge in your browser and try again.';
          message(securityError);
        },
      });
    });
  }

  async function initAGAPAYSecurity() {
    try {
      const response = await fetch('/api/security/config', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Security configuration unavailable.');
      const config = await response.json();
      enabled = config.turnstileEnabled === true;
      if (!enabled) return;
      if (!config.turnstileSiteKey) throw new Error('Security configuration unavailable.');
      message('Complete “Verify you are human” before continuing.');
      if (window.turnstile) {
        renderTurnstile(config.turnstileSiteKey);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => renderTurnstile(config.turnstileSiteKey);
      script.onerror = () => {
        securityError =
          'The security check could not load. Allow the Cloudflare security challenge in your browser, then refresh.';
        message(securityError);
      };
      document.head.appendChild(script);
    } catch {
      securityError = 'The security check is unavailable. Refresh the page and try again.';
      message(securityError);
    }
  }

  function initialize() {
    return (initialization ||= initAGAPAYSecurity());
  }

  window.agapaySecurityPayload = function () {
    const responseField = document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
    return { turnstileToken: window.agapayTurnstileToken || responseField?.value || '' };
  };
  window.agapayWaitForSecurity = async function () {
    await initialize();
    if (securityError) throw new Error(securityError);
    if (!enabled || window.agapaySecurityPayload().turnstileToken) return;
    message('Complete “Verify you are human” above. Your checkout will continue automatically.');
    document.querySelector<HTMLElement>('[data-agapay-turnstile]')?.scrollIntoView({ block: 'center' });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (securityError) throw new Error(securityError);
      if (window.agapaySecurityPayload().turnstileToken) return;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    throw new Error('Complete “Verify you are human”, then press the checkout button again.');
  };
  window.agapayResetSecurity = function () {
    if (!enabled) return;
    window.agapayTurnstileToken = '';
    securityError = '';
    document.querySelectorAll<HTMLInputElement>('[name="cf-turnstile-response"]').forEach((input) => {
      input.value = '';
    });
    window.turnstile?.reset?.();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else void initialize();
})();
