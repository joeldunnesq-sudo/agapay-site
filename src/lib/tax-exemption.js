// Generated from src/lib/tax-exemption.ts by npm run build:server. Do not edit.
import { CUSTOMER_ROLES, STRIPE_SYNC_STATUSES } from './tax-exemption-shared.js';
import './core.js';
import './stripe-connect.js';
import './email.js';
import './tax-exemption-shared.js';
import './tax-exemption-shared.js';
import './tax-exemption-records.js';
import './tax-exemption-sync.js';
import './tax-exemption-review.js';
import { TAX_EXEMPTION_STATUSES, StaleRecordError, CUSTOMER_ROLE_LABELS } from './tax-exemption-shared.js';
import {
  writeTaxExemptionAuditLog,
  issueClaimUploadToken,
  verifyClaimUploadToken,
  getTaxExemptionById,
  getCurrentTaxExemptionForRegistration,
  listTaxExemptionDocuments,
  getCurrentTaxExemptionDocument,
  listTaxExemptionAuditLog,
  listTaxExemptionNotes,
  addTaxExemptionNote,
  createTaxExemptionClaim,
  attachTaxExemptionDocument,
  transitionTaxExemption,
} from './tax-exemption-records.js';
import {
  resolveApplicableStripeCustomers,
  ensureStripeSyncRows,
  runStripeCustomerSync,
  runAllPendingStripeSyncs,
  retryOneStripeSync,
  reconcileStripeSync,
  getTaxExemptionSummaryCounts,
} from './tax-exemption-sync.js';
import {
  approveTaxExemption,
  approveTaxExemptionWithoutStripeSync,
  applyApprovedExemptionIfExists,
  rejectTaxExemption,
  requestReplacementDocumentation,
  revokeTaxExemption,
  expireTaxExemptionManually,
  processExpiredTaxExemptions,
} from './tax-exemption-review.js';
function isTaxExemptionWorkflowEnabled(env = {}) {
  return String(env.TAX_EXEMPTION_WORKFLOW_ENABLED ?? 'true').toLowerCase() !== 'false';
}
function isTaxExemptionDocumentUploadEnabled(env = {}) {
  return String(env.TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED ?? 'true').toLowerCase() !== 'false';
}
function isTaxExemptionStripeSyncEnabled(env = {}) {
  return String(env.TAX_EXEMPTION_STRIPE_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';
}
function taxExemptionToJson(row) {
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
    updatedAt: row.updated_at,
  };
}
function maskCertificateNumber(value) {
  const str = String(value || '');
  if (!str) return '';
  if (str.length <= 4) return '•'.repeat(str.length);
  return '•'.repeat(str.length - 4) + str.slice(-4);
}
function aggregateSyncState(claim, syncRows = []) {
  if (claim.status === 'approved' && syncRows.length === 0) return 'waiting_for_customer';
  if (!syncRows.length) return 'not_applicable';
  if (syncRows.some((r) => r.sync_status === 'reconciliation_required')) return 'reconciliation_required';
  const succeeded = syncRows.filter((r) => r.sync_status === 'succeeded').length;
  const failed = syncRows.filter((r) => r.sync_status === 'failed').length;
  const pending = syncRows.filter((r) => r.sync_status === 'pending' || r.sync_status === 'not_started').length;
  if (failed > 0 && succeeded > 0) return 'partial';
  if (failed > 0) return 'failed';
  if (pending > 0) return 'pending';
  if (succeeded === syncRows.length) return 'succeeded';
  return 'not_applicable';
}
function computeAllowedActions(claim, { hasDocument = false, syncRows = [], workflowEnabled = true } = {}) {
  if (!workflowEnabled) {
    return {
      approve: false,
      reject: false,
      requestReplacement: false,
      revoke: false,
      markExpired: false,
      retryAll: false,
      addNote: true,
    };
  }
  const status = claim.status;
  const sync = aggregateSyncState(claim, syncRows);
  return {
    approve: ['pending', 'replacement_required'].includes(status) && hasDocument,
    reject: ['pending', 'replacement_required'].includes(status),
    requestReplacement: status === 'approved',
    revoke: status === 'approved',
    markExpired: status === 'approved',
    retryAll: status === 'approved' && (sync === 'failed' || sync === 'partial'),
    addNote: true,
  };
}
export {
  CUSTOMER_ROLES,
  CUSTOMER_ROLE_LABELS,
  STRIPE_SYNC_STATUSES,
  StaleRecordError,
  TAX_EXEMPTION_STATUSES,
  addTaxExemptionNote,
  aggregateSyncState,
  applyApprovedExemptionIfExists,
  approveTaxExemption,
  approveTaxExemptionWithoutStripeSync,
  attachTaxExemptionDocument,
  computeAllowedActions,
  createTaxExemptionClaim,
  ensureStripeSyncRows,
  expireTaxExemptionManually,
  getCurrentTaxExemptionDocument,
  getCurrentTaxExemptionForRegistration,
  getTaxExemptionById,
  getTaxExemptionSummaryCounts,
  isTaxExemptionDocumentUploadEnabled,
  isTaxExemptionStripeSyncEnabled,
  isTaxExemptionWorkflowEnabled,
  issueClaimUploadToken,
  listTaxExemptionAuditLog,
  listTaxExemptionDocuments,
  listTaxExemptionNotes,
  maskCertificateNumber,
  processExpiredTaxExemptions,
  reconcileStripeSync,
  rejectTaxExemption,
  requestReplacementDocumentation,
  resolveApplicableStripeCustomers,
  retryOneStripeSync,
  revokeTaxExemption,
  runAllPendingStripeSyncs,
  runStripeCustomerSync,
  taxExemptionToJson,
  transitionTaxExemption,
  verifyClaimUploadToken,
  writeTaxExemptionAuditLog,
};
