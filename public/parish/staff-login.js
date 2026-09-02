function showParishStaffLogin() {
  const parishId =
    document.getElementById('parishId')?.value.trim() ||
    new URLSearchParams(window.location.search).get('parish') ||
    '';
  const staffId = document.getElementById('parishStaffId');
  if (staffId && parishId) staffId.value = parishId;
  showParishAuthForm('parishStaffLoginForm');
}

async function loginParishStaff(event) {
  event.preventDefault();
  const parishId = document.getElementById('parishStaffId')?.value.trim();
  const email = document.getElementById('parishStaffEmail')?.value.trim();
  const password = document.getElementById('parishStaffPassword')?.value || '';
  const submit = event.submitter;
  if (!parishId || !email || !password) {
    setStatus('Enter the parish, your email, and your personal password.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    submit.disabled = true;
  }
  try {
    const res = await fetch('/api/identity/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parishId, email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to sign in.');
    const authenticated = data.mfaRequired
      ? await window.AgapayMfa.runFlow(data, { displayName: email })
      : data;
    if (!authenticated.token || !authenticated.parishToken) {
      throw new Error('Your staff account could not open this parish dashboard.');
    }
    sessionStorage.setItem('agapay_parish_id', authenticated.parishId || parishId);
    sessionStorage.setItem('agapay_parish_session_token', authenticated.parishToken);
    sessionStorage.setItem('agapay_identity_session_token', authenticated.token);
    sessionStorage.setItem('agapay_identity_email', authenticated.identityEmail || email);
    sessionStorage.removeItem('agapay_parish_token');
    window.location.href =
      '/parish/dashboard?parish=' + encodeURIComponent(authenticated.parishId || parishId);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  }
}
