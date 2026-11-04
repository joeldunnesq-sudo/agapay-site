// Functions only: included in the assets feature's classic-script response.
function accountingReadinessLink() {
  return '<div class="acct-asset-toolbar"><button class="acct-primary" onclick="openAccountingReadiness()">Departments, projects & council packages</button><button class="acct-refresh" onclick="setAccountingView(\'close\')">Month-end checklist</button></div>';
}
async function accountingReadinessFetch(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(accountingApi(path), {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load reporting workspace.');
  return data;
}
function accountingReadinessCurrent(pane: HTMLElement, tenant: string | undefined) {
  return pane.isConnected && tenant === currentParish?.parishId && accountingView === 'reports';
}
async function openAccountingReadiness() {
  setAccountingView('reports');
  const pane = document.getElementById('accountingPane')!,
    tenant = currentParish?.parishId;
  pane.innerHTML = '<p role="status">Loading reporting workspace…</p>';
  try {
    const [labels, packets, budgets] = await Promise.all([
      accountingReadinessFetch('/dimensions'),
      accountingReadinessFetch('/report-packages'),
      accountingReadinessFetch('/budgets').catch(() => ({ budgets: [] })),
    ]);
    if (!accountingReadinessCurrent(pane, tenant)) return;
    pane.innerHTML = `<button class="acct-link" onclick="renderAccountingPane()">← All reports</button><section class="acct-report-library-head"><div><span class="acct-kicker">Council-ready reporting</span><h2>See the work behind the numbers</h2><p>Funds track the purpose of money. Departments and projects track the parish work it supports.</p></div></section>${accountingReportDateForm()}<div class="acct-setup-grid"><section class="acct-card"><h3>Departments & projects</h3><p>Classifications are audited reporting labels. Posted amounts remain unchanged.</p><button class="acct-primary" onclick="openAccountingClassifications()">Classify income & expenses</button><button class="acct-refresh" onclick="openAccountingDimensionReport('department')">Department report</button><button class="acct-refresh" onclick="openAccountingDimensionReport('project')">Project report</button><form class="acct-phase-form acct-readiness-form" onsubmit="saveAccountingDimension(event)"><label>Type<select name="kind"><option value="department">Department</option><option value="project">Project</option></select></label><label>Code<input name="code" required maxlength="32"></label><label>Name<input name="name" required maxlength="120"></label><button class="acct-refresh">Add department / project</button><span role="status"></span></form><ul>${labels.dimensions.map((d: { code: string; name: string; kind: string }) => `<li>${escapeHtml(d.code)} · ${escapeHtml(d.name)} (${escapeHtml(d.kind)})</li>`).join('') || '<li>No labels yet. Add the departments or projects you need.</li>'}</ul><label>Budget for comparison / allocation<select id="accountingDimensionBudget"><option value="">Actual activity only</option>${budgets.budgets.map((b: { id: string; name: string; status: string }) => `<option value="${escapeAttr(b.id)}">${escapeHtml(b.name)} · ${escapeHtml(b.status)}</option>`).join('')}</select></label><button class="acct-refresh" onclick="openAccountingBudgetAllocations()">Allocate a draft budget</button></section><section class="acct-card"><h3>Saved council packages</h3><p>Generate a dated, immutable copy of the reports council needs. Budget comparisons use fiscal YTD through a month-end.</p><form class="acct-phase-form acct-readiness-form" onsubmit="saveAccountingCouncilPackage(event)"><label>Package name<input name="name" required maxlength="120" placeholder="Monthly parish council"></label>${[
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
        .filter((p: { is_active: number }) => p.is_active)
        .map(
          (p: { id: string; name: string }) =>
            `<p><strong>${escapeHtml(p.name)}</strong> <button class="acct-refresh" data-id="${escapeAttr(p.id)}" onclick="generateAccountingCouncilPackage(this)">Generate with selected dates</button></p>`
        )
        .join('') || '<p>No packages saved yet.</p>'
    }</div><h4>Previously generated</h4>${packets.runs.map((r: { id: string; name: string; end_date: string }) => `<p><button class="acct-link" data-id="${escapeAttr(r.id)}" onclick="showAccountingCouncilPackage(this.dataset.id)">${escapeHtml(r.name)} · ${accountingDate(r.end_date)}</button></p>`).join('') || '<p>No saved snapshots yet.</p>'}</section></div><section class="acct-card"><h3>A repeatable month-end</h3><ol><li>Record gifts, income and bills; attach supporting documents.</li><li>Match the bank statement and resolve differences.</li><li>Review depreciation and unassigned department/project activity.</li><li>Compare fiscal YTD income and expenses to the approved budget.</li><li>Run the month-end checklist, resolve blockers, and complete the close.</li><li>Generate the council package and preserve the reviewed copy.</li></ol><button class="acct-refresh" onclick="setAccountingView('close')">Open month-end checks</button></section>`;
  } catch (error) {
    if (accountingReadinessCurrent(pane, tenant))
      pane.innerHTML = `<p role="alert">${escapeHtml((error as Error).message)}</p><button onclick="openAccountingReadiness()">Try again</button>`;
  }
}
async function saveAccountingDimension(event: AccountingFormEvent) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector<HTMLElement>('[role=status]')!;
  try {
    await accountingReadinessFetch('/dimensions', 'POST', Object.fromEntries(new FormData(form)));
    await openAccountingReadiness();
  } catch (error) {
    status.textContent = (error as Error).message;
  }
}
async function saveAccountingCouncilPackage(event: AccountingFormEvent) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector<HTMLElement>('[role=status]')!,
    values = new FormData(form);
  try {
    await accountingReadinessFetch('/report-packages', 'POST', {
      name: values.get('name'),
      reportIds: values.getAll('reports'),
    });
    await openAccountingReadiness();
  } catch (error) {
    status.textContent = (error as Error).message;
  }
}
async function openAccountingClassifications(filters: Record<string, string> = {}) {
  const pane = document.getElementById('accountingPane')!,
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
    const options = (kind: string, id: string) =>
      '<option value="">Unassigned</option>' +
      labels.dimensions
        .filter((d: { kind: string; is_active: number; id: string }) => d.kind === kind && (d.is_active || d.id === id))
        .map(
          (d: { id: string; name: string }) =>
            `<option value="${escapeAttr(d.id)}" ${d.id === id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
        )
        .join('');
    pane.innerHTML = `<button class="acct-link" onclick="openAccountingReadiness()">← Reporting workspace</button><h2>Classify income & expenses</h2><p>${accountingDate(period.start)} – ${accountingDate(period.end)}. Each change requires a reason and is recorded in the audit trail. ${data.truncated ? 'Showing the latest 500 lines; choose a shorter date range to reach older activity.' : ''}</p>${data.rows.map((r: { id: string; version: number; date: string; description: string; entryNumber: string; accountName: string; departmentId: string; projectId: string; debit: number; credit: number }) => `<form class="acct-card acct-phase-form acct-readiness-form" data-line="${escapeAttr(r.id)}" data-version="${r.version}" onsubmit="saveAccountingClassification(event)"><strong>${escapeHtml(r.entryNumber)} · ${accountingDate(r.date)} · ${escapeHtml(r.accountName)}</strong><p>${escapeHtml(r.description)} · Debit ${accountingMoney(r.debit)} · Credit ${accountingMoney(r.credit)}</p><div class="acct-form-grid"><label>Department<select name="departmentId">${options('department', r.departmentId)}</select></label><label>Project<select name="projectId">${options('project', r.projectId)}</select></label><label>Reason<input name="reason" required maxlength="800"></label></div><button class="acct-refresh">Save classification</button><span role="status"></span></form>`).join('') || '<p>No income or expense lines in this period.</p>'}`;
  } catch (error) {
    if (accountingReadinessCurrent(pane, tenant))
      pane.innerHTML = `<p role="alert">${escapeHtml((error as Error).message)}</p>`;
  }
}
async function saveAccountingClassification(event: AccountingFormEvent) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector<HTMLElement>('[role=status]')!,
    button = form.querySelector<HTMLButtonElement>('button')!;
  button.disabled = true;
  try {
    const data = await accountingReadinessFetch(
      '/dimensions/transactions/' + encodeURIComponent(form.dataset.line!),
      'PATCH',
      { ...Object.fromEntries(new FormData(form)), expectedVersion: Number(form.dataset.version) }
    );
    form.dataset.version = String(data.classification.version);
    status.textContent = 'Saved to the reporting audit trail.';
  } catch (error) {
    status.textContent = (error as Error).message;
  } finally {
    button.disabled = false;
  }
}
async function openAccountingBudgetAllocations() {
  const id = (document.getElementById('accountingDimensionBudget') as HTMLInputElement)?.value.trim();
  if (!id) {
    alert('Choose a budget first.');
    return;
  }
  const pane = document.getElementById('accountingPane')!,
    tenant = currentParish?.parishId;
  try {
    const [data, labels] = await Promise.all([
      accountingReadinessFetch('/dimensions/budgets/' + encodeURIComponent(id)),
      accountingReadinessFetch('/dimensions'),
    ]);
    if (!accountingReadinessCurrent(pane, tenant)) return;
    const options = (kind: string) =>
      '<option value="">Unassigned</option>' +
      labels.dimensions
        .filter((d: { kind: string; is_active: number }) => d.kind === kind && d.is_active)
        .map((d: { id: string; name: string }) => `<option value="${escapeAttr(d.id)}">${escapeHtml(d.name)}</option>`)
        .join('');
    pane.innerHTML = `<button onclick="openAccountingReadiness()">← Reporting workspace</button><h2>Allocate draft budget by department / project</h2><p>Each save replaces the line’s allocations. Percentages can total up to 100%; the rest remains Unassigned. Submitted and approved budgets are locked against allocation changes.</p><div id="accountingAllocationLines" data-budget="${escapeAttr(id)}" data-version="${data.budget.version}">${data.lines
      .map(
        (l: { id: string; accountName: string; annual_amount: number; fundName: string }) =>
          `<form class="acct-card acct-phase-form acct-readiness-form" data-line="${escapeAttr(l.id)}" onsubmit="saveAccountingBudgetAllocation(event)"><strong>${escapeHtml(l.accountName)} · ${escapeHtml(l.fundName)} · ${accountingMoney(l.annual_amount)}</strong><p>Current shares: ${
            data.allocations
              .filter((a: { budget_line_id: string }) => a.budget_line_id === l.id)
              .map((a: { basis_points: number }) => a.basis_points / 100 + '%')
              .join(', ') || 'Unassigned 100%'
          }</p>${Array.from({ length: 4 }, () => `<div class="acct-form-grid" data-allocation><label>Department<select name="departmentId">${options('department')}</select></label><label>Project<select name="projectId">${options('project')}</select></label><label>Percent<input name="percent" type="number" min="0" max="100" step="0.01" value="0"></label></div>`).join('')}<button ${data.budget.status === 'draft' ? '' : 'disabled'}>Replace allocations</button><span role="status"></span></form>`
      )
      .join('')}</div>`;
    pane.querySelectorAll<HTMLFormElement>('form[data-line]').forEach((form) => {
      const shares = data.allocations.filter((a: { budget_line_id: string }) => a.budget_line_id === form.dataset.line);
      const original = form.querySelector<HTMLElement>('[data-allocation]')!;
      while (form.querySelectorAll('[data-allocation]').length < Math.min(100, Math.max(4, shares.length + 1)))
        original.before(original.cloneNode(true));
      form.querySelectorAll('[data-allocation]').forEach((row, i) => {
        const share = shares[i];
        if (!share) return;
        row.querySelector<HTMLSelectElement>('[name=departmentId]')!.value = share.department_id || '';
        row.querySelector<HTMLSelectElement>('[name=projectId]')!.value = share.project_id || '';
        row.querySelector<HTMLInputElement>('[name=percent]')!.value = String(share.basis_points / 100);
      });
    });
  } catch (error) {
    alert((error as Error).message);
  }
}
async function saveAccountingBudgetAllocation(event: AccountingFormEvent) {
  event.preventDefault();
  const form = event.currentTarget,
    container = document.getElementById('accountingAllocationLines')!,
    status = form.querySelector<HTMLElement>('[role=status]')!;
  const allocations = Array.from(form.querySelectorAll('[data-allocation]'))
    .map((row) => ({
      departmentId: row.querySelector<HTMLSelectElement>('[name=departmentId]')!.value,
      projectId: row.querySelector<HTMLSelectElement>('[name=projectId]')!.value,
      basisPoints: Math.round(Number(row.querySelector<HTMLInputElement>('[name=percent]')!.value) * 100),
    }))
    .filter((v) => v.basisPoints > 0);
  try {
    const data = await accountingReadinessFetch(
      '/dimensions/budgets/' +
        encodeURIComponent(container.dataset.budget!) +
        '/lines/' +
        encodeURIComponent(form.dataset.line!),
      'POST',
      { expectedVersion: Number(container.dataset.version), allocations }
    );
    container.dataset.version = String(data.budget.version);
    status.textContent = 'Budget allocations replaced.';
  } catch (error) {
    status.textContent = (error as Error).message;
  }
}
async function openAccountingDimensionReport(groupBy: string) {
  const pane = document.getElementById('accountingPane')!,
    tenant = currentParish?.parishId,
    period = accountingReportPeriod(),
    budgetId = (document.getElementById('accountingDimensionBudget') as HTMLInputElement)?.value.trim() || '';
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
    pane.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr, i) => {
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
    alert((error as Error).message);
  }
}
interface AccountingPacketData {
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
  notes?: string[];
  budgetId?: string | null;
  reconciliation?: { balanced: boolean };
}
function accountingReadinessStatement(
  id: string,
  data: AccountingPacketData,
  from: string,
  to: string,
  saved = false
): AccountingStatement {
  const config: Record<string, { title: string; columns: [string, string, boolean][] }> = {
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
async function generateAccountingCouncilPackage(button: HTMLButtonElement) {
  button.disabled = true;
  const period = accountingReportPeriod(),
    tenant = currentParish?.parishId,
    budgetId = (document.getElementById('accountingDimensionBudget') as HTMLInputElement)?.value.trim() || undefined;
  try {
    const result = await accountingReadinessFetch(
      '/report-packages/' + encodeURIComponent(button.dataset.id!) + '/generate',
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
    alert((error as Error).message);
  } finally {
    button.disabled = false;
  }
}
async function showAccountingCouncilPackage(id: string) {
  const pane = document.getElementById('accountingPane')!,
    tenant = currentParish?.parishId;
  try {
    const result = await accountingReadinessFetch('/report-packages/runs/' + encodeURIComponent(id));
    if (!accountingReadinessCurrent(pane, tenant)) return;
    const snapshot = result.snapshot;
    pane.innerHTML =
      `<button onclick="openAccountingReadiness()">← Reporting workspace</button><section class="acct-card"><h2>${escapeHtml(snapshot.name)}</h2><p>Saved ${escapeHtml(snapshot.generatedAt)}. This copy stays unchanged when bookkeeping is corrected later.</p><button class="acct-primary" id="accountingPacketDownload">Download council PDF</button><span role="status"></span></section>` +
      snapshot.sections
        .map((s: { reportId: string; data: AccountingPacketData }) =>
          accountingStatementHtml(
            accountingReadinessStatement(s.reportId, s.data, snapshot.from, snapshot.to, true),
            false
          )
        )
        .join('');
    document.getElementById('accountingPacketDownload')!.onclick = async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        const { createAccountingReportPacketPdf } =
          await import('/parish/accounting-report-pdf.js?v=20261103treasurer1');
        const bytes = await createAccountingReportPacketPdf(
          snapshot.sections.map((s: { reportId: string; data: AccountingPacketData }) =>
            accountingReadinessStatement(s.reportId, s.data, snapshot.from, snapshot.to, true)
          )
        );
        downloadBlob('agapay-council-' + snapshot.to + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
      } catch (error) {
        button.parentElement!.querySelector<HTMLElement>('[role=status]')!.textContent = (error as Error).message;
      } finally {
        button.disabled = false;
      }
    };
  } catch (error) {
    alert((error as Error).message);
  }
}
