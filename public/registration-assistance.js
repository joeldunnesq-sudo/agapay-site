// Keep contact drafts only in this browser tab, never passwords, documents,
// CAPTCHA tokens, or legal consent. Restored drafts always restart at step one.
(() => {
  const key = 'agapay_registration_draft_v1';
  const retryKey = 'agapay_registration_retry_v1';
  let submissionKey;
  window.registrationRetryKey = () => {
    try {
      submissionKey ||= sessionStorage.getItem(retryKey);
    } catch {
      /* Optional storage. */
    }
    submissionKey ||= crypto.randomUUID();
    try {
      sessionStorage.setItem(retryKey, submissionKey);
    } catch {
      /* Keep the in-memory key for retries. */
    }
    return submissionKey;
  };
  window.finishRegistrationRetry = () => {
    submissionKey = null;
    try {
      sessionStorage.removeItem(retryKey);
    } catch {
      /* Optional storage. */
    }
  };
  const fields = [
    'parishName',
    'subscriptionTier',
    'parishHouseholdBand',
    'jurisdiction',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'postalCode',
    'website',
    'liturgicalCalendar',
    'organizationDescription',
    'priestFirst',
    'priestLast',
    'priestEmail',
    'priestPhone',
    'treasurerFirst',
    'treasurerLast',
    'treasurerEmail',
    'notes',
  ];
  window.registrationError = (message, fieldId) => {
    document.querySelectorAll('[data-registration-error]').forEach((el) => el.remove());
    document.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
    const input = document.getElementById(fieldId);
    const error = document.createElement('p');
    error.dataset.registrationError = 'true';
    error.id = 'registrationFieldError';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    error.style.cssText = 'color:#a83232;background:#fff4f1;padding:12px;border-radius:8px;';
    if (input) {
      const step = input.closest('.step-panel');
      if (step && !step.classList.contains('active')) window.goToStep(Number(step.id.replace('step-', '')));
      input.insertAdjacentElement('afterend', error);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute(
        'aria-describedby',
        [...new Set([...(input.getAttribute('aria-describedby') || '').split(' '), error.id].filter(Boolean))].join(' ')
      );
      input.focus();
    } else {
      const panel = document.querySelector('.step-panel.active');
      panel?.prepend(error);
      error.tabIndex = -1;
      error.focus();
    }
    return false;
  };
  window.registrationEmailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  window.clearRegistrationDraft = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Storage may be disabled. */
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved && Date.now() - saved.savedAt < 24 * 60 * 60 * 1000) {
        if (saved.communityType) window.showOrganizationFlow(saved.communityType);
        for (const id of fields) {
          const input = document.getElementById(id);
          if (input && typeof saved.values?.[id] === 'string') input.value = saved.values[id];
        }
        window.updateHouseholdBandVisibility();
      } else window.clearRegistrationDraft();
    } catch {
      window.clearRegistrationDraft();
    }
    const notice = document.createElement('p');
    notice.textContent =
      'Your draft stays in this tab for up to 24 hours. Reloading will restore your contact details; documents and consent must be added again.';
    document.getElementById('step-1')?.prepend(notice);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear saved draft';
    clear.addEventListener('click', () => {
      window.clearRegistrationDraft();
      notice.textContent = 'Saved draft cleared. Your current entries remain on this page.';
    });
    notice.append(' ', clear);
    const save = (event) => {
      if (!fields.includes(event.target.id)) return;
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            savedAt: Date.now(),
            communityType: document.querySelector('.type-btn.selected')?.dataset.type || 'Parish',
            values: Object.fromEntries(fields.map((id) => [id, document.getElementById(id)?.value || ''])),
          })
        );
      } catch {
        /* Registration remains usable when browser storage is disabled. */
      }
    };
    document.addEventListener('input', save);
    document.addEventListener('change', save);
  });
})();
