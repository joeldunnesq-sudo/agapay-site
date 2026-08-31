// Individual outside contributions extend the existing manual contribution register.
// Nothing here creates a Stripe object or an Accounting journal.
import { createFundAllocationResolver } from './fund-reporting.js';

export class OutsideGiftError extends Error {
  constructor(message, status = 422, code = 'outside_gift_invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const OUTSIDE_SOURCES = Object.freeze({
  cash: 'Cash',
  check: 'Check',
  tithely: 'Tithe.ly',
  paypal: 'PayPal',
  other_giving_platform: 'Other giving platform',
});
const sourceCode = (source) => (['cash', 'check'].includes(source) ? 'cash_and_checks' : source);
const clean = (value, max) =>
  String(value || '')
    .trim()
    .slice(0, max);
export async function outsideDigest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}
export function outsideContent(input) {
  return JSON.stringify([
    input.entryDate,
    input.amountCents,
    input.source,
    input.sourceLabel,
    input.fundId,
    input.giverReferenceId,
    input.reference,
  ]);
}
export function outsideGiftInput(body, registration, now = new Date()) {
  const entryDate = clean(body.entryDate, 20);
  const timezone = registration.timezone || 'UTC';
  let today;
  try {
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    today = now.toISOString().slice(0, 10);
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) ||
    !Number.isFinite(Date.parse(entryDate)) ||
    new Date(entryDate).toISOString().slice(0, 10) !== entryDate ||
    entryDate > today ||
    entryDate < '1900-01-01'
  )
    throw new OutsideGiftError('Choose a valid received date, no later than today.');
  if (!Number.isSafeInteger(body.amountCents) || body.amountCents <= 0 || body.amountCents > 1000000000)
    throw new OutsideGiftError('Enter an exact amount between $0.01 and $10,000,000.');
  const givingKind = clean(body.givingKind, 20);
  if (!['pledge', 'other'].includes(givingKind)) throw new OutsideGiftError('Choose pledge payment or other giving.');
  const pledgeYear = givingKind === 'pledge' ? Number(body.pledgeYear) : null;
  if (
    givingKind === 'pledge' &&
    (!Number.isInteger(pledgeYear) || pledgeYear < 1900 || pledgeYear > 2199 || !body.giverReferenceId)
  )
    throw new OutsideGiftError('Pledge payments require an identified giver and a valid pledge year.');
  const source = clean(body.source, 40);
  if (!Object.hasOwn(OUTSIDE_SOURCES, source)) throw new OutsideGiftError('Choose a contribution source.');
  const fundId = clean(body.fundId, 160);
  const matches = (registration.funds || []).filter(
    (f) => String(f.id || f.code) === fundId && f.enabled !== false && f.active !== false
  );
  if (!fundId || matches.length !== 1) throw new OutsideGiftError('Choose an active fund from Funds & Alms.');
  const platform = clean(body.sourceLabel, 60);
  if (source === 'other_giving_platform' && !platform) throw new OutsideGiftError('Enter the giving platform name.');
  return {
    givingKind,
    pledgeYear,
    entryDate,
    amountCents: body.amountCents,
    source: sourceCode(source),
    sourceLabel: source === 'other_giving_platform' ? platform : OUTSIDE_SOURCES[source],
    fundId,
    fundName: clean(matches[0].name || fundId, 160),
    giverReferenceId: clean(body.giverReferenceId, 200),
    reference: clean(body.reference, 120),
    notes: clean(body.notes, 500),
  };
}

export async function outsideGiver(db, parishId, referenceId) {
  if (!referenceId) return { name: 'Anonymous / unassigned', email: '', referenceId: '' };
  const row = await db
    .prepare(
      "SELECT id,data FROM donor_offerings WHERE id=? AND parish_id=? AND (payment_status IN ('paid','succeeded') OR status IN ('paid','complete','completed'))"
    )
    .bind(referenceId, parishId)
    .first();
  if (!row) throw new OutsideGiftError('Choose a giver from this parish.');
  const gift = JSON.parse(row.data);
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
export async function outsideGiftRow(db, parishId, id) {
  return db
    .prepare(OUTSIDE_SELECT + ' WHERE m.parish_id=? AND m.id=?')
    .bind(parishId, id)
    .first();
}
export async function outsideGiftDto(db, row, registration) {
  const original = row.giver_data ? JSON.parse(row.giver_data) : {};
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
  });
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
    source: 'outside',
    sourceLabel: row.source_label,
    contributionSource: row.source,
    reference: row.batch_reference || '',
    notes: row.notes || '',
    description: [row.source_label, row.batch_reference].filter(Boolean).join(' · '),
    currency: 'usd',
    type: 'one_time',
    recurring: false,
    giftType: 'outside',
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
  db,
  parishId,
  { start = '1900-01-01', end = '2199-12-31', includeVoided = false, limit = 25000 } = {}
) {
  const result = await db
    .prepare(
      OUTSIDE_SELECT +
        ` WHERE m.parish_id=? AND m.entry_date>=? AND m.entry_date<=? ${includeVoided ? '' : "AND d.record_state='active' AND m.contribution_eligible=1"} ORDER BY m.entry_date DESC,m.id LIMIT ?`
    )
    .bind(parishId, start, end, limit + 1)
    .all();
  if (result.results.length > limit)
    throw new OutsideGiftError(
      'This period exceeds the complete outside-gift report limit. Choose a shorter period.',
      413
    );
  return result.results;
}

export function auditStatement(db, row, action, actor, reason, now) {
  const snapshot = Object.fromEntries(
    Object.entries(row).filter(([key]) => !['giver_data', 'request_key', 'request_hash', 'content_hash'].includes(key))
  );
  return db
    .prepare(
      `INSERT INTO outside_gift_audit(id,gift_id,parish_id,revision,action,actor_id,reason,snapshot_json,created_at)
    SELECT ?,d.gift_id,d.parish_id,d.revision,?,?,?,?,? FROM outside_gift_details d WHERE d.gift_id=? AND d.parish_id=? AND d.revision=?`
    )
    .bind(
      crypto.randomUUID(),
      action,
      actor,
      reason,
      JSON.stringify(snapshot),
      now,
      row.id,
      row.parish_id,
      row.revision
    );
}

export async function outsideGiftsForGiving(env, parishId, registration, options = {}) {
  if (!env.AGAPAY_DB) return [];
  let rows;
  try {
    rows = await loadOutsideGiftRows(env.AGAPAY_DB, parishId, options);
  } catch (error) {
    // The migration is additive; existing fixtures/older deployments may not have this feature yet.
    if (/no such table: (outside_gift_details|manual_income_entries)/i.test(error.message || '')) return [];
    throw error;
  }
  return Promise.all(rows.map((row) => outsideGiftDto(env.AGAPAY_DB, row, registration)));
}

export function subtractLinkedOutsideGifts(manualGifts, outsideGifts) {
  const allocated = new Map();
  for (const gift of outsideGifts)
    if (gift.accounting?.linked) {
      const key = 'accounting:' + gift.accounting.entryId + ':' + gift.accounting.lineId;
      allocated.set(key, (allocated.get(key) || 0) + gift.amountCents);
    }
  return manualGifts
    .map((gift) => {
      const remaining = Number(gift.amountCents) - (allocated.get(gift.id) || 0);
      if (remaining < 0)
        throw new OutsideGiftError('An Accounting contribution link needs review before totals can be shown.', 409);
      return { ...gift, amountCents: remaining, giftAmountCents: remaining, parishNetCents: remaining };
    })
    .filter((gift) => gift.amountCents > 0);
}
