// src/handlers/parish-giving-read-models.js
// Paid and recurring giving read models for parish dashboards.

import { DONOR_OFFERING_KEY_PREFIX, d1All, listKvKeys, normalizeEmail, parseJsonRow } from '../lib/core.js';
import { offeringFeeBreakdown } from '../lib/stripe-fees.js';
import { paidOfferingStatus } from './parish-donor-offerings.js';

function d1(env) {
  return env?.AGAPAY_DB || null;
}

export function paidOffering(offering) {
  return paidOfferingStatus(offering);
}

export function giftDisplayName(offering = {}) {
  const pieces = [offering.firstName, offering.lastName].filter(Boolean);
  return pieces.join(' ').trim() || offering.donorName || '';
}

export function publicParishGiftFromOffering(offering = {}) {
  const living = Array.isArray(offering.living)
    ? offering.living
    : String(offering.namesLiving || '')
        .split(/\n+/)
        .map((name) => name.trim())
        .filter(Boolean);
  const departed = Array.isArray(offering.departed)
    ? offering.departed
    : String(offering.namesDeparted || '')
        .split(/\n+/)
        .map((name) => name.trim())
        .filter(Boolean);
  const fees = offeringFeeBreakdown(offering);
  return {
    id: offering.id || offering.checkoutSessionId || offering.paymentIntentId || '',
    date: offering.createdAt || offering.paidAt || offering.updatedAt || '',
    createdAt: offering.createdAt || offering.paidAt || offering.updatedAt || '',
    amountCents: fees.parishNetCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    parishNetCents: fees.parishNetCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
    donorName: giftDisplayName(offering),
    donorEmail: offering.email || offering.donorEmail || '',
    fund: ['stewardship', 'general'].includes(String(offering.giftType || '').toLowerCase())
      ? 'General Operating Fund'
      : offering.fund || offering.fundId || '',
    fundId: ['stewardship', 'general'].includes(String(offering.giftType || '').toLowerCase())
      ? 'general'
      : offering.fundId || offering.fund || '',
    campaign: offering.campaign || offering.campaignId || '',
    campaignId: offering.campaignId || offering.campaign || '',
    description: offering.description || offering.campaignDescription || offering.inMemoriam || '',
    giftType: offering.giftType || 'offering',
    frequency: offering.frequency || 'once',
    recurring: Boolean(offering.frequency && offering.frequency !== 'once'),
    type: offering.frequency && offering.frequency !== 'once' ? 'recurring' : 'one_time',
    commemorationNames: [...living, ...departed],
    commemorationKind: offering.commemorationKind || '',
  };
}

export async function loadParishPaidOfferings(env, parishId, limit = 500) {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT id, data, status, payment_status, created_at, updated_at
       FROM donor_offerings
       WHERE parish_id = ?1
          AND (payment_status IN ('paid', 'succeeded') OR status IN ('paid', 'complete', 'completed'))
       ORDER BY created_at DESC
       LIMIT ?2`,
      parishId,
      limit
    );
    return rows
      .map((row) => {
        const offering = parseJsonRow(row);
        if (!offering) return null;
        return {
          ...offering,
          id: offering.id || row.id || '',
          status: offering.status || row.status || '',
          paymentStatus: offering.paymentStatus || row.payment_status || '',
          createdAt: offering.createdAt || row.created_at || '',
          updatedAt: offering.updatedAt || row.updated_at || '',
        };
      })
      .filter(Boolean)
      .filter(paidOffering)
      .map(publicParishGiftFromOffering);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const gifts = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if ((offering.parishId || offering.parish_id) === parishId && paidOffering(offering)) {
        gifts.push(publicParishGiftFromOffering(offering));
      }
    } catch {}
  }
  return gifts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

export function recurringOfferingStatus(offering = {}) {
  const status = String(offering.status || '').toLowerCase();
  const paymentStatus = String(offering.paymentStatus || '').toLowerCase();
  if (['failed', 'payment_failed', 'past_due'].includes(status) || ['failed', 'past_due'].includes(paymentStatus))
    return 'failed';
  if (['cancelled', 'canceled'].includes(status) || ['cancelled', 'canceled'].includes(paymentStatus))
    return 'cancelled';
  if (paidOfferingStatus(offering)) return 'active';
  return 'pending';
}

export function recurringHealthGroupKey(offering = {}) {
  return (
    offering.stripeSubscriptionId ||
    offering.stripe_subscription_id ||
    [
      normalizeEmail(offering.donorEmail || offering.email || ''),
      offering.frequency || 'recurring',
      offering.amountCents || '',
      offering.giftType || '',
      offering.fund || '',
      offering.campaign || '',
    ].join('|')
  );
}

export function recurringExpectedDays(frequency = '') {
  const normalized = String(frequency || '').toLowerCase();
  if (normalized === 'weekly') return 10;
  if (normalized === 'biweekly') return 24;
  if (normalized === 'quarterly') return 110;
  if (normalized === 'yearly' || normalized === 'annual') return 400;
  return 45;
}

export async function loadParishRecurringOfferings(env, parishId, limit = 1000) {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT id, data, status, payment_status, stripe_subscription_id, created_at, updated_at
       FROM donor_offerings
       WHERE parish_id = ?1
         AND (
           COALESCE(stripe_subscription_id, '') != ''
           OR COALESCE(json_extract(data, '$.frequency'), 'once') != 'once'
         )
       ORDER BY created_at DESC
       LIMIT ?2`,
      parishId,
      limit
    );
    return rows
      .map((row) => {
        const offering = parseJsonRow(row);
        if (!offering) return null;
        return {
          ...offering,
          id: offering.id || row.id || '',
          status: offering.status || row.status || '',
          paymentStatus: offering.paymentStatus || row.payment_status || '',
          stripeSubscriptionId: offering.stripeSubscriptionId || row.stripe_subscription_id || '',
          createdAt: offering.createdAt || row.created_at || '',
          updatedAt: offering.updatedAt || row.updated_at || '',
        };
      })
      .filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const offerings = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if (
        (offering.parishId || offering.parish_id) === parishId &&
        (offering.stripeSubscriptionId || (offering.frequency && offering.frequency !== 'once'))
      ) {
        offerings.push(offering);
      }
    } catch {}
  }
  return offerings.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, limit);
}

export function summarizeParishRecurringHealth(records = []) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const groups = new Map();

  for (const offering of records) {
    const key = recurringHealthGroupKey(offering);
    if (!key) continue;
    const status = recurringOfferingStatus(offering);
    const dateValue = offering.completedAt || offering.failedAt || offering.updatedAt || offering.createdAt || '';
    const timestamp = dateValue ? new Date(dateValue) : null;
    const group = groups.get(key) || {
      key,
      donorName: giftDisplayName(offering) || offering.donorName || 'Anonymous donor',
      donorEmail: offering.donorEmail || offering.email || '',
      amountCents: Number(offering.amountCents || 0),
      frequency: offering.frequency || 'recurring',
      giftType: offering.giftType || 'recurring',
      fund: offering.fund || offering.campaign || offering.title || '',
      stripeSubscriptionId: offering.stripeSubscriptionId || '',
      lastPaidAt: '',
      lastFailureAt: '',
      failureMessage: '',
    };

    if (!group.stripeSubscriptionId && offering.stripeSubscriptionId)
      group.stripeSubscriptionId = offering.stripeSubscriptionId;
    if (!group.donorEmail && offering.donorEmail) group.donorEmail = offering.donorEmail;
    if (!group.fund && (offering.fund || offering.campaign || offering.title))
      group.fund = offering.fund || offering.campaign || offering.title;
    if (!group.amountCents && offering.amountCents) group.amountCents = Number(offering.amountCents || 0);

    if (status === 'active' && timestamp && (!group.lastPaidAt || timestamp > new Date(group.lastPaidAt))) {
      group.lastPaidAt = timestamp.toISOString();
      group.amountCents = Number(offering.amountCents || group.amountCents || 0);
    }
    if (
      (status === 'failed' || status === 'cancelled') &&
      timestamp &&
      (!group.lastFailureAt || timestamp > new Date(group.lastFailureAt))
    ) {
      group.lastFailureAt = timestamp.toISOString();
      group.failureMessage =
        offering.failureMessage || (status === 'cancelled' ? 'Recurring gift cancelled.' : 'Recurring payment failed.');
    }

    groups.set(key, group);
  }

  const rows = Array.from(groups.values()).map((group) => {
    const paidAt = group.lastPaidAt ? new Date(group.lastPaidAt) : null;
    const failureAt = group.lastFailureAt ? new Date(group.lastFailureAt) : null;
    const expectedDays = recurringExpectedDays(group.frequency);
    const daysSincePaid = paidAt ? Math.floor((now.getTime() - paidAt.getTime()) / 86400000) : null;
    const recoveredAfterFailure = Boolean(paidAt && failureAt && paidAt > failureAt);
    const failedThisMonth = Boolean(failureAt && failureAt >= monthStart && !recoveredAfterFailure);
    const lapsed = Boolean(!failedThisMonth && (!paidAt || daysSincePaid > expectedDays));
    return {
      ...group,
      status: failedThisMonth ? 'failed' : lapsed ? 'lapsed' : 'active',
      daysSincePaid,
      expectedDays,
    };
  });

  rows.sort((a, b) => {
    const order = { failed: 0, lapsed: 1, active: 2 };
    return (
      (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
      String(b.lastFailureAt || b.lastPaidAt || '').localeCompare(String(a.lastFailureAt || a.lastPaidAt || ''))
    );
  });

  return {
    activeCount: rows.filter((row) => row.status === 'active').length,
    failedThisMonthCount: rows.filter((row) => row.status === 'failed').length,
    lapsedCount: rows.filter((row) => row.status === 'lapsed').length,
    monthlyRecurringCents: rows
      .filter((row) => row.status === 'active')
      .reduce((sum, row) => sum + Number(row.amountCents || 0), 0),
    generatedAt: now.toISOString(),
    rows,
  };
}
