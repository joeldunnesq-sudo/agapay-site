import type { TaxEnvironment, TaxClaimRow, TaxSyncRow } from './tax-exemption-composition-contracts.js';

// src/handlers/tax-exemption.js
//
// Parish-facing claim/upload/self-view routes and AGAPAY admin review
// routes for the sales-tax exemption workflow. Mounted from src/worker.js.

import { json, unauthorized, hasProductionStore, missingProductionStoreResponse, d1, d1All } from '../lib/core.js';

import { loadRegistrationByReference, requireAdminContext } from './parish.js';

import {
  getTaxExemptionById,
  listTaxExemptionDocuments,
  getCurrentTaxExemptionDocument,
  listTaxExemptionAuditLog,
  listTaxExemptionNotes,
  taxExemptionToJson,
  writeTaxExemptionAuditLog,
  aggregateSyncState,
  computeAllowedActions,
  getTaxExemptionSummaryCounts,
  isTaxExemptionWorkflowEnabled,
  isTaxExemptionStripeSyncEnabled,
  CUSTOMER_ROLE_LABELS,
} from '../lib/tax-exemption.js';

import { streamExemptionDocument } from '../lib/tax-exemption-storage.js';

import { hasNoStatewideGeneralSalesTax, NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY } from '../lib/tax-codes.js';
import './tax-exemption-shared.js';
import './tax-exemption-shared.js';
import './tax-exemption-parish.js';
import './tax-exemption-admin-review.js';
export {
  handleTaxExemptionStateGuidance,
  handleParishTaxExemptionClaim,
  handleClaimScopedDocumentUpload,
  handleParishTaxExemptionDocumentUpload,
  handleParishTaxExemptionDocumentView,
} from './tax-exemption-parish.js';
export {
  handleAdminTaxExemptionApprove,
  handleAdminTaxExemptionReject,
  handleAdminTaxExemptionRequestReplacement,
  handleAdminTaxExemptionRevoke,
  handleAdminTaxExemptionExpire,
  handleAdminTaxExemptionRetrySync,
  handleAdminTaxExemptionSyncRetry,
  handleAdminTaxExemptionSyncReconcile,
  handleAdminTaxExemptionNote,
} from './tax-exemption-admin-review.js';

// ---------------------------------------------------------------------
// Admin-facing review queue and actions.
// Mounted at /api/admin/tax-exemptions[...]
// ---------------------------------------------------------------------

export async function handleAdminTaxExemptionQueue(request: Request, env: TaxEnvironment) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!d1(env)) return json({ claims: [] });

  const url = new URL(request.url);
  const statusFilter = String(url.searchParams.get('status') || '').trim();
  const stateFilter = String(url.searchParams.get('state') || '')
    .trim()
    .toUpperCase();
  const jurisdictionFilter = String(url.searchParams.get('jurisdiction') || '')
    .trim()
    .toUpperCase();
  const exemptionTypeFilter = String(url.searchParams.get('exemptionType') || '').trim();
  const search = String(url.searchParams.get('q') || '').trim();
  // Derived/virtual filters that need a join or post-filter rather than a
  // plain WHERE on tax_exemptions.status:
  const virtualFilter = [
    'sync_failed',
    'sync_pending',
    'partial_sync',
    'reconciliation_required',
    'waiting_for_customer',
    'pending_without_document',
    'expiring_soon',
  ].includes(statusFilter)
    ? statusFilter
    : '';

  const where = [];
  const params = [];
  if (statusFilter && !virtualFilter) {
    where.push('t.status = ?');
    params.push(statusFilter);
  }
  if (jurisdictionFilter) {
    where.push('t.jurisdiction = ?');
    params.push(jurisdictionFilter);
  }
  if (exemptionTypeFilter) {
    where.push('t.exemption_type = ?');
    params.push(exemptionTypeFilter);
  }

  const rows = await d1All<TaxClaimRow & { parish_name?: string; contact_email?: string }>(
    env,
    `SELECT t.* FROM tax_exemptions t
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.updated_at DESC LIMIT 500`,
    ...params
  );

  // Enrich each row with what the queue needs to render without a second
  // round-trip per row from the browser: registration name/state (for
  // state-filter/search and display), current document existence, and
  // aggregate Stripe sync state. Scale here is inherently small (a niche
  // admin review workflow, not a high-volume table), so N+1 lookups against
  // indexed tables are an acceptable, simple tradeoff over a larger joined
  // query -- revisit if claim volume ever grows into the thousands.
  const enriched = [];
  for (const row of rows) {
    const registration = await loadRegistrationByReference(env, row.registration_reference);
    if (stateFilter && String(registration?.state || '').toUpperCase() !== stateFilter) continue;
    if (search) {
      const haystack =
        `${registration?.parishName || ''} ${row.registration_reference} ${registration?.parishId || ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) continue;
    }
    const syncRows = await d1All<TaxSyncRow>(
      env,
      `SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1`,
      row.id
    );
    const currentDoc = await getCurrentTaxExemptionDocument(env, row.id);
    const sync = aggregateSyncState(row, syncRows);
    const expiringSoon =
      row.status === 'approved' &&
      row.expiration_date &&
      row.expiration_date >= new Date().toISOString().slice(0, 10) &&
      row.expiration_date <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    if (virtualFilter === 'sync_failed' && sync !== 'failed') continue;
    if (virtualFilter === 'sync_pending' && sync !== 'pending') continue;
    if (virtualFilter === 'partial_sync' && sync !== 'partial') continue;
    if (virtualFilter === 'reconciliation_required' && sync !== 'reconciliation_required') continue;
    if (virtualFilter === 'waiting_for_customer' && sync !== 'waiting_for_customer') continue;
    if (
      virtualFilter === 'pending_without_document' &&
      !(['pending', 'replacement_required'].includes(row.status) && !currentDoc)
    )
      continue;
    if (virtualFilter === 'expiring_soon' && !expiringSoon) continue;

    enriched.push({
      ...taxExemptionToJson(row),
      parishName: registration?.parishName || '',
      parishId: registration?.parishId || '',
      state: registration?.state || '',
      hasDocument: Boolean(currentDoc),
      aggregateSyncState: sync,
      expiringSoon,
    });
  }

  return json({ claims: enriched.slice(0, 200) });
}

export async function handleAdminTaxExemptionSummary(request: Request, env: TaxEnvironment) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  const counts = await getTaxExemptionSummaryCounts(env);
  return json({
    counts,
    workflowEnabled: isTaxExemptionWorkflowEnabled(env),
    stripeSyncEnabled: isTaxExemptionStripeSyncEnabled(env),
  });
}

export async function handleAdminTaxExemptionDetail(request: Request, env: TaxEnvironment, taxExemptionId: string) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: 'Not found' }, { status: 404 });

  const registration = await loadRegistrationByReference(env, claim.registration_reference);
  const documents = await listTaxExemptionDocuments(env, taxExemptionId);
  const auditLog = await listTaxExemptionAuditLog(env, taxExemptionId);
  const notes = await listTaxExemptionNotes(env, taxExemptionId);
  const syncRows = await d1All<TaxSyncRow>(
    env,
    `SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?1 ORDER BY created_at`,
    taxExemptionId
  );
  const currentDoc = documents.find((d) => Number(d.is_current) === 1) || null;
  const sync = aggregateSyncState(claim, syncRows);
  const workflowEnabled = isTaxExemptionWorkflowEnabled(env);
  const stateUpper = String(registration?.state || '').toUpperCase();

  return json({
    claim: taxExemptionToJson(claim),
    registration: registration
      ? {
          reference: registration.reference,
          parishName: registration.parishName,
          parishId: registration.parishId,
          registrationStatus: registration.status,
          addressLine1: registration.addressLine1,
          addressLine2: registration.addressLine2,
          city: registration.city,
          state: registration.state,
          postalCode: registration.postalCode,
          contactEmail: registration.treasurerEmail || registration.priestEmail || '',
          contactName: registration.treasurerFirst
            ? `${registration.treasurerFirst} ${registration.treasurerLast || ''}`.trim()
            : '',
          stripeCustomerId: registration.stripeCustomerId || '',
          stewardshipStripeCustomerId: registration.stewardshipStripeCustomerId || '',
          hasNoStatewideGeneralSalesTax: hasNoStatewideGeneralSalesTax(stateUpper),
          noStatewideGeneralSalesTaxGuidance: hasNoStatewideGeneralSalesTax(stateUpper)
            ? NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY[
                stateUpper as keyof typeof NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY
              ] || ''
            : '',
        }
      : null,
    documents: documents.map((d) => ({
      id: d.id,
      originalFilename: d.original_filename,
      mimeType: d.mime_type,
      fileSize: d.file_size,
      uploadedAt: d.uploaded_at,
      isCurrent: Number(d.is_current) === 1,
      archivedAt: d.archived_at,
      replacesDocumentId: d.replaces_document_id,
    })),
    auditLog: auditLog.map((a) => ({
      id: a.id,
      action: a.action,
      actorType: a.actor_type,
      actorUserId: a.actor_user_id,
      metadata: a.metadata_json ? JSON.parse(a.metadata_json) : {},
      createdAt: a.created_at,
    })),
    notes: notes.map((n) => ({ id: n.id, note: n.note, actorUserId: n.actor_user_id, createdAt: n.created_at })),
    stripeSyncs: syncRows.map((s) => ({
      id: s.id,
      stripeCustomerId: s.stripe_customer_id,
      customerRole: s.customer_role,
      customerRoleLabel: CUSTOMER_ROLE_LABELS[s.customer_role as keyof typeof CUSTOMER_ROLE_LABELS] || s.customer_role,
      desiredStatus: s.desired_tax_exempt_status,
      previousStatus: s.previous_tax_exempt_status,
      agapayOwnedChange: Number(s.agapay_owned_change) === 1,
      syncStatus: s.sync_status,
      lastError: s.last_error,
      attemptCount: s.attempt_count,
      attemptedAt: s.attempted_at,
      syncedAt: s.synced_at,
      stripeRequestId: s.stripe_request_id,
    })),
    hasCurrentDocument: Boolean(currentDoc),
    aggregateSyncState: sync,
    workflowEnabled,
    stripeSyncEnabled: isTaxExemptionStripeSyncEnabled(env),
    allowedActions: computeAllowedActions(claim, { hasDocument: Boolean(currentDoc), syncRows, workflowEnabled }),
  });
}

export async function handleAdminTaxExemptionDocumentView(
  request: Request,
  env: TaxEnvironment,
  taxExemptionId: string,
  mode: 'inline' | 'attachment' = 'inline'
) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();

  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) return json({ error: 'Not found' }, { status: 404 });
  const document = await getCurrentTaxExemptionDocument(env, taxExemptionId);
  if (!document) return json({ error: 'No document on file.' }, { status: 404 });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    documentId: document.id,
    registrationReference: claim.registration_reference,
    action: mode === 'attachment' ? 'document_downloaded' : 'document_viewed',
    actorType: 'admin',
    actorUserId: adminContext.actor,
  });

  return streamExemptionDocument(env, {
    storageKey: document.storage_key,
    mimeType: document.mime_type,
    sanitizedFilename: document.sanitized_filename,
    mode,
  });
}
