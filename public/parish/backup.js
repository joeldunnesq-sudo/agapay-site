(function () {
  'use strict';
  let dispose = () => {};
  window.ParishBackup = {
    mount({ element, parishId, headers }) {
      dispose();
      if (!element || !parishId) return;
      element.innerHTML = `<div class="section-divider"><span>Parish backups</span></div><p class="section-note">Save your parish records as a ZIP with JSON, spreadsheet-ready CSV files, uploaded files, and a checksum manifest. Login credentials and independent personal accounts are excluded. External media is listed by link. Keep your downloaded copy in a secure location.</p>
        <p class="section-note"><strong>Last verified AGAPAY cloud backup · central database</strong><br><span data-cloud role="status">Checking cloud backup…</span></p>
        <p class="section-note">Cloud status refreshes every 30 seconds while these settings are visible. This timestamp covers the central database; separate accounting databases and uploaded files are not certified by this timestamp.</p>
        <div class="btn-row"><button type="button" class="btn btn-gold" data-download disabled>Download parish backup</button><button type="button" class="btn btn-ghost" data-refresh>Refresh cloud status</button></div>
        <p class="section-note" data-progress role="status" aria-live="polite">Checking backup availability…</p>
        <p class="section-note">Uses the primary parish login and may ask you to verify your identity. Preparation can take several minutes. Self-service supports up to 24 MB and 10,000 rows per dataset; <a href="mailto:support@agapay.app?subject=Parish%20data%20backup">contact support for larger backups</a>. An incomplete export will not be offered as a successful backup.</p>
        <div class="section-divider"><span>Data portability</span></div>
        <p class="section-note">Your parish records should remain accessible when you leave. For ownership protection, exports and account closure require the primary parish login created at signup; invited staff logins cannot perform these actions. Downloading alone never deletes data, and exporting does not cancel billing.</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" onclick="openParishPortability()">Data portability &amp; closure</button></div>`;
      const cloud = element.querySelector('[data-cloud]');
      const progress = element.querySelector('[data-progress]');
      const button = element.querySelector('[data-download]');
      const refreshButton = element.querySelector('[data-refresh]');
      const base = '/api/parish/dashboard/' + encodeURIComponent(parishId) + '/portability';
      let stopped = false,
        busy = false,
        enabled = false,
        statusBusy = false,
        jobId = null,
        jobTimer;
      const alive = () => !stopped && element.isConnected;
      async function api(path, body) {
        const response = await fetch(base + path, {
          method: body ? 'POST' : 'GET',
          cache: 'no-store',
          headers: { ...headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to access parish backups.');
        return data;
      }
      async function refresh() {
        if (!alive() || statusBusy) return;
        statusBusy = true;
        refreshButton.disabled = true;
        try {
          const data = await api('/backup-status');
          if (!alive()) return;
          enabled = data.enabled;
          const at = data.cloud?.backedUpAt;
          const date = at && new Date(at);
          cloud.textContent =
            date && Number.isFinite(date.getTime())
              ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' }) +
                (data.cloud.status === 'overdue'
                  ? ' · Overdue: more than 48 hours since the last verified backup.'
                  : ' · Verified')
              : 'No verified cloud backup timestamp is available. Contact AGAPAY support.';
          if (!busy && !jobId && !progress.dataset.completed)
            progress.textContent = enabled
              ? 'Ready to create a local backup.'
              : 'Self-service backups are unavailable. Contact support for your parish archive.';
        } catch (error) {
          if (!alive()) return;
          enabled = false;
          cloud.textContent = 'Cloud backup status could not be checked. Refresh to try again.';
          if (!busy) progress.textContent = error.message;
        } finally {
          statusBusy = false;
          if (alive()) {
            refreshButton.disabled = false;
            button.disabled = busy || !enabled;
          }
        }
      }
      async function download(job) {
        const response = await fetch(base + '/' + job.id + '/download', { headers: headers(), cache: 'no-store' });
        if (!response.ok)
          throw new Error(
            (await response.json().catch(() => ({}))).error || 'Download failed. Press the button to retry.'
          );
        const blob = await response.blob();
        if (blob.size !== job.archiveBytes) throw new Error('The download was interrupted. Press the button to retry.');
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        if (hash !== job.archiveSha256) throw new Error('Backup checksum did not match. Press the button to retry.');
        if (!alive()) return;
        const url = URL.createObjectURL(blob),
          link = document.createElement('a');
        link.href = url;
        link.download = 'AGAPAY-parish-backup-' + job.id + '.zip';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        progress.textContent =
          'Verified ZIP sent to your browser for saving. Check your Downloads folder. Created ' +
          new Date(job.createdAt).toLocaleString() +
          '.';
        progress.dataset.completed = 'true';
        jobId = null;
        button.textContent = 'Download a new parish backup';
      }
      async function checkJob() {
        try {
          const { job } = await api('/' + jobId);
          if (!alive()) return;
          if (job.status === 'ready' && job.expiresAt > Date.now()) {
            await download(job);
          } else if (job.status === 'preparing') {
            progress.textContent =
              'Preparing your parish backup… It will download automatically when ready. Keep this page open, or retrieve it later in Data portability & closure.';
            jobTimer = setTimeout(checkJob, 15000);
            return;
          } else {
            jobId = null;
            throw new Error(
              'Backup could not be completed' +
                (job.errorCode ? ': ' + job.errorCode.replaceAll('_', ' ') : '') +
                '. Contact support if retrying does not resolve it.'
            );
          }
        } catch (error) {
          if (alive()) progress.textContent = error.message;
        }
        busy = false;
        if (alive()) button.disabled = !enabled;
      }
      button.addEventListener('click', async () => {
        if (busy || !alive()) return;
        busy = true;
        button.disabled = true;
        progress.textContent = 'Requesting your parish backup…';
        try {
          if (!jobId) {
            // Reuse an in-progress ordinary export after navigating away and back.
            const state = await api('');
            if (!alive()) return;
            const pending = state.jobs.find(
              (job) => job.mode === 'export' && job.status === 'preparing' && job.expiresAt > Date.now()
            );
            const job = pending || (await api('', { mode: 'export', requestKey: crypto.randomUUID() })).job;
            jobId = job.id;
          }
          if (alive()) await checkJob();
        } catch (error) {
          busy = false;
          if (alive()) {
            progress.textContent = error.message;
            button.disabled = !enabled;
          }
        }
      });
      refreshButton.addEventListener('click', refresh);
      const visibleRefresh = () => {
        if (document.visibilityState === 'visible' && element.getClientRects().length) void refresh();
      };
      const timer = setInterval(() => {
        if (!alive()) dispose();
        else visibleRefresh();
      }, 30000);
      document.addEventListener('visibilitychange', visibleRefresh);
      dispose = () => {
        stopped = true;
        clearInterval(timer);
        clearTimeout(jobTimer);
        document.removeEventListener('visibilitychange', visibleRefresh);
      };
      void refresh();
    },
  };
})();
