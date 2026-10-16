import type { TaxClaimRow } from './tax-exemption-composition-contracts.js';

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

import { generateSecret } from './core.js';

import './stripe-connect.js';

import './email.js';
import './tax-exemption.js';
import './tax-exemption-records.js';
import './tax-exemption-sync.js';
import './tax-exemption-review.js';

export const TAX_EXEMPTION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'replacement_required',
  'expired',
  'revoked',
  'superseded',
];
export const ALLOWED_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending: ['approved', 'rejected', 'replacement_required', 'superseded'],
  approved: ['replacement_required', 'expired', 'revoked', 'superseded'],
  rejected: ['superseded'],
  replacement_required: ['approved', 'rejected', 'superseded'],
  expired: ['superseded'],
  revoked: ['superseded'],
  superseded: [],
};
export const STRIPE_SYNC_STATUSES = ['not_started', 'pending', 'succeeded', 'failed', 'reconciliation_required'];
export const CUSTOMER_ROLES = ['giving_parish_plus', 'stewardship'];
export const UPLOAD_TOKEN_TTL_MS = 30 * 60 * 1000;

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
  declare code: string;
  declare currentVersion: TaxClaimRow[keyof TaxClaimRow];
  declare currentStatus: TaxClaimRow[keyof TaxClaimRow];
  constructor(
    message: string,
    {
      currentVersion,
      currentStatus,
    }: { currentVersion: TaxClaimRow[keyof TaxClaimRow]; currentStatus: TaxClaimRow[keyof TaxClaimRow] }
  ) {
    super(message);
    this.name = 'StaleRecordError';
    this.code = 'STALE_RECORD';
    this.currentVersion = currentVersion;
    this.currentStatus = currentStatus;
  }
}

export const CUSTOMER_ROLE_LABELS = {
  giving_parish_plus: 'Giving / Parish+',
  stewardship: 'Stewardship',
};
export function nowIso() {
  return new Date().toISOString();
}
export function newTaxExemptionId() {
  return generateSecret('texmp');
}
export function newSyncId() {
  return generateSecret('texsync');
}
export function newDocumentId() {
  return generateSecret('texdoc');
}
export function newAuditId() {
  return generateSecret('texaudit');
}
export function newNoteId() {
  return generateSecret('texnote');
}
export function assertValidTransition(currentStatus: string, nextStatus: string) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid tax_exemptions transition: ${currentStatus} -> ${nextStatus}`);
  }
}
export function assertCurrentVersion(
  record: TaxClaimRow,
  expectedVersion: string | undefined,
  {
    versionField = 'updated_at',
    statusField = 'status',
  }: { versionField?: keyof TaxClaimRow; statusField?: keyof TaxClaimRow } = {}
) {
  if (!expectedVersion) return; // no version supplied -- caller opted out (e.g. internal/system calls)
  if (record[versionField] !== expectedVersion) {
    throw new StaleRecordError(
      'This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.',
      { currentVersion: record[versionField], currentStatus: record[statusField] }
    );
  }
}
