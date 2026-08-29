(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let active;
  window.ParishPortability = {
    async open({ parishId, headers }) {
      if (active) { active.focus(); return; }
      const dialog = document.createElement('dialog');
      dialog.className = 'parish-portability';
      dialog.setAttribute('aria-labelledby', 'portability-title');
      dialog.innerHTML = `<header><div><p class="portability-eyebrow">Your parish. Your records.</p><h2 id="portability-title">Data portability</h2></div><button type="button" data-action="dismiss" aria-label="Close data portability">Close</button></header><p>Download your parish records without closing your account, or prepare a final export before closure. Exporting does not cancel your subscription.</p><p class="portability-status" role="status" aria-live="polite">Loading…</p><div class="portability-content"></div>`;
      document.body.append(dialog); active = dialog; dialog.showModal();
      const content = dialog.querySelector('.portability-content'), status = dialog.querySelector('.portability-status');
      const base = '/api/parish/dashboard/' + encodeURIComponent(parishId) + '/portability';
      let timer, state, busy = false, selectedJob = '', verifiedHash = '';
      async function api(path = '', body) {
        const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
        if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'The request could not be completed.'); }
        return response.json();
      }
      function say(message, error = false) { status.textContent = message; status.classList.toggle('is-error', error); }
      function render() {
        if (!state) return;
        const disclosure = state.disclosure;
        content.innerHTML = `<section><h3>Download a copy</h3><p>The archive includes CSV and JSON records, supported uploaded files, and a checksum manifest. Credentials and independent personal accounts are excluded. Self-service exports support up to 24 MB and 10,000 rows per dataset; larger archives require support.</p><button type="button" data-action="export" ${!state.enabled ? 'disabled' : ''}>Prepare parish export</button>${!state.enabled ? '<p class="portability-notice">Self-service portability is awaiting release verification. <a href="mailto:support@agapay.app?subject=Parish%20data%20export">Request your parish export from support</a>.</p>' : '<p class="portability-small">Preparation runs in the background every five minutes. You can close this window and return later.</p>'}</section><section><h3>Export and close parish</h3><p>This separate action requires a saved, verified archive and a final confirmation. A download click never deletes your data.</p><button type="button" data-action="close" ${!state.enabled || !state.closure.available ? 'disabled' : ''}>Prepare final export</button>${state.closure.blockers.map(b => `<p class="portability-small">${escape(b.message)}</p>`).join('')}</section><details><summary>What is retained after closure?</summary>${Object.values(disclosure).slice(1).map(text => `<p>${escape(text)}</p>`).join('')}</details><section><h3>Recent exports</h3>${state.jobs.length ? state.jobs.map(jobMarkup).join('') : '<p>No export requests yet.</p>'}</section>`;
      }
      function jobMarkup(job) {
        const ready = job.status === 'ready' && job.expiresAt > Date.now();
        const final = ready && job.mode === 'close';
        const verified = selectedJob === job.id && verifiedHash === job.archiveSha256;
        return `<article data-job="${escape(job.id)}"><div class="portability-job-heading"><strong>${job.mode === 'close' ? 'Final parish export' : 'Parish export'}</strong><span>${escape(job.status.replaceAll('_', ' '))}</span></div><p class="portability-small">Requested ${escape(new Date(job.createdAt).toLocaleString())} · ${job.rowCount.toLocaleString()} records${job.archiveBytes ? ' · ' + (job.archiveBytes / 1048576).toFixed(2) + ' MB' : ''}</p>${job.errorCode ? `<p class="portability-notice">Export stopped: ${escape(job.errorCode.replaceAll('_', ' '))}. No successful deletion has been reported. Contact support if retrying does not resolve it.</p>` : ''}<div class="portability-actions">${ready ? '<button type="button" data-action="download">Download ZIP</button>' : ''}${job.status === 'failed' ? '<button type="button" data-action="retry">Retry job</button>' : ''}${!job.confirmedAt && !['cancelled','active_data_deleted'].includes(job.status) ? '<button type="button" data-action="cancel">Cancel export</button>' : ''}${job.confirmedAt ? '<button type="button" data-action="receipt">Download status receipt</button>' : ''}</div>${ready ? `<p class="portability-small">Available until ${escape(new Date(job.expiresAt).toLocaleString())}. Downloading alone does not close your parish.</p>` : ''}${final ? `<div class="portability-confirm"><h4>Verify your saved archive</h4><p>Save and open the ZIP first. Select that saved ZIP below; its checksum is calculated on this device. The file is not uploaded.</p><label>Saved ZIP file <input type="file" accept=".zip,application/zip" data-verify="${escape(job.id)}"></label><p>${verified ? 'Saved archive checksum matches.' : 'Select the saved file to verify it.'}</p><label><input type="checkbox" data-saved> I saved and opened my export, reviewed the retention exceptions, and understand that deletion cannot be undone.</label><label>Type <strong>${escape(parishId)}</strong> to confirm <input type="text" data-confirm autocomplete="off" spellcheck="false"></label>${job.closure.blockers.map(b => `<p class="portability-notice">${escape(b.message)}</p>`).join('')}<button class="portability-danger" type="button" data-action="confirm" ${!verified || !job.closure.available ? 'disabled' : ''}>Close parish and delete eligible data</button></div>` : ''}</article>`;
      }
      async function refresh() {
        if (!dialog.open || busy) return;
        try {
          const closing = state?.jobs.find(job => job.confirmedAt);
          if (closing) { const result = await api('/' + closing.id + '/receipt'); state.jobs = state.jobs.map(job => job.id === closing.id ? result.receipt || result.job : job); }
          else state = await api();
          render(); say('Exports and closure requests are private to parish administrators.');
        }
        catch (error) { say(error.message, true); }
        clearTimeout(timer);
        if (dialog.open && state?.jobs.some(j => ['preparing', 'confirming', 'deleting'].includes(j.status))) timer = setTimeout(refresh, 15000);
      }
      function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      dialog.addEventListener('change', async event => {
        const id = event.target.dataset.verify;
        if (!id || busy) return;
        const file = event.target.files?.[0], job = state.jobs.find(j => j.id === id);
        selectedJob = ''; verifiedHash = '';
        if (!file || file.size !== job.archiveBytes) { say('Choose the exact ZIP saved from this export. Its size does not match.', true); render(); return; }
        busy = true; say('Checking the saved file on this device…');
        try {
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
          if (hash !== job.archiveSha256) throw new Error('The saved file does not match this export. Download it again; no deletion has been authorized.');
          selectedJob = id; verifiedHash = hash; say('Saved archive verified. Review the final confirmation below.');
        } catch (error) { say(error.message, true); }
        finally { busy = false; render(); }
      });
      dialog.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'dismiss') { dialog.close(); return; }
        if (busy) return;
        const article = button.closest('[data-job]'), id = article?.dataset.job;
        busy = true; button.disabled = true; clearTimeout(timer);
        try {
          if (action === 'export' || action === 'close') {
            await api('', { mode: action === 'close' ? 'close' : 'export', requestKey: crypto.randomUUID() });
            say('Export queued. You can return later while it is prepared.');
          } else if (action === 'download') {
            const response = await fetch(base + '/' + id + '/download', { headers: headers(), cache: 'no-store' });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Download failed. Your parish data is unchanged.');
            const blob = await response.blob(), job = state.jobs.find(j => j.id === id);
            if (blob.size !== job.archiveBytes) throw new Error('The download was interrupted. Please retry.');
            saveBlob(blob, 'AGAPAY-parish-' + id + '.zip'); say('Save the ZIP and open it to check your records. No deletion has been triggered.');
          } else if (action === 'confirm') {
            if (!article.querySelector('[data-saved]').checked || article.querySelector('[data-confirm]').value !== parishId || selectedJob !== id) throw new Error('Review the confirmation, check the box, and type the parish identifier exactly.');
            await api('/' + id + '/confirm', { saved: true, confirmation: parishId, archiveHash: verifiedHash, policyVersion: state.policyVersion });
            say('Confirmation submitted. Writes are paused while the saved export is checked. Deletion begins only after those checks pass; you can cancel before authorization.');
          } else if (action === 'receipt') {
            const result = await api('/' + id + '/receipt');
            saveBlob(new Blob([JSON.stringify(result.receipt || result.job, null, 2)], { type: 'application/json' }), 'AGAPAY-closure-' + id + '.json');
          } else if (action === 'cancel' || action === 'retry') await api('/' + id + '/' + action, {});
          if (action !== 'download' && action !== 'receipt') { state = await api(); render(); }
        } catch (error) { say(error.message, true); }
        finally { busy = false; if (button.isConnected) button.disabled = false; if (dialog.open && state?.jobs.some(j => ['preparing','confirming','deleting'].includes(j.status))) timer = setTimeout(refresh, 15000); }
      });
      dialog.addEventListener('close', () => { clearTimeout(timer); dialog.remove(); active = null; }, { once: true });
      await refresh();
    },
  };
})();
