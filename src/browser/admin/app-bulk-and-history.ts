import type { AdminAppPayload } from './app-contracts.js';
import type { AdminAppRegistration, AdminAppResult, AdminAppError } from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare let selectedRefs: AdminAppBindings['selectedRefs'];
declare const escapeHtml: AdminAppBindings['escapeHtml'];
declare const escapeAttr: AdminAppBindings['escapeAttr'];
declare const setStatus: AdminAppBindings['setStatus'];
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const loadRegistrations: AdminAppBindings['loadRegistrations'];
declare const shortDate: AdminAppBindings['shortDate'];

function updateBulkBar() {
  selectedRefs = new Set(
    Array.from(document.querySelectorAll<HTMLElement>('.row-chk:checked')).map(
      (c) => (c as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
    )
  );
  const bar = document.getElementById('bulkBar');
  const cnt = document.getElementById('bulkCount');
  if (!bar) return;
  if (selectedRefs.size > 0) {
    bar.classList.add('visible');
    cnt!.textContent = selectedRefs.size + ' selected';
  } else {
    bar.classList.remove('visible');
  }
}

function toggleSelectAll(chk: HTMLInputElement) {
  document.querySelectorAll<HTMLElement>('.row-chk').forEach((c) => {
    (c as HTMLInputElement).checked = chk.checked;
  });
  updateBulkBar();
}

function clearSelection() {
  document.querySelectorAll<HTMLElement>('.row-chk').forEach((c) => {
    (c as HTMLInputElement).checked = false;
  });
  const all = document.getElementById('selectAllChk');
  if (all) (all as HTMLInputElement).checked = false;
  updateBulkBar();
}

function renderBulkResults(title: string, rows: AdminAppResult[] = []) {
  const panel = document.getElementById('bulkResults');
  if (!panel) return;
  if (!rows.length) {
    panel.classList.remove('visible');
    panel.innerHTML = '';
    return;
  }
  panel.classList.add('visible');
  panel.innerHTML = `
        <div class="bulk-results-head">
          <strong>${escapeHtml(title)}</strong>
          <button class="secondary btn-sm" onclick="renderBulkResults('', [])">Clear log</button>
        </div>
        <div class="bulk-results-log">
          ${rows
            .map(
              (row) => `
            <div class="bulk-result-row ${escapeAttr(row.tone || '')}">
              ${escapeHtml(row.message || '')}
            </div>
          `
            )
            .join('')}
        </div>
      `;
}

async function bulkAction(action: string) {
  if (!selectedRefs.size) return;
  const refs = Array.from(selectedRefs);
  const labels: Record<string, string> = { invite: 'dashboard invites' };
  const label = labels[action];
  if (!label) return;
  if (!confirm(`Send ${label} to ${refs.length} parish(es)?`)) return;

  const rows: AdminAppResult[] = [];
  setStatus(`Running bulk action on ${refs.length} parish(es)...`);
  renderBulkResults(`Running ${label}`, rows);
  let done = 0;
  let failed = 0;

  for (const ref of refs) {
    try {
      const r = await fetch('/api/admin/registrations/' + encodeURIComponent(ref as string) + '/dashboard-invite', {
        method: 'POST',
        headers: authHeaders(),
      });
      const body = (await r.json().catch(() => ({}))) as AdminAppPayload;
      if (handleAuthFailure(r, body)) return;
      if (!r.ok) throw new Error(body.detail || body.error || 'Invite failed');
      done++;
      rows.push({ tone: 'success', message: `${ref}: Success` });
    } catch (err) {
      failed++;
      rows.push({ tone: 'error', message: `${ref}: Failed (${(err as AdminAppError).message || 'unknown error'})` });
    }
    renderBulkResults(`Running ${label} (${done + failed}/${refs.length})`, rows);
  }

  clearSelection();
  await loadRegistrations({ silent: true, preserveSelection: true });
  const summary = `Bulk action complete: ${done} succeeded${failed ? `, ${failed} failed` : ''}.`;
  rows.push({ tone: failed ? 'error' : 'success', message: summary });
  renderBulkResults(`${label} complete`, rows);
  setStatus(summary, failed ? 'error' : 'success');
}

// ── EMAIL LOG ─────────────────────────────────────────────────────────
function renderEmailLog(reg: AdminAppRegistration) {
  const emailFields = [
    { key: 'adminNotificationEmailStatus', label: 'AGAPAY alert', to: 'hello@agapay.app' },
    {
      key: 'dashboardInviteEmailStatus',
      label: 'Dashboard invite',
      to: reg.priestEmail || reg.treasurerEmail || 'priest/treasurer',
    },
    {
      key: 'stripeOnboardingEmailStatus',
      label: 'Stripe invite',
      to: reg.treasurerEmail || reg.priestEmail || 'treasurer',
    },
  ];
  const logEntries = reg.emailLog || [];
  const combined = [];

  for (const f of emailFields) {
    const status = reg[f.key as keyof AdminAppRegistration] as string | undefined;
    if (!status || status === 'not_configured' || status === 'not_sent') continue;
    combined.push({ type: f.label, status, to: f.to, time: reg.reviewedAt || reg.receivedAt || '', source: 'field' });
  }

  for (const e of logEntries) {
    combined.push({
      type: e.type || 'Email',
      status: e.status || 'sent',
      to: e.to || '',
      time: e.sentAt || '',
      detail: e.detail || '',
      source: 'log',
    });
  }

  if (!combined.length) {
    return '<div class="email-log-empty">No emails recorded for this registration yet.</div>';
  }

  return combined
    .map((e) => {
      const dotClass = e.status === 'sent' ? 'sent' : e.status === 'failed' ? 'failed' : 'skipped';
      const detail = e.detail ? ` — ${escapeHtml(e.detail)}` : '';
      const to = e.to ? ` → ${escapeHtml(e.to)}` : '';
      return `<div class="email-log-entry">
          <div class="email-log-dot ${dotClass}"></div>
          <div>
            <div class="email-log-type">${escapeHtml(e.type)}</div>
            <div class="email-log-detail">${escapeHtml(e.status)}${to}${detail}</div>
          </div>
          <div class="email-log-time">${e.time ? escapeHtml(shortDate(e.time)) : ''}</div>
        </div>`;
    })
    .join('');
}

// ── NOTES HISTORY ─────────────────────────────────────────────────────
function renderNotesHistory(reg: AdminAppRegistration) {
  const history = reg.notesHistory || [];
  if (!history.length) {
    const legacy = (reg.reviewerNotes || '').trim();
    if (!legacy) return '<div class="notes-empty">No notes yet. Use the field below to add the first note.</div>';
    return `<div class="notes-entry">
          <div class="notes-entry-meta">Legacy note (no timestamp)</div>
          <div class="notes-entry-text">${escapeHtml(legacy)}</div>
        </div>`;
  }
  return history
    .slice()
    .reverse()
    .map(
      (n) => `
        <div class="notes-entry">
          <div class="notes-entry-meta">${escapeHtml(n.author || 'Admin')} · ${n.createdAt ? escapeHtml(shortDate(n.createdAt)) : 'Unknown date'}</div>
          <div class="notes-entry-text">${escapeHtml(n.text || '')}</div>
        </div>
      `
    )
    .join('');
}
export type AdminAppPart9 = {
  updateBulkBar: typeof updateBulkBar;
  toggleSelectAll: typeof toggleSelectAll;
  clearSelection: typeof clearSelection;
  renderBulkResults: typeof renderBulkResults;
  bulkAction: typeof bulkAction;
  renderEmailLog: typeof renderEmailLog;
  renderNotesHistory: typeof renderNotesHistory;
};
