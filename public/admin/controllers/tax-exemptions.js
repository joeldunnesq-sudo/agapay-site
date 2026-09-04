// Classic-script controller. Top-level function declarations intentionally
// preserve the Admin HTML inline-handler globals.
// ══════════════════════════════════════════════════════════════════
// TAX EXEMPTIONS ADMIN TAB
// ══════════════════════════════════════════════════════════════════
let texClaimsCache = [];
let texSelectedId = '';
let texDebounceTimer = null;
const TEX_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  replacement_required: 'Replacement required',
  expired: 'Expired',
  revoked: 'Revoked',
  superseded: 'Superseded',
};
const TEX_SYNC_LABELS = {
  not_applicable: '—',
  waiting_for_customer: 'Waiting for Customer',
  succeeded: 'Synced',
  pending: 'Sync pending',
  failed: 'Sync failed',
  partial: 'Partial sync',
  reconciliation_required: 'Reconciliation required',
};

function texBadge(kind, value, label) {
  return `<span class="badge ${escapeAttr(kind)}-${escapeAttr(value)}" role="status">${escapeHtml(label)}</span>`;
}

function texStatusBadge(status) {
  return texBadge('tex', status, TEX_STATUS_LABELS[status] || readable(status));
}

function texSyncBadge(sync) {
  return texBadge('texsync', sync, TEX_SYNC_LABELS[sync] || readable(sync));
}

let texSelectedVersion = '';

async function texFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: authHeaders(
      options.headers || (options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' })
    ),
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    /* non-JSON (e.g. document stream) */
  }
  if (handleAuthFailure(response, result)) throw new Error('Session expired');
  if (response.status === 409 && result.code === 'STALE_RECORD') {
    const err = new Error(
      result.message ||
        'This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.'
    );
    err.code = 'STALE_RECORD';
    throw err;
  }
  if (!response.ok) throw new Error(result.error || result.message || `Request failed (${response.status})`);
  return result;
}

// Wraps a mutating action: on a STALE_RECORD conflict, shows the
// required copy, reloads the latest detail (so the admin sees current
// state before acting again), and never auto-retries.
async function texRunMutation(id, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === 'STALE_RECORD') {
      setStatus(
        'This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.',
        'error'
      );
      await openTexDetail(id);
      return null;
    }
    throw err;
  }
}

async function loadTaxExemptionSummary() {
  const container = document.getElementById('taxExemptionSummaryCards');
  try {
    const data = await texFetch('/api/admin/tax-exemptions/summary');
    document.getElementById('taxExemptionWorkflowNotice').style.display = data.workflowEnabled ? 'none' : '';
    document.getElementById('taxExemptionSyncDisabledNotice').style.display = data.stripeSyncEnabled ? 'none' : '';
    const c = data.counts || {};
    const attention = Number(c.needsAttention) || 0;
    const navCount = document.getElementById('navTaxExemptionCount');
    const overviewCount = document.getElementById('overviewTaxExemptionCount');
    [navCount, overviewCount].forEach((element) => {
      if (!element) return;
      element.textContent = String(attention);
      element.hidden = attention === 0;
    });
    const cards = [
      ['pending', 'Pending review', c.pending],
      ['approved', 'Approved', c.approved],
      ['replacement_required', 'Replacement required', c.replacementRequired],
      ['expiring_soon', 'Expiring soon', c.expiringSoon],
      ['expired', 'Expired', c.expired],
      ['rejected', 'Rejected', c.rejected],
      ['revoked', 'Revoked', c.revoked],
      ['sync_failed', 'Failed sync', c.failedSync],
      ['partial_sync', 'Partial sync', c.partialSync],
      ['reconciliation_required', 'Reconciliation required', c.reconciliationRequired],
      ['waiting_for_customer', 'Waiting for Customer', c.waitingForCustomer],
      ['pending_without_document', 'Pending, no document', c.pendingWithoutDocument],
    ];
    container.innerHTML = cards
      .map(
        ([filterValue, label, count]) => `
          <article class="revenue-card" style="cursor:pointer;" role="button" tabindex="0"
            onclick="setTexStatusFilter('${escapeAttr(filterValue)}')"
            onkeydown="if(event.key==='Enter')setTexStatusFilter('${escapeAttr(filterValue)}')"
            aria-label="Filter by ${escapeAttr(label)}: ${count || 0}">
            <div class="revenue-card-value">${Number(count) || 0}</div>
            <div class="revenue-card-label">${escapeHtml(label)}</div>
          </article>
        `
      )
      .join('');
  } catch (err) {
    container.innerHTML = `<article class="revenue-card"><div class="revenue-empty">Could not load summary: ${escapeHtml(err.message)}</div></article>`;
  }
}

function setTexStatusFilter(value) {
  document.getElementById('texFilterStatus').value = value;
  loadTaxExemptions();
}

function onTexFilterChange() {
  loadTaxExemptions();
}
function debouncedTexFilterChange() {
  clearTimeout(texDebounceTimer);
  texDebounceTimer = setTimeout(loadTaxExemptions, 350);
}

async function loadTaxExemptions() {
  const statusEl = document.getElementById('texQueueStatus');
  const wrap = document.getElementById('texTableWrap');
  statusEl.style.display = '';
  statusEl.textContent = 'Loading exemption claims…';
  wrap.style.display = 'none';

  const status = document.getElementById('texFilterStatus').value;
  const state = document.getElementById('texFilterState').value.trim();
  const jurisdiction = document.getElementById('texFilterJurisdiction').value.trim();
  const q = document.getElementById('texFilterSearch').value.trim();
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (state) params.set('state', state);
  if (jurisdiction) params.set('jurisdiction', jurisdiction);
  if (q) params.set('q', q);

  try {
    const data = await texFetch('/api/admin/tax-exemptions?' + params.toString());
    texClaimsCache = data.claims || [];
    if (!texClaimsCache.length) {
      statusEl.textContent = 'No exemption claims match these filters.';
      statusEl.style.display = '';
      wrap.style.display = 'none';
      return;
    }
    statusEl.style.display = 'none';
    wrap.style.display = '';
    renderTaxExemptionQueue();
  } catch (err) {
    statusEl.textContent = 'Could not load exemption claims: ' + err.message;
    statusEl.style.display = '';
  }
}

function texNoStatewideNote(state) {
  const NO_TAX_STATES = { AK: 'Alaska', DE: 'Delaware', MT: 'Montana', NH: 'New Hampshire', OR: 'Oregon' };
  if (!NO_TAX_STATES[state]) return '';
  return ` <span title="No statewide general sales tax -- not the same as tax-exempt status">ⓘ</span>`;
}

function renderTaxExemptionQueue() {
  const body = document.getElementById('texQueueBody');
  body.innerHTML = texClaimsCache
    .map((c) => {
      const docLabel = c.hasDocument
        ? 'Available'
        : ['pending', 'replacement_required'].includes(c.status)
          ? 'Missing'
          : 'Archived only';
      return `
        <tr>
          <td data-label="Parish">${escapeHtml(c.parishName || c.parishId || '—')}</td>
          <td data-label="Reference"><code>${escapeHtml(c.registrationReference)}</code></td>
          <td data-label="State">${escapeHtml(c.state || '—')}${texNoStatewideNote(c.state)}</td>
          <td data-label="Jurisdiction">${escapeHtml(c.jurisdiction)}</td>
          <td data-label="Type">${escapeHtml(readable(c.exemptionType))}</td>
          <td data-label="Submitted">${shortDate(c.certifiedAt)}</td>
          <td data-label="Expiration">${c.expirationDate ? shortDate(c.expirationDate) : '—'}${c.expiringSoon ? ' ⚠' : ''}</td>
          <td data-label="Status">${texStatusBadge(c.status)}</td>
          <td data-label="Stripe sync">${texSyncBadge(c.aggregateSyncState)}</td>
          <td data-label="Document">${escapeHtml(docLabel)}</td>
          <td data-label="Actions"><button class="secondary btn-sm" onclick="openTexDetail('${escapeAttr(c.id)}')">Review</button></td>
        </tr>`;
    })
    .join('');
}

function closeTexDetail() {
  texSelectedId = '';
  document.getElementById('texDetailSection').style.display = 'none';
}

async function openTexDetail(id) {
  texSelectedId = id;
  const section = document.getElementById('texDetailSection');
  const body = document.getElementById('texDetailBody');
  section.style.display = '';
  document.getElementById('texDetailTitle').textContent = 'Loading…';
  body.innerHTML = '<div class="revenue-empty">Loading claim detail…</div>';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const data = await texFetch(`/api/admin/tax-exemptions/${encodeURIComponent(id)}`);
    renderTexDetail(data);
  } catch (err) {
    body.innerHTML = `<div class="revenue-empty">Could not load this claim: ${escapeHtml(err.message)}</div>`;
  }
}

function texMaskedCertificate(masked) {
  // The admin detail API never sends the full certificate number to
  // this view (see handleAdminTaxExemptionDetail) -- only the masked
  // form. There is deliberately no "reveal" affordance here since
  // there is nothing further to reveal client-side; a full-number
  // lookup, if ever operationally necessary, would need its own
  // narrowly-scoped, audit-logged endpoint rather than being bundled
  // into this general detail response.
  return escapeHtml(masked || '—');
}

function texNotAvailableNotice(registration) {
  if (!registration?.hasNoStatewideGeneralSalesTax) return '';
  let extra = '';
  if (registration.state === 'AK') extra = ' Local Alaska sales taxes may still apply.';
  if (registration.state === 'DE')
    extra = ' Delaware seller-side gross-receipts obligations are separate and unaffected by this workflow.';
  return `<div class="form-hint" style="background:rgba(196,150,62,0.08);border-radius:8px;padding:8px 10px;margin-top:6px;">
        ${escapeHtml(registration.noStatewideGeneralSalesTaxGuidance || '')}${escapeHtml(extra)}
        This does not make the organization automatically tax-exempt.
      </div>`;
}

function texRenderStripeSyncRows(syncs) {
  if (!syncs.length) {
    return `<div class="revenue-empty">Approved exemption is waiting for a qualifying AGAPAY subscription Customer to be created.</div>`;
  }
  return syncs
    .map(
      (s) => `
        <div class="notes-entry">
          <div class="notes-entry-meta">
            <strong>${escapeHtml(s.customerRoleLabel)}</strong> · <code>${escapeHtml(s.stripeCustomerId)}</code> ·
            ${texSyncBadge(s.syncStatus === 'succeeded' ? 'succeeded' : s.syncStatus === 'failed' ? 'failed' : s.syncStatus === 'reconciliation_required' ? 'reconciliation_required' : 'pending')}
          </div>
          <div class="notes-entry-text">
            Desired: ${escapeHtml(s.desiredStatus)} · Previous Stripe state: ${escapeHtml(s.previousStatus || 'unknown')} ·
            AGAPAY owns this change: ${s.agapayOwnedChange ? 'Yes' : 'No'} · Attempts: ${s.attemptCount || 0}
            ${s.lastError ? `<br/><span style="color:#8a2828;">Last error: ${escapeHtml(s.lastError)}</span>` : ''}
            ${s.stripeRequestId ? `<br/>Stripe request ID: ${escapeHtml(s.stripeRequestId)}` : ''}
          </div>
          <div class="btn-row" style="margin-top:8px;">
            ${s.syncStatus === 'failed' ? `<button class="secondary btn-sm" onclick="texRetryOne('${escapeAttr(s.id)}', this)">Retry this Customer</button>` : ''}
            ${s.syncStatus === 'reconciliation_required' ? `<button class="secondary btn-sm" onclick="texOpenReconcile('${escapeAttr(s.id)}')">Reconcile</button>` : ''}
          </div>
          <div id="texReconcileForm-${escapeAttr(s.id)}" style="display:none;margin-top:8px;"></div>
        </div>
      `
    )
    .join('');
}

function renderTexDetail(data) {
  const {
    claim,
    registration,
    documents,
    auditLog,
    notes,
    stripeSyncs,
    allowedActions,
    hasCurrentDocument,
    aggregateSyncState: sync,
    workflowEnabled,
    stripeSyncEnabled,
  } = data;
  texSelectedVersion = claim.recordVersion || '';
  document.getElementById('texDetailTitle').textContent =
    `${registration?.parishName || claim.registrationReference} — ${TEX_STATUS_LABELS[claim.status] || claim.status}`;

  const currentDoc = documents.find((d) => d.isCurrent);
  const archivedDocs = documents.filter((d) => !d.isCurrent);

  const body = document.getElementById('texDetailBody');
  body.innerHTML = `
        <div class="tex-detail-grid">
          <section>
            <h3>Organization</h3>
            <p><strong>${escapeHtml(registration?.parishName || '—')}</strong> (${escapeHtml(registration?.parishId || '—')})<br/>
            Registration: <code>${escapeHtml(registration?.reference || claim.registrationReference)}</code> · Status: ${escapeHtml(readable(registration?.registrationStatus))}<br/>
            ${escapeHtml(registration?.addressLine1 || '')} ${escapeHtml(registration?.addressLine2 || '')}<br/>
            ${escapeHtml(registration?.city || '')}, ${escapeHtml(registration?.state || '')} ${escapeHtml(registration?.postalCode || '')}<br/>
            Contact: ${escapeHtml(registration?.contactName || '—')} &lt;${escapeHtml(registration?.contactEmail || '—')}&gt;</p>
            ${texNotAvailableNotice(registration)}
          </section>

          <section>
            <h3>Exemption Claim</h3>
            <p>
              Status: ${texStatusBadge(claim.status)} ${claim.internalReviewStatus ? `<span class="badge needs_more_info">Needs manual review</span>` : ''}<br/>
              Jurisdiction: ${escapeHtml(claim.jurisdiction)} · Type: ${escapeHtml(readable(claim.exemptionType))}<br/>
              Certificate #: ${texMaskedCertificate(claim.maskedCertificateNumber)}<br/>
              Effective: ${claim.effectiveDate ? shortDate(claim.effectiveDate) : '—'} · Expiration: ${claim.expirationDate ? shortDate(claim.expirationDate) : '—'}<br/>
              Submitted: ${shortDate(claim.certifiedAt)}<br/>
              Authorized rep: ${escapeHtml(claim.authorizedRepresentativeName)}, ${escapeHtml(claim.authorizedRepresentativeTitle)}<br/>
              ${claim.replacementReason ? `Replacement reason: ${escapeHtml(claim.replacementReason)} (grace period: ${claim.keepActiveDuringReplacement ? 'active' : 'disabled during replacement'})<br/>` : ''}
              ${claim.rejectionReason ? `Rejection reason: ${escapeHtml(claim.rejectionReason)}<br/>` : ''}
              ${claim.revocationReason ? `Revocation reason: ${escapeHtml(claim.revocationReason)}<br/>` : ''}
              ${claim.supersedesTaxExemptionId ? `Supersedes a prior claim on this registration.<br/>` : ''}
            </p>
          </section>

          <section>
            <h3>Documents</h3>
            ${
              currentDoc
                ? `
              <p>${escapeHtml(currentDoc.originalFilename)} (${escapeHtml(currentDoc.mimeType)}, ${Math.round(currentDoc.fileSize / 1024)} KB) · uploaded ${shortDate(currentDoc.uploadedAt)}</p>
              <div class="btn-row">
                <button class="secondary btn-sm" onclick="texViewDocument('${escapeAttr(claim.id)}', 'inline')">View inline</button>
                <button class="secondary btn-sm" onclick="texViewDocument('${escapeAttr(claim.id)}', 'attachment')">Download</button>
              </div>
            `
                : `<p class="revenue-empty">No document on file.</p>`
            }
            ${archivedDocs.length ? `<p style="margin-top:8px;font-size:12px;color:var(--muted);">${archivedDocs.length} archived version(s) on file.</p>` : ''}
          </section>

          <section>
            <h3>Stripe Synchronization</h3>
            ${!stripeSyncEnabled ? `<p class="revenue-empty">Stripe synchronization is administratively disabled.</p>` : ''}
            ${texRenderStripeSyncRows(stripeSyncs)}
          </section>

          <section id="texActionsSection">
            <h3>Admin Actions</h3>
            <div class="btn-row" id="texActionButtons"></div>
            <div id="texActionForm" style="margin-top:10px;"></div>
          </section>

          <section>
            <h3>Audit History</h3>
            <div class="notes-list">
              ${
                auditLog.length
                  ? auditLog
                      .map(
                        (a) => `
                <div class="notes-entry">
                  <div class="notes-entry-meta">${shortDate(a.createdAt)} · ${escapeHtml(readable(a.action))} · ${escapeHtml(a.actorType)}${a.actorUserId ? ' (' + escapeHtml(a.actorUserId) + ')' : ''}</div>
                </div>
              `
                      )
                      .join('')
                  : '<div class="revenue-empty">No audit events yet.</div>'
              }
            </div>
          </section>

          <section>
            <h3>Notes</h3>
            <div class="notes-list">
              ${
                notes.length
                  ? notes
                      .map(
                        (n) => `
                <div class="notes-entry">
                  <div class="notes-entry-meta">${escapeHtml(n.actorUserId || 'Admin')} · ${shortDate(n.createdAt)}</div>
                  <div class="notes-entry-text">${escapeHtml(n.note)}</div>
                </div>
              `
                      )
                      .join('')
                  : '<div class="revenue-empty">No notes yet.</div>'
              }
            </div>
            <div class="form-grid" style="margin-top:8px;">
              <div style="grid-column:1/-1;">
                <label for="texNewNote">Add a note</label>
                <textarea id="texNewNote" rows="2" placeholder="Internal note (not visible to the parish)"></textarea>
              </div>
            </div>
            <div class="btn-row">
              <button class="secondary btn-sm" id="texAddNoteBtn" onclick="texAddNote('${escapeAttr(claim.id)}', this)">Add note</button>
            </div>
          </section>
        </div>
      `;

  renderTexActionButtons(claim, allowedActions, registration, sync);
}

function renderTexActionButtons(claim, allowed, registration, sync) {
  const wrap = document.getElementById('texActionButtons');
  const buttons = [];
  if (allowed.approve)
    buttons.push(
      `<button class="gold btn-sm" onclick="texOpenApproveConfirm('${escapeAttr(claim.id)}')">Approve</button>`
    );
  if (allowed.reject)
    buttons.push(
      `<button class="secondary btn-sm" onclick="texOpenReasonForm('${escapeAttr(claim.id)}', 'reject')">Reject</button>`
    );
  if (allowed.requestReplacement)
    buttons.push(
      `<button class="secondary btn-sm" onclick="texOpenReasonForm('${escapeAttr(claim.id)}', 'request-replacement')">Request replacement</button>`
    );
  if (allowed.revoke)
    buttons.push(
      `<button class="secondary btn-sm" onclick="texOpenReasonForm('${escapeAttr(claim.id)}', 'revoke')">Revoke</button>`
    );
  if (allowed.markExpired)
    buttons.push(
      `<button class="secondary btn-sm" onclick="texOpenReasonForm('${escapeAttr(claim.id)}', 'expire')">Mark expired</button>`
    );
  if (allowed.retryAll)
    buttons.push(
      `<button class="secondary btn-sm" onclick="texRetryAll('${escapeAttr(claim.id)}', this)">Retry all failed syncs</button>`
    );
  if (!buttons.length)
    buttons.push(`<span class="revenue-empty">No actions available for this claim's current state.</span>`);
  wrap.innerHTML = buttons.join(' ');
}

function texOpenApproveConfirm(id) {
  const claim = texClaimsCache.find((c) => c.id === id) || {};
  const formEl = document.getElementById('texActionForm');
  formEl.innerHTML = `
        <div class="notes-entry">
          <p><strong>Confirm approval</strong></p>
          <p>Parish: ${escapeHtml(claim.parishName || claim.registrationReference)}<br/>
          Jurisdiction: ${escapeHtml(claim.jurisdiction || '')}<br/>
          Expiration: ${claim.expirationDate ? shortDate(claim.expirationDate) : 'None on file'}</p>
          <div class="btn-row">
            <button class="gold btn-sm" onclick="texApprove('${escapeAttr(id)}', this)">Confirm approval</button>
            <button class="secondary btn-sm" onclick="document.getElementById('texActionForm').innerHTML=''">Cancel</button>
          </div>
        </div>
      `;
}

function texOpenReasonForm(id, action) {
  const formEl = document.getElementById('texActionForm');
  const labels = {
    reject: 'Reject claim',
    'request-replacement': 'Request replacement documentation',
    revoke: 'Revoke exemption',
    expire: 'Mark expired',
  };
  const claim = texClaimsCache.find((c) => c.id === id) || {};
  const extra =
    action === 'request-replacement'
      ? `
        <div style="margin:8px 0;">
          <label><input type="radio" name="texGrace-${escapeAttr(id)}" value="disable" checked /> Disable current exemption while awaiting replacement (default)</label><br/>
          <label><input type="radio" name="texGrace-${escapeAttr(id)}" value="keep" /> Keep current exemption active temporarily</label>
        </div>
      `
      : '';
  const expireSummary =
    action === 'expire'
      ? `
        <p style="font-size:12px;color:var(--muted);">Parish: ${escapeHtml(claim.parishName || claim.registrationReference || '')} · Current status: ${escapeHtml(claim.status || '')} · Expiration on file: ${claim.expirationDate ? shortDate(claim.expirationDate) : 'None'}<br/>
        Only AGAPAY-owned Stripe exemption states will be removed; externally-owned or externally-modified states will be flagged for reconciliation instead of being overwritten.</p>
      `
      : '';
  formEl.innerHTML = `
        <div class="notes-entry">
          <p><strong>${escapeHtml(labels[action] || action)}</strong></p>
          ${expireSummary}
          ${extra}
          <label for="texReason-${escapeAttr(id)}">Reason (required)</label>
          <textarea id="texReason-${escapeAttr(id)}" rows="2"></textarea>
          <div class="btn-row" style="margin-top:8px;">
            <button class="secondary btn-sm" onclick="texSubmitReasonAction('${escapeAttr(id)}', '${escapeAttr(action)}', this)">Confirm</button>
            <button class="secondary btn-sm" onclick="document.getElementById('texActionForm').innerHTML=''">Cancel</button>
          </div>
        </div>
      `;
}

async function texApprove(id, btn) {
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const result = await texRunMutation(id, () =>
      texFetch(`/api/admin/tax-exemptions/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: texSelectedVersion }),
      })
    );
    if (!result) return; // stale-record conflict already handled by texRunMutation
    setStatus(
      result.waitingForCustomer ? 'Approved -- waiting for a future Stripe Customer.' : 'Exemption approved.',
      'success'
    );
    openTexDetail(id);
    loadTaxExemptionSummary();
  } catch (err) {
    setStatus('Approval failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function texSubmitReasonAction(id, action, btn) {
  const reason = document.getElementById(`texReason-${id}`)?.value.trim();
  if (!reason) {
    setStatus('A reason is required.', 'error');
    return;
  }
  const body = { reason, expectedVersion: texSelectedVersion };
  if (action === 'request-replacement') {
    const graceChoice = document.querySelector(`input[name="texGrace-${id}"]:checked`)?.value;
    body.keepActiveDuringReplacement = graceChoice === 'keep';
  }
  if (action === 'expire') body.confirm = true;
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const result = await texRunMutation(id, () =>
      texFetch(`/api/admin/tax-exemptions/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    );
    if (!result) return; // stale-record conflict already handled
    setStatus('Done.', 'success');
    openTexDetail(id);
    loadTaxExemptionSummary();
  } catch (err) {
    setStatus('Action failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function texRetryAll(id, btn) {
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const result = await texRunMutation(id, () =>
      texFetch(`/api/admin/tax-exemptions/${encodeURIComponent(id)}/retry-sync`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: texSelectedVersion }),
      })
    );
    if (!result) return;
    setStatus('Retried all failed Customers. Already-successful Customers were not touched.', 'success');
    openTexDetail(id);
  } catch (err) {
    setStatus('Retry failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function texRetryOne(syncId, btn) {
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const result = await texRunMutation(texSelectedId, () =>
      texFetch(
        `/api/admin/tax-exemptions/${encodeURIComponent(texSelectedId)}/syncs/${encodeURIComponent(syncId)}/retry`,
        { method: 'POST', body: JSON.stringify({ expectedVersion: texSelectedVersion }) }
      )
    );
    if (!result) return;
    setStatus(
      result.ok ? 'Customer synced successfully.' : 'Retry failed for this Customer.',
      result.ok ? 'success' : 'error'
    );
    openTexDetail(texSelectedId);
  } catch (err) {
    setStatus('Retry failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

function texOpenReconcile(syncId) {
  const el = document.getElementById(`texReconcileForm-${syncId}`);
  el.style.display = '';
  el.innerHTML = `
        <label>Reason (required)</label>
        <textarea id="texReconcileReason-${syncId}" rows="2"></textarea>
        <div class="btn-row" style="margin-top:8px;">
          <button class="secondary btn-sm" onclick="texSubmitReconcile('${syncId}', 'accept_external', this)">Accept current external Stripe state</button>
          <button class="secondary btn-sm" onclick="texSubmitReconcile('${syncId}', 'force_apply', this)">Force AGAPAY's desired state</button>
        </div>
        <p style="font-size:12px;color:var(--muted);margin-top:6px;">Accepting acknowledges Stripe's current state without changing it. Forcing overwrites it back to AGAPAY's intended value and requires explicit confirmation.</p>
      `;
}

async function texSubmitReconcile(syncId, action, btn) {
  const reason = document.getElementById(`texReconcileReason-${syncId}`)?.value.trim();
  if (!reason) {
    setStatus('A reason is required to reconcile.', 'error');
    return;
  }
  let confirm2 = true;
  if (action === 'force_apply') {
    confirm2 = window.confirm("This will overwrite Stripe's current state with AGAPAY's desired value. Continue?");
  }
  if (!confirm2) return;
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    await texRunMutation(texSelectedId, () =>
      texFetch(
        `/api/admin/tax-exemptions/${encodeURIComponent(texSelectedId)}/syncs/${encodeURIComponent(syncId)}/reconcile`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            reason,
            confirm: action === 'force_apply',
            expectedVersion: texSelectedVersion,
          }),
        }
      )
    );
    setStatus('Reconciliation recorded.', 'success');
    openTexDetail(texSelectedId);
  } catch (err) {
    setStatus('Reconciliation failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function texAddNote(id, btn) {
  const note = document.getElementById('texNewNote')?.value.trim();
  if (!note) {
    setStatus('Enter a note before submitting.', 'error');
    return;
  }
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    await texFetch(`/api/admin/tax-exemptions/${encodeURIComponent(id)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
    setStatus('Note added.', 'success');
    openTexDetail(id);
  } catch (err) {
    setStatus('Could not add note: ' + err.message, 'error');
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function texViewDocument(id, mode) {
  setStatus('Opening document…');
  try {
    const path =
      mode === 'attachment'
        ? `/api/admin/tax-exemptions/${encodeURIComponent(id)}/document-download`
        : `/api/admin/tax-exemptions/${encodeURIComponent(id)}/document`;
    const response = await fetch(path, { headers: authHeaders() });
    if (handleAuthFailure(response, {})) return;
    if (!response.ok) throw new Error('Could not load document (' + response.status + ')');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    // Never place the R2 storage key or a persistent URL in the DOM --
    // this is a transient, revoked-after-use object URL only.
    const win = window.open(objectUrl, '_blank', 'noopener');
    if (!win) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = mode === 'attachment' ? 'exemption-document' : '';
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (err) {
    setStatus('Could not open document: ' + err.message, 'error');
  }
}
