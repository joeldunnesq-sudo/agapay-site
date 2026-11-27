// Generated from src/handlers/giving-statements.ts by npm run build:server. Do not edit.
import { LINKED_STATEMENT_PAIRS_SQL } from '../directory/household-share-invitations.js';
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
} from '../lib/core.js';
import { htmlEscape } from '../lib/format.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { buildGivingStatementPdf } from '../lib/giving-statement-pdf.js';
import {
  generateGivingStatementStorageKey,
  putGivingStatementPdf,
  streamGivingStatementPdf,
} from '../lib/giving-statement-storage.js';
import { findRegistrationByParishId, requireDonor, verifyParishDashboardBearer } from './parish.js';
import { offeringLabel } from './donor.js';
import { givingFeatureAccess } from '../lib/entitlements.js';
import { outsideGiftsForGiving } from '../lib/outside-gifts.js';
import { givingContribution } from '../lib/giving-contributions.js';
async function requireParishApiContext(request, env, parishId) {
  const token = getBearerToken(request);
  if (!parishId || !token) return { ok: false, response: unauthorized() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: json({ error: 'Parish not found' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false, response: unauthorized() };
  }
  if (!givingFeatureAccess(found.registration, 'annualStatements')) {
    return {
      ok: false,
      response: json({ error: 'Annual giving statements are available with Give +.' }, { status: 403 }),
    };
  }
  return { ok: true, registration: found.registration, key: found.key };
}
function parishTaxProfile(registration = {}) {
  return {
    parishName: registration.parishName || 'Parish',
    legalName: String(registration.taxLegalName || '').trim() || registration.parishName || 'Parish',
    ein: String(registration.taxEin || '').trim(),
    addressLine1: registration.addressLine1 || '',
    addressLine2: registration.addressLine2 || '',
    city: registration.city || '',
    state: registration.state || '',
    postalCode: registration.postalCode || '',
    website: registration.website || '',
  };
}
async function computeParishDonorYearGiving(env, parishId, fiscalYear) {
  if (!d1(env)) return [];
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31T23:59:59.999Z`;
  const rows = await d1All(
    env,
    `SELECT donor_email, created_at, data FROM donor_offerings
     WHERE parish_id = ? AND payment_status IN ('paid','succeeded','partially_refunded','refunded')
       AND COALESCE(NULLIF(json_extract(data, '$.completedAt'), ''), created_at) >= ?
       AND COALESCE(NULLIF(json_extract(data, '$.completedAt'), ''), created_at) < ?
     ORDER BY donor_email, created_at ASC`,
    parishId,
    yearStart,
    `${Number(fiscalYear) + 1}-01-01`
  );
  const byDonor = /* @__PURE__ */ new Map();
  for (const row of rows) {
    let data;
    try {
      data = JSON.parse(row.data || '{}');
    } catch {
      data = {};
    }
    if (String(data.currency || 'USD').toUpperCase() !== 'USD') continue;
    const email = normalizeEmail(row.donor_email);
    if (!email) continue;
    const contribution = givingContribution(data);
    const refundAfterYear = String(data.refundedAt || '') > yearEnd;
    const amountCents = refundAfterYear ? contribution.grossContributionCents : contribution.contributionCents;
    if (!Number.isFinite(amountCents) || amountCents <= 0) continue;
    if (!byDonor.has(email)) {
      byDonor.set(email, {
        email,
        donorName: data.donorName || '',
        addressLine1: data.donorAddressLine1 || '',
        addressLine2: data.donorAddressLine2 || '',
        city: data.donorCity || '',
        state: data.donorState || '',
        postalCode: data.donorPostalCode || '',
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
      feeCoverageCents: contribution.feeCoverageCents,
      refundedCents: refundAfterYear ? 0 : contribution.refundedCents,
      label: offeringLabel(data),
    });
  }
  const outside = await outsideGiftsForGiving(env, parishId, {}, { start: yearStart, end: `${fiscalYear}-12-31` });
  for (const gift of outside) {
    const email = normalizeEmail(gift.donorEmail);
    if (!email || !gift.giverReferenceId) continue;
    if (!byDonor.has(email)) byDonor.set(email, { email, donorName: gift.donorName, totalCents: 0, gifts: [] });
    const entry = byDonor.get(email);
    entry.totalCents += gift.amountCents;
    entry.gifts.push({
      date: gift.receivedDate + 'T12:00:00Z',
      amountCents: gift.amountCents,
      label: gift.fund + ' (' + gift.sourceLabel + ')',
    });
  }
  if (byDonor.size) await combineHouseholdGiving(env, parishId, fiscalYear, byDonor);
  for (const entry of byDonor.values()) entry.gifts.sort((a, b) => a.date.localeCompare(b.date));
  return Array.from(byDonor.values());
}
async function combineHouseholdGiving(env, parishId, fiscalYear, byDonor) {
  const linkedConsentAvailable = await d1First(
    env,
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='directory_household_giving_consent'"
  );
  const linkedAccounts = linkedConsentAvailable
    ? `UNION
       SELECT p.recipient_email,p.spouse_email,p.recipient_name,p.spouse_name
         FROM (${LINKED_STATEMENT_PAIRS_SQL}) p
         JOIN directory_household_giving_consent c ON c.household_id=p.household_id
          AND c.parish_id=p.parish_id AND c.recipient_user_id=p.recipient_id AND c.spouse_user_id=p.spouse_id
        WHERE p.parish_id=?1
        GROUP BY p.household_id,p.recipient_id,p.spouse_id
        HAVING COUNT(c.consenting_user_id)=2`
    : '';
  const globalConsentAvailable = await d1First(
    env,
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='directory_global_giving_consent'"
  );
  const globalAccounts = globalConsentAvailable
    ? `UNION
       SELECT p.recipient_email,p.spouse_email,p.recipient_name,p.spouse_name
         FROM (${LINKED_STATEMENT_PAIRS_SQL}) p
         JOIN directory_global_giving_consent c ON c.recipient_user_id=p.recipient_id AND c.spouse_user_id=p.spouse_id
        WHERE p.parish_id=?1
        GROUP BY p.household_id,p.recipient_id,p.spouse_id
        HAVING COUNT(c.consenting_user_id)=2`
    : '';
  const links = await d1All(
    env,
    `
    WITH consenting_accounts AS (
    SELECT recipient.email AS recipient_email, giver.email AS giver_email,
           recipient_person.preferred_name AS recipient_name, giver_person.preferred_name AS giver_name
      FROM directory_household_invitations i
      JOIN directory_households h ON h.id = i.household_id AND h.parish_id = i.parish_id AND h.active = 1
      JOIN directory_change_requests r ON r.household_id = h.id AND r.parish_id = i.parish_id
        AND r.request_type = 'household_membership_add' AND r.status = 'completed'
        AND json_extract(r.requested_payload_json, '$.shareToLink.invitationId') = i.id
        AND json_extract(r.requested_payload_json, '$.shareToLink.combineGiving') = 1
      JOIN directory_person_links giver_link ON giver_link.claim_id = i.id AND giver_link.person_id = i.person_id
        AND giver_link.link_type = 'platform_user' AND giver_link.external_id = i.claimed_by_user_id AND giver_link.active = 1
      JOIN directory_person_links recipient_link ON recipient_link.external_id = i.created_by_user_id
        AND recipient_link.person_id = r.requester_person_id AND recipient_link.link_type = 'platform_user' AND recipient_link.active = 1
      JOIN directory_people giver_person ON giver_person.id = giver_link.person_id AND giver_person.active = 1
      JOIN directory_people recipient_person ON recipient_person.id = recipient_link.person_id AND recipient_person.active = 1
      JOIN directory_household_members giver_member ON giver_member.household_id = h.id
        AND giver_member.person_id = giver_person.id AND giver_member.active = 1
      JOIN directory_household_admins admin ON admin.household_id = h.id
        AND admin.person_id = recipient_person.id AND admin.active = 1
      JOIN platform_users giver ON giver.id = giver_link.external_id AND giver.status = 'active' AND giver.email_verified_at IS NOT NULL
      JOIN platform_users recipient ON recipient.id = recipient_link.external_id AND recipient.status = 'active' AND recipient.email_verified_at IS NOT NULL
     WHERE i.parish_id = ?1 AND i.combine_giving = 1 AND i.status = 'claimed'
       AND giver.id <> recipient.id
    ${linkedAccounts}
    ${globalAccounts}
    )
    SELECT * FROM consenting_accounts a
     WHERE NOT EXISTS (SELECT 1 FROM giving_statements previous WHERE previous.parish_id=?1
       AND previous.fiscal_year=?2 AND previous.donor_email=a.giver_email)
     ORDER BY a.giver_email,a.recipient_email`,
    parishId,
    fiscalYear
  );
  const recipientEmails = new Set(links.map((link) => link.recipient_email));
  const giverLinkCounts = /* @__PURE__ */ new Map();
  for (const { giver_email: email } of links) {
    giverLinkCounts.set(email, (giverLinkCounts.get(email) || 0) + 1);
  }
  for (const {
    recipient_email: recipientEmail,
    giver_email: giverEmail,
    recipient_name: recipientName,
    giver_name: giverName,
  } of links) {
    if (giverLinkCounts.get(giverEmail) !== 1 || recipientEmails.has(giverEmail) || giverLinkCounts.has(recipientEmail))
      continue;
    const giver = byDonor.get(giverEmail);
    if (!giver) continue;
    const recipient = byDonor.get(recipientEmail) || {
      email: recipientEmail,
      donorName: recipientName,
      totalCents: 0,
      gifts: [],
    };
    recipient.donorName = [recipient.donorName || recipientName, giver.donorName || giverName]
      .filter(Boolean)
      .join(' and ');
    recipient.totalCents += giver.totalCents;
    recipient.gifts.push(...giver.gifts);
    byDonor.set(recipientEmail, recipient);
    byDonor.delete(giverEmail);
  }
}
async function loadDonorContactInfo(env, email) {
  if (!d1(env)) return {};
  const row = await d1First(env, 'SELECT data FROM donors WHERE email = ?1', normalizeEmail(email));
  if (!row) return {};
  try {
    return JSON.parse(row.data || '{}');
  } catch {
    return {};
  }
}
async function handleGivingStatementPreview(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fiscalYear = parseInt(body.fiscalYear, 10);
  const donorEmail = normalizeEmail(body.donorEmail);
  if (!fiscalYear || !donorEmail) return json({ error: 'fiscalYear and donorEmail are required' }, { status: 400 });
  const donors = await computeParishDonorYearGiving(env, parishId, fiscalYear);
  const donorGiving = donors.find((d) => d.email === donorEmail);
  if (!donorGiving) {
    return json({ error: 'No completed gifts found for that donor in that year.' }, { status: 404 });
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
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="giving-statement-preview-${fiscalYear}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
async function handleGivingStatementJobCreate(request, env, parishId, ctxRuntime) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const authCtx = await requireParishApiContext(request, env, parishId);
  if (!authCtx.ok) return authCtx.response;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fiscalYear = parseInt(body.fiscalYear, 10);
  if (!fiscalYear || fiscalYear < 2e3 || fiscalYear > 2100) {
    return json({ error: 'A valid fiscalYear is required' }, { status: 400 });
  }
  if (!d1(env)) return json({ error: 'Database not available' }, { status: 503 });
  const donors = await computeParishDonorYearGiving(env, parishId, fiscalYear);
  const jobId = generateSecret('gsj');
  await d1Run(
    env,
    `INSERT INTO giving_statement_jobs (id, parish_id, fiscal_year, status, total_donors, triggered_by, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`,
    jobId,
    parishId,
    fiscalYear,
    donors.length,
    'parish_dashboard'
  );
  if (ctxRuntime?.waitUntil) {
    ctxRuntime.waitUntil(runGivingStatementJob(env, jobId).catch(() => {}));
  } else {
    await runGivingStatementJob(env, jobId).catch(() => {});
  }
  return json({ ok: true, jobId, totalDonors: donors.length });
}
async function handleGivingStatementJobStatus(request, env, parishId, jobId) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const authCtx = await requireParishApiContext(request, env, parishId);
  if (!authCtx.ok) return authCtx.response;
  const row = await d1First(
    env,
    `SELECT id, parish_id, fiscal_year, status, total_donors, processed_donors, sent_count, failed_count, error, created_at, completed_at
     FROM giving_statement_jobs WHERE id = ? AND parish_id = ?`,
    jobId,
    parishId
  );
  if (!row) return json({ error: 'Job not found' }, { status: 404 });
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
async function handleGivingStatementJobList(request, env, parishId) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const authCtx = await requireParishApiContext(request, env, parishId);
  if (!authCtx.ok) return authCtx.response;
  const url = new URL(request.url);
  const fiscalYear = url.searchParams.get('fiscalYear');
  const rows = fiscalYear
    ? await d1All(
        env,
        `SELECT id, fiscal_year, status, total_donors, processed_donors, sent_count, failed_count, created_at, completed_at
         FROM giving_statement_jobs WHERE parish_id = ? AND fiscal_year = ? ORDER BY created_at DESC LIMIT 25`,
        parishId,
        parseInt(fiscalYear, 10)
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
  const amount = (Number(totalCents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return agapayEmailHtml(
    appUrl,
    `Your ${fiscalYear} Giving Statement`,
    `
    <p>Dear ${htmlEscape(donorName || 'friend')},</p>
    <p>Attached is your annual giving statement from <strong>${htmlEscape(parish.parishName)}</strong> for
    <strong>${fiscalYear}</strong>, documenting a total of <strong>${amount}</strong> in charitable
    contributions. Please retain this for your tax records.</p>
    <p>Thank you for your generosity and continued support of ${htmlEscape(parish.parishName)}.</p>
  `
  );
}
async function runGivingStatementJob(env, jobId) {
  const job = await d1First(env, 'SELECT * FROM giving_statement_jobs WHERE id = ?', jobId);
  if (!job) return;
  await d1Run(
    env,
    "UPDATE giving_statement_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?",
    jobId
  );
  const found = await findRegistrationByParishId(env, job.parish_id);
  if (!found) {
    await d1Run(
      env,
      "UPDATE giving_statement_jobs SET status = 'failed', error = ?, updated_at = datetime('now'), completed_at = datetime('now') WHERE id = ?",
      'Parish not found',
      jobId
    );
    return;
  }
  const parish = parishTaxProfile(found.registration);
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const fromEmail = env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>';
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app';
  const donors = await computeParishDonorYearGiving(env, job.parish_id, job.fiscal_year);
  let processed = 0;
  let sent = 0;
  let failed = 0;
  for (const donorGiving of donors) {
    try {
      const donorContact = await loadDonorContactInfo(env, donorGiving.email);
      const donorName = donorGiving.donorName || donorContact.donorName || '';
      const pdfBytes = await buildGivingStatementPdf({
        parish,
        donor: { ...donorContact, email: donorGiving.email, donorName },
        fiscalYear: job.fiscal_year,
        gifts: donorGiving.gifts,
        totalCents: donorGiving.totalCents,
      });
      const storageKey = generateGivingStatementStorageKey();
      await putGivingStatementPdf(env, { parishId: job.parish_id, storageKey, bytes: pdfBytes });
      const statementId = generateSecret('gst');
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
        statementId,
        jobId,
        job.parish_id,
        donorGiving.email,
        job.fiscal_year,
        donorGiving.totalCents,
        donorGiving.gifts.length,
        storageKey
      );
      const emailResult = await sendEmail(env, {
        from: fromEmail,
        to: donorGiving.email,
        reply_to: replyTo,
        subject: `Your ${job.fiscal_year} Giving Statement from ${parish.parishName}`,
        html: givingStatementEmailBody({
          appUrl,
          parish,
          fiscalYear: job.fiscal_year,
          donorName,
          totalCents: donorGiving.totalCents,
        }),
        attachments: [
          {
            filename: `${job.fiscal_year}-giving-statement.pdf`,
            content: Buffer.from(pdfBytes).toString('base64'),
          },
        ],
      });
      const emailStatus = emailResult.status === 'sent' || emailResult.status === 'not_configured' ? 'sent' : 'failed';
      await d1Run(
        env,
        `UPDATE giving_statements SET email_status = ?, email_error = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END
         WHERE parish_id = ? AND donor_email = ? AND fiscal_year = ?`,
        emailStatus,
        emailStatus === 'failed' ? JSON.stringify(emailResult) : null,
        emailStatus,
        job.parish_id,
        donorGiving.email,
        job.fiscal_year
      );
      if (emailStatus === 'sent') sent++;
      else failed++;
    } catch (error) {
      failed++;
    }
    processed++;
    await d1Run(
      env,
      "UPDATE giving_statement_jobs SET processed_donors = ?, sent_count = ?, failed_count = ?, updated_at = datetime('now') WHERE id = ?",
      processed,
      sent,
      failed,
      jobId
    );
  }
  const finalStatus = failed === 0 ? 'completed' : sent === 0 ? 'failed' : 'completed_with_errors';
  await d1Run(
    env,
    "UPDATE giving_statement_jobs SET status = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    finalStatus,
    jobId
  );
}
async function handleDonorGivingStatements(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
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
      parishName: row.parish_name || 'Parish',
      fiscalYear: row.fiscal_year,
      totalCents: row.total_cents,
      giftCount: row.gift_count,
      generatedAt: row.generated_at,
    })),
  });
}
async function handleDonorGivingStatementDownload(request, env, statementId) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!d1(env)) return json({ error: 'Not found' }, { status: 404 });
  const row = await d1First(
    env,
    'SELECT storage_key, fiscal_year, donor_email FROM giving_statements WHERE id = ?',
    statementId
  );
  if (!row || normalizeEmail(row.donor_email) !== normalizeEmail(donor.email) || !row.storage_key) {
    return json({ error: 'Statement not found' }, { status: 404 });
  }
  return streamGivingStatementPdf(env, {
    storageKey: row.storage_key,
    filename: `${row.fiscal_year}-giving-statement.pdf`,
  });
}
export {
  computeParishDonorYearGiving,
  handleDonorGivingStatementDownload,
  handleDonorGivingStatements,
  handleGivingStatementJobCreate,
  handleGivingStatementJobList,
  handleGivingStatementJobStatus,
  handleGivingStatementPreview,
  runGivingStatementJob,
};
