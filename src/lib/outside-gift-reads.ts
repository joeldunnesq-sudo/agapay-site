import { OutsideGiftError } from './outside-gift-error.js';
import { createFundAllocationResolver, type FundCatalog, type FundDesignation } from './fund-allocation.js';
import type { DatabaseReadEnv } from './database-reads.js';

export interface OutsideGiftRow {
  readonly id: string;
  readonly parish_id: string;
  readonly entry_date: string;
  readonly source: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly giver_name: string;
  readonly giver_email: string;
  readonly fund_id: string;
  readonly request_key: string;
  readonly request_hash: string;
  readonly duplicate_reason: string;
  readonly updated_by: string;
  readonly source_label: string | null;
  readonly fund_code: string | null;
  readonly notes: string | null;
  readonly entered_by: string | null;
  readonly batch_reference: string | null;
  readonly giver_reference_id: string | null;
  readonly giver_data: string | null;
  readonly accounting_entity_id: string | null;
  readonly accounting_entry_id: string | null;
  readonly accounting_line_id: string | null;
  readonly accounting_linked_by: string | null;
  readonly accounting_linked_at: string | null;
  readonly void_reason: string | null;
  readonly voided_at: string | null;
  readonly amount_cents: number;
  readonly giving_kind: 'pledge' | 'other';
  readonly pledge_year: number | null;
  readonly record_state: 'active' | 'void';
  readonly revision: number;
}
interface StoredGiver {
  readonly parishId?: unknown;
  readonly firstName?: unknown;
  readonly lastName?: unknown;
  readonly donorName?: string | null;
  readonly email?: string | null;
  readonly donorEmail?: string | null;
}
export interface OutsideGiftReadOptions {
  readonly start?: string;
  readonly end?: string;
  readonly includeVoided?: boolean;
  readonly limit?: number;
}
export type OutsideGivingGift = Awaited<ReturnType<typeof outsideGiftDto>>;

export async function outsideGiver(
  db: D1Database,
  parishId: string,
  referenceId: string | null | undefined
): Promise<{ name: string; email: string; referenceId: string }> {
  if (!referenceId) return { name: 'Anonymous / unassigned', email: '', referenceId: '' };
  const row = await db
    .prepare(
      "SELECT id,data FROM donor_offerings WHERE id=? AND parish_id=? AND (payment_status IN ('paid','succeeded') OR status IN ('paid','complete','completed'))"
    )
    .bind(referenceId, parishId)
    .first<{ id: string; data: string }>();
  if (!row) throw new OutsideGiftError('Choose a giver from this parish.');
  const gift = JSON.parse(row.data) as StoredGiver;
  if (gift.parishId && gift.parishId !== parishId)
    throw new OutsideGiftError('The giver record belongs to another parish.');
  return {
    name: [gift.firstName, gift.lastName].filter(Boolean).join(' ') || gift.donorName || 'Unnamed giver',
    email: gift.email || gift.donorEmail || '',
    referenceId: row.id,
  };
}

export const OUTSIDE_SELECT = `SELECT m.*,d.giver_reference_id,d.giver_name,d.giver_email,o.data giver_data,d.fund_id,d.giving_kind,d.pledge_year,d.record_state,d.revision,d.request_key,d.request_hash,d.duplicate_reason,
 d.accounting_entity_id,d.accounting_entry_id,d.accounting_line_id,d.accounting_linked_by,d.accounting_linked_at,d.updated_by,d.void_reason,d.voided_at
 FROM manual_income_entries m JOIN outside_gift_details d ON d.gift_id=m.id AND d.parish_id=m.parish_id
 LEFT JOIN donor_offerings o ON o.id=d.giver_reference_id AND o.parish_id=m.parish_id`;
export async function outsideGiftRow(db: D1Database, parishId: string, id: string): Promise<OutsideGiftRow | null> {
  return db
    .prepare(OUTSIDE_SELECT + ' WHERE m.parish_id=? AND m.id=?')
    .bind(parishId, id)
    .first<OutsideGiftRow>();
}
export async function outsideGiftDto(db: D1Database, row: OutsideGiftRow, registration: FundCatalog | undefined) {
  const original: StoredGiver = row.giver_data ? JSON.parse(row.giver_data) : {};
  const giver = {
    referenceId: row.giver_reference_id || '',
    name:
      [original.firstName, original.lastName].filter(Boolean).join(' ') ||
      original.donorName ||
      row.giver_name ||
      'Anonymous / unassigned',
    email: original.email || original.donorEmail || row.giver_email || '',
  };
  const fund = createFundAllocationResolver(registration)({
    givingKind: row.giving_kind,
    pledgeYear: row.pledge_year,
    fundId: row.fund_id,
    fund: row.fund_code,
  } as FundDesignation);
  return {
    id: row.id,
    date: row.entry_date + 'T12:00:00',
    createdAt: row.entry_date + 'T12:00:00',
    receivedDate: row.entry_date,
    amountCents: row.amount_cents,
    giftAmountCents: row.amount_cents,
    // This is contribution value, not a claim about external processor fees or bank net.
    parishNetCents: null,
    donorName: giver.name,
    donorEmail: giver.email,
    giverReferenceId: giver.referenceId,
    giverKey: giver.email
      ? 'email:' + giver.email.trim().toLowerCase()
      : giver.referenceId
        ? 'gift:' + giver.referenceId
        : 'outside:unassigned',
    givingKind: row.giving_kind,
    pledgeYear: row.pledge_year,
    fundId: row.fund_id,
    fund: fund?.label || row.fund_code,
    originalFund: row.fund_code,
    source: 'outside' as const,
    sourceLabel: row.source_label,
    contributionSource: row.source,
    reference: row.batch_reference || '',
    notes: row.notes || '',
    description: [row.source_label, row.batch_reference].filter(Boolean).join(' · '),
    currency: 'usd' as const,
    type: 'one_time' as const,
    recurring: false as const,
    giftType: 'outside' as const,
    recordState: row.record_state,
    revision: row.revision,
    enteredBy: row.entered_by,
    updatedBy: row.updated_by,
    recordedAt: row.created_at,
    updatedAt: row.updated_at,
    accounting: {
      entityId: row.accounting_entity_id || '',
      linked: Boolean(row.accounting_line_id),
      entryId: row.accounting_entry_id || '',
      lineId: row.accounting_line_id || '',
      linkedAt: row.accounting_linked_at || '',
    },
    voidReason: row.void_reason || '',
    voidedAt: row.voided_at || '',
  };
}

export async function loadOutsideGiftRows(
  db: D1Database,
  parishId: string,
  { start = '1900-01-01', end = '2199-12-31', includeVoided = false, limit = 25000 }: OutsideGiftReadOptions = {}
): Promise<OutsideGiftRow[]> {
  const result = await db
    .prepare(
      OUTSIDE_SELECT +
        ` WHERE m.parish_id=? AND m.entry_date>=? AND m.entry_date<=? ${includeVoided ? '' : "AND d.record_state='active' AND m.contribution_eligible=1"} ORDER BY m.entry_date DESC,m.id LIMIT ?`
    )
    .bind(parishId, start, end, limit + 1)
    .all<OutsideGiftRow>();
  if (result.results.length > limit)
    throw new OutsideGiftError(
      'This period exceeds the complete outside-gift report limit. Choose a shorter period.',
      413
    );
  return result.results;
}

export async function outsideGiftsForGiving(
  env: DatabaseReadEnv,
  parishId: string,
  registration: FundCatalog | undefined,
  options: OutsideGiftReadOptions = {}
): Promise<OutsideGivingGift[]> {
  if (!env.AGAPAY_DB) return [];
  let rows;
  try {
    rows = await loadOutsideGiftRows(env.AGAPAY_DB, parishId, options);
  } catch (error) {
    // The migration is additive; existing fixtures/older deployments may not have this feature yet.
    if (
      /no such table: (outside_gift_details|manual_income_entries)/i.test((error as { message?: string }).message || '')
    )
      return [];
    throw error;
  }
  return Promise.all(rows.map((row) => outsideGiftDto(env.AGAPAY_DB!, row, registration)));
}
