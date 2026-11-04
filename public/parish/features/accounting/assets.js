// Generated from src/browser/parish/features/accounting/assets.ts by npm run build:browser. Do not edit.
'use strict';
function accountingReadinessLink() {
  return `<div class="acct-asset-toolbar"><button class="acct-primary" onclick="openAccountingReadiness()">Departments, projects & council packages</button><button class="acct-refresh" onclick="setAccountingView('close')">Month-end checklist</button></div>`;
}
async function accountingReadinessFetch(path, method = 'GET', body) {
  const response = await fetch(accountingApi(path), {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body === void 0 ? void 0 : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load reporting workspace.');
  return data;
}
function accountingReadinessCurrent(pane, tenant) {
  return pane.isConnected && tenant === currentParish?.parishId && accountingView === 'reports';
}
async function openAccountingReadiness() {
  setAccountingView('reports');
  const pane = document.getElementById('accountingPane'),
    tenant = currentParish?.parishId;
  pane.innerHTML = '<p role="status">Loading reporting workspace…</p>';
  try {
    const [labels, packets, budgets] = await Promise.all([
      accountingReadinessFetch('/dimensions'),
      accountingReadinessFetch('/report-packages'),
      accountingReadinessFetch('/budgets').catch(() => ({ budgets: [] })),
    ]);
    if (!accountingReadinessCurrent(pane, tenant)) return;
    pane.innerHTML = `<button class="acct-link" onclick="renderAccountingPane()">← All reports</button><section class="acct-report-library-head"><div><span class="acct-kicker">Council-ready reporting</span><h2>See the work behind the numbers</h2><p>Funds track the purpose of money. Departments and projects track the parish work it supports.</p></div></section>${accountingReportDateForm()}<div class="acct-setup-grid"><section class="acct-card"><h3>Departments & projects</h3><p>Classifications are audited reporting labels. Posted amounts remain unchanged.</p><button class="acct-primary" onclick="openAccountingClassifications()">Classify income & expenses</button><button class="acct-refresh" onclick="openAccountingDimensionReport('department')">Department report</button><button class="acct-refresh" onclick="openAccountingDimensionReport('project')">Project report</button><form class="acct-phase-form acct-readiness-form" onsubmit="saveAccountingDimension(event)"><label>Type<select name="kind"><option value="department">Department</option><option value="project">Project</option></select></label><label>Code<input name="code" required maxlength="32"></label><label>Name<input name="name" required maxlength="120"></label><button class="acct-refresh">Add department / project</button><span role="status"></span></form><ul>${labels.dimensions.map((d) => `<li>${escapeHtml(d.code)} · ${escapeHtml(d.name)} (${escapeHtml(d.kind)})</li>`).join('') || '<li>No labels yet. Add the departments or projects you need.</li>'}</ul><label>Budget for comparison / allocation<select id="accountingDimensionBudget"><option value="">Actual activity only</option>${budgets.budgets.map((b) => `<option value="${escapeAttr(b.id)}">${escapeHtml(b.name)} · ${escapeHtml(b.status)}</option>`).join('')}</select></label><button class="acct-refresh" onclick="openAccountingBudgetAllocations()">Allocate a draft budget</button></section><section class="acct-card"><h3>Saved council packages</h3><p>Generate a dated, immutable copy of the reports council needs. Budget comparisons use fiscal YTD through a month-end.</p><form class="acct-phase-form acct-readiness-form" onsubmit="saveAccountingCouncilPackage(event)"><label>Package name<input name="name" required maxlength="120" placeholder="Monthly parish council"></label>${[
      ['activities', 'Income & expenses'],
      ['position', 'Financial position'],
      ['cashFlows', 'Cash flow'],
      ['fundActivity', 'Fund activity'],
      ['assets', 'Asset register'],
      ['departments', 'Department budget / actual'],
      ['projects', 'Project budget / actual'],
    ]
      .map(
        ([id, label]) =>
          `<label class="acct-packet-choice"><input type="checkbox" name="reports" value="${id}" ${['activities', 'position', 'cashFlows'].includes(id) ? 'checked' : ''}>${label}</label>`
      )
      .join('')}<button class="acct-refresh">Save report selection</button><span role="status"></span></form><div>${
      packets.packages
        .filter((p) => p.is_active)
        .map(
          (p) =>
            `<p><strong>${escapeHtml(p.name)}</strong> <button class="acct-refresh" data-id="${escapeAttr(p.id)}" onclick="generateAccountingCouncilPackage(this)">Generate with selected dates</button></p>`
        )
        .join('') || '<p>No packages saved yet.</p>'
    }</div><h4>Previously generated</h4>${packets.runs.map((r) => `<p><button class="acct-link" data-id="${escapeAttr(r.id)}" onclick="showAccountingCouncilPackage(this.dataset.id)">${escapeHtml(r.name)} · ${accountingDate(r.end_date)}</button></p>`).join('') || '<p>No saved snapshots yet.</p>'}</section></div><section class="acct-card"><h3>A repeatable month-end</h3><ol><li>Record gifts, income and bills; attach supporting documents.</li><li>Match the bank statement and resolve differences.</li><li>Review depreciation and unassigned department/project activity.</li><li>Compare fiscal YTD income and expenses to the approved budget.</li><li>Run the month-end checklist, resolve blockers, and complete the close.</li><li>Generate the council package and preserve the reviewed copy.</li></ol><button class="acct-refresh" onclick="setAccountingView('close')">Open month-end checks</button></section>`;
  } catch (error) {
    if (accountingReadinessCurrent(pane, tenant))
      pane.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p><button onclick="openAccountingReadiness()">Try again</button>`;
  }
}
async function saveAccountingDimension(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('[role=status]');
  try {
    await accountingReadinessFetch('/dimensions', 'POST', Object.fromEntries(new FormData(form)));
    await openAccountingReadiness();
  } catch (error) {
    status.textContent = error.message;
  }
}
async function saveAccountingCouncilPackage(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('[role=status]'),
    values = new FormData(form);
  try {
    await accountingReadinessFetch('/report-packages', 'POST', {
      name: values.get('name'),
      reportIds: values.getAll('reports'),
    });
    await openAccountingReadiness();
  } catch (error) {
    status.textContent = error.message;
  }
}
async function openAccountingClassifications(filters = {}) {
  const pane = document.getElementById('accountingPane'),
    tenant = currentParish?.parishId,
    period = accountingReportPeriod();
  pane.innerHTML = '<p role="status">Loading income and expense lines…</p>';
  try {
    const [data, labels] = await Promise.all([
      accountingReadinessFetch(
        '/dimensions/transactions?' + new URLSearchParams({ from: period.start, to: period.end, ...filters })
      ),
      accountingReadinessFetch('/dimensions'),
    ]);
    if (!accountingReadinessCurrent(pane, tenant)) return;
    const options = (kind, id) =>
      '<option value="">Unassigned</option>' +
      labels.dimensions
        .filter((d) => d.kind === kind && (d.is_active || d.id === id))
        .map(
          (d) => `<option value="${escapeAttr(d.id)}" ${d.id === id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
        )
        .join('');
    pane.innerHTML = `<button class="acct-link" onclick="openAccountingReadiness()">← Reporting workspace</button><h2>Classify income & expenses</h2><p>${accountingDate(period.start)} – ${accountingDate(period.end)}. Each change requires a reason and is recorded in the audit trail. ${data.truncated ? 'Showing the latest 500 lines; choose a shorter date range to reach older activity.' : ''}</p>${data.rows.map((r) => `<form class="acct-card acct-phase-form acct-readiness-form" data-line="${escapeAttr(r.id)}" data-version="${r.version}" onsubmit="saveAccountingClassification(event)"><strong>${escapeHtml(r.entryNumber)} · ${accountingDate(r.date)} · ${escapeHtml(r.accountName)}</strong><p>${escapeHtml(r.description)} · Debit ${accountingMoney(r.debit)} · Credit ${accountingMoney(r.credit)}</p><div class="acct-form-grid"><label>Department<select name="departmentId">${options('department', r.departmentId)}</select></label><label>Project<select name="projectId">${options('project', r.projectId)}</select></label><label>Reason<input name="reason" required maxlength="800"></label></div><button class="acct-refresh">Save classification</button><span role="status"></span></form>`).join('') || '<p>No income or expense lines in this period.</p>'}`;
  } catch (error) {
    if (accountingReadinessCurrent(pane, tenant)) pane.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p>`;
  }
}
async function saveAccountingClassification(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('[role=status]'),
    button = form.querySelector('button');
  button.disabled = true;
  try {
    const data = await accountingReadinessFetch(
      '/dimensions/transactions/' + encodeURIComponent(form.dataset.line),
      'PATCH',
      { ...Object.fromEntries(new FormData(form)), expectedVersion: Number(form.dataset.version) }
    );
    form.dataset.version = String(data.classification.version);
    status.textContent = 'Saved to the reporting audit trail.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
async function openAccountingBudgetAllocations() {
  const id = document.getElementById('accountingDimensionBudget')?.value.trim();
  if (!id) {
    alert('Choose a budget first.');
    return;
  }
  const pane = document.getElementById('accountingPane'),
    tenant = currentParish?.parishId;
  try {
    const [data, labels] = await Promise.all([
      accountingReadinessFetch('/dimensions/budgets/' + encodeURIComponent(id)),
      accountingReadinessFetch('/dimensions'),
    ]);
    if (!accountingReadinessCurrent(pane, tenant)) return;
    const options = (kind) =>
      '<option value="">Unassigned</option>' +
      labels.dimensions
        .filter((d) => d.kind === kind && d.is_active)
        .map((d) => `<option value="${escapeAttr(d.id)}">${escapeHtml(d.name)}</option>`)
        .join('');
    pane.innerHTML = `<button onclick="openAccountingReadiness()">← Reporting workspace</button><h2>Allocate draft budget by department / project</h2><p>Each save replaces the line’s allocations. Percentages can total up to 100%; the rest remains Unassigned. Submitted and approved budgets are locked against allocation changes.</p><div id="accountingAllocationLines" data-budget="${escapeAttr(id)}" data-version="${data.budget.version}">${data.lines
      .map(
        (l) =>
          `<form class="acct-card acct-phase-form acct-readiness-form" data-line="${escapeAttr(l.id)}" onsubmit="saveAccountingBudgetAllocation(event)"><strong>${escapeHtml(l.accountName)} · ${escapeHtml(l.fundName)} · ${accountingMoney(l.annual_amount)}</strong><p>Current shares: ${
            data.allocations
              .filter((a) => a.budget_line_id === l.id)
              .map((a) => a.basis_points / 100 + '%')
              .join(', ') || 'Unassigned 100%'
          }</p>${Array.from({ length: 4 }, () => `<div class="acct-form-grid" data-allocation><label>Department<select name="departmentId">${options('department')}</select></label><label>Project<select name="projectId">${options('project')}</select></label><label>Percent<input name="percent" type="number" min="0" max="100" step="0.01" value="0"></label></div>`).join('')}<button ${data.budget.status === 'draft' ? '' : 'disabled'}>Replace allocations</button><span role="status"></span></form>`
      )
      .join('')}</div>`;
    pane.querySelectorAll('form[data-line]').forEach((form) => {
      const shares = data.allocations.filter((a) => a.budget_line_id === form.dataset.line);
      const original = form.querySelector('[data-allocation]');
      while (form.querySelectorAll('[data-allocation]').length < Math.min(100, Math.max(4, shares.length + 1)))
        original.before(original.cloneNode(true));
      form.querySelectorAll('[data-allocation]').forEach((row, i) => {
        const share = shares[i];
        if (!share) return;
        row.querySelector('[name=departmentId]').value = share.department_id || '';
        row.querySelector('[name=projectId]').value = share.project_id || '';
        row.querySelector('[name=percent]').value = String(share.basis_points / 100);
      });
    });
  } catch (error) {
    alert(error.message);
  }
}
async function saveAccountingBudgetAllocation(event) {
  event.preventDefault();
  const form = event.currentTarget,
    container = document.getElementById('accountingAllocationLines'),
    status = form.querySelector('[role=status]');
  const allocations = Array.from(form.querySelectorAll('[data-allocation]'))
    .map((row) => ({
      departmentId: row.querySelector('[name=departmentId]').value,
      projectId: row.querySelector('[name=projectId]').value,
      basisPoints: Math.round(Number(row.querySelector('[name=percent]').value) * 100),
    }))
    .filter((v) => v.basisPoints > 0);
  try {
    const data = await accountingReadinessFetch(
      '/dimensions/budgets/' +
        encodeURIComponent(container.dataset.budget) +
        '/lines/' +
        encodeURIComponent(form.dataset.line),
      'POST',
      { expectedVersion: Number(container.dataset.version), allocations }
    );
    container.dataset.version = String(data.budget.version);
    status.textContent = 'Budget allocations replaced.';
  } catch (error) {
    status.textContent = error.message;
  }
}
async function openAccountingDimensionReport(groupBy) {
  const pane = document.getElementById('accountingPane'),
    tenant = currentParish?.parishId,
    period = accountingReportPeriod(),
    budgetId = document.getElementById('accountingDimensionBudget')?.value.trim() || '';
  try {
    const data = await accountingReadinessFetch(
      '/dimensions/report?' + new URLSearchParams({ from: period.start, to: period.end, groupBy, budgetId })
    );
    if (!accountingReadinessCurrent(pane, tenant)) return;
    const report = accountingReadinessStatement(
      groupBy === 'project' ? 'projects' : 'departments',
      data,
      period.start,
      period.end
    );
    pane.innerHTML =
      '<button onclick="openAccountingReadiness()">← Reporting workspace</button>' +
      accountingStatementHtml(report, false);
    pane.querySelectorAll('tbody tr').forEach((tr, i) => {
      const row = data.rows[i];
      if (!row) return;
      const cell = tr.cells[budgetId ? 3 : 2];
      if (!cell) return;
      const button = document.createElement('button');
      button.className = 'acct-link';
      button.textContent = cell.textContent;
      button.setAttribute('aria-label', 'View transactions for ' + row.account);
      button.onclick = () =>
        openAccountingClassifications({
          accountId: row.accountId,
          fundId: row.fundId,
          ...(groupBy === 'department'
            ? { departmentId: row.departmentId || '__unassigned__' }
            : { projectId: row.projectId || '__unassigned__' }),
        });
      cell.replaceChildren(button);
    });
  } catch (error) {
    alert(error.message);
  }
}
function accountingReadinessStatement(id, data, from, to, saved = false) {
  const config = {
    activities: {
      title: 'Income & expenses',
      columns: [
        ['accountName', 'Account', false],
        ['category', 'Type', false],
        ['amount', 'Amount', true],
      ],
    },
    position: {
      title: 'Financial position',
      columns: [
        ['accountName', 'Account', false],
        ['category', 'Type', false],
        ['amount', 'Balance', true],
      ],
    },
    cashFlows: {
      title: 'Cash flow',
      columns: [
        ['label', 'Activity', false],
        ['amount', 'Amount', true],
      ],
    },
    fundActivity: {
      title: 'Fund activity',
      columns: [
        ['name', 'Fund', false],
        ['beginningBalance', 'Opening', true],
        ['revenue', 'Income', true],
        ['expenses', 'Expenses', true],
        ['endingBalance', 'Closing', true],
      ],
    },
    assets: {
      title: 'Asset register',
      columns: [
        ['name', 'Asset', false],
        ['cost', 'Cost', true],
        ['postedDepreciation', 'Depreciation', true],
        ['netBookValue', 'Book value', true],
      ],
    },
    departments: {
      title: 'Department budget & actual',
      columns: [
        ['department', 'Department', false],
        ['account', 'Account', false],
        ['budget', 'YTD budget', true],
        ['actual', 'YTD actual', true],
        ['variance', 'Actual less budget', true],
      ],
    },
    projects: {
      title: 'Project budget & actual',
      columns: [
        ['project', 'Project', false],
        ['account', 'Account', false],
        ['budget', 'YTD budget', true],
        ['actual', 'YTD actual', true],
        ['variance', 'Actual less budget', true],
      ],
    },
  };
  const c = config[id];
  if (!c) throw new Error('Unsupported report.');
  const rows = data.rows.map((r) => ({
    kind: 'detail',
    cells: c.columns.map(([key, , money]) => (money ? Number(r[key] || 0) : String(r[key] ?? ''))),
  }));
  if (id === 'departments' || id === 'projects') {
    const t = data.totals || {};
    for (const [label, prefix] of [
      ['Income', 'income'],
      ['Expenses', 'expense'],
      ['Surplus / deficit', 'surplus'],
    ])
      rows.push({
        kind: prefix === 'surplus' ? 'grand' : 'subtotal',
        cells: [
          label,
          '',
          Number(t[prefix + 'Budget'] || 0),
          Number(t[prefix + 'Actual'] || 0),
          Number(t[prefix + 'Actual'] || 0) - Number(t[prefix + 'Budget'] || 0),
        ],
      });
  } else
    for (const [key, value] of Object.entries(data.totals || {}))
      rows.push({
        kind: 'subtotal',
        cells: c.columns.map(([, , money], i) =>
          i === 0 ? key.replace(/([A-Z])/g, ' $1') : money && i === c.columns.length - 1 ? value : ''
        ),
      });
  const actualOnly = (id === 'departments' || id === 'projects') && !data.budgetId;
  if (actualOnly) {
    c.columns = c.columns
      .filter(([, , money], i) => !money || i === 3)
      .map(([key, label, money]) => [key, key === 'actual' ? 'Actual' : label, money]);
    for (const r of rows) r.cells = r.cells.filter((_, i) => i === 0 || i === 1 || i === 3);
  }
  return {
    title: actualOnly ? c.title.replace('budget & actual', 'income & expenses') : c.title,
    parish: currentParish?.name || currentParish?.parishName || 'Parish',
    currency: accountingData.setup?.settings?.baseCurrency || 'USD',
    basis: saved ? 'Posting date · Saved council snapshot' : 'Posting date · Current reporting classifications',
    period: accountingDate(from) + ' – ' + accountingDate(to),
    columns: c.columns.map(([key, label, money]) => ({ key, label, money })),
    rows,
    notes: [
      ...(data.notes || []),
      ...((id === 'departments' || id === 'projects') && !data.budgetId
        ? ['No budget selected. Budget and variance columns are omitted.']
        : []),
      ...(data.reconciliation && !data.reconciliation.balanced
        ? ['Asset control accounts have a difference. Review before presenting.']
        : []),
    ],
  };
}
async function generateAccountingCouncilPackage(button) {
  button.disabled = true;
  const period = accountingReportPeriod(),
    tenant = currentParish?.parishId,
    budgetId = document.getElementById('accountingDimensionBudget')?.value.trim() || void 0;
  try {
    const result = await accountingReadinessFetch(
      '/report-packages/' + encodeURIComponent(button.dataset.id) + '/generate',
      'POST',
      {
        from: period.start,
        to: period.end,
        budgetId,
        operationKey: (button.dataset.operationKey ||= crypto.randomUUID()),
      }
    );
    if (tenant === currentParish?.parishId) await showAccountingCouncilPackage(result.id);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}
async function showAccountingCouncilPackage(id) {
  const pane = document.getElementById('accountingPane'),
    tenant = currentParish?.parishId;
  try {
    const result = await accountingReadinessFetch('/report-packages/runs/' + encodeURIComponent(id));
    if (!accountingReadinessCurrent(pane, tenant)) return;
    const snapshot = result.snapshot;
    pane.innerHTML =
      `<button onclick="openAccountingReadiness()">← Reporting workspace</button><section class="acct-card"><h2>${escapeHtml(snapshot.name)}</h2><p>Saved ${escapeHtml(snapshot.generatedAt)}. This copy stays unchanged when bookkeeping is corrected later.</p><button class="acct-primary" id="accountingPacketDownload">Download council PDF</button><span role="status"></span></section>` +
      snapshot.sections
        .map((s) =>
          accountingStatementHtml(
            accountingReadinessStatement(s.reportId, s.data, snapshot.from, snapshot.to, true),
            false
          )
        )
        .join('');
    document.getElementById('accountingPacketDownload').onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const { createAccountingReportPacketPdf } =
          await import('/parish/accounting-report-pdf.js?v=20261103treasurer1');
        const bytes = await createAccountingReportPacketPdf(
          snapshot.sections.map((s) =>
            accountingReadinessStatement(s.reportId, s.data, snapshot.from, snapshot.to, true)
          )
        );
        downloadBlob('agapay-council-' + snapshot.to + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
      } catch (error) {
        button.parentElement.querySelector('[role=status]').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  } catch (error) {
    alert(error.message);
  }
}
function installAccountingAssetsNavigation() {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  const reports = document.querySelector('[data-accounting-view="reports"]');
  if (!reports || document.querySelector('[data-accounting-view="assets"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.accountingView = 'assets';
  button.innerHTML = '<span class="acct-nav-icon">◇</span>Assets';
  button.addEventListener('click', () => setAccountingView('assets'));
  reports.before(button);
}
installAccountingAssetsNavigation();
let accountingAssetsTenant = '';
let accountingAssetsRequest = 0;
let accountingAssetsData = null;
let accountingAssetDetail = null;
let accountingAssetAsOf = '';
let accountingAssetBusy = false;
let accountingAssetPreviewRequest = 0;
let accountingAssetError = '';
let accountingAssetPreview = null;
function resetAccountingAssets() {
  accountingAssetsTenant = currentParish?.parishId || '';
  accountingAssetsRequest++;
  accountingAssetsData = null;
  accountingAssetDetail = null;
  accountingAssetPreview = null;
  accountingAssetError = '';
  accountingAssetBusy = false;
  accountingAssetAsOf = accountingReportPeriod().end;
}
async function accountingAssetFetch(path, method = 'GET', body) {
  const response = await fetch(accountingApi('/assets' + path), {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Unable to load assets.');
  return payload;
}
async function loadAccountingAssets() {
  if (accountingAssetsTenant !== (currentParish?.parishId || '')) resetAccountingAssets();
  const request = ++accountingAssetsRequest,
    tenant = accountingAssetsTenant;
  accountingAssetBusy = true;
  accountingAssetsData = null;
  accountingAssetError = '';
  renderAccountingPane();
  try {
    const data = await accountingAssetFetch('?asOf=' + encodeURIComponent(accountingAssetAsOf));
    if (request === accountingAssetsRequest && tenant === currentParish?.parishId) accountingAssetsData = data;
  } catch (error) {
    if (request === accountingAssetsRequest) accountingAssetError = error.message;
  } finally {
    if (request === accountingAssetsRequest) {
      accountingAssetBusy = false;
      if (accountingView === 'assets') renderAccountingPane();
    }
  }
}
function accountingAssetAccountOptions(category, normalBalance) {
  return (
    '<option value="">Choose account</option>' +
    accountingData.accounts
      .filter((a) => a.category === category && (!normalBalance || a.normalBalance === normalBalance))
      .map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`)
      .join('')
  );
}
function renderAccountingAssets(pane) {
  if (accountingAssetsTenant !== (currentParish?.parishId || '')) resetAccountingAssets();
  if (accountingAssetDetail) {
    renderAccountingAssetDetail(pane);
    return;
  }
  const data = accountingAssetsData;
  pane.innerHTML = `<section class="acct-asset-hero"><div><span class="acct-kicker">Stewardship of parish property</span><h2>Assets, clearly accounted for.</h2><p>Track what the parish owns, where it belongs, and its value over time.</p></div><button class="acct-primary" onclick="newAccountingAsset()">＋ Register an asset</button></section>
 <div class="acct-asset-toolbar"><button class="acct-refresh" onclick="showAccountingAssetAccountSetup()">Set up asset accounts</button><label>Values as of <input type="date" value="${escapeAttr(accountingAssetAsOf)}" onchange="accountingAssetAsOf=this.value;loadAccountingAssets()"></label><button class="acct-refresh" onclick="loadAccountingAssets()">Refresh</button><button class="acct-refresh" onclick="setAccountingView('reports');openAccountingReport('assetRegister')">Open printable report</button><label>Find an asset <input type="search" placeholder="Name, tag or location" oninput="filterAccountingAssets(this.value)"></label></div>
 ${accountingAssetError ? `<div role="alert" class="acct-card">${escapeHtml(accountingAssetError)}</div>` : ''}
 ${accountingAssetBusy ? '<p role="status">Loading asset register…</p>' : ''}
 ${data ? `<div class="acct-asset-metrics"><section><span>Active asset cost</span><strong>${accountingMoney(data.totals.cost)}</strong></section><section><span>Posted depreciation</span><strong>${accountingMoney(data.totals.accumulated)}</strong></section><section><span>Net book value</span><strong>${accountingMoney(data.totals.netBookValue)}</strong></section></div><p class="acct-asset-policy">${escapeHtml(data.policy)}</p>${data.rows.length && data.reconciliation ? `<p class="acct-asset-policy" role="status">${data.reconciliation.balanced ? 'Registered control accounts reconcile to the ledger.' : 'Review unregistered assets or prior depreciation: cost difference ' + accountingMoney(data.reconciliation.costDifference) + '; accumulated depreciation difference ' + accountingMoney(data.reconciliation.accumulatedDifference) + '.'}</p>` : ''}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Asset</th><th>Location</th><th>Cost</th><th>Posted depreciation</th><th>Book value</th><th>Status</th></tr></thead><tbody id="accountingAssetRows">${data.rows.map((a) => `<tr data-asset-search="${escapeAttr((a.tag + ' ' + a.name + ' ' + a.location).toLowerCase())}"><td><button class="acct-link" data-asset-id="${escapeAttr(a.id)}" onclick="openAccountingAsset(this.dataset.assetId)"><strong>${escapeHtml(a.tag)}</strong> · ${escapeHtml(a.name)}</button></td><td>${escapeHtml(a.location || '—')}</td><td>${accountingMoney(a.cost)}</td><td>${accountingMoney(a.postedDepreciation)}</td><td><strong>${accountingMoney(a.netBookValue)}</strong></td><td>${escapeHtml(a.status)}</td></tr>`).join('') || '<tr><td colspan="6">No registered assets for this date. Record the acquisition, then register the asset.</td></tr>'}</tbody></table></div>` : '<p>Choose Refresh to load the register.</p>'}`;
}
function filterAccountingAssets(query) {
  document
    .querySelectorAll('#accountingAssetRows tr[data-asset-search]')
    .forEach((row) => (row.hidden = !row.dataset.assetSearch?.includes(query.trim().toLowerCase())));
}
async function openAccountingAsset(id) {
  const tenant = currentParish?.parishId,
    request = ++accountingAssetsRequest;
  try {
    const detail = await accountingAssetFetch('/' + encodeURIComponent(id));
    if (tenant !== currentParish?.parishId || request !== accountingAssetsRequest || accountingView !== 'assets')
      return;
    accountingAssetDetail = detail;
    accountingAssetPreview = null;
    renderAccountingPane();
  } catch (error) {
    alert(error.message);
  }
}
function closeAccountingAsset() {
  accountingAssetsRequest++;
  accountingAssetDetail = null;
  accountingAssetPreview = null;
  loadAccountingAssets();
}
async function newAccountingAsset() {
  const pane = document.getElementById('accountingPane'),
    tenant = currentParish?.parishId,
    request = ++accountingAssetsRequest;
  pane.innerHTML = '<p role="status">Finding posted acquisitions…</p>';
  try {
    const response = await fetch(accountingApi('/assets/acquisition-lines'), { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load acquisitions.');
    if (tenant !== currentParish?.parishId || request !== accountingAssetsRequest || accountingView !== 'assets')
      return;
    const opening = await accountingAssetFetch('/opening-lines');
    if (tenant !== currentParish?.parishId) return;
    pane.innerHTML = `<button class="acct-link" onclick="closeAccountingAsset()">← Asset register</button><section class="acct-card"><span class="acct-kicker">Add to the register</span><h2>Register a parish asset</h2><button class="acct-link" type="button" onclick="showAccountingAssetAccountSetup()">Set up asset accounts</button><p>Record the purchase, opening balance, or in-kind gift in the ledger first. Select its asset debit below. Registration does not book the cost again.</p><p>Cost account: debit asset, investing classification. Accumulated depreciation: credit asset, operating classification. Use Set up asset accounts to create or select these accounts before registering.</p><form class="acct-phase-form" onsubmit="saveAccountingAsset(event)"><div class="acct-form-grid">
 <label>Acquisition entry<select name="acquisitionLineId" required><option value="">Choose posted asset debit</option>${data.rows
   .filter((r) => r.available > 0)
   .map(
     (r) =>
       `<option value="${escapeAttr(r.id)}">${escapeHtml(r.entry_date)} · ${escapeHtml(r.account_name)} · ${accountingMoney(r.available)} available · ${escapeHtml(r.description)}</option>`
   )
   .join('')}</select></label>
 <label>Asset tag<input name="tag" required maxlength="80" placeholder="EQ-001"></label><label>Asset name<input name="name" required maxlength="160"></label><label>In-service date<input name="inServiceDate" type="date" required></label>
 <label>Cost allocated to this asset<input name="cost" type="number" min="0.01" step="0.01" required></label><label>Salvage value<input name="salvage" type="number" min="0" step="0.01" value="0" required></label><label>Useful life / remaining life for imported assets (months)<input name="lifeMonths" type="number" min="1" max="1200" value="60" required></label><label>Depreciation method<select name="method"><option value="straight_line">Monthly straight-line</option><option value="none">Nondepreciable (e.g. land)</option></select></label>
 <label>Accumulated depreciation<select name="accumulatedAccountId">${accountingAssetAccountOptions('asset', 'credit')}</select></label><label>Depreciation expense<select name="expenseAccountId">${accountingAssetAccountOptions('expense', 'debit')}</select></label><label>Location<input name="location" maxlength="160"></label><label>Serial number<input name="serialNumber" maxlength="160"></label><label>Insurance value<input name="insuranceValue" type="number" min="0" step="0.01" value="0"></label><label>Notes<textarea name="notes" maxlength="4000"></textarea></label></div>
 <details><summary>Import an older asset with opening depreciation</summary><p>Link existing posted opening balances. No new cost or depreciation is booked. Enter remaining useful life above. Opening through must be a month-end in the ledger recognition month or the month immediately before it.</p><div class="acct-form-grid"><label>Original acquisition date<input name="originalAcquisitionDate" type="date"></label><label>Opening depreciation through<input name="openingThrough" type="date"></label><label>Opening accumulated depreciation<input name="openingAmount" type="number" min="0" step="0.01" value="0"></label><label>Existing accumulated-depreciation credit<select name="openingLine"><option value="">None (zero opening depreciation)</option>${opening.rows.map((l) => `<option value="${escapeAttr(l.id)}">${escapeHtml(String(l.entryNumber) + ' · ' + String(l.accountName) + ' · ' + String(l.fundName))} · ${accountingMoney(Number(l.amount))}</option>`).join('')}</select></label></div></details><p>Monthly straight-line includes full months. Financial terms are fixed when registered; corrections preserve the earlier registration and journal history.</p><button class="acct-primary">Register asset</button><span class="acct-form-status" role="status"></span></form></section>`;
  } catch (error) {
    if (tenant === currentParish?.parishId)
      pane.innerHTML = accountingEmpty('Asset registration unavailable', error.message);
  }
}
function accountingAssetFormValues(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  for (const key of ['cost', 'salvage', 'insuranceValue', 'proceeds'])
    if (key in values) values[key] = Math.round(Number(values[key]) * 100);
  if ('lifeMonths' in values) values.lifeMonths = Number(values.lifeMonths);
  return values;
}
async function saveAccountingAsset(event) {
  event.preventDefault();
  const form = event.currentTarget,
    tenant = currentParish?.parishId,
    button = form.querySelector('button'),
    status = form.querySelector('.acct-form-status');
  button.disabled = true;
  status.textContent = 'Registering…';
  const values = accountingAssetFormValues(form);
  if (values.originalAcquisitionDate)
    values.opening = {
      originalAcquisitionDate: values.originalAcquisitionDate,
      throughDate: values.openingThrough,
      amount: Math.round(Number(values.openingAmount) * 100),
      creditLineId: values.openingLine || void 0,
    };
  for (const key of ['originalAcquisitionDate', 'openingThrough', 'openingAmount', 'openingLine']) delete values[key];
  values.operationKey = form.dataset.operationKey ||= crypto.randomUUID();
  try {
    const result = await accountingAssetFetch('', 'POST', values);
    if (tenant === currentParish?.parishId) await openAccountingAsset(result.asset.id);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}
function renderAccountingAssetDetail(pane) {
  const detail = accountingAssetDetail,
    a = detail.asset;
  pane.innerHTML = `<button class="acct-link" onclick="closeAccountingAsset()">← Asset register</button><section class="acct-asset-hero"><div><span class="acct-kicker">${escapeHtml(a.tag)} · ${escapeHtml(a.status)}</span><h2>${escapeHtml(a.name)}</h2><p>Acquired ${accountingDate(a.original_acquisition_date || a.acquisition_date)} · Ledger recognition ${accountingDate(a.ledger_start_date || a.acquisition_date)} · In service ${accountingDate(a.in_service_date)}</p></div><strong>${accountingMoney(a.cost)} cost</strong></section>
 <section class="acct-card"><h3>Property details</h3><form class="acct-phase-form" onsubmit="saveAccountingAssetMetadata(event)"><div class="acct-form-grid"><label>Location<input name="location" maxlength="160" value="${escapeAttr(a.location)}"></label><label>Serial number<input name="serialNumber" maxlength="160" value="${escapeAttr(a.serial_number)}"></label><label>Insurance value<input name="insuranceValue" type="number" min="0" step="0.01" value="${a.insurance_value / 100}"></label><label>Notes<textarea name="notes" maxlength="4000">${escapeHtml(a.notes)}</textarea></label></div><button class="acct-refresh">Save details</button><span class="acct-form-status" role="status"></span></form></section>
 ${a.status === 'active' ? `<section class="acct-card"><h3>Review an accounting action</h3><p>Preview calculated entries before posting. Disposal includes any depreciation due through its month.</p><form class="acct-phase-form" onsubmit="previewAccountingAsset(event)" oninput="invalidateAccountingAssetPreview()"><div class="acct-form-grid"><label>Action<select name="kind"><option value="depreciation">Post depreciation</option><option value="disposal">Dispose / retire asset</option></select></label><label>Posting date<input type="date" name="throughDate" required value="${escapeAttr(accountingAssetAsOf)}"></label><label>Disposal proceeds (zero for retirement)<input name="proceeds" type="number" step="0.01" min="0" value="0"></label><label>Proceeds cash account<select name="cashAccountId">${accountingAssetAccountOptions('asset', 'debit')}</select></label><label>Gain account<select name="gainAccountId">${accountingAssetAccountOptions('revenue', 'credit')}</select></label><label>Loss account<select name="lossAccountId">${accountingAssetAccountOptions('expense', 'debit')}</select></label></div><button class="acct-primary">Preview journal</button><span class="acct-form-status" role="status"></span></form><div id="accountingAssetPreview"></div></section>` : ''}
 <section class="acct-card"><h3>Posted asset history</h3><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Through</th><th>Action</th><th>Depreciation</th><th>Supporting entry</th></tr></thead><tbody>${detail.movements.map((m) => `<tr><td>${accountingDate(m.through_date)}</td><td>${escapeHtml(m.kind)}${m.reversed_date ? ' · reversed ' + accountingDate(m.reversed_date) : ''}</td><td>${accountingMoney(m.depreciation)}</td><td><button class="acct-link" data-journal="${escapeAttr(m.journal_id)}" onclick="openAccountingJournalAttachments(this.dataset.journal)">Journal documents</button></td></tr>`).join('') || '<tr><td colspan="4">No asset postings yet.</td></tr>'}</tbody></table></div></section>
 ${a.status !== 'cancelled' ? `<section class="acct-card"><h3>Correct an asset record</h3><p>${detail.latestMovementId ? 'Reverse the latest asset posting with an equal and opposite journal. Earlier reports retain the original posting until the correction date.' : 'Cancel this registration to replace incorrect financial terms. This releases its existing ledger allocation without changing the ledger.'}</p><form class="acct-phase-form" onsubmit="correctAccountingAsset(event)"><label>Correction date<input type="date" name="entryDate" required value="${escapeAttr(accountingAssetAsOf)}"></label><label>Reason<textarea name="reason" required maxlength="1600"></textarea></label><button class="acct-refresh">${detail.latestMovementId ? 'Preview correction' : 'Review registration cancellation'}</button><span class="acct-form-status" role="status"></span><div class="acct-correction-preview"></div></form></section>` : ''}
 <section class="acct-card"><h3>Depreciation schedule</h3><p>Estimated monthly charges · ${a.life_months} months · ${accountingMoney(a.salvage)} salvage. A schedule is not evidence of a posting.</p><details><summary>Show schedule (${detail.schedule.length} months)</summary><div class="acct-table-wrap acct-asset-schedule"><table class="acct-table"><thead><tr><th>Month-end</th><th>Charge</th><th>Accumulated</th><th>Book value</th></tr></thead><tbody>${detail.schedule.map((s) => `<tr><td>${accountingDate(s.throughDate)}</td><td>${accountingMoney(s.amount)}</td><td>${accountingMoney(s.accumulated)}</td><td>${accountingMoney(s.netBookValue)}</td></tr>`).join('')}</tbody></table></div></details></section><section class="acct-card"><h3>Acquisition documents</h3><p>Invoices, appraisals and property documents are stored with the acquisition journal entry and shared by assets linked to it.</p><div id="accountingAssetDocuments"></div></section>`;
  renderAccountingAttachments(
    'journal_entry',
    detail.source.journal_entry_id,
    document.getElementById('accountingAssetDocuments')
  );
}
async function saveAccountingAssetMetadata(event) {
  event.preventDefault();
  const form = event.currentTarget,
    detail = accountingAssetDetail,
    tenant = currentParish?.parishId,
    status = form.querySelector('.acct-form-status');
  try {
    await accountingAssetFetch('/' + encodeURIComponent(detail.asset.id), 'PATCH', {
      ...accountingAssetFormValues(form),
      expectedVersion: detail.asset.version,
    });
    if (tenant === currentParish?.parishId) await openAccountingAsset(detail.asset.id);
  } catch (error) {
    status.textContent = error.message;
  }
}
function invalidateAccountingAssetPreview() {
  accountingAssetPreviewRequest++;
  accountingAssetPreview = null;
  const pane = document.getElementById('accountingAssetPreview');
  if (pane) pane.innerHTML = '';
}
async function previewAccountingAsset(event) {
  event.preventDefault();
  const form = event.currentTarget,
    detail = accountingAssetDetail,
    tenant = currentParish?.parishId,
    status = form.querySelector('.acct-form-status');
  invalidateAccountingAssetPreview();
  const previewRequest = accountingAssetPreviewRequest;
  const input = accountingAssetFormValues(form),
    kind = input.kind === 'disposal' ? 'disposal' : 'depreciation';
  input.expectedVersion = detail.asset.version;
  input.operationKey = crypto.randomUUID();
  try {
    const result = await accountingAssetFetch(
      '/' + encodeURIComponent(detail.asset.id) + '/' + kind + '-preview',
      'POST',
      input
    );
    if (
      tenant !== currentParish?.parishId ||
      accountingAssetDetail !== detail ||
      previewRequest !== accountingAssetPreviewRequest
    )
      return;
    accountingAssetPreview = { kind, input, result };
    document.getElementById('accountingAssetPreview').innerHTML =
      `<div class="acct-asset-review"><h3>Review before posting</h3><p>${escapeHtml(input.throughDate)} · Depreciation ${accountingMoney(result.depreciation)} · ${kind === 'disposal' ? 'Proceeds ' + accountingMoney(result.proceeds) + ' · Gain / loss ' + accountingMoney(result.gainLoss) : 'Book value ' + accountingMoney(result.netBookValue)}</p><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Account / purpose</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${result.lines.map((l) => `<tr><td>${escapeHtml(accountingData.accounts.find((a) => a.id === l.accountId)?.name || l.accountId)} · ${escapeHtml(l.description)}</td><td>${accountingMoney(l.debitAmount)}</td><td>${accountingMoney(l.creditAmount)}</td></tr>`).join('')}</tbody></table></div><button class="acct-primary" onclick="postAccountingAsset(this)">Confirm and post ${kind}</button><p>Posts the preview shown above. If you change the form, preview again before posting.</p></div>`;
  } catch (error) {
    status.textContent = error.message;
  }
}
async function postAccountingAsset(button) {
  const preview = accountingAssetPreview,
    detail = accountingAssetDetail,
    tenant = currentParish?.parishId;
  if (!preview || !detail) return;
  button.disabled = true;
  try {
    await accountingAssetFetch(
      '/' + encodeURIComponent(detail.asset.id) + '/' + (preview.kind === 'disposal' ? 'dispose' : 'depreciation-post'),
      'POST',
      preview.input
    );
    if (tenant === currentParish?.parishId) await openAccountingAsset(detail.asset.id);
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
}
async function loadAccountingAssetReport() {
  const tenant = currentParish?.parishId,
    period = accountingReportPeriod();
  try {
    const data = await accountingAssetFetch('?asOf=' + encodeURIComponent(period.end));
    if (tenant !== currentParish?.parishId) return;
    accountingCustomReport = {
      title: 'Asset Register',
      subtitle: 'As of ' + period.end,
      columns: [
        { key: 'tag', label: 'Tag' },
        { key: 'name', label: 'Asset' },
        { key: 'location', label: 'Location' },
        { key: 'cost', label: 'Cost', money: true },
        { key: 'postedDepreciation', label: 'Posted depreciation', money: true },
        { key: 'netBookValue', label: 'Book value', money: true },
        { key: 'status', label: 'Status' },
      ],
      rows: data.rows,
      disclaimer:
        data.policy +
        (data.reconciliation && !data.reconciliation.balanced
          ? ' Review required: registered control accounts differ from the ledger. Cost difference ' +
            accountingMoney(data.reconciliation.costDifference) +
            '; accumulated depreciation difference ' +
            accountingMoney(data.reconciliation.accumulatedDifference) +
            '.'
          : '') +
        ' Disposed asset cost and depreciation are historical reference values; active assets reconcile to the balance sheet.',
    };
  } catch (error) {
    accountingCustomReport = { error: error.message };
  }
}
function showAccountingAssetAccountSetup() {
  accountingAssetsRequest++;
  accountingAssetDetail = null;
  accountingAssetPreview = null;
  const pane = document.getElementById('accountingPane');
  const roles = [
    {
      key: 'cost',
      title: 'Asset cost',
      number: '1500',
      name: 'Equipment',
      category: 'asset',
      normal: 'debit',
      classification: 'investing',
    },
    {
      key: 'accumulated',
      title: 'Accumulated depreciation',
      number: '1590',
      name: 'Accumulated depreciation',
      category: 'asset',
      normal: 'credit',
      classification: 'operating',
    },
    {
      key: 'expense',
      title: 'Depreciation expense',
      number: '5900',
      name: 'Depreciation expense',
      category: 'expense',
      normal: 'debit',
      classification: 'operating',
    },
  ];
  pane.innerHTML = `<button class="acct-link" onclick="closeAccountingAsset()">← Asset register</button><section class="acct-card"><span class="acct-kicker">Asset account setup</span><h2>Prepare your asset accounts</h2><p>Select an existing account or create a new one for each purpose. This creates chart accounts only. Record a purchase or non-cash gift afterward, then link its posted entry to the asset register.</p><form class="acct-phase-form" onsubmit="saveAccountingAssetAccountSetup(event)">${roles
    .map(
      (role) =>
        `<fieldset><legend>${escapeHtml(role.title)}</legend><p>${escapeHtml(role.category)} · ${escapeHtml(role.normal)} normal balance · ${escapeHtml(role.classification)} cash-flow classification</p><div class="acct-form-grid"><label>Account<select name="${role.key}ExistingId"><option value="">Create a new account</option>${accountingData.accounts
          .filter(
            (a) =>
              a.category === role.category &&
              a.normalBalance === role.normal &&
              a.cashFlowClassification === role.classification &&
              (role.category !== 'asset' || Number(a.accountNumber) >= 1100)
          )
          .map(
            (a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`
          )
          .join(
            ''
          )}</select></label><label>New account number<input name="${role.key}Number" pattern="[0-9]{4,6}" value="${role.number}"></label><label>New account name<input name="${role.key}Name" maxlength="120" value="${escapeAttr(role.name)}"></label></div></fieldset>`
    )
    .join(
      ''
    )}<label>Default fund for new depreciation expenses<select name="fundId" required>${accountingData.funds.map((f) => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.name)}</option>`).join('')}</select></label><p>Existing accounts keep their numbers, names and classifications. New numbers must be unused and above 1099.</p><button class="acct-primary">Save asset account setup</button><span class="acct-form-status" role="status"></span></form></section>`;
}
async function saveAccountingAssetAccountSetup(event) {
  event.preventDefault();
  const form = event.currentTarget,
    tenant = currentParish?.parishId,
    status = form.querySelector('.acct-form-status'),
    button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Saving asset accounts…';
  const input = Object.fromEntries(new FormData(form));
  input.operationKey = form.dataset.operationKey ||= crypto.randomUUID();
  try {
    await accountingAssetFetch('/account-setup', 'POST', input);
    const response = await fetch(accountingApi('/workspace-reference'), { headers: authHeaders() }),
      reference = await response.json();
    if (!response.ok) throw new Error('Accounts saved. Refresh Accounting to load the updated chart.');
    if (tenant !== currentParish?.parishId || accountingView !== 'assets') return;
    accountingData.accounts = reference.accounts || accountingData.accounts;
    accountingData.accountCatalog = reference.accountCatalog || accountingData.accountCatalog;
    closeAccountingAsset();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}
async function correctAccountingAsset(event) {
  event.preventDefault();
  const form = event.currentTarget,
    detail = accountingAssetDetail,
    tenant = currentParish?.parishId,
    status = form.querySelector('.acct-form-status'),
    button = form.querySelector('button'),
    pane = form.querySelector('.acct-correction-preview');
  const input = {
    ...Object.fromEntries(new FormData(form)),
    expectedVersion: detail.asset.version,
    movementId: detail.latestMovementId,
    operationKey: (form.dataset.operationKey ||= crypto.randomUUID()),
  };
  button.disabled = true;
  status.textContent = 'Reviewing…';
  try {
    const preview = detail.latestMovementId
      ? await accountingAssetFetch('/' + encodeURIComponent(detail.asset.id) + '/correction-preview', 'POST', input)
      : null;
    if (tenant !== currentParish?.parishId || accountingAssetDetail !== detail) return;
    pane.innerHTML = preview
      ? `<p>Equal and opposite correction journal:</p><ul>${preview.lines.map((l) => `<li>${escapeHtml(l.accountId)} · Debit ${accountingMoney(l.debitAmount)} · Credit ${accountingMoney(l.creditAmount)}</li>`).join('')}</ul>`
      : '<p>The registration will be retained as cancelled. The ledger balances will remain unchanged. Register a replacement afterward.</p>';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'acct-primary';
    confirm.textContent = preview ? 'Confirm and post correction' : 'Confirm cancellation';
    pane.append(confirm);
    status.textContent = 'Review the details before confirming.';
    form.oninput = () => {
      pane.replaceChildren();
      button.disabled = false;
      status.textContent = 'Details changed. Review again.';
      confirm.disabled = true;
    };
    confirm.onclick = async () => {
      confirm.disabled = true;
      try {
        await accountingAssetFetch(
          '/' + encodeURIComponent(detail.asset.id) + (preview ? '/correct' : '/cancel-registration'),
          'POST',
          input
        );
        if (tenant === currentParish?.parishId) await openAccountingAsset(detail.asset.id);
      } catch (error) {
        status.textContent = error.message;
        confirm.disabled = false;
      }
    };
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}
