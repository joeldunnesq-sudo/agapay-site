// Generated from src/lib/tax-exemption-shared.ts by npm run build:server. Do not edit.
import { generateSecret } from './core.js';
import './stripe-connect.js';
import './email.js';
import './tax-exemption.js';
import './tax-exemption-records.js';
import './tax-exemption-sync.js';
import './tax-exemption-review.js';
const TAX_EXEMPTION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'replacement_required',
  'expired',
  'revoked',
  'superseded',
];
const ALLOWED_TRANSITIONS = {
  pending: ['approved', 'rejected', 'replacement_required', 'superseded'],
  approved: ['replacement_required', 'expired', 'revoked', 'superseded'],
  rejected: ['superseded'],
  replacement_required: ['approved', 'rejected', 'superseded'],
  expired: ['superseded'],
  revoked: ['superseded'],
  superseded: [],
};
const STRIPE_SYNC_STATUSES = ['not_started', 'pending', 'succeeded', 'failed', 'reconciliation_required'];
const CUSTOMER_ROLES = ['giving_parish_plus', 'stewardship'];
const UPLOAD_TOKEN_TTL_MS = 30 * 60 * 1e3;
class StaleRecordError extends Error {
  constructor(message, { currentVersion, currentStatus }) {
    super(message);
    this.name = 'StaleRecordError';
    this.code = 'STALE_RECORD';
    this.currentVersion = currentVersion;
    this.currentStatus = currentStatus;
  }
}
const CUSTOMER_ROLE_LABELS = {
  giving_parish_plus: 'Giving / Parish+',
  stewardship: 'Stewardship',
};
function nowIso() {
  return /* @__PURE__ */ new Date().toISOString();
}
function newTaxExemptionId() {
  return generateSecret('texmp');
}
function newSyncId() {
  return generateSecret('texsync');
}
function newDocumentId() {
  return generateSecret('texdoc');
}
function newAuditId() {
  return generateSecret('texaudit');
}
function newNoteId() {
  return generateSecret('texnote');
}
function assertValidTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid tax_exemptions transition: ${currentStatus} -> ${nextStatus}`);
  }
}
function assertCurrentVersion(record, expectedVersion, { versionField = 'updated_at', statusField = 'status' } = {}) {
  if (!expectedVersion) return;
  if (record[versionField] !== expectedVersion) {
    throw new StaleRecordError(
      'This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.',
      { currentVersion: record[versionField], currentStatus: record[statusField] }
    );
  }
}
export {
  ALLOWED_TRANSITIONS,
  CUSTOMER_ROLES,
  CUSTOMER_ROLE_LABELS,
  STRIPE_SYNC_STATUSES,
  StaleRecordError,
  TAX_EXEMPTION_STATUSES,
  UPLOAD_TOKEN_TTL_MS,
  assertCurrentVersion,
  assertValidTransition,
  newAuditId,
  newDocumentId,
  newNoteId,
  newSyncId,
  newTaxExemptionId,
  nowIso,
};
