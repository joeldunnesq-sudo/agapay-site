import type {
  ParishRegistration,
  TaxEnvironment,
  TaxRegistration,
  TaxRequestBody,
} from './tax-exemption-composition-contracts.js';

// src/handlers/tax-exemption.js
//
// Parish-facing claim/upload/self-view routes and AGAPAY admin review
// routes for the sales-tax exemption workflow. Mounted from src/worker.js.

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
export async function requireParishAuth(request: Request, env: TaxEnvironment, parishId: string) {
  const found = await findRegistrationByParishId<ParishRegistration & TaxRegistration & { reference: string }>(
    env,
    parishId
  );
  if (!found) return { error: json({ error: 'Parish not found' }, { status: 404 }) };
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { error: unauthorized() };
  }
  return { registration: found.registration, reference: found.registration.reference };
}

// ---------------------------------------------------------------------
// GET /api/tax-exemption/state-guidance?state=OR
// Public, informational only -- returns display copy for the
// no-statewide-general-sales-tax states. Never used to decide anything
// server-side; the browser only ever shows text based on this.
// ---------------------------------------------------------------------
export async function handleTaxExemptionStateGuidance(request: Request, env: TaxEnvironment) {
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
    guidance: applies
      ? NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY[state as keyof typeof NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY] || ''
      : '',
    requiresCertificateByDefault: true,
    defaultClaimsExemptionAnswer: 'no',
  });
}

// ---------------------------------------------------------------------
// Parish-facing: create/view a claim, upload/view a document.
// Mounted at /api/parish/dashboard/:parishId/tax-exemption[...]
// ---------------------------------------------------------------------

export async function handleParishTaxExemptionClaim(request: Request, env: TaxEnvironment, parishId: string) {
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

  let body: TaxRequestBody;
  try {
    body = (await request.json()) as TaxRequestBody;
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
  // Every jurisdiction requires the same document if an exemption is
  // claimed. No jurisdiction -- including AK, DE, MT, NH, OR -- gets a
  // certificate-free path merely because it has no statewide general sales
  // tax. If AGAPAY later determines a specific claim genuinely has no
  // applicable certificate, that's a case-by-case admin decision made
  // during review (e.g. via requestReplacementDocumentation or a note),
  // never a blanket rule keyed on the state.
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
    // saveRegistrationRecord's INSERT...ON CONFLICT only touches its own
    // fixed column list (it doesn't know about tax_exemption_* columns),
    // so keep the promoted/cached registrations columns in sync directly --
    // transitionTaxExemption() (src/lib/tax-exemption.js) does the same for
    // every later status change.
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
    return json({ error: (error as Error).message || 'Could not submit exemption claim.' }, { status: 422 });
  }
}

// ---------------------------------------------------------------------
// Claim-scoped upload: used right after registration, before the parish
// has a dashboard bearer token. Authorization is the short-lived,
// claim-bound upload token (see issueClaimUploadToken/verifyClaimUploadToken
// in src/lib/tax-exemption.js) rather than a session -- narrowly scoped to
// this exact taxExemptionId, expires quickly, never exposes the R2 storage
// key to the browser.
// Mounted at POST /api/tax-exemption/:taxExemptionId/upload
// ---------------------------------------------------------------------
export async function handleClaimScopedDocumentUpload(request: Request, env: TaxEnvironment, taxExemptionId: string) {
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
  const file = form.get('document') as File | null;
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

  const owner = await d1First<{ parish_id: string }>(
    env,
    'SELECT parish_id FROM registrations WHERE reference=?1',
    claim.registration_reference
  );
  const storageKey = await putExemptionDocument(env, {
    parishId: owner?.parish_id as string,
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

  // Storage key is never returned to the browser -- only an opaque
  // document id, matching the "do not expose the R2 storage key"
  // requirement.
  return json({ ok: true, documentId }, { status: 201 });
}

export async function handleParishTaxExemptionDocumentUpload(request: Request, env: TaxEnvironment, parishId: string) {
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
  const file = form.get('document') as File | null;
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

export async function handleParishTaxExemptionDocumentView(request: Request, env: TaxEnvironment, parishId: string) {
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
