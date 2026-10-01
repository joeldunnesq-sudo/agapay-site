// Individual outside contributions extend the existing manual contribution register.
// Nothing here creates a Stripe object or an Accounting journal.
import { OutsideGiftError } from './outside-gift-error.js';
export { OutsideGiftError } from './outside-gift-error.js';
export {
  outsideGiver,
  OUTSIDE_SELECT,
  outsideGiftRow,
  outsideGiftDto,
  loadOutsideGiftRows,
  outsideGiftsForGiving,
} from './outside-gift-reads.js';

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

export { subtractLinkedOutsideGifts } from './outside-gift-composition.js';
