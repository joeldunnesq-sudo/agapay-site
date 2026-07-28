import { d1All, d1First, d1Run, generateSecret, parseJsonRow } from "./core.js";
import { agapayEmailHtml, sendEmail } from "./email.js";
import { htmlEscape } from "./format.js";
import { startOfCurrentYearIso, summarizeStripeVolumeRows } from "./stripe-volume.js";

export const NONPROFIT_PRICING_POLICY_VERSION = "stripe-support-2026-07-28";
export const NONPROFIT_PRICING_ATTESTATION_VERSION = "1";
export const NONPROFIT_DOCUMENT_TYPES = new Set([
  "irs_determination",
  "tax_exempt_proof",
  "stripe_approval",
  "other"
]);

export const STRIPE_NONPROFIT_POLICY = Object.freeze({
  standardAccountsApplySeparately: true,
  accountOwnerMustSubmitWhileLoggedIn: true,
  platformMaySubmitForAccount: false,
  measurementPeriod: "not_confirmed_by_stripe",
  directChargeCoverage: "not_confirmed_by_stripe",
  coveredCardBrandsAndOrigins: "not_confirmed_by_stripe",
  verificationMethod: "stripe_notifies_connected_account",
  sourceDate: "2026-07-28"
});

export function nonprofitThresholdRisk(volume = {}) {
  const total = Number(volume.totalNetCents || 0);
  const nonDonation = Number(volume.nonDonationNetCents || 0);
  const unclassified = Number(volume.unclassifiedNetCents || 0);
  const classifiedNonDonationPercent = total ? Math.round((nonDonation / total) * 10_000) / 100 : 0;
  const thresholdExposureCents = nonDonation + unclassified;
  const thresholdExposurePercent = total ? Math.round((thresholdExposureCents / total) * 10_000) / 100 : 0;
  const additionalNonDonationCapacityCents = Math.max(
    0,
    Math.floor(((0.2 * total) - thresholdExposureCents) / 0.8)
  );
  let riskBand = "safe";
  if (!volume.scan?.complete || total <= 0) riskBand = "indeterminate";
  else if (thresholdExposurePercent >= 20) riskBand = "breached";
  else if (thresholdExposurePercent >= 17.5) riskBand = "near";
  else if (thresholdExposurePercent >= 15) riskBand = "watch";
  return {
    classifiedNonDonationPercent,
    thresholdExposureCents,
    thresholdExposurePercent,
    additionalNonDonationCapacityCents,
    headroomPercent: Math.max(0, Math.round((20 - thresholdExposurePercent) * 100) / 100),
    riskBand
  };
}

export async function getNonprofitPricingApplication(env, parishId, stripeAccountId = "") {
  if (!parishId) return null;
  return d1First(env, `
    SELECT * FROM nonprofit_pricing_applications
     WHERE parish_id = ? AND (? = '' OR stripe_account_id = ?)
     ORDER BY updated_at DESC LIMIT 1
  `, parishId, stripeAccountId, stripeAccountId);
}

export async function getNonprofitPricingApplicationById(env, applicationId) {
  return d1First(env, `SELECT * FROM nonprofit_pricing_applications WHERE id = ? LIMIT 1`, applicationId);
}

export async function ensureNonprofitPricingApplication(env, {
  parishId,
  registrationReference,
  stripeAccountId
}) {
  const existing = await getNonprofitPricingApplication(env, parishId, stripeAccountId);
  if (existing) return existing;
  const id = `npa_${generateSecret(24)}`;
  const now = new Date().toISOString();
  await d1Run(env, `
    INSERT INTO nonprofit_pricing_applications
      (id, parish_id, registration_reference, stripe_account_id, status, policy_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'collecting_information', ?, ?, ?)
  `, id, parishId, registrationReference, stripeAccountId, NONPROFIT_PRICING_POLICY_VERSION, now, now);
  await writeNonprofitPricingAudit(env, {
    applicationId: id,
    parishId,
    action: "application_created",
    actorType: "parish",
    actorUserId: ""
  });
  return getNonprofitPricingApplication(env, parishId, stripeAccountId);
}

export async function listNonprofitPricingDocuments(env, applicationId) {
  return d1All(env, `
    SELECT id, application_id, document_type, original_filename, sanitized_filename,
           mime_type, file_size, sha256, uploaded_by_type, uploaded_by_user_id,
           is_current, created_at, replaced_at
      FROM nonprofit_pricing_documents
     WHERE application_id = ? ORDER BY created_at DESC
  `, applicationId);
}

export async function getNonprofitPricingDocument(env, applicationId, documentId) {
  return d1First(env, `
    SELECT * FROM nonprofit_pricing_documents
     WHERE application_id = ? AND id = ? LIMIT 1
  `, applicationId, documentId);
}

export async function attachNonprofitPricingDocument(env, {
  applicationId,
  documentType,
  storageKey,
  originalFilename,
  sanitizedFilename,
  mimeType,
  fileSize,
  sha256,
  uploadedByType,
  uploadedByUserId
}) {
  if (!NONPROFIT_DOCUMENT_TYPES.has(documentType)) throw new Error("Unsupported document type.");
  const id = `npd_${generateSecret(24)}`;
  const now = new Date().toISOString();
  await d1Run(env, `
    UPDATE nonprofit_pricing_documents
       SET is_current = 0, replaced_at = ?
     WHERE application_id = ? AND document_type = ? AND is_current = 1
  `, now, applicationId, documentType);
  await d1Run(env, `
    INSERT INTO nonprofit_pricing_documents
      (id, application_id, document_type, storage_key, original_filename, sanitized_filename,
       mime_type, file_size, sha256, uploaded_by_type, uploaded_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, applicationId, documentType, storageKey, originalFilename, sanitizedFilename,
  mimeType, fileSize, sha256, uploadedByType, uploadedByUserId, now);
  return id;
}

export async function writeNonprofitPricingAudit(env, {
  applicationId = null,
  parishId,
  action,
  actorType,
  actorUserId = "",
  details = null
}) {
  return d1Run(env, `
    INSERT INTO nonprofit_pricing_audit_log
      (id, application_id, parish_id, action, actor_type, actor_user_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, `npaudit_${generateSecret(24)}`, applicationId, parishId, action, actorType,
  actorUserId, details ? JSON.stringify(details).slice(0, 4000) : null, new Date().toISOString());
}

export function nonprofitApplicationJson(row, documents = [], volume = null) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    stripeAccountId: row.stripe_account_id,
    status: row.status,
    policyVersion: row.policy_version,
    measurementPeriodStart: row.measurement_period_start,
    reportedDonationPercent: row.reported_donation_percent,
    attestationVersion: row.attestation_version,
    attestedByName: row.attested_by_name,
    attestedByTitle: row.attested_by_title,
    attestedByEmail: row.attested_by_email,
    attestedAt: row.attested_at,
    einLastFour: row.ein_last_four,
    confirmations: {
      registeredNonprofit: Boolean(row.confirms_registered_nonprofit),
      over80Percent: Boolean(row.confirms_over_80_percent),
      taxDeductibleDonations: Boolean(row.confirms_tax_deductible_donations),
      accountOwnerSubmission: Boolean(row.confirms_account_owner_submission)
    },
    stripeSupportCaseId: row.stripe_support_case_id,
    submittedAt: row.submitted_at,
    stripeDecision: row.stripe_decision,
    stripeDecisionAt: row.stripe_decision_at,
    stripeEffectiveDate: row.stripe_effective_date,
    approvedCardRateBasisPoints: row.approved_card_rate_basis_points,
    approvedCardFixedFeeCents: row.approved_card_fixed_fee_cents,
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documents: documents.map(document => ({
      id: document.id,
      documentType: document.document_type,
      filename: document.sanitized_filename,
      mimeType: document.mime_type,
      fileSize: Number(document.file_size || 0),
      isCurrent: Boolean(document.is_current),
      createdAt: document.created_at
    })),
    readiness: volume ? nonprofitApplicationReadiness(row, documents, volume) : null
  };
}

export function nonprofitApplicationReadiness(application, documents, volume) {
  const currentDocuments = documents.filter(document => Boolean(document.is_current));
  const hasNonprofitProof = currentDocuments.some(document =>
    ["irs_determination", "tax_exempt_proof"].includes(document.document_type));
  const allConfirmed = [
    application.confirms_registered_nonprofit,
    application.confirms_over_80_percent,
    application.confirms_tax_deductible_donations,
    application.confirms_account_owner_submission
  ].every(Boolean);
  const measurementComplete = Boolean(volume.scan?.complete);
  const measuredAtOrAbove80 = Number(volume.donationPercent || 0) >= 80;
  return {
    hasNonprofitProof,
    attestationComplete: Boolean(application.attested_at && allConfirmed),
    measurementComplete,
    measuredAtOrAbove80,
    readyToSubmit: hasNonprofitProof && Boolean(application.attested_at && allConfirmed)
      && measurementComplete && measuredAtOrAbove80
  };
}

export async function reconcileNonprofitApplicationStatus(env, application, documents, volume) {
  if (!application || ["submitted_to_stripe", "stripe_approved", "stripe_declined"].includes(application.status)) {
    return application;
  }
  const readiness = nonprofitApplicationReadiness(application, documents, volume);
  const nextStatus = readiness.readyToSubmit
    ? "ready_to_submit"
    : readiness.measurementComplete && !readiness.measuredAtOrAbove80
      ? "below_threshold"
      : readiness.measurementComplete
        ? "collecting_information"
        : "measurement_incomplete";
  if (nextStatus !== application.status) {
    await d1Run(env, `
      UPDATE nonprofit_pricing_applications
         SET status = ?, version = version + 1, updated_at = ?
       WHERE id = ?
    `, nextStatus, new Date().toISOString(), application.id);
    return { ...application, status: nextStatus, version: Number(application.version || 1) + 1 };
  }
  return application;
}

export async function saveNonprofitPricingAttestation(env, {
  application,
  volume,
  name,
  title,
  email,
  einLastFour,
  confirmations
}) {
  if (["submitted_to_stripe", "stripe_approved", "stripe_declined"].includes(application.status)) {
    throw new Error("The attestation is locked after submission to Stripe.");
  }
  if (!name || !title) throw new Error("Authorized representative name and title are required.");
  if (!/^\d{4}$/.test(einLastFour)) throw new Error("Enter the last four digits of the parish EIN.");
  if (!Object.values(confirmations).every(Boolean)) throw new Error("Every attestation statement must be confirmed.");
  const now = new Date().toISOString();
  await d1Run(env, `
    UPDATE nonprofit_pricing_applications SET
      status = 'measurement_incomplete',
      measurement_period_start = ?,
      reported_donation_percent = ?,
      attestation_version = ?,
      attested_by_name = ?,
      attested_by_title = ?,
      attested_by_email = ?,
      attested_at = ?,
      ein_last_four = ?,
      confirms_registered_nonprofit = 1,
      confirms_over_80_percent = 1,
      confirms_tax_deductible_donations = 1,
      confirms_account_owner_submission = 1,
      version = version + 1,
      updated_at = ?
    WHERE id = ?
  `, volume.periodStart, Number(volume.donationPercent || 0), NONPROFIT_PRICING_ATTESTATION_VERSION,
  name, title, email, now, einLastFour, now, application.id);
  await writeNonprofitPricingAudit(env, {
    applicationId: application.id,
    parishId: application.parish_id,
    action: "attestation_signed",
    actorType: "parish",
    actorUserId: email,
    details: { attestationVersion: NONPROFIT_PRICING_ATTESTATION_VERSION, donationPercent: volume.donationPercent }
  });
}

export async function markNonprofitPricingSubmitted(env, {
  application,
  volume,
  documents,
  stripeSupportCaseId,
  actorUserId
}) {
  const readiness = nonprofitApplicationReadiness(application, documents, volume);
  if (!readiness.readyToSubmit) throw new Error("Complete the volume scan, attestation, and nonprofit documentation first.");
  const now = new Date().toISOString();
  await d1Run(env, `
    UPDATE nonprofit_pricing_applications SET
      status = 'submitted_to_stripe',
      stripe_support_case_id = ?,
      submitted_at = ?,
      measurement_period_start = ?,
      reported_donation_percent = ?,
      version = version + 1,
      updated_at = ?
    WHERE id = ?
  `, String(stripeSupportCaseId || "").trim().slice(0, 120), now, volume.periodStart,
  Number(volume.donationPercent || 0), now, application.id);
  await writeNonprofitPricingAudit(env, {
    applicationId: application.id,
    parishId: application.parish_id,
    action: "marked_submitted_to_stripe",
    actorType: "parish",
    actorUserId,
    details: { stripeSupportCaseId: String(stripeSupportCaseId || "").trim().slice(0, 120) }
  });
}

export async function recordNonprofitPricingDecision(env, {
  application,
  decision,
  effectiveDate,
  actorUserId
}) {
  if (!["submitted_to_stripe", "stripe_approved", "stripe_declined"].includes(application.status)) {
    throw new Error("Record the Stripe submission before recording its decision.");
  }
  if (!["approved", "declined"].includes(decision)) throw new Error("Choose approved or declined.");
  const now = new Date().toISOString();
  await d1Run(env, `
    UPDATE nonprofit_pricing_applications SET
      status = ?,
      stripe_decision = ?,
      stripe_decision_at = ?,
      stripe_effective_date = ?,
      version = version + 1,
      updated_at = ?
    WHERE id = ?
  `, decision === "approved" ? "stripe_approved" : "stripe_declined", decision, now,
  String(effectiveDate || "").slice(0, 10), now, application.id);
  await writeNonprofitPricingAudit(env, {
    applicationId: application.id,
    parishId: application.parish_id,
    action: `stripe_${decision}_reported`,
    actorType: "parish",
    actorUserId,
    details: { effectiveDate: String(effectiveDate || "").slice(0, 10) }
  });
}

export async function listSitewideNonprofitPricing(env) {
  const registrationRows = await d1All(env, `
    SELECT reference, data FROM registrations
     WHERE stripe_account_id IS NOT NULL AND stripe_account_id <> ''
     ORDER BY received_at DESC
  `);
  const applications = await d1All(env, `SELECT * FROM nonprofit_pricing_applications ORDER BY updated_at DESC`);
  const appByParish = new Map();
  for (const application of applications) {
    if (!appByParish.has(application.parish_id)) appByParish.set(application.parish_id, application);
  }
  const periodStart = startOfCurrentYearIso();
  const allVolumeRows = await d1All(env, `
    SELECT parish_id, payment_class, COUNT(*) AS payment_count, SUM(gross_cents) AS gross_cents,
           SUM(refunded_cents) AS refunded_cents, SUM(net_cents) AS net_cents
      FROM stripe_payment_volume_records
     WHERE occurred_at >= ? AND charge_status = 'succeeded'
     GROUP BY parish_id, payment_class
  `, periodStart);
  const volumeByParish = new Map();
  for (const row of allVolumeRows) {
    if (!volumeByParish.has(row.parish_id)) volumeByParish.set(row.parish_id, []);
    volumeByParish.get(row.parish_id).push(row);
  }
  const scanRows = await d1All(env, `
    SELECT parish_id, status, scanned_count, pass_started_at, last_completed_at, last_error, updated_at
      FROM stripe_payment_volume_scans WHERE period_start = ?
  `, periodStart);
  const scanByParish = new Map(scanRows.map(scan => [scan.parish_id, scan]));
  const results = [];
  for (const row of registrationRows) {
    const registration = parseJsonRow(row);
    if (!registration?.parishId || String(registration.stripeAccountId || "").startsWith("acct_demo_")) continue;
    const volume = summarizeStripeVolumeRows(
      volumeByParish.get(registration.parishId) || [],
      scanByParish.get(registration.parishId) || null,
      periodStart
    );
    results.push({
      parishId: registration.parishId,
      parishName: registration.parishName || registration.name || registration.parishId,
      registrationReference: row.reference,
      stripeAccountId: registration.stripeAccountId,
      applicationStatus: appByParish.get(registration.parishId)?.status || "not_started",
      volume,
      risk: nonprofitThresholdRisk(volume)
    });
  }
  return results.sort((a, b) =>
    b.risk.thresholdExposurePercent - a.risk.thresholdExposurePercent
    || a.parishName.localeCompare(b.parishName));
}

export async function sendNonprofitThresholdAlerts(env) {
  const recipient = String(env.NONPROFIT_PRICING_ALERT_EMAIL
    || env.AGAPAY_REGISTRATION_NOTIFY_EMAIL
    || env.AGAPAY_REPLY_TO_EMAIL
    || "").trim();
  if (!recipient) return { status: "not_configured", sent: 0 };
  const parishes = await listSitewideNonprofitPricing(env);
  let sent = 0;
  const results = [];
  for (const parish of parishes) {
    if (!["watch", "near", "breached"].includes(parish.risk.riskBand)) {
      const now = new Date().toISOString();
      await d1Run(env, `
        UPDATE nonprofit_pricing_threshold_alerts SET resolved_at = ?, last_observed_at = ?
         WHERE parish_id = ? AND resolved_at IS NULL
      `, now, now, parish.parishId);
      continue;
    }
    const existing = await d1First(env, `
      SELECT notified_at FROM nonprofit_pricing_threshold_alerts
       WHERE parish_id = ? AND risk_band = ? AND resolved_at IS NULL
    `, parish.parishId, parish.risk.riskBand);
    if (existing) continue;
    const appUrl = String(env.AGAPAY_APP_URL || env.AGAPAY_PUBLIC_URL || "https://agapay.app").replace(/\/+$/, "");
    const email = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
      to: [recipient],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
      subject: `AGAPAY nonprofit-volume alert: ${parish.parishName}`,
      html: agapayEmailHtml(appUrl, "Nonprofit payment-volume alert", `
        <p><strong>${htmlEscape(parish.parishName)}</strong> is in the <strong>${htmlEscape(parish.risk.riskBand)}</strong> band.</p>
        <p>Classified non-donation volume: <strong>${parish.risk.classifiedNonDonationPercent.toFixed(2)}%</strong><br>
        Non-donation plus unclassified exposure: <strong>${parish.risk.thresholdExposurePercent.toFixed(2)}%</strong><br>
        Published limit: <strong>20%</strong></p>
        <p><a href="${htmlEscape(`${appUrl}/admin?tab=nonprofitpricing`)}">Open the AGAPAY admin dashboard</a></p>
      `)
    });
    results.push({ parishId: parish.parishId, emailStatus: email.status });
    if (email.status !== "sent") continue;
    const now = new Date().toISOString();
    await d1Run(env, `
      UPDATE nonprofit_pricing_threshold_alerts SET resolved_at = ?, last_observed_at = ?
       WHERE parish_id = ? AND resolved_at IS NULL
    `, now, now, parish.parishId);
    await d1Run(env, `
      INSERT INTO nonprofit_pricing_threshold_alerts
        (parish_id, risk_band, threshold_exposure_percent, donation_percent, notified_at, last_observed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(parish_id, risk_band) DO UPDATE SET
        threshold_exposure_percent = excluded.threshold_exposure_percent,
        donation_percent = excluded.donation_percent,
        notified_at = excluded.notified_at,
        resolved_at = NULL,
        last_observed_at = excluded.last_observed_at
    `, parish.parishId, parish.risk.riskBand, parish.risk.thresholdExposurePercent,
    parish.volume.donationPercent, now, now);
    sent += 1;
  }
  return { status: "complete", sent, results };
}
