// Generated from src/lib/tax-exemption-review.ts by npm run build:server. Do not edit.
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
async function notifyParish(env, registration, subject, bodyHtml) {
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
async function approveTaxExemption(env, { taxExemptionId, registration, actor, expectedVersion }) {
  const claim = await getTaxExemptionById(env, taxExemptionId);
  if (!claim) throw new Error('Tax exemption not found');
  assertCurrentVersion(claim, expectedVersion);
  if (!['pending', 'replacement_required'].includes(claim.status)) {
    throw new Error(`Cannot approve a claim in status '${claim.status}'`);
  }
  const customers = resolveApplicableStripeCustomers(registration);
  if (!customers.length) {
    const updated2 = await transitionTaxExemption(env, {
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
    return { ok: true, status: 'approved', waitingForCustomer: true, exemption: updated2 };
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
async function approveTaxExemptionWithoutStripeSync(env, { taxExemptionId, actor, expectedVersion }) {
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
async function applyApprovedExemptionIfExists(env, { registration, stripeCustomerId, customerRole }) {
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
async function rejectTaxExemption(env, { taxExemptionId, registration, actor, reason, expectedVersion }) {
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
async function requestReplacementDocumentation(
  env,
  { taxExemptionId, registration, actor, reason, keepActiveDuringReplacement = false, expectedVersion }
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
async function disableExemptionInStripe(env, { taxExemptionId, registration, registrationReference }) {
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
async function revokeTaxExemption(env, { taxExemptionId, registration, actor, reason, expectedVersion }) {
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
async function expireTaxExemptionManually(env, { taxExemptionId, registration, actor, reason, expectedVersion }) {
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
async function processExpiredTaxExemptions(env) {
  if (!d1(env)) return { checked: 0, expired: 0, failed: 0 };
  const today = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
  const candidates = await d1All(
    env,
    `SELECT * FROM tax_exemptions
     WHERE status = 'approved' AND expiration_date IS NOT NULL AND expiration_date != '' AND expiration_date < ?1`,
    today
  );
  let expired = 0;
  let failed = 0;
  for (const claim of candidates) {
    try {
      const registrationRow = await d1First(
        env,
        `SELECT data FROM registrations WHERE reference = ?1`,
        claim.registration_reference
      );
      const registration = registrationRow?.data ? JSON.parse(registrationRow.data) : {};
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
      console.error('tax_exemption_expiration_failed', claim.id, error?.message || String(error));
    }
  }
  return { checked: candidates.length, expired, failed };
}
export {
  applyApprovedExemptionIfExists,
  approveTaxExemption,
  approveTaxExemptionWithoutStripeSync,
  disableExemptionInStripe,
  expireTaxExemptionManually,
  notifyParish,
  processExpiredTaxExemptions,
  rejectTaxExemption,
  requestReplacementDocumentation,
  revokeTaxExemption,
};
