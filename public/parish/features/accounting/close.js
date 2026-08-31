'use strict';

// Parish dashboard accounting: close.
// Classic script; preserve global names used by the dashboard and inline actions.

function renderAccountingCloseBase(pane) {
  const data = accountingData.close;
  if (!data) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading close workspace...</p>';
    return;
  }
  if (accountingCloseDetail) {
    const s = accountingCloseDetail,
      summary = s.summary || {};
    pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">${escapeHtml((s.closeType || 'period').replaceAll('_', ' '))}</span><h2>Close checklist</h2><p>${summary.passed || 0} passed · ${summary.warnings || 0} warnings · ${summary.blockers || 0} blockers</p></div><button class="acct-refresh" onclick="accountingCloseDetail=null;renderAccountingPane()">Back to close history</button></div><div class="acct-checklist acct-close-checklist">${(s.checks || []).map((check) => `<div class="${check.status === 'passed' ? 'complete' : check.status === 'failed' ? 'failed' : ''}"><i>${check.status === 'passed' ? '✓' : check.status === 'failed' ? '!' : '○'}</i><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.category)} · ${escapeHtml(check.status)}${check.details?.count ? ` · ${check.details.count} item(s)` : ''}</small></span>${['warning', 'pending'].includes(check.status) && !check.blocking ? `<button onclick="waiveAccountingCloseCheck('${escapeAttr(s.id)}','${escapeAttr(check.id)}',${check.version})">Waive</button>` : ''}</div>`).join('')}</div><div class="acct-close-actions"><button class="acct-refresh" onclick="validateAccountingClose('${escapeAttr(s.id)}',${s.version})">Run checks again</button>${['ready_for_review', 'reviewed', 'approved'].includes(s.status) && !summary.blockers ? `<button class="acct-primary" onclick="completeAccountingClose('${escapeAttr(s.id)}',${s.version},'${escapeAttr(s.closeType)}')">${s.closeType === 'year_end' ? 'Execute year-end close' : 'Complete close'}</button>` : ''}${s.status === 'completed' ? `<button class="acct-refresh" onclick="printAccountingClosePacket('${escapeAttr(s.id)}')">Print close packet</button>` : ''}</div>`;
    return;
  }
  const fy = data.fiscalYears[0],
    openPeriods = data.periods.filter((p) => p.status === 'open' && (!fy || p.fiscalYearId === fy.id));
  pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Controlled accounting close</span><h2>Month-end & year-end</h2><p>Review every subsystem, resolve blockers, preserve a snapshot, and lock the period.</p></div>${fy ? `<button class="acct-refresh" onclick="downloadAccountingAuditTrail()">Export audit trail</button>` : ''}</div><div class="acct-kpis"><div><span>Open periods</span><strong>${openPeriods.length}</strong></div><div><span>Close in progress</span><strong>${data.sessions.filter((s) => !['completed', 'voided'].includes(s.status)).length}</strong></div><div><span>Completed closes</span><strong>${data.sessions.filter((s) => s.status === 'completed').length}</strong></div></div><div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Start month-end</span><h2>Close an accounting period</h2>${openPeriods.length ? `<form class="acct-phase-form" onsubmit="createAccountingClose(event)"><input type="hidden" name="closeType" value="month_end"><label>Fiscal year<select name="fiscalYearId">${data.fiscalYears.map((y) => `<option value="${escapeAttr(y.id)}">${escapeHtml(y.name)}</option>`).join('')}</select></label><label>Open period<select name="accountingPeriodId">${openPeriods.map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select></label><button class="acct-primary">Begin month-end close</button><span class="acct-form-status"></span></form>` : '<p>No open accounting period is currently available.</p>'}</section><section class="acct-card"><span class="acct-kicker">Year-end</span><h2>Close revenue & expense accounts</h2><p>Preview the change in net assets and verify every prior period before creating the final closing entry.</p>${fy ? `<button class="acct-primary" onclick="createAccountingYearEnd('${escapeAttr(fy.id)}')">Begin year-end close</button><button class="acct-link" onclick="downloadAccountingAccountantExport('${escapeAttr(fy.id)}')">Prepare accountant handoff</button>` : ''}</section></div><div class="acct-list-head"><div><span class="acct-kicker">Close history</span><h2>Sessions & preserved snapshots</h2></div></div><div class="acct-card-grid">${data.sessions.map((s) => `<article class="acct-budget-card"><div><span>${escapeHtml((s.closeType || 'close').replaceAll('_', ' '))}</span><h3>${escapeHtml(data.periods.find((p) => p.id === s.accountingPeriodId)?.name || data.fiscalYears.find((y) => y.id === s.fiscalYearId)?.name || 'Accounting close')}</h3><p>${s.lastValidatedAt ? `Last checked ${accountingDate(s.lastValidatedAt)}` : 'Checks not yet run'}</p></div><span class="acct-status ${escapeAttr(s.status)}">${escapeHtml(s.status)}</span><div class="acct-row-actions"><button onclick="openAccountingClose('${escapeAttr(s.id)}')">Open checklist</button></div></article>`).join('') || accountingEmpty('No close sessions yet', 'Begin with the current open accounting period.')}</div>`;
}

function renderAccountingClose(pane) {
  renderAccountingCloseBase(pane);
  if (accountingCloseDetail || !accountingData.close) return;
  const adjustments = accountingData.adjustments || { items: [], templates: [] },
    fy = accountingData.close.fiscalYears[0];
  pane.insertAdjacentHTML(
    'beforeend',
    `<div class="acct-list-head"><div><span class="acct-kicker">Adjusting entries</span><h2>Period adjustments</h2><p>Create, review, and post accruals, deferrals, corrections, and recurring templates.</p></div></div><div class="acct-setup-grid"><section class="acct-card"><form class="acct-phase-form" onsubmit="createAccountingAdjustment(event)"><label>Type<select name="adjustmentType"><option value="accrual">Accrual</option><option value="deferral">Deferral</option><option value="reclassification">Reclassification</option><option value="correction">Correction</option><option value="other">Other</option></select></label><label>Effective date<input name="effectiveDate" type="date" required></label><label>Reason<input name="reason" required></label><label>Supporting memo<textarea name="supportingMemo" required></textarea></label><div class="acct-form-grid"><label>Debit account<select name="debitAccountId">${accountingData.accounts.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Credit account<select name="creditAccountId">${accountingData.accounts.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select><label>Fund<select name="fundId">${accountingData.funds.map((f) => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('')}</select></label><label>Amount<input name="amount" type="number" min=".01" step=".01" required></label></div><button class="acct-primary">Create adjustment</button><span class="acct-form-status"></span></form></section><section class="acct-card"><form class="acct-phase-form" onsubmit="createAccountingAdjustmentTemplate(event)"><h2>New adjustment template</h2><label>Name<input name="name" required></label><label>Frequency<select name="frequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option></select></label><button class="acct-primary">Create template from accounts above</button><span class="acct-form-status"></span></form><div class="acct-checklist">${adjustments.templates.map((t) => `<div><i>↻</i><span><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.frequency)}</small></span></div>`).join('') || '<p>No templates yet.</p>'}</div></section></div><div class="acct-card-grid">${adjustments.items.map((a) => `<article class="acct-budget-card"><div><span>${accountingDate(a.effectiveDate)}</span><h3>${escapeHtml(a.type)}</h3><p>${escapeHtml(a.reason)}</p></div><span class="acct-status ${escapeAttr(a.status)}">${escapeHtml(a.status)}</span>${a.status === 'draft' ? `<button onclick="postAccountingAdjustment('${escapeAttr(a.id)}',${a.version})">Post adjustment</button>` : ''}</article>`).join('') || accountingEmpty('No adjustments yet', 'Create an adjusting entry for the open period.')}</div>${fy ? `<section class="acct-card"><span class="acct-kicker">Fiscal-year governance</span><h2>${escapeHtml(fy.name)}</h2><div class="acct-row-actions"><button onclick="archiveAccountingFiscalYear('${escapeAttr(fy.id)}',${fy.version})">Archive fiscal year</button><button onclick="reopenAccountingFiscalYear('${escapeAttr(fy.id)}',${fy.version})">Reopen year-end close</button></div></section>` : ''}`
  );
}

async function loadAccountingPhaseF() {
  const pane = document.getElementById('accountingPane');
  if (pane) pane.innerHTML = '<p class="sw-tool-loading">Loading close workspace...</p>';
  try {
    const [res, adjustmentsRes, templatesRes] = await Promise.all(
        ['/close/workspace', '/adjustments', '/adjustments/templates'].map((path) =>
          fetch(accountingApi(path), { headers: authHeaders() })
        )
      ),
      [payload, adjustments, templates] = await Promise.all(
        [res, adjustmentsRes, templatesRes].map((response) => response.json().catch(() => ({})))
      );
    if (!res.ok) throw new Error(payload.message || payload.error);
    if (!adjustmentsRes.ok) throw new Error(adjustments.message || adjustments.error);
    if (!templatesRes.ok) throw new Error(templates.message || templates.error);
    accountingData.close = {
      fiscalYears: payload.fiscalYears || [],
      periods: payload.periods || [],
      sessions: payload.sessions || [],
    };
    accountingData.adjustments = { items: adjustments.adjustments || [], templates: templates.templates || [] };
    renderAccountingPane();
  } catch (error) {
    if (pane)
      pane.innerHTML = `<div class="acct-empty error"><strong>Unable to load close workspace</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingPhaseF()">Try again</button></div>`;
  }
}

async function phaseFMutation(path, body) {
  const res = await fetch(accountingApi(path), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to update close.');
    return null;
  }
  return payload;
}

async function createAccountingClose(event) {
  event.preventDefault();
  const payload = await phaseFMutation('/close/sessions', Object.fromEntries(new FormData(event.currentTarget)));
  if (payload) {
    await validateAccountingClose(payload.session.id, payload.session.version);
  }
}

async function createAccountingYearEnd(fiscalYearId) {
  const payload = await phaseFMutation('/close/sessions', { closeType: 'year_end', fiscalYearId });
  if (payload) await validateAccountingClose(payload.session.id, payload.session.version);
}

async function openAccountingClose(id) {
  const res = await fetch(accountingApi(`/close/sessions/${encodeURIComponent(id)}`), { headers: authHeaders() }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error);
    return;
  }
  accountingCloseDetail = payload.session;
  renderAccountingPane();
}

async function validateAccountingClose(id, version) {
  const payload = await phaseFMutation(`/close/sessions/${encodeURIComponent(id)}/validate`, {
    expectedVersion: version,
  });
  if (payload) {
    accountingCloseDetail = payload.session;
    renderAccountingPane();
  }
}

async function waiveAccountingCloseCheck(id, checkId, version) {
  const reason = prompt('Reason for waiving this warning:');
  if (!reason) return;
  const payload = await phaseFMutation(`/close/sessions/${encodeURIComponent(id)}/waive`, {
    checkId,
    expectedVersion: version,
    reason,
  });
  if (payload) await openAccountingClose(id);
}

async function completeAccountingClose(id, version, type) {
  const path =
    type === 'year_end'
      ? `/close/year-end/${encodeURIComponent(accountingCloseDetail.fiscalYearId)}/execute`
      : `/close/sessions/${encodeURIComponent(id)}/complete`;
  const body = type === 'year_end' ? { closeSessionId: id, expectedVersion: version } : { expectedVersion: version };
  if (await phaseFMutation(path, body)) {
    accountingCloseDetail = null;
    accountingData.close = null;
    await loadAccountingPhaseF();
  }
}

function printAccountingClosePacket(id) {
  window.open(accountingApi(`/close/sessions/${encodeURIComponent(id)}/packet`), '_blank', 'noopener');
}

function downloadAccountingAuditTrail() {
  downloadAccountingFile(accountingApi('/close/audit-trail.csv'), 'agapay-accounting-audit-trail.csv');
}

async function downloadAccountingAccountantExport(fiscalYearId) {
  const payload = await phaseFMutation(`/close/year-end/${encodeURIComponent(fiscalYearId)}/accountant-export`, {});
  if (payload) alert('Accountant handoff prepared and preserved with its manifest.');
}

async function createAccountingAdjustment(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    amount = Math.round(Number(raw.amount) * 100);
  raw.lines = [
    { accountId: raw.debitAccountId, fundId: raw.fundId, debitAmount: amount },
    { accountId: raw.creditAccountId, fundId: raw.fundId, creditAmount: amount },
  ];
  delete raw.amount;
  delete raw.debitAccountId;
  delete raw.creditAccountId;
  delete raw.fundId;
  if (await phaseFMutation('/adjustments', raw)) {
    accountingData.close = null;
    accountingData.adjustments = null;
    await loadAccountingPhaseF();
  }
}

async function postAccountingAdjustment(id, expectedVersion) {
  if (await phaseFMutation(`/adjustments/${encodeURIComponent(id)}/post`, { expectedVersion })) {
    accountingData.close = null;
    accountingData.adjustments = null;
    await loadAccountingPhaseF();
  }
}

async function createAccountingAdjustmentTemplate(event) {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget)),
    debit = accountingData.accounts[0],
    credit = accountingData.accounts[1],
    fund = accountingData.funds[0];
  raw.lines = [
    { accountId: debit?.id, fundId: fund?.id, debitAmount: 1 },
    { accountId: credit?.id, fundId: fund?.id, creditAmount: 1 },
  ];
  if (await phaseFMutation('/adjustments/templates', raw)) {
    accountingData.close = null;
    accountingData.adjustments = null;
    await loadAccountingPhaseF();
  }
}

async function archiveAccountingFiscalYear(id, expectedVersion) {
  if (!confirm('Archive this fiscal year?')) return;
  if (await phaseFMutation(`/close/year-end/${encodeURIComponent(id)}/archive`, { expectedVersion })) {
    accountingData.close = null;
    await loadAccountingPhaseF();
  }
}

async function reopenAccountingFiscalYear(id, expectedVersion) {
  const reason = prompt('Reason for reopening this year-end close:');
  if (!reason) return;
  if (await phaseFMutation(`/close/year-end/${encodeURIComponent(id)}/reopen`, { expectedVersion, reason })) {
    accountingData.close = null;
    await loadAccountingPhaseF();
  }
}

function renderAccountingGovernance(pane) {
  const data = accountingData.governance;
  if (!data) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading accounting governance...</p>';
    return;
  }
  const s = data.settings || {},
    h = data.health || {},
    p = h.protectiveState || {};
  pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Parish record governance</span><h2>Retention, legal holds &amp; health</h2><p>Set parish record classifications and review the operational state of your books. Platform operators control integrity scans and protective-state changes.</p></div></div><div class="acct-setup-grid"><section class="acct-card acct-settings"><span class="acct-kicker">Retention settings</span><h2>Record classifications</h2><form class="acct-phase-form" onsubmit="saveAccountingRetention(event)"><div class="acct-form-grid">${[
    ['accountingRecordsRetentionYears', 'Accounting records'],
    ['bankStatementRetentionYears', 'Bank statements'],
    ['invoiceRetentionYears', 'Invoices'],
    ['auditLogRetentionYears', 'Audit logs'],
    ['attachmentRetentionYears', 'Attachments'],
    ['closePacketRetentionYears', 'Close packets'],
  ]
    .map(
      ([name, label]) =>
        `<label>${label}<input name="${name}" type="number" min="1" max="100" step="1" required value="${Number(s[name] || 7)}"></label>`
    )
    .join(
      ''
    )}</div><label><input name="allowLegalHold" type="checkbox" ${s.allowLegalHold ? 'checked' : ''}> Allow legal holds</label><button class="acct-primary">Save retention settings</button><span class="acct-form-status"></span></form><p class="acct-governance-disclaimer">${escapeHtml(s.disclaimer || '')}</p></section><section class="acct-card"><span class="acct-kicker">Read-only health overview</span><h2>${escapeHtml(String(h.status || 'unknown').replaceAll('_', ' '))}</h2><p>${escapeHtml(p.safeSummary || 'No protective restriction is active.')}</p><div class="acct-facts"><div><strong>${escapeHtml(String(p.state || 'unknown').replaceAll('_', ' '))}</strong><span>Protective state</span></div><div><strong>${h.activeWork || 0}</strong><span>Active scans</span></div><div><strong>${(h.findings || []).length}</strong><span>Open findings</span></div></div><p>${escapeHtml(h.disclaimer || '')}</p></section></div><div class="acct-list-head"><div><span class="acct-kicker">Legal holds</span><h2>Preserve designated records</h2></div></div><section class="acct-card"><form class="acct-phase-form" onsubmit="createAccountingLegalHold(event)"><div class="acct-form-grid"><label>Entity type<input name="entityType" required placeholder="journal_entry"></label><label>Entity ID<input name="entityId" required></label><label>Reason<input name="reason" required></label></div><button class="acct-primary" ${s.allowLegalHold ? '' : 'disabled'}>Create legal hold</button><span class="acct-form-status"></span></form></section><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Placed</th><th>Entity</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${data.legalHolds.map((hold) => `<tr><td>${accountingDate(hold.placedAt)}</td><td><strong>${escapeHtml(hold.entityType)}</strong><br>${escapeHtml(hold.entityId)}</td><td>${escapeHtml(hold.reason)}</td><td><span class="acct-status ${escapeAttr(hold.status)}">${escapeHtml(hold.status)}</span></td><td>${hold.status === 'active' ? `<button class="acct-link" onclick="releaseAccountingLegalHold('${escapeAttr(hold.id)}',${hold.version})">Release</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No legal holds.</td></tr>'}</tbody></table></div>`;
}

async function loadAccountingGovernance() {
  const pane = document.getElementById('accountingPane');
  if (pane) pane.innerHTML = '<p class="sw-tool-loading">Loading accounting governance...</p>';
  try {
    const responses = await Promise.all(
        ['/governance/retention', '/governance/legal-holds', '/governance/health'].map((path) =>
          fetch(accountingApi(path), { headers: authHeaders() })
        )
      ),
      payloads = await Promise.all(responses.map((res) => res.json().catch(() => ({}))));
    const failed = responses.findIndex((res) => !res.ok);
    if (failed >= 0)
      throw new Error(payloads[failed].message || payloads[failed].error || 'Governance is unavailable.');
    accountingData.governance = {
      settings: payloads[0].settings || {},
      legalHolds: payloads[1].legalHolds || [],
      health: payloads[2].health || {},
    };
    renderAccountingPane();
  } catch (error) {
    if (pane)
      pane.innerHTML = `<div class="acct-empty error"><strong>Unable to load governance</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingGovernance()">Try again</button></div>`;
  }
}

async function saveAccountingRetention(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    patch = { allowLegalHold: form.elements.allowLegalHold.checked };
  for (const key of [
    'accountingRecordsRetentionYears',
    'bankStatementRetentionYears',
    'invoiceRetentionYears',
    'auditLogRetentionYears',
    'attachmentRetentionYears',
    'closePacketRetentionYears',
  ])
    patch[key] = Number(raw[key]);
  const res = await fetch(accountingApi('/governance/retention'), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: accountingData.governance.settings.version, patch }),
    }),
    payload = await res.json().catch(() => ({}));
  form.querySelector('.acct-form-status').textContent = res.ok
    ? 'Retention settings saved.'
    : payload.message || payload.error || 'Unable to save retention settings.';
  if (res.ok) {
    accountingData.governance = null;
    await loadAccountingGovernance();
  }
}

async function createAccountingLegalHold(event) {
  event.preventDefault();
  const form = event.currentTarget,
    res = await fetch(accountingApi('/governance/legal-holds'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    }),
    payload = await res.json().catch(() => ({}));
  form.querySelector('.acct-form-status').textContent = res.ok
    ? 'Legal hold created.'
    : payload.message || payload.error || 'Unable to create legal hold.';
  if (res.ok) {
    accountingData.governance = null;
    await loadAccountingGovernance();
  }
}

async function releaseAccountingLegalHold(id, expectedVersion) {
  if (!confirm('Release this legal hold? The record remains in the governance history.')) return;
  const res = await fetch(accountingApi(`/governance/legal-holds/${encodeURIComponent(id)}/release`), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion }),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to release legal hold.');
    return;
  }
  accountingData.governance = null;
  await loadAccountingGovernance();
}
