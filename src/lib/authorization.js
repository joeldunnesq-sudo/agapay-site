// Generated from src/lib/authorization.ts by npm run build:server. Do not edit.
import { d1, d1First, d1All } from './core.js';
import { requirePlatformUser } from './identity.js';
import { recordAuditEvent } from './audit-log.js';
const CAPABILITY_CATALOG = Object.freeze([
  // Platform
  'platform.admin',
  'platform.support',
  'platform.audit.view',
  'platform.system',
  // Parish Administration
  'parish.view',
  'parish.manage',
  'parish.members.invite',
  'parish.members.remove',
  'parish.roles.assign',
  'parish.settings.manage',
  'parish.giving.go_live',
  // Accounting (foundation only -- no ledger exists yet; these capability
  // strings are reserved for Phase 1's posting engine and later packages)
  'accounting.view',
  'accounting.post',
  'accounting.adjust',
  'accounting.reverse',
  'accounting.close_period',
  'accounting.reopen_period',
  'accounting.reconcile',
  'accounting.reports',
  'accounting.export',
  'accounting.audit',
  'accounting.configure',
  'accounting.accounts.manage',
  'accounting.funds.manage',
  'accounting.periods.manage',
  'accounting.journals.create',
  'accounting.journals.post',
  'accounting.journals.reverse',
  'accounting.opening_balances.manage',
  'accounting.migration.import',
  // Accounts Payable
  'ap.view',
  'ap.enter',
  'ap.approve',
  'ap.pay',
  'ap.void',
  // Budgeting
  'budgets.view',
  'budgets.manage',
  'budgets.approve',
  'budgets.lock',
  // Banking
  'bank.view',
  'bank.reconcile',
  'bank.manage_accounts',
  'accounting.bank_accounts.manage',
  'accounting.bank_accounts.view',
  'accounting.bank_imports.manage',
  'accounting.reconciliation.create',
  'accounting.reconciliation.view',
  'accounting.reconciliation.match',
  'accounting.reconciliation.complete',
  'accounting.reconciliation.reopen',
  'accounting.reconciliation.adjust',
  // Automated accounting integrations
  'accounting.integrations.view',
  'accounting.integrations.configure',
  'accounting.integrations.post',
  'accounting.integrations.review',
  'accounting.integrations.backfill',
  'accounting.commerce.view',
  'accounting.commerce.configure',
  'accounting.commerce.post',
  'accounting.commerce.review',
  'accounting.commerce.backfill',
  'accounting.commerce.reports.view',
  'accounting.close.view',
  'accounting.close.create',
  'accounting.close.validate',
  'accounting.close.adjust',
  'accounting.close.review',
  'accounting.close.approve',
  'accounting.close.complete',
  'accounting.close.reopen',
  'accounting.year_end.view',
  'accounting.year_end.execute',
  'accounting.accountant_exports.generate',
  'accounting.audit_exports.generate',
  'accounting.retention.manage',
  'accounting.legal_hold.manage',
  'accounting.integrity.view',
  'accounting.integrity.scan',
  'accounting.integrity.protect',
  'accounting.recovery.verify',
  'accounting.attachments.view',
  'accounting.attachments.manage',
  // Commerce
  'commerce.manage',
  'commerce.orders',
  'commerce.refunds',
  'commerce.products',
  // Stewardship
  'donations.view',
  'donations.manage',
  'donor.statements',
  // Sacraments & pastoral care
  'sacraments.pastoral.manage_own',
  'sacraments.pastoral.coverage',
  // Learn
  'learn.manage',
  'learn.admin',
  // Future Modules
  'marketplace.manage',
  'directory.view',
  'directory.self.manage',
  'directory.households.manage',
  'directory.invitations.manage',
  'directory.claims.review',
  'directory.identity_links.manage',
  'directory.manage',
  'directory.people.manage',
  'directory.requests.review',
  'directory.memberships.review',
  'directory.household_admins.review',
  'directory.corrections.review',
  'directory.protected.manage',
  'directory.duplicates.review',
  'directory.duplicates.merge',
  'directory.notes.view',
  'directory.notes.manage',
  'directory.assignments.manage',
  'directory.publication.review',
  // Phase 4B: deliberately separate from directory.publication.review --
  // a reviewer authorized for ordinary adult/household publication does
  // NOT automatically receive authority over child publication requests.
  // See docs/directory/40-phase-4b-parent-reviewer-authorization.md.
  'directory.child_publication.review',
  'directory.ministries.manage',
  'directory.ministry_interest.review',
  'directory.skills.view',
  'directory.skills.manage',
  'directory.skills.catalog.manage',
  'directory.settings.manage',
  'directory.private_contact.view',
  'directory.audit.view',
  'communications.manage',
  'events.manage',
]);
const CAPABILITY_SET = new Set(CAPABILITY_CATALOG);
const PLATFORM_ONLY_CAPABILITIES = /* @__PURE__ */ new Set([
  'platform.admin',
  'platform.support',
  'platform.audit.view',
  'platform.system',
]);
function isKnownCapability(capability) {
  return CAPABILITY_SET.has(capability);
}
function sanitizeGrantableCapabilities(requested) {
  if (!Array.isArray(requested)) return [];
  return requested.filter((cap) => CAPABILITY_SET.has(cap) && !PLATFORM_ONLY_CAPABILITIES.has(cap));
}
const ROLE_TEMPLATES = Object.freeze({
  rector: [
    'parish.view',
    'parish.manage',
    'parish.members.invite',
    'parish.members.remove',
    'parish.roles.assign',
    'parish.settings.manage',
    'accounting.view',
    'accounting.post',
    'accounting.adjust',
    'accounting.reverse',
    'accounting.close_period',
    'accounting.reopen_period',
    'accounting.reconcile',
    'accounting.reports',
    'accounting.export',
    'accounting.audit',
    'accounting.configure',
    'accounting.accounts.manage',
    'accounting.funds.manage',
    'accounting.periods.manage',
    'accounting.journals.create',
    'accounting.journals.post',
    'accounting.journals.reverse',
    'accounting.opening_balances.manage',
    'ap.view',
    'ap.enter',
    'ap.approve',
    'ap.pay',
    'ap.void',
    'budgets.view',
    'budgets.manage',
    'budgets.approve',
    'budgets.lock',
    'bank.view',
    'bank.reconcile',
    'bank.manage_accounts',
    'accounting.bank_accounts.manage',
    'accounting.bank_accounts.view',
    'accounting.bank_imports.manage',
    'accounting.reconciliation.create',
    'accounting.reconciliation.view',
    'accounting.reconciliation.match',
    'accounting.reconciliation.complete',
    'accounting.reconciliation.reopen',
    'accounting.reconciliation.adjust',
    'accounting.integrations.view',
    'accounting.integrations.configure',
    'accounting.integrations.post',
    'accounting.integrations.review',
    'accounting.integrations.backfill',
    'accounting.commerce.view',
    'accounting.commerce.configure',
    'accounting.commerce.post',
    'accounting.commerce.review',
    'accounting.commerce.backfill',
    'accounting.commerce.reports.view',
    'accounting.close.view',
    'accounting.close.create',
    'accounting.close.validate',
    'accounting.close.adjust',
    'accounting.close.review',
    'accounting.close.approve',
    'accounting.close.complete',
    'accounting.close.reopen',
    'accounting.year_end.view',
    'accounting.year_end.execute',
    'accounting.accountant_exports.generate',
    'accounting.audit_exports.generate',
    'accounting.retention.manage',
    'accounting.legal_hold.manage',
    'commerce.manage',
    'commerce.orders',
    'commerce.refunds',
    'commerce.products',
    'donations.view',
    'donations.manage',
    'donor.statements',
    'sacraments.pastoral.manage_own',
    'sacraments.pastoral.coverage',
  ],
  treasurer: [
    'parish.view',
    'parish.members.invite',
    'parish.giving.go_live',
    'accounting.view',
    'accounting.post',
    'accounting.adjust',
    'accounting.reverse',
    'accounting.close_period',
    'accounting.reconcile',
    'accounting.reports',
    'accounting.export',
    'accounting.configure',
    'accounting.accounts.manage',
    'accounting.funds.manage',
    'accounting.periods.manage',
    'accounting.journals.create',
    'accounting.journals.post',
    'accounting.journals.reverse',
    'accounting.opening_balances.manage',
    'accounting.migration.import',
    'ap.view',
    'ap.enter',
    'ap.approve',
    'ap.pay',
    'ap.void',
    'budgets.view',
    'budgets.manage',
    'budgets.approve',
    'budgets.lock',
    'bank.view',
    'bank.reconcile',
    'bank.manage_accounts',
    'accounting.bank_accounts.manage',
    'accounting.bank_accounts.view',
    'accounting.bank_imports.manage',
    'accounting.reconciliation.create',
    'accounting.reconciliation.view',
    'accounting.reconciliation.match',
    'accounting.reconciliation.complete',
    'accounting.reconciliation.reopen',
    'accounting.reconciliation.adjust',
    'accounting.integrations.view',
    'accounting.integrations.configure',
    'accounting.integrations.post',
    'accounting.integrations.review',
    'accounting.integrations.backfill',
    'accounting.commerce.view',
    'accounting.commerce.configure',
    'accounting.commerce.post',
    'accounting.commerce.review',
    'accounting.commerce.backfill',
    'accounting.commerce.reports.view',
    'accounting.close.view',
    'accounting.close.create',
    'accounting.close.validate',
    'accounting.close.adjust',
    'accounting.close.review',
    'accounting.close.approve',
    'accounting.close.complete',
    'accounting.close.reopen',
    'accounting.year_end.view',
    'accounting.year_end.execute',
    'accounting.accountant_exports.generate',
    'accounting.audit_exports.generate',
    'accounting.retention.manage',
    'accounting.legal_hold.manage',
    'accounting.integrity.view',
    'accounting.attachments.view',
    'accounting.attachments.manage',
    'donations.view',
    'donations.manage',
    'donor.statements',
  ],
  bookkeeper: [
    'parish.view',
    'accounting.view',
    'accounting.post',
    'accounting.journals.create',
    'accounting.journals.post',
    'ap.view',
    'ap.enter',
    'budgets.view',
    'budgets.manage',
    'bank.view',
    'bank.reconcile',
    'accounting.bank_accounts.view',
    'accounting.bank_imports.manage',
    'accounting.reconciliation.create',
    'accounting.reconciliation.view',
    'accounting.reconciliation.match',
    'accounting.reconciliation.adjust',
    'accounting.integrations.view',
    'accounting.integrations.post',
    'accounting.close.view',
    'accounting.close.create',
    'accounting.close.validate',
    'accounting.close.adjust',
    'accounting.close.review',
    'accounting.retention.manage',
    'accounting.legal_hold.manage',
    'accounting.integrity.view',
    'accounting.attachments.view',
    'accounting.attachments.manage',
    'donations.view',
  ],
  secretary: ['parish.view', 'parish.members.invite', 'donations.view', 'donor.statements'],
  council_member: ['parish.view', 'accounting.view', 'accounting.reports', 'budgets.view'],
  volunteer: ['parish.view'],
  bookstore_manager: [
    'parish.view',
    'commerce.manage',
    'commerce.orders',
    'commerce.products',
    'commerce.refunds',
    'accounting.commerce.view',
    'accounting.commerce.configure',
    'accounting.commerce.post',
    'accounting.commerce.review',
    'accounting.commerce.reports.view',
  ],
  reader: ['parish.view'],
  deacon: ['parish.view', 'donations.view'],
  priest: [
    'parish.view',
    'donations.view',
    'donor.statements',
    'sacraments.pastoral.manage_own',
    'sacraments.pastoral.coverage',
  ],
  administrator: [
    'parish.view',
    'parish.manage',
    'parish.members.invite',
    'parish.members.remove',
    'parish.roles.assign',
    'parish.settings.manage',
    'accounting.configure',
  ],
  // Reserved -- see comment above. Both intentionally empty.
  support: [],
  platform_admin: [],
});
function expandRoleTemplate(roleTemplate) {
  const template = ROLE_TEMPLATES[roleTemplate];
  return template ? sanitizeGrantableCapabilities(template) : [];
}
async function resolveAuthorizationContext(env, { userId, parishId }) {
  if (!d1(env) || !userId || !parishId) return { membership: null, capabilities: [] };
  const membership = await d1First(
    env,
    'SELECT * FROM parish_memberships WHERE user_id = ?1 AND parish_id = ?2',
    userId,
    parishId
  );
  if (!membership || membership.status !== 'active') {
    return { membership: null, capabilities: [] };
  }
  const rows = await d1All(
    env,
    'SELECT capability FROM membership_capabilities WHERE membership_id = ?1',
    membership.id
  );
  return {
    membership: {
      id: membership.id,
      userId: membership.user_id,
      parishId: membership.parish_id,
      roleTemplate: membership.role_template || '',
      status: membership.status,
    },
    capabilities: rows.map((row) => row.capability),
  };
}
async function hasCapability(env, { userId, parishId, capability }) {
  if (!capability) return false;
  const { capabilities } = await resolveAuthorizationContext(env, { userId, parishId });
  return capabilities.includes(capability);
}
async function hasPlatformCapability(_env, { userId: _userId, capability } = {}) {
  void _userId;
  if (!PLATFORM_ONLY_CAPABILITIES.has(capability)) return false;
  return false;
}
function correlationIdFor(request) {
  return request?.headers?.get?.('X-Request-Id') || '';
}
async function requireCapability(request, env, parishId, capability) {
  const user = await requirePlatformUser(request, env);
  if (!user) return null;
  const { membership, capabilities } = await resolveAuthorizationContext(env, {
    userId: user.id,
    parishId,
  });
  if (!membership) return null;
  if (!capabilities.includes(capability)) {
    await recordAuditEvent(env, request, {
      action: 'authorization.capability_denied',
      actorUserId: user.id,
      actorType: 'platform_user',
      targetType: 'parish_membership',
      targetId: membership.id,
      organizationId: parishId,
      requestId: correlationIdFor(request),
      metadata: {
        capabilityRequested: capability,
        resource: request?.url || '',
        decision: 'denied',
      },
    });
    return null;
  }
  return { user, membership, capabilities };
}
async function requireActiveMembership(request, env, parishId) {
  const user = await requirePlatformUser(request, env);
  if (!user) return null;
  const { membership, capabilities } = await resolveAuthorizationContext(env, {
    userId: user.id,
    parishId,
  });
  if (!membership) return null;
  return { user, membership, capabilities };
}
const currentUser = requirePlatformUser;
const currentMembership = requireActiveMembership;
async function authorize(request, env, { parishId, capability } = {}) {
  return requireCapability(request, env, parishId, capability);
}
export {
  CAPABILITY_CATALOG,
  ROLE_TEMPLATES,
  authorize,
  currentMembership,
  currentUser,
  expandRoleTemplate,
  hasCapability,
  hasPlatformCapability,
  isKnownCapability,
  requireActiveMembership,
  requireCapability,
  resolveAuthorizationContext,
  sanitizeGrantableCapabilities,
};
