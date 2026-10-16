// Generated from src/handlers/tax-exemption-shared.ts by npm run build:server. Do not edit.
import { json, d1First } from '../lib/core.js';
import { loadRegistrationByReference } from './parish.js';
import { getTaxExemptionById } from '../lib/tax-exemption.js';
import '../lib/tax-exemption-storage.js';
import '../lib/tax-codes.js';
import './tax-exemption-parish.js';
import './tax-exemption.js';
import './tax-exemption-admin-review.js';
const VALID_JURISDICTIONS = /* @__PURE__ */ new Set([
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
const JURISDICTIONS_REQUIRING_MANUAL_REVIEW_FLAG = /* @__PURE__ */ new Set(['OTHER']);
const RECONCILE_ACTIONS = /* @__PURE__ */ new Set(['accept_external', 'force_apply']);
function normalizeJurisdiction(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}
function staleRecordResponse(err) {
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
function requireExpectedVersion(body) {
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
async function loadClaimAndRegistration(env, taxExemptionId) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return { error: json({ error: 'Not found' }, { status: 404 }) };
  const registration = await loadRegistrationByReference(env, claim.registration_reference);
  if (!registration) return { error: json({ error: 'Registration not found' }, { status: 404 }) };
  return { claim, registration };
}
async function loadSyncRowScopedToExemption(env, taxExemptionId, syncId) {
  const row = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncId);
  if (!row || row.tax_exemption_id !== taxExemptionId) return null;
  return row;
}
export {
  JURISDICTIONS_REQUIRING_MANUAL_REVIEW_FLAG,
  RECONCILE_ACTIONS,
  VALID_JURISDICTIONS,
  loadClaimAndRegistration,
  loadSyncRowScopedToExemption,
  normalizeJurisdiction,
  requireExpectedVersion,
  staleRecordResponse,
};
