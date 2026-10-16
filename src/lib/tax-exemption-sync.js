// Generated from src/lib/tax-exemption-sync.ts by npm run build:server. Do not edit.
import { d1, d1First, d1All, d1Run } from './core.js';
import { stripeGetRequest } from './stripe-connect.js';
import './email.js';
import './tax-exemption-shared.js';
import './tax-exemption.js';
import { nowIso, newSyncId } from './tax-exemption-shared.js';
import { writeTaxExemptionAuditLog } from './tax-exemption-records.js';
import './tax-exemption-review.js';
function resolveApplicableStripeCustomers(registration = {}) {
  const customers = [];
  if (registration.stripeCustomerId) {
    customers.push({ stripeCustomerId: registration.stripeCustomerId, customerRole: 'giving_parish_plus' });
  }
  if (registration.stewardshipStripeCustomerId) {
    customers.push({ stripeCustomerId: registration.stewardshipStripeCustomerId, customerRole: 'stewardship' });
  }
  return customers;
}
async function ensureStripeSyncRows(env, { taxExemptionId, registrationReference, customers, desiredTaxExemptStatus }) {
  const rows = [];
  for (const { stripeCustomerId, customerRole } of customers) {
    const existing = await d1First(
      env,
      `SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1 AND stripe_customer_id = ?2`,
      taxExemptionId,
      stripeCustomerId
    );
    if (existing) {
      if (existing.sync_status === 'succeeded' && existing.desired_tax_exempt_status === desiredTaxExemptStatus) {
        rows.push(existing.id);
        continue;
      }
      await d1Run(
        env,
        `UPDATE tax_exemption_stripe_syncs
         SET desired_tax_exempt_status = ?1, sync_status = 'pending', updated_at = ?2
         WHERE id = ?3`,
        desiredTaxExemptStatus,
        nowIso(),
        existing.id
      );
      rows.push(existing.id);
    } else {
      const id = newSyncId();
      await d1Run(
        env,
        `INSERT INTO tax_exemption_stripe_syncs (
          id, tax_exemption_id, registration_reference, stripe_customer_id, customer_role,
          desired_tax_exempt_status, sync_status, idempotency_key, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, ?8)`,
        id,
        taxExemptionId,
        registrationReference,
        stripeCustomerId,
        customerRole,
        desiredTaxExemptStatus,
        `${taxExemptionId}:${stripeCustomerId}:${desiredTaxExemptStatus}`,
        nowIso()
      );
      rows.push(id);
    }
  }
  return rows;
}
async function runStripeCustomerSync(env, syncRowId) {
  const row = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncRowId);
  if (!row) return { ok: false, error: 'Sync row not found' };
  await d1Run(
    env,
    `UPDATE tax_exemption_stripe_syncs SET sync_status = 'pending', attempted_at = ?1, attempt_count = attempt_count + 1, updated_at = ?1 WHERE id = ?2`,
    nowIso(),
    syncRowId
  );
  const retrieved = await stripeGetRequest(env, `/v1/customers/${encodeURIComponent(row.stripe_customer_id)}`);
  if (!retrieved.ok) {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs SET sync_status = 'failed', last_error = ?1, updated_at = ?2 WHERE id = ?3`,
      retrieved.body?.error?.message || 'Stripe Customer lookup failed',
      nowIso(),
      syncRowId
    );
    return { ok: false, error: retrieved.body?.error?.message || 'Stripe Customer lookup failed' };
  }
  if (retrieved.body?.deleted) {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs SET sync_status = 'failed', last_error = ?1, updated_at = ?2 WHERE id = ?3`,
      'Stripe Customer has been deleted',
      nowIso(),
      syncRowId
    );
    return { ok: false, error: 'Stripe Customer has been deleted' };
  }
  const currentStatus = retrieved.body.tax_exempt || 'none';
  const isRestore = row.desired_tax_exempt_status === 'none';
  if (isRestore) {
    if (Number(row.agapay_owned_change) !== 1) {
      await d1Run(
        env,
        `UPDATE tax_exemption_stripe_syncs
         SET sync_status = 'reconciliation_required', previous_tax_exempt_status = ?1,
             last_error = 'This Customer''s exemption was not set by AGAPAY; automatic reversal was skipped. Manual reconciliation required.',
             updated_at = ?2
         WHERE id = ?3`,
        currentStatus,
        nowIso(),
        syncRowId
      );
      return {
        ok: false,
        reconciliationRequired: true,
        error: 'Exemption was not AGAPAY-owned; skipped automatic reversal.',
      };
    }
    if (currentStatus !== 'exempt') {
      await d1Run(
        env,
        `UPDATE tax_exemption_stripe_syncs
         SET sync_status = 'reconciliation_required', previous_tax_exempt_status = ?1,
             last_error = 'Stripe Customer tax_exempt state changed externally since AGAPAY last set it; automatic reversal was skipped. Manual reconciliation required.',
             updated_at = ?2
         WHERE id = ?3`,
        currentStatus,
        nowIso(),
        syncRowId
      );
      return {
        ok: false,
        reconciliationRequired: true,
        error: 'Stripe state changed externally; skipped automatic reversal.',
      };
    }
  } else if (currentStatus === row.desired_tax_exempt_status) {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs
       SET sync_status = 'succeeded', previous_tax_exempt_status = ?1, agapay_owned_change = 0,
           synced_at = ?2, last_error = NULL, updated_at = ?2
       WHERE id = ?3`,
      currentStatus,
      nowIso(),
      syncRowId
    );
    return { ok: true, previousStatus: currentStatus, agapayOwnedChange: false };
  }
  const form = new URLSearchParams({ tax_exempt: row.desired_tax_exempt_status });
  form.set('metadata[agapay_tax_exemption_id]', row.tax_exemption_id);
  const idempotencyKey =
    row.idempotency_key || `${row.tax_exemption_id}:${row.stripe_customer_id}:${row.desired_tax_exempt_status}`;
  const updated = await stripeFormRequestWithIdempotency(
    env,
    `/v1/customers/${encodeURIComponent(row.stripe_customer_id)}`,
    form,
    idempotencyKey
  );
  if (!updated.ok) {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs
       SET sync_status = 'failed', last_error = ?1, previous_tax_exempt_status = ?2, updated_at = ?3
       WHERE id = ?4`,
      updated.body?.error?.message || 'Stripe Customer update failed',
      currentStatus,
      nowIso(),
      syncRowId
    );
    return { ok: false, error: updated.body?.error?.message || 'Stripe Customer update failed' };
  }
  await d1Run(
    env,
    `UPDATE tax_exemption_stripe_syncs
     SET sync_status = 'succeeded', previous_tax_exempt_status = ?1, stripe_request_id = ?2,
         agapay_owned_change = 1, synced_at = ?3, last_error = NULL, updated_at = ?3
     WHERE id = ?4`,
    currentStatus,
    updated.requestId || '',
    nowIso(),
    syncRowId
  );
  return { ok: true, previousStatus: currentStatus, agapayOwnedChange: true };
}
async function stripeFormRequestWithIdempotency(env, path, form, idempotencyKey) {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 500, body: { error: { message: 'STRIPE_SECRET_KEY is not configured' } } };
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body: form,
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body, requestId: response.headers.get('request-id') || '' };
}
async function runAllPendingStripeSyncs(env, taxExemptionId) {
  const rows = await d1All(
    env,
    `SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1 AND sync_status IN ('pending','failed')`,
    taxExemptionId
  );
  const results = await Promise.all(rows.map((row) => runStripeCustomerSync(env, row.id)));
  const succeeded = results.filter((r) => r.ok).length;
  const reconciliationRequired = results.filter((r) => r.reconciliationRequired).length;
  const failed = results.length - succeeded - reconciliationRequired;
  return { total: results.length, succeeded, failed, reconciliationRequired };
}
async function retryOneStripeSync(env, syncRowId) {
  return runStripeCustomerSync(env, syncRowId);
}
async function reconcileStripeSync(env, { syncRowId, actor, action }) {
  const row = await d1First(env, `SELECT * FROM tax_exemption_stripe_syncs WHERE id = ?1`, syncRowId);
  if (!row) throw new Error('Sync row not found');
  if (row.sync_status !== 'reconciliation_required') {
    throw new Error('This Customer is not currently awaiting reconciliation');
  }
  if (action === 'accept_external') {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs
       SET sync_status = 'succeeded', agapay_owned_change = 0, last_error = NULL, synced_at = ?1, updated_at = ?1
       WHERE id = ?2`,
      nowIso(),
      syncRowId
    );
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId: row.tax_exemption_id,
      registrationReference: row.registration_reference,
      action: 'reconciliation_required',
      actorType: 'admin',
      actorUserId: actor,
      metadata: { resolution: 'accept_external', stripeCustomerId: row.stripe_customer_id },
    });
    return { ok: true, resolution: 'accept_external' };
  }
  if (action === 'force_apply') {
    await d1Run(
      env,
      `UPDATE tax_exemption_stripe_syncs SET sync_status = 'pending', updated_at = ?1 WHERE id = ?2`,
      nowIso(),
      syncRowId
    );
    const result = await runStripeCustomerSync(env, syncRowId);
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId: row.tax_exemption_id,
      registrationReference: row.registration_reference,
      action: 'reconciliation_required',
      actorType: 'admin',
      actorUserId: actor,
      metadata: { resolution: 'force_apply', ok: result.ok, stripeCustomerId: row.stripe_customer_id },
    });
    return result;
  }
  throw new Error('Unknown reconciliation action');
}
async function getTaxExemptionSummaryCounts(env) {
  const zero = {
    pending: 0,
    approved: 0,
    replacementRequired: 0,
    expiringSoon: 0,
    expired: 0,
    rejected: 0,
    revoked: 0,
    failedSync: 0,
    partialSync: 0,
    reconciliationRequired: 0,
    waitingForCustomer: 0,
    pendingWithoutDocument: 0,
    needsAttention: 0,
  };
  if (!d1(env)) return zero;
  const statusRows = await d1All(env, `SELECT status, COUNT(*) AS n FROM tax_exemptions GROUP BY status`);
  const byStatus = {};
  for (const row of statusRows) byStatus[row.status] = Number(row.n) || 0;
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  const today = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
  const expiringSoonRow = await d1First(
    env,
    `SELECT COUNT(*) AS n FROM tax_exemptions WHERE status = 'approved' AND expiration_date IS NOT NULL AND expiration_date != '' AND expiration_date BETWEEN ?1 AND ?2`,
    today,
    in30Days
  );
  const syncStatusRows = await d1All(env, `SELECT tax_exemption_id, sync_status FROM tax_exemption_stripe_syncs`);
  const byExemption = {};
  for (const row of syncStatusRows) {
    if (!byExemption[row.tax_exemption_id]) byExemption[row.tax_exemption_id] = [];
    byExemption[row.tax_exemption_id].push(row.sync_status);
  }
  let failedSync = 0,
    partialSync = 0,
    reconciliationRequired = 0;
  for (const statuses of Object.values(byExemption)) {
    if (statuses.includes('reconciliation_required')) {
      reconciliationRequired += 1;
      continue;
    }
    const failed = statuses.filter((s) => s === 'failed').length;
    const succeeded = statuses.filter((s) => s === 'succeeded').length;
    if (failed > 0 && succeeded > 0) partialSync += 1;
    else if (failed > 0) failedSync += 1;
  }
  const waitingForCustomerRow = await d1First(
    env,
    `SELECT COUNT(*) AS n FROM tax_exemptions t
     WHERE t.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM tax_exemption_stripe_syncs s WHERE s.tax_exemption_id = t.id)`
  );
  const pendingWithoutDocumentRow = await d1First(
    env,
    `SELECT COUNT(*) AS n FROM tax_exemptions t
     WHERE t.status IN ('pending', 'replacement_required')
       AND NOT EXISTS (SELECT 1 FROM tax_exemption_documents d WHERE d.tax_exemption_id = t.id AND d.is_current = 1)`
  );
  const needsAttentionRow = await d1First(
    env,
    `SELECT COUNT(DISTINCT t.id) AS n
       FROM tax_exemptions t
       LEFT JOIN tax_exemption_stripe_syncs s ON s.tax_exemption_id = t.id
      WHERE t.status IN ('pending', 'replacement_required')
         OR (t.status = 'approved' AND t.expiration_date IS NOT NULL AND t.expiration_date != '' AND t.expiration_date BETWEEN ?1 AND ?2)
         OR s.sync_status IN ('failed', 'reconciliation_required')`,
    today,
    in30Days
  );
  return {
    pending: byStatus.pending || 0,
    approved: byStatus.approved || 0,
    replacementRequired: byStatus.replacement_required || 0,
    expiringSoon: Number(expiringSoonRow?.n) || 0,
    expired: byStatus.expired || 0,
    rejected: byStatus.rejected || 0,
    revoked: byStatus.revoked || 0,
    failedSync,
    partialSync,
    reconciliationRequired,
    waitingForCustomer: Number(waitingForCustomerRow?.n) || 0,
    pendingWithoutDocument: Number(pendingWithoutDocumentRow?.n) || 0,
    needsAttention: Number(needsAttentionRow?.n) || 0,
  };
}
export {
  ensureStripeSyncRows,
  getTaxExemptionSummaryCounts,
  reconcileStripeSync,
  resolveApplicableStripeCustomers,
  retryOneStripeSync,
  runAllPendingStripeSyncs,
  runStripeCustomerSync,
  stripeFormRequestWithIdempotency,
};
