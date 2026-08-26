(function () {
  'use strict';

  function supported() {
    return Boolean(window.PublicKeyCredential && navigator.credentials);
  }

  function b64urlToBytes(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function bytesToB64url(value) {
    if (value === null || value === undefined) return null;
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer || value);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function creationOptionsFromJson(options) {
    return {
      ...options,
      challenge: b64urlToBytes(options.challenge),
      user: { ...options.user, id: b64urlToBytes(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: b64urlToBytes(item.id) })),
    };
  }

  function requestOptionsFromJson(options) {
    const converted = { ...options, challenge: b64urlToBytes(options.challenge) };
    if (Array.isArray(options.allowCredentials) && options.allowCredentials.length) {
      converted.allowCredentials = options.allowCredentials.map(item => ({ ...item, id: b64urlToBytes(item.id) }));
    } else {
      delete converted.allowCredentials;
    }
    return converted;
  }

  function registrationToJson(credential) {
    return {
      id: credential.id,
      rawId: bytesToB64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: bytesToB64url(credential.response.clientDataJSON),
        attestationObject: bytesToB64url(credential.response.attestationObject),
        transports: typeof credential.response.getTransports === 'function' ? credential.response.getTransports() : [],
        publicKeyAlgorithm: typeof credential.response.getPublicKeyAlgorithm === 'function' ? credential.response.getPublicKeyAlgorithm() : undefined,
      },
    };
  }

  function authenticationToJson(credential) {
    return {
      id: credential.id,
      rawId: bytesToB64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: bytesToB64url(credential.response.clientDataJSON),
        authenticatorData: bytesToB64url(credential.response.authenticatorData),
        signature: bytesToB64url(credential.response.signature),
        userHandle: credential.response.userHandle ? bytesToB64url(credential.response.userHandle) : undefined,
      },
    };
  }

  function sessionHeaders() {
    const token = localStorage.getItem('agapayDonorToken') || '';
    const email = localStorage.getItem('agapayDonorEmail') || '';
    return {
      Authorization: `Bearer ${token}`,
      'X-AGAPAY-Donor-Email': email,
    };
  }

  async function api(path, { method = 'POST', body, authenticated = false } = {}) {
    const response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(authenticated ? sessionHeaders() : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'The passkey request could not be completed.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function friendlyCredentialError(error, fallback) {
    if (error?.name === 'AbortError') return error;
    if (error?.name === 'NotAllowedError') return new Error('Passkey use was cancelled or timed out.');
    if (error?.name === 'InvalidStateError') return new Error('That passkey is already registered on this account.');
    return error instanceof Error ? error : new Error(fallback);
  }

  async function authenticate({ mediation, signal } = {}) {
    if (!supported()) throw new Error('Passkeys are not supported in this browser.');
    const started = await api('/api/donor/passkeys/authentication/options');
    let credential;
    try {
      credential = await navigator.credentials.get({
        publicKey: requestOptionsFromJson(started.options),
        ...(mediation ? { mediation } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throw friendlyCredentialError(error, 'Passkey sign-in could not start.');
    }
    if (!credential) throw new Error('No passkey was selected.');
    return api('/api/donor/passkeys/authentication/verify', {
      body: { pendingToken: started.pendingToken, credential: authenticationToJson(credential) },
    });
  }

  async function register(label = 'This device') {
    if (!supported()) throw new Error('Passkeys are not supported in this browser.');
    const started = await api('/api/donor/passkeys/registration/options', { authenticated: true });
    let credential;
    try {
      credential = await navigator.credentials.create({ publicKey: creationOptionsFromJson(started.options) });
    } catch (error) {
      throw friendlyCredentialError(error, 'Passkey setup could not start.');
    }
    if (!credential) throw new Error('Passkey setup was cancelled.');
    return api('/api/donor/passkeys/registration/verify', {
      authenticated: true,
      body: {
        pendingToken: started.pendingToken,
        label: String(label || 'Passkey').trim().slice(0, 80) || 'Passkey',
        credential: registrationToJson(credential),
      },
    });
  }

  function list() {
    return api('/api/donor/passkeys', { method: 'GET', authenticated: true });
  }

  function rename(id, label) {
    return api(`/api/donor/passkeys/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      authenticated: true,
      body: { label },
    });
  }

  function remove(id) {
    return api(`/api/donor/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE', authenticated: true });
  }

  function formatDate(value) {
    if (!value) return 'Not used yet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not used yet' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function securityMessage(message, tone = '') {
    const target = document.getElementById('consumerPasskeyMessage');
    if (!target) return;
    target.textContent = message || '';
    target.className = `passkey-security-message ${tone}`.trim();
  }

  function renderPasskeyList(passkeys) {
    const listElement = document.getElementById('consumerPasskeyList');
    const countElement = document.getElementById('consumerPasskeyCount');
    if (!listElement) return;
    const entries = Array.isArray(passkeys) ? passkeys : [];
    if (countElement) countElement.textContent = entries.length ? `${entries.length} saved` : 'Email sign-in active';
    listElement.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'passkey-empty-state';
      empty.innerHTML = '<strong>No passkeys yet</strong><span>Add this phone or computer for faster sign-in next time.</span>';
      listElement.appendChild(empty);
      return;
    }
    entries.forEach(passkey => {
      const row = document.createElement('div');
      row.className = 'passkey-device-row';

      const icon = document.createElement('span');
      icon.className = 'passkey-device-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✓';

      const details = document.createElement('div');
      details.className = 'passkey-device-details';
      const label = document.createElement('input');
      label.className = 'form-input passkey-label-input';
      label.value = passkey.label || 'Passkey';
      label.setAttribute('aria-label', 'Passkey name');
      const meta = document.createElement('span');
      meta.textContent = passkey.lastUsedAt ? `Last used ${formatDate(passkey.lastUsedAt)}` : `Added ${formatDate(passkey.createdAt)}`;
      details.append(label, meta);

      const actions = document.createElement('div');
      actions.className = 'passkey-device-actions';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'btn btn-ghost btn-sm';
      save.textContent = 'Rename';
      save.addEventListener('click', async () => {
        save.disabled = true;
        securityMessage('Saving passkey name…');
        try {
          const result = await rename(passkey.id, label.value);
          renderPasskeyList(result.passkeys);
          securityMessage('Passkey name saved.', 'success');
        } catch (error) {
          securityMessage(error.message, 'error');
          save.disabled = false;
        }
      });
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-ghost btn-sm passkey-remove-button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', async () => {
        if (!window.confirm(`Remove “${passkey.label || 'this passkey'}”? You can still sign in with email and password.`)) return;
        removeButton.disabled = true;
        securityMessage('Removing passkey…');
        try {
          const result = await remove(passkey.id);
          renderPasskeyList(result.passkeys);
          securityMessage('Passkey removed. Email sign-in remains available.', 'success');
        } catch (error) {
          securityMessage(error.message, 'error');
          removeButton.disabled = false;
        }
      });
      actions.append(save, removeButton);
      row.append(icon, details, actions);
      listElement.appendChild(row);
    });
  }

  async function initializeManagement() {
    const card = document.getElementById('consumerPasskeyCard');
    if (!card) return;
    const addButton = document.getElementById('consumerPasskeyAdd');
    const labelInput = document.getElementById('consumerPasskeyNewLabel');
    if (!supported()) {
      if (addButton) addButton.disabled = true;
      securityMessage('This browser does not support passkeys. You can continue signing in with email and password.');
    }
    try {
      const result = await list();
      renderPasskeyList(result.passkeys);
    } catch (error) {
      securityMessage(error.message, 'error');
    }
    addButton?.addEventListener('click', async () => {
      addButton.disabled = true;
      securityMessage('Follow your device prompt to create the passkey…');
      try {
        const result = await register(labelInput?.value || 'This device');
        renderPasskeyList(result.passkeys);
        if (labelInput) labelInput.value = '';
        securityMessage('Passkey added. You can use it the next time you sign in.', 'success');
      } catch (error) {
        if (error?.name !== 'AbortError') securityMessage(error.message, 'error');
      } finally {
        addButton.disabled = !supported();
      }
    });
  }

  window.AgapayPasskeys = {
    authenticate,
    isSupported: supported,
    list,
    register,
    remove,
    rename,
    storeSession(payload) {
      if (payload?.token) localStorage.setItem('agapayDonorToken', payload.token);
      const email = payload?.donor?.email || '';
      if (email) localStorage.setItem('agapayDonorEmail', email);
      if (payload?.donor) localStorage.setItem('agapayDonorProfile', JSON.stringify(payload.donor));
    },
  };

  document.addEventListener('DOMContentLoaded', initializeManagement);
})();
