(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let state;
  let days = 30;
  let requestNumber = 0;
  const date = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const percent = value => value == null ? '—' : `${value.toFixed(1)}%`;
  async function api(query = '', options = {}) {
    const response = await fetch(`/api/admin/relationships${query}`, { ...options, headers: authHeaders({ 'Content-Type': 'application/json' }) });
    const result = await response.json();
    if (handleAuthFailure(response, result)) throw new Error('Please sign in to view parish relationships.');
    if (!response.ok) throw new Error(result.error || 'Unable to load parish relationships.');
    return result;
  }
  function render() {
    const r = state.retention;
    document.getElementById('parishRetention').innerHTML = `<div class="retention-heading"><div><span class="care-eyebrow">THE LONG VIEW</span><h3>Parish retention</h3></div><label>Period <select id="retentionPeriod" aria-label="Retention period">${[30, 90, 365].map(n => `<option value="${n}" ${n === days ? 'selected' : ''}>${n} days</option>`).join('')}</select></label></div>${r ? `<div class="retention-values"><div><strong>${percent(r.rate)}</strong><span>Paying parishes retained</span><small>${r.retained} of ${r.opening} at the start · ${r.lost} no longer active</small></div><div><strong>${percent(r.revenueRate)}</strong><span>Net revenue retention</span><small>Starting parishes only · includes plan changes</small></div><div><strong>${r.newPaid}</strong><span>New or returning paid parishes</span><small>Since ${date(state.baselineDay)}</small></div></div><p class="care-caption">Compares the opening daily record with current active paid subscriptions. Trials, free plans and past-due accounts are excluded. A parish that left and returned counts as retained.</p>` : `<div class="retention-empty"><span class="care-orbit" aria-hidden="true">↗</span><div><strong>A clearer picture, day by day.</strong><p>${state.trackingSince ? `Daily tracking began ${date(state.trackingSince)}. A ${days}-day comparison will appear once enough history is available.` : 'Daily tracking starts with the next hourly update. Retention will appear after a complete comparison period.'}</p></div><span class="care-pill">Collecting history</span></div>`}`;
    document.getElementById('retentionPeriod').addEventListener('change', e => { days = Number(e.target.value); window.loadParishRelationships(); });
    const attention = state.parishes.filter(p => p.attention);
    const milestones = state.parishes.flatMap(p => p.occasions.map(o => ({ ...o, parish: p }))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    document.getElementById('careContent').innerHTML = `<div class="care-columns"><div class="care-attention"><div class="care-section-title"><h3>A little attention goes a long way</h3><span class="care-count">${attention.length}</span></div>${attention.length ? attention.slice(0, 4).map(p => `<button class="care-attention-row" type="button" data-parish="${esc(p.reference)}"><span class="care-dot ${esc(p.attention.tone)}"></span><span><strong>${esc(p.name)}</strong><small>${esc(p.attention.label)}</small></span><span aria-hidden="true">↗</span></button>`).join('') : '<div class="care-clear"><span aria-hidden="true">✓</span><strong>All clear for now</strong><p>No billing or setup issues in the current parish records.</p></div>'}<details class="care-journey"><summary>Onboarding at a glance</summary><div>${Object.entries({ Registered: state.onboarding.registered, Verified: state.onboarding.verified, 'Payments connected': state.onboarding.connected, 'First gift received': state.onboarding.firstGift }).map(([label, n]) => `<div><span>${label}</span><strong>${n}</strong><meter min="0" max="${Math.max(1, state.onboarding.registered)}" value="${n}" aria-label="${label}"></meter></div>`).join('')}</div></details></div><div class="care-milestones"><div class="care-section-title"><h3>Moments worth celebrating</h3><span class="care-caption">Next up</span></div>${milestones.length ? milestones.map(o => `<button type="button" class="care-milestone" data-manage="${esc(o.parish.reference)}"><span class="care-date"><small>${new Date(`${o.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</small><strong>${o.date.slice(8)}</strong></span><span class="care-event"><strong>${esc(o.parish.name)}</strong><small>${esc(o.title)} · ${o.date.slice(0, 4)}</small></span><span class="care-pill ${o.parish.preferences[o.kind] && o.parish.eligible ? 'green' : ''}">${o.parish.preferences[o.kind] && o.parish.eligible ? 'Scheduled' : 'Preview'}</span></button>`).join('') : '<p class="care-caption">Signup anniversaries and patronal feasts will appear here as parish details are completed.</p>'}</div></div><details class="care-manage"><summary>Manage annual emails <span>Recipients, previews & delivery history</span></summary><p class="care-caption">Preview each message, then enable the annual emails you want. Sends during the 9 a.m. hour in the selected time zone for verified parishes. Ended and unpaid subscriptions are skipped. Reply requests can be honored by disabling either message here.</p>${state.parishes.map(p => `<div class="care-manage-row"><div><strong>${esc(p.name)}</strong><small>${p.hasFeast ? 'Patronal feast recorded' : 'Add a patronal feast in parish settings'} · ${p.preferences.anniversary || p.preferences.feast ? 'Annual emails enabled' : 'Preview mode'}</small></div><button class="secondary btn-sm" type="button" data-manage="${esc(p.reference)}">Review & configure</button></div>`).join('')}<h4>Recent delivery activity</h4>${state.history.length ? state.history.map(h => `<div class="care-history"><span>${esc(state.parishes.find(p => p.reference === h.reference)?.name || 'Parish')} · ${h.kind === 'feast' ? 'Patronal feast' : 'Anniversary'}<small>${date(h.occasion_date)}</small></span><span class="care-pill">${esc(h.status === 'sent' ? 'Accepted by email provider' : h.status === 'sending' ? 'Sending / review if delayed' : h.status)}</span></div>`).join('') : '<p class="care-caption">No annual messages sent yet.</p>'}</details>`;
    document.querySelectorAll('[data-parish]').forEach(el => el.addEventListener('click', () => { switchTab('giving'); loadDetail(el.dataset.parish); }));
    document.querySelectorAll('[data-manage]').forEach(el => el.addEventListener('click', () => manage(el.dataset.manage)));
  }
  function manage(reference) {
    document.getElementById('careDialog')?.remove();
    const p = state.parishes.find(item => item.reference === reference);
    const prefs = p.preferences;
    const dialog = document.createElement('dialog'); dialog.id = 'careDialog'; dialog.className = 'care-dialog';
    dialog.innerHTML = `<div class="care-dialog-heading"><div><span class="care-eyebrow">A PERSONAL TOUCH</span><h2>${esc(p.name)}</h2></div><button type="button" class="secondary btn-sm" id="careClose">Close</button></div><p class="care-caption">Your annual notes of gratitude, with accurate giving figures and thoughtful feast-day wishes.</p><form id="careForm"><div class="care-settings-grid"><section><h3>Signup anniversary</h3><p>A year of giving, donor participation, and a useful next step.</p><label>Report recipient<input id="careRecipient" type="email" value="${esc(prefs.recipient)}" maxlength="254"></label><button type="button" class="secondary btn-sm" data-preview="anniversary">Preview anniversary email</button><label class="care-check"><input id="careAnniversary" type="checkbox" ${prefs.anniversary ? 'checked' : ''}> Send automatically each year</label></section><section><h3>Patronal feast</h3><p>A warm greeting for the clergy and faithful. Many years!</p><label>Greeting recipient<input id="careFeastRecipient" type="email" value="${esc(prefs.feastRecipient)}" maxlength="254"></label><button type="button" class="secondary btn-sm" data-preview="feast" ${p.hasFeast ? '' : 'disabled'}>Preview feast-day email</button><label class="care-check"><input id="careFeast" type="checkbox" ${prefs.feast ? 'checked' : ''} ${p.hasFeast ? '' : 'disabled'}> Send automatically each year</label>${p.hasFeast ? '' : '<p class="care-caption">Set the patronal feast and observed date in the parish dashboard first.</p>'}</section></div><div class="care-form-footer"><label>Parish time zone<input id="careTimeZone" list="careTimeZones" value="${esc(prefs.timeZone)}" required maxlength="80"><datalist id="careTimeZones">${['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Australia/Sydney', 'UTC'].map(z => `<option value="${z}">`).join('')}</datalist></label><button type="submit">Save email preferences</button></div></form><p id="careDialogStatus" role="status"></p><section id="carePreview" hidden><h3 id="careSubject"></h3><p class="care-caption" id="carePreviewNote"></p><iframe title="Annual parish email preview" sandbox="" referrerpolicy="no-referrer"></iframe></section>`;
    document.body.append(dialog); dialog.showModal();
    document.getElementById('careClose').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-preview]').forEach(button => button.onclick = async () => {
      const status = document.getElementById('careDialogStatus'); button.disabled = true; status.textContent = 'Preparing your preview…';
      try {
        const result = await api(`?preview=${button.dataset.preview}&reference=${encodeURIComponent(reference)}`);
        document.getElementById('carePreview').hidden = false;
        document.getElementById('careSubject').textContent = result.message.subject;
        document.getElementById('carePreviewNote').textContent = result.note;
        dialog.querySelector('iframe').srcdoc = result.message.html; status.textContent = 'Preview ready. No email was sent.';
      } catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
    });
    document.getElementById('careForm').onsubmit = async event => {
      event.preventDefault(); const button = event.submitter; button.disabled = true;
      const status = document.getElementById('careDialogStatus'); status.textContent = 'Saving…';
      try {
        await api('', { method: 'POST', body: JSON.stringify({ reference, preferences: { recipient: document.getElementById('careRecipient').value, feastRecipient: document.getElementById('careFeastRecipient').value, anniversary: document.getElementById('careAnniversary').checked, feast: document.getElementById('careFeast').checked, timeZone: document.getElementById('careTimeZone').value } }) });
        status.textContent = 'Saved. Annual messages follow these preferences; no email was sent now.'; await window.loadParishRelationships();
      } catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
    };
  }
  window.loadParishRelationships = async () => {
    const requestId = ++requestNumber;
    const status = document.getElementById('careStatus'); if (!status) return;
    status.textContent = 'Refreshing parish relationships…';
    try { const result = await api(`?days=${days}`); if (requestId !== requestNumber) return; state = result; render(); status.textContent = state.emailConfigured ? '' : 'Email delivery is not configured. Previews and preferences are available.'; }
    catch (error) { if (requestId === requestNumber) status.textContent = error.message; }
  };
  document.getElementById('careRefresh')?.addEventListener('click', () => window.loadParishRelationships());
})();
