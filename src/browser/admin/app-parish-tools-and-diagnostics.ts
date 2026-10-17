import type {
  AdminAppDeploymentHealth,
  AdminAppPayload,
  AdminAppResult,
  AdminAppDeploymentCheck,
  AdminAppError,
} from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const setStatus: AdminAppBindings['setStatus'];
declare const renderPlatformGrowth: AdminAppBindings['renderPlatformGrowth'];
declare const computeLocalPlatformSummary: AdminAppBindings['computeLocalPlatformSummary'];
declare let registrationsCache: AdminAppBindings['registrationsCache'];
declare const escapeHtml: AdminAppBindings['escapeHtml'];

async function seedDemoParish(btn?: HTMLButtonElement | null) {
  const status = document.getElementById('seedDemoStatus');
  const parishInput = document.getElementById('seedDemoParishId') as HTMLInputElement | null;
  const parishId = (parishInput?.value || '').trim();
  if (!parishId) {
    if (status) {
      status.textContent = 'Enter the parish dashboard ID first.';
      status.style.color = 'var(--red, #8b2020)';
    }
    parishInput?.focus();
    return;
  }
  btn!.disabled = true;
  btn!.textContent = 'Seeding...';
  if (status) status.textContent = '';
  try {
    const res = await fetch('/api/admin/seed-demo', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parishId }),
    });
    const data = (await res.json().catch(() => ({}))) as AdminAppPayload;
    if (!res.ok || !data.ok) throw new Error(data.error || 'Seed failed');
    btn!.textContent = 'Seeded';
    if (status) {
      status.textContent = `${data.message || 'Demo data seeded.'} Dashboard: ${data.dashboardUrl || '/parish/dashboard'} · Give: ${data.giveUrl || `/give/${parishId}`}`;
      status.style.color = 'var(--green, #2a7a4b)';
    }
  } catch (err) {
    btn!.disabled = false;
    btn!.textContent = 'Seed demo data';
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    btn!.disabled = false;
  }
}

function weeklyCommemorationSummary(results: AdminAppResult[] = [], dryRun: boolean = true) {
  if (!results.length) return 'No matching parish was found for that dashboard ID.';
  return results
    .map((row) => {
      if (row.status === 'skipped') {
        return `${row.parishName || row.parishId}: skipped (${row.reason || 'not eligible'}).`;
      }
      const counts = `${Number(row.entryCount || 0)} submissions, ${Number(row.livingCount || 0)} living names, ${Number(row.departedCount || 0)} departed names`;
      const destination = row.to ? ` to ${row.to}` : '';
      const action = dryRun ? 'Ready to send' : row.status === 'sent' ? 'Sent' : `Result: ${row.status || 'unknown'}`;
      return `${action}${destination} for ${row.parishName || row.parishId}: ${counts}.`;
    })
    .join(' ');
}

async function runWeeklyCommemorationEmail(dryRun: boolean, btn?: HTMLButtonElement | null) {
  const status = document.getElementById('weeklyCommemorationStatus');
  const parishInput = document.getElementById('weeklyCommemorationParishId') as HTMLInputElement | null;
  const parishId = (parishInput?.value || '').trim();
  if (!parishId) {
    if (status) {
      status.textContent = 'Enter the parish dashboard ID first.';
      status.style.color = 'var(--red, #8b2020)';
    }
    parishInput?.focus();
    return;
  }
  if (!dryRun && !window.confirm(`Send this week's commemoration email for ${parishId} now?`)) return;

  const previewBtn = document.getElementById('weeklyCommemorationPreviewBtn') as HTMLButtonElement | null;
  const sendBtn = document.getElementById('weeklyCommemorationSendBtn') as HTMLButtonElement | null;
  if (previewBtn) previewBtn.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  if (btn) {
    btn.classList.add('loading');
    btn.textContent = dryRun ? 'Previewing...' : 'Sending...';
  }
  if (status) {
    status.textContent = dryRun ? "Checking this week's submissions..." : 'Sending weekly commemoration email...';
    status.style.color = 'var(--muted)';
  }

  try {
    const response = await fetch('/api/admin/commemorations/send-weekly', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ parishId, dryRun }),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to run weekly commemoration email');
    const message = weeklyCommemorationSummary(result.results || [], result.dryRun);
    if (status) {
      status.textContent = message;
      status.style.color = result.dryRun ? 'var(--deep)' : 'var(--green, #2a7a4b)';
    }
    setStatus(
      result.dryRun ? 'Weekly commemoration email preview loaded.' : 'Weekly commemoration email sent.',
      'success'
    );
  } catch (err) {
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.style.color = 'var(--red, #8b2020)';
    }
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (previewBtn) previewBtn.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (btn) {
      btn.classList.remove('loading');
      btn.textContent = dryRun ? 'Preview email' : 'Send email now';
    }
  }
}

function moneyPlain(cents: unknown) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function weeklyTreasurerSummary(results: AdminAppResult[] = [], dryRun: boolean = true) {
  if (!results.length) return 'No matching bookstore-enabled parish was found for that dashboard ID.';
  return results
    .map((row) => {
      if (row.status === 'skipped') {
        const reason =
          row.reason === 'already_sent'
            ? 'already sent for this week'
            : row.reason === 'no_paid_orders'
              ? 'no paid bookstore orders in this week window'
              : row.reason || 'not eligible';
        return `${row.parishName || row.parishId}: skipped (${reason}).`;
      }
      const destination = row.to ? ` to ${row.to}` : '';
      const action = dryRun ? 'Ready to send' : row.status === 'sent' ? 'Sent' : `Result: ${row.status || 'unknown'}`;
      return `${action}${destination} for ${row.parishName || row.parishId}: ${Number(row.orderCount || 0)} orders, ${moneyPlain(row.totalChargedCents)} gross, ${moneyPlain(row.taxCents)} tax, ${moneyPlain(row.parishNetCents)} parish net.`;
    })
    .join(' ');
}

async function runWeeklyTreasurerEmail(dryRun: boolean, btn?: HTMLButtonElement | null) {
  const status = document.getElementById('weeklyTreasurerStatus');
  const parishInput = document.getElementById('weeklyTreasurerParishId') as HTMLInputElement | null;
  const parishId = (parishInput?.value || '').trim();
  if (!parishId) {
    if (status) {
      status.textContent = 'Enter the parish dashboard ID first.';
      status.style.color = 'var(--red, #8b2020)';
    }
    parishInput?.focus();
    return;
  }
  if (!dryRun && !window.confirm(`Send this week's bookstore treasurer report for ${parishId} now?`)) return;

  const previewBtn = document.getElementById('weeklyTreasurerPreviewBtn') as HTMLButtonElement | null;
  const sendBtn = document.getElementById('weeklyTreasurerSendBtn') as HTMLButtonElement | null;
  if (previewBtn) previewBtn.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  if (btn) {
    btn.classList.add('loading');
    btn.textContent = dryRun ? 'Previewing...' : 'Sending...';
  }
  if (status) {
    status.textContent = dryRun
      ? "Checking this week's paid bookstore orders..."
      : 'Sending weekly treasurer report...';
    status.style.color = 'var(--muted)';
  }

  try {
    const response = await fetch('/api/admin/commerce/send-weekly-treasurer', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ parishId, dryRun, force: !dryRun }),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to run weekly treasurer report');
    const message = weeklyTreasurerSummary(result.results || [], result.dryRun);
    if (status) {
      status.textContent = message;
      status.style.color = result.dryRun ? 'var(--deep)' : 'var(--green, #2a7a4b)';
    }
    setStatus(result.dryRun ? 'Weekly treasurer report preview loaded.' : 'Weekly treasurer report sent.', 'success');
  } catch (err) {
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.style.color = 'var(--red, #8b2020)';
    }
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (previewBtn) previewBtn.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (btn) {
      btn.classList.remove('loading');
      btn.textContent = dryRun ? 'Preview report' : 'Send report now';
    }
  }
}

async function loadStewardshipCompStatus() {
  const counter = document.getElementById('stewardshipCompCounter');
  if (!counter) return;
  try {
    const res = await fetch('/api/admin/stewardship/comp-status', { headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as AdminAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to load comp status');
    counter.textContent = `${data.claimed} of ${data.limit} claimed — ${data.remaining} remaining`;
    counter.style.color = data.remaining! > 0 ? 'var(--green, #2a7a4b)' : 'var(--red, #8b2020)';
  } catch (err) {
    counter.textContent = 'Unable to load claimed count: ' + (err as AdminAppError).message;
    counter.style.color = 'var(--red, #8b2020)';
  }
}

// Shared core used by both the Developer Tools card and the per-parish
// "Grant free year" shortcut in the registration detail view. Returns
// the parsed response so each caller can render its own status message.
async function submitStewardshipCompGrant(parishId: string) {
  const res = await fetch('/api/admin/stewardship/comp', {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parishId }),
  });
  const data = (await res.json().catch(() => ({}))) as AdminAppPayload;
  if (!res.ok || !data.ok) throw new Error(data.error || 'Grant failed');
  return data;
}

async function grantStewardshipComp(btn?: HTMLButtonElement | null) {
  const status = document.getElementById('stewardshipCompStatus');
  const parishInput = document.getElementById('stewardshipCompParishId');
  const parishId = ((parishInput as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '').trim();
  if (!parishId) {
    if (status) {
      status.textContent = 'Enter the parish dashboard ID first.';
      status.style.color = 'var(--red, #8b2020)';
    }
    parishInput?.focus();
    return;
  }
  btn!.disabled = true;
  btn!.textContent = 'Granting...';
  if (status) status.textContent = '';
  try {
    const data = await submitStewardshipCompGrant(parishId);
    btn!.textContent = 'Granted';
    if (status) {
      const expires = data.comp?.expiresAt
        ? new Date(data.comp.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : '';
      status.textContent = `Free year granted to ${parishId}${expires ? ' — expires ' + expires : ''}. ${data.claimed} of 20 claimed.`;
      status.style.color = 'var(--green, #2a7a4b)';
    }
    await loadStewardshipCompStatus();
    if (parishInput) (parishInput as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = '';
  } catch (err) {
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    btn!.disabled = false;
    btn!.textContent = 'Grant free year';
  }
}

async function grantStewardshipCompFromDetail(parishId: string, btn?: HTMLButtonElement | null) {
  const status = document.getElementById('detailCompGrantStatus');
  if (!parishId) return;
  btn!.disabled = true;
  btn!.textContent = 'Granting...';
  if (status) status.textContent = '';
  try {
    const data = await submitStewardshipCompGrant(parishId);
    btn!.textContent = 'Granted';
    if (status) {
      const expires = data.comp?.expiresAt
        ? new Date(data.comp.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : '';
      status.textContent = `Granted${expires ? ' — expires ' + expires : ''}. ${data.claimed} of 20 claimed.`;
      status.style.color = 'var(--green, #2a7a4b)';
    }
    await loadStewardshipCompStatus();
  } catch (err) {
    btn!.disabled = false;
    btn!.textContent = 'Grant free year to ' + parishId;
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.style.color = 'var(--red, #8b2020)';
    }
  }
}

// Shared core used by both the Developer Tools card and the per-parish
// detail-view shortcut. Returns the parsed response so each caller can
// render its own status message.
async function submitSacramentsEnabled(parishId: string, enabled: boolean) {
  const res = await fetch('/api/admin/sacraments/enabled', {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parishId, enabled }),
  });
  const data = (await res.json().catch(() => ({}))) as AdminAppPayload;
  if (!res.ok || !data.ok) throw new Error(data.error || 'Update failed');
  return data;
}

async function setSacramentsEnabled(btn: HTMLButtonElement | null, enabled: boolean) {
  const status = document.getElementById('sacramentsEnabledStatus');
  const parishInput = document.getElementById('sacramentsEnabledParishId') as HTMLInputElement | null;
  const parishId = (parishInput?.value || '').trim();
  if (!parishId) {
    if (status) {
      status.textContent = 'Enter the parish dashboard ID first.';
      status.style.color = 'var(--red, #8b2020)';
    }
    parishInput?.focus();
    return;
  }
  btn!.disabled = true;
  const originalText = btn!.textContent;
  btn!.textContent = enabled ? 'Enabling...' : 'Disabling...';
  if (status) status.textContent = '';
  try {
    await submitSacramentsEnabled(parishId, enabled);
    if (status) {
      status.textContent = `Sacraments & Services ${enabled ? 'enabled' : 'disabled'} for ${parishId}.`;
      status.style.color = 'var(--green, #2a7a4b)';
    }
  } catch (err) {
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    btn!.disabled = false;
    btn!.textContent = originalText;
  }
}

async function setSacramentsEnabledFromDetail(parishId: string, enabled: boolean, btn?: HTMLButtonElement | null) {
  const status = document.getElementById('detailSacramentsStatus');
  if (!parishId) return;
  btn!.disabled = true;
  btn!.textContent = enabled ? 'Enabling...' : 'Disabling...';
  if (status) status.textContent = '';
  try {
    await submitSacramentsEnabled(parishId, enabled);
    btn!.textContent = enabled ? 'Disable' : 'Enable';
    btn!.setAttribute('onclick', `setSacramentsEnabledFromDetail('${parishId}', ${!enabled}, this)`);
    if (status) {
      status.textContent = `Sacraments & Services ${enabled ? 'enabled' : 'disabled'}.`;
      status.style.color = 'var(--green, #2a7a4b)';
    }
  } catch (err) {
    btn!.textContent = enabled ? 'Enable' : 'Disable';
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    btn!.disabled = false;
  }
}

async function loadPlatformSummary(btn?: HTMLButtonElement | null) {
  window.loadParishRelationships?.();
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  document.getElementById('adminMetricsCard')?.setAttribute('aria-busy', 'true');
  renderPlatformGrowth(computeLocalPlatformSummary(registrationsCache));
  try {
    const response = await fetch('/api/admin/platform-summary', { headers: authHeaders() });
    const result = (await response.json()) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to load platform summary');
    if (!result.summary?.overviewMetrics) renderAdminOverviewMetrics(null);
    renderPlatformGrowth(result.summary!);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the original catch binding in this runtime migration.
  } catch (err) {
    renderAdminOverviewMetrics(null);
    const localSummary = computeLocalPlatformSummary(registrationsCache);
    localSummary.donationDataSource = 'local_only';
    renderPlatformGrowth(localSummary);
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function diagnosticsBadge(label: string, ok: boolean, { unknown = false }: { unknown?: boolean } = {}) {
  const cls = unknown ? 'not_configured' : ok ? 'active' : 'rejected';
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function deploymentCheckOk(check: AdminAppDeploymentCheck | string | boolean | undefined, legacyValue?: unknown) {
  if (typeof check === 'boolean') return check;
  if (typeof check === 'string') return check === 'ok';
  if (check && typeof check === 'object') {
    if (typeof check.ok === 'boolean') return check.ok;
    if (typeof check.configured === 'boolean') return check.configured;
    const values = Object.values(check);
    return values.length > 0 && values.every((value: unknown) => value === true);
  }
  return Boolean(legacyValue);
}

async function loadDeploymentDiagnostics() {
  const badgeEl = document.getElementById('deploymentStatusBadge');
  const versionEl = document.getElementById('diagVersion');
  const deployedEl = document.getElementById('diagDeployedAt');
  const envEl = document.getElementById('diagEnvironment');
  const utcEl = document.getElementById('diagUtcNow');
  const checksEl = document.getElementById('diagnosticsChecks');
  const flagsEl = document.getElementById('diagnosticsFlags');
  if (utcEl) utcEl.textContent = 'UTC: ' + new Date().toUTCString().replace(' GMT', ' UTC');

  try {
    const healthResponse = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    const health = (await healthResponse.json()) as AdminAppDeploymentHealth;
    if (badgeEl) {
      badgeEl.className = 'badge ' + (health.ok ? 'active' : 'rejected');
      badgeEl.textContent = health.ok ? 'Healthy' : 'Degraded';
    }
    if (versionEl) versionEl.textContent = health.version || 'unknown';
    if (deployedEl)
      deployedEl.textContent =
        'Deployed: ' +
        (health.deployedAt ? new Date(health.deployedAt).toUTCString().replace(' GMT', ' UTC') : 'unknown');
    if (envEl)
      envEl.textContent = health.environment || (location.hostname === 'agapay.app' ? 'production' : 'unknown');
    if (checksEl && health.checks) {
      const checks = health.checks;
      const workerOk = deploymentCheckOk(checks.worker);
      const d1Ok = deploymentCheckOk(checks.d1, checks.database === 'ok');
      const kvOk = deploymentCheckOk(checks.kv);
      const stripeOk = deploymentCheckOk(checks.stripe, checks.stripeConfigured);
      const emailOk = deploymentCheckOk(checks.email, checks.emailConfigured);
      const r2Ok = deploymentCheckOk(checks.r2, checks.r2Configured);
      checksEl.innerHTML = [
        diagnosticsBadge(`Worker: ${workerOk ? 'ok' : 'failed'}`, workerOk),
        diagnosticsBadge(`D1: ${d1Ok ? 'ok' : 'failed'}`, d1Ok),
        diagnosticsBadge(`KV: ${kvOk ? 'ok' : 'failed'}`, kvOk),
        diagnosticsBadge('Stripe', stripeOk, { unknown: !stripeOk }),
        diagnosticsBadge('Email', emailOk, { unknown: !emailOk }),
        diagnosticsBadge('R2', r2Ok, { unknown: !r2Ok }),
      ].join('');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the original catch binding in this runtime migration.
  } catch (err) {
    if (badgeEl) {
      badgeEl.className = 'badge rejected';
      badgeEl.textContent = 'Unreachable';
    }
    if (checksEl) checksEl.innerHTML = diagnosticsBadge('/api/health unreachable', false);
  }

  try {
    const releaseResponse = await fetch('/api/admin/release-status', { headers: authHeaders() });
    const releaseResult = (await releaseResponse.json()) as AdminAppPayload;
    if (handleAuthFailure(releaseResponse, releaseResult)) return;
    const flags = releaseResult?.releaseStatus?.featureFlags || {};
    if (flagsEl) {
      const entries = Object.entries(flags);
      flagsEl.innerHTML = entries.length
        ? entries
            .map(([name, value]) =>
              diagnosticsBadge(name.replace(/_/g, ' ') + ': ' + (value ? 'ON' : 'off'), value as boolean)
            )
            .join('')
        : '<span class="badge not_configured">No flags reported</span>';
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the original catch binding in this runtime migration.
  } catch (err) {
    if (flagsEl) flagsEl.innerHTML = diagnosticsBadge('Release status unreachable', false);
  }
}

async function runEmailDiagnostics(btn?: HTMLButtonElement | null) {
  const status = document.getElementById('emailDiagnosticsStatus');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  if (status) status.textContent = 'Sending real templates and recording provider acceptance...';
  try {
    const response = await fetch('/api/admin/email-diagnostics', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        kinds: ['verification', 'invitation', 'receipt', 'administrative'],
        includeBounce: (document.getElementById('emailDiagnosticsBounce') as HTMLInputElement | null)?.checked === true,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to send email diagnostics.');
    const accepted = Object.entries(result.results || {})
      .map(([kind, delivery]) => `${kind}: ${delivery?.status || 'unknown'}`)
      .join(' · ');
    if (status) status.textContent = `Accepted by Resend for ${result.recipient}. ${accepted}`;
    setStatus('Email diagnostics accepted. Verify the inbox rendering and the Resend webhook alert.', 'success');
  } catch (error) {
    if (status) status.textContent = (error as AdminAppError).message;
    setStatus((error as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}
export type AdminAppPart3 = {
  seedDemoParish: typeof seedDemoParish;
  weeklyCommemorationSummary: typeof weeklyCommemorationSummary;
  runWeeklyCommemorationEmail: typeof runWeeklyCommemorationEmail;
  moneyPlain: typeof moneyPlain;
  weeklyTreasurerSummary: typeof weeklyTreasurerSummary;
  runWeeklyTreasurerEmail: typeof runWeeklyTreasurerEmail;
  loadStewardshipCompStatus: typeof loadStewardshipCompStatus;
  submitStewardshipCompGrant: typeof submitStewardshipCompGrant;
  grantStewardshipComp: typeof grantStewardshipComp;
  grantStewardshipCompFromDetail: typeof grantStewardshipCompFromDetail;
  submitSacramentsEnabled: typeof submitSacramentsEnabled;
  setSacramentsEnabled: typeof setSacramentsEnabled;
  setSacramentsEnabledFromDetail: typeof setSacramentsEnabledFromDetail;
  loadPlatformSummary: typeof loadPlatformSummary;
  diagnosticsBadge: typeof diagnosticsBadge;
  deploymentCheckOk: typeof deploymentCheckOk;
  loadDeploymentDiagnostics: typeof loadDeploymentDiagnostics;
  runEmailDiagnostics: typeof runEmailDiagnostics;
};
