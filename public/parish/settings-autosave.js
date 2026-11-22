// Generated from src/browser/parish/settings-autosave.ts by npm run build:browser. Do not edit.
function settingsAutosaveState() {
  const pane = document.getElementById('settingsPane');
  if (!pane || !currentParish) return null;
  if (pane.autosaveState?.parishId !== currentParish.parishId) {
    if (pane.autosaveState?.timer) clearTimeout(pane.autosaveState.timer);
    pane.autosaveState = {
      parishId: currentParish.parishId,
      timer: null,
      pending: null,
      version: 0,
      dirty: false,
      manual: false,
      fields: /* @__PURE__ */ new Set(),
      observed: /* @__PURE__ */ new Map(),
    };
  }
  return pane.autosaveState;
}
function settingsAutosaveStatus(message, failed = false) {
  const status = document.getElementById('settingsAutosaveText');
  if (status) status.textContent = message;
  const retry = document.getElementById('settingsAutosaveRetry');
  if (retry) retry.hidden = !failed;
}
function installSettingsAutosave() {
  const pane = document.getElementById('settingsPane');
  if (!pane) return;
  const state = settingsAutosaveState();
  if (state && !state.dirty && !state.pending) state.observed.clear();
  if (!document.getElementById('settingsAutosaveStatus'))
    pane.insertAdjacentHTML(
      'afterbegin',
      '<div class="settings-autosave-status" id="settingsAutosaveStatus"><span id="settingsAutosaveText" role="status" aria-live="polite">Settings save automatically</span><button type="button" class="btn btn-ghost btn-sm" id="settingsAutosaveRetry" hidden onclick="window.ParishSettings.flush()">Retry save</button></div>'
    );
  if (state?.dirty) settingsAutosaveStatus('Unsaved changes', true);
  if (pane.dataset.autosaveBound) return;
  pane.dataset.autosaveBound = 'true';
  const changed = (event) => {
    const input = event.target;
    if (
      !(
        input instanceof HTMLInputElement ||
        input instanceof HTMLSelectElement ||
        input instanceof HTMLTextAreaElement
      ) ||
      input.disabled
    )
      return;
    const ids = [
      'parishName',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
      'website',
      'taxLegalName',
      'taxEin',
      'settingsLiturgicalCalendar',
      'patronalFeastName',
      'patronalFeastMonth',
      'patronalFeastDay',
      'patronalFeastDateBasis',
      'givingStatus',
      'recurringGivingEnabled',
      'candlesEnabled',
      'commemorationsEnabled',
      'bookstoreEnabled',
      'sacramentPriestsText',
    ];
    if (!ids.includes(input.id)) return;
    const state2 = settingsAutosaveState();
    if (!state2) return;
    const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? String(input.checked) : input.value;
    if (state2.observed.get(input.id) === value) {
      if (event.type === 'change' && state2.dirty) {
        if (state2.timer) clearTimeout(state2.timer);
        state2.timer = setTimeout(() => {
          void flushSettingsAutosave();
        }, 0);
      }
      return;
    }
    state2.observed.set(input.id, value);
    state2.fields.add(input.id);
    state2.version++;
    state2.dirty = true;
    if (state2.timer) clearTimeout(state2.timer);
    settingsAutosaveStatus('Unsaved changes…');
    state2.timer = setTimeout(
      () => {
        void flushSettingsAutosave();
      },
      event.type === 'change' ? 0 : 900
    );
  };
  pane.addEventListener('input', changed);
  pane.addEventListener('change', changed);
  window.addEventListener('beforeunload', (event) => {
    const state2 = settingsAutosaveState();
    if (state2?.dirty || state2?.pending) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
function flushSettingsAutosave() {
  const state = settingsAutosaveState();
  if (!state) return Promise.resolve();
  if (state.timer) clearTimeout(state.timer);
  if (state.pending) return state.pending;
  if (!state.dirty || state.manual) return Promise.resolve();
  const parishId = state.parishId;
  const version = state.version;
  const changedFields = [...state.fields];
  let succeeded = false;
  state.pending = (async () => {
    try {
      const draft = payload(false);
      const keys = new Set(
        changedFields.map((id) =>
          id === 'sacramentPriestsText'
            ? 'sacramentPriests'
            : id === 'settingsLiturgicalCalendar'
              ? 'liturgicalCalendar'
              : id
        )
      );
      if (changedFields.some((id) => id.startsWith('patronalFeast') || id === 'settingsLiturgicalCalendar')) {
        for (const key of [
          'patronalFeast',
          'patronalFeastName',
          'patronalFeastDate',
          'patronalFeastChurchDate',
          'feastCampaigns',
          'givingCatalogChanged',
          'accountingCatalogChanged',
        ])
          keys.add(key);
      }
      const body = Object.fromEntries(
        [...keys].filter((key) => Object.hasOwn(draft, key)).map((key) => [key, draft[key]])
      );
      state.fields.clear();
      const givingSnapshot = givingCatalogSnapshot();
      const accountingSnapshot = accountingCatalogSnapshot();
      state.dirty = false;
      settingsAutosaveStatus('Saving…');
      const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Settings could not be saved. Retry save.');
      if (currentParish?.parishId !== parishId) return;
      if (data.parish) currentParish = { ...currentParish, ...data.parish };
      renderDashboard(true);
      succeeded = true;
      if (state.version === version) {
        if (Object.hasOwn(body, 'givingCatalogChanged'))
          recordSettingsSaveBaselines(givingSnapshot, accountingSnapshot);
        settingsAutosaveStatus('Saved');
      }
    } catch (error) {
      for (const field of changedFields) state.fields.add(field);
      state.dirty = true;
      if (currentParish?.parishId === parishId) settingsAutosaveStatus(error.message, true);
    }
  })().finally(() => {
    state.pending = null;
    if (succeeded && state.dirty && currentParish?.parishId === parishId) void flushSettingsAutosave();
  });
  return state.pending;
}
function showPermanentPasswordPrompt() {
  const dialog = document.getElementById('parishPermanentPasswordDialog');
  if (dialog && !dialog.open) dialog.showModal();
}
function renderPermanentPasswordNotice() {
  const notice = document.getElementById('dashboardPasswordNotice');
  if (!notice) return;
  notice.hidden = !currentParish?.parishDashboardTokenTemporary;
  if (notice.hidden) {
    document.getElementById('parishPermanentPasswordDialog')?.close();
    return;
  }
  notice.innerHTML =
    '<section class="acct-access-card" role="status"><strong>Permanent password required before launch</strong><p>You are using the temporary invitation password. Set a permanent password to secure the parish dashboard and unlock launch review.</p><button class="btn btn-gold" type="button" onclick="window.ParishSettings.showPasswordPrompt()">Set permanent password</button></section>';
  if (!document.getElementById('parishPermanentPasswordDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'parishPermanentPasswordDialog';
    dialog.className = 'agapay-mfa-dialog';
    dialog.setAttribute('aria-labelledby', 'parishPermanentPasswordTitle');
    dialog.innerHTML =
      '<div class="agapay-mfa-card"><h2 id="parishPermanentPasswordTitle">Set your permanent dashboard password</h2><p>Your parish still uses its temporary invitation password. Choose a permanent password before reviewing and launching giving. Your authenticator stays connected.</p><form onsubmit="window.ParishSettings.savePassword(event)"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm password<input name="confirmation" type="password" autocomplete="new-password" minlength="8" required></label><button class="agapay-mfa-primary" type="submit">Save permanent password</button><p id="permanentPasswordStatus" role="status" aria-live="polite"></p></form><button class="agapay-mfa-back" type="button" onclick="this.closest(&quot;dialog&quot;).close()">Later</button></div>';
    document.body.appendChild(dialog);
  }
  if (notice.dataset.promptShown !== 'true' && !document.querySelector('dialog[open]')) {
    notice.dataset.promptShown = 'true';
    showPermanentPasswordPrompt();
  }
}
async function savePermanentDashboardPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById('permanentPasswordStatus');
  const button = form.querySelector('button[type=submit]');
  const fields = new FormData(form);
  const password = String(fields.get('password') || '');
  if (password.length < 8 || password !== fields.get('confirmation')) {
    status.textContent = 'Enter matching passwords with at least eight characters.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Saving your permanent password…';
  try {
    await flushSettingsAutosave();
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDashboardPassword: password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save the password. Please try again.');
    if (!data.token || !data.parish || data.parish.parishDashboardTokenTemporary)
      throw new Error('Password confirmation was incomplete. Refresh the dashboard to check your access.');
    document.getElementById('parishToken').value = data.token;
    saveSession();
    currentParish = { ...currentParish, ...data.parish };
    form.reset();
    renderPermanentPasswordNotice();
    await loadDashboard();
    setStatus('Permanent password saved. Review the remaining launch steps.', 'success');
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
window.ParishSettings = {
  state: settingsAutosaveState,
  flush: flushSettingsAutosave,
  install: installSettingsAutosave,
  renderPasswordNotice: renderPermanentPasswordNotice,
  showPasswordPrompt: showPermanentPasswordPrompt,
  savePassword: savePermanentDashboardPassword,
};
