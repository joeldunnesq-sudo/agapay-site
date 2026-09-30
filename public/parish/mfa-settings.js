(function () {
  'use strict';
  window.addParishAuthenticator = async function (button) {
    const status = document.getElementById('parishAuthenticatorStatus');
    const parishId = document.getElementById('parishId')?.value.trim();
    const token = document.getElementById('parishToken')?.value.trim();
    if (!parishId || !token) { status.textContent = 'Sign in with the primary parish login first.'; return; }
    button.disabled = true;
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    async function post(path, body) {
      const response = await fetch(path, { method: 'POST', cache: 'no-store', headers, body: JSON.stringify(body) });
      return { response, data: await response.json() };
    }
    try {
      status.textContent = 'Preparing authenticator setup…';
      let result = await post('/api/mfa/parish-authenticator', { parishId });
      if (result.response.status === 428) {
        const step = await post('/api/mfa/step-up', { principalType: 'parish_admin', principalId: parishId });
        if (!step.response.ok) throw new Error(step.data.error || 'Sign in again to verify your identity.');
        await window.AgapayMfa.runFlow(step.data);
        result = await post('/api/mfa/parish-authenticator', { parishId });
      }
      if (!result.response.ok) throw new Error(result.data.error || 'Unable to add an authenticator.');
      await window.AgapayMfa.runFlow(result.data, { displayName: parishId, enrollmentMethod: 'totp', required: false });
      status.textContent = 'Authenticator added. Your existing passkeys still work.';
    } catch (error) {
      status.textContent = error.message || 'Authenticator setup did not finish.';
    } finally { button.disabled = false; }
  };
})();
