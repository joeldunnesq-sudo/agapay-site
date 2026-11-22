// Generated from src/browser/donor/signup.ts by npm run build:browser. Do not edit.
function feedback(message, tone = 'info') {
  setDonorStatus(message, tone);
  const status = document.getElementById('signupStatus');
  if (!status) return;
  status.textContent = message;
  status.className = 'notice ' + tone;
  status.hidden = false;
  if (tone === 'error' || tone === 'success') status.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
async function submit(event) {
  event.preventDefault();
  const button = document.getElementById('signupSubmit');
  if (button?.disabled) return;
  const donorName = document.getElementById('donorName')?.value.trim();
  const email = document.getElementById('donorEmail')?.value.trim();
  const password = document.getElementById('donorPassword')?.value;
  const parishId = document.getElementById('parish')?.value || '';
  const termsAccepted = document.getElementById('agreeTerms')?.checked === true;
  if (!donorName || !email || !password) {
    feedback('Enter your name, email, and password.', 'error');
    return;
  }
  if (!termsAccepted) {
    feedback('Agree to the Terms of Service before creating your account.', 'error');
    return;
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Creating account…';
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2e4);
  feedback('Creating your account…');
  try {
    const data = await donorApi('/api/donor/signup', {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donorName,
        householdName: donorName,
        next: new URLSearchParams(window.location.search).get('next') || '',
        email,
        password,
        parishId,
        addressLine1: document.getElementById('addressLine1')?.value.trim() || '',
        addressLine2: document.getElementById('addressLine2')?.value.trim() || '',
        city: document.getElementById('city')?.value.trim() || '',
        state: document.getElementById('state')?.value.trim() || '',
        postalCode: document.getElementById('postalCode')?.value.trim() || '',
        country: document.getElementById('country')?.value.trim() || 'US',
        termsAccepted,
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {}),
      }),
    });
    try {
      window.AGAPAYDonorSession.saveSession({ donor: data.donor }, email);
      setDonorProfile(data.donor);
    } catch {}
    if (data.verificationUrl) {
      feedback('Account created. Email is not configured, so a test verification link is shown below.', 'success');
      const box = document.getElementById('verificationLinkBox');
      const link = document.getElementById('verificationLink');
      if (box && link) {
        link.href = data.verificationUrl;
        link.textContent = 'Open test verification link';
        box.style.display = 'block';
      }
      return;
    }
    feedback('Account created. Check your email to verify your AGAPAY account.', 'success');
    const next = document.getElementById('signupNextStep');
    if (next) next.style.display = 'block';
  } catch (err) {
    const error = err;
    const duplicate = error.status === 409;
    const actions = document.getElementById('signupAccountActions');
    if (actions) actions.hidden = !duplicate;
    feedback(
      duplicate
        ? 'An account already exists for this email. Log in, or reset your password below.'
        : controller.signal.aborted
          ? 'The request timed out. Try again, or check your email in case your account was created.'
          : /security check/i.test(error.message || '')
            ? 'The security check could not complete. Allow the security challenge in your browser, refresh this page, and try again.'
            : error.message || 'Unable to connect. Check your connection and try again.',
      'error'
    );
  } finally {
    window.clearTimeout(timeout);
    if (button) {
      button.disabled = false;
      button.textContent = 'Create account →';
    }
  }
}
window.AgapaySignup = { submit };
document.addEventListener(
  'invalid',
  () => feedback('Please complete the required fields and agree to the Terms of Service.', 'error'),
  true
);
