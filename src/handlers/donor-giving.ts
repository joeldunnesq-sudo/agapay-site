import type { DonorEnvironment, DonorRequestBody } from './donor-composition-contracts.js';

import './donor-parish-context.js';

import '../payments/donation-receipts.js';

import '../payments/donation-events.js';

import { addOutsideDonorPledgeSummary } from '../lib/outside-pledges.js';

import '../lib/logging.js';

import '../lib/directory-invitation-next.js';

import '../lib/legal-acceptance.js';

import {
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from '../lib/core.js';

import '../lib/subscriptions.js';

import '../lib/entitlements.js';

import '../lib/parish-feature-requests.js';

import '../lib/parish-support-tickets.js';

import '../lib/safe-external-url.js';

import '../directory/self-service.js';

import '../lib/consumer-passkeys.js';

import '../lib/email.js';

import '../lib/format.js';

import { stripeFormConnectedRequest } from '../lib/stripe-connect.js';

import '../lib/stripe-fees.js';

import {
  donorSummaryFromOfferings,
  findRegistrationByParishId,
  loadDonorOfferings,
  loadReconciledDonorCommemorations,
  publicDonorOffering,
  reconcilePendingDonorOfferings,
  requireDonor,
} from './parish.js';

import { storeCommemorationEntry } from './parish-commemorations.js';

import './parish-giving-catalog.js';
import './donor-authentication.js';
import './donor-password-recovery.js';
import './donor.js';
import './donor-profile.js';

export async function handleDonorOfferings(request: Request, env: DonorEnvironment) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  return json({
    offerings: offerings.map(publicDonorOffering),
    summary: await addOutsideDonorPledgeSummary(env, donor, donorSummaryFromOfferings(offerings, commemorations)),
  });
}

export async function handleDonorSubscriptionPortal(request: Request, env: DonorEnvironment) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'donor-money-actions', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  let body: DonorRequestBody = {};
  try {
    body = (await request.json()) as DonorRequestBody;
  } catch {
    body = {};
  }

  const requestedParishId = String(body.parishId || donor.defaultParishId || '').trim();
  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const recurringOfferings = offerings
    .filter(
      (offering) =>
        offering.stripeCustomerId && offering.parishId && offering.frequency && offering.frequency !== 'once'
    )
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const selectedOffering =
    recurringOfferings.find((offering) => requestedParishId && offering.parishId === requestedParishId) ||
    recurringOfferings[0];

  if (!selectedOffering) {
    return json(
      { error: 'No recurring gifts found', detail: 'Create a recurring gift before opening subscription management.' },
      { status: 422 }
    );
  }

  const found = await findRegistrationByParishId(env, selectedOffering.parishId!);
  const stripeAccountId = found?.registration?.stripeAccountId || '';
  if (!stripeAccountId) {
    return json(
      {
        error: 'Parish Stripe account unavailable',
        detail: 'This parish is not currently connected for Stripe subscription management.',
      },
      { status: 422 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    customer: selectedOffering.stripeCustomerId!,
    return_url: `${String(appUrl).replace(/\/+$/, '')}/myagapay/giving/history`,
  });

  const session = await stripeFormConnectedRequest(env, '/v1/billing_portal/sessions', form, stripeAccountId);
  if (!session.ok) {
    return json(
      { error: 'Stripe billing portal failed', detail: session.body.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }

  return json({
    ok: true,
    portalUrl: session.body.url,
    parishId: selectedOffering.parishId,
    parishName: selectedOffering.parishName || found?.registration?.parishName || '',
  });
}

export async function handleDonorCommemorations(request: Request, env: DonorEnvironment) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === 'GET') {
    const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
    const entries = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
    return json({ entries });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-commemoration-submit', { limit: 20, windowSeconds: 3600 });
  if (limited) return limited;

  let body: DonorRequestBody = {};
  try {
    body = (await request.json()) as DonorRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parishId = String(body.parishId || donor.defaultParishId || '').trim();
  const namesLiving = String(body.namesLiving || body.living || '').trim();
  const namesDeparted = String(body.namesDeparted || body.departed || '').trim();
  const commemorationKind =
    String(body.commemorationKind || '') === 'molieben_panikhida' ? 'molieben_panikhida' : 'proskomedia_liturgy';
  const note = String(body.note || body.inMemoriam || '')
    .trim()
    .slice(0, 2000);
  if (!parishId) {
    return json(
      {
        error: 'Choose a parish before submitting commemorations.',
        detail: 'Set a home parish in Settings, or include parishId.',
      },
      { status: 400 }
    );
  }
  if (!namesLiving && !namesDeparted) {
    return json({ error: 'Add at least one living or departed name.' }, { status: 400 });
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish not found.' }, { status: 404 });

  const donorName = String(donor.donorName || donor.householdName || donor.email || '').trim();
  const entry = await storeCommemorationEntry(
    env,
    generateSecret('comm'),
    {
      parish_id: parishId,
      parish_name: found.registration?.parishName || '',
      donor_email: donor.email,
      donor_name: donorName,
      gift_type: 'commemoration',
      frequency: 'none',
      names_living: namesLiving,
      names_departed: namesDeparted,
      note,
    },
    {
      parishId,
      parishName: found.registration?.parishName || '',
      donorEmail: donor.email,
      donorName,
      giftType: 'commemoration',
      frequency: 'none',
      amountCents: 0,
      namesLiving,
      namesDeparted,
      commemorationKind,
      note,
      createdAt: new Date().toISOString(),
    }
  );

  if (!entry) return json({ error: 'Unable to submit commemoration.' }, { status: 500 });

  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const entries = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  return json({ ok: true, entry, entries });
}
