// Generated from src/lib/tax-exemption-records.ts by npm run build:server. Do not edit.
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
async function writeTaxExemptionAuditLog(
  env,
  {
    taxExemptionId = null,
    documentId = null,
    registrationReference,
    action,
    actorType,
    actorUserId = '',
    metadata = {},
  }
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
async function issueClaimUploadToken(env, taxExemptionId) {
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
async function verifyClaimUploadToken(env, taxExemptionId, token) {
  if (!token) return null;
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim || !claim.upload_token_hash) return null;
  if (!claim.upload_token_expires_at || new Date(claim.upload_token_expires_at).getTime() < Date.now()) return null;
  const submittedHash = await sha256Hex(token);
  if (!secureCompare(submittedHash, claim.upload_token_hash)) return null;
  return claim;
}
async function getTaxExemptionById(env, id) {
  return d1First(env, `SELECT * FROM tax_exemptions WHERE id = ?1`, id);
}
async function getCurrentTaxExemptionForRegistration(env, registrationReference) {
  return d1First(
    env,
    `SELECT * FROM tax_exemptions WHERE registration_reference = ?1
     ORDER BY created_at DESC LIMIT 1`,
    registrationReference
  );
}
async function listTaxExemptionDocuments(env, taxExemptionId) {
  return d1All(
    env,
    `SELECT * FROM tax_exemption_documents WHERE tax_exemption_id = ?1 ORDER BY uploaded_at DESC`,
    taxExemptionId
  );
}
async function getCurrentTaxExemptionDocument(env, taxExemptionId) {
  return d1First(
    env,
    `SELECT * FROM tax_exemption_documents WHERE tax_exemption_id = ?1 AND is_current = 1 ORDER BY uploaded_at DESC LIMIT 1`,
    taxExemptionId
  );
}
async function listTaxExemptionAuditLog(env, taxExemptionId) {
  return d1All(
    env,
    `SELECT * FROM tax_exemption_audit_log WHERE tax_exemption_id = ?1 ORDER BY created_at DESC`,
    taxExemptionId
  );
}
async function listTaxExemptionNotes(env, taxExemptionId) {
  return d1All(
    env,
    `SELECT * FROM tax_exemption_notes WHERE tax_exemption_id = ?1 ORDER BY created_at DESC`,
    taxExemptionId
  );
}
async function addTaxExemptionNote(env, { taxExemptionId, actorUserId, note }) {
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
async function createTaxExemptionClaim(
  env,
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
async function attachTaxExemptionDocument(
  env,
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
async function transitionTaxExemption(env, { taxExemptionId, nextStatus, fields = {}, registrationFields = {} }) {
  const current = await getTaxExemptionById(env, taxExemptionId);
  if (!current) throw new Error('Tax exemption not found');
  assertValidTransition(current.status, nextStatus);
  const setClauses = ['status = ?', 'updated_at = ?'];
  const params = [nextStatus, nowIso()];
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
export {
  addTaxExemptionNote,
  attachTaxExemptionDocument,
  createTaxExemptionClaim,
  getCurrentTaxExemptionDocument,
  getCurrentTaxExemptionForRegistration,
  getTaxExemptionById,
  issueClaimUploadToken,
  listTaxExemptionAuditLog,
  listTaxExemptionDocuments,
  listTaxExemptionNotes,
  transitionTaxExemption,
  verifyClaimUploadToken,
  writeTaxExemptionAuditLog,
};
