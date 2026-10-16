import type {
  FeatureRequestEnv,
  DonorEnvironment,
  DonorRequestBody,
  DonorRecord,
  ReceiptOffering,
  DonorParishContext,
} from './donor-composition-contracts.js';

import { loadDonorParishContext } from './donor-parish-context.js';

import '../payments/donation-receipts.js';

import '../payments/donation-events.js';

import { addOutsideDonorPledgeSummary } from '../lib/outside-pledges.js';

import { logEvent } from '../lib/logging.js';

import '../lib/directory-invitation-next.js';

import '../lib/legal-acceptance.js';

import {
  applyDonorPassword,
  d1,
  d1Run,
  deleteDonor,
  hasProductionStore,
  json,
  loadDonor,
  missingProductionStoreResponse,
  normalizeEmail,
  publicDonor,
  rateLimit,
  rateLimitByKey,
  saveDonor,
  sha256Hex,
  unauthorized,
  verifyDonorPassword,
} from '../lib/core.js';

import '../lib/subscriptions.js';

import { givingFeatureAccess, stewardshipToolAccess } from '../lib/entitlements.js';

import { recordParishFeatureRequest } from '../lib/parish-feature-requests.js';

import { submitParishSupportTicket } from '../lib/parish-support-tickets.js';

import '../lib/safe-external-url.js';

import { resolveDirectorySelfServiceContext, syncSelfServiceContactsFromDonor } from '../directory/self-service.js';

import { migrateConsumerPasskeyEmail } from '../lib/consumer-passkeys.js';

import '../lib/email.js';

import '../lib/format.js';

import '../lib/stripe-connect.js';

import { offeringFeeBreakdown } from '../lib/stripe-fees.js';

import {
  donorSummaryFromOfferings,
  findRegistrationByParishId,
  loadDonorOfferings,
  loadReconciledDonorCommemorations,
  migrateDonorEmailReferences,
  paidOfferingStatus,
  publicDonorOffering,
  reconcilePendingDonorOfferings,
  requireDonor,
  slugify,
} from './parish.js';

import './parish-commemorations.js';

import { enrichParishGivingOptions } from './parish-giving-catalog.js';
import './donor-authentication.js';
import './donor-password-recovery.js';
import './donor.js';
import './donor-giving.js';
export function attachDonorCampaignGiving(parish: DonorParishContext | null, offerings: ReceiptOffering[]) {
  if (!parish) return parish;
  const groups = [parish.campaigns, parish.feastCampaigns].filter(Array.isArray);
  if (!groups.length) return parish;
  const norm = (v: unknown) =>
    String(v || '')
      .trim()
      .toLowerCase();

  const paidCampaignGifts = offerings
    .filter(paidOfferingStatus)
    .map((o) => ({
      key: norm(o.campaign || o.campaignId || o.campaignName || o.campaignSlug),
      cents: offeringFeeBreakdown(o).giftAmountCents,
      at: o.createdAt || '',
    }))
    .filter((g) => g.key);

  for (const group of groups) {
    for (const campaign of group) {
      if (!campaign || typeof campaign !== 'object') continue;
      const keys = new Set(
        [
          campaign.id,
          campaign.feastId,
          campaign.name,
          campaign.campaignName,
          campaign.slug,
          slugify(campaign.name || campaign.campaignName || ''),
        ]
          .map(norm)
          .filter(Boolean)
      );
      let cents = 0,
        count = 0,
        last = '';
      for (const g of paidCampaignGifts) {
        if (!keys.has(g.key)) continue;
        cents += g.cents;
        count += 1;
        if (g.at > last) last = g.at;
      }
      campaign.donorGivenCents = cents;
      campaign.donorGiftCount = count;
      campaign.donorLastGiftAt = last || null;
    }
  }
  return parish;
}

export async function handleDonorDashboard(request: Request, env: DonorEnvironment) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === 'PATCH') {
    const limited = await rateLimit(request, env, 'donor-settings', { limit: 20, windowSeconds: 300 });
    if (limited) return limited;

    let body: DonorRequestBody;
    try {
      body = (await request.json()) as DonorRequestBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const directoryContext = await resolveDirectorySelfServiceContext(env, { request }).catch(() => null);

    let updated: DonorRecord = {
      ...donor,
      donorName: body.donorName ?? donor.donorName,
      householdName: body.householdName ?? donor.householdName,
      contactPhone: body.contactPhone ?? body.phone ?? donor.contactPhone ?? '',
      defaultParishId: body.defaultParishId ?? body.parishId ?? donor.defaultParishId,
      pledgeAmountCents: Number.isFinite(Number(body.pledgeAmountCents))
        ? Math.max(0, Math.round(Number(body.pledgeAmountCents)))
        : Number(donor.pledgeAmountCents || 0),
      pledgeCadence:
        body.pledgeCadence === 'monthly'
          ? 'monthly'
          : body.pledgeCadence === 'annual'
            ? 'annual'
            : donor.pledgeCadence === 'monthly'
              ? 'monthly'
              : 'annual',
      pledgeYear: body.pledgeYear ?? donor.pledgeYear ?? '',
      addressLine1: body.addressLine1 ?? donor.addressLine1 ?? '',
      addressLine2: body.addressLine2 ?? donor.addressLine2 ?? '',
      city: body.city ?? donor.city ?? '',
      state: body.state ?? donor.state ?? '',
      postalCode: body.postalCode ?? donor.postalCode ?? '',
      country: body.country ?? donor.country ?? '',
      updatedAt: new Date().toISOString(),
    };

    const requestedEmail = normalizeEmail(body.email || donor.email);
    const emailChanged = requestedEmail && requestedEmail !== normalizeEmail(donor.email);
    if (emailChanged) {
      const currentPassword = String(body.currentPassword || '');
      if (!(await verifyDonorPassword(donor, currentPassword))) return unauthorized();
      const existing = await loadDonor(env, requestedEmail);
      if (existing)
        return json({ error: 'That email address is already connected to a donor account' }, { status: 409 });
      updated = {
        ...updated,
        email: requestedEmail,
        emailVerifiedAt: new Date().toISOString(),
        emailChangedAt: new Date().toISOString(),
      };
    }

    if (body.newPassword) {
      const currentPassword = String(body.currentPassword || '');
      if (!(await verifyDonorPassword(donor, currentPassword))) return unauthorized();
      if (String(body.newPassword).length < 8)
        return json({ error: 'Password must be at least 8 characters' }, { status: 422 });
      updated = await applyDonorPassword(updated, body.newPassword);
    }

    if (emailChanged) {
      const passkeyMigration = await migrateConsumerPasskeyEmail(env, donor.email, requestedEmail);
      if (passkeyMigration.conflict) {
        return json({ error: 'That email address is already connected to another passkey account' }, { status: 409 });
      }
      await migrateDonorEmailReferences(env, donor.email, requestedEmail);
      await deleteDonor(env, donor.email);
    }
    await saveDonor(env, updated);
    if (directoryContext?.claimed) {
      await syncSelfServiceContactsFromDonor(env, {
        context: directoryContext,
        donor: updated,
        correlationId: request.headers.get('X-Correlation-ID') || '',
      }).catch(() => null);
    }

    // Sync pledge amount to household_pledges for parish stewardship reporting.
    // Runs whenever the donor saves settings — harmless no-op if D1 isn't available
    // or if the donor hasn't set a home parish yet.
    const pledgeSyncParish = updated.defaultParishId || '';
    // Parish stewardship reports remain annual. A monthly donor pledge is
    // annualized here while My AGAPAY retains the donor's chosen cadence.
    const pledgeSyncAmount = Number(updated.pledgeAmountCents || 0) * (updated.pledgeCadence === 'monthly' ? 12 : 1);
    if (d1(env) && pledgeSyncParish.trim()) {
      const pledgeSyncYear = parseInt((updated.pledgeYear || new Date().getFullYear()) as string, 10);
      await env
        .AGAPAY_DB!.prepare(
          `
        INSERT INTO household_pledges (donor_email, parish_id, fiscal_year, target_amount_cents)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(donor_email, parish_id, fiscal_year) DO UPDATE SET
          target_amount_cents = excluded.target_amount_cents,
          updated_at          = datetime('now')
      `
        )
        .bind(updated.email, pledgeSyncParish, pledgeSyncYear, pledgeSyncAmount)
        .run()
        .catch(() => {});
    }

    return json({ ok: true, donor: publicDonor(updated) });
  }

  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });

  if (new URL(request.url).searchParams.get('view') === 'context') {
    return json({ donor: publicDonor(donor), parish: await loadDonorParishContext(env, donor) });
  }

  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const publicOfferings = offerings.map(publicDonorOffering);
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  const summary = await addOutsideDonorPledgeSummary(env, donor, donorSummaryFromOfferings(offerings, commemorations));
  let parish = await loadDonorParishContext(env, donor);
  if (parish) parish = await enrichParishGivingOptions(env, parish);
  if (parish) parish = attachDonorCampaignGiving(parish, offerings);

  return json({
    donor: publicDonor(donor),
    parish,
    summary,
    recentOfferings: publicOfferings.slice(0, 5),
    recentCommemorations: commemorations.slice(0, 5),
  });
}

export async function handleDonorSupportTicket(request: Request, env: DonorEnvironment) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const limited = await rateLimit(request, env, 'donor-support-ticket', { limit: 8, windowSeconds: 300 });
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as DonorRequestBody | null;
  if (!body || typeof body !== 'object') return json({ error: 'Support request was invalid.' }, { status: 400 });

  const parishId = String(donor.defaultParishId || '').trim();
  const found = parishId ? await findRegistrationByParishId(env, parishId) : null;
  const registration = found?.registration || {};
  const result = await submitParishSupportTicket(
    env,
    request,
    {
      parishId,
      parishName: registration.parishName || registration.name || 'My AGAPAY',
      email: donor.email,
    },
    {
      ...body,
      source: 'myagapay',
      submittedBy: donor.email,
      page: String(body.page || 'myagapay').slice(0, 80),
      path: String(body.path || new URL(request.url).pathname).slice(0, 240),
    }
  );
  return json(result, { status: result.ok ? 201 : result.status || 500 });
}

export async function handleDonorAccountDeletion(request: Request, env: DonorEnvironment) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const limited = await rateLimitByKey(request, env, 'donor-account-deletion', donor.email, {
    limit: 3,
    windowSeconds: 86400,
  });
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as DonorRequestBody | null;
  if (!body || body.confirmation !== 'DELETE') {
    return json({ error: 'Type DELETE to confirm the account deletion request.' }, { status: 422 });
  }
  if (!(await verifyDonorPassword(donor, String(body.currentPassword || '')))) {
    return json({ error: 'Your current password was not accepted.' }, { status: 403 });
  }

  const requestedAt = new Date().toISOString();
  const requestId = `account_delete_${crypto.randomUUID()}`;
  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO account_deletion_requests
       (id, donor_email, status, source, requested_at, updated_at)
       VALUES (?1, ?2, 'pending', ?3, ?4, ?4)`,
      requestId,
      donor.email,
      String(body.source || 'myagapay-account-settings').slice(0, 80),
      requestedAt
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(
      `account-deletion-request:${requestId}`,
      JSON.stringify({
        id: requestId,
        donorEmail: donor.email,
        status: 'pending',
        source: String(body.source || 'myagapay-account-settings').slice(0, 80),
        requestedAt,
        updatedAt: requestedAt,
      })
    );
  }

  await saveDonor(env, {
    ...donor,
    accountDeletionRequestId: requestId,
    accountDeletionRequestedAt: requestedAt,
    sessionSalt: '',
    sessionTokenHash: '',
    sessionExpiresAt: '',
    updatedAt: requestedAt,
  });
  await logEvent(env, {
    eventType: 'donor.account_deletion.requested',
    severity: 'info',
    route: '/api/donor/account-deletion',
    method: 'POST',
    retryable: false,
    metadata: { requestId, emailHash: await sha256Hex(donor.email) },
  });

  return json(
    {
      ok: true,
      requestId,
      requestedAt,
      message:
        'Your account deletion request has been received. AGAPAY will complete it within 30 days and retain only records required by law.',
    },
    { status: 202 }
  );
}

export async function handleDonorStewardshipFeatureRequest(
  request: Request,
  env: DonorEnvironment & FeatureRequestEnv
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!donor.defaultParishId) {
    return json({ error: 'Choose your home parish before sending this request.' }, { status: 422 });
  }

  const limited = await rateLimitByKey(
    request,
    env,
    'donor-stewardship-feature-request',
    `${donor.email}:${donor.defaultParishId}`,
    { limit: 3, windowSeconds: 86400 }
  );
  if (limited) return limited;

  const found = await findRegistrationByParishId(env, donor.defaultParishId);
  if (!found) return json({ error: 'Your selected parish could not be found.' }, { status: 404 });
  if (stewardshipToolAccess(found.registration)) {
    return json({ ok: true, alreadyEnabled: true, message: 'Your parish already includes pledge tracking.' });
  }

  const result = await recordParishFeatureRequest(env, {
    parishId: donor.defaultParishId,
    featureId: 'pledge-tracker',
    donorEmail: donor.email,
  });
  return json(
    {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? 'Your parish has already received your request.'
        : 'Thank you. Your parish will see this request the next time they open their dashboard.',
    },
    { status: result.duplicate ? 200 : 201 }
  );
}

export async function handleDonorGivingPlusFeatureRequest(request: Request, env: DonorEnvironment & FeatureRequestEnv) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!donor.defaultParishId) {
    return json({ error: 'Choose your home parish before sending this request.' }, { status: 422 });
  }

  const limited = await rateLimitByKey(
    request,
    env,
    'donor-giving-plus-feature-request',
    `${donor.email}:${donor.defaultParishId}`,
    { limit: 3, windowSeconds: 86400 }
  );
  if (limited) return limited;

  const found = await findRegistrationByParishId(env, donor.defaultParishId);
  if (!found) return json({ error: 'Your selected parish could not be found.' }, { status: 404 });
  if (givingFeatureAccess(found.registration, 'campaigns')) {
    return json({ ok: true, alreadyEnabled: true, message: 'Your parish already includes Give +.' });
  }

  const result = await recordParishFeatureRequest(env, {
    parishId: donor.defaultParishId,
    featureId: 'giving-plus',
    donorEmail: donor.email,
  });
  return json(
    {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? 'Your parish has already received your request.'
        : 'Thank you. Your parish will see this request the next time they open their dashboard.',
    },
    { status: result.duplicate ? 200 : 201 }
  );
}

export async function handleDonorMinistryServiceInterest(request: Request, env: DonorEnvironment & FeatureRequestEnv) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!donor.defaultParishId) {
    return json({ error: 'Choose your home parish before sending this request.' }, { status: 422 });
  }

  const limited = await rateLimitByKey(
    request,
    env,
    'donor-ministry-service-interest',
    `${donor.email}:${donor.defaultParishId}`,
    { limit: 3, windowSeconds: 86400 }
  );
  if (limited) return limited;

  const found = await findRegistrationByParishId(env, donor.defaultParishId);
  if (!found) return json({ error: 'Your selected parish could not be found.' }, { status: 404 });
  const result = await recordParishFeatureRequest(env, {
    parishId: donor.defaultParishId,
    featureId: 'ministry-service',
    donorEmail: donor.email,
  });
  return json(
    {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? 'Your parish has already received your interest.'
        : 'Thank you. Your parish dashboard has been notified that a parishioner wants to serve.',
    },
    { status: result.duplicate ? 200 : 201 }
  );
}
