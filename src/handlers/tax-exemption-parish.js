// Generated from src/handlers/tax-exemption-parish.ts by npm run build:server. Do not edit.
import {
  json,
  unauthorized,
  getBearerToken,
  hasProductionStore,
  missingProductionStoreResponse,
  rateLimit,
  d1,
  d1Run,
  d1First,
} from '../lib/core.js';
import { findRegistrationByParishId, verifyParishDashboardBearer, saveRegistrationRecord } from './parish.js';
import {
  createTaxExemptionClaim,
  attachTaxExemptionDocument,
  getCurrentTaxExemptionForRegistration,
  listTaxExemptionDocuments,
  getCurrentTaxExemptionDocument,
  taxExemptionToJson,
  writeTaxExemptionAuditLog,
  verifyClaimUploadToken,
  isTaxExemptionDocumentUploadEnabled,
} from '../lib/tax-exemption.js';
import {
  validateExemptionUpload,
  sha256Hex,
  sanitizeFilename,
  putExemptionDocument,
  streamExemptionDocument,
} from '../lib/tax-exemption-storage.js';
import { hasNoStatewideGeneralSalesTax, NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY } from '../lib/tax-codes.js';
import { VALID_JURISDICTIONS, JURISDICTIONS_REQUIRING_MANUAL_REVIEW_FLAG } from './tax-exemption-shared.js';
import { normalizeJurisdiction } from './tax-exemption-shared.js';
import './tax-exemption.js';
import './tax-exemption-admin-review.js';
async function requireParishAuth(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: 'Parish not found' }, { status: 404 }) };
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { error: unauthorized() };
  }
  return { registration: found.registration, reference: found.registration.reference };
}
async function handleTaxExemptionStateGuidance(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const url = new URL(request.url);
  const state = normalizeJurisdiction(url.searchParams.get('state'));
  const applies = hasNoStatewideGeneralSalesTax(state);
  return json({
    state,
    hasNoStatewideGeneralSalesTax: applies,
    // Informational only -- never used server-side to decide claim
    // creation, document requirements, or Stripe tax_exempt handling.
    // A parish in one of these states is not automatically tax-exempt, and
    // the absence of a statewide general sales tax never waives the
    // document requirement for an affirmative exemption claim.
    guidance: applies ? NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY[state] || '' : '',
    requiresCertificateByDefault: true,
    defaultClaimsExemptionAnswer: 'no',
  });
}
async function handleParishTaxExemptionClaim(request, env, parishId) {
  const limited = await rateLimit(request, env, 'tax-exemption-claim', { limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const auth = await requireParishAuth(request, env, parishId);
  if (auth.error) return auth.error;
  const { registration, reference } = auth;
  if (request.method === 'GET') {
    const claim = await getCurrentTaxExemptionForRegistration(env, reference);
    if (!claim) return json({ claim: null });
    const documents = await listTaxExemptionDocuments(env, claim.id);
    return json({
      claim: taxExemptionToJson(claim),
      hasDocument: documents.some((d) => Number(d.is_current) === 1),
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const claimsExemption = body.claimsExemption === true || body.claimsExemption === 'yes';
  if (!claimsExemption) {
    return json({ ok: true, claim: null, message: 'No exemption claimed.' });
  }
  const jurisdiction = normalizeJurisdiction(body.jurisdiction);
  if (!VALID_JURISDICTIONS.has(jurisdiction)) {
    return json({ error: 'Choose a valid exemption jurisdiction.' }, { status: 422 });
  }
  const representativeName = String(body.authorizedRepresentativeName || '').trim();
  const representativeTitle = String(body.authorizedRepresentativeTitle || '').trim();
  const certified = body.certified === true;
  if (!representativeName || !representativeTitle) {
    return json({ error: 'Authorized representative name and title are required.' }, { status: 422 });
  }
  if (!certified) {
    return json({ error: 'You must certify the exemption claim to submit it.' }, { status: 422 });
  }
  if (jurisdiction === 'OTHER' && !String(body.multistateExplanation || '').trim()) {
    return json(
      { error: 'Please explain the jurisdiction or multistate use this exemption relates to.' },
      { status: 422 }
    );
  }
  const exemptionType = String(body.exemptionType || '').trim() || 'religious_organization';
  const requiresCertificate = true;
  const needsManualReviewFlag =
    JURISDICTIONS_REQUIRING_MANUAL_REVIEW_FLAG.has(jurisdiction) ||
    Boolean(String(body.multistateExplanation || '').trim());
  try {
    const currentClaim = await getCurrentTaxExemptionForRegistration(env, reference);
    if (currentClaim && ['pending', 'replacement_required', 'approved'].includes(currentClaim.status)) {
      const message =
        currentClaim.status === 'approved'
          ? 'This parish already has an approved sales-tax exemption. Contact AGAPAY support if the legal exemption details have changed.'
          : currentClaim.status === 'replacement_required'
            ? 'A replacement document is already requested for this exemption. Upload the new document to the existing claim.'
            : 'A sales-tax exemption request is already pending. Upload or replace its document instead of submitting a duplicate request.';
      return json({ error: message, claim: taxExemptionToJson(currentClaim) }, { status: 409 });
    }
    const taxExemptionId = await createTaxExemptionClaim(env, {
      registrationReference: reference,
      parishId,
      jurisdiction,
      exemptionType,
      certificateNumber: body.certificateNumber || '',
      effectiveDate: body.effectiveDate || '',
      expirationDate: body.expirationDate || '',
      authorizedRepresentativeName: representativeName,
      authorizedRepresentativeTitle: representativeTitle,
      actorUserId: registration.treasurerEmail || registration.priestEmail || '',
      supersedesTaxExemptionId: currentClaim?.id || null,
      internalReviewStatus: needsManualReviewFlag ? 'needs_manual_review' : null,
    });
    await saveRegistrationRecord(
      env,
      reference,
      {
        ...registration,
        taxExemptionStatus: 'pending',
        currentTaxExemptionId: taxExemptionId,
      },
      registration
    );
    if (d1(env)) {
      await d1Run(
        env,
        `UPDATE registrations SET tax_exemption_status = 'pending', current_tax_exemption_id = ?1 WHERE reference = ?2`,
        taxExemptionId,
        reference
      );
    }
    return json(
      {
        ok: true,
        taxExemptionId,
        requiresCertificate,
        message: requiresCertificate
          ? 'Claim submitted. Upload your exemption document to complete the request.'
          : 'Claim submitted for review. No certificate is required for this jurisdiction.',
      },
      { status: 201 }
    );
  } catch (error) {
    return json({ error: error.message || 'Could not submit exemption claim.' }, { status: 422 });
  }
}
async function handleClaimScopedDocumentUpload(request, env, taxExemptionId) {
  const limited = await rateLimit(request, env, 'tax-exemption-claim-upload', { limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!isTaxExemptionDocumentUploadEnabled(env)) {
    return json(
      { error: 'Document upload is temporarily unavailable. Please try again later or contact support@agapay.app.' },
      { status: 503 }
    );
  }
  const token = getBearerToken(request) || new URL(request.url).searchParams.get('token') || '';
  const claim = await verifyClaimUploadToken(env, taxExemptionId, token);
  if (!claim)
    return json(
      {
        error:
          'This upload link has expired or is invalid. Please return to your registration confirmation and try again, or contact support@agapay.app.',
      },
      { status: 401 }
    );
  if (!['pending', 'replacement_required'].includes(claim.status)) {
    return json({ error: `Cannot upload a document while the claim is '${claim.status}'.` }, { status: 409 });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data with a 'document' file field." }, { status: 400 });
  }
  const file = form.get('document');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No document file was included.' }, { status: 422 });
  }
  const arrayBuffer = await file.arrayBuffer();
  const validation = await validateExemptionUpload({
    filename: file.name,
    declaredMimeType: file.type,
    arrayBuffer,
  });
  if (!validation.ok) return json({ error: validation.error }, { status: 422 });
  const owner = await d1First(
    env,
    'SELECT parish_id FROM registrations WHERE reference=?1',
    claim.registration_reference
  );
  const storageKey = await putExemptionDocument(env, {
    parishId: owner?.parish_id,
    arrayBuffer,
    mimeType: validation.mimeType,
  });
  const documentId = await attachTaxExemptionDocument(env, {
    taxExemptionId: claim.id,
    registrationReference: claim.registration_reference,
    storageKey,
    originalFilename: String(file.name || 'document'),
    sanitizedFilename: sanitizeFilename(file.name),
    mimeType: validation.mimeType,
    fileSize: arrayBuffer.byteLength,
    sha256: await sha256Hex(arrayBuffer),
    uploadedByUserId: 'registration_form',
  });
  return json({ ok: true, documentId }, { status: 201 });
}
async function handleParishTaxExemptionDocumentUpload(request, env, parishId) {
  const limited = await rateLimit(request, env, 'tax-exemption-upload', { limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!isTaxExemptionDocumentUploadEnabled(env)) {
    return json(
      { error: 'Document upload is temporarily unavailable. Please try again later or contact support@agapay.app.' },
      { status: 503 }
    );
  }
  const auth = await requireParishAuth(request, env, parishId);
  if (auth.error) return auth.error;
  const { registration, reference } = auth;
  const claim = await getCurrentTaxExemptionForRegistration(env, reference);
  if (!claim) return json({ error: 'No exemption claim exists for this organization yet.' }, { status: 404 });
  if (!['pending', 'replacement_required'].includes(claim.status)) {
    return json({ error: `Cannot upload a document while the claim is '${claim.status}'.` }, { status: 409 });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data with a 'document' file field." }, { status: 400 });
  }
  const file = form.get('document');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No document file was included.' }, { status: 422 });
  }
  const arrayBuffer = await file.arrayBuffer();
  const validation = await validateExemptionUpload({
    filename: file.name,
    declaredMimeType: file.type,
    arrayBuffer,
  });
  if (!validation.ok) return json({ error: validation.error }, { status: 422 });
  const storageKey = await putExemptionDocument(env, { parishId, arrayBuffer, mimeType: validation.mimeType });
  const documentId = await attachTaxExemptionDocument(env, {
    taxExemptionId: claim.id,
    registrationReference: reference,
    storageKey,
    originalFilename: String(file.name || 'document'),
    sanitizedFilename: sanitizeFilename(file.name),
    mimeType: validation.mimeType,
    fileSize: arrayBuffer.byteLength,
    sha256: await sha256Hex(arrayBuffer),
    uploadedByUserId: registration.treasurerEmail || registration.priestEmail || '',
  });
  return json({ ok: true, documentId }, { status: 201 });
}
async function handleParishTaxExemptionDocumentView(request, env, parishId) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const auth = await requireParishAuth(request, env, parishId);
  if (auth.error) return auth.error;
  const { registration, reference } = auth;
  const claim = await getCurrentTaxExemptionForRegistration(env, reference);
  if (!claim) return json({ error: 'No exemption claim found.' }, { status: 404 });
  const document = await getCurrentTaxExemptionDocument(env, claim.id);
  if (!document) return json({ error: 'No document on file.' }, { status: 404 });
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId: claim.id,
    documentId: document.id,
    registrationReference: reference,
    action: 'document_viewed',
    actorType: 'parish',
    actorUserId: registration.treasurerEmail || registration.priestEmail || '',
  });
  return streamExemptionDocument(env, {
    storageKey: document.storage_key,
    mimeType: document.mime_type,
    sanitizedFilename: document.sanitized_filename,
    mode: 'inline',
  });
}
export {
  handleClaimScopedDocumentUpload,
  handleParishTaxExemptionClaim,
  handleParishTaxExemptionDocumentUpload,
  handleParishTaxExemptionDocumentView,
  handleTaxExemptionStateGuidance,
  requireParishAuth,
};
