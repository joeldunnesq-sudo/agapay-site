// Generated from src/handlers/admin-shared.ts by npm run build:server. Do not edit.
import '../lib/core.js';
import '../lib/mfa.js';
import '../lib/admin-overview-metrics.js';
import '../lib/registrations.js';
import '../lib/format.js';
import '../lib/subscriptions.js';
import '../lib/subscription-checkout.js';
import '../lib/parish-notifications.js';
import '../lib/memberships.js';
import '../lib/stripe-connect.js';
import './parish.js';
import './parish-commemorations.js';
import '../lib/audit-log.js';
import '../lib/tax-readiness.js';
import '../lib/parish-onboarding.js';
import '../lib/entitlements.js';
import '../lib/stewardship-funds.js';
import '../organizations/verification-policies.js';
import '../accounting/index.js';
import './accounting-ledger.js';
import './admin-revenue.js';
import './admin-registration-storage.js';
import './admin-session-operations.js';
import './admin-registration-detail.js';
import './admin-onboarding-test.js';
import './admin-accounting-operations.js';
const ADMIN_ACCOUNTING_ACTOR = Object.freeze({
  id: 'accounting-integrity-operator',
  type: 'system',
  capabilities: Object.freeze([
    'accounting.integrity.view',
    'accounting.integrity.scan',
    'accounting.integrity.protect',
    'accounting.recovery.verify',
  ]),
});
const PROTECTIVE_STATES = /* @__PURE__ */ new Set(['normal', 'degraded_read_only', 'posting_blocked', 'recovering']);
const accountingRows = async (db, sql, ...params) =>
  (
    await db
      .prepare(sql)
      .bind(...params)
      .all()
  ).results || [];
const accountingServiceTier = (tier) => (tier === 'advanced_operations' || tier === 'parish' ? 'parish' : 'mission');
export { ADMIN_ACCOUNTING_ACTOR, PROTECTIVE_STATES, accountingRows, accountingServiceTier };
