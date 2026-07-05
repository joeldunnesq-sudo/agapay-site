// src/lib/tax-exemption.js
//
// AGAPAY subscription sales-tax-exemption workflow. Applies ONLY to
// AGAPAY's own platform-account subscription Stripe Customers
// (registration.stripeCustomerId for Giving/Parish+,
// registration.stewardshipStripeCustomerId for Stewardship). NEVER touches
// donor Customers, bookstore purchaser Customers (both live on the parish's
// connected account), or AGAPAY Learn household Customers.
//
// All writes to tax_exemptions.status go through transitionTaxExemption()
// below -- no route handler should ever UPDATE that column directly.
//
// Schema: migrations/0011_tax_exemptions.sql.

import { d1, d1First, d1All, d1Run, d1Batch, generateSecret, sha256Hex, secureCompare } from "./core.js";
import { stripeFormRequest, stripeGetRequest } from "./stripe-connect.js";
import { sendEmail, agapayEmailHtml } from "./email.js";

// ---------------------------------------------------------------------
// Phase 3C: top-level kill switches. Default to enabled (preserve current
// behavior) -- these exist purely as an emergency off switch, not a
// staged rollout gate like the Phase 3B flags in tax-codes.js/
// commerce-readiness.js.
// ---------------------------------------------------------------------
export function isTaxExemptionWorkflowEnabled(env = {}) {
  return String(env.TAX_EXEMPTION_WORKFLOW_ENABLED ?? "true").toLowerCase() !== "false";
}
export function isTaxExemptionDocumentUploadEnabled(env = {}) {
  return String(env.TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED ?? "true").toLowerCase() !== "false";
}
export function isTaxExemptionStripeSyncEnabled(env = {}) {
  return String(env.TAX_EXEMPTION_STRIPE_SYNC_ENABLED ?? "true").toLowerCase() !== "false";
}

export const TAX_EXEMPTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "replacement_required",
  "expired",
  "revoked",
  "superseded"
];

// Which statuses a given status may transition to. Anything not listed here
// is rejected by transitionTaxExemption().
const ALLOWED_TRANSITIONS = {
  pending: ["approved", "rejected", "replacement_required", "superseded"],
  approved: ["replacement_required", "expired", "revoked", "superseded"],
  rejected: ["superseded"],
  replacement_required: ["approved", "rejected", "superseded"],
  expired: ["superseded"],
  revoked: ["superseded"],
  superseded: []
};

const STRIPE_SYNC_STATUSES = ["not_started", "pending", "succeeded", "failed", "reconciliation_required"];
const CUSTOMER_ROLES = ["giving_parish_plus", "stewardship"];

function nowIso() {
  return new Date().toISOString();
}

function newTaxExemptionId() {
  return generateSecret("texmp");
}

function newSyncId() {
  return generateSecret("texsync");
}

function newDocumentId() {
  return generateSecret("texdoc");
}

function newAuditId() {
  return generateSecret("texaudit");
}

function newNoteId() {
  return generateSecret("texnote");
}

/**
 * Every mutation to the audit log goes through this one function. Never
 * include file contents, tokens, full Stripe objects, full certificate
 * numbers, or raw Authorization headers in `metadata`.
 */
export async function writeTaxExemptionAuditLog(env, {
  taxExemptionId = null,
  documentId = null,
  registrationReference,
  action,
  actorType,
  actorUserId = "",
  metadata = {}
}) {
  if (!d1(env)) return null;
  await d1Run(
    env,
    `INSERT INTO tax_exemption_audit_log
      (id, tax_exemption_id, document_id, registration_reference, action, actor_type, actor_user_id, metadata_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    newAuditId(),
    taxExemptionId,
    documentId,
    registrationReference,
    action,
    actorType,
    actorUserId || "",
    JSON.stringify(metadata || {}),
    nowIso()
  );
  return true;
}

export function taxExemptionToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    registrationReference: row.registration_reference,
    parishId: row.parish_id,
    jurisdiction: row.jurisdiction,
    exemptionType: row.exemption_type,
    // Full certificate_number is intentionally NEVER included here -- every
    // ordinary queue/detail response gets only the masked form. There is no
    // ordinary code path that should render an unmasked certificate number;
    // a genuine full-reveal need would require its own narrowly-scoped,
    // audit-logged endpoint, which does not exist in this codebase.
    maskedCertificateNumber: maskCertificateNumber(row.certificate_number),
    effectiveDate: row.effective_date,
    expirationDate: row.expiration_date,
    status: row.status,
    internalReviewStatus: row.internal_review_status,
    authorizedRepresentativeName: row.authorized_representative_name,
    authorizedRepresentativeTitle: row.authorized_representative_title,
    certifiedAt: row.certified_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    rejectionReason: row.rejection_reason,
    replacementRequestedAt: row.replacement_requested_at,
    replacementRequestedBy: row.replacement_requested_by,
    replacementReason: row.replacement_reason,
    keepActiveDuringReplacement: Number(row.keep_active_during_replacement) === 1,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    revocationReason: row.revocation_reason,
    supersedesTaxExemptionId: row.supersedes_tax_exemption_id,
    recordVersion: row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const UPLOAD_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes -- short-lived per Phase 3B requirement

/**
 * Issues a random, short-lived upload authorization bound to this exact
 * claim. The raw token is returned to the caller (and from there, to the
 * browser) ONCE -- only its hash is persisted, matching the existing
 * password/session-token pattern already used elsewhere in this codebase
 * (src/lib/core.js hashPassword/sessionTokenHash). Re-issuing invalidates
 * any previously-issued token for the same claim (single active token).
 */
export async function issueClaimUploadToken(env, taxExemptionId) {
  const rawToken = generateSecret("texup");
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_MS).toISOString();
  await d1Run(
    env,
    `UPDATE tax_exemptions SET upload_token_hash = ?1, upload_token_expires_at = ?2, updated_at = ?3 WHERE id = ?4`,
    tokenHash,
    expiresAt,
    nowIso(),
    taxExemptionId
  );
  return { token: rawToken, expiresAt };
}

/**
 * Verifies an upload token against the exact claim it was issued for.
 * Constant-time compare, explicit expiry check. Returns the claim row on
 * success, or null. Does NOT consume/rotate the token -- a claim may need
 * more than one upload attempt (retry) within the token's lifetime.
 */
export async function verifyClaimUploadToken(env, taxExemptionId, token) {
  if (!token) return null;
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim || !claim.upload_token_hash) return null;
  if (!claim.upload_token_expires_at || new Date(claim.upload_token_expires_at).getTime() < Date.now()) return null;
  const submittedHash = await sha256Hex(token);
  if (!secureCompare(submittedHash, claim.upload_token_hash)) return null;
  return claim;
}


export async function getTaxExemptionById(env, id) {
  return d1First(env, `SELECT * FROM tax_exemptions WHERE id = ?1`, id);
}

export async function getCurrentTaxExemptionForRegistration(env, registrationReference) {
  return d1First(
    env,
    `SELECT * FROM tax_exemptions WHERE registration_reference = ?1
     ORDER BY created_at DESC LIMIT 1`,
    registrationReference
  );
}

export async function listTaxExemptionDocuments(env, taxExemptionId) {
  return d1All(
    env,
    `SELECT * FROM tax_exemption_documents WHERE tax_exemption_id = ?1 ORDER BY uploaded_at DESC`,
    taxExemptionId
  );
}

export async function getCurrentTaxExemptionDocument(env, taxExemptionId) {
  return d1First(
    env,
    `SELECT * FROM tax_exemption_documents WHERE tax_exemption_id = ?1 AND is_current = 1 ORDER BY uploaded_at DESC LIMIT 1`,
    taxExemptionId
  );
}

export async function listTaxExemptionAuditLog(env, taxExemptionId) {
  return d1All(
    env,
    `SELECT * FROM tax_exemption_audit_log WHERE tax_exemption_id = ?1 ORDER BY created_at DESC`,
    taxExemptionId
  );
}

export async function listTaxExemptionNotes(env, taxExemptionId) {
  return d1All(
    env,
    `SELECT * FROM tax_exemption_notes WHERE tax_exemption_id = ?1 ORDER BY created_at DESC`,
    taxExemptionId
  );
}

export async function addTaxExemptionNote(env, { taxExemptionId, actorUserId, note }) {
  const id = newNoteId();
  await d1Run(
    env,
    `INSERT INTO tax_exemption_notes (id, tax_exemption_id, actor_user_id, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
    id,
    taxExemptionId,
    actorUserId || "",
    note,
    nowIso()
  );
  return id;
}

/**
 * Creates a new pending exemption claim. Does NOT require a document --
 * callers attach one separately via attachTaxExemptionDocument(). Never
 * creates an already-approved row.
 */
export async function createTaxExemptionClaim(env, {
  registrationReference,
  parishId = "",
  jurisdiction,
  exemptionType,
  certificateNumber = "",
  effectiveDate = "",
  expirationDate = "",
  authorizedRepresentativeName,
  authorizedRepresentativeTitle,
  actorUserId = "",
  supersedesTaxExemptionId = null,
  internalReviewStatus = null
}) {
  if (!d1(env)) throw new Error("Production data store is not configured");
  if (!registrationReference) throw new Error("registrationReference is required");
  if (!jurisdiction) throw new Error("jurisdiction is required");
  if (!authorizedRepresentativeName || !authorizedRepresentativeTitle) {
    throw new Error("authorizedRepresentativeName and authorizedRepresentativeTitle are required");
  }

  const id = newTaxExemptionId();
  const certifiedAt = nowIso();
  const timestamp = certifiedAt;
  await d1Run(
    env,
    `INSERT INTO tax_exemptions (
      id, registration_reference, parish_id, jurisdiction, exemption_type, certificate_number,
      effective_date, expiration_date, status, authorized_representative_name,
      authorized_representative_title, certified_at, supersedes_tax_exemption_id, internal_review_status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?10, ?11, ?12, ?13, ?14, ?14)`,
    id,
    registrationReference,
    parishId || "",
    String(jurisdiction).toUpperCase(),
    exemptionType,
    certificateNumber || "",
    effectiveDate || "",
    expirationDate || "",
    authorizedRepresentativeName,
    authorizedRepresentativeTitle,
    certifiedAt,
    supersedesTaxExemptionId,
    internalReviewStatus,
    timestamp
  );

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId: id,
    registrationReference,
    action: "claim_created",
    actorType: "parish",
    actorUserId,
    metadata: { jurisdiction: String(jurisdiction).toUpperCase(), exemptionType, needsManualReview: Boolean(internalReviewStatus) }
  });

  return id;
}

/**
 * Links an uploaded document (already stored in R2 -- see
 * src/lib/tax-exemption-storage.js) to a claim. Marks any prior current
 * document as no-longer-current. Never changes tax_exemptions.status --
 * uploading a document is never itself an approval.
 */
export async function attachTaxExemptionDocument(env, {
  taxExemptionId,
  registrationReference,
  storageKey,
  originalFilename,
  sanitizedFilename,
  mimeType,
  fileSize,
  sha256,
  uploadedByUserId = ""
}) {
  const previousCurrent = await getCurrentTaxExemptionDocument(env, taxExemptionId);
  const documentId = newDocumentId();
  const uploadedAt = nowIso();

  const statements = [];
  if (previousCurrent) {
    statements.push({
      sql: `UPDATE tax_exemption_documents SET is_current = 0, archived_at = ?1 WHERE id = ?2`,
      params: [uploadedAt, previousCurrent.id]
    });
  }
  statements.push({
    sql: `INSERT INTO tax_exemption_documents (
      id, tax_exemption_id, registration_reference, storage_key, original_filename, sanitized_filename,
      mime_type, file_size, sha256, uploaded_by_user_id, uploaded_at, is_current, replaces_document_id
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12)`,
    params: [
      documentId, taxExemptionId, registrationReference, storageKey, originalFilename, sanitizedFilename,
      mimeType, fileSize, sha256, uploadedByUserId || "", uploadedAt, previousCurrent?.id || null
    ]
  });

  await d1Batch(env, statements);

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    documentId,
    registrationReference,
    action: previousCurrent ? "document_replaced" : "document_uploaded",
    actorType: uploadedByUserId ? "parish" : "system",
    actorUserId: uploadedByUserId,
    metadata: { mimeType, fileSize }
  });

  return documentId;
}

function assertValidTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid tax_exemptions transition: ${currentStatus} -> ${nextStatus}`);
  }
}

/**
 * The ONLY function permitted to change tax_exemptions.status. Validates
 * the transition, applies it plus any accompanying fields, and updates the
 * registrations cache columns in the same D1 batch. Does not touch Stripe --
 * callers that need Stripe synchronization (approve/revoke/expire) run that
 * separately, per the D1-pending -> Stripe -> D1-finalize sequence in
 * approveTaxExemption()/revokeOrExpireTaxExemption() below.
 */
export async function transitionTaxExemption(env, {
  taxExemptionId,
  nextStatus,
  fields = {},
  registrationFields = {}
}) {
  const current = await getTaxExemptionById(env, taxExemptionId);
  if (!current) throw new Error("Tax exemption not found");
  assertValidTransition(current.status, nextStatus);

  const setClauses = ["status = ?", "updated_at = ?"];
  const params = [nextStatus, nowIso()];
  for (const [column, value] of Object.entries(fields)) {
    setClauses.push(`${column} = ?`);
    params.push(value);
  }
  params.push(taxExemptionId);

  const statements = [
    {
      sql: `UPDATE tax_exemptions SET ${setClauses.join(", ")} WHERE id = ?`,
      params
    }
  ];

  const regFields = { tax_exemption_status: nextStatus, ...registrationFields };
  const regSetClauses = Object.keys(regFields).map((column) => `${column} = ?`);
  const regParams = [...Object.values(regFields), current.registration_reference];
  statements.push({
    sql: `UPDATE registrations SET ${regSetClauses.join(", ")} WHERE reference = ?`,
    params: regParams
  });

  await d1Batch(env, statements);
  return { ...current, status: nextStatus };
}

// ---------------------------------------------------------------------
// Optimistic concurrency. tax_exemptions.updated_at IS the record version
// -- no separate integer column needed, since every mutation path already
// bumps it. Every mutating action below accepts an optional
// `expectedVersion` and, when supplied, refuses to proceed (no Stripe
// call, no D1 write) if the current record's updated_at no longer
// matches -- surfaced to the route layer as a StaleRecordError, which
// src/handlers/tax-exemption.js translates to an HTTP 409.
// ---------------------------------------------------------------------
export class StaleRecordError extends Error {
  constructor(message, { currentVersion, currentStatus }) {
    super(message);
    this.name = "StaleRecordError";
    this.code = "STALE_RECORD";
    this.currentVersion = currentVersion;
    this.currentStatus = currentStatus;
  }
}

function assertCurrentVersion(record, expectedVersion, { versionField = "updated_at", statusField = "status" } = {}) {
  if (!expectedVersion) return; // no version supplied -- caller opted out (e.g. internal/system calls)
  if (record[versionField] !== expectedVersion) {
    throw new StaleRecordError(
      "This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.",
      { currentVersion: record[versionField], currentStatus: record[statusField] }
    );
  }
}

export const CUSTOMER_ROLE_LABELS = {
  giving_parish_plus: "Giving / Parish+",
  stewardship: "Stewardship"
};

/**
 * Masks a certificate number for display, showing only the last 4
 * characters (e.g. "TX-2024-••••5678"'s numeric tail becomes "••••5678").
 * Full reveal is a separate, explicit admin action -- never rendered by
 * default.
 */
export function maskCertificateNumber(value) {
  const str = String(value || "");
  if (!str) return "";
  if (str.length <= 4) return "•".repeat(str.length);
  return "•".repeat(str.length - 4) + str.slice(-4);
}

/**
 * Derives one aggregate sync-state label from a claim's per-Customer sync
 * rows, for queue/detail display. Never invented independently by the
 * frontend -- this is the one place that logic lives.
 */
export function aggregateSyncState(claim, syncRows = []) {
  if (claim.status === "approved" && syncRows.length === 0) return "waiting_for_customer";
  if (!syncRows.length) return "not_applicable";
  if (syncRows.some((r) => r.sync_status === "reconciliation_required")) return "reconciliation_required";
  const succeeded = syncRows.filter((r) => r.sync_status === "succeeded").length;
  const failed = syncRows.filter((r) => r.sync_status === "failed").length;
  const pending = syncRows.filter((r) => r.sync_status === "pending" || r.sync_status === "not_started").length;
  if (failed > 0 && succeeded > 0) return "partial";
  if (failed > 0) return "failed";
  if (pending > 0) return "pending";
  if (succeeded === syncRows.length) return "succeeded";
  return "not_applicable";
}

/**
 * Single source of truth for which admin actions are valid for a claim
 * right now. The frontend must render buttons from this object rather
 * than re-deriving the state machine in browser code.
 */
export function computeAllowedActions(claim, { hasDocument = false, syncRows = [], workflowEnabled = true } = {}) {
  if (!workflowEnabled) {
    return { approve: false, reject: false, requestReplacement: false, revoke: false, markExpired: false, retryAll: false, addNote: true };
  }
  const status = claim.status;
  const sync = aggregateSyncState(claim, syncRows);
  return {
    approve: ["pending", "replacement_required"].includes(status) && hasDocument,
    reject: ["pending", "replacement_required"].includes(status),
    requestReplacement: status === "approved",
    revoke: status === "approved",
    markExpired: status === "approved",
    retryAll: status === "approved" && (sync === "failed" || sync === "partial"),
    addNote: true
  };
}



/**
 * Returns every platform-account Stripe Customer id/role pair that an
 * approved exemption for this registration must reach. A parish may have
 * BOTH: registration.stripeCustomerId (Giving/Parish+) and
 * registration.stewardshipStripeCustomerId (Stewardship). Either, both, or
 * neither may be present depending on what the parish has purchased so far.
 */
export function resolveApplicableStripeCustomers(registration = {}) {
  const customers = [];
  if (registration.stripeCustomerId) {
    customers.push({ stripeCustomerId: registration.stripeCustomerId, customerRole: "giving_parish_plus" });
  }
  if (registration.stewardshipStripeCustomerId) {
    customers.push({ stripeCustomerId: registration.stewardshipStripeCustomerId, customerRole: "stewardship" });
  }
  return customers;
}

/**
 * Creates or updates one tax_exemption_stripe_syncs row per applicable
 * Customer, set to sync_status='pending' with the desired tax_exempt value.
 * Idempotent: re-running for the same (tax_exemption_id, stripe_customer_id)
 * updates the existing row rather than duplicating it (enforced by the
 * UNIQUE(tax_exemption_id, stripe_customer_id) constraint).
 */
export async function ensureStripeSyncRows(env, { taxExemptionId, registrationReference, customers, desiredTaxExemptStatus }) {
  const rows = [];
  for (const { stripeCustomerId, customerRole } of customers) {
    const existing = await d1First(
      env,
      `SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1 AND stripe_customer_id = ?2`,
      taxExemptionId,
      stripeCustomerId
    );
    if (existing) {
      if (existing.sync_status === "succeeded" && existing.desired_tax_exempt_status === desiredTaxExemptStatus) {
        // Already synced to the desired state -- don't reset to pending and
        // re-call Stripe for a customer that doesn't need it (this is what
        // lets one customer succeed while a retry only re-attempts the
        // customer that actually failed).
        rows.push(existing.id);
        continue;
      }
      await d1Run(
        env,
        `UPDATE tax_exemption_stripe_syncs
         SET desired_tax_exempt_status = ?1, sync_status = 'pending', updated_at = ?2
         WHERE id = ?3`,
        desiredTaxExemptStatus,
        nowIso(),
        existing.id
      );
      rows.push(existing.id);
    } else {
      const id = newSyncId();
      await d1Run(
        env,
        `INSERT INTO tax_exemption_stripe_syncs (
          id, tax_exemption_id, registration_reference, stripe_customer_id, customer_role,
          desired_tax_exempt_status, sync_status, idempotency_key, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, ?8)`,
        id,
        taxExemptionId,
        registrationReference,
        stripeCustomerId,
        customerRole,
        desiredTaxExemptStatus,
        `${taxExemptionId}:${stripeCustomerId}:${desiredTaxExemptStatus}`,
        nowIso()
      );
      rows.push(id);
    }
  }
  return rows;
}

/**
 * Performs the actual Stripe call for one sync row. Always re-reads the
 * Customer's CURRENT tax_exempt value first (fresh GET, never trusts a
 * cached value -- satisfies "re-read Stripe state before retry"), then
 * decides what to do based on whether this is an "apply" (desired=exempt)
 * or "restore" (desired=none, i.e. revoke/expire) action and who owns the
 * current state:
 *
 * APPLY (desired=exempt):
 *   - Customer already exempt before this call -> AGAPAY isn't creating
 *     this exemption; mark agapay_owned_change=0, succeed with no Stripe
 *     write (never claim credit for an externally-set exemption).
 *   - Customer was none/reverse -> AGAPAY is creating it; agapay_owned_change=1,
 *     write tax_exempt=exempt, succeed.
 *
 * RESTORE (desired=none, called only from revoke/expire):
 *   - If the row's own agapay_owned_change is 0 (AGAPAY never owned this
 *     Customer's exemption) -> never touch it; mark reconciliation_required.
 *   - If agapay_owned_change is 1 but the Customer's CURRENT state no
 *     longer matches what AGAPAY last set (someone changed it externally
 *     after approval) -> do not overwrite; mark reconciliation_required.
 *   - If agapay_owned_change is 1 and current state still matches -> safe
 *     to restore to none.
 *
 * Never throws -- callers check the returned `ok` flag. `ok: false` with
 * `reconciliationRequired: true` is a distinct outcome from an ordinary
 * failure -- it means "do not retry automatically," not "retry later."
 */
export async function runStripeCustomerSync(env, syncRowId) {
  const row = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncRowId);
  if (!row) return { ok: false, error: "Sync row not found" };

  await d1Run(
    env,
    `UPDATE tax_exemption_stripe_syncs SET sync_status = 'pending', attempted_at = ?1, attempt_count = attempt_count + 1, updated_at = ?1 WHERE id = ?2`,
    nowIso(),
    syncRowId
  );

  const retrieved = await stripeGetRequest(env, `/v1/customers/${encodeURIComponent(row.stripe_customer_id)}`);
  if (!retrieved.ok) {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs SET sync_status = 'failed', last_error = ?1, updated_at = ?2 WHERE id = ?3`,
      retrieved.body?.error?.message || "Stripe Customer lookup failed",
      nowIso(),
      syncRowId
    );
    return { ok: false, error: retrieved.body?.error?.message || "Stripe Customer lookup failed" };
  }
  if (retrieved.body?.deleted) {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs SET sync_status = 'failed', last_error = ?1, updated_at = ?2 WHERE id = ?3`,
      "Stripe Customer has been deleted",
      nowIso(),
      syncRowId
    );
    return { ok: false, error: "Stripe Customer has been deleted" };
  }

  const currentStatus = retrieved.body.tax_exempt || "none";
  const isRestore = row.desired_tax_exempt_status === "none";

  if (isRestore) {
    if (Number(row.agapay_owned_change) !== 1) {
      await d1Run(
        env,
        `UPDATE tax_exemption_stripe_syncs
         SET sync_status = 'reconciliation_required', previous_tax_exempt_status = ?1,
             last_error = 'This Customer''s exemption was not set by AGAPAY; automatic reversal was skipped. Manual reconciliation required.',
             updated_at = ?2
         WHERE id = ?3`,
        currentStatus, nowIso(), syncRowId
      );
      return { ok: false, reconciliationRequired: true, error: "Exemption was not AGAPAY-owned; skipped automatic reversal." };
    }
    if (currentStatus !== "exempt") {
      await d1Run(
        env,
        `UPDATE tax_exemption_stripe_syncs
         SET sync_status = 'reconciliation_required', previous_tax_exempt_status = ?1,
             last_error = 'Stripe Customer tax_exempt state changed externally since AGAPAY last set it; automatic reversal was skipped. Manual reconciliation required.',
             updated_at = ?2
         WHERE id = ?3`,
        currentStatus, nowIso(), syncRowId
      );
      return { ok: false, reconciliationRequired: true, error: "Stripe state changed externally; skipped automatic reversal." };
    }
  } else if (currentStatus === row.desired_tax_exempt_status) {
    // Already in the desired state before we touched it -- AGAPAY isn't
    // the one creating this exemption. Never claim ownership of, or later
    // auto-revert, a state AGAPAY didn't set.
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs
       SET sync_status = 'succeeded', previous_tax_exempt_status = ?1, agapay_owned_change = 0,
           synced_at = ?2, last_error = NULL, updated_at = ?2
       WHERE id = ?3`,
      currentStatus, nowIso(), syncRowId
    );
    return { ok: true, previousStatus: currentStatus, agapayOwnedChange: false };
  }

  const form = new URLSearchParams({ tax_exempt: row.desired_tax_exempt_status });
  form.set("metadata[agapay_tax_exemption_id]", row.tax_exemption_id);

  const idempotencyKey = row.idempotency_key || `${row.tax_exemption_id}:${row.stripe_customer_id}:${row.desired_tax_exempt_status}`;
  const updated = await stripeFormRequestWithIdempotency(env, `/v1/customers/${encodeURIComponent(row.stripe_customer_id)}`, form, idempotencyKey);

  if (!updated.ok) {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs
       SET sync_status = 'failed', last_error = ?1, previous_tax_exempt_status = ?2, updated_at = ?3
       WHERE id = ?4`,
      updated.body?.error?.message || "Stripe Customer update failed",
      currentStatus,
      nowIso(),
      syncRowId
    );
    return { ok: false, error: updated.body?.error?.message || "Stripe Customer update failed" };
  }

  await d1Run(
    env,
    `UPDATE tax_exemption_stripe_syncs
     SET sync_status = 'succeeded', previous_tax_exempt_status = ?1, stripe_request_id = ?2,
         agapay_owned_change = 1, synced_at = ?3, last_error = NULL, updated_at = ?3
     WHERE id = ?4`,
    currentStatus,
    updated.requestId || "",
    nowIso(),
    syncRowId
  );

  return { ok: true, previousStatus: currentStatus, agapayOwnedChange: true };
}

// stripeFormRequest doesn't currently support an Idempotency-Key header (no
// existing call site in this codebase needed one before this feature) --
// adding a thin wrapper here rather than changing the shared helper's
// signature, so every other Stripe call site is untouched.
async function stripeFormRequestWithIdempotency(env, path, form, idempotencyKey) {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 500, body: { error: { message: "STRIPE_SECRET_KEY is not configured" } } };
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey
    },
    body: form
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body, requestId: response.headers.get("request-id") || "" };
}

/**
 * Runs every pending/failed sync row for a claim, returns a summary. Used
 * both by the initial approval flow and by an explicit admin "retry" action
 * that only re-attempts rows that previously failed. Rows already in
 * 'reconciliation_required' are intentionally excluded -- those need an
 * explicit admin reconciliation decision (see reconcileStripeSync below),
 * never an automatic retry.
 */
export async function runAllPendingStripeSyncs(env, taxExemptionId) {
  const rows = await d1All(
    env,
    `SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1 AND sync_status IN ('pending','failed')`,
    taxExemptionId
  );
  const results = await Promise.all(rows.map((row) => runStripeCustomerSync(env, row.id)));
  const succeeded = results.filter((r) => r.ok).length;
  const reconciliationRequired = results.filter((r) => r.reconciliationRequired).length;
  const failed = results.length - succeeded - reconciliationRequired;
  return { total: results.length, succeeded, failed, reconciliationRequired };
}

/**
 * Retries exactly one Customer's sync row (admin "retry only this
 * Customer" action), rather than every pending/failed row for the claim.
 */
export async function retryOneStripeSync(env, syncRowId) {
  return runStripeCustomerSync(env, syncRowId);
}

/**
 * Explicit admin reconciliation for a sync row stuck in
 * 'reconciliation_required'. AGAPAY never auto-resolves this. The admin
 * chooses one of:
 *   - 'accept_external': acknowledge Stripe's current state as correct and
 *     stop tracking it as an AGAPAY-owned change (no Stripe write).
 *   - 'force_apply': re-attempt applying this row's desired_tax_exempt_status
 *     anyway, overriding the externally-observed state (an explicit,
 *     audited admin override -- not an automatic retry).
 */
export async function reconcileStripeSync(env, { syncRowId, actor, action }) {
  const row = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncRowId);
  if (!row) throw new Error("Sync row not found");
  if (row.sync_status !== "reconciliation_required") {
    throw new Error("This Customer is not currently awaiting reconciliation");
  }

  if (action === "accept_external") {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs
       SET sync_status = 'succeeded', agapay_owned_change = 0, last_error = NULL, synced_at = ?1, updated_at = ?1
       WHERE id = ?2`,
      nowIso(), syncRowId
    );
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId: row.tax_exemption_id, registrationReference: row.registration_reference,
      action: "reconciliation_required", actorType: "admin", actorUserId: actor,
      metadata: { resolution: "accept_external", stripeCustomerId: row.stripe_customer_id }
    });
    return { ok: true, resolution: "accept_external" };
  }

  if (action === "force_apply") {
    // Explicit admin override: re-attempt the sync even though the
    // automatic path found it needed reconciliation. Reset attempt state
    // so runStripeCustomerSync re-reads current Stripe state fresh.
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs SET sync_status = 'pending', updated_at = ?1 WHERE id = ?2`,
      nowIso(), syncRowId
    );
    const result = await runStripeCustomerSync(env, syncRowId);
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId: row.tax_exemption_id, registrationReference: row.registration_reference,
      action: "reconciliation_required", actorType: "admin", actorUserId: actor,
      metadata: { resolution: "force_apply", ok: result.ok, stripeCustomerId: row.stripe_customer_id }
    });
    return result;
  }

  throw new Error("Unknown reconciliation action");
}

/**
 * Aggregate counts for the admin summary cards. Uses indexed COUNT(*)
 * queries only -- never loads full records. Every category defaults to 0
 * rather than null/undefined.
 */
export async function getTaxExemptionSummaryCounts(env) {
  const zero = {
    pending: 0, approved: 0, replacementRequired: 0, expiringSoon: 0, expired: 0,
    rejected: 0, revoked: 0, failedSync: 0, partialSync: 0, reconciliationRequired: 0,
    waitingForCustomer: 0, pendingWithoutDocument: 0
  };
  if (!d1(env)) return zero;

  const statusRows = await d1All(
    env,
    `SELECT status, COUNT(*) AS n FROM tax_exemptions GROUP BY status`
  );
  const byStatus = {};
  for (const row of statusRows) byStatus[row.status] = Number(row.n) || 0;

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const expiringSoonRow = await d1First(
    env,
    `SELECT COUNT(*) AS n FROM tax_exemptions WHERE status = 'approved' AND expiration_date IS NOT NULL AND expiration_date != '' AND expiration_date BETWEEN ?1 AND ?2`,
    today, in30Days
  );

  const syncStatusRows = await d1All(
    env,
    `SELECT tax_exemption_id, sync_status FROM tax_exemption_stripe_syncs`
  );
  const byExemption = {};
  for (const row of syncStatusRows) {
    if (!byExemption[row.tax_exemption_id]) byExemption[row.tax_exemption_id] = [];
    byExemption[row.tax_exemption_id].push(row.sync_status);
  }
  let failedSync = 0, partialSync = 0, reconciliationRequired = 0;
  for (const statuses of Object.values(byExemption)) {
    if (statuses.includes("reconciliation_required")) { reconciliationRequired += 1; continue; }
    const failed = statuses.filter((s) => s === "failed").length;
    const succeeded = statuses.filter((s) => s === "succeeded").length;
    if (failed > 0 && succeeded > 0) partialSync += 1;
    else if (failed > 0) failedSync += 1;
  }

  const waitingForCustomerRow = await d1First(
    env,
    `SELECT COUNT(*) AS n FROM tax_exemptions t
     WHERE t.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM tax_exemption_stripe_syncs s WHERE s.tax_exemption_id = t.id)`
  );

  const pendingWithoutDocumentRow = await d1First(
    env,
    `SELECT COUNT(*) AS n FROM tax_exemptions t
     WHERE t.status IN ('pending', 'replacement_required')
       AND NOT EXISTS (SELECT 1 FROM tax_exemption_documents d WHERE d.tax_exemption_id = t.id AND d.is_current = 1)`
  );

  return {
    pending: byStatus.pending || 0,
    approved: byStatus.approved || 0,
    replacementRequired: byStatus.replacement_required || 0,
    expiringSoon: Number(expiringSoonRow?.n) || 0,
    expired: byStatus.expired || 0,
    rejected: byStatus.rejected || 0,
    revoked: byStatus.revoked || 0,
    failedSync,
    partialSync,
    reconciliationRequired,
    waitingForCustomer: Number(waitingForCustomerRow?.n) || 0,
    pendingWithoutDocument: Number(pendingWithoutDocumentRow?.n) || 0
  };
}



async function notifyParish(env, registration, subject, bodyHtml) {
  if (!env.RESEND_API_KEY) return { status: "not_configured" };
  const to = registration.treasurerEmail || registration.priestEmail || "";
  if (!to) return { status: "no_recipient" };
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  return sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to,
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    subject,
    html: agapayEmailHtml(appUrl, subject, bodyHtml)
  });
}

/**
 * Approves a claim. Sequence (see Phase 2 plan section 5/§3 above):
 *   1. Validate status is pending or replacement_required.
 *   2. Resolve applicable Stripe Customers.
 *   3. Set sync rows to pending (D1 write).
 *   4. Call Stripe for each Customer.
 *   5. Only if ALL required customers succeed, finalize locally as approved.
 *   6. If any customer fails, leave the claim's status unchanged and the
 *      failed sync row retryable -- never a partial approval.
 */
export async function approveTaxExemption(env, { taxExemptionId, registration, actor, expectedVersion }) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error("Tax exemption not found");
  assertCurrentVersion(claim, expectedVersion);
  if (!["pending", "replacement_required"].includes(claim.status)) {
    throw new Error(`Cannot approve a claim in status '${claim.status}'`);
  }

  const customers = resolveApplicableStripeCustomers(registration);

  if (!customers.length) {
    // The legal claim can be approved on its documentation alone even
    // before the parish has a platform Stripe Customer yet (e.g. approved
    // during onboarding, before first subscription checkout). There is
    // nothing to sync yet -- this is NOT reported as a synced success.
    // applyApprovedExemptionIfExists() (called from the Giving/Parish+ and
    // Stewardship checkout paths) applies it the moment a Customer is
    // actually created.
    const updated = await transitionTaxExemption(env, {
      taxExemptionId,
      nextStatus: "approved",
      fields: { approved_at: nowIso(), approved_by: actor, rejection_reason: null },
      registrationFields: {
        tax_exemption_expiration_date: claim.expiration_date || null,
        current_tax_exemption_id: taxExemptionId
      }
    });
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId, registrationReference: claim.registration_reference,
      action: "approved", actorType: "admin", actorUserId: actor,
      metadata: { waitingForCustomer: true }
    });
    return { ok: true, status: "approved", waitingForCustomer: true, exemption: updated };
  }

  await ensureStripeSyncRows(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    customers,
    desiredTaxExemptStatus: "exempt"
  });
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "stripe_sync_attempted", actorType: "admin", actorUserId: actor,
    metadata: { customerCount: customers.length }
  });

  const summary = await runAllPendingStripeSyncs(env, taxExemptionId);

  if (summary.failed > 0 || summary.reconciliationRequired > 0) {
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId, registrationReference: claim.registration_reference,
      action: summary.succeeded > 0 ? "stripe_sync_partial" : "stripe_sync_failed",
      actorType: "system", metadata: summary
    });
    return { ok: false, status: claim.status, summary, error: "One or more Stripe Customers failed to update. The claim has not been approved -- retry the failed customer(s)." };
  }

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "stripe_sync_succeeded", actorType: "system", metadata: summary
  });

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: "approved",
    fields: { approved_at: nowIso(), approved_by: actor, rejection_reason: null },
    registrationFields: {
      tax_exemption_expiration_date: claim.expiration_date || null,
      current_tax_exemption_id: taxExemptionId
    }
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "approved", actorType: "admin", actorUserId: actor
  });

  await notifyParish(env, registration,
    "Your AGAPAY sales tax exemption was approved",
    `<p>Your organization's sales tax exemption claim has been reviewed and approved. Future AGAPAY subscription invoices will reflect this exemption. This does not retroactively adjust tax already charged on past invoices.</p>`
  ).then((email) => writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: email.status === "sent" ? "notification_sent" : "notification_failed",
    actorType: "system", metadata: { status: email.status }
  }));

  return { ok: true, status: "approved", exemption: updated };
}

/**
 * Approves the legal claim WITHOUT ever calling Stripe -- used only when
 * env.TAX_EXEMPTION_STRIPE_SYNC_ENABLED is explicitly "false" (an
 * operational kill switch, not the normal path). Writes zero sync rows
 * and an explicit audit note that synchronization was administratively
 * disabled, so nothing here can be mistaken for "successfully synced."
 */
export async function approveTaxExemptionWithoutStripeSync(env, { taxExemptionId, actor, expectedVersion }) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error("Tax exemption not found");
  assertCurrentVersion(claim, expectedVersion);
  if (!["pending", "replacement_required"].includes(claim.status)) {
    throw new Error(`Cannot approve a claim in status '${claim.status}'`);
  }

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: "approved",
    fields: { approved_at: nowIso(), approved_by: actor, rejection_reason: null },
    registrationFields: {
      tax_exemption_expiration_date: claim.expiration_date || null,
      current_tax_exemption_id: taxExemptionId
    }
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "approved", actorType: "admin", actorUserId: actor,
    metadata: { stripeSyncDisabled: true, note: "Approved on documentation alone -- Stripe synchronization is administratively disabled and was not attempted." }
  });

  return { ok: true, status: "approved", exemption: updated, stripeSyncDisabled: true };
}

/**
 * Called right after a NEW platform Stripe Customer is created for a
 * parish (Giving/Parish+ in src/lib/subscription-checkout.js, Stewardship
 * in src/handlers/stewardship.js) -- checks whether this registration
 * already has a currently-approved exemption, and if so, applies it to
 * the newly-created Customer before checkout proceeds. This is what
 * prevents an approved-but-Customer-didn't-exist-yet exemption from
 * silently never reaching Stripe once the Customer finally shows up.
 *
 * Returns { applied: false } if there's no approved exemption to apply.
 * Returns { applied: true, ok, summary } otherwise -- callers (checkout
 * creation code) MUST check `ok` and refuse to proceed to checkout with a
 * user-safe billing-configuration error if `ok` is false, per the
 * "do not silently create a taxable subscription for an approved exempt
 * parish" requirement.
 */
export async function applyApprovedExemptionIfExists(env, { registration, stripeCustomerId, customerRole }) {
  if (!registration?.reference || !stripeCustomerId) return { applied: false };
  const claim = await getCurrentTaxExemptionForRegistration(env, registration.reference);
  if (!claim || claim.status !== "approved") return { applied: false };

  await ensureStripeSyncRows(env, {
    taxExemptionId: claim.id,
    registrationReference: registration.reference,
    customers: [{ stripeCustomerId, customerRole }],
    desiredTaxExemptStatus: "exempt"
  });
  const summary = await runAllPendingStripeSyncs(env, claim.id);
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId: claim.id, registrationReference: registration.reference,
    action: summary.failed > 0 ? "stripe_sync_failed" : "stripe_sync_succeeded",
    actorType: "system",
    metadata: { delayed: true, customerRole, stripeCustomerId, summary }
  });

  return { applied: true, ok: summary.failed === 0 && summary.reconciliationRequired === 0, summary };
}


export async function rejectTaxExemption(env, { taxExemptionId, registration, actor, reason, expectedVersion }) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error("Tax exemption not found");
  assertCurrentVersion(claim, expectedVersion);
  if (!["pending", "replacement_required"].includes(claim.status)) {
    throw new Error(`Cannot reject a claim in status '${claim.status}'`);
  }
  if (!reason) throw new Error("A rejection reason is required");

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: "rejected",
    fields: { rejected_at: nowIso(), rejected_by: actor, rejection_reason: reason },
    registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null }
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "rejected", actorType: "admin", actorUserId: actor, metadata: { reason }
  });

  await notifyParish(env, registration,
    "Your AGAPAY sales tax exemption request needs attention",
    `<p>AGAPAY was unable to approve your organization's sales tax exemption claim.</p><p><strong>Reason:</strong> ${reason}</p><p>You may submit corrected documentation at any time from your parish dashboard.</p>`
  ).then((email) => writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: email.status === "sent" ? "notification_sent" : "notification_failed",
    actorType: "system", metadata: { status: email.status }
  }));

  return { ok: true, status: "rejected", exemption: updated };
}

export async function requestReplacementDocumentation(env, { taxExemptionId, registration, actor, reason, keepActiveDuringReplacement = false, expectedVersion }) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error("Tax exemption not found");
  assertCurrentVersion(claim, expectedVersion);
  if (claim.status !== "approved") {
    throw new Error("Replacement can only be requested for a currently approved claim");
  }

  if (!keepActiveDuringReplacement) {
    const customers = resolveApplicableStripeCustomers(registration);
    await ensureStripeSyncRows(env, {
      taxExemptionId, registrationReference: claim.registration_reference,
      customers, desiredTaxExemptStatus: "none"
    });
    const summary = await runAllPendingStripeSyncs(env, taxExemptionId);
    if (summary.failed > 0) {
      await writeTaxExemptionAuditLog(env, {
        taxExemptionId, registrationReference: claim.registration_reference,
        action: "stripe_sync_partial", actorType: "system", metadata: summary
      });
      // Still proceed with the local status change to replacement_required
      // (the claim's legal validity is what changed) but surface the sync
      // failure for a retry -- do not leave the parish exempt in Stripe
      // silently if we couldn't confirm the disable succeeded.
    }
  }

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: "replacement_required",
    fields: {
      replacement_requested_at: nowIso(),
      replacement_requested_by: actor,
      replacement_reason: reason || "",
      keep_active_during_replacement: keepActiveDuringReplacement ? 1 : 0
    },
    registrationFields: keepActiveDuringReplacement ? {} : { tax_exemption_expiration_date: null }
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "replacement_requested", actorType: "admin", actorUserId: actor, metadata: { reason }
  });

  await notifyParish(env, registration,
    "AGAPAY needs updated sales tax exemption documentation",
    `<p>AGAPAY needs updated documentation to continue your organization's sales tax exemption.</p><p>${reason || ""}</p><p>Please upload a current document from your parish dashboard.</p>`
  ).then((email) => writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: email.status === "sent" ? "notification_sent" : "notification_failed",
    actorType: "system", metadata: { status: email.status }
  }));

  return { ok: true, status: "replacement_required", exemption: updated };
}

async function disableExemptionInStripe(env, { taxExemptionId, registration, registrationReference }) {
  const customers = resolveApplicableStripeCustomers(registration);
  if (!customers.length) return { total: 0, succeeded: 0, failed: 0 };
  await ensureStripeSyncRows(env, {
    taxExemptionId, registrationReference, customers, desiredTaxExemptStatus: "none"
  });
  return runAllPendingStripeSyncs(env, taxExemptionId);
}

export async function revokeTaxExemption(env, { taxExemptionId, registration, actor, reason, expectedVersion }) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error("Tax exemption not found");
  assertCurrentVersion(claim, expectedVersion);
  if (claim.status !== "approved") throw new Error("Only an approved claim can be revoked");
  if (!reason) throw new Error("A revocation reason is required");

  const summary = await disableExemptionInStripe(env, { taxExemptionId, registration, registrationReference: claim.registration_reference });

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: "revoked",
    fields: { revoked_at: nowIso(), revoked_by: actor, revocation_reason: reason },
    registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null }
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "revoked", actorType: "admin", actorUserId: actor, metadata: { reason, syncSummary: summary }
  });

  await notifyParish(env, registration,
    "Your AGAPAY sales tax exemption has been revoked",
    `<p>Your organization's sales tax exemption has been revoked.</p><p><strong>Reason:</strong> ${reason}</p><p>Future AGAPAY subscription invoices will include applicable sales tax.</p>`
  ).then((email) => writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: email.status === "sent" ? "notification_sent" : "notification_failed",
    actorType: "system", metadata: { status: email.status }
  }));

  return { ok: summary.failed === 0, status: "revoked", exemption: updated, summary };
}

/**
 * Manual "Mark expired" admin action -- distinct from
 * processExpiredTaxExemptions() (the automatic scheduled sweep). Only
 * valid on a currently `approved` claim. Uses the exact same
 * disableExemptionInStripe() ownership-aware Stripe path as revoke/the
 * automatic sweep -- an externally-owned or externally-modified Stripe
 * state is preserved and flagged reconciliation_required, never silently
 * overwritten, identical to every other path that disables an exemption.
 */
export async function expireTaxExemptionManually(env, { taxExemptionId, registration, actor, reason, expectedVersion }) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error("Tax exemption not found");
  assertCurrentVersion(claim, expectedVersion);
  if (claim.status !== "approved") throw new Error("Only an approved claim can be manually expired");
  if (!reason) throw new Error("A reason is required to manually expire an exemption");

  const summary = await disableExemptionInStripe(env, { taxExemptionId, registration, registrationReference: claim.registration_reference });

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: "expired",
    fields: {},
    registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null }
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: "expiration_processed", actorType: "admin", actorUserId: actor, metadata: { reason, manual: true, syncSummary: summary }
  });

  await notifyParish(env, registration,
    "Your AGAPAY sales tax exemption has expired",
    `<p>Your organization's sales tax exemption has been marked expired by AGAPAY.</p><p><strong>Reason:</strong> ${reason}</p><p>Future AGAPAY subscription invoices will include applicable sales tax until renewed documentation is submitted and approved.</p>`
  ).then((email) => writeTaxExemptionAuditLog(env, {
    taxExemptionId, registrationReference: claim.registration_reference,
    action: email.status === "sent" ? "notification_sent" : "notification_failed",
    actorType: "system", metadata: { status: email.status }
  }));

  return { ok: summary.failed === 0, status: "expired", exemption: updated, summary };
}

/**
 * Scheduled-job entry point (see src/worker.js `scheduled`). Finds every
 * approved exemption whose expiration_date has passed, disables Stripe
 * exemption, flips status to 'expired', notifies, and logs. Never blocks
 * on one parish's failure -- collects results and continues.
 */
export async function processExpiredTaxExemptions(env) {
  if (!d1(env)) return { checked: 0, expired: 0, failed: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const candidates = await d1All(
    env,
    `SELECT * FROM tax_exemptions
     WHERE status = 'approved' AND expiration_date IS NOT NULL AND expiration_date != '' AND expiration_date < ?1`,
    today
  );

  let expired = 0;
  let failed = 0;
  for (const claim of candidates) {
    try {
      const registrationRow = await d1First(env, `SELECT data FROM registrations WHERE reference = ?1`, claim.registration_reference);
      const registration = registrationRow?.data ? JSON.parse(registrationRow.data) : {};
      const summary = await disableExemptionInStripe(env, {
        taxExemptionId: claim.id, registration, registrationReference: claim.registration_reference
      });
      const updated = await transitionTaxExemption(env, {
        taxExemptionId: claim.id,
        nextStatus: "expired",
        fields: {},
        registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null }
      });
      await writeTaxExemptionAuditLog(env, {
        taxExemptionId: claim.id, registrationReference: claim.registration_reference,
        action: "expiration_processed", actorType: "system", metadata: { syncSummary: summary }
      });
      await notifyParish(env, registration,
        "Your AGAPAY sales tax exemption has expired",
        `<p>Your organization's sales tax exemption expired on ${claim.expiration_date}. Future AGAPAY subscription invoices will include applicable sales tax until renewed documentation is submitted and approved.</p>`
      );
      if (summary.failed > 0) failed += 1;
      expired += 1;
      void updated;
    } catch (error) {
      failed += 1;
      console.error("tax_exemption_expiration_failed", claim.id, error?.message || String(error));
    }
  }

  return { checked: candidates.length, expired, failed };
}

export { CUSTOMER_ROLES, STRIPE_SYNC_STATUSES };
