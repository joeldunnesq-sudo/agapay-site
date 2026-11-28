import type { AdminRegistration, AdminSqlRow, AdminMutation, AdminEnvironment } from './admin-composition-contracts.js';

import { d1All, json, STRIPE_EVENT_PROCESSING_RETRY_MS, unauthorized } from '../lib/core.js';

import '../lib/mfa.js';

import '../lib/admin-overview-metrics.js';

import '../lib/registrations.js';

import '../lib/format.js';

import '../lib/subscriptions.js';

import '../lib/subscription-checkout.js';

import '../lib/parish-notifications.js';

import '../lib/memberships.js';

import '../lib/stripe-connect.js';

import { findRegistrationByParishId, requireAdminContext } from './parish.js';

import './parish-commemorations.js';

import { recordAuditEvent } from '../lib/audit-log.js';

import '../lib/tax-readiness.js';

import '../lib/parish-onboarding.js';

import { accountingEnabledFor, accountingTierFor } from '../lib/entitlements.js';

import '../lib/stewardship-funds.js';

import '../organizations/verification-policies.js';

import {
  accountingHealthOverview,
  activatePreparedParishAccounting,
  activateProtectiveState,
  createBoundD1ProvisioningAdapter,
  detectAccountingEnvironment,
  releaseProtectiveState,
  runIntegrityScan,
  verifyRecoveryEvidence,
} from '../accounting/index.js';

import { resolveAccountingDatabaseForParish } from './accounting-ledger.js';
import { ADMIN_ACCOUNTING_ACTOR, PROTECTIVE_STATES, accountingRows, accountingServiceTier } from './admin-shared.js';
import './admin-revenue.js';
import './admin-registration-storage.js';
import './admin-session-operations.js';
import './admin-registration-detail.js';
import './admin-onboarding-test.js';
export function preparedAccountingDatabase(env: AdminEnvironment, parishId: string) {
  let configured: Record<string, unknown> = {};
  try {
    configured = JSON.parse(String(env.ACCOUNTING_PREPARED_PARISH_DATABASES || '{}'));
  } catch {
    return '';
  }
  const identifier = configured?.[parishId];
  return typeof identifier === 'string' ? identifier.trim() : '';
}
export async function listAdminAccountingTargets(env: AdminEnvironment) {
  const environment = detectAccountingEnvironment(env),
    canaryParishId = String(env.ACCOUNTING_CANARY_PARISH_ID || '').trim();
  const rows = await d1All<AdminSqlRow>(
    env,
    `SELECT e.parish_id parishId,e.subscription_tier subscriptionTier,e.entity_status entityStatus,e.activation_status activationStatus,d.provisioning_status provisioningStatus,d.health_status healthStatus FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id WHERE e.entity_status='ready' AND e.activation_status='active' AND d.environment=? AND d.provisioning_status='ready' ORDER BY e.parish_id`,
    environment
  );
  return rows.map((row) =>
    Object.freeze({
      parishId: row.parishId,
      subscriptionTier: accountingServiceTier(row.subscriptionTier),
      entityStatus: row.entityStatus,
      activationStatus: row.activationStatus,
      provisioningStatus: row.provisioningStatus,
      healthStatus: row.healthStatus,
      internalCanary: Boolean(canaryParishId && row.parishId === canaryParishId),
    })
  );
}
export async function adminAccountingTarget(env: AdminEnvironment, parishId: string) {
  const resolved = await resolveAccountingDatabaseForParish(env, parishId);
  if (
    !resolved.entity ||
    resolved.entity.entityStatus !== 'ready' ||
    resolved.entity.activationStatus !== 'active' ||
    resolved.registry?.provisioningStatus !== 'ready'
  )
    return { error: json({ error: 'Parish accounting is not provisioned.' }, { status: 409 }) };
  if (!resolved.db) return { error: json({ error: 'Parish accounting database is unavailable.' }, { status: 503 }) };
  const tier = resolved.registration ? accountingTierFor(resolved.registration) : resolved.entity.subscriptionTier;
  return { ...resolved, tier: accountingServiceTier(tier) } as typeof resolved & {
    db: NonNullable<typeof resolved.db>;
    tier: ReturnType<typeof accountingServiceTier>;
    error?: undefined;
  };
}

function paymentRecoveryGuidance(status: 'failed' | 'processing', message: string | null) {
  if (status === 'processing') {
    return {
      reason: 'Processing exceeded the expected time.',
      nextStep: 'Check the latest delivery in Stripe Workbench before resending it.',
    };
  }
  if (message === 'The original gift is not yet available for this Stripe refund.') {
    return {
      reason: 'The original gift has not been recorded yet.',
      nextStep:
        'Confirm the original payment is recorded in AGAPAY, then resend the refund event from Stripe Workbench.',
    };
  }
  if (
    message === 'Unable to load the Stripe charge refund records for Accounting.' ||
    message === 'Unable to load the charge for the updated Stripe refund.' ||
    message === 'Unable to resolve the recurring donation invoice payment.'
  ) {
    return {
      reason: 'AGAPAY could not retrieve a related payment record from Stripe.',
      nextStep:
        'Check the connected account and Stripe delivery details. Resend from Stripe Workbench once the record is available.',
    };
  }
  return {
    reason: 'Payment processing failed.',
    nextStep: 'Review the Stripe delivery and AGAPAY logs for this event before resending it.',
  };
}

export async function handleAdminAccountingOperations(request: Request, env: AdminEnvironment) {
  const admin = await requireAdminContext(request, env);
  if (!admin) return unauthorized();
  const url = new URL(request.url),
    path = url.pathname,
    body: AdminMutation = request.method === 'GET' ? {} : ((await request.json().catch(() => ({}))) as AdminMutation);
  try {
    if (path === '/api/admin/accounting/payment-exceptions') {
      const response = { headers: { 'Cache-Control': 'no-store' } };
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { ...response, status: 405 });
      if (!env.AGAPAY_DB)
        return json({ error: 'Payment exception data is unavailable.' }, { ...response, status: 503 });
      const cutoff = new Date(Date.now() - STRIPE_EVENT_PROCESSING_RETRY_MS).toISOString();
      const events = await d1All<{
        id: string;
        event_type: string;
        status: 'failed' | 'processing';
        received_at: string;
        error_message: string | null;
      }>(
        env,
        `SELECT id, event_type, status, received_at, error_message FROM stripe_events
        WHERE id GLOB 'evt_*' AND (status='failed' OR (status='processing' AND received_at<?))
        ORDER BY received_at DESC, id DESC LIMIT 51`,
        cutoff
      );
      return json(
        {
          events: events.slice(0, 50).map((event) => ({
            id: event.id,
            type: event.event_type,
            status: event.status === 'failed' ? 'failed' : 'stalled',
            receivedAt: event.received_at,
            ...paymentRecoveryGuidance(event.status, event.error_message),
          })),
          hasMore: events.length > 50,
        },
        response
      );
    }
    if (request.method === 'GET' && path === '/api/admin/accounting/targets')
      return json({
        ok: true,
        environment: detectAccountingEnvironment(env),
        targets: await listAdminAccountingTargets(env),
      });
    const parishId = String(
      request.method === 'GET' ? url.searchParams.get('parishId') || '' : body.parishId || ''
    ).trim();
    if (!parishId) return json({ error: 'parishId is required.' }, { status: 422 });
    if (request.method === 'POST' && path === '/api/admin/accounting/activate-prepared') {
      const environment = detectAccountingEnvironment(env);
      if (environment === 'production')
        return json({ error: 'Prepared database activation is unavailable in production.' }, { status: 403 });
      const registration = (await findRegistrationByParishId<AdminRegistration>(env, parishId))?.registration || null;
      if (!registration) return json({ error: 'Parish was not found.' }, { status: 404 });
      if (!accountingEnabledFor(registration))
        return json({ error: 'Accounting is not included in this subscription.' }, { status: 403 });
      const databaseIdentifier = preparedAccountingDatabase(env, parishId);
      if (!databaseIdentifier)
        return json({ error: 'No prepared accounting database is assigned to this parish.' }, { status: 409 });
      const result = await activatePreparedParishAccounting(env, {
        adapter: createBoundD1ProvisioningAdapter(env),
        parishId,
        databaseIdentifier,
        environment,
        subscriptionTier: accountingServiceTier(accountingTierFor(registration)),
        actorUserId: admin.actor,
        correlationId: `admin-activation-${Date.now()}`,
      });
      await recordAuditEvent(env, request, {
        action: 'accounting.prepared_database.activate',
        actorUserId: admin.actor,
        actorType: 'admin',
        targetType: 'parish_accounting',
        targetId: parishId,
        organizationId: parishId,
        reason: 'Activate configured prepared accounting database',
        metadata: { environment, databaseIdentifier, result },
      });
      return json({ ok: true, parishId, result });
    }
    const target = await adminAccountingTarget(env, parishId);
    if (target.error) return target.error;
    const { db, tier } = target;
    if (request.method === 'GET' && path === '/api/admin/accounting/health')
      return json({
        ok: true,
        parishId,
        health: await accountingHealthOverview(db, { actor: ADMIN_ACCOUNTING_ACTOR, entitlementTier: tier }),
      });
    if (request.method === 'GET' && path === '/api/admin/accounting/integrity-scans')
      return json({
        ok: true,
        parishId,
        scans: await accountingRows(
          db,
          `SELECT s.id,s.scan_type scanType,s.scope,s.status,s.started_at startedAt,s.completed_at completedAt,s.checks_total checksTotal,s.checks_passed checksPassed,s.checks_warned checksWarned,s.checks_failed checksFailed,s.critical_failures criticalFailures,s.scanner_version scannerVersion,s.schema_version schemaVersion,s.correlation_id correlationId,COUNT(f.id) findingCount,SUM(CASE WHEN f.severity='critical' THEN 1 ELSE 0 END) criticalFindingCount FROM accounting_integrity_scans s LEFT JOIN accounting_integrity_findings f ON f.scan_id=s.id GROUP BY s.id ORDER BY s.created_at DESC LIMIT 50`
        ),
      });
    if (request.method === 'GET' && path === '/api/admin/accounting/recovery-verifications')
      return json({
        ok: true,
        parishId,
        verifications: await accountingRows(
          db,
          `SELECT id,verification_type verificationType,status,artifact_reference artifactReference,artifact_checksum artifactChecksum,manifest_checksum manifestChecksum,schema_valid schemaValid,trial_balance_hash trialBalanceHash,source_links_valid sourceLinksValid,reconciliations_valid reconciliationsValid,close_snapshots_valid closeSnapshotsValid,verified_by verifiedBy,verified_at verifiedAt,expires_at expiresAt,correlation_id correlationId FROM accounting_recovery_verifications ORDER BY verified_at DESC LIMIT 50`
        ),
      });
    let action = '',
      result = null;
    const reason = body.reason || body.reasonCode || '';
    if (request.method === 'POST' && path === '/api/admin/accounting/integrity-scan') {
      action = 'accounting.integrity_scan.run';
      result = await runIntegrityScan(db, {
        actor: ADMIN_ACCOUNTING_ACTOR,
        entitlementTier: tier,
        scanType: body.scanType || 'manual',
        scope: body.scope || 'full',
        correlationId: body.correlationId || '',
        resumeScanId: body.resumeScanId || '',
      });
    } else if (request.method === 'POST' && path === '/api/admin/accounting/protective-state') {
      if (!PROTECTIVE_STATES.has(body.state as string))
        return json(
          { error: 'Protective state must be normal, degraded_read_only, posting_blocked, or recovering.' },
          { status: 422 }
        );
      if (body.state === 'normal')
        return json({ error: 'Use the protective-state release route to return to normal.' }, { status: 422 });
      action = 'accounting.protective_state.activate';
      result = await activateProtectiveState(db, {
        actor: ADMIN_ACCOUNTING_ACTOR,
        state: body.state!,
        reasonCode: body.reasonCode!,
        safeSummary: body.safeSummary!,
        sourceScanId: body.sourceScanId || null,
        expectedVersion: body.expectedVersion,
      });
    } else if (request.method === 'POST' && path === '/api/admin/accounting/protective-state/release') {
      action = 'accounting.protective_state.release';
      result = await releaseProtectiveState(db, {
        actor: ADMIN_ACCOUNTING_ACTOR,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
      });
    } else if (request.method === 'POST' && path === '/api/admin/accounting/recovery-verification') {
      action = 'accounting.recovery_evidence.verify';
      result = await verifyRecoveryEvidence(db, {
        actor: ADMIN_ACCOUNTING_ACTOR,
        entitlementTier: tier,
        verificationType: body.verificationType!,
        artifactReference: body.artifactReference,
        artifactBody: body.artifactBody,
        manifest: body.manifest!,
        correlationId: body.correlationId || '',
      });
    } else return json({ error: 'Not found' }, { status: 404 });
    await recordAuditEvent(env, request, {
      action,
      actorUserId: admin.actor,
      actorType: 'admin',
      targetType: 'parish_accounting',
      targetId: parishId,
      organizationId: parishId,
      reason: String(reason || '').trim() || null,
      metadata: { systemActorId: ADMIN_ACCOUNTING_ACTOR.id, result },
    });
    return json({ ok: true, parishId, result });
  } catch (error) {
    const conflict = Boolean((error as (Error & { details?: { conflict?: boolean } }) | undefined)?.details?.conflict);
    return json(
      {
        error: conflict ? 'conflict' : 'accounting_request_failed',
        message: (error as Error | undefined)?.message || 'Accounting operations request failed.',
      },
      { status: conflict ? 409 : 400 }
    );
  }
}
