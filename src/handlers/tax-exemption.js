// src/handlers/tax-exemption.js
//
// Parish-facing claim/upload/self-view routes and AGAPAY admin review
// routes for the sales-tax exemption workflow. Mounted from src/worker.js.

import { json, unauthorized, getBearerToken, hasProductionStore, missingProductionStoreResponse, rateLimit, d1, d1All, d1Run, d1First } from "../lib/core.js";
import {
  loadRegistrationByReference,
  findRegistrationByParishId,
  requireAdminContext,
  verifyParishDashboardBearer,
  saveRegistrationRecord
} from "./parish.js";
import {
  createTaxExemptionClaim,
  attachTaxExemptionDocument,
  getTaxExemptionById,
  getCurrentTaxExemptionForRegistration,
  listTaxExemptionDocuments,
  getCurrentTaxExemptionDocument,
  listTaxExemptionAuditLog,
  listTaxExemptionNotes,
  addTaxExemptionNote,
  taxExemptionToJson,
  approveTaxExemption,
  approveTaxExemptionWithoutStripeSync,
  rejectTaxExemption,
  requestReplacementDocumentation,
  revokeTaxExemption,
  expireTaxExemptionManually,
  StaleRecordError,
  runAllPendingStripeSyncs,
  retryOneStripeSync,
  reconcileStripeSync,
  writeTaxExemptionAuditLog,
  verifyClaimUploadToken,
  maskCertificateNumber,
  aggregateSyncState,
  computeAllowedActions,
  getTaxExemptionSummaryCounts,
  isTaxExemptionWorkflowEnabled,
  isTaxExemptionDocumentUploadEnabled,
  isTaxExemptionStripeSyncEnabled,
  CUSTOMER_ROLE_LABELS
} from "../lib/tax-exemption.js";
import {
  validateExemptionUpload,
  sha256Hex,
  sanitizeFilename,
  putExemptionDocument,
  streamExemptionDocument
} from "../lib/tax-exemption-storage.js";
import { hasNoStatewideGeneralSalesTax, NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY } from "../lib/tax-codes.js";

const VALID_JURISDICTIONS = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","FEDERAL","OTHER"
]);

function normalizeJurisdiction(value) {
  return String(value || "").trim().toUpperCase();
}

// Jurisdictions that get routed to manual review by default because the
// claim itself is inherently ambiguous (multistate use, or a jurisdiction
// the parish couldn't map to a specific state). This is NOT keyed on
// NO_STATEWIDE_GENERAL_SALES_TAX_STATES -- a parish in Oregon (or Alaska,
// Delaware, Montana, New Hampshire) claiming a genuine exemption is
// reviewed exactly like a parish in any other state. The absence of a
// statewide general sales tax is informational only (see
// hasNoStatewideGeneralSalesTax()) and never changes document
// requirements, claim creation, or Stripe tax_exempt handling.
const JURISDICTIONS_REQUIRING_MANUAL_REVIEW_FLAG = new Set(["OTHER"]);

async function requireParishAuth(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: "Parish not found" }, { status: 404 }) };
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
export async function handleTaxExemptionStateGuidance(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const url = new URL(request.url);
  const state = normalizeJurisdiction(url.searchParams.get("state"));
  const applies = hasNoStatewideGeneralSalesTax(state);
  return json({
    state,
    hasNoStatewideGeneralSalesTax: applies,
    // Informational only -- never used server-side to decide claim
    // creation, document requirements, or Stripe tax_exempt handling.
    // A parish in one of these states is not automatically tax-exempt, and
    // the absence of a statewide general sales tax never waives the
    // document requirement for an affirmative exemption claim.
    guidance: applies ? NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY[state] || "" : "",
    requiresCertificateByDefault: true,
    defaultClaimsExemptionAnswer: "no"
  });
}

// ---------------------------------------------------------------------
// Parish-facing: create/view a claim, upload/view a document.
// Mounted at /api/parish/dashboard/:parishId/tax-exemption[...]
// ---------------------------------------------------------------------

export async function handleParishTaxExemptionClaim(request, env, parishId) {
  const limited = await rateLimit(request, env, "tax-exemption-claim", { limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const auth = await requireParishAuth(request, env, parishId);
  if (auth.error) return auth.error;
  const { registration, reference } = auth;

  if (request.method === "GET") {
    const claim = await getCurrentTaxExemptionForRegistration(env, reference);
    if (!claim) return json({ claim: null });
    const documents = await listTaxExemptionDocuments(env, claim.id);
    return json({
      claim: taxExemptionToJson(claim),
      hasDocument: documents.some((d) => Number(d.is_current) === 1)
    });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const claimsExemption = body.claimsExemption === true || body.claimsExemption === "yes";
  if (!claimsExemption) {
    return json({ ok: true, claim: null, message: "No exemption claimed." });
  }

  const jurisdiction = normalizeJurisdiction(body.jurisdiction);
  if (!VALID_JURISDICTIONS.has(jurisdiction)) {
    return json({ error: "Choose a valid exemption jurisdiction." }, { status: 422 });
  }

  const representativeName = String(body.authorizedRepresentativeName || "").trim();
  const representativeTitle = String(body.authorizedRepresentativeTitle || "").trim();
  const certified = body.certified === true;
  if (!representativeName || !representativeTitle) {
    return json({ error: "Authorized representative name and title are required." }, { status: 422 });
  }
  if (!certified) {
    return json({ error: "You must certify the exemption claim to submit it." }, { status: 422 });
  }

  if (jurisdiction === "OTHER" && !String(body.multistateExplanation || "").trim()) {
    return json({ error: "Please explain the jurisdiction or multistate use this exemption relates to." }, { status: 422 });
  }

  const exemptionType = String(body.exemptionType || "").trim() || "religious_organization";
  // Every jurisdiction requires the same document if an exemption is
  // claimed. No jurisdiction -- including AK, DE, MT, NH, OR -- gets a
  // certificate-free path merely because it has no statewide general sales
  // tax. If AGAPAY later determines a specific claim genuinely has no
  // applicable certificate, that's a case-by-case admin decision made
  // during review (e.g. via requestReplacementDocumentation or a note),
  // never a blanket rule keyed on the state.
  const requiresCertificate = true;
  const needsManualReviewFlag = JURISDICTIONS_REQUIRING_MANUAL_REVIEW_FLAG.has(jurisdiction)
    || Boolean(String(body.multistateExplanation || "").trim());

  try {
    const taxExemptionId = await createTaxExemptionClaim(env, {
      registrationReference: reference,
      parishId,
      jurisdiction,
      exemptionType,
      certificateNumber: body.certificateNumber || "",
      effectiveDate: body.effectiveDate || "",
      expirationDate: body.expirationDate || "",
      authorizedRepresentativeName: representativeName,
      authorizedRepresentativeTitle: representativeTitle,
      actorUserId: registration.treasurerEmail || registration.priestEmail || "",
      internalReviewStatus: needsManualReviewFlag ? "needs_manual_review" : null
    });

    await saveRegistrationRecord(env, reference, {
      ...registration,
      taxExemptionStatus: "pending",
      currentTaxExemptionId: taxExemptionId
    }, registration);
    // saveRegistrationRecord's INSERT...ON CONFLICT only touches its own
    // fixed column list (it doesn't know about tax_exemption_* columns),
    // so keep the promoted/cached registrations columns in sync directly --
    // transitionTaxExemption() (src/lib/tax-exemption.js) does the same for
    // every later status change.
    if (d1(env)) {
      await d1Run(env, `UPDATE registrations SET tax_exemption_status = 'pending', current_tax_exemption_id = ?1 WHERE reference = ?2`, taxExemptionId, reference);
    }

    return json({
      ok: true,
      taxExemptionId,
      requiresCertificate,
      message: requiresCertificate
        ? "Claim submitted. Upload your exemption document to complete the request."
        : "Claim submitted for review. No certificate is required for this jurisdiction."
    }, { status: 201 });
  } catch (error) {
    return json({ error: error.message || "Could not submit exemption claim." }, { status: 422 });
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
export async function handleClaimScopedDocumentUpload(request, env, taxExemptionId) {
  const limited = await rateLimit(request, env, "tax-exemption-claim-upload", { limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!isTaxExemptionDocumentUploadEnabled(env)) {
    return json({ error: "Document upload is temporarily unavailable. Please try again later or contact support@agapay.app." }, { status: 503 });
  }

  const token = getBearerToken(request) || new URL(request.url).searchParams.get("token") || "";
  const claim = await verifyClaimUploadToken(env, taxExemptionId, token);
  if (!claim) return json({ error: "This upload link has expired or is invalid. Please return to your registration confirmation and try again, or contact support@agapay.app." }, { status: 401 });
  if (!["pending", "replacement_required"].includes(claim.status)) {
    return json({ error: `Cannot upload a document while the claim is '${claim.status}'.` }, { status: 409 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data with a 'document' file field." }, { status: 400 });
  }
  const file = form.get("document");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "No document file was included." }, { status: 422 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const validation = await validateExemptionUpload({
    filename: file.name,
    declaredMimeType: file.type,
    arrayBuffer
  });
  if (!validation.ok) return json({ error: validation.error }, { status: 422 });

  const storageKey = await putExemptionDocument(env, { arrayBuffer, mimeType: validation.mimeType });
  const documentId = await attachTaxExemptionDocument(env, {
    taxExemptionId: claim.id,
    registrationReference: claim.registration_reference,
    storageKey,
    originalFilename: String(file.name || "document"),
    sanitizedFilename: sanitizeFilename(file.name),
    mimeType: validation.mimeType,
    fileSize: arrayBuffer.byteLength,
    sha256: await sha256Hex(arrayBuffer),
    uploadedByUserId: "registration_form"
  });

  // Storage key is never returned to the browser -- only an opaque
  // document id, matching the "do not expose the R2 storage key"
  // requirement.
  return json({ ok: true, documentId }, { status: 201 });
}

export async function handleParishTaxExemptionDocumentUpload(request, env, parishId) {
  const limited = await rateLimit(request, env, "tax-exemption-upload", { limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!isTaxExemptionDocumentUploadEnabled(env)) {
    return json({ error: "Document upload is temporarily unavailable. Please try again later or contact support@agapay.app." }, { status: 503 });
  }

  const auth = await requireParishAuth(request, env, parishId);
  if (auth.error) return auth.error;
  const { registration, reference } = auth;

  const claim = await getCurrentTaxExemptionForRegistration(env, reference);
  if (!claim) return json({ error: "No exemption claim exists for this organization yet." }, { status: 404 });
  if (!["pending", "replacement_required"].includes(claim.status)) {
    return json({ error: `Cannot upload a document while the claim is '${claim.status}'.` }, { status: 409 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data with a 'document' file field." }, { status: 400 });
  }
  const file = form.get("document");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "No document file was included." }, { status: 422 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const validation = await validateExemptionUpload({
    filename: file.name,
    declaredMimeType: file.type,
    arrayBuffer
  });
  if (!validation.ok) return json({ error: validation.error }, { status: 422 });

  const storageKey = await putExemptionDocument(env, { arrayBuffer, mimeType: validation.mimeType });
  const documentId = await attachTaxExemptionDocument(env, {
    taxExemptionId: claim.id,
    registrationReference: reference,
    storageKey,
    originalFilename: String(file.name || "document"),
    sanitizedFilename: sanitizeFilename(file.name),
    mimeType: validation.mimeType,
    fileSize: arrayBuffer.byteLength,
    sha256: await sha256Hex(arrayBuffer),
    uploadedByUserId: registration.treasurerEmail || registration.priestEmail || ""
  });

  return json({ ok: true, documentId }, { status: 201 });
}

export async function handleParishTaxExemptionDocumentView(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const auth = await requireParishAuth(request, env, parishId);
  if (auth.error) return auth.error;
  const { registration, reference } = auth;

  const claim = await getCurrentTaxExemptionForRegistration(env, reference);
  if (!claim) return json({ error: "No exemption claim found." }, { status: 404 });
  const document = await getCurrentTaxExemptionDocument(env, claim.id);
  if (!document) return json({ error: "No document on file." }, { status: 404 });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId: claim.id,
    documentId: document.id,
    registrationReference: reference,
    action: "document_viewed",
    actorType: "parish",
    actorUserId: registration.treasurerEmail || registration.priestEmail || ""
  });

  return streamExemptionDocument(env, {
    storageKey: document.storage_key,
    mimeType: document.mime_type,
    sanitizedFilename: document.sanitized_filename,
    mode: "inline"
  });
}

// ---------------------------------------------------------------------
// Admin-facing review queue and actions.
// Mounted at /api/admin/tax-exemptions[...]
// ---------------------------------------------------------------------

export async function handleAdminTaxExemptionQueue(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!d1(env)) return json({ claims: [] });

  const url = new URL(request.url);
  const statusFilter = String(url.searchParams.get("status") || "").trim();
  const stateFilter = String(url.searchParams.get("state") || "").trim().toUpperCase();
  const jurisdictionFilter = String(url.searchParams.get("jurisdiction") || "").trim().toUpperCase();
  const exemptionTypeFilter = String(url.searchParams.get("exemptionType") || "").trim();
  const search = String(url.searchParams.get("q") || "").trim();
  // Derived/virtual filters that need a join or post-filter rather than a
  // plain WHERE on tax_exemptions.status:
  const virtualFilter = ["sync_failed", "sync_pending", "partial_sync", "reconciliation_required", "waiting_for_customer", "pending_without_document", "expiring_soon"].includes(statusFilter)
    ? statusFilter
    : "";

  const where = [];
  const params = [];
  if (statusFilter && !virtualFilter) { where.push("t.status = ?"); params.push(statusFilter); }
  if (jurisdictionFilter) { where.push("t.jurisdiction = ?"); params.push(jurisdictionFilter); }
  if (exemptionTypeFilter) { where.push("t.exemption_type = ?"); params.push(exemptionTypeFilter); }

  let rows = await d1All(
    env,
    `SELECT t.* FROM tax_exemptions t
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY t.updated_at DESC LIMIT 500`,
    ...params
  );

  // Enrich each row with what the queue needs to render without a second
  // round-trip per row from the browser: registration name/state (for
  // state-filter/search and display), current document existence, and
  // aggregate Stripe sync state. Scale here is inherently small (a niche
  // admin review workflow, not a high-volume table), so N+1 lookups against
  // indexed tables are an acceptable, simple tradeoff over a larger joined
  // query -- revisit if claim volume ever grows into the thousands.
  const enriched = [];
  for (const row of rows) {
    const registration = await loadRegistrationByReference(env, row.registration_reference);
    if (stateFilter && String(registration?.state || "").toUpperCase() !== stateFilter) continue;
    if (search) {
      const haystack = `${registration?.parishName || ""} ${row.registration_reference} ${registration?.parishId || ""}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) continue;
    }
    const syncRows = await d1All(env, `SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1`, row.id);
    const currentDoc = await getCurrentTaxExemptionDocument(env, row.id);
    const sync = aggregateSyncState(row, syncRows);
    const expiringSoon = row.status === "approved" && row.expiration_date
      && row.expiration_date >= new Date().toISOString().slice(0, 10)
      && row.expiration_date <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    if (virtualFilter === "sync_failed" && sync !== "failed") continue;
    if (virtualFilter === "sync_pending" && sync !== "pending") continue;
    if (virtualFilter === "partial_sync" && sync !== "partial") continue;
    if (virtualFilter === "reconciliation_required" && sync !== "reconciliation_required") continue;
    if (virtualFilter === "waiting_for_customer" && sync !== "waiting_for_customer") continue;
    if (virtualFilter === "pending_without_document" && !(["pending", "replacement_required"].includes(row.status) && !currentDoc)) continue;
    if (virtualFilter === "expiring_soon" && !expiringSoon) continue;

    enriched.push({
      ...taxExemptionToJson(row),
      parishName: registration?.parishName || "",
      parishId: registration?.parishId || "",
      state: registration?.state || "",
      maskedCertificateNumber: maskCertificateNumber(row.certificate_number),
      hasDocument: Boolean(currentDoc),
      aggregateSyncState: sync,
      expiringSoon
    });
  }

  return json({ claims: enriched.slice(0, 200) });
}

export async function handleAdminTaxExemptionSummary(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  const counts = await getTaxExemptionSummaryCounts(env);
  return json({ counts, workflowEnabled: isTaxExemptionWorkflowEnabled(env), stripeSyncEnabled: isTaxExemptionStripeSyncEnabled(env) });
}

export async function handleAdminTaxExemptionDetail(request, env, taxExemptionId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: "Not found" }, { status: 404 });

  const registration = await loadRegistrationByReference(env, claim.registration_reference);
  const documents = await listTaxExemptionDocuments(env, taxExemptionId);
  const auditLog = await listTaxExemptionAuditLog(env, taxExemptionId);
  const notes = await listTaxExemptionNotes(env, taxExemptionId);
  const syncRows = await d1All(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1 ORDER BY created_at`, taxExemptionId);
  const currentDoc = documents.find((d) => Number(d.is_current) === 1) || null;
  const sync = aggregateSyncState(claim, syncRows);
  const workflowEnabled = isTaxExemptionWorkflowEnabled(env);
  const stateUpper = String(registration?.state || "").toUpperCase();

  return json({
    claim: {
      ...taxExemptionToJson(claim),
      maskedCertificateNumber: maskCertificateNumber(claim.certificate_number),
      recordVersion: claim.updated_at
    },
    registration: registration ? {
      reference: registration.reference,
      parishName: registration.parishName,
      parishId: registration.parishId,
      registrationStatus: registration.status,
      addressLine1: registration.addressLine1,
      addressLine2: registration.addressLine2,
      city: registration.city,
      state: registration.state,
      postalCode: registration.postalCode,
      contactEmail: registration.treasurerEmail || registration.priestEmail || "",
      contactName: registration.treasurerFirst ? `${registration.treasurerFirst} ${registration.treasurerLast || ""}`.trim() : "",
      stripeCustomerId: registration.stripeCustomerId || "",
      stewardshipStripeCustomerId: registration.stewardshipStripeCustomerId || "",
      hasNoStatewideGeneralSalesTax: hasNoStatewideGeneralSalesTax(stateUpper),
      noStatewideGeneralSalesTaxGuidance: hasNoStatewideGeneralSalesTax(stateUpper) ? NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY[stateUpper] || "" : ""
    } : null,
    documents: documents.map((d) => ({
      id: d.id, originalFilename: d.original_filename, mimeType: d.mime_type,
      fileSize: d.file_size, uploadedAt: d.uploaded_at, isCurrent: Number(d.is_current) === 1,
      archivedAt: d.archived_at, replacesDocumentId: d.replaces_document_id
    })),
    auditLog: auditLog.map((a) => ({
      id: a.id, action: a.action, actorType: a.actor_type, actorUserId: a.actor_user_id,
      metadata: a.metadata_json ? JSON.parse(a.metadata_json) : {}, createdAt: a.created_at
    })),
    notes: notes.map((n) => ({ id: n.id, note: n.note, actorUserId: n.actor_user_id, createdAt: n.created_at })),
    stripeSyncs: syncRows.map((s) => ({
      id: s.id, stripeCustomerId: s.stripe_customer_id, customerRole: s.customer_role,
      customerRoleLabel: CUSTOMER_ROLE_LABELS[s.customer_role] || s.customer_role,
      desiredStatus: s.desired_tax_exempt_status, previousStatus: s.previous_tax_exempt_status,
      agapayOwnedChange: Number(s.agapay_owned_change) === 1,
      syncStatus: s.sync_status, lastError: s.last_error, attemptCount: s.attempt_count,
      attemptedAt: s.attempted_at, syncedAt: s.synced_at, stripeRequestId: s.stripe_request_id
    })),
    hasCurrentDocument: Boolean(currentDoc),
    aggregateSyncState: sync,
    workflowEnabled,
    stripeSyncEnabled: isTaxExemptionStripeSyncEnabled(env),
    allowedActions: computeAllowedActions(claim, { hasDocument: Boolean(currentDoc), syncRows, workflowEnabled })
  });
}

function staleRecordResponse(err) {
  return json({
    ok: false,
    code: "STALE_RECORD",
    message: err.message,
    currentVersion: err.currentVersion,
    currentStatus: err.currentStatus
  }, { status: 409 });
}

async function loadClaimAndRegistration(env, taxExemptionId) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return { error: json({ error: "Not found" }, { status: 404 }) };
  const registration = await loadRegistrationByReference(env, claim.registration_reference);
  if (!registration) return { error: json({ error: "Registration not found" }, { status: 404 }) };
  return { claim, registration };
}

export async function handleAdminTaxExemptionApprove(request, env, taxExemptionId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }
  const expectedVersion = body.expectedVersion || "";

  try {
    const result = isTaxExemptionStripeSyncEnabled(env)
      ? await approveTaxExemption(env, { taxExemptionId, registration, actor: adminContext.actor, expectedVersion })
      : await approveTaxExemptionWithoutStripeSync(env, { taxExemptionId, actor: adminContext.actor, expectedVersion });
    return json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: err.message || "Approval failed" }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionReject(request, env, taxExemptionId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }

  try {
    const result = await rejectTaxExemption(env, { taxExemptionId, registration, actor: adminContext.actor, reason: String(body.reason || "").trim(), expectedVersion: body.expectedVersion || "" });
    return json(result);
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: err.message || "Rejection failed" }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionRequestReplacement(request, env, taxExemptionId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }

  try {
    const result = await requestReplacementDocumentation(env, {
      taxExemptionId, registration, actor: adminContext.actor,
      reason: String(body.reason || "").trim(),
      keepActiveDuringReplacement: body.keepActiveDuringReplacement === true,
      expectedVersion: body.expectedVersion || ""
    });
    return json(result);
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: err.message || "Request failed" }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionRevoke(request, env, taxExemptionId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }

  try {
    const result = await revokeTaxExemption(env, { taxExemptionId, registration, actor: adminContext.actor, reason: String(body.reason || "").trim(), expectedVersion: body.expectedVersion || "" });
    return json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: err.message || "Revocation failed" }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionExpire(request, env, taxExemptionId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }
  const reason = String(body.reason || "").trim();
  if (!reason) return json({ error: "A reason is required to manually expire an exemption." }, { status: 422 });
  if (body.confirm !== true) return json({ error: "Manual expiration requires explicit confirmation (confirm: true)." }, { status: 422 });

  try {
    const result = await expireTaxExemptionManually(env, {
      taxExemptionId, registration, actor: adminContext.actor, reason, expectedVersion: body.expectedVersion || ""
    });
    return json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: err.message || "Manual expiration failed" }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionRetrySync(request, env, taxExemptionId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: "Not found" }, { status: 404 });

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }
  if (body.expectedVersion && claim.updated_at !== body.expectedVersion) {
    return staleRecordResponse(new StaleRecordError(
      "This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.",
      { currentVersion: claim.updated_at, currentStatus: claim.status }
    ));
  }

  const summary = await runAllPendingStripeSyncs(env, taxExemptionId);
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: summary.failed > 0 ? "stripe_sync_partial" : "stripe_sync_succeeded",
    actorType: "admin", actorUserId: adminContext.actor, metadata: summary
  });

  // If every customer now succeeds and the claim was still pending/
  // replacement_required (approval was previously blocked on a failed
  // sync), finalize the approval now.
  if (summary.failed === 0 && ["pending", "replacement_required"].includes(claim.status)) {
    const registration = await loadRegistrationByReference(env, claim.registration_reference);
    if (registration) {
      const finalized = await approveTaxExemption(env, { taxExemptionId, registration, actor: adminContext.actor });
      return json(finalized);
    }
  }

  return json({ ok: summary.failed === 0, summary });
}

export async function handleAdminTaxExemptionDocumentView(request, env, taxExemptionId, mode = "inline") {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: "Not found" }, { status: 404 });
  const document = await getCurrentTaxExemptionDocument(env, taxExemptionId);
  if (!document) return json({ error: "No document on file." }, { status: 404 });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, documentId: document.id, registrationReference: claim.registration_reference,
    action: mode === "attachment" ? "document_downloaded" : "document_viewed",
    actorType: "admin", actorUserId: adminContext.actor
  });

  return streamExemptionDocument(env, {
    storageKey: document.storage_key,
    mimeType: document.mime_type,
    sanitizedFilename: document.sanitized_filename,
    mode
  });
}

async function loadSyncRowScopedToExemption(env, taxExemptionId, syncId) {
  const row = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncId);
  if (!row || row.tax_exemption_id !== taxExemptionId) return null;
  return row;
}

export async function handleAdminTaxExemptionSyncRetry(request, env, taxExemptionId, syncId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: "Exemption not found" }, { status: 404 });
  const syncRow = await loadSyncRowScopedToExemption(env, taxExemptionId, syncId);
  if (!syncRow) return json({ error: "This Customer sync row does not belong to this exemption." }, { status: 404 });

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }
  if (body.expectedVersion && claim.updated_at !== body.expectedVersion) {
    return staleRecordResponse(new StaleRecordError(
      "This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.",
      { currentVersion: claim.updated_at, currentStatus: claim.status }
    ));
  }

  if (syncRow.sync_status === "succeeded") {
    return json({ error: "This Customer already succeeded -- nothing to retry." }, { status: 409 });
  }
  if (syncRow.sync_status === "reconciliation_required") {
    return json({ error: "This Customer requires reconciliation, not a plain retry. Use the reconcile action." }, { status: 409 });
  }

  const result = await retryOneStripeSync(env, syncId);
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: result.ok ? "stripe_sync_succeeded" : "stripe_sync_failed",
    actorType: "admin", actorUserId: adminContext.actor,
    metadata: { syncId, stripeCustomerId: syncRow.stripe_customer_id, retryOne: true }
  });

  const refreshedRow = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncId);
  const allSyncRows = await d1All(env, `SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1`, taxExemptionId);
  return json({
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    syncRow: refreshedRow ? {
      id: refreshedRow.id, stripeCustomerId: refreshedRow.stripe_customer_id,
      syncStatus: refreshedRow.sync_status, lastError: refreshedRow.last_error, attemptCount: refreshedRow.attempt_count
    } : null,
    aggregateSyncState: aggregateSyncState(claim, allSyncRows)
  }, { status: result.ok ? 200 : 409 });
}

const RECONCILE_ACTIONS = new Set(["accept_external", "force_apply"]);

export async function handleAdminTaxExemptionSyncReconcile(request, env, taxExemptionId, syncId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: "The sales-tax exemption workflow is currently disabled." }, { status: 403 });
  }

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: "Exemption not found" }, { status: 404 });
  const syncRow = await loadSyncRowScopedToExemption(env, taxExemptionId, syncId);
  if (!syncRow) return json({ error: "This Customer sync row does not belong to this exemption." }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = String(body.action || "");
  if (!RECONCILE_ACTIONS.has(action)) {
    return json({ error: "action must be 'accept_external' or 'force_apply'." }, { status: 422 });
  }
  const reason = String(body.reason || "").trim();
  if (!reason) return json({ error: "A reason is required to reconcile a Customer." }, { status: 422 });
  if (action === "force_apply" && body.confirm !== true) {
    return json({ error: "force_apply requires explicit confirmation (confirm: true)." }, { status: 422 });
  }
  if (body.expectedVersion && claim.updated_at !== body.expectedVersion) {
    return staleRecordResponse(new StaleRecordError(
      "This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.",
      { currentVersion: claim.updated_at, currentStatus: claim.status }
    ));
  }

  try {
    const result = await reconcileStripeSync(env, { syncRowId: syncId, actor: adminContext.actor, action });
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId, registrationReference: claim.registration_reference,
      action: "reconciliation_required", actorType: "admin", actorUserId: adminContext.actor,
      metadata: { resolution: action, reason, syncId }
    });

    const refreshedRow = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncId);
    const allSyncRows = await d1All(env, `SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1`, taxExemptionId);
    return json({
      ok: result.ok !== false,
      resolution: action,
      syncRow: refreshedRow ? {
        id: refreshedRow.id, stripeCustomerId: refreshedRow.stripe_customer_id,
        syncStatus: refreshedRow.sync_status, previousStatus: refreshedRow.previous_tax_exempt_status,
        agapayOwnedChange: Number(refreshedRow.agapay_owned_change) === 1
      } : null,
      aggregateSyncState: aggregateSyncState(claim, allSyncRows)
    });
  } catch (err) {
    return json({ error: err.message || "Reconciliation failed" }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionNote(request, env, taxExemptionId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
  const note = String(body.note || "").trim();
  if (!note) return json({ error: "Note text is required." }, { status: 422 });

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: "Not found" }, { status: 404 });

  const id = await addTaxExemptionNote(env, { taxExemptionId, actorUserId: adminContext.actor, note });
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "admin_note_added", actorType: "admin", actorUserId: adminContext.actor
  });
  return json({ ok: true, id }, { status: 201 });
}
