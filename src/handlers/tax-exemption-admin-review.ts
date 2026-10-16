import type { TaxEnvironment, TaxSyncRow, TaxRequestBody } from './tax-exemption-composition-contracts.js';

// src/handlers/tax-exemption.js
//
// Parish-facing claim/upload/self-view routes and AGAPAY admin review
// routes for the sales-tax exemption workflow. Mounted from src/worker.js.

import { json, unauthorized, rateLimit, d1All, d1First } from '../lib/core.js';

import { loadRegistrationByReference, requireAdminContext } from './parish.js';

import {
  getTaxExemptionById,
  addTaxExemptionNote,
  approveTaxExemption,
  approveTaxExemptionWithoutStripeSync,
  rejectTaxExemption,
  requestReplacementDocumentation,
  revokeTaxExemption,
  expireTaxExemptionManually,
  StaleRecordError,
  runAllPendingStripeSyncs,
  retryOneStripeSync,
  reconcileStripeSync,
  writeTaxExemptionAuditLog,
  aggregateSyncState,
  isTaxExemptionWorkflowEnabled,
  isTaxExemptionStripeSyncEnabled,
} from '../lib/tax-exemption.js';

import '../lib/tax-exemption-storage.js';

import '../lib/tax-codes.js';
import { RECONCILE_ACTIONS } from './tax-exemption-shared.js';
import {
  staleRecordResponse,
  requireExpectedVersion,
  loadClaimAndRegistration,
  loadSyncRowScopedToExemption,
} from './tax-exemption-shared.js';
import './tax-exemption-parish.js';
import './tax-exemption.js';

export async function handleAdminTaxExemptionApprove(request: Request, env: TaxEnvironment, taxExemptionId: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body: TaxRequestBody = {};
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    /* no body */
  }
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;
  const expectedVersion = versionCheck.expectedVersion;

  try {
    const result = isTaxExemptionStripeSyncEnabled(env)
      ? await approveTaxExemption(env, { taxExemptionId, registration, actor: adminContext.actor, expectedVersion })
      : await approveTaxExemptionWithoutStripeSync(env, { taxExemptionId, actor: adminContext.actor, expectedVersion });
    return json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: (err as Error).message || 'Approval failed' }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionReject(request: Request, env: TaxEnvironment, taxExemptionId: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body: TaxRequestBody = {};
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    /* no body */
  }
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;

  try {
    const result = await rejectTaxExemption(env, {
      taxExemptionId,
      registration,
      actor: adminContext.actor,
      reason: String(body.reason || '').trim(),
      expectedVersion: versionCheck.expectedVersion,
    });
    return json(result);
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: (err as Error).message || 'Rejection failed' }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionRequestReplacement(
  request: Request,
  env: TaxEnvironment,
  taxExemptionId: string
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body: TaxRequestBody = {};
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    /* no body */
  }
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;

  try {
    const result = await requestReplacementDocumentation(env, {
      taxExemptionId,
      registration,
      actor: adminContext.actor,
      reason: String(body.reason || '').trim(),
      keepActiveDuringReplacement: body.keepActiveDuringReplacement === true,
      expectedVersion: versionCheck.expectedVersion,
    });
    return json(result);
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: (err as Error).message || 'Request failed' }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionRevoke(request: Request, env: TaxEnvironment, taxExemptionId: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body: TaxRequestBody = {};
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    /* no body */
  }
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;

  try {
    const result = await revokeTaxExemption(env, {
      taxExemptionId,
      registration,
      actor: adminContext.actor,
      reason: String(body.reason || '').trim(),
      expectedVersion: versionCheck.expectedVersion,
    });
    return json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: (err as Error).message || 'Revocation failed' }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionExpire(request: Request, env: TaxEnvironment, taxExemptionId: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const { error, registration } = await loadClaimAndRegistration(env, taxExemptionId);
  if (error) return error;

  let body: TaxRequestBody = {};
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    /* no body */
  }
  const reason = String(body.reason || '').trim();
  if (!reason) return json({ error: 'A reason is required to manually expire an exemption.' }, { status: 422 });
  if (body.confirm !== true)
    return json({ error: 'Manual expiration requires explicit confirmation (confirm: true).' }, { status: 422 });
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;

  try {
    const result = await expireTaxExemptionManually(env, {
      taxExemptionId,
      registration,
      actor: adminContext.actor,
      reason,
      expectedVersion: versionCheck.expectedVersion,
    });
    return json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof StaleRecordError) return staleRecordResponse(err);
    return json({ error: (err as Error).message || 'Manual expiration failed' }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionRetrySync(request: Request, env: TaxEnvironment, taxExemptionId: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: 'Not found' }, { status: 404 });

  let body: TaxRequestBody = {};
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    /* no body */
  }
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;
  if (claim.updated_at !== versionCheck.expectedVersion) {
    return staleRecordResponse(
      new StaleRecordError(
        'This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.',
        { currentVersion: claim.updated_at, currentStatus: claim.status }
      )
    );
  }

  const summary = await runAllPendingStripeSyncs(env, taxExemptionId);
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: summary.failed > 0 ? 'stripe_sync_partial' : 'stripe_sync_succeeded',
    actorType: 'admin',
    actorUserId: adminContext.actor,
    metadata: summary,
  });

  // If every customer now succeeds and the claim was still pending/
  // replacement_required (approval was previously blocked on a failed
  // sync), finalize the approval now.
  if (summary.failed === 0 && ['pending', 'replacement_required'].includes(claim.status)) {
    const registration = await loadRegistrationByReference(env, claim.registration_reference);
    if (registration) {
      const finalized = await approveTaxExemption(env, { taxExemptionId, registration, actor: adminContext.actor });
      return json(finalized);
    }
  }

  return json({ ok: summary.failed === 0, summary });
}

export async function handleAdminTaxExemptionSyncRetry(
  request: Request,
  env: TaxEnvironment,
  taxExemptionId: string,
  syncId: string
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: 'Exemption not found' }, { status: 404 });
  const syncRow = await loadSyncRowScopedToExemption(env, taxExemptionId, syncId);
  if (!syncRow) return json({ error: 'This Customer sync row does not belong to this exemption.' }, { status: 404 });

  let body: TaxRequestBody = {};
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    /* no body */
  }
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;
  if (claim.updated_at !== versionCheck.expectedVersion) {
    return staleRecordResponse(
      new StaleRecordError(
        'This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.',
        { currentVersion: claim.updated_at, currentStatus: claim.status }
      )
    );
  }

  if (syncRow.sync_status === 'succeeded') {
    return json({ error: 'This Customer already succeeded -- nothing to retry.' }, { status: 409 });
  }
  if (syncRow.sync_status === 'reconciliation_required') {
    return json(
      { error: 'This Customer requires reconciliation, not a plain retry. Use the reconcile action.' },
      { status: 409 }
    );
  }

  const result = await retryOneStripeSync(env, syncId);
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: result.ok ? 'stripe_sync_succeeded' : 'stripe_sync_failed',
    actorType: 'admin',
    actorUserId: adminContext.actor,
    metadata: { syncId, stripeCustomerId: syncRow.stripe_customer_id, retryOne: true },
  });

  const refreshedRow = await d1First<TaxSyncRow>(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncId);
  const allSyncRows = await d1All<TaxSyncRow>(
    env,
    `SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1`,
    taxExemptionId
  );
  return json(
    {
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      syncRow: refreshedRow
        ? {
            id: refreshedRow.id,
            stripeCustomerId: refreshedRow.stripe_customer_id,
            syncStatus: refreshedRow.sync_status,
            lastError: refreshedRow.last_error,
            attemptCount: refreshedRow.attempt_count,
          }
        : null,
      aggregateSyncState: aggregateSyncState(claim, allSyncRows),
    },
    { status: result.ok ? 200 : 409 }
  );
}

export async function handleAdminTaxExemptionSyncReconcile(
  request: Request,
  env: TaxEnvironment,
  taxExemptionId: string,
  syncId: string
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!isTaxExemptionWorkflowEnabled(env)) {
    return json({ error: 'The sales-tax exemption workflow is currently disabled.' }, { status: 403 });
  }

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: 'Exemption not found' }, { status: 404 });
  const syncRow = await loadSyncRowScopedToExemption(env, taxExemptionId, syncId);
  if (!syncRow) return json({ error: 'This Customer sync row does not belong to this exemption.' }, { status: 404 });

  let body: TaxRequestBody;
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const action = String(body.action || '');
  if (!RECONCILE_ACTIONS.has(action)) {
    return json({ error: "action must be 'accept_external' or 'force_apply'." }, { status: 422 });
  }
  const reason = String(body.reason || '').trim();
  if (!reason) return json({ error: 'A reason is required to reconcile a Customer.' }, { status: 422 });
  if (action === 'force_apply' && body.confirm !== true) {
    return json({ error: 'force_apply requires explicit confirmation (confirm: true).' }, { status: 422 });
  }
  const versionCheck = requireExpectedVersion(body);
  if (versionCheck.error) return versionCheck.error;
  if (claim.updated_at !== versionCheck.expectedVersion) {
    return staleRecordResponse(
      new StaleRecordError(
        'This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.',
        { currentVersion: claim.updated_at, currentStatus: claim.status }
      )
    );
  }

  try {
    const result = await reconcileStripeSync(env, { syncRowId: syncId, actor: adminContext.actor, action });
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: 'reconciliation_required',
      actorType: 'admin',
      actorUserId: adminContext.actor,
      metadata: { resolution: action, reason, syncId },
    });

    const refreshedRow = await d1First<TaxSyncRow>(
      env,
      `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`,
      syncId
    );
    const allSyncRows = await d1All<TaxSyncRow>(
      env,
      `SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1`,
      taxExemptionId
    );
    return json({
      ok: result.ok !== false,
      resolution: action,
      syncRow: refreshedRow
        ? {
            id: refreshedRow.id,
            stripeCustomerId: refreshedRow.stripe_customer_id,
            syncStatus: refreshedRow.sync_status,
            previousStatus: refreshedRow.previous_tax_exempt_status,
            agapayOwnedChange: Number(refreshedRow.agapay_owned_change) === 1,
          }
        : null,
      aggregateSyncState: aggregateSyncState(claim, allSyncRows),
    });
  } catch (err) {
    return json({ error: (err as Error).message || 'Reconciliation failed' }, { status: 422 });
  }
}

export async function handleAdminTaxExemptionNote(request: Request, env: TaxEnvironment, taxExemptionId: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  let body: TaxRequestBody;
  try {
    body = (await request.json()) as TaxRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const note = String(body.note || '').trim();
  if (!note) return json({ error: 'Note text is required.' }, { status: 422 });

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: 'Not found' }, { status: 404 });

  const id = await addTaxExemptionNote(env, { taxExemptionId, actorUserId: adminContext.actor, note });
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'admin_note_added',
    actorType: 'admin',
    actorUserId: adminContext.actor,
  });
  return json({ ok: true, id }, { status: 201 });
}
