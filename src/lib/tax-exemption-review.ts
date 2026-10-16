import type { TaxClaimRow, TaxRegistration, TaxEnvironment } from './tax-exemption-composition-contracts.js';

// src/lib/tax-exemption.js
//
// AGAPAY subscription sales-tax-exemption workflow. Applies ONLY to
// AGAPAY's own platform-account subscription Stripe Customers
// (registration.stripeCustomerId for Giving/Parish+,
// registration.stewardshipStripeCustomerId for Stewardship). NEVER touches
// donor Customers, bookstore purchaser Customers (both live on the parish's
// connected account), or AGAPAY Learn household Customers.
//
// All writes to tax_exemptions.status go through transitionTaxExemption()
// below -- no route handler should ever UPDATE that column directly.
//
// Schema: migrations/0011_tax_exemptions.sql.

import { d1, d1First, d1All } from './core.js';

import './stripe-connect.js';

import { sendEmail, agapayEmailHtml } from './email.js';
import './tax-exemption-shared.js';
import './tax-exemption.js';
import { nowIso, assertCurrentVersion } from './tax-exemption-shared.js';
import {
  writeTaxExemptionAuditLog,
  getTaxExemptionById,
  getCurrentTaxExemptionForRegistration,
  transitionTaxExemption,
} from './tax-exemption-records.js';
import {
  resolveApplicableStripeCustomers,
  ensureStripeSyncRows,
  runAllPendingStripeSyncs,
} from './tax-exemption-sync.js';
export async function notifyParish(
  env: TaxEnvironment,
  registration: TaxRegistration,
  subject: string,
  bodyHtml: string
) {
  if (!env.RESEND_API_KEY) return { status: 'not_configured' };
  const to = registration.treasurerEmail || registration.priestEmail || '';
  if (!to) return { status: 'no_recipient' };
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  return sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to,
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    subject,
    html: agapayEmailHtml(appUrl, subject, bodyHtml),
  });
}

/**
 * Approves a claim. Sequence (see Phase 2 plan section 5/§3 above):
 *   1. Validate status is pending or replacement_required.
 *   2. Resolve applicable Stripe Customers.
 *   3. Set sync rows to pending (D1 write).
 *   4. Call Stripe for each Customer.
 *   5. Only if ALL required customers succeed, finalize locally as approved.
 *   6. If any customer fails, leave the claim's status unchanged and the
 *      failed sync row retryable -- never a partial approval.
 */
export async function approveTaxExemption(
  env: TaxEnvironment,
  {
    taxExemptionId,
    registration,
    actor,
    expectedVersion,
  }: { taxExemptionId: string; registration: TaxRegistration; actor: string; expectedVersion?: string }
) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error('Tax exemption not found');
  assertCurrentVersion(claim, expectedVersion);
  if (!['pending', 'replacement_required'].includes(claim.status)) {
    throw new Error(`Cannot approve a claim in status '${claim.status}'`);
  }

  const customers = resolveApplicableStripeCustomers(registration);

  if (!customers.length) {
    // The legal claim can be approved on its documentation alone even
    // before the parish has a platform Stripe Customer yet (e.g. approved
    // during onboarding, before first subscription checkout). There is
    // nothing to sync yet -- this is NOT reported as a synced success.
    // applyApprovedExemptionIfExists() (called from the Giving/Parish+ and
    // Stewardship checkout paths) applies it the moment a Customer is
    // actually created.
    const updated = await transitionTaxExemption(env, {
      taxExemptionId,
      nextStatus: 'approved',
      fields: { approved_at: nowIso(), approved_by: actor, rejection_reason: null },
      registrationFields: {
        tax_exemption_expiration_date: claim.expiration_date || null,
        current_tax_exemption_id: taxExemptionId,
      },
    });
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: 'approved',
      actorType: 'admin',
      actorUserId: actor,
      metadata: { waitingForCustomer: true },
    });
    return { ok: true, status: 'approved', waitingForCustomer: true, exemption: updated };
  }

  await ensureStripeSyncRows(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    customers,
    desiredTaxExemptStatus: 'exempt',
  });
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'stripe_sync_attempted',
    actorType: 'admin',
    actorUserId: actor,
    metadata: { customerCount: customers.length },
  });

  const summary = await runAllPendingStripeSyncs(env, taxExemptionId);

  if (summary.failed > 0 || summary.reconciliationRequired > 0) {
    await writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: summary.succeeded > 0 ? 'stripe_sync_partial' : 'stripe_sync_failed',
      actorType: 'system',
      metadata: summary,
    });
    return {
      ok: false,
      status: claim.status,
      summary,
      error:
        'One or more Stripe Customers failed to update. The claim has not been approved -- retry the failed customer(s).',
    };
  }

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'stripe_sync_succeeded',
    actorType: 'system',
    metadata: summary,
  });

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: 'approved',
    fields: { approved_at: nowIso(), approved_by: actor, rejection_reason: null },
    registrationFields: {
      tax_exemption_expiration_date: claim.expiration_date || null,
      current_tax_exemption_id: taxExemptionId,
    },
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'approved',
    actorType: 'admin',
    actorUserId: actor,
  });

  await notifyParish(
    env,
    registration,
    'Your AGAPAY sales tax exemption was approved',
    `<p>Your organization's sales tax exemption claim has been reviewed and approved. Future AGAPAY subscription invoices will reflect this exemption. This does not retroactively adjust tax already charged on past invoices.</p>`
  ).then((email) =>
    writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: email.status === 'sent' ? 'notification_sent' : 'notification_failed',
      actorType: 'system',
      metadata: { status: email.status },
    })
  );

  return { ok: true, status: 'approved', exemption: updated };
}

/**
 * Approves the legal claim WITHOUT ever calling Stripe -- used only when
 * env.TAX_EXEMPTION_STRIPE_SYNC_ENABLED is explicitly "false" (an
 * operational kill switch, not the normal path). Writes zero sync rows
 * and an explicit audit note that synchronization was administratively
 * disabled, so nothing here can be mistaken for "successfully synced."
 */
export async function approveTaxExemptionWithoutStripeSync(
  env: TaxEnvironment,
  { taxExemptionId, actor, expectedVersion }: { taxExemptionId: string; actor: string; expectedVersion?: string }
) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error('Tax exemption not found');
  assertCurrentVersion(claim, expectedVersion);
  if (!['pending', 'replacement_required'].includes(claim.status)) {
    throw new Error(`Cannot approve a claim in status '${claim.status}'`);
  }

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: 'approved',
    fields: { approved_at: nowIso(), approved_by: actor, rejection_reason: null },
    registrationFields: {
      tax_exemption_expiration_date: claim.expiration_date || null,
      current_tax_exemption_id: taxExemptionId,
    },
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'approved',
    actorType: 'admin',
    actorUserId: actor,
    metadata: {
      stripeSyncDisabled: true,
      note: 'Approved on documentation alone -- Stripe synchronization is administratively disabled and was not attempted.',
    },
  });

  return { ok: true, status: 'approved', exemption: updated, stripeSyncDisabled: true };
}

/**
 * Called right after a NEW platform Stripe Customer is created for a
 * parish (Giving/Parish+ in src/lib/subscription-checkout.js, Stewardship
 * in src/handlers/stewardship.js) -- checks whether this registration
 * already has a currently-approved exemption, and if so, applies it to
 * the newly-created Customer before checkout proceeds. This is what
 * prevents an approved-but-Customer-didn't-exist-yet exemption from
 * silently never reaching Stripe once the Customer finally shows up.
 *
 * Returns { applied: false } if there's no approved exemption to apply.
 * Returns { applied: true, ok, summary } otherwise -- callers (checkout
 * creation code) MUST check `ok` and refuse to proceed to checkout with a
 * user-safe billing-configuration error if `ok` is false, per the
 * "do not silently create a taxable subscription for an approved exempt
 * parish" requirement.
 */
export async function applyApprovedExemptionIfExists(
  env: TaxEnvironment,
  {
    registration,
    stripeCustomerId,
    customerRole,
  }: { registration: TaxRegistration; stripeCustomerId: string; customerRole: string }
) {
  if (!registration?.reference || !stripeCustomerId) return { applied: false };
  const claim = await getCurrentTaxExemptionForRegistration(env, registration.reference);
  if (!claim || claim.status !== 'approved') return { applied: false };

  await ensureStripeSyncRows(env, {
    taxExemptionId: claim.id,
    registrationReference: registration.reference,
    customers: [{ stripeCustomerId, customerRole }],
    desiredTaxExemptStatus: 'exempt',
  });
  const summary = await runAllPendingStripeSyncs(env, claim.id);
  await writeTaxExemptionAuditLog(env, {
    taxExemptionId: claim.id,
    registrationReference: registration.reference,
    action: summary.failed > 0 ? 'stripe_sync_failed' : 'stripe_sync_succeeded',
    actorType: 'system',
    metadata: { delayed: true, customerRole, stripeCustomerId, summary },
  });

  return { applied: true, ok: summary.failed === 0 && summary.reconciliationRequired === 0, summary };
}

export async function rejectTaxExemption(
  env: TaxEnvironment,
  {
    taxExemptionId,
    registration,
    actor,
    reason,
    expectedVersion,
  }: { taxExemptionId: string; registration: TaxRegistration; actor: string; reason: string; expectedVersion?: string }
) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error('Tax exemption not found');
  assertCurrentVersion(claim, expectedVersion);
  if (!['pending', 'replacement_required'].includes(claim.status)) {
    throw new Error(`Cannot reject a claim in status '${claim.status}'`);
  }
  if (!reason) throw new Error('A rejection reason is required');

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: 'rejected',
    fields: { rejected_at: nowIso(), rejected_by: actor, rejection_reason: reason },
    registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null },
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'rejected',
    actorType: 'admin',
    actorUserId: actor,
    metadata: { reason },
  });

  await notifyParish(
    env,
    registration,
    'Your AGAPAY sales tax exemption request needs attention',
    `<p>AGAPAY was unable to approve your organization's sales tax exemption claim.</p><p><strong>Reason:</strong> ${reason}</p><p>You may submit corrected documentation at any time from your parish dashboard.</p>`
  ).then((email) =>
    writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: email.status === 'sent' ? 'notification_sent' : 'notification_failed',
      actorType: 'system',
      metadata: { status: email.status },
    })
  );

  return { ok: true, status: 'rejected', exemption: updated };
}

export async function requestReplacementDocumentation(
  env: TaxEnvironment,
  {
    taxExemptionId,
    registration,
    actor,
    reason,
    keepActiveDuringReplacement = false,
    expectedVersion,
  }: {
    taxExemptionId: string;
    registration: TaxRegistration;
    actor: string;
    reason: string;
    keepActiveDuringReplacement?: boolean;
    expectedVersion?: string;
  }
) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error('Tax exemption not found');
  assertCurrentVersion(claim, expectedVersion);
  if (claim.status !== 'approved') {
    throw new Error('Replacement can only be requested for a currently approved claim');
  }

  if (!keepActiveDuringReplacement) {
    const customers = resolveApplicableStripeCustomers(registration);
    await ensureStripeSyncRows(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      customers,
      desiredTaxExemptStatus: 'none',
    });
    const summary = await runAllPendingStripeSyncs(env, taxExemptionId);
    if (summary.failed > 0) {
      await writeTaxExemptionAuditLog(env, {
        taxExemptionId,
        registrationReference: claim.registration_reference,
        action: 'stripe_sync_partial',
        actorType: 'system',
        metadata: summary,
      });
      // Still proceed with the local status change to replacement_required
      // (the claim's legal validity is what changed) but surface the sync
      // failure for a retry -- do not leave the parish exempt in Stripe
      // silently if we couldn't confirm the disable succeeded.
    }
  }

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: 'replacement_required',
    fields: {
      replacement_requested_at: nowIso(),
      replacement_requested_by: actor,
      replacement_reason: reason || '',
      keep_active_during_replacement: keepActiveDuringReplacement ? 1 : 0,
    },
    registrationFields: keepActiveDuringReplacement ? {} : { tax_exemption_expiration_date: null },
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'replacement_requested',
    actorType: 'admin',
    actorUserId: actor,
    metadata: { reason },
  });

  await notifyParish(
    env,
    registration,
    'AGAPAY needs updated sales tax exemption documentation',
    `<p>AGAPAY needs updated documentation to continue your organization's sales tax exemption.</p><p>${reason || ''}</p><p>Please upload a current document from your parish dashboard.</p>`
  ).then((email) =>
    writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: email.status === 'sent' ? 'notification_sent' : 'notification_failed',
      actorType: 'system',
      metadata: { status: email.status },
    })
  );

  return { ok: true, status: 'replacement_required', exemption: updated };
}
export async function disableExemptionInStripe(
  env: TaxEnvironment,
  {
    taxExemptionId,
    registration,
    registrationReference,
  }: { taxExemptionId: string; registration: TaxRegistration; registrationReference: string }
) {
  const customers = resolveApplicableStripeCustomers(registration);
  if (!customers.length) return { total: 0, succeeded: 0, failed: 0 };
  await ensureStripeSyncRows(env, {
    taxExemptionId,
    registrationReference,
    customers,
    desiredTaxExemptStatus: 'none',
  });
  return runAllPendingStripeSyncs(env, taxExemptionId);
}

export async function revokeTaxExemption(
  env: TaxEnvironment,
  {
    taxExemptionId,
    registration,
    actor,
    reason,
    expectedVersion,
  }: { taxExemptionId: string; registration: TaxRegistration; actor: string; reason: string; expectedVersion?: string }
) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error('Tax exemption not found');
  assertCurrentVersion(claim, expectedVersion);
  if (claim.status !== 'approved') throw new Error('Only an approved claim can be revoked');
  if (!reason) throw new Error('A revocation reason is required');

  const summary = await disableExemptionInStripe(env, {
    taxExemptionId,
    registration,
    registrationReference: claim.registration_reference,
  });

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: 'revoked',
    fields: { revoked_at: nowIso(), revoked_by: actor, revocation_reason: reason },
    registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null },
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'revoked',
    actorType: 'admin',
    actorUserId: actor,
    metadata: { reason, syncSummary: summary },
  });

  await notifyParish(
    env,
    registration,
    'Your AGAPAY sales tax exemption has been revoked',
    `<p>Your organization's sales tax exemption has been revoked.</p><p><strong>Reason:</strong> ${reason}</p><p>Future AGAPAY subscription invoices will include applicable sales tax.</p>`
  ).then((email) =>
    writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: email.status === 'sent' ? 'notification_sent' : 'notification_failed',
      actorType: 'system',
      metadata: { status: email.status },
    })
  );

  return { ok: summary.failed === 0, status: 'revoked', exemption: updated, summary };
}

/**
 * Manual "Mark expired" admin action -- distinct from
 * processExpiredTaxExemptions() (the automatic scheduled sweep). Only
 * valid on a currently `approved` claim. Uses the exact same
 * disableExemptionInStripe() ownership-aware Stripe path as revoke/the
 * automatic sweep -- an externally-owned or externally-modified Stripe
 * state is preserved and flagged reconciliation_required, never silently
 * overwritten, identical to every other path that disables an exemption.
 */
export async function expireTaxExemptionManually(
  env: TaxEnvironment,
  {
    taxExemptionId,
    registration,
    actor,
    reason,
    expectedVersion,
  }: { taxExemptionId: string; registration: TaxRegistration; actor: string; reason: string; expectedVersion?: string }
) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error('Tax exemption not found');
  assertCurrentVersion(claim, expectedVersion);
  if (claim.status !== 'approved') throw new Error('Only an approved claim can be manually expired');
  if (!reason) throw new Error('A reason is required to manually expire an exemption');

  const summary = await disableExemptionInStripe(env, {
    taxExemptionId,
    registration,
    registrationReference: claim.registration_reference,
  });

  const updated = await transitionTaxExemption(env, {
    taxExemptionId,
    nextStatus: 'expired',
    fields: {},
    registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null },
  });

  await writeTaxExemptionAuditLog(env, {
    taxExemptionId,
    registrationReference: claim.registration_reference,
    action: 'expiration_processed',
    actorType: 'admin',
    actorUserId: actor,
    metadata: { reason, manual: true, syncSummary: summary },
  });

  await notifyParish(
    env,
    registration,
    'Your AGAPAY sales tax exemption has expired',
    `<p>Your organization's sales tax exemption has been marked expired by AGAPAY.</p><p><strong>Reason:</strong> ${reason}</p><p>Future AGAPAY subscription invoices will include applicable sales tax until renewed documentation is submitted and approved.</p>`
  ).then((email) =>
    writeTaxExemptionAuditLog(env, {
      taxExemptionId,
      registrationReference: claim.registration_reference,
      action: email.status === 'sent' ? 'notification_sent' : 'notification_failed',
      actorType: 'system',
      metadata: { status: email.status },
    })
  );

  return { ok: summary.failed === 0, status: 'expired', exemption: updated, summary };
}

/**
 * Scheduled-job entry point (see src/worker.js `scheduled`). Finds every
 * approved exemption whose expiration_date has passed, disables Stripe
 * exemption, flips status to 'expired', notifies, and logs. Never blocks
 * on one parish's failure -- collects results and continues.
 */
export async function processExpiredTaxExemptions(env: TaxEnvironment) {
  if (!d1(env)) return { checked: 0, expired: 0, failed: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const candidates = await d1All<TaxClaimRow>(
    env,
    `SELECT * FROM tax_exemptions
     WHERE status = 'approved' AND expiration_date IS NOT NULL AND expiration_date != '' AND expiration_date < ?1`,
    today
  );

  let expired = 0;
  let failed = 0;
  for (const claim of candidates) {
    try {
      const registrationRow = await d1First<{ data: string }>(
        env,
        `SELECT data FROM registrations WHERE reference = ?1`,
        claim.registration_reference
      );
      const registration = registrationRow?.data ? (JSON.parse(registrationRow.data) as TaxRegistration) : {};
      const summary = await disableExemptionInStripe(env, {
        taxExemptionId: claim.id,
        registration,
        registrationReference: claim.registration_reference,
      });
      const updated = await transitionTaxExemption(env, {
        taxExemptionId: claim.id,
        nextStatus: 'expired',
        fields: {},
        registrationFields: { tax_exemption_expiration_date: null, current_tax_exemption_id: null },
      });
      await writeTaxExemptionAuditLog(env, {
        taxExemptionId: claim.id,
        registrationReference: claim.registration_reference,
        action: 'expiration_processed',
        actorType: 'system',
        metadata: { syncSummary: summary },
      });
      await notifyParish(
        env,
        registration,
        'Your AGAPAY sales tax exemption has expired',
        `<p>Your organization's sales tax exemption expired on ${claim.expiration_date}. Future AGAPAY subscription invoices will include applicable sales tax until renewed documentation is submitted and approved.</p>`
      );
      if (summary.failed > 0) failed += 1;
      expired += 1;
      void updated;
    } catch (error) {
      failed += 1;
      console.error(
        'tax_exemption_expiration_failed',
        claim.id,
        (error as Error | undefined)?.message || String(error)
      );
    }
  }

  return { checked: candidates.length, expired, failed };
}
