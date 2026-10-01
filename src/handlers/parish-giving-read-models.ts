import { visibleDonationRecords } from '../payments/donation-visibility.js';
// src/handlers/parish-giving-read-models.js
// Paid and recurring giving read models for parish dashboards.

import { d1All, type DatabaseReadEnv } from '../lib/database-reads.js';
import { DONOR_OFFERING_KEY_PREFIX, listKvKeys, type KvReadEnv } from '../lib/kv-reads.js';
import { parseJsonRow } from '../lib/json-rows.js';
import type { RecurringGiftInput } from '../lib/recurring-health.js';
import type { DonationVisibilityRecord } from '../payments/donation-visibility.js';
import type { PaidOfferingStatusInput } from '../lib/paid-offering-status.js';
import type { PublicParishGift } from '../lib/public-gift-model.js';
export type GivingReadEnv = DatabaseReadEnv & KvReadEnv;
export interface StoredGivingRecord extends RecurringGiftInput, DonationVisibilityRecord {
  readonly parishId?: unknown;
  readonly parish_id?: unknown;
}
interface GivingDatabaseRow {
  readonly id: string;
  readonly data: string | null;
  readonly status: unknown;
  readonly payment_status: unknown;
  readonly stripe_subscription_id?: string | null;
  readonly created_at: string;
  readonly updated_at: string | null;
}

import { publicParishGiftFromOffering } from '../lib/public-gift-model.js';
export { giftDisplayName, publicParishGiftFromOffering } from '../lib/public-gift-model.js';
import { paidOfferingStatus } from '../lib/paid-offering-status.js';

function d1(env: GivingReadEnv | null | undefined): D1Database | null {
  return env?.AGAPAY_DB || null;
}

export function paidOffering(offering: PaidOfferingStatusInput | undefined): boolean {
  return paidOfferingStatus(offering);
}

export async function loadParishPaidOfferings(
  env: GivingReadEnv,
  parishId: string,
  limit = 500
): Promise<PublicParishGift[]> {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All<GivingDatabaseRow>(
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
    return (
      rows
        .map((row) => {
          const offering = parseJsonRow(row) as StoredGivingRecord | null;
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
        .filter(Boolean) as StoredGivingRecord[]
    )
      .filter(paidOffering)
      .map(publicParishGiftFromOffering);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const gifts: PublicParishGift[] = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw) as StoredGivingRecord;
      if ((offering.parishId || offering.parish_id) === parishId && paidOffering(offering)) {
        gifts.push(publicParishGiftFromOffering(offering));
      }
    } catch {}
  }
  return gifts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

export async function loadParishRecurringOfferings(
  env: GivingReadEnv,
  parishId: string,
  limit = 1000
): Promise<StoredGivingRecord[]> {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All<GivingDatabaseRow>(
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
          const offering = parseJsonRow(row) as StoredGivingRecord | null;
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
        .filter(Boolean) as StoredGivingRecord[]
    );
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const offerings: StoredGivingRecord[] = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw) as StoredGivingRecord;
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
