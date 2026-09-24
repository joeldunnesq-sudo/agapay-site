(function () {
  'use strict';
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/parish/recovery.css?v=20260924recovery1';
  document.head.append(stylesheet);
  function mountToolbar() {
    const toolbar = document.querySelector('.acct-suite-header-meta');
    if (!toolbar || toolbar.querySelector('[data-recovery-toolbar]')) return;
    {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'acct-refresh';
      button.textContent = 'Backup & restore';
      button.dataset.recoveryToolbar = 'true';
      button.onclick = () =>
        window.ParishRecovery.openAccounting({ parishId: currentParish.parishId, headers: authHeaders });
      toolbar.prepend(button);
    }
  }
  new MutationObserver(mountToolbar).observe(document.body, { childList: true, subtree: true });
  mountToolbar();
  const mounts = new WeakMap();
  const labels = { parish: 'parish', accounting: 'accounting' };
  const date = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  window.ParishRecovery = {
    mount({ element, parishId, headers, scope = 'parish' }) {
      if (!element || !parishId || !labels[scope]) return;
      mounts.get(element)?.();
      element.innerHTML = `<div class="section-divider"><span>Backup &amp; restore · ${scope === 'parish' ? 'Whole parish' : 'Accounting only'}</span></div>
        <p class="section-note">Create a restore-ready cloud snapshot before making major changes. ${scope === 'accounting' ? 'Restoring here affects the books and accounting attachments, not other parish records.' : 'Restoring here affects parish-owned records, uploaded files, and accounting books.'}</p>
        <p class="section-note"><strong>Latest restore-ready backup</strong><br><span data-recovery-latest role="status">Checking…</span></p>
        <div class="btn-row"><button type="button" class="btn btn-gold" data-recovery-backup disabled>Back up ${scope} now</button><button type="button" class="btn btn-ghost" data-recovery-restore disabled>Restore…</button><button type="button" class="btn btn-ghost" data-recovery-download disabled>Download latest backup</button><button type="button" class="btn btn-ghost" data-recovery-refresh>Refresh</button></div>
        <p class="section-note" data-recovery-status role="status" aria-live="polite"></p>
        <div class="btn-row"><button type="button" class="btn btn-gold" data-recovery-resume hidden>Resume operation</button><button type="button" class="btn btn-ghost" data-recovery-rollback hidden>Recover pre-restore safety copy</button><button type="button" class="btn btn-ghost" data-recovery-cancel hidden>Cancel before replacement</button></div>
        <p class="section-note" data-recovery-disclosure></p>`;
      const find = (name) => element.querySelector('[data-recovery-' + name + ']');
      const base = '/api/parish/dashboard/' + encodeURIComponent(parishId) + '/portability/recovery';
      let state = null,
        busy = false,
        stopped = false,
        timer;
      const alive = () => !stopped && element.isConnected;
      const api = async (path = '', body) => {
        const response = await fetch(base + path, {
          method: body ? 'POST' : 'GET',
          cache: 'no-store',
          headers: { ...headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Recovery could not complete this step.');
        return data;
      };
      function controls() {
        const active = state?.operation;
        find('download').disabled = busy || !state?.snapshots.length;
        find('backup').disabled = busy || !state?.enabled || !!active;
        find('restore').disabled = busy || !state?.enabled || !!active || !state?.snapshots.length;
        find('resume').hidden = !active || active.scope !== scope;
        find('resume').disabled = busy;
        find('rollback').hidden =
          !active ||
          active.kind !== 'restore' ||
          active.canCancel ||
          active.scope !== scope ||
          active.phase === 'unlock';
        find('rollback').disabled = busy;
        find('cancel').hidden = !active?.canCancel || active.scope !== scope;
        find('cancel').disabled = busy;
      }
      async function refresh() {
        try {
          const data = await api('?scope=' + scope);
          if (!alive()) return;
          state = data;
          const latest = data.snapshots[0];
          find('latest').textContent = latest
            ? date(latest.verifiedAt || latest.createdAt) +
              (latest.kind === 'safety' ? ' · Verified safety copy · Expires ' : ' · Verified · Expires ') +
              date(latest.expiresAt)
            : 'No restore-ready backup yet. Create one before making changes.';
          find('disclosure').textContent = data.disclosure || '';
          if (!data.enabled) find('status').textContent = 'Self-service recovery is not available on this deployment.';
          else if (data.operation && !busy)
            find('status').textContent =
              `${data.operation.scope === 'accounting' ? 'Accounting' : 'Parish'} ${data.operation.kind} ${data.operation.status === 'paused' ? 'paused' : 'in progress'} · ${data.operation.phase.replaceAll('_', ' ')}. ${data.operation.scope !== scope ? 'Open that backup panel to manage it.' : 'Resume to continue, or cancel if replacement has not begun.'}`;
        } catch (error) {
          if (!alive()) return;
          state = null;
          find('status').textContent = error.message;
          find('latest').textContent = 'Backup status unavailable.';
        }
        if (alive()) controls();
      }
      async function run(op) {
        try {
          while (alive() && op.status !== 'completed' && op.status !== 'cancelled') {
            find('status').textContent =
              `${op.kind === 'backup' ? 'Creating verified backup' : 'Restoring ' + op.scope} · ${op.phase.replaceAll('_', ' ')}. Changes to affected records are temporarily paused.`;
            op = (await api('/' + op.id + '/advance', {})).operation;
          }
          if (alive()) {
            find('status').textContent =
              op.kind === 'backup'
                ? 'Verified restore-ready backup saved in AGAPAY cloud storage.'
                : 'Restore verified and completed. A safety copy of the previous state is available in Restore. Reload the dashboard to see the restored records.';
            window.dispatchEvent(
              new CustomEvent('parish-recovery-complete', { detail: { scope: op.scope, kind: op.kind } })
            );
          }
        } catch (error) {
          if (alive())
            find('status').textContent = error.message + ' Recheck status and resume; the operation is saved.';
        } finally {
          busy = false;
          if (alive()) await refresh();
        }
      }
      find('backup').onclick = async () => {
        if (busy) return;
        busy = true;
        controls();
        find('status').textContent = 'Starting a restore-ready backup…';
        try {
          await run((await api('', { kind: 'backup', scope, requestKey: crypto.randomUUID() })).operation);
        } catch (error) {
          find('status').textContent = error.message;
          busy = false;
          controls();
        }
      };
      find('restore').onclick = () => {
        if (busy || !state?.snapshots.length) return;
        const dialog = document.createElement('dialog');
        dialog.className = 'parish-recovery-dialog';
        dialog.innerHTML = `<form><h2>Restore ${scope === 'parish' ? 'parish records' : 'accounting only'}</h2><p data-summary></p><label>Restore point<select name="snapshot" required></select></label><p>Changes made after this restore point will be replaced. AGAPAY first saves a verified safety copy. Writes remain paused until verification finishes.</p><label><input type="checkbox" name="acknowledged" required> I understand the scope and that later changes may be replaced.</label><label>Type <strong>RESTORE ${scope.toUpperCase()}</strong><input name="confirmation" autocomplete="off" required></label><p data-error role="alert"></p><div class="btn-row"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-gold">Confirm restore</button></div></form>`;
        dialog.querySelector('[data-summary]').textContent = state.disclosure;
        const select = dialog.querySelector('select');
        for (const s of state.snapshots) {
          const option = document.createElement('option');
          option.value = s.id;
          option.textContent = `${date(s.createdAt)} · ${s.kind === 'safety' ? 'Safety copy before restore' : scope + ' backup'}`;
          select.append(option);
        }
        const latest = state.snapshots.find((s) => s.kind === 'manual');
        if (latest) select.value = latest.id;
        dialog.querySelector('[data-close]').onclick = () => dialog.close();
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        dialog.querySelector('form').onsubmit = async (event) => {
          event.preventDefault();
          const form = event.currentTarget,
            confirmation = form.elements.confirmation.value;
          if (confirmation !== 'RESTORE ' + scope.toUpperCase()) {
            dialog.querySelector('[data-error]').textContent = 'Type the confirmation phrase exactly.';
            return;
          }
          form.querySelector('[type=submit]').disabled = true;
          busy = true;
          controls();
          try {
            const op = (
              await api('', {
                kind: 'restore',
                scope,
                requestKey: crypto.randomUUID(),
                snapshotId: select.value,
                confirmation,
                acknowledged: form.elements.acknowledged.checked,
              })
            ).operation;
            dialog.close();
            await run(op);
          } catch (error) {
            dialog.querySelector('[data-error]').textContent = error.message;
            busy = false;
            form.querySelector('[type=submit]').disabled = false;
            controls();
          }
        };
        document.body.append(dialog);
        dialog.showModal();
      };
      find('resume').onclick = async () => {
        if (busy || !state?.operation) return;
        busy = true;
        controls();
        await run(state.operation);
      };
      find('rollback').onclick = async () => {
        if (busy || !state?.operation) return;
        if (
          !window.confirm(
            'Replace the interrupted restore with the verified safety copy saved immediately before it began?'
          )
        )
          return;
        busy = true;
        controls();
        try {
          await run((await api('/' + state.operation.id + '/rollback', {})).operation);
        } catch (error) {
          find('status').textContent = error.message;
          busy = false;
          controls();
        }
      };
      find('cancel').onclick = async () => {
        if (busy || !state?.operation) return;
        busy = true;
        controls();
        try {
          const result = await api('/' + state.operation.id + '/cancel', {});
          find('status').textContent =
            result.operation.status === 'cancelled'
              ? 'Cancelled before replacement. Records were not restored.'
              : 'The operation already completed before cancellation. Refresh the dashboard to see its result.';
        } catch (error) {
          find('status').textContent = error.message;
        } finally {
          busy = false;
          await refresh();
        }
      };
      find('download').onclick = async () => {
        const saved = state?.snapshots[0];
        if (!saved || busy) return;
        busy = true;
        controls();
        try {
          const response = await fetch(base + '/' + saved.id + '/download?scope=' + scope, {
            headers: headers(),
            cache: 'no-store',
          });
          if (!response.ok) throw new Error((await response.json()).error || 'Download failed.');
          const url = URL.createObjectURL(await response.blob()),
            link = document.createElement('a');
          link.href = url;
          link.download = 'AGAPAY-' + scope + '-backup-' + saved.id + '.zip';
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          find('status').textContent = 'Backup sent to your browser for saving. Restore uses the verified cloud copy.';
        } catch (error) {
          find('status').textContent = error.message;
        } finally {
          busy = false;
          controls();
        }
      };
      find('refresh').onclick = refresh;
      timer = setInterval(() => {
        if (!alive()) {
          clearInterval(timer);
          return;
        }
        if (!busy && element.getClientRects().length) void refresh();
      }, 30000);
      mounts.set(element, () => {
        stopped = true;
        clearInterval(timer);
      });
      void refresh();
    },
    openAccounting({ parishId, headers }) {
      const dialog = document.createElement('dialog');
      dialog.className = 'parish-recovery-dialog';
      dialog.innerHTML =
        '<div data-panel></div><div class="btn-row"><button class="btn btn-ghost" type="button" data-close>Close</button></div>';
      dialog.querySelector('[data-close]').onclick = () => dialog.close();
      dialog.addEventListener(
        'close',
        () => {
          mounts.get(dialog.querySelector('[data-panel]'))?.();
          dialog.remove();
        },
        { once: true }
      );
      document.body.append(dialog);
      dialog.showModal();
      this.mount({ element: dialog.querySelector('[data-panel]'), parishId, headers, scope: 'accounting' });
    },
  };
})();
