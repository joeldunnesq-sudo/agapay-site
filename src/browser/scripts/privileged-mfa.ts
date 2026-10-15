import type {
  JsonCreationOptions,
  JsonRequestOptions,
  RegistrationCredential,
  AuthenticationCredential,
} from '../passkey-client-contracts.js';
interface MfaPayload extends Record<string, unknown> {
  mfaRequired?: boolean;
  enrollmentRequired?: boolean;
  pendingToken?: string;
  methods?: string[];
  passkeyOptions?: JsonRequestOptions;
  options?: JsonCreationOptions;
  secret?: string;
  otpauthUri?: string;
  recoveryCodes?: string[];
  error?: string;
  reference?: string;
  code?: string;
  principalType?: string;
  principalId?: string;
}
interface ActiveMfaFlow extends MfaPayload {
  pendingToken: string;
  methods: string[];
  required: boolean;
  displayName: string;
  enrollmentMethod?: 'totp';
  verifying?: boolean;
  resolve(payload: MfaPayload): void;
  reject(error: Error): void;
}
import type {} from '../native-contracts.js';
(function () {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  let activeFlow: ActiveMfaFlow | null = null;
  let stepUpPromise: Promise<MfaPayload> | null = null;

  function b64urlToBytes(value: unknown) {
    const normalized = String(value || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function bytesToB64url(value: ArrayBuffer | ArrayBufferView | null | undefined) {
    if (value === null || value === undefined) return null;
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(((value as ArrayBufferView).buffer || value) as ArrayBuffer);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function creationOptionsFromJson(options: JsonCreationOptions) {
    return {
      ...options,
      challenge: b64urlToBytes(options.challenge),
      user: { ...options.user, id: b64urlToBytes(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map((item) => ({ ...item, id: b64urlToBytes(item.id) })),
    };
  }

  function requestOptionsFromJson(options: JsonRequestOptions) {
    return {
      ...options,
      challenge: b64urlToBytes(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((item) => ({ ...item, id: b64urlToBytes(item.id) })),
    };
  }

  function registrationToJson(credential: RegistrationCredential) {
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
        publicKeyAlgorithm:
          typeof credential.response.getPublicKeyAlgorithm === 'function'
            ? credential.response.getPublicKeyAlgorithm()
            : undefined,
      },
    };
  }

  function authenticationToJson(credential: AuthenticationCredential) {
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

  async function api(path: string, body: unknown, headers: Record<string, string> = {}) {
    const response = await nativeFetch(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body || {}),
    });
    const payload = (await response.json().catch(() => ({}))) as MfaPayload;
    if (!response.ok) {
      const reference = /^[a-f0-9-]{36}$/i.test(payload.reference || '') ? ` Reference: ${payload.reference}` : '';
      throw new Error((payload.error || 'Multi-factor authentication failed.') + reference);
    }
    return payload;
  }

  function ensureDialog() {
    let dialog = document.getElementById('agapayMfaDialog') as HTMLDialogElement;
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'agapayMfaDialog';
    dialog.className = 'agapay-mfa-dialog';
    dialog.setAttribute('aria-labelledby', 'agapayMfaTitle');
    dialog.innerHTML =
      '<div class="agapay-mfa-card"><div class="agapay-mfa-mark"><img src="/mark.png" alt=""></div><div id="agapayMfaBody"></div></div>';
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!activeFlow?.required) cancelFlow();
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function setBody(html: string) {
    const dialog = ensureDialog();
    dialog.querySelector<HTMLElement>('#agapayMfaBody')!.innerHTML = html;
    if (!dialog.open) dialog.showModal();
  }

  function setMessage(message: string, tone: string = '') {
    const target = document.getElementById('agapayMfaMessage') as HTMLElement;
    if (!target) return;
    target.textContent = message || '';
    target.className = `agapay-mfa-message ${tone}`.trim();
  }

  function closeDialog() {
    const dialog = document.getElementById('agapayMfaDialog') as HTMLDialogElement;
    if (dialog?.open) dialog.close();
  }

  function cancelFlow() {
    if (activeFlow?.verifying) return;
    const flow = activeFlow!;
    activeFlow = null;
    closeDialog();
    flow?.reject(new Error('Authenticator setup cancelled.'));
  }

  function methodButtons(flow: ActiveMfaFlow) {
    const passkey =
      flow.enrollmentMethod !== 'totp' &&
      window.PublicKeyCredential &&
      navigator.credentials &&
      (flow.enrollmentRequired || flow.methods.includes('passkey'));
    const totp = flow.enrollmentRequired || flow.methods.includes('totp');
    return `<div class="agapay-mfa-methods">
      ${passkey ? '<button type="button" class="agapay-mfa-primary" data-mfa-action="passkey">Use a passkey<span>Face ID, fingerprint, device PIN, or security key</span></button>' : ''}
      ${totp ? '<button type="button" data-mfa-action="totp">Use an authenticator app<span>Enter a six-digit code</span></button>' : ''}
      ${!flow.enrollmentRequired && flow.methods.includes('recovery') ? '<button type="button" data-mfa-action="recovery">Use a recovery code<span>Single-use emergency access</span></button>' : ''}
    </div>`;
  }

  function renderChoice(flow: ActiveMfaFlow) {
    setBody(`<div class="agapay-mfa-eyebrow">Protected administrator access</div>
      <h2 id="agapayMfaTitle">${flow.enrollmentMethod === 'totp' ? 'Add an authenticator app' : flow.enrollmentRequired ? 'Secure this account' : 'Confirm it’s you'}</h2>
      <p>${flow.enrollmentMethod === 'totp' ? 'Add a six-digit authenticator code while keeping your existing sign-in methods.' : flow.enrollmentRequired ? 'Administrator accounts require multi-factor authentication. A passkey is the fastest and strongest option.' : 'Use a registered second factor to finish signing in or approve this sensitive action.'}</p>
      ${methodButtons(flow)}
      ${!flow.required ? '<button type="button" id="agapayMfaCancel">Cancel setup</button>' : ''}
      <div id="agapayMfaMessage" class="agapay-mfa-message"></div>`);
    const cancel = document.getElementById('agapayMfaCancel') as HTMLElement;
    if (cancel) cancel.onclick = cancelFlow;
    document.querySelectorAll<HTMLElement>('[data-mfa-action]').forEach((button) => {
      button.addEventListener('click', () => chooseMethod(button.dataset.mfaAction));
    });
  }

  async function chooseMethod(method: string | undefined) {
    if (!activeFlow) return;
    setMessage('Preparing secure verification…');
    try {
      if (method === 'passkey') {
        if (activeFlow!.enrollmentRequired) await enrollPasskey();
        else await authenticatePasskey();
        return;
      }
      if (method === 'totp') {
        if (activeFlow!.enrollmentRequired) await beginTotpEnrollment();
        else renderCodeEntry('totp');
        return;
      }
      renderCodeEntry('recovery');
    } catch (error) {
      if (!activeFlow) return;
      renderChoice(activeFlow!);
      setMessage((error as Error).message, 'error');
    }
  }

  async function enrollPasskey() {
    const started = await api('/api/mfa/enrollment/options', {
      pendingToken: activeFlow!.pendingToken,
      method: 'passkey',
      displayName: activeFlow!.displayName || 'AGAPAY administrator',
      credentialLabel: 'Primary passkey',
    });
    const credential = await navigator.credentials.create({ publicKey: creationOptionsFromJson(started.options!) });
    if (!credential) throw new Error('Passkey setup was cancelled.');
    const completed = await api('/api/mfa/enrollment/verify', {
      pendingToken: activeFlow!.pendingToken,
      method: 'passkey',
      credential: registrationToJson(credential as RegistrationCredential),
    });
    finishFlow(completed);
  }

  async function authenticatePasskey() {
    if (!activeFlow!.passkeyOptions) throw new Error('No registered passkey is available.');
    const credential = await navigator.credentials.get({
      publicKey: requestOptionsFromJson(activeFlow!.passkeyOptions!),
    });
    if (!credential) throw new Error('Passkey verification was cancelled.');
    const completed = await api('/api/mfa/verify', {
      pendingToken: activeFlow!.pendingToken,
      method: 'passkey',
      credential: authenticationToJson(credential as AuthenticationCredential),
    });
    finishFlow(completed);
  }

  async function beginTotpEnrollment() {
    const flow = activeFlow;
    const started = await api('/api/mfa/enrollment/options', {
      pendingToken: activeFlow!.pendingToken,
      method: 'totp',
      displayName: activeFlow!.displayName || 'AGAPAY administrator',
    });
    if (activeFlow !== flow) return;
    setBody(`<div class="agapay-mfa-eyebrow">Authenticator app</div>
      <h2 id="agapayMfaTitle">Add AGAPAY to your app</h2>
      <p>Open your authenticator app, add an account, and enter this setup key. On a phone, the button may open your authenticator automatically.</p>
      <div class="agapay-mfa-secret"><span>Setup key</span><strong>${started.secret}</strong><button type="button" id="agapayMfaCopySecret">Copy</button></div>
      <a class="agapay-mfa-link" href="${started.otpauthUri}">Open authenticator app</a>
      <form id="agapayMfaCodeForm"><label>Six-digit code<input id="agapayMfaCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label><button class="agapay-mfa-primary" type="submit">Verify and continue</button></form>
      <button type="button" class="agapay-mfa-back" id="agapayMfaBack">Choose another method</button>
      <div id="agapayMfaMessage" class="agapay-mfa-message"></div>`);
    (document.getElementById('agapayMfaCopySecret') as HTMLElement).onclick = async () => {
      await navigator.clipboard.writeText(started.secret!);
      setMessage('Setup key copied.', 'success');
    };
    (document.getElementById('agapayMfaBack') as HTMLElement).onclick = () => renderChoice(activeFlow!);
    if (!activeFlow!.required) {
      const back = document.getElementById('agapayMfaBack') as HTMLElement;
      back.textContent = 'Cancel setup';
      back.onclick = cancelFlow;
    }
    (document.getElementById('agapayMfaCodeForm') as HTMLElement).onsubmit = (event) => submitCode(event, 'totp', true);
  }

  function renderCodeEntry(method: string) {
    const recovery = method === 'recovery';
    setBody(`<div class="agapay-mfa-eyebrow">${recovery ? 'Emergency access' : 'Authenticator app'}</div>
      <h2 id="agapayMfaTitle">Enter your ${recovery ? 'recovery code' : 'six-digit code'}</h2>
      <p>${recovery ? 'Each recovery code can be used only once.' : 'Use the current code shown for AGAPAY in your authenticator app.'}</p>
      <form id="agapayMfaCodeForm"><label>${recovery ? 'Recovery code' : 'Authenticator code'}<input id="agapayMfaCode" ${recovery ? 'autocomplete="off"' : 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"'} required autofocus></label><button class="agapay-mfa-primary" type="submit">Verify and continue</button></form>
      <button type="button" class="agapay-mfa-back" id="agapayMfaBack">Choose another method</button>
      <div id="agapayMfaMessage" class="agapay-mfa-message"></div>`);
    (document.getElementById('agapayMfaBack') as HTMLElement).onclick = () => renderChoice(activeFlow!);
    (document.getElementById('agapayMfaCodeForm') as HTMLElement).onsubmit = (event) =>
      submitCode(event, method, false);
  }

  async function submitCode(event: SubmitEvent, method: string, enrollment: boolean) {
    event.preventDefault();
    const code = (document.getElementById('agapayMfaCode') as HTMLInputElement).value.trim();
    const button = event.submitter as HTMLButtonElement;
    button.disabled = true;
    activeFlow!.verifying = true;
    setMessage('Verifying…');
    try {
      const completed = await api(enrollment ? '/api/mfa/enrollment/verify' : '/api/mfa/verify', {
        pendingToken: activeFlow!.pendingToken,
        method,
        code,
      });
      finishFlow(completed);
    } catch (error) {
      setMessage((error as Error).message, 'error');
      if (activeFlow) activeFlow!.verifying = false;
      button.disabled = false;
      (document.getElementById('agapayMfaCode') as HTMLInputElement)?.focus();
    }
  }

  function finishFlow(payload: MfaPayload) {
    if (Array.isArray(payload.recoveryCodes) && payload.recoveryCodes.length) {
      const codes = payload.recoveryCodes;
      setBody(`<div class="agapay-mfa-eyebrow">Account recovery</div>
        <h2 id="agapayMfaTitle">Save these recovery codes</h2>
        <p>Store them somewhere secure. Each code works once, and AGAPAY will not display this set again.</p>
        <div class="agapay-mfa-recovery-codes">${codes.map((code) => `<code>${code}</code>`).join('')}</div>
        <div class="agapay-mfa-actions"><button type="button" id="agapayMfaCopyCodes">Copy codes</button><button type="button" id="agapayMfaDownloadCodes">Download</button></div>
        <label class="agapay-mfa-confirm"><input type="checkbox" id="agapayMfaCodesSaved"> I saved these codes securely.</label>
        <button type="button" class="agapay-mfa-primary" id="agapayMfaContinue" disabled>Continue</button>`);
      (document.getElementById('agapayMfaCopyCodes') as HTMLElement).onclick = () =>
        navigator.clipboard.writeText(codes.join('\n'));
      (document.getElementById('agapayMfaDownloadCodes') as HTMLElement).onclick = () => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(
          new Blob([`AGAPAY recovery codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
        );
        link.download = 'agapay-recovery-codes.txt';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      };
      (document.getElementById('agapayMfaCodesSaved') as HTMLInputElement).onchange = (event) => {
        (document.getElementById('agapayMfaContinue') as HTMLButtonElement).disabled = !(
          event.target as HTMLInputElement
        ).checked;
      };
      (document.getElementById('agapayMfaContinue') as HTMLButtonElement).onclick = () => resolveFlow(payload);
      return;
    }
    resolveFlow(payload);
  }

  function resolveFlow(payload: MfaPayload) {
    const flow = activeFlow;
    activeFlow = null;
    closeDialog();
    flow?.resolve(payload);
  }

  function runFlow(
    flow: Record<string, unknown>,
    options: { displayName?: string; enrollmentMethod?: 'totp'; required?: boolean } = {}
  ) {
    if (!flow?.mfaRequired) return Promise.resolve(flow);
    if (activeFlow) return Promise.reject(new Error('Another security verification is already open.'));
    return new Promise<MfaPayload>((resolve, reject) => {
      activeFlow = {
        ...(flow as ActiveMfaFlow),
        displayName: options.displayName || '',
        required: options.required !== false,
        enrollmentMethod: options.enrollmentMethod,
        resolve,
        reject,
      };
      renderChoice(activeFlow!);
      if (options.enrollmentMethod === 'totp' && activeFlow!.enrollmentRequired) chooseMethod('totp');
    });
  }

  function installFetchStepUp() {
    if ((window.fetch as typeof fetch & { __agapayMfaWrapped?: boolean }).__agapayMfaWrapped) return;
    const wrapped = async function (input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init);
      const response = await nativeFetch(request.clone());
      if (response.status !== 428 || request.url.includes('/api/mfa/')) return response;
      const payload = (await response
        .clone()
        .json()
        .catch(() => ({}))) as MfaPayload;
      if (payload.code !== 'mfa_step_up_required') return response;
      if (!stepUpPromise) {
        const authorization = request.headers.get('Authorization') || '';
        const identityEmail = request.headers.get('X-AGAPAY-User-Email') || '';
        const donorEmail = request.headers.get('X-AGAPAY-Donor-Email') || '';
        const stepUpHeaders: Record<string, string> = {};
        if (authorization) stepUpHeaders.Authorization = authorization;
        if (identityEmail) stepUpHeaders['X-AGAPAY-User-Email'] = identityEmail;
        if (donorEmail) stepUpHeaders['X-AGAPAY-Donor-Email'] = donorEmail;
        stepUpPromise = api(
          '/api/mfa/step-up',
          {
            principalType: payload.principalType,
            principalId: payload.principalId,
          },
          stepUpHeaders
        )
          .then((flow) => runFlow(flow))
          .finally(() => {
            stepUpPromise = null;
          });
      }
      await stepUpPromise;
      return nativeFetch(request.clone());
    };
    wrapped.__agapayMfaWrapped = true;
    window.fetch = wrapped;
  }

  window.AgapayMfa = {
    runFlow,
    installFetchStepUp,
    isSupported: () => Boolean(window.PublicKeyCredential && navigator.credentials),
  };
})();
