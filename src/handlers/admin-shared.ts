import type { PortabilityDatabase } from './admin-composition-contracts.js';

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
export const ADMIN_ACCOUNTING_ACTOR = Object.freeze({
  id: 'accounting-integrity-operator',
  type: 'system',
  capabilities: Object.freeze([
    'accounting.integrity.view',
    'accounting.integrity.scan',
    'accounting.integrity.protect',
    'accounting.recovery.verify',
  ]),
});
export const PROTECTIVE_STATES = new Set(['normal', 'degraded_read_only', 'posting_blocked', 'recovering']);
export const accountingRows = async (db: PortabilityDatabase, sql: string, ...params: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...params)
      .all()
  ).results || [];
export const accountingServiceTier = (tier: unknown) =>
  tier === 'advanced_operations' || tier === 'parish' ? 'parish' : 'mission';
