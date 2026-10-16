import type {
  TaxClaimRow,
  TaxDocumentRow,
  TaxAuditRow,
  TaxNoteRow,
  TaxAuditInput,
  TaxEnvironment,
} from './tax-exemption-composition-contracts.js';

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

import { d1, d1First, d1All, d1Run, d1Batch, generateSecret, sha256Hex, secureCompare } from './core.js';

import './stripe-connect.js';

import './email.js';
import { UPLOAD_TOKEN_TTL_MS } from './tax-exemption-shared.js';
import './tax-exemption.js';
import {
  nowIso,
  newTaxExemptionId,
  newDocumentId,
  newAuditId,
  newNoteId,
  assertValidTransition,
} from './tax-exemption-shared.js';
import './tax-exemption-sync.js';
import './tax-exemption-review.js';

/**
 * Every mutation to the audit log goes through this one function. Never
 * include file contents, tokens, full Stripe objects, full certificate
 * numbers, or raw Authorization headers in `metadata`.
 */
export async function writeTaxExemptionAuditLog(
  env: TaxEnvironment,
  {
    taxExemptionId = null,
    documentId = null,
    registrationReference,
    action,
    actorType,
    actorUserId = '',
    metadata = {},
  }: TaxAuditInput
) {
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
    actorUserId || '',
    JSON.stringify(metadata || {}),
    nowIso()
  );
  return true;
}
// 30 minutes -- short-lived per Phase 3B requirement

/**
 * Issues a random, short-lived upload authorization bound to this exact
 * claim. The raw token is returned to the caller (and from there, to the
 * browser) ONCE -- only its hash is persisted, matching the existing
 * password/session-token pattern already used elsewhere in this codebase
 * (src/lib/core.js hashPassword/sessionTokenHash). Re-issuing invalidates
 * any previously-issued token for the same claim (single active token).
 */
export async function issueClaimUploadToken(env: TaxEnvironment, taxExemptionId: string) {
  const rawToken = generateSecret('texup');
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
export async function verifyClaimUploadToken(env: TaxEnvironment, taxExemptionId: string, token: string) {
  if (!token) return null;
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim || !claim.upload_token_hash) return null;
  if (!claim.upload_token_expires_at || new Date(claim.upload_token_expires_at).getTime() < Date.now()) return null;
  const submittedHash = await sha256Hex(token);
  if (!secureCompare(submittedHash, claim.upload_token_hash)) return null;
  return claim;
}

export async function getTaxExemptionById(env: TaxEnvironment, id: string) {
  return d1First<TaxClaimRow>(env, `SELECT * FROM tax_exemptions WHERE id = ?1`, id);
}

export async function getCurrentTaxExemptionForRegistration(env: TaxEnvironment, registrationReference: string) {
  return d1First<TaxClaimRow>(
    env,
    `SELECT * FROM tax_exemptions WHERE registration_reference = ?1
     ORDER BY created_at DESC LIMIT 1`,
    registrationReference
  );
}

export async function listTaxExemptionDocuments(env: TaxEnvironment, taxExemptionId: string) {
  return d1All<TaxDocumentRow>(
    env,
    `SELECT * FROM tax_exemption_documents WHERE tax_exemption_id = ?1 ORDER BY uploaded_at DESC`,
    taxExemptionId
  );
}

export async function getCurrentTaxExemptionDocument(env: TaxEnvironment, taxExemptionId: string) {
  return d1First<TaxDocumentRow>(
    env,
    `SELECT * FROM tax_exemption_documents WHERE tax_exemption_id = ?1 AND is_current = 1 ORDER BY uploaded_at DESC LIMIT 1`,
    taxExemptionId
  );
}

export async function listTaxExemptionAuditLog(env: TaxEnvironment, taxExemptionId: string) {
  return d1All<TaxAuditRow>(
    env,
    `SELECT * FROM tax_exemption_audit_log WHERE tax_exemption_id = ?1 ORDER BY created_at DESC`,
    taxExemptionId
  );
}

export async function listTaxExemptionNotes(env: TaxEnvironment, taxExemptionId: string) {
  return d1All<TaxNoteRow>(
    env,
    `SELECT * FROM tax_exemption_notes WHERE tax_exemption_id = ?1 ORDER BY created_at DESC`,
    taxExemptionId
  );
}

export async function addTaxExemptionNote(
  env: TaxEnvironment,
  { taxExemptionId, actorUserId, note }: { taxExemptionId: string; actorUserId: string; note: string }
) {
  const id = newNoteId();
  await d1Run(
    env,
    `INSERT INTO tax_exemption_notes (id, tax_exemption_id, actor_user_id, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
    id,
    taxExemptionId,
    actorUserId || '',
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
export async function createTaxExemptionClaim(
  env: TaxEnvironment,
  {
    registrationReference,
    parishId = '',
    jurisdiction,
    exemptionType,
    certificateNumber = '',
    effectiveDate = '',
    expirationDate = '',
    authorizedRepresentativeName,
    authorizedRepresentativeTitle,
    actorUserId = '',
    supersedesTaxExemptionId = null,
    internalReviewStatus = null,
  }: {
    registrationReference: string;
    parishId?: string;
    jurisdiction: string;
    exemptionType: string;
    certificateNumber?: string;
    effectiveDate?: string;
    expirationDate?: string;
    authorizedRepresentativeName: string;
    authorizedRepresentativeTitle: string;
    actorUserId?: string;
    supersedesTaxExemptionId?: string | null;
    internalReviewStatus?: string | null;
  }
) {
  if (!d1(env)) throw new Error('Production data store is not configured');
  if (!registrationReference) throw new Error('registrationReference is required');
  if (!jurisdiction) throw new Error('jurisdiction is required');
  if (!authorizedRepresentativeName || !authorizedRepresentativeTitle) {
    throw new Error('authorizedRepresentativeName and authorizedRepresentativeTitle are required');
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
    parishId || '',
    String(jurisdiction).toUpperCase(),
    exemptionType,
    certificateNumber || '',
    effectiveDate || '',
    expirationDate || '',
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
    action: 'claim_created',
    actorType: 'parish',
    actorUserId,
    metadata: {
      jurisdiction: String(jurisdiction).toUpperCase(),
      exemptionType,
      needsManualReview: Boolean(internalReviewStatus),
    },
  });

  return id;
}

/**
 * Links an uploaded document (already stored in R2 -- see
 * src/lib/tax-exemption-storage.js) to a claim. Marks any prior current
 * document as no-longer-current. Never changes tax_exemptions.status --
 * uploading a document is never itself an approval.
 */
export async function attachTaxExemptionDocument(
  env: TaxEnvironment,
  {
    taxExemptionId,
    registrationReference,
    storageKey,
    originalFilename,
    sanitizedFilename,
    mimeType,
    fileSize,
    sha256,
    uploadedByUserId = '',
  }: {
    taxExemptionId: string;
    registrationReference: string;
    storageKey: string;
    originalFilename: string;
    sanitizedFilename: string;
    mimeType: string;
    fileSize: number;
    sha256: string;
    uploadedByUserId?: string;
  }
) {
  const previousCurrent = await getCurrentTaxExemptionDocument(env, taxExemptionId);
  const documentId = newDocumentId();
  const uploadedAt = nowIso();

  const statements = [];
  if (previousCurrent) {
    statements.push({
      sql: `UPDATE tax_exemption_documents SET is_current = 0, archived_at = ?1 WHERE id = ?2`,
      params: [uploadedAt, previousCurrent.id],
    });
  }
  statements.push({
    sql: `INSERT INTO tax_exemption_documents (
      id, tax_exemption_id, registration_reference, storage_key, original_filename, sanitized_filename,
      mime_type, file_size, sha256, uploaded_by_user_id, uploaded_at, is_current, replaces_document_id
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12)`,
    params: [
      documentId,
      taxExemptionId,
      registrationReference,
      storageKey,
      originalFilename,
      sanitizedFilename,
      mimeType,
      fileSize,
      sha256,
      uploadedByUserId || '',
      uploadedAt,
      previousCurrent?.id || null,
    ],
  });

  await d1Batch(env, statements);

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    documentId,
    registrationReference,
    action: previousCurrent ? 'document_replaced' : 'document_uploaded',
    actorType: uploadedByUserId ? 'parish' : 'system',
    actorUserId: uploadedByUserId,
    metadata: { mimeType, fileSize },
  });

  return documentId;
}

/**
 * The ONLY function permitted to change tax_exemptions.status. Validates
 * the transition, applies it plus any accompanying fields, and updates the
 * registrations cache columns in the same D1 batch. Does not touch Stripe --
 * callers that need Stripe synchronization (approve/revoke/expire) run that
 * separately, per the D1-pending -> Stripe -> D1-finalize sequence in
 * approveTaxExemption()/revokeOrExpireTaxExemption() below.
 */
export async function transitionTaxExemption(
  env: TaxEnvironment,
  {
    taxExemptionId,
    nextStatus,
    fields = {},
    registrationFields = {},
  }: {
    taxExemptionId: string;
    nextStatus: string;
    fields?: Record<string, string | number | null>;
    registrationFields?: Record<string, string | number | null>;
  }
) {
  const current = await getTaxExemptionById(env, taxExemptionId);
  if (!current) throw new Error('Tax exemption not found');
  assertValidTransition(current.status, nextStatus);

  const setClauses = ['status = ?', 'updated_at = ?'];
  const params: (string | number | null)[] = [nextStatus, nowIso()];
  for (const [column, value] of Object.entries(fields)) {
    setClauses.push(`${column} = ?`);
    params.push(value);
  }
  params.push(taxExemptionId);

  const statements = [
    {
      sql: `UPDATE tax_exemptions SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
    },
  ];

  const regFields = { tax_exemption_status: nextStatus, ...registrationFields };
  const regSetClauses = Object.keys(regFields).map((column) => `${column} = ?`);
  const regParams = [...Object.values(regFields), current.registration_reference];
  statements.push({
    sql: `UPDATE registrations SET ${regSetClauses.join(', ')} WHERE reference = ?`,
    params: regParams,
  });

  await d1Batch(env, statements);
  return { ...current, status: nextStatus };
}
