import type { ParishAppClaim, ParishAppPayload, ParishAppError } from './app-contracts.js';
import type { ParishAppBindings } from './app.js';
declare let currentParish: ParishAppBindings['currentParish'];
declare const taxExemptionJurisdictions: ParishAppBindings['taxExemptionJurisdictions'];
declare const escapeHtml: ParishAppBindings['escapeHtml'];
declare const authHeaders: ParishAppBindings['authHeaders'];
declare const setStatus: ParishAppBindings['setStatus'];

function taxExemptionApi(path: string = '') {
  if (!currentParish?.parishId) return '';
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/tax-exemption' + path;
}

function taxExemptionStatusCopy(status: string) {
  return (
    (
      {
        pending: [
          'Under review',
          'AGAPAY is reviewing the exemption request. Sales tax remains enabled until approval.',
        ],
        approved: [
          'Approved',
          'Applicable AGAPAY subscription charges are tax-exempt. New billing Customers are synchronized before checkout.',
        ],
        replacement_required: [
          'Document needed',
          'AGAPAY requested updated documentation. Upload it here so the review can continue.',
        ],
        rejected: [
          'Not approved',
          'This request was not approved. You may submit a new request with corrected information.',
        ],
        expired: ['Expired', 'The exemption is no longer active. Submit current documentation for a new review.'],
        revoked: ['Revoked', 'The exemption is no longer active. Contact support if you believe this is incorrect.'],
      } as Record<string, string[]>
    )[status] || ['Not submitted', 'No sales-tax exemption request is on file.']
  );
}

function taxExemptionJurisdictionOptions(selected: string = '') {
  const normalized = String(selected || currentParish?.state || '')
    .trim()
    .toUpperCase();
  return (
    '<option value="">Choose jurisdiction…</option>' +
    taxExemptionJurisdictions
      .map((code) => {
        const label = code === 'FEDERAL' ? 'Federal' : code === 'OTHER' ? 'Other / multistate' : code;
        return `<option value="${code}" ${code === normalized ? 'selected' : ''}>${label}</option>`;
      })
      .join('')
  );
}

function taxExemptionRequestForm(previousClaim: ParishAppClaim | null = null) {
  return `
      <form class="tax-exemption-form" onsubmit="submitParishTaxExemption(event)">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="taxExemptionJurisdiction">Exemption jurisdiction</label>
            <select id="taxExemptionJurisdiction" name="jurisdiction" required onchange="syncTaxExemptionJurisdiction()">${taxExemptionJurisdictionOptions(previousClaim?.jurisdiction)}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionType">Organization type</label>
            <select id="taxExemptionType" name="exemptionType">
              <option value="religious_organization">Religious organization</option>
              <option value="charitable_organization">Charitable organization</option>
              <option value="government_entity">Government entity</option>
              <option value="other">Other exempt organization</option>
            </select>
          </div>
          <div class="form-group full" id="taxExemptionOtherGroup" hidden>
            <label class="form-label" for="taxExemptionExplanation">Jurisdiction or multistate explanation</label>
            <textarea id="taxExemptionExplanation" name="multistateExplanation" rows="3" placeholder="Explain where and how this exemption applies."></textarea>
          </div>
          <div class="form-group full" id="taxExemptionStateGuidance" hidden></div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionCertificateNumber">Certificate number <span class="optional">(if shown)</span></label>
            <input id="taxExemptionCertificateNumber" name="certificateNumber" autocomplete="off" placeholder="Certificate or exemption number" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionEffectiveDate">Effective date <span class="optional">(if shown)</span></label>
            <input id="taxExemptionEffectiveDate" name="effectiveDate" type="date" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionExpirationDate">Expiration date <span class="optional">(if applicable)</span></label>
            <input id="taxExemptionExpirationDate" name="expirationDate" type="date" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionDocument">Exemption document</label>
            <input id="taxExemptionDocument" name="document" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required />
            <p class="section-note">PDF, JPG, or PNG, up to 10 MB. The document is stored privately and is visible only to authorized parish and AGAPAY administrators.</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionRepresentativeName">Authorized representative</label>
            <input id="taxExemptionRepresentativeName" name="authorizedRepresentativeName" required placeholder="Full legal name" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionRepresentativeTitle">Representative title</label>
            <input id="taxExemptionRepresentativeTitle" name="authorizedRepresentativeTitle" required placeholder="Treasurer, rector, board officer…" />
          </div>
        </div>
        <label class="check-card tax-exemption-certification"><input name="certified" type="checkbox" required /> I certify that I am authorized to submit this request and that the information and document are accurate.</label>
        <p class="section-note">Submitting a document does not automatically make the parish tax-exempt. AGAPAY reviews the request and applies the exemption to subscription billing only after approval.</p>
        <div class="btn-row"><button class="btn btn-gold" type="submit">Submit for review</button></div>
      </form>`;
}

function taxExemptionDocumentForm(hasDocument: boolean = false) {
  return `
      <form class="tax-exemption-upload" onsubmit="uploadParishTaxExemptionDocument(event)">
        <div class="form-group">
          <label class="form-label" for="taxExemptionReplacementDocument">${hasDocument ? 'Replace current document' : 'Upload exemption document'}</label>
          <input id="taxExemptionReplacementDocument" name="document" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required />
          <p class="section-note">PDF, JPG, or PNG, up to 10 MB. Uploading a replacement archives the prior document; it does not approve the request.</p>
        </div>
        <div class="btn-row">
          <button class="btn btn-gold" type="submit">${hasDocument ? 'Upload replacement' : 'Upload document'}</button>
          ${hasDocument ? '<button class="btn btn-ghost" type="button" onclick="viewParishTaxExemptionDocument(this)">View current document</button>' : ''}
        </div>
      </form>`;
}

function renderParishTaxExemption(data: ParishAppPayload = {}) {
  const pane = document.getElementById('taxExemptionPane');
  if (!pane) return;
  const claim = data.claim || null;
  const status = claim?.status || '';
  const copy = taxExemptionStatusCopy(status);
  const detail = claim
    ? `
      <div class="tax-exemption-facts">
        <div><span>Jurisdiction</span><strong>${escapeHtml(claim.jurisdiction || '—')}</strong></div>
        <div><span>Certificate</span><strong>${escapeHtml(claim.maskedCertificateNumber || 'Not listed')}</strong></div>
        <div><span>Submitted</span><strong>${claim.createdAt ? escapeHtml(new Date(claim.createdAt).toLocaleDateString()) : '—'}</strong></div>
        <div><span>Expiration</span><strong>${claim.expirationDate ? escapeHtml(new Date(claim.expirationDate + 'T00:00:00').toLocaleDateString()) : 'No expiration listed'}</strong></div>
      </div>`
    : '';
  const reason = claim?.replacementReason || claim?.rejectionReason || claim?.revocationReason || '';
  let action = '';
  if (!claim || ['rejected', 'expired'].includes(status)) action = taxExemptionRequestForm(claim);
  else if (['pending', 'replacement_required'].includes(status))
    action = taxExemptionDocumentForm(Boolean(data.hasDocument));
  else if (status === 'approved' && data.hasDocument)
    action =
      '<div class="btn-row"><button class="btn btn-ghost" type="button" onclick="viewParishTaxExemptionDocument(this)">View current document</button></div>';
  else if (status === 'revoked')
    action =
      '<p class="section-note">Contact <a href="mailto:support@agapay.app">support@agapay.app</a> before submitting a new request.</p>';

  pane.innerHTML = `
      <div class="tax-exemption-status-card tax-exemption-status-${escapeHtml(status || 'none')}">
        <div><span class="tax-exemption-eyebrow">Current status</span><h3>${escapeHtml(copy[0])}</h3><p>${escapeHtml(copy[1])}</p></div>
        <span class="tax-exemption-status-pill">${escapeHtml(copy[0])}</span>
      </div>
      ${reason ? `<div class="tax-exemption-reason"><strong>AGAPAY note</strong><span>${escapeHtml(reason)}</span></div>` : ''}
      ${detail}
      ${action}
      <div id="taxExemptionActionStatus" class="section-note" role="status" aria-live="polite"></div>`;
  syncTaxExemptionJurisdiction();
}

async function loadParishTaxExemption() {
  const pane = document.getElementById('taxExemptionPane');
  if (!pane || !currentParish?.parishId) return;
  pane.innerHTML = '<p class="section-note">Loading sales-tax status…</p>';
  try {
    const response = await fetch(taxExemptionApi(), { headers: authHeaders(), cache: 'no-store' });
    const payload = (await response.json().catch(() => ({}))) as ParishAppPayload;
    if (!response.ok) throw new Error(payload.error || 'Unable to load sales-tax exemption status.');
    renderParishTaxExemption(payload);
  } catch (error) {
    pane.innerHTML = `<div class="tax-exemption-error"><strong>Sales-tax status is unavailable.</strong><span>${escapeHtml((error as ParishAppError).message)}</span><button class="btn btn-ghost" type="button" onclick="loadParishTaxExemption()">Try again</button></div>`;
  }
}

async function syncTaxExemptionJurisdiction() {
  const select = document.getElementById('taxExemptionJurisdiction') as HTMLSelectElement | null;
  const otherGroup = document.getElementById('taxExemptionOtherGroup');
  const explanation = document.getElementById('taxExemptionExplanation') as HTMLTextAreaElement | null;
  const guidance = document.getElementById('taxExemptionStateGuidance');
  if (!select) return;
  const isOther = select.value === 'OTHER';
  if (otherGroup) otherGroup.hidden = !isOther;
  if (explanation) explanation.required = isOther;
  if (!guidance || !select.value || ['FEDERAL', 'OTHER'].includes(select.value)) {
    if (guidance) guidance.hidden = true;
    return;
  }
  try {
    const response = await fetch('/api/tax-exemption/state-guidance?state=' + encodeURIComponent(select.value));
    const data = (await response.json().catch(() => ({}))) as ParishAppPayload;
    guidance.hidden = !data.hasNoStatewideGeneralSalesTax;
    guidance.innerHTML = data.hasNoStatewideGeneralSalesTax
      ? `<div class="tax-exemption-guidance">${escapeHtml(data.guidance || '')} Documentation is still required if you are claiming an exemption.</div>`
      : '';
  } catch {
    guidance.hidden = true;
  }
}

function setTaxExemptionActionStatus(message: string, kind: string = '') {
  const status = document.getElementById('taxExemptionActionStatus');
  if (!status) return;
  status.textContent = message;
  status.className = `section-note tax-exemption-action-status ${kind}`;
}

async function submitParishTaxExemption(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = event.submitter;
  const raw = new FormData(form as HTMLFormElement);
  const file = raw.get('document') as File | null;
  if (!file || !file.size) {
    setTaxExemptionActionStatus('Choose the exemption document to upload.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setTaxExemptionActionStatus('The document must be 10 MB or smaller.', 'error');
    return;
  }
  const payload = {
    claimsExemption: true,
    jurisdiction: raw.get('jurisdiction'),
    exemptionType: raw.get('exemptionType'),
    multistateExplanation: String(raw.get('multistateExplanation') || '').trim(),
    certificateNumber: String(raw.get('certificateNumber') || '').trim(),
    effectiveDate: raw.get('effectiveDate'),
    expirationDate: raw.get('expirationDate'),
    authorizedRepresentativeName: String(raw.get('authorizedRepresentativeName') || '').trim(),
    authorizedRepresentativeTitle: String(raw.get('authorizedRepresentativeTitle') || '').trim(),
    certified: raw.get('certified') === 'on',
  };
  if (button) {
    (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
    button.classList.add('loading');
  }
  setTaxExemptionActionStatus('Submitting request…');
  try {
    const response = await fetch(taxExemptionApi(), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as ParishAppPayload;
    if (!response.ok) throw new Error(result.error || 'Unable to submit the request.');
    const upload = new FormData();
    upload.append('document', file, file.name);
    const uploadResponse = await fetch(taxExemptionApi('/upload'), {
      method: 'POST',
      headers: authHeaders(),
      body: upload,
    });
    const uploadResult = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok)
      throw new Error(
        uploadResult.error || 'The request was saved, but the document upload failed. Retry the upload below.'
      );
    setStatus('Sales-tax exemption request submitted for review.', 'success');
    await loadParishTaxExemption();
  } catch (error) {
    setTaxExemptionActionStatus((error as ParishAppError).message, 'error');
  } finally {
    if (button) {
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function uploadParishTaxExemptionDocument(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = event.submitter;
  const file = new FormData(form as HTMLFormElement).get('document') as File | null;
  if (!file || !file.size) {
    setTaxExemptionActionStatus('Choose a document to upload.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setTaxExemptionActionStatus('The document must be 10 MB or smaller.', 'error');
    return;
  }
  if (button) {
    (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
    button.classList.add('loading');
  }
  setTaxExemptionActionStatus('Uploading document…');
  try {
    const upload = new FormData();
    upload.append('document', file, file.name);
    const response = await fetch(taxExemptionApi('/upload'), { method: 'POST', headers: authHeaders(), body: upload });
    const payload = (await response.json().catch(() => ({}))) as ParishAppPayload;
    if (!response.ok) throw new Error(payload.error || 'Unable to upload the document.');
    setStatus('Exemption document uploaded.', 'success');
    await loadParishTaxExemption();
  } catch (error) {
    setTaxExemptionActionStatus((error as ParishAppError).message, 'error');
  } finally {
    if (button) {
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function viewParishTaxExemptionDocument(button?: HTMLButtonElement | null) {
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(taxExemptionApi('/document'), { headers: authHeaders() });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ParishAppPayload;
      throw new Error(payload.error || 'Unable to open the document.');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const opened = window.open(objectUrl, '_blank', 'noopener');
    if (!opened) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.target = '_blank';
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    setTaxExemptionActionStatus((error as ParishAppError).message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}
export type ParishAppPart3 = {
  taxExemptionApi: typeof taxExemptionApi;
  taxExemptionStatusCopy: typeof taxExemptionStatusCopy;
  taxExemptionJurisdictionOptions: typeof taxExemptionJurisdictionOptions;
  taxExemptionRequestForm: typeof taxExemptionRequestForm;
  taxExemptionDocumentForm: typeof taxExemptionDocumentForm;
  renderParishTaxExemption: typeof renderParishTaxExemption;
  loadParishTaxExemption: typeof loadParishTaxExemption;
  syncTaxExemptionJurisdiction: typeof syncTaxExemptionJurisdiction;
  setTaxExemptionActionStatus: typeof setTaxExemptionActionStatus;
  submitParishTaxExemption: typeof submitParishTaxExemption;
  uploadParishTaxExemptionDocument: typeof uploadParishTaxExemptionDocument;
  viewParishTaxExemptionDocument: typeof viewParishTaxExemptionDocument;
};
