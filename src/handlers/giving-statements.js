// src/handlers/giving-statements.js
//
// Annual IRS-compliant giving statements. A parish admin manually triggers
// a batch for a given calendar year from the Givers tab; this generates one
// PDF per donor who gave that year, stores it in the private
// GIVING_STATEMENTS R2 bucket, and emails it as an attachment. Donors can
// also re-download their own statements later from MyAGAPAY.
//
// Parish auth follows the same requireParishApiContext shape already used
// in src/handlers/stewardship.js (parishId path segment + bearer token
// checked against the parish registration). Donor auth reuses requireDonor
// from src/handlers/parish.js.

import {
  d1,
  d1All,
  d1First,
  d1Run,
  generateSecret,
  getBearerToken,
  json,
  normalizeEmail,
  unauthorized,
} from "../lib/core.js";

import { htmlEscape } from "../lib/format.js";
import { agapayEmailHtml, sendEmail } from "../lib/email.js";
import { buildGivingStatementPdf } from "../lib/giving-statement-pdf.js";
import {
  generateGivingStatementStorageKey,
  putGivingStatementPdf,
  streamGivingStatementPdf,
} from "../lib/giving-statement-storage.js";

import { findRegistrationByParishId, requireDonor, verifyParishDashboardBearer } from "./parish.js";
import { offeringLabel } from "./donor.js";

// ─── Auth ──────────────────────────────────────────────────────────────────

async function requireParishApiContext(request, env, parishId) {
  const token = getBearerToken(request);
  if (!parishId || !token) return { ok: false, response: unauthorized() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: json({ error: "Parish not found" }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, registration: found.registration, key: found.key };
}

function parishTaxProfile(registration = {}) {
  return {
    parishName: registration.parishName || "Parish",
    legalName: String(registration.taxLegalName || "").trim() || registration.parishName || "Parish",
    ein: String(registration.taxEin || "").trim(),
    addressLine1: registration.addressLine1 || "",
    addressLine2: registration.addressLine2 || "",
    city: registration.city || "",
    state: registration.state || "",
    postalCode: registration.postalCode || "",
    website: registration.website || "",
  };
}

// ─── Data layer ──────────────────────────────────────────────────────────────

/**
 * Returns every donor with at least one completed gift to this parish in
 * the given calendar year, each with their itemized gift list and total.
 * Mirrors the WHERE-clause shape used in
 * src/handlers/stewardship.js handleStewardshipManualIncomeCreate's sibling
 * giving-summary queries (payment_status IN ('paid','succeeded'), created_at
 * BETWEEN year bounds).
 */
export async function computeParishDonorYearGiving(env, parishId, fiscalYear) {
  if (!d1(env)) return [];
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31T23:59:59.999Z`;
  const rows = await d1All(
    env,
    `SELECT donor_email, created_at, data FROM donor_offerings
     WHERE parish_id = ? AND payment_status IN ('paid','succeeded')
       AND created_at BETWEEN ? AND ?
     ORDER BY donor_email, created_at ASC`,
    parishId, yearStart, yearEnd
  );

  const byDonor = new Map();
  for (const row of rows) {
    let data;
    try { data = JSON.parse(row.data || "{}"); } catch { data = {}; }
    const email = normalizeEmail(row.donor_email);
    if (!email) continue;
    const amountCents = Number(data.giftAmountCents ?? data.amountCents ?? 0);
    if (!Number.isFinite(amountCents) || amountCents <= 0) continue;

    if (!byDonor.has(email)) {
      byDonor.set(email, {
        email,
        donorName: data.donorName || "",
        addressLine1: data.donorAddressLine1 || "",
        addressLine2: data.donorAddressLine2 || "",
        city: data.donorCity || "",
        state: data.donorState || "",
        postalCode: data.donorPostalCode || "",
        totalCents: 0,
        gifts: [],
      });
    }
    const entry = byDonor.get(email);
    if (!entry.donorName && data.donorName) entry.donorName = data.donorName;
    entry.totalCents += amountCents;
    entry.gifts.push({
      date: data.completedAt || data.createdAt || row.created_at,
      amountCents,
      label: offeringLabel(data),
    });
  }

  return Array.from(byDonor.values());
}

async function loadDonorContactInfo(env, email) {
  if (!d1(env)) return {};
  const row = await d1First(env, "SELECT data FROM donors WHERE email = ?1", normalizeEmail(email));
  if (!row) return {};
  try { return JSON.parse(row.data || "{}"); } catch { return {}; }
}

// ─── PDF preview (no persistence) ────────────────────────────────────────────

export async function handleGivingStatementPreview(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
  const fiscalYear = parseInt(body.fiscalYear, 10);
  const donorEmail = normalizeEmail(body.donorEmail);
  if (!fiscalYear || !donorEmail) return json({ error: "fiscalYear and donorEmail are required" }, { status: 400 });

  const donors = await computeParishDonorYearGiving(env, parishId, fiscalYear);
  const donorGiving = donors.find((d) => d.email === donorEmail);
  if (!donorGiving) {
    return json({ error: "No completed gifts found for that donor in that year." }, { status: 404 });
  }
  const donorContact = await loadDonorContactInfo(env, donorEmail);

  const pdfBytes = await buildGivingStatementPdf({
    parish: parishTaxProfile(ctx.registration),
    donor: { ...donorContact, email: donorEmail, donorName: donorGiving.donorName || donorContact.donorName },
    fiscalYear,
    gifts: donorGiving.gifts,
    totalCents: donorGiving.totalCents,
  });

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="giving-statement-preview-${fiscalYear}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// ─── Background job orchestration ────────────────────────────────────────────

export async function handleGivingStatementJobCreate(request, env, parishId, ctxRuntime) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const authCtx = await requireParishApiContext(request, env, parishId);
  if (!authCtx.ok) return authCtx.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
  const fiscalYear = parseInt(body.fiscalYear, 10);
  if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) {
    return json({ error: "A valid fiscalYear is required" }, { status: 400 });
  }
  if (!d1(env)) return json({ error: "Database not available" }, { status: 503 });

  const donors = await computeParishDonorYearGiving(env, parishId, fiscalYear);
  const jobId = generateSecret("gsj");
  await d1Run(
    env,
    `INSERT INTO giving_statement_jobs (id, parish_id, fiscal_year, status, total_donors, triggered_by, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`,
    jobId, parishId, fiscalYear, donors.length, "parish_dashboard"
  );

  if (ctxRuntime?.waitUntil) {
    ctxRuntime.waitUntil(runGivingStatementJob(env, jobId).catch(() => {}));
  } else {
    // No execution context available (e.g. local dev harness) -- run inline.
    await runGivingStatementJob(env, jobId).catch(() => {});
  }

  return json({ ok: true, jobId, totalDonors: donors.length });
}

export async function handleGivingStatementJobStatus(request, env, parishId, jobId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const authCtx = await requireParishApiContext(request, env, parishId);
  if (!authCtx.ok) return authCtx.response;

  const row = await d1First(
    env,
    `SELECT id, parish_id, fiscal_year, status, total_donors, processed_donors, sent_count, failed_count, error, created_at, completed_at
     FROM giving_statement_jobs WHERE id = ? AND parish_id = ?`,
    jobId, parishId
  );
  if (!row) return json({ error: "Job not found" }, { status: 404 });
  return json({
    jobId: row.id,
    fiscalYear: row.fiscal_year,
    status: row.status,
    totalDonors: row.total_donors,
    processedDonors: row.processed_donors,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    error: row.error || null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  });
}

export async function handleGivingStatementJobList(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const authCtx = await requireParishApiContext(request, env, parishId);
  if (!authCtx.ok) return authCtx.response;

  const url = new URL(request.url);
  const fiscalYear = url.searchParams.get("fiscalYear");
  const rows = fiscalYear
    ? await d1All(
        env,
        `SELECT id, fiscal_year, status, total_donors, processed_donors, sent_count, failed_count, created_at, completed_at
         FROM giving_statement_jobs WHERE parish_id = ? AND fiscal_year = ? ORDER BY created_at DESC LIMIT 25`,
        parishId, parseInt(fiscalYear, 10)
      )
    : await d1All(
        env,
        `SELECT id, fiscal_year, status, total_donors, processed_donors, sent_count, failed_count, created_at, completed_at
         FROM giving_statement_jobs WHERE parish_id = ? ORDER BY created_at DESC LIMIT 25`,
        parishId
      );

  return json({
    jobs: rows.map((row) => ({
      jobId: row.id,
      fiscalYear: row.fiscal_year,
      status: row.status,
      totalDonors: row.total_donors,
      processedDonors: row.processed_donors,
      sentCount: row.sent_count,
      failedCount: row.failed_count,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    })),
  });
}

function givingStatementEmailBody({ appUrl, parish, fiscalYear, donorName, totalCents }) {
  const amount = (Number(totalCents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return agapayEmailHtml(appUrl, `Your ${fiscalYear} Giving Statement`, `
    <p>Dear ${htmlEscape(donorName || "friend")},</p>
    <p>Attached is your annual giving statement from <strong>${htmlEscape(parish.parishName)}</strong> for
    <strong>${fiscalYear}</strong>, documenting a total of <strong>${amount}</strong> in charitable
    contributions. Please retain this for your tax records.</p>
    <p>Thank you for your generosity and continued support of ${htmlEscape(parish.parishName)}.</p>
  `);
}

/**
 * Runs the full parish/year batch: builds + stores + emails one statement
 * per donor. Sequential with a try/catch per donor so one failure doesn't
 * abort the rest of the batch -- mirrors the loop-and-send pattern already
 * used by sendWeeklyCommemorationEmails / sendWeeklyTreasurerCommerceEmails
 * in src/worker.js.
 */
export async function runGivingStatementJob(env, jobId) {
  const job = await d1First(env, "SELECT * FROM giving_statement_jobs WHERE id = ?", jobId);
  if (!job) return;

  await d1Run(env, "UPDATE giving_statement_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?", jobId);

  const found = await findRegistrationByParishId(env, job.parish_id);
  if (!found) {
    await d1Run(
      env,
      "UPDATE giving_statement_jobs SET status = 'failed', error = ?, updated_at = datetime('now'), completed_at = datetime('now') WHERE id = ?",
      "Parish not found", jobId
    );
    return;
  }
  const parish = parishTaxProfile(found.registration);
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const fromEmail = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";

  const donors = await computeParishDonorYearGiving(env, job.parish_id, job.fiscal_year);

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const donorGiving of donors) {
    try {
      const donorContact = await loadDonorContactInfo(env, donorGiving.email);
      const donorName = donorGiving.donorName || donorContact.donorName || "";

      const pdfBytes = await buildGivingStatementPdf({
        parish,
        donor: { ...donorContact, email: donorGiving.email, donorName },
        fiscalYear: job.fiscal_year,
        gifts: donorGiving.gifts,
        totalCents: donorGiving.totalCents,
      });

      const storageKey = generateGivingStatementStorageKey();
      await putGivingStatementPdf(env, { storageKey, bytes: pdfBytes });

      const statementId = generateSecret("gst");
      await d1Run(
        env,
        `INSERT INTO giving_statements
           (id, job_id, parish_id, donor_email, fiscal_year, total_cents, gift_count, storage_key, email_status, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
         ON CONFLICT(parish_id, donor_email, fiscal_year) DO UPDATE SET
           job_id = excluded.job_id,
           total_cents = excluded.total_cents,
           gift_count = excluded.gift_count,
           storage_key = excluded.storage_key,
           email_status = 'pending',
           email_error = NULL,
           generated_at = datetime('now'),
           sent_at = NULL`,
        statementId, jobId, job.parish_id, donorGiving.email, job.fiscal_year,
        donorGiving.totalCents, donorGiving.gifts.length, storageKey
      );

      const emailResult = await sendEmail(env, {
        from: fromEmail,
        to: donorGiving.email,
        reply_to: replyTo,
        subject: `Your ${job.fiscal_year} Giving Statement from ${parish.parishName}`,
        html: givingStatementEmailBody({
          appUrl, parish, fiscalYear: job.fiscal_year, donorName, totalCents: donorGiving.totalCents
        }),
        attachments: [{
          filename: `${job.fiscal_year}-giving-statement.pdf`,
          content: Buffer.from(pdfBytes).toString("base64"),
        }],
      });

      const emailStatus = emailResult.status === "sent" || emailResult.status === "not_configured" ? "sent" : "failed";
      await d1Run(
        env,
        `UPDATE giving_statements SET email_status = ?, email_error = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END
         WHERE parish_id = ? AND donor_email = ? AND fiscal_year = ?`,
        emailStatus, emailStatus === "failed" ? JSON.stringify(emailResult) : null, emailStatus,
        job.parish_id, donorGiving.email, job.fiscal_year
      );

      if (emailStatus === "sent") sent++; else failed++;
    } catch (error) {
      failed++;
    }

    processed++;
    await d1Run(
      env,
      "UPDATE giving_statement_jobs SET processed_donors = ?, sent_count = ?, failed_count = ?, updated_at = datetime('now') WHERE id = ?",
      processed, sent, failed, jobId
    );
  }

  const finalStatus = failed === 0 ? "completed" : (sent === 0 ? "failed" : "completed_with_errors");
  await d1Run(
    env,
    "UPDATE giving_statement_jobs SET status = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    finalStatus, jobId
  );
}

// ─── Donor-facing (MyAGAPAY) ──────────────────────────────────────────────────

export async function handleDonorGivingStatements(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!d1(env)) return json({ statements: [] });

  const rows = await d1All(
    env,
    `SELECT gs.id, gs.parish_id, gs.fiscal_year, gs.total_cents, gs.gift_count, gs.generated_at, r.parish_name
     FROM giving_statements gs
     LEFT JOIN registrations r ON r.parish_id = gs.parish_id
     WHERE gs.donor_email = ? AND gs.storage_key IS NOT NULL
     ORDER BY gs.fiscal_year DESC, gs.parish_id ASC`,
    normalizeEmail(donor.email)
  );

  return json({
    statements: rows.map((row) => ({
      id: row.id,
      parishId: row.parish_id,
      parishName: row.parish_name || "Parish",
      fiscalYear: row.fiscal_year,
      totalCents: row.total_cents,
      giftCount: row.gift_count,
      generatedAt: row.generated_at,
    })),
  });
}

export async function handleDonorGivingStatementDownload(request, env, statementId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!d1(env)) return json({ error: "Not found" }, { status: 404 });

  const row = await d1First(
    env,
    "SELECT storage_key, fiscal_year, donor_email FROM giving_statements WHERE id = ?",
    statementId
  );
  if (!row || normalizeEmail(row.donor_email) !== normalizeEmail(donor.email) || !row.storage_key) {
    return json({ error: "Statement not found" }, { status: 404 });
  }

  return streamGivingStatementPdf(env, {
    storageKey: row.storage_key,
    filename: `${row.fiscal_year}-giving-statement.pdf`,
  });
}
