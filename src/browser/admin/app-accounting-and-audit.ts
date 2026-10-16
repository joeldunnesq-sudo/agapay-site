import type {
  AdminAppRegistration,
  AdminAppPayload,
  AdminAppResult,
  AdminAppAuditEvent,
  AdminAppAccountingHealth,
  AdminAppIntegrityScan,
  AdminAppError,
} from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare const toggleMobileMore: AdminAppBindings['toggleMobileMore'];
declare let registrationsCache: AdminAppBindings['registrationsCache'];
declare let adminAccountingTargetsLoaded: AdminAppBindings['adminAccountingTargetsLoaded'];
declare let adminAccountingTargets: AdminAppBindings['adminAccountingTargets'];
declare const escapeAttr: AdminAppBindings['escapeAttr'];
declare const escapeHtml: AdminAppBindings['escapeHtml'];
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare let adminAccountingEnvironment: AdminAppBindings['adminAccountingEnvironment'];
declare const setStatus: AdminAppBindings['setStatus'];
declare let adminAccountingHealth: AdminAppBindings['adminAccountingHealth'];
declare const shortDate: AdminAppBindings['shortDate'];
declare const money: AdminAppBindings['money'];
declare const AUDIT_ACTION_CATALOG: AdminAppBindings['AUDIT_ACTION_CATALOG'];
declare const AUDIT_ACTOR_TYPES: AdminAppBindings['AUDIT_ACTOR_TYPES'];
declare const AUDIT_TARGET_TYPES: AdminAppBindings['AUDIT_TARGET_TYPES'];
declare let auditLogOptionsPopulated: AdminAppBindings['auditLogOptionsPopulated'];
declare let auditLogLoadedOnce: AdminAppBindings['auditLogLoadedOnce'];
declare let auditLogCursor: AdminAppBindings['auditLogCursor'];

function populateAdminAccountingParishes() {
  const select = document.getElementById('accountingOpsParish') as HTMLSelectElement | null;
  if (!select) return;
  const current = select.value;
  const registrationNames = new Map(
    registrationsCache.filter((reg) => reg.parishId).map((reg) => [reg.parishId, reg.parishName || reg.parishId])
  );
  const provisioned = adminAccountingTargetsLoaded
    ? adminAccountingTargets
    : [{ parishId: 'st-fiacre', internalCanary: false }];
  const targets = provisioned.filter(
    (target, index, rows) => target.parishId && rows.findIndex((item) => item.parishId === target.parishId) === index
  );
  const optionMarkup = (target: AdminAppRegistration) => {
    const label = registrationNames.get(target.parishId) || target.parishId;
    return `<option value="${escapeAttr(target.parishId)}">${escapeHtml(label)} · ${escapeHtml(target.parishId)}</option>`;
  };
  const parishes = targets.filter((target) => !target.internalCanary),
    fixtures = targets.filter((target) => target.internalCanary);
  const parishGroup = parishes.length
    ? `<optgroup label="Provisioned parishes">${parishes.map(optionMarkup).join('')}</optgroup>`
    : '';
  const fixtureGroup = fixtures.length
    ? `<optgroup label="Internal monitoring fixtures">${fixtures.map((target) => `<option value="${escapeAttr(target.parishId)}">Phase G integrity canary · ${escapeHtml(target.parishId)}</option>`).join('')}</optgroup>`
    : '';
  select.innerHTML = `<option value="">${targets.length ? 'Select a target' : 'No provisioned accounting targets'}</option>${parishGroup}${fixtureGroup}`;
  select.disabled = !targets.length;
  select.setAttribute('aria-busy', 'false');
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

async function loadAdminAccountingTargets({ silent = false }: { silent?: boolean } = {}) {
  const select = document.getElementById('accountingOpsParish') as HTMLSelectElement | null;
  if (select) select.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/admin/accounting/targets', { headers: authHeaders() }),
      payload = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, payload)) return false;
    if (!response.ok)
      throw new Error(payload.message || payload.error || 'Unable to load provisioned accounting targets.');
    adminAccountingTargets = Array.isArray(payload.targets) ? payload.targets : [];
    adminAccountingTargetsLoaded = true;
    adminAccountingEnvironment = String(payload.environment || '')
      .trim()
      .toLowerCase();
    const activation = document.getElementById('accountingPreparedActivation');
    if (activation) activation.hidden = !adminAccountingEnvironment || adminAccountingEnvironment === 'production';
    populateAdminAccountingParishes();
    return true;
  } catch (error) {
    if (select) select.setAttribute('aria-busy', 'false');
    if (!silent) setStatus((error as AdminAppError).message, 'error');
    return false;
  }
}

function selectedAdminAccountingTarget() {
  const parishId = adminAccountingParish();
  return adminAccountingTargets.find((target) => target.parishId === parishId) || null;
}

function adminAccountingParish() {
  return (document.getElementById('accountingOpsParish') as HTMLSelectElement | null)?.value || '';
}

async function adminAccountingFetch(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
  const parishId = adminAccountingParish();
  if (!parishId) throw new Error('Select a parish first.');
  const method = options.method || 'GET',
    url = method === 'GET' ? `${path}?parishId=${encodeURIComponent(parishId)}` : path,
    body = method === 'GET' ? undefined : JSON.stringify({ parishId, ...(options.body || {}) }),
    response = await fetch(url, {
      method,
      headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      body,
    }),
    payload = await response.json().catch(() => ({}));
  if (handleAuthFailure(response, payload)) throw new Error('Admin session expired.');
  if (!response.ok) throw new Error(payload.message || payload.error || 'Accounting operation failed.');
  return payload;
}

async function activateAdminPreparedAccounting(btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    await adminAccountingFetch('/api/admin/accounting/activate-prepared', { method: 'POST' });
    await loadAdminAccountingOperations();
    setStatus('Prepared staging accounting database activated.', 'success');
  } catch (error) {
    setStatus((error as AdminAppError).message, 'error');
    const status = document.getElementById('accountingOpsStatus');
    if (status) status.textContent = (error as AdminAppError).message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function loadAdminAccountingOperations() {
  const parishId = adminAccountingParish(),
    status = document.getElementById('accountingOpsStatus'),
    target = selectedAdminAccountingTarget();
  if (!parishId) {
    if (status) status.textContent = 'Select a target to load accounting health.';
    return;
  }
  if (status)
    status.textContent = target?.internalCanary
      ? 'Loading the internal integrity canary…'
      : 'Loading parish accounting operations…';
  try {
    const [health, scans, recovery] = await Promise.all([
      adminAccountingFetch('/api/admin/accounting/health'),
      adminAccountingFetch('/api/admin/accounting/integrity-scans'),
      adminAccountingFetch('/api/admin/accounting/recovery-verifications'),
    ]);
    adminAccountingHealth = health.health || null;
    renderAdminAccountingHealth(health.health || {});
    renderAdminIntegrityScans(scans.scans || []);
    renderAdminRecoveryVerifications(recovery.verifications || []);
    status!.textContent = target?.internalCanary
      ? `Loaded internal monitoring fixture ${parishId}. It contains synthetic operational data, not customer parish data.`
      : `Loaded ${parishId}.`;
  } catch (error) {
    status!.textContent = (error as AdminAppError).message;
    setStatus((error as AdminAppError).message, 'error');
  }
}

function renderAdminAccountingHealth(health: AdminAppAccountingHealth) {
  const box = document.getElementById('accountingOpsHealth'),
    protective = health.protectiveState || {},
    target = selectedAdminAccountingTarget();
  if (!box) return;
  const targetType = target?.internalCanary ? 'Internal monitoring fixture' : 'Provisioned parish';
  const fixtureNote = target?.internalCanary
    ? '<p class="muted"><strong>Internal fixture:</strong> Actions here affect the scheduled integrity-monitoring canary only; no customer parish data is involved.</p>'
    : '';
  box.innerHTML = `<div class="fields-grid"><div class="field"><div class="field-key">Target type</div><div class="field-val">${targetType}</div></div><div class="field"><div class="field-key">Registry health</div><div class="field-val">${escapeHtml(String(target?.healthStatus || 'unknown').replaceAll('_', ' '))}</div></div><div class="field"><div class="field-key">Health</div><div class="field-val">${escapeHtml(String(health.status || 'unknown').replaceAll('_', ' '))}</div></div><div class="field"><div class="field-key">Protective state</div><div class="field-val">${escapeHtml(String(protective.state || 'unknown').replaceAll('_', ' '))} · version ${Number(protective.version || 0)}</div></div><div class="field"><div class="field-key">Open findings</div><div class="field-val">${(health.findings || []).length}</div></div><div class="field"><div class="field-key">Active work</div><div class="field-val">${Number(health.activeWork || 0)}</div></div></div>${fixtureNote}<p class="muted">${escapeHtml(protective.safeSummary || 'No protective restriction is active.')}</p><p class="muted">${escapeHtml(health.disclaimer || '')}</p>`;
}

function renderAdminIntegrityScans(scans: AdminAppIntegrityScan[]) {
  const box = document.getElementById('accountingOpsScans');
  if (!box) return;
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Started</th><th>Type / scope</th><th>Status</th><th>Checks</th><th>Findings</th></tr></thead><tbody>${scans.map((scan) => `<tr><td>${escapeHtml(shortDate(scan.startedAt || scan.completedAt))}</td><td>${escapeHtml(scan.scanType)} · ${escapeHtml(scan.scope)}</td><td>${escapeHtml(scan.status)}</td><td>${Number(scan.checksPassed || 0)} passed / ${Number(scan.checksFailed || 0)} failed</td><td>${Number(scan.findingCount || 0)} total · ${Number(scan.criticalFindingCount || 0)} critical</td></tr>`).join('') || '<tr><td colspan="5">No integrity scans.</td></tr>'}</tbody></table></div>`;
}

function renderAdminRecoveryVerifications(rows: AdminAppResult[]) {
  const box = document.getElementById('accountingOpsRecovery');
  if (!box) return;
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Verified</th><th>Type</th><th>Artifact</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(shortDate(row.verifiedAt))}</td><td>${escapeHtml(row.verificationType)}</td><td>${escapeHtml(row.artifactReference || '—')}</td><td>${escapeHtml(row.status)}</td></tr>`).join('') || '<tr><td colspan="4">No recovery verifications.</td></tr>'}</tbody></table></div>`;
}

async function runAdminIntegrityScan(btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    await adminAccountingFetch('/api/admin/accounting/integrity-scan', {
      method: 'POST',
      body: {
        scanType: 'manual',
        scope: (document.getElementById('accountingScanScope') as HTMLSelectElement | null)!.value,
        correlationId: `admin-${Date.now()}`,
      },
    });
    await loadAdminAccountingOperations();
    setStatus('Integrity scan completed.', 'success');
  } catch (error) {
    setStatus((error as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function changeAdminProtectiveState(release: boolean, btn?: HTMLButtonElement | null) {
  const parishId = adminAccountingParish(),
    confirmation = (document.getElementById('accountingProtectiveConfirm') as HTMLInputElement | null)!.value.trim(),
    reason = (document.getElementById('accountingProtectiveReason') as HTMLInputElement | null)!.value.trim(),
    state = (document.getElementById('accountingProtectiveState') as HTMLSelectElement | null)!.value;
  if (!parishId || confirmation !== parishId) {
    setStatus('Type the exact parish ID to confirm this protective-state change.', 'error');
    return;
  }
  if (!reason) {
    setStatus('A free-text reason is required.', 'error');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const expectedVersion = adminAccountingHealth?.protectiveState?.version;
    if (release)
      await adminAccountingFetch('/api/admin/accounting/protective-state/release', {
        method: 'POST',
        body: { expectedVersion, reason },
      });
    else
      await adminAccountingFetch('/api/admin/accounting/protective-state', {
        method: 'POST',
        body: { state, reasonCode: reason, safeSummary: reason, expectedVersion },
      });
    (document.getElementById('accountingProtectiveConfirm') as HTMLInputElement | null)!.value = '';
    await loadAdminAccountingOperations();
    setStatus(release ? 'Protective state released.' : 'Protective state updated.', 'success');
  } catch (error) {
    setStatus((error as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function verifyAdminRecoveryEvidence(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement,
    raw: Record<string, unknown> = Object.fromEntries(new FormData(form));
  try {
    raw.manifest = JSON.parse(raw.manifest as string);
    await adminAccountingFetch('/api/admin/accounting/recovery-verification', {
      method: 'POST',
      body: { ...raw, correlationId: `admin-recovery-${Date.now()}` },
    });
    form!.reset();
    await loadAdminAccountingOperations();
    setStatus('Recovery evidence verification completed.', 'success');
  } catch (error) {
    setStatus((error as AdminAppError).message, 'error');
  }
}

async function loadAdminNonprofitPricing(btn?: HTMLButtonElement | null) {
  const tableBody = document.getElementById('nonprofitPricingTableBody');
  const cards = document.getElementById('nonprofitPricingSummaryCards');
  if (!tableBody || !cards) return;
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const response = await fetch('/api/admin/nonprofit-pricing', { headers: authHeaders() });
    const data = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, data)) return;
    if (!response.ok) throw new Error(data.error || 'Unable to load nonprofit-pricing thresholds');
    const totals = data.totals || {};
    cards.innerHTML = [
      ['Monitored', totals.monitored || 0, 'Connected parish accounts'],
      ['Watch', totals.watch || 0, '15–17.49% exposure'],
      ['Near threshold', totals.near || 0, '17.5–19.99% exposure'],
      ['At or over 20%', totals.breached || 0, 'Immediate review'],
    ]
      .map(
        ([label, value, note]) =>
          `<article class="revenue-card"><div class="revenue-label">${escapeHtml(label)}</div><div class="revenue-value">${Number(value).toLocaleString()}</div><div class="revenue-meta">${escapeHtml(note)}</div></article>`
      )
      .join('');
    const parishes = data.parishes || [];
    tableBody.innerHTML = parishes.length
      ? parishes
          .map((parish) => {
            const exposure = Number(parish.risk?.thresholdExposurePercent || 0);
            const width = Math.max(0, Math.min(100, (exposure / 20) * 100));
            const color =
              parish.risk?.riskBand === 'breached'
                ? '#8a2828'
                : parish.risk?.riskBand === 'near'
                  ? '#b66a1c'
                  : parish.risk?.riskBand === 'watch'
                    ? '#c49a3e'
                    : '#2f6e55';
            return `<tr>
            <td><strong>${escapeHtml(parish.parishName)}</strong><br><small>${escapeHtml(parish.parishId)}</small></td>
            <td>${escapeHtml(String(parish.applicationStatus || 'not_started').replaceAll('_', ' '))}</td>
            <td>${Number(parish.volume?.donationPercent || 0).toFixed(2)}%<br><small>${money(parish.volume?.donationNetCents || 0)}</small></td>
            <td>${Number(parish.risk?.classifiedNonDonationPercent || 0).toFixed(2)}%<br><small>${money(parish.volume?.nonDonationNetCents || 0)}</small></td>
            <td>${money(parish.volume?.unclassifiedNetCents || 0)}</td>
            <td style="min-width:240px;"><div style="height:10px;background:#e8e2d5;border-radius:999px;overflow:hidden;"><div style="height:100%;width:${width}%;background:${color};"></div></div><small>${exposure.toFixed(2)}% of 20% · ${Number(parish.risk?.headroomPercent || 0).toFixed(2)} points left<br>Current capacity: ${money(parish.risk?.additionalNonDonationCapacityCents || 0)}</small><div style="display:flex;gap:6px;margin-top:6px;"><input type="number" min="0" step="0.01" placeholder="Planned non-donation $" style="width:145px;" oninput="calculateNonprofitProjection(this,${Number(parish.volume?.totalNetCents || 0)},${Number(parish.risk?.thresholdExposureCents || 0)})"><small class="nonprofit-projection-result"></small></div></td>
            <td><span class="status-badge status-${escapeAttr(parish.risk?.riskBand || 'safe')}">${escapeHtml(parish.risk?.riskBand || 'safe')}</span></td>
            <td>${parish.volume?.scan?.complete ? 'Complete' : 'Incomplete'}<br><small>${escapeHtml(shortDate(parish.volume?.scan?.lastCompletedAt) || '')}</small></td>
          </tr>`;
          })
          .join('')
      : '<tr><td colspan="8"><div class="revenue-empty">No connected parish Stripe accounts are available.</div></td></tr>';
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="8"><div class="revenue-empty">${escapeHtml((err as AdminAppError).message)}</div></td></tr>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

function calculateNonprofitProjection(
  input: HTMLInputElement,
  currentTotalCents: number,
  currentExposureCents: number
) {
  const addedCents = Math.max(0, Math.round((Number(input.value) || 0) * 100));
  const projectedTotal = Number(currentTotalCents || 0) + addedCents;
  const projectedExposure = Number(currentExposureCents || 0) + addedCents;
  const percent = projectedTotal ? (projectedExposure / projectedTotal) * 100 : 0;
  const output = input.parentElement?.querySelector<HTMLElement>('.nonprofit-projection-result');
  if (output) output.textContent = input.value ? `${percent.toFixed(2)}% projected` : '';
}

async function runNonprofitPricingAlerts(btn?: HTMLButtonElement | null) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const response = await fetch('/api/admin/nonprofit-pricing/alerts/run', { method: 'POST', headers: authHeaders() });
    const data = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, data)) return;
    if (!response.ok) throw new Error(data.error || 'Unable to run threshold alerts');
    setStatus(`Threshold alert check complete. ${Number(data.result?.sent || 0)} email alert(s) sent.`, 'success');
    await loadAdminNonprofitPricing();
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

function auditActionLabel(action: string) {
  const entry = AUDIT_ACTION_CATALOG.find((a) => a.value === action);
  return entry ? entry.label : action || 'Unknown action';
}

function auditActorTypeLabel(value: unknown) {
  const entry = AUDIT_ACTOR_TYPES.find((t) => t.value === value);
  return entry ? entry.label : value || '';
}

function auditTargetTypeLabel(value: unknown) {
  const entry = AUDIT_TARGET_TYPES.find((t) => t.value === value);
  return entry ? entry.label : value || '—';
}

function populateAuditLogFilterOptions() {
  if (auditLogOptionsPopulated) return;
  auditLogOptionsPopulated = true;

  const actionSelect = document.getElementById('auditLogAction') as HTMLSelectElement | null;
  if (actionSelect) {
    const groups: Record<string, (typeof AUDIT_ACTION_CATALOG)[number][]> = {};
    AUDIT_ACTION_CATALOG.forEach((a) => {
      (groups[a.group] = groups[a.group] || []).push(a);
    });
    actionSelect.innerHTML =
      '<option value="">All actions</option>' +
      Object.keys(groups)
        .map(
          (groupName) => `
          <optgroup label="${escapeAttr(groupName)}">
            ${groups[groupName].map((a) => `<option value="${escapeAttr(a.value)}" title="${escapeAttr(a.description)}">${escapeHtml(a.label)}</option>`).join('')}
          </optgroup>
        `
        )
        .join('');
  }

  const actorTypeSelect = document.getElementById('auditLogActorType') as HTMLSelectElement | null;
  if (actorTypeSelect) {
    actorTypeSelect.innerHTML =
      '<option value="">All actor types</option>' +
      AUDIT_ACTOR_TYPES.map(
        (t) =>
          `<option value="${escapeAttr(t.value)}" title="${escapeAttr(t.description)}">${escapeHtml(t.label)}</option>`
      ).join('');
  }

  const targetTypeSelect = document.getElementById('auditLogTargetType') as HTMLSelectElement | null;
  if (targetTypeSelect) {
    targetTypeSelect.innerHTML =
      '<option value="">All target types</option>' +
      AUDIT_TARGET_TYPES.map(
        (t) =>
          `<option value="${escapeAttr(t.value)}" title="${escapeAttr(t.description)}">${escapeHtml(t.label)}</option>`
      ).join('');
  }

  const actorLegend = document.getElementById('auditLogActorTypeLegend');
  if (actorLegend) {
    actorLegend.innerHTML = AUDIT_ACTOR_TYPES.map(
      (t) =>
        `<div><strong style="color:var(--ink,inherit);">${escapeHtml(t.label)}</strong> — ${escapeHtml(t.description)}</div>`
    ).join('');
  }
  const targetLegend = document.getElementById('auditLogTargetTypeLegend');
  if (targetLegend) {
    targetLegend.innerHTML = AUDIT_TARGET_TYPES.map(
      (t) =>
        `<div><strong style="color:var(--ink,inherit);">${escapeHtml(t.label)}</strong> — ${escapeHtml(t.description)}</div>`
    ).join('');
  }
  const actionLegend = document.getElementById('auditLogActionLegend');
  if (actionLegend) {
    const groups: Record<string, (typeof AUDIT_ACTION_CATALOG)[number][]> = {};
    AUDIT_ACTION_CATALOG.forEach((a) => {
      (groups[a.group] = groups[a.group] || []).push(a);
    });
    actionLegend.innerHTML = Object.keys(groups)
      .map(
        (groupName) => `
          <div style="margin-bottom:0.5rem;">
            <div style="font-weight:600;color:var(--ink,inherit);">${escapeHtml(groupName)}</div>
            ${groups[groupName].map((a) => `<div style="padding-left:0.75rem;">${escapeHtml(a.label)} — ${escapeHtml(a.description)}</div>`).join('')}
          </div>
        `
      )
      .join('');
  }

  refreshAuditLogOrgOptions();
}

function refreshAuditLogOrgOptions() {
  const list = document.getElementById('auditLogOrgList');
  if (!list || !Array.isArray(registrationsCache) || !registrationsCache.length) return;
  const seen = new Set<string>();
  list.innerHTML = registrationsCache
    .filter((item) => item.parishId && !seen.has(item.parishId) && seen.add(item.parishId))
    .map(
      (item) => `<option value="${escapeAttr(item.parishId)}">${escapeHtml(item.parishName || item.parishId)}</option>`
    )
    .join('');
}

function setAuditLogQuickRange(days: number) {
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const toLocalInputValue = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const sinceEl = document.getElementById('auditLogSince') as HTMLInputElement | null;
  const untilEl = document.getElementById('auditLogUntil') as HTMLInputElement | null;
  if (sinceEl) sinceEl.value = toLocalInputValue(since);
  if (untilEl) untilEl.value = toLocalInputValue(until);
  loadAuditLog(true);
}

function resetAuditLogFilters() {
  [
    'auditLogAction',
    'auditLogActorType',
    'auditLogActor',
    'auditLogTargetType',
    'auditLogTargetId',
    'auditLogOrganization',
    'auditLogSince',
    'auditLogUntil',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = '';
  });
  loadAuditLog(true);
}

function auditActionBadgeClass(action: string) {
  if (!action) return 'not_configured';
  if (action.includes('status_changed') || action.includes('active_changed')) return 'pending';
  if (
    action.includes('rebuild') ||
    action.includes('default') ||
    action.includes('module_assigned') ||
    action.includes('renamed')
  )
    return 'active';
  return 'not_configured';
}

function renderAuditLogTable(events: AdminAppAuditEvent[], append: boolean) {
  const wrap = document.getElementById('auditLogTableWrap');
  if (!wrap) return;
  if (!append && events.length === 0) {
    wrap.innerHTML = '<div class="revenue-empty">No audit events match these filters yet.</div>';
    return;
  }
  const rows = events
    .map(
      (event) => `
        <tr>
          <td style="white-space:nowrap;font-size:12px;color:var(--muted);">${escapeHtml(new Date(event.createdAt + 'Z').toUTCString().replace(' GMT', ' UTC'))}</td>
          <td><span class="badge ${escapeAttr(auditActionBadgeClass(event.action!))}" title="${escapeAttr(event.action || '')}">${escapeHtml(auditActionLabel(event.action!))}</span></td>
          <td style="font-size:12px;">${escapeHtml(event.actorUserId || '—')}<br><span class="muted" style="font-size:10px;">${escapeHtml(auditActorTypeLabel(event.actorType))}</span></td>
          <td style="font-size:12px;">${escapeHtml(auditTargetTypeLabel(event.targetType))}${event.targetId ? '<br><span class="muted" style="font-size:10px;">' + escapeHtml(event.targetId) + '</span>' : ''}</td>
          <td style="font-size:12px;">${escapeHtml(event.organizationId || '—')}</td>
          <td style="font-size:11px;color:var(--stone);max-width:220px;">${event.before ? '<div><strong>before:</strong> ' + escapeHtml(JSON.stringify(event.before)) + '</div>' : ''}${event.after ? '<div><strong>after:</strong> ' + escapeHtml(JSON.stringify(event.after)) + '</div>' : ''}${event.reason ? '<div><strong>reason:</strong> ' + escapeHtml(event.reason) + '</div>' : ''}</td>
        </tr>
      `
    )
    .join('');
  const table = `
        <div style="overflow-x:auto;">
          <table class="admin-table" style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);">
                <th style="padding:0.5rem 0.6rem;">When</th>
                <th style="padding:0.5rem 0.6rem;">Action</th>
                <th style="padding:0.5rem 0.6rem;">Actor</th>
                <th style="padding:0.5rem 0.6rem;">Target</th>
                <th style="padding:0.5rem 0.6rem;">Organization</th>
                <th style="padding:0.5rem 0.6rem;">Detail</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
  if (append) {
    wrap.insertAdjacentHTML('beforeend', table);
  } else {
    wrap.innerHTML = table;
  }
}

async function loadAuditLog(reset: boolean, btn?: HTMLButtonElement | null) {
  auditLogLoadedOnce = true;
  if (reset) auditLogCursor = '';
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  const params = new URLSearchParams();
  const action = (document.getElementById('auditLogAction') as HTMLSelectElement | null)?.value.trim();
  const actorType = (document.getElementById('auditLogActorType') as HTMLSelectElement | null)?.value.trim();
  const actor = (document.getElementById('auditLogActor') as HTMLInputElement | null)?.value.trim();
  const targetType = (document.getElementById('auditLogTargetType') as HTMLSelectElement | null)?.value.trim();
  const targetId = (document.getElementById('auditLogTargetId') as HTMLInputElement | null)?.value.trim();
  const organization = (document.getElementById('auditLogOrganization') as HTMLInputElement | null)?.value.trim();
  const since = (document.getElementById('auditLogSince') as HTMLInputElement | null)?.value;
  const until = (document.getElementById('auditLogUntil') as HTMLInputElement | null)?.value;
  if (action) params.set('action', action);
  if (actorType) params.set('actorType', actorType);
  if (actor) params.set('actor', actor);
  if (targetType) params.set('targetType', targetType);
  if (targetId) params.set('targetId', targetId);
  if (organization) params.set('organization', organization);
  if (since) params.set('since', new Date(since).toISOString());
  if (until) params.set('until', new Date(until).toISOString());
  if (auditLogCursor) params.set('cursor', auditLogCursor);

  try {
    const response = await fetch('/api/admin/audit-log?' + params.toString(), { headers: authHeaders() });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to load audit log');

    renderAuditLogTable(result.events || [], !reset);
    auditLogCursor = result.cursor || '';
    const moreBtn = document.getElementById('auditLogMoreBtn') as HTMLButtonElement | null;
    if (moreBtn) moreBtn.style.display = result.hasMore ? '' : 'none';
    const countEl = document.getElementById('auditLogCount');
    if (countEl) countEl.textContent = (result.events || []).length + (reset ? '' : ' more') + ' event(s) shown';
  } catch (err) {
    const wrap = document.getElementById('auditLogTableWrap');
    if (wrap && reset)
      wrap.innerHTML = '<div class="revenue-empty">' + escapeHtml((err as AdminAppError).message) + '</div>';
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
declare let activeTab: AdminAppBindings['activeTab'];
declare const loadLearnAdmin: AdminAppBindings['loadLearnAdmin'];
declare const loadParishSupportTickets: AdminAppBindings['loadParishSupportTickets'];

function switchTab(tab: string) {
  if (tab === 'queue') tab = 'giving';
  document.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => p.classList.remove('active'));
  document
    .querySelectorAll<HTMLElement>('.sidebar-nav-item, .mobile-tab-link')
    .forEach((n) => n.classList.remove('active'));
  const panel = document.getElementById('tab-' + tab);
  const nav = document.getElementById('nav-' + tab);
  const mobileNav = document.querySelector<HTMLElement>(`.mobile-tab-link[data-nav-tab="${tab}"]`);
  if (panel) panel.classList.add('active');
  if (nav) nav.classList.add('active');
  const navToolbox = nav?.closest<HTMLDetailsElement>('.sidebar-toolbox');
  if (navToolbox) navToolbox.open = true;
  if (mobileNav) mobileNav.classList.add('active');
  activeTab = tab;
  const titles: Record<string, string> = {
    overview: 'Today',
    giving: 'Parish Onboarding',
    learn: 'AGAPAY Learn',
    marketplace: 'AGAPAY Marketplace',
    directory: 'AGAPAY Directory',
    support: 'Support Inbox',
    taxexemptions: 'Tax Exemption Review',
    nonprofitpricing: 'Stripe Nonprofit Pricing',
    auditlog: 'Audit Log',
    accountingops: 'Accounting Health',
    settings: 'Settings',
    developer: 'Developer Tools',
  };
  const descriptions: Record<string, string> = {
    overview: 'What needs your attention today.',
    giving: 'Complete the next required action for one parish at a time.',
    learn: 'Subscriptions, scholarships, feedback, and community review.',
    marketplace: 'Marketplace readiness and seller activity.',
    directory: 'Directory participation and publication health.',
    support: 'Questions and requests waiting for a response.',
    taxexemptions: 'Review documentation and Stripe tax synchronization.',
    nonprofitpricing: 'Monitor nonprofit rate applications and thresholds.',
    auditlog: 'Trace sensitive administrative changes.',
    accountingops: 'Integrity, protective state, and recovery controls.',
    settings: 'Security and platform configuration.',
    developer: 'Low-frequency maintenance and manual tools.',
  };
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = titles[tab] || 'Admin Console';
  const descriptionEl = document.getElementById('topbarDescription');
  if (descriptionEl) descriptionEl.textContent = descriptions[tab] || '';
  toggleMobileMore(false);
  document.querySelector<HTMLElement>('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  if (tab === 'learn') loadLearnAdmin();
  if (tab === 'support') loadParishSupportTickets();
  if (tab === 'taxexemptions') {
    loadTaxExemptionSummary();
    loadTaxExemptions();
  }
  if (tab === 'accountingops') loadAdminAccountingTargets({ silent: true }).then(() => loadAdminAccountingOperations());
  if (tab === 'nonprofitpricing') loadAdminNonprofitPricing();
  if (tab === 'auditlog') {
    populateAuditLogFilterOptions();
    refreshAuditLogOrgOptions();
    if (!auditLogLoadedOnce) loadAuditLog(true);
  }
}
export type AdminAppPart8 = {
  switchTab: typeof switchTab;
  populateAdminAccountingParishes: typeof populateAdminAccountingParishes;
  loadAdminAccountingTargets: typeof loadAdminAccountingTargets;
  selectedAdminAccountingTarget: typeof selectedAdminAccountingTarget;
  adminAccountingParish: typeof adminAccountingParish;
  adminAccountingFetch: typeof adminAccountingFetch;
  activateAdminPreparedAccounting: typeof activateAdminPreparedAccounting;
  loadAdminAccountingOperations: typeof loadAdminAccountingOperations;
  renderAdminAccountingHealth: typeof renderAdminAccountingHealth;
  renderAdminIntegrityScans: typeof renderAdminIntegrityScans;
  renderAdminRecoveryVerifications: typeof renderAdminRecoveryVerifications;
  runAdminIntegrityScan: typeof runAdminIntegrityScan;
  changeAdminProtectiveState: typeof changeAdminProtectiveState;
  verifyAdminRecoveryEvidence: typeof verifyAdminRecoveryEvidence;
  loadAdminNonprofitPricing: typeof loadAdminNonprofitPricing;
  calculateNonprofitProjection: typeof calculateNonprofitProjection;
  runNonprofitPricingAlerts: typeof runNonprofitPricingAlerts;
  auditActionLabel: typeof auditActionLabel;
  auditActorTypeLabel: typeof auditActorTypeLabel;
  auditTargetTypeLabel: typeof auditTargetTypeLabel;
  populateAuditLogFilterOptions: typeof populateAuditLogFilterOptions;
  refreshAuditLogOrgOptions: typeof refreshAuditLogOrgOptions;
  setAuditLogQuickRange: typeof setAuditLogQuickRange;
  resetAuditLogFilters: typeof resetAuditLogFilters;
  auditActionBadgeClass: typeof auditActionBadgeClass;
  renderAuditLogTable: typeof renderAuditLogTable;
  loadAuditLog: typeof loadAuditLog;
};
