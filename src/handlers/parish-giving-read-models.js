import { visibleDonationRecords } from '../payments/donation-events.js';
// src/handlers/parish-giving-read-models.js
// Paid and recurring giving read models for parish dashboards.

import { DONOR_OFFERING_KEY_PREFIX, d1All, listKvKeys, parseJsonRow } from '../lib/core.js';
import { publicParishGiftFromOffering } from '../lib/public-gift-model.js';
export { giftDisplayName, publicParishGiftFromOffering } from '../lib/public-gift-model.js';
import { paidOfferingStatus } from './parish-donor-offerings.js';

function d1(env) {
  return env?.AGAPAY_DB || null;
}

export function paidOffering(offering) {
  return paidOfferingStatus(offering);
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
    return visibleDonationRecords(
      rows
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
        .filter(Boolean)
    );
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
  return visibleDonationRecords(
    offerings.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, limit)
  );
}

export {
  recurringOfferingStatus,
  recurringHealthGroupKey,
  recurringExpectedDays,
  summarizeParishRecurringHealth,
} from '../lib/recurring-health.js';
