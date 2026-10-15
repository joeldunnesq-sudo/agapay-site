import type { PaidOfferingStatusInput } from '../lib/paid-offering-status.js';
import type { StripeCharge, StripeObjectReference } from '../lib/stripe-connect.js';
export interface ReceiptOffering extends PaidOfferingStatusInput {
  [field: string]: unknown;
  donorEmail?: unknown;
  id?: string;
  status?: string;
  refundedCents?: number;
  disputeStatus?: string;
  settlementProfileId?: string;
  parishId?: string;
  donorName?: string;
  parishName?: string;
  giftType?: string;
  title?: string;
  fund?: string;
  fundId?: string;
  donorRestricted?: boolean;
  recordType?: string;
  campaign?: string;
  campaignId?: string;
  campaignDescription?: string;
  publicAnonymous?: boolean;
  publicDisplayName?: string;
  publicComment?: string;
  feastDescription?: string;
  inMemoriam?: string;
  frequency?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  checkoutSessionId?: string;
  checkoutUrl?: string;
  stripeCustomerId?: string;
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
  stripeChargeId?: string;
  stripeBalanceTransactionId?: string;
  stripeFeeSource?: string;
  namesLiving?: string;
  namesDeparted?: string;
  commemorationKind?: string;
  emailReceiptStatus?: string;
  emailReceiptId?: string;
  emailReceiptDetail?: unknown;
  emailReceiptSentAt?: string;
  completedAt?: string;
  feeReconciledAt?: string;
  refundedAt?: string;
  failureMessage?: string;
  failedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
  amountCents?: number;
}
interface StripeOfferingObject {
  [field: string]: unknown;
  metadata?: Record<string, unknown>;
  id?: string;
  latest_charge?: StripeCharge | string | null;
  customer?: string;
  subscription?: string;
  created?: number;
  payment_intent?: StripeObjectReference;
  status?: string;
  payment_status?: string;
}
interface CommemorationRecord {
  sourceId?: string;
  id?: string;
  donorEmail?: unknown;
  createdAt?: string;
  living?: unknown[];
  departed?: unknown[];
}

type ModuleEnv = Partial<Env> & { DB?: D1Database; STRIPE_SECRET_KEY?: string | null; RESEND_API_KEY?: string | null };

interface ModuleRow {
  data: string;
  id: string;
  status: string;
  title: string;
  email: string;
  amount: number;
}
import { subscriptionSetupUpdates, visibleDonationRecords } from '../payments/donation-events.js';
import {
  COMMEMORATION_KEY_PREFIX,
  d1All,
  d1First,
  d1Run,
  donorCheckoutIndexKey,
  donorOfferingKey,
  hasProductionStore,
  listKvKeys,
  normalizeEmail,
  parseJsonRow,
  stripePaymentIntentIndexKey,
} from '../lib/core.js';
import { offeringFeeBreakdown } from '../lib/stripe-fees.js';
import {
  booleanFromStripeMetadata,
  checkoutPaymentIntentId,
  normalizedCheckoutPaymentStatus,
  numericCents,
  stripeGetConnectedRequest,
  stripeObjectId,
} from '../lib/stripe-connect.js';
import { resolveSettlementProfileId } from '../lib/settlement-profiles.js';
import {
  commemorationSourceIdFromOffering,
  ensureCommemorationEntryFromOffering,
  splitSubmittedNames,
} from './parish-commemorations.js';
import { publicComment } from './parish-giving-catalog.js';
import { findCheckoutParish } from './parish.js';

function d1(env: ModuleEnv) {
  return env.AGAPAY_DB || env.DB || null;
}

async function sendDonationReceiptIfNeeded(env: ModuleEnv, offering: ReceiptOffering = {}) {
  if (!paidOfferingStatus(offering)) return { status: 'not_paid' };
  const donorModule = await import('./donor.js');
  return donorModule.sendDonationReceiptIfNeeded(env, offering);
}

export async function storeDonorOffering(env: ModuleEnv, offering: ReceiptOffering) {
  if (!hasProductionStore(env) || !offering?.donorEmail) return null;
  const email = normalizeEmail(offering.donorEmail);
  const id = offering.id || crypto.randomUUID();
  const previous = await loadDonorOfferingById(env, id, email);
  if (
    ['refunded', 'partially_refunded'].includes(offering.status!) &&
    Number(previous?.refundedCents || 0) > Number(offering.refundedCents || 0)
  )
    return previous;
  const protectedStatus = ['refunded', 'partially_refunded', 'disputed', 'dispute_closed'];
  if (
    protectedStatus.includes(previous?.status as string) &&
    ['completed', 'pending', 'failed'].includes(offering.status!) &&
    offering.disputeStatus !== 'won'
  )
    return previous;
  offering = { ...previous, ...offering };
  const fees = offeringFeeBreakdown(offering);
  const settlementProfileId =
    offering.settlementProfileId ||
    (offering.parishId ? await resolveSettlementProfileId(env, offering.parishId, 'giving') : null);
  const record = {
    ...offering,
    id,
    donorEmail: email,
    donorName: offering.donorName || '',
    parishId: offering.parishId || '',
    parishName: offering.parishName || '',
    settlementProfileId: settlementProfileId || '',
    giftType: offering.giftType || 'stewardship',
    title: offering.title || 'AGAPAY offering',
    fund: offering.fund || '',
    fundId: offering.fundId || '',
    donorRestricted: Boolean(offering.donorRestricted),
    recordType: offering.recordType || 'payment',
    campaign: offering.campaign || '',
    campaignId: offering.campaignId || '',
    campaignDescription: offering.campaignDescription || '',
    publicAnonymous: Boolean(offering.publicAnonymous),
    publicDisplayName: offering.publicDisplayName || '',
    publicComment: publicComment(offering.publicComment),
    feastDescription: offering.feastDescription || '',
    inMemoriam: offering.inMemoriam || '',
    frequency: offering.frequency || 'once',
    paymentMethod: offering.paymentMethod || '',
    amountCents: fees.giftAmountCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    parishNetCents: fees.parishNetCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
    status: offering.status || 'checkout_created',
    paymentStatus: offering.paymentStatus || 'pending',
    checkoutSessionId: offering.checkoutSessionId || '',
    checkoutUrl: offering.checkoutUrl || '',
    stripeCustomerId: offering.stripeCustomerId || '',
    stripePaymentIntentId: offering.stripePaymentIntentId || '',
    stripeSubscriptionId: offering.stripeSubscriptionId || '',
    stripeInvoiceId: offering.stripeInvoiceId || '',
    stripeChargeId: offering.stripeChargeId || '',
    stripeBalanceTransactionId: offering.stripeBalanceTransactionId || '',
    stripeFeeSource: offering.stripeFeeSource || '',
    namesLiving: offering.namesLiving || '',
    namesDeparted: offering.namesDeparted || '',
    commemorationKind: offering.commemorationKind || '',
    emailReceiptStatus: offering.emailReceiptStatus || '',
    emailReceiptId: offering.emailReceiptId || '',
    emailReceiptDetail: offering.emailReceiptDetail || '',
    emailReceiptSentAt: offering.emailReceiptSentAt || '',
    completedAt: offering.completedAt || '',
    feeReconciledAt: offering.feeReconciledAt || '',
    refundedCents: offering.refundedCents || 0,
    refundedAt: offering.refundedAt || '',
    failureMessage: offering.failureMessage || '',
    failedAt: offering.failedAt || '',
    cancelledAt: offering.cancelledAt || '',
    createdAt: offering.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // A Checkout Session configures a subscription; only its invoices are gifts.
  if (record.recordType === 'subscription_setup') {
    record.status = ['failed', 'expired', 'cancelled'].includes(record.status) ? record.status : 'subscription_setup';
    record.paymentStatus = 'pending';
    record.stripePaymentIntentId = '';
    record.completedAt = '';
  }
  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO donor_offerings (
        id, donor_email, parish_id, checkout_session_id, payment_intent_id,
        stripe_subscription_id, status, payment_status, settlement_profile_id, created_at, updated_at, data
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT(id) DO UPDATE SET
         donor_email = excluded.donor_email,
         parish_id = excluded.parish_id,
         checkout_session_id = excluded.checkout_session_id,
         payment_intent_id = excluded.payment_intent_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         status = excluded.status,
         payment_status = excluded.payment_status,
         settlement_profile_id = excluded.settlement_profile_id,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         data = excluded.data
       WHERE NOT (donor_offerings.status IN ('refunded','partially_refunded','disputed','dispute_closed')
         AND excluded.status IN ('completed','pending','failed')
         AND COALESCE(json_extract(excluded.data,'$.disputeStatus'),'') != 'won')
         AND NOT (excluded.status IN ('refunded','partially_refunded')
           AND COALESCE(json_extract(donor_offerings.data,'$.refundedCents'),0) > COALESCE(json_extract(excluded.data,'$.refundedCents'),0))`,
      record.id,
      record.donorEmail,
      record.parishId,
      record.checkoutSessionId,
      record.stripePaymentIntentId,
      record.stripeSubscriptionId,
      record.status,
      record.paymentStatus,
      record.settlementProfileId,
      record.createdAt,
      record.updatedAt,
      JSON.stringify(record)
    );
    return loadDonorOfferingById(env, id, email);
  } else {
    const key = donorOfferingKey(email, id);
    await env.AGAPAY_REGISTRATIONS!.put(key, JSON.stringify(record));
    if (record.checkoutSessionId) {
      await env.AGAPAY_REGISTRATIONS!.put(donorCheckoutIndexKey(record.checkoutSessionId), key);
    }
    if (record.stripePaymentIntentId) {
      await env.AGAPAY_REGISTRATIONS!.put(stripePaymentIntentIndexKey(record.stripePaymentIntentId), key);
    }
  }
  return record;
}

async function loadDonorOfferingById(env: ModuleEnv, id: string, email: string = '') {
  if (d1(env))
    return parseJsonRow(
      await d1First<ModuleRow>(env, 'SELECT data FROM donor_offerings WHERE id = ?1', id)
    ) as ReceiptOffering | null;
  if (!env.AGAPAY_REGISTRATIONS || !email) return null;
  const raw = await env.AGAPAY_REGISTRATIONS!.get(donorOfferingKey(normalizeEmail(email), id));
  return raw ? (JSON.parse(raw) as ReceiptOffering) : null;
}

export async function updateDonorOfferingByCheckout(
  env: ModuleEnv,
  checkoutSessionId: string,
  updates: Partial<ReceiptOffering> = {}
) {
  if (!hasProductionStore(env) || !checkoutSessionId) return null;
  const current = await loadDonorOfferingByCheckout(env, checkoutSessionId);
  return current ? storeDonorOffering(env, { ...current, ...updates }) : null;
}

export async function loadDonorOfferingByCheckout(env: ModuleEnv, checkoutSessionId: string) {
  if (!hasProductionStore(env) || !checkoutSessionId) return null;
  if (d1(env)) {
    const row = await d1First<ModuleRow>(
      env,
      'SELECT data FROM donor_offerings WHERE checkout_session_id = ?1 LIMIT 1',
      checkoutSessionId
    );
    return parseJsonRow(row) as ReceiptOffering | null;
  }

  const key = await env.AGAPAY_REGISTRATIONS!.get(donorCheckoutIndexKey(checkoutSessionId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS!.get(key);
  return raw ? (JSON.parse(raw) as ReceiptOffering) : null;
}

export async function updateDonorOfferingByPaymentIntent(
  env: ModuleEnv,
  paymentIntentId: string,
  updates: Partial<ReceiptOffering> = {}
) {
  if (!hasProductionStore(env) || !paymentIntentId) return null;
  const current = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
  return current ? storeDonorOffering(env, { ...current, ...updates }) : null;
}

export async function loadDonorOfferingByPaymentIntent(env: ModuleEnv, paymentIntentId: string) {
  if (!hasProductionStore(env) || !paymentIntentId) return null;
  if (d1(env)) {
    const row = await d1First<ModuleRow>(
      env,
      'SELECT data FROM donor_offerings WHERE payment_intent_id = ?1 LIMIT 1',
      paymentIntentId
    );
    return parseJsonRow(row) as ReceiptOffering | null;
  }

  const key = await env.AGAPAY_REGISTRATIONS!.get(stripePaymentIntentIndexKey(paymentIntentId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS!.get(key);
  return raw ? (JSON.parse(raw) as ReceiptOffering) : null;
}

export async function loadDonorOfferings(env: ModuleEnv, email: string, limit = 100) {
  if (d1(env)) {
    const rows = await d1All<ModuleRow>(
      env,
      'SELECT data FROM donor_offerings WHERE donor_email = ?1 ORDER BY created_at DESC LIMIT ?2',
      normalizeEmail(email),
      limit
    );
    return visibleDonationRecords(rows.map(parseJsonRow).filter(Boolean) as ReceiptOffering[]);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const prefix = donorOfferingKey(email, '');
  const keys = await listKvKeys(env, { prefix, limit });
  const offerings: ReceiptOffering[] = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS!.get(key.name);
    if (!raw) continue;
    try {
      offerings.push(JSON.parse(raw));
    } catch {
      // Ignore malformed donor offering records.
    }
  }
  return visibleDonationRecords(
    offerings.sort((a, b) => String(b!.createdAt || '').localeCompare(String(a!.createdAt || '')))
  );
}

export async function loadDonorCommemorations(env: ModuleEnv, email: string, limit = 100) {
  const normalized = normalizeEmail(email);
  if (d1(env)) {
    const rows = await d1All<ModuleRow>(
      env,
      'SELECT data FROM commemorations WHERE donor_email = ?1 ORDER BY created_at DESC LIMIT ?2',
      normalized,
      limit
    );
    return rows.map(parseJsonRow).filter(Boolean) as CommemorationRecord[];
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: COMMEMORATION_KEY_PREFIX, limit: Math.max(limit, 1000) });
  const entries: CommemorationRecord[] = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS!.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (normalizeEmail(entry.donorEmail) === normalized) entries.push(entry);
    } catch {
      // Ignore malformed commemoration records.
    }
  }
  return entries.sort((a, b) => String(b!.createdAt || '').localeCompare(String(a!.createdAt || '')));
}

import { paidOfferingStatus } from '../lib/paid-offering-status.js';
export { paidOfferingStatus } from '../lib/paid-offering-status.js';

export function stripeObjectMetadata(
  ...objects: (StripeOfferingObject | ReceiptOffering | StripeCharge | null | undefined)[]
) {
  return objects.reduce<Record<string, unknown>>(
    (metadata, object) => ({
      ...metadata,
      ...(object?.metadata || {}),
    }),
    {}
  );
}

export async function stripePaymentIntentFinancialUpdates(
  env: ModuleEnv,
  paymentIntentId: string,
  parishId: string,
  fallback: ReceiptOffering = {}
) {
  if (!paymentIntentId || !parishId) return {};
  const parish = await findCheckoutParish(env, parishId);
  if (!parish?.stripeAccountId) return {};

  const paymentIntent = await stripeGetConnectedRequest(
    env,
    `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`,
    parish.stripeAccountId
  );
  if (!paymentIntent.ok) return {};

  const intent = (paymentIntent.body as StripeOfferingObject) || {};
  let charge:
    | (StripeCharge & {
        payment_method_details?: { type?: string };
        disputed?: boolean;
        balance_transaction?: string | { id?: string; fee?: unknown; net?: unknown } | null;
      })
    | null = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  const chargeId = stripeObjectId(intent.latest_charge);
  if (!charge && chargeId) {
    const chargeResult = await stripeGetConnectedRequest(
      env,
      `/v1/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
      parish.stripeAccountId
    );
    if (chargeResult.ok) charge = (chargeResult.body as StripeCharge) || null;
  }

  const metadata = stripeObjectMetadata(fallback, intent, charge);
  const balanceTransaction = typeof charge?.balance_transaction === 'object' ? charge.balance_transaction : null;
  const giftAmountCents =
    numericCents(metadata.amount_cents) ||
    numericCents(fallback.giftAmountCents ?? fallback.amountCents) ||
    numericCents(intent.amount_received || intent.amount);
  const chargeCents = numericCents(
    charge?.amount || intent.amount_received || intent.amount || fallback.chargeCents || giftAmountCents
  );
  const agapayFeeCents = numericCents(
    charge?.application_fee_amount ?? metadata.agapay_fee_cents ?? fallback.agapayFeeCents
  );
  const balanceFeeCents = numericCents(balanceTransaction?.fee);
  const stripeFeeCents = balanceTransaction
    ? Math.max(0, balanceFeeCents - agapayFeeCents)
    : numericCents(fallback.stripeFeeCents ?? fallback.estimatedStripeFeeCents);
  const totalFeeCents = balanceTransaction ? balanceFeeCents : numericCents(stripeFeeCents + agapayFeeCents);
  const coverFees = booleanFromStripeMetadata(metadata.cover_fees, fallback.coverFees);
  const donorCoveredFeeCents = coverFees ? Math.max(0, chargeCents - giftAmountCents) : 0;
  const balanceNetCents = numericCents(balanceTransaction?.net);
  const parishNetCents = balanceTransaction ? balanceNetCents : Math.max(0, chargeCents - totalFeeCents);
  const paymentMethod = charge?.payment_method_details?.type || fallback.paymentMethod || '';

  return {
    amountCents: giftAmountCents,
    giftAmountCents,
    chargeCents,
    stripeFeeCents,
    estimatedStripeFeeCents: stripeFeeCents,
    agapayFeeCents,
    totalFeeCents,
    donorCoveredFeeCents,
    parishNetCents,
    coverFees,
    paymentMethod,
    stripeChargeId: charge?.id || fallback.stripeChargeId || '',
    stripeDisputed: charge?.disputed === true,
    stripeRefundedCents: numericCents(charge?.amount_refunded),
    stripeBalanceTransactionId: balanceTransaction?.id || fallback.stripeBalanceTransactionId || '',
    stripeFeeSource: balanceTransaction ? 'balance_transaction' : 'estimated',
    feeReconciledAt: new Date().toISOString(),
  };
}

export async function refreshDonorOfferingFromStripeCheckout(env: ModuleEnv, offering: ReceiptOffering = {}) {
  if (!offering.checkoutSessionId || paidOfferingStatus(offering)) return offering;

  const parish = await findCheckoutParish(env, offering.parishId!);
  if (!parish?.stripeAccountId) return offering;

  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(offering.checkoutSessionId!)}`,
    parish.stripeAccountId
  );
  if (!stripe.ok) return offering;

  const session = (stripe.body as StripeOfferingObject) || {};
  const setup = subscriptionSetupUpdates(session, offering);
  if (setup) return updateDonorOfferingByCheckout(env, offering.checkoutSessionId!, setup);
  const paymentStatus = normalizedCheckoutPaymentStatus(session, offering.paymentStatus);
  let status = offering.status || 'checkout_created';
  if (paymentStatus === 'paid') status = 'completed';
  if (session.status === 'expired') status = 'expired';
  const paymentIntentId = checkoutPaymentIntentId(session) || offering.stripePaymentIntentId || '';
  const feeUpdates =
    status === 'completed' || paymentStatus === 'paid'
      ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId!, offering)
      : {};

  const updated = await updateDonorOfferingByCheckout(env, offering.checkoutSessionId!, {
    status,
    paymentStatus,
    stripeCustomerId: session.customer || offering.stripeCustomerId || '',
    stripePaymentIntentId: paymentIntentId,
    stripeSubscriptionId: session.subscription || offering.stripeSubscriptionId || '',
    completedAt: status === 'completed' ? offering.completedAt || new Date().toISOString() : offering.completedAt || '',
    ...feeUpdates,
  });

  if (status === 'completed' || paymentStatus === 'paid') {
    await ensureCommemorationEntryFromOffering(env, updated || offering, {
      createdAt: session.created
        ? new Date(session.created * 1000).toISOString()
        : offering.createdAt || new Date().toISOString(),
    });
    await sendDonationReceiptIfNeeded(env, updated || offering);
  }

  return updated || offering;
}

export async function reconcilePendingDonorOfferings(env: ModuleEnv, offerings: ReceiptOffering[] = [], limit = 8) {
  const reconciled = [];
  let checked = 0;

  for (const offering of offerings) {
    if (
      checked < limit &&
      offering.checkoutSessionId &&
      !paidOfferingStatus(offering) &&
      !['failed', 'expired', 'cancelled', 'refunded'].includes(
        String(offering.paymentStatus || offering.status || '').toLowerCase()
      )
    ) {
      checked += 1;
      reconciled.push(await refreshDonorOfferingFromStripeCheckout(env, offering));
    } else {
      reconciled.push(offering);
    }
  }

  return reconciled.sort((a, b) => String(b!.createdAt || '').localeCompare(String(a!.createdAt || '')));
}

export function paidCommemorationOfferingWithNames(offering: ReceiptOffering = {}) {
  const giftType = String(offering.giftType || '').toLowerCase();
  if (giftType !== 'commemoration') return false;
  if (!paidOfferingStatus(offering)) return false;
  return Boolean(
    splitSubmittedNames(offering.namesLiving).length || splitSubmittedNames(offering.namesDeparted).length
  );
}

export async function repairMissingDonorCommemorationsFromOfferings(
  env: ModuleEnv,
  email: string,
  offerings: ReceiptOffering[] = []
) {
  const paidCommemorations = offerings.filter(paidCommemorationOfferingWithNames);
  if (!paidCommemorations.length) return [];

  const existing = await loadDonorCommemorations(env, email, Math.max(1000, paidCommemorations.length + 100));
  const existingSources = new Set(existing.map((entry) => entry.sourceId || entry.id).filter(Boolean));
  const repaired = [];

  for (const offering of paidCommemorations) {
    const sourceId = commemorationSourceIdFromOffering(offering);
    if (existingSources.has(sourceId)) continue;
    const entry = await ensureCommemorationEntryFromOffering(env, offering, {
      id: sourceId,
      checkoutSessionId: offering.checkoutSessionId || '',
      parishId: offering.parishId || '',
      parishName: offering.parishName || '',
      donorEmail: offering.donorEmail || email || '',
      donorName: offering.donorName || '',
      giftType: 'commemoration',
      frequency: offering.frequency || 'once',
      amountCents: offering.amountCents || 0,
      namesLiving: offering.namesLiving || '',
      namesDeparted: offering.namesDeparted || '',
      createdAt: offering.completedAt || offering.createdAt || new Date().toISOString(),
    });
    if (entry) {
      existingSources.add(entry.sourceId || entry.id);
      repaired.push(entry);
    }
  }

  return repaired;
}

export async function loadReconciledDonorCommemorations(
  env: ModuleEnv,
  email: string,
  offerings: ReceiptOffering[] | null = null,
  limit = 100
) {
  const donorOfferings = offerings || (await loadDonorOfferings(env, email, Math.max(limit, 100)));
  await repairMissingDonorCommemorationsFromOfferings(env, email, donorOfferings);
  return loadDonorCommemorations(env, email, limit);
}

export function donorSummaryFromOfferings(offerings: ReceiptOffering[], commemorations: CommemorationRecord[] = []) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const ytd = offerings.filter((item) => new Date(item.createdAt || 0).getUTCFullYear() === year);
  const paid = ytd.filter(paidOfferingStatus);
  const recurring = offerings.filter((item) => item.frequency && item.frequency !== 'once');
  const ytdCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  const parishNetYtdCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).parishNetCents, 0);
  const feeSavingsCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).donorCoveredFeeCents, 0);
  const feeCoveredCount = paid.filter((item) => offeringFeeBreakdown(item).coverFees).length;
  // "Stewardship" giving = tithes / general parish offerings only. Excludes designated
  // funds, campaigns, candles, and commemorations — those are separate offering types
  // and should not count toward a donor's annual pledge progress. Offerings without a
  // giftType predate giftType tracking and are treated as stewardship, matching how
  // they're normalized everywhere else in the app.
  const isStewardshipOffering = (item: ReceiptOffering) =>
    ['stewardship', 'general'].includes(String(item.giftType || 'stewardship').toLowerCase());
  const stewardshipPaid = paid.filter(isStewardshipOffering);
  const stewardshipYtdCents = stewardshipPaid.reduce(
    (sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents,
    0
  );
  const monthCents = paid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  const parishNetMonthCents = paid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).parishNetCents, 0);
  const stewardshipMonthCents = stewardshipPaid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  return {
    year,
    ytdCents,
    monthCents,
    parishNetYtdCents,
    parishNetMonthCents,
    stewardshipYtdCents,
    stewardshipMonthCents,
    feeSavingsCents,
    feeCoveragePercent: paid.length ? Math.round((feeCoveredCount / paid.length) * 100) : 0,
    offeringCount: ytd.length,
    paidOfferingCount: paid.length,
    recurringCount: recurring.length,
    commemorationCount: commemorations.reduce(
      (sum, entry) => sum + (entry.living?.length || 0) + (entry.departed?.length || 0),
      0
    ),
    lastOfferingAt: offerings[0]?.createdAt || '',
  };
}

export function publicDonorOffering(offering: ReceiptOffering = {}) {
  const fees = offeringFeeBreakdown(offering);
  return {
    ...offering,
    amountCents: fees.giftAmountCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    parishNetCents: fees.parishNetCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
  };
}
