import type { AdminSqlRow, AdminMutation, AdminEnvironment, RawAuditRead } from './admin-composition-contracts.js';

import {
  ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_STORE_KEY,
  createPasswordRecord,
  d1,
  d1First,
  d1GetSetting,
  d1SetSetting,
  hasProductionStore,
  issueAdminSession,
  json,
  missingProductionStoreResponse,
  normalizeAdminActor,
  privilegedMfaRequired,
  rateLimit,
  rateLimitByKey,
  verifyPasswordRecord,
  unauthorized,
} from '../lib/core.js';

import { beginMfaAuthentication } from '../lib/mfa.js';

import '../lib/admin-overview-metrics.js';

import '../lib/registrations.js';

import '../lib/format.js';

import { subscriptionReady } from '../lib/subscriptions.js';

import '../lib/subscription-checkout.js';

import '../lib/parish-notifications.js';

import '../lib/memberships.js';

import { stripeReady } from '../lib/stripe-connect.js';

import { requireAdmin } from './parish.js';

import './parish-commemorations.js';

import { listAuditEvents } from '../lib/audit-log.js';

import '../lib/tax-readiness.js';

import '../lib/parish-onboarding.js';

import '../lib/entitlements.js';

import '../lib/stewardship-funds.js';

import '../organizations/verification-policies.js';

import '../accounting/index.js';

import './accounting-ledger.js';
import './admin-shared.js';
import './admin-revenue.js';
import { loadAllRegistrations } from './admin-registration-storage.js';
import './admin-registration-detail.js';
import './admin-onboarding-test.js';
import './admin-accounting-operations.js';

export async function handleAdminReleaseStatus(request: Request, env: AdminEnvironment) {
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();

  let registrationCount = 0;
  let verifiedCount = 0;
  let stripeReadyCount = 0;
  let subscriptionReadyCount = 0;
  if (hasProductionStore(env) && d1(env)) {
    const row = await d1First<AdminSqlRow>(
      env,
      `SELECT
         COUNT(*) AS registration_count,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_count,
         SUM(CASE WHEN status = 'verified' AND json_extract(data, '$.stripeAccountStatus') IN ('charges_enabled', 'payouts_enabled') THEN 1 ELSE 0 END) AS stripe_ready_count,
         SUM(CASE WHEN status = 'verified' AND json_extract(data, '$.subscriptionStatus') IN ('active', 'trialing', 'free_forever') THEN 1 ELSE 0 END) AS subscription_ready_count
       FROM registrations`
    );
    registrationCount = Number(row?.registration_count || 0);
    verifiedCount = Number(row?.verified_count || 0);
    stripeReadyCount = Number(row?.stripe_ready_count || 0);
    subscriptionReadyCount = Number(row?.subscription_ready_count || 0);
  } else if (hasProductionStore(env)) {
    const registrations = await loadAllRegistrations(env);
    const verified = registrations.filter((registration) => registration.status === 'verified');
    registrationCount = registrations.length;
    verifiedCount = verified.length;
    stripeReadyCount = verified.filter((registration) => stripeReady(registration)).length;
    subscriptionReadyCount = verified.filter((registration) => subscriptionReady(registration)).length;
  }
  const storedAdminPassword = d1(env)
    ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
    : env.AGAPAY_REGISTRATIONS
      ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
      : '';

  return json({
    ok: true,
    releaseStatus: {
      checkedAt: new Date().toISOString(),
      storeMode: d1(env) ? 'd1' : env.AGAPAY_REGISTRATIONS ? 'kv' : 'none',
      productionStoreConfigured: hasProductionStore(env),
      d1Configured: Boolean(d1(env)),
      kvConfigured: Boolean(env.AGAPAY_REGISTRATIONS),
      stripeSecretConfigured: Boolean(env.STRIPE_SECRET_KEY),
      stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
      stripeConnectWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET_CONNECT),
      resendConfigured: Boolean(env.RESEND_API_KEY),
      appUrlConfigured: Boolean(env.AGAPAY_APP_URL),
      turnstileConfigured: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
      nonprofitPricingDocsConfigured: Boolean(env.NONPROFIT_PRICING_DOCS),
      nonprofitPricingAlertEmailConfigured: Boolean(env.NONPROFIT_PRICING_ALERT_EMAIL),
      adminPasswordConfigured: Boolean(storedAdminPassword),
      registrationCount,
      verifiedCount,
      stripeReadyCount,
      subscriptionReadyCount,
      // Actual feature-flag values, not just whether something is configured --
      // see wrangler.toml [vars] for what each one gates. Admin-only (this
      // whole endpoint requires requireAdmin above); these are toggles, not
      // secrets, so safe to surface for diagnostics.
      featureFlags: {
        AGAPAY_ENABLE_KV_MIGRATION: (env.AGAPAY_ENABLE_KV_MIGRATION as string | undefined) === 'true',
        SUBSCRIPTION_TAX_CODES_ENABLED: (env.SUBSCRIPTION_TAX_CODES_ENABLED as string | undefined) === 'true',
        LEARN_PERSISTED_CUSTOMER_ENFORCED: (env.LEARN_PERSISTED_CUSTOMER_ENFORCED as string | undefined) === 'true',
        PARISH_COMMERCE_READINESS_ENABLED: (env.PARISH_COMMERCE_READINESS_ENABLED as string | undefined) === 'true',
        PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW:
          (env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW as string | undefined) === 'true',
        PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL:
          (env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL as string | undefined) === 'true',
        TAX_EXEMPTION_WORKFLOW_ENABLED: (env.TAX_EXEMPTION_WORKFLOW_ENABLED as string | undefined) === 'true',
        TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED:
          (env.TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED as string | undefined) === 'true',
        TAX_EXEMPTION_STRIPE_SYNC_ENABLED: (env.TAX_EXEMPTION_STRIPE_SYNC_ENABLED as string | undefined) === 'true',
      },
    },
  });
}

export async function handleAdminSession(request: Request, env: AdminEnvironment) {
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (request.method === 'DELETE') {
    return json({ ok: true });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  let body: AdminMutation;
  try {
    body = (await request.json()) as AdminMutation;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const password = String(body.password || body.adminPassword || '').trim();
  if (!password) return unauthorized();
  const accountLimited = await rateLimitByKey(request, env, 'admin-auth-account', 'admin', {
    limit: 20,
    windowSeconds: 300,
  });
  if (accountLimited) return accountLimited;

  const stored = hasProductionStore(env)
    ? d1(env)
      ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
      : await env.AGAPAY_REGISTRATIONS?.get(ADMIN_PASSWORD_KV_KEY)
    : '';
  if (!(await verifyPasswordRecord(password, stored))) return unauthorized();

  const actor = normalizeAdminActor(body.actor || 'Admin');
  if (privilegedMfaRequired(env)) {
    return json({
      ok: true,
      ...(await beginMfaAuthentication(env, request, {
        principalType: 'platform_admin',
        principalId: 'platform',
        purpose: 'login',
        metadata: { actor },
      })),
    });
  }
  const session = await issueAdminSession(env, actor);
  return json({ ok: true, ...session });
}

export async function handleAdminPassword(request: Request, env: AdminEnvironment) {
  if (request.method !== 'PATCH') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-password', { limit: 5, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body: AdminMutation;
  try {
    body = (await request.json()) as AdminMutation;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const newPassword = String(body.newAdminPassword || '').trim();
  const confirmPassword = String(body.confirmAdminPassword || '').trim();
  if (newPassword.length < 12) {
    return json({ error: 'Admin password must be at least 12 characters.' }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return json({ error: 'Admin passwords do not match.' }, { status: 400 });
  }
  if (newPassword === env.AGAPAY_ADMIN_TOKEN) {
    return json({ error: 'Choose a password different from the Cloudflare root secret.' }, { status: 400 });
  }

  const passwordRecord = JSON.stringify(await createPasswordRecord(newPassword));
  if (d1(env)) {
    await d1SetSetting(env, ADMIN_PASSWORD_KV_KEY, passwordRecord);
    await d1SetSetting(
      env,
      ADMIN_SESSION_STORE_KEY,
      JSON.stringify({ sessions: [], updatedAt: new Date().toISOString() })
    );
  } else {
    await env.AGAPAY_REGISTRATIONS!.put(ADMIN_PASSWORD_KV_KEY, passwordRecord);
    await env.AGAPAY_REGISTRATIONS!.put(
      ADMIN_SESSION_STORE_KEY,
      JSON.stringify({ sessions: [], updatedAt: new Date().toISOString() })
    );
  }
  return json({ ok: true, updatedAt: new Date().toISOString(), sessionsInvalidated: true });
}

// Phase 6 -- admin audit-log viewer. Read-only; recordAuditEvent() (in
// ../lib/audit-log.js) is the only write path into this table.
export async function handleAdminAuditLog(request: Request, env: AdminEnvironment) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const url = new URL(request.url);
  const result = await (listAuditEvents as RawAuditRead)(env, {
    limit: url.searchParams.get('limit'),
    cursor: url.searchParams.get('cursor') || '',
    action: url.searchParams.get('action') || '',
    actorUserId: url.searchParams.get('actor') || '',
    actorType: url.searchParams.get('actorType') || '',
    targetType: url.searchParams.get('targetType') || '',
    targetId: url.searchParams.get('targetId') || '',
    organizationId: url.searchParams.get('organization') || '',
    since: url.searchParams.get('since') || '',
    until: url.searchParams.get('until') || '',
  });

  return json(result);
}
