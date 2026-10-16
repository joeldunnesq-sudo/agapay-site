import type { TaxEnvironment, TaxSyncRow, TaxRequestBody } from './tax-exemption-composition-contracts.js';

// src/handlers/tax-exemption.js
//
// Parish-facing claim/upload/self-view routes and AGAPAY admin review
// routes for the sales-tax exemption workflow. Mounted from src/worker.js.

import { json, d1First } from '../lib/core.js';

import { loadRegistrationByReference } from './parish.js';

import { getTaxExemptionById, StaleRecordError } from '../lib/tax-exemption.js';

import '../lib/tax-exemption-storage.js';

import '../lib/tax-codes.js';
import './tax-exemption-parish.js';
import './tax-exemption.js';
import './tax-exemption-admin-review.js';
export const VALID_JURISDICTIONS = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'FEDERAL',
  'OTHER',
]);
export const JURISDICTIONS_REQUIRING_MANUAL_REVIEW_FLAG = new Set(['OTHER']);
export const RECONCILE_ACTIONS = new Set(['accept_external', 'force_apply']);
export function normalizeJurisdiction(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase();
}
export function staleRecordResponse(err: StaleRecordError) {
  return json(
    {
      ok: false,
      code: 'STALE_RECORD',
      message: err.message,
      currentVersion: err.currentVersion,
      currentStatus: err.currentStatus,
    },
    { status: 409 }
  );
}
export function requireExpectedVersion(body: TaxRequestBody) {
  const expectedVersion = String(body?.expectedVersion || '').trim();
  if (!expectedVersion) {
    return {
      error: json(
        { error: 'expectedVersion is required for this action. Reload the claim detail and try again.' },
        { status: 422 }
      ),
    };
  }
  return { expectedVersion };
}
export async function loadClaimAndRegistration(env: TaxEnvironment, taxExemptionId: string) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return { error: json({ error: 'Not found' }, { status: 404 }) };
  const registration = await loadRegistrationByReference(env, claim.registration_reference);
  if (!registration) return { error: json({ error: 'Registration not found' }, { status: 404 }) };
  return { claim, registration };
}
export async function loadSyncRowScopedToExemption(env: TaxEnvironment, taxExemptionId: string, syncId: string) {
  const row = await d1First<TaxSyncRow>(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncId);
  if (!row || row.tax_exemption_id !== taxExemptionId) return null;
  return row;
}
