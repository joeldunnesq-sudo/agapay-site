import type { StripeChargeClassificationInput } from './payment-classification.js';
export interface StripeRequestEnv {
  readonly STRIPE_SECRET_KEY?: string | null;
}
// Stripe JSON is described at the transport boundary; this is not runtime validation.
export interface StripeResponseBody {
  [field: string]: unknown;
  error?: { message?: string };
  data?: unknown;
  has_more?: unknown;
}
export interface StripeApiResponse {
  ok: boolean;
  status: number;
  body: StripeResponseBody;
}
export type StripeObjectReference = string | { id?: string | null } | null | undefined;
export interface StripeCheckoutSession {
  payment_status?: string | null;
  status?: unknown;
  payment_intent?: StripeObjectReference;
}
export interface StripeCharge extends StripeChargeClassificationInput {
  id?: string;
  amount_captured?: unknown;
  amount?: unknown;
  amount_refunded?: unknown;
  currency?: unknown;
  status?: unknown;
  paid?: unknown;
  created?: unknown;
  application_fee_amount?: unknown;
  balance_transaction?: string | { fee?: unknown; net?: unknown } | null;
  billing_details?: { email?: unknown } | null;
  receipt_email?: unknown;
  customer?: unknown;
  payment_method?: unknown;
}
export interface StripeAccountReadiness {
  payouts_enabled?: unknown;
  charges_enabled?: unknown;
  details_submitted?: unknown;
  requirements?: { disabled_reason?: unknown } | null;
}

import { monthLabel } from './format.js';
import { estimateStripeAchFeeCents, estimateStripeProcessingFeeCents } from './payment-fees.js';
import { classifyStripeCharge } from './payment-classification.js';

import { numericCents } from './numeric-cents.js';
export { numericCents } from './numeric-cents.js';

export async function stripeFormRequest(
  env: StripeRequestEnv,
  path: string,
  form: BodyInit | null,
  method = 'POST'
): Promise<StripeApiResponse> {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 500, body: { error: { message: 'STRIPE_SECRET_KEY is not configured' } } };
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const body = (await response.json()) as StripeResponseBody;
  return { ok: response.ok, status: response.status, body };
}

export async function stripeGetRequest(env: StripeRequestEnv, path: string): Promise<StripeApiResponse> {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 500, body: { error: { message: 'STRIPE_SECRET_KEY is not configured' } } };
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  const body = (await response.json()) as StripeResponseBody;
  return { ok: response.ok, status: response.status, body };
}

export async function stripeGetConnectedRequest(
  env: StripeRequestEnv,
  path: string,
  stripeAccountId: string
): Promise<StripeApiResponse> {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 500, body: { error: { message: 'STRIPE_SECRET_KEY is not configured' } } };
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Account': stripeAccountId,
    },
  });
  const body = (await response.json()) as StripeResponseBody;
  return { ok: response.ok, status: response.status, body };
}

export async function stripeFormConnectedRequest(
  env: StripeRequestEnv,
  path: string,
  form: BodyInit | null,
  stripeAccountId: string,
  method = 'POST'
): Promise<StripeApiResponse> {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 500, body: { error: { message: 'STRIPE_SECRET_KEY is not configured' } } };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (stripeAccountId) headers['Stripe-Account'] = stripeAccountId;
  const response = await fetch(`https://api.stripe.com${path}`, { method, headers, body: form });
  const body = (await response.json()) as StripeResponseBody;
  return { ok: response.ok, status: response.status, body };
}

export function stripeAccountStatus(account: StripeAccountReadiness = {}) {
  if (account.payouts_enabled) return 'payouts_enabled';
  if (account.charges_enabled) return 'charges_enabled';
  if (account.requirements?.disabled_reason) return 'restricted';
  if (account.details_submitted) return 'onboarding';
  return 'invited';
}

export function stripeReady(registration: { stripeAccountStatus?: string | null } = {}) {
  return ['charges_enabled', 'payouts_enabled'].includes(registration.stripeAccountStatus as string);
}

export function normalizedCheckoutPaymentStatus(session: StripeCheckoutSession = {}, fallback = 'pending') {
  if (session.payment_status === 'paid') return 'paid';
  if (session.status === 'expired') return session.payment_status || 'unpaid';
  return session.payment_status || fallback || 'pending';
}

export function checkoutPaymentIntentId(session: StripeCheckoutSession = {}) {
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '';
}

export function stripeObjectId(value: StripeObjectReference): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.id || '';
}

export function booleanFromStripeMetadata(value: unknown, fallback: unknown = false): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return Boolean(fallback);
}

function startOfYearUnix(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0) / 1000);
}

export async function listYtdStripeCharges(env: StripeRequestEnv, stripeAccountId: string) {
  const charges: StripeCharge[] = [];
  let startingAfter: string | undefined = '';
  let pages = 0;
  do {
    const params = new URLSearchParams({
      limit: '100',
      'created[gte]': String(startOfYearUnix()),
    });
    params.append('expand[]', 'data.balance_transaction');
    if (startingAfter) params.set('starting_after', startingAfter);
    const result = await stripeGetConnectedRequest(env, `/v1/charges?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;
    const data: StripeCharge[] = Array.isArray(result.body.data) ? result.body.data : [];
    charges.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : '';
    pages += 1;
    if (!result.body.has_more || !startingAfter || pages >= 5) break;
  } while (true);
  return { ok: true, body: { data: charges } };
}

export function summarizeCharges(charges: readonly StripeCharge[]) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    amountCents: 0,
    agapayFeeCents: 0,
    grossGiftCents: 0,
    giftCount: 0,
  }));
  const givers = new Set();
  let ytdCents = 0;
  let grossGiftCents = 0;
  let donorCoveredFeeCents = 0;
  let feesAbsorbedCents = 0;
  let coverFeesCount = 0;
  let giftCount = 0;
  let lastGiftAt = '';
  for (const charge of charges) {
    if (charge.status !== 'succeeded' || charge.paid === false) continue;
    if (classifyStripeCharge(charge).paymentClass !== 'qualifying_donation') continue;
    const created = new Date(((charge.created || 0) as number) * 1000);
    if (created.getUTCFullYear() !== year) continue;
    const chargeCents = numericCents(charge.amount_captured || charge.amount);
    const refundedCents = numericCents(charge.amount_refunded);
    const metadataGiftCents = numericCents(charge.metadata?.amount_cents);
    const coverFees = String(charge.metadata?.cover_fees || '').toLowerCase() === 'true';
    const paymentMethod = charge.metadata?.payment_method || '';
    const balanceTransaction = typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    const agapayFeeCents = numericCents(charge.application_fee_amount || charge.metadata?.agapay_fee_cents);
    const balanceFeeCents = balanceTransaction ? numericCents(balanceTransaction.fee) : 0;
    const stripeFeeCents = balanceTransaction
      ? Math.max(0, balanceFeeCents - agapayFeeCents)
      : paymentMethod === 'ach'
        ? estimateStripeAchFeeCents(chargeCents)
        : estimateStripeProcessingFeeCents(chargeCents);
    const totalFeeCents = Math.max(0, stripeFeeCents + agapayFeeCents);
    const giftCents = metadataGiftCents || Math.max(0, chargeCents - (coverFees ? totalFeeCents : 0));
    const netCents = balanceTransaction
      ? Math.max(0, numericCents(balanceTransaction.net) - refundedCents)
      : Math.max(0, chargeCents - refundedCents - totalFeeCents);
    if (!netCents) continue;
    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].agapayFeeCents += agapayFeeCents;
    monthly[monthIndex].grossGiftCents += giftCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    grossGiftCents += giftCents;
    if (coverFees) {
      coverFeesCount += 1;
      donorCoveredFeeCents += Math.max(0, chargeCents - giftCents);
    } else {
      feesAbsorbedCents += totalFeeCents;
    }
    giftCount += 1;
    const giverKey =
      charge.billing_details?.email || charge.receipt_email || charge.customer || charge.payment_method || charge.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    const createdIso = created.toISOString();
    if (!lastGiftAt || createdIso > lastGiftAt) lastGiftAt = createdIso;
  }
  return {
    year,
    currency: 'usd',
    ytdCents,
    grossGiftCents,
    donorCoveredFeeCents,
    feesAbsorbedCents,
    feeCoveragePercent: giftCount ? Math.round((coverFeesCount / giftCount) * 100) : 0,
    giftCount,
    giverCount: givers.size,
    averageGiftCents: giftCount ? Math.round(ytdCents / giftCount) : 0,
    lastGiftAt,
    monthly,
  };
}
