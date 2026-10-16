// Generated from src/handlers/admin-onboarding-test.ts by npm run build:server. Do not edit.
import {
  applyParishDashboardPassword,
  d1,
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import '../lib/mfa.js';
import '../lib/admin-overview-metrics.js';
import '../lib/registrations.js';
import { parishSlug } from '../lib/format.js';
import { subscriptionTier } from '../lib/subscriptions.js';
import '../lib/subscription-checkout.js';
import '../lib/parish-notifications.js';
import { listMembershipsForParish } from '../lib/memberships.js';
import '../lib/stripe-connect.js';
import {
  appendAdminAudit,
  loadRegistrationByReference,
  requireAdminContext,
  saveRegistrationRecord,
} from './parish.js';
import './parish-commemorations.js';
import '../lib/audit-log.js';
import '../lib/tax-readiness.js';
import {
  PARISH_ONBOARDING_WORKFLOW_VERSION,
  buildParishOnboardingWorkflow,
  normalizeOnboardingChecks,
  recommendedOnboardingState,
} from '../lib/parish-onboarding.js';
import '../lib/entitlements.js';
import '../lib/stewardship-funds.js';
import '../organizations/verification-policies.js';
import '../accounting/index.js';
import './accounting-ledger.js';
import './admin-shared.js';
import './admin-revenue.js';
import './admin-registration-storage.js';
import './admin-session-operations.js';
import './admin-registration-detail.js';
import './admin-accounting-operations.js';
function stagingOnboardingTestMode(env = {}) {
  return ['development', 'local', 'preview', 'staging', 'test'].includes(
    String(env.AGAPAY_ENVIRONMENT || '')
      .trim()
      .toLowerCase()
  );
}
function stagingGeneralFund(funds = []) {
  const active = (Array.isArray(funds) ? funds : []).filter(
    (fund) => fund && fund.enabled !== false && fund.active !== false
  );
  const isGeneral = (fund) => {
    const values = [fund.id, fund.code, fund.reportCode, fund.name].map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    );
    return values.some((value) =>
      ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value)
    );
  };
  const general = active.find(isGeneral);
  if (general) {
    let keptGeneral = false;
    return (Array.isArray(funds) ? funds : []).map((fund) => {
      if (!isGeneral(fund) || fund.enabled === false || fund.active === false) return fund;
      if (!keptGeneral) {
        keptGeneral = true;
        return {
          ...fund,
          id: 'general',
          code: 'general',
          restrictionType: 'unrestricted',
          isDefault: true,
          enabled: true,
          active: true,
          donorVisible: true,
          givingEnabled: true,
          accountingFundId: 'fund_general',
        };
      }
      return { ...fund, enabled: false, active: false };
    });
  }
  return [
    {
      id: 'general',
      name: 'General Operating Fund',
      description: 'Unrestricted parish operations',
      restrictionType: 'unrestricted',
      isDefault: true,
      enabled: true,
      active: true,
      donorVisible: true,
      givingEnabled: true,
      accountingFundId: 'fund_general',
    },
    ...(Array.isArray(funds) ? funds : []),
  ];
}
async function handleAdminOnboardingTest(request, env, reference) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!stagingOnboardingTestMode(env)) {
    return json(
      { error: 'Onboarding test controls are disabled outside non-production environments.' },
      { status: 403 }
    );
  }
  const limited = await rateLimit(request, env, 'admin-onboarding-test', { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const current = await loadRegistrationByReference(env, reference);
  if (!current) return json({ error: 'Registration not found' }, { status: 404 });
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const action = String(body.action || '').trim();
  if (
    !['prepare_ready', 'simulate_stripe_ready', 'pass_manual_gates', 'reset_signoff', 'reset_workflow'].includes(action)
  ) {
    return json({ error: 'Unknown staging onboarding action.' }, { status: 422 });
  }
  const now = /* @__PURE__ */ new Date().toISOString();
  const actor = `${adminContext.actor} (staging test)`;
  const allPassed = Object.fromEntries(
    ['authorizedRepresentative', 'givingConfiguration'].map((key) => [
      key,
      { status: 'passed', evidence: 'staging-simulation', note: 'Passed by the staging workflow test control.' },
    ])
  );
  allPassed.importDecision = {
    status: 'not_applicable',
    evidence: 'staging-simulation',
    note: 'No donor import is required for this staging exercise.',
  };
  const allReset = Object.fromEntries(
    ['authorizedRepresentative', 'givingConfiguration', 'importDecision'].map((key) => [
      key,
      { status: 'not_started', evidence: '', note: '' },
    ])
  );
  let updated = {
    ...current,
    onboardingWorkflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    givingStatus: 'hidden',
    treasurerSignoff: null,
    goLiveAt: '',
    goLiveBy: '',
    parishUpdatedAt: now,
  };
  let stagingPassword = '';
  let memberships = [];
  if (action === 'simulate_stripe_ready' || action === 'prepare_ready') {
    const stagingAccountId = `acct_staging_${String(updated.parishId || reference)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 24)}`;
    updated = {
      ...updated,
      stripeAccountId: stagingAccountId,
      stripeAccountStatus: 'payouts_enabled',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeDisabledReason: '',
      stripeRequirementsDue: [],
      stripeStatusCheckedAt: now,
      stripePayoutBankName: 'AGAPAY Staging Bank',
      stripePayoutBankLast4: '4242',
      onboardingStripeTestFixture: {
        id: stagingAccountId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: { disabled_reason: null, currently_due: [] },
        external_accounts: {
          data: [{ object: 'bank_account', bank_name: 'AGAPAY Staging Bank', last4: '4242' }],
        },
      },
    };
  }
  if (action === 'pass_manual_gates' || action === 'prepare_ready') {
    updated.onboardingChecks = normalizeOnboardingChecks(allPassed, updated.onboardingChecks, actor, now);
  }
  if (action === 'reset_workflow') {
    updated.onboardingChecks = normalizeOnboardingChecks(allReset, updated.onboardingChecks, actor, now);
    if (String(updated.stripeAccountId || '').startsWith('acct_staging_')) {
      updated = {
        ...updated,
        stripeAccountId: '',
        stripeAccountStatus: 'not_started',
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeDetailsSubmitted: false,
        stripeDisabledReason: '',
        stripeRequirementsDue: [],
        stripeStatusCheckedAt: '',
        stripePayoutBankName: '',
        stripePayoutBankLast4: '',
        onboardingStripeTestFixture: null,
      };
    }
  }
  if (action === 'prepare_ready') {
    if (!normalizeEmail(updated.treasurerEmail) || !normalizeEmail(updated.priestEmail)) {
      return json(
        { error: 'A priest email and treasurer email are required before preparing the signoff exercise.' },
        { status: 422 }
      );
    }
    const tier = subscriptionTier(updated);
    stagingPassword = generateSecret('Agapay-Staging');
    updated = await applyParishDashboardPassword(
      {
        ...updated,
        status: 'verified',
        parishId: updated.parishId || parishSlug(updated.parishName, updated.city),
        parishUsername: updated.parishUsername || updated.parishId || parishSlug(updated.parishName, updated.city),
        reviewedBy: updated.reviewedBy || actor,
        verificationSource: updated.verificationSource || 'Staging canonical directory fixture',
        bishopOrAuthority: updated.bishopOrAuthority || 'Staging diocesan authority',
        dioceseOrDeanery: updated.dioceseOrDeanery || 'Staging deanery',
        dashboardInviteEmailStatus: 'sent',
        dashboardInviteEmailSentAt: updated.dashboardInviteEmailSentAt || now,
        subscriptionTier: tier.id,
        subscriptionTierLabel: tier.label,
        subscriptionMonthlyCents: tier.monthlyCents,
        subscriptionStatus: tier.monthlyCents === 0 ? 'free_forever' : 'trialing',
        funds: stagingGeneralFund(updated.funds),
        onboardingChecks: normalizeOnboardingChecks(allPassed, updated.onboardingChecks, actor, now),
        parishDashboardSessions: [],
      },
      stagingPassword,
      { temporary: false }
    );
    updated.onboardingAccess = {};
  }
  if (d1(env) && updated.parishId && !memberships.length) {
    memberships = await listMembershipsForParish(env, updated.parishId);
  }
  updated.onboardingState = recommendedOnboardingState(updated, updated.onboardingChecks, { memberships });
  updated = appendAdminAudit(updated, `staging_onboarding_${action}`, actor, {
    environment: env.AGAPAY_ENVIRONMENT || 'non-production',
  });
  await saveRegistrationRecord(env, reference, updated, current);
  const onboardingWorkflow = await buildParishOnboardingWorkflow(updated, {
    appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    memberships,
  });
  return json({
    ok: true,
    action,
    stagingPassword: stagingPassword || void 0,
    registration: { ...updated, onboardingWorkflow, onboardingTestMode: true },
  });
}
export { handleAdminOnboardingTest, stagingGeneralFund, stagingOnboardingTestMode };
