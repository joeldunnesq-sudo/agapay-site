import { json } from '../lib/core.js';
import { accountingContext } from './accounting-ledger.js';
import { OutsideGiftError, outsideGiftRow, outsideGiftDto, auditStatement } from '../lib/outside-gifts.js';

// Read-only against the ledger. Linking assigns an already-posted contribution;
// it never creates income, a deposit, or a transfer. Central allocations are atomic.
const eligibleLines = `SELECT l.id line_id,e.id entry_id,e.entry_date,e.description,l.credit_amount,f.giving_source_id fund_id,a.name account_name
 FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
 JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id
 JOIN accounting_funds f ON f.id=l.fund_id
 WHERE e.status='posted' AND e.source_type IN ('manual','manual_register_contribution')
 AND t.category='revenue' AND l.credit_amount>0 AND l.debit_amount=0 AND f.giving_source_type='fund'`;
const reply = (body, status = 200) =>
  json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } });

export async function linkOutsideGift(db, ledger, parishId, entityId, actor, row, body) {
  if (typeof body.lineId !== 'string' || !body.lineId || body.lineId.length > 200)
    throw new OutsideGiftError('Choose a posted contribution first.');
  const line = await ledger
    .prepare(eligibleLines + ' AND l.id=? AND f.giving_source_id=?')
    .bind(body.lineId, row.fund_id)
    .first();
  if (!line)
    throw new OutsideGiftError(
      'Choose a posted manual contribution for this same Funds & Alms fund. Reversed entries and Stripe income cannot be linked.'
    );
  if (body.confirmedDeposit !== true)
    throw new OutsideGiftError('Confirm this posted contribution includes this gift.');
  if (row.accounting_line_id) {
    if (row.accounting_line_id === line.line_id && row.accounting_entity_id === entityId) return row;
    throw new OutsideGiftError('This gift is already linked. Unlink it with a reason before changing the link.', 409);
  }
  if (row.revision !== body.revision || row.record_state !== 'active')
    throw new OutsideGiftError('This record changed. Refresh before linking.', 409);
  const now = new Date().toISOString();
  const next = {
    ...row,
    revision: row.revision + 1,
    accounting_entity_id: entityId,
    accounting_entry_id: line.entry_id,
    accounting_line_id: line.line_id,
    accounting_linked_by: actor,
    accounting_linked_at: now,
    updated_by: actor,
  };
  const result = await db.batch([
    db
      .prepare(
        `UPDATE outside_gift_details SET accounting_entity_id=?,accounting_entry_id=?,accounting_line_id=?,accounting_linked_by=?,accounting_linked_at=?,revision=?,updated_by=?
      WHERE gift_id=? AND parish_id=? AND revision=? AND record_state='active' AND accounting_line_id IS NULL
      AND (SELECT COALESCE(SUM(m.amount_cents),0) FROM outside_gift_details d JOIN manual_income_entries m ON m.id=d.gift_id WHERE d.parish_id=? AND d.accounting_entity_id=? AND d.accounting_line_id=? AND d.record_state='active')+?<=?`
      )
      .bind(
        entityId,
        line.entry_id,
        line.line_id,
        actor,
        now,
        next.revision,
        actor,
        row.id,
        parishId,
        row.revision,
        parishId,
        entityId,
        line.line_id,
        row.amount_cents,
        line.credit_amount
      ),
    auditStatement(db, next, 'accounting_linked', actor, 'Matched to existing posted contribution', now),
  ]);
  if (result[0].meta.changes !== 1)
    throw new OutsideGiftError(
      'The posted contribution has insufficient unassigned value, or this gift changed. Refresh before linking.',
      409
    );
  return outsideGiftRow(db, parishId, row.id);
}

export async function unlinkOutsideGift(db, parishId, actor, row, body) {
  const reason = String(body.reason || '')
    .trim()
    .slice(0, 500);
  if (reason.length < 8 || body.confirmedLedgerUnchanged !== true)
    throw new OutsideGiftError('Give an unlink reason and confirm the Accounting entry will remain unchanged.');
  if (row.revision !== body.revision || !row.accounting_line_id)
    throw new OutsideGiftError('This link changed. Refresh before unlinking.', 409);
  const now = new Date().toISOString();
  const next = {
    ...row,
    revision: row.revision + 1,
    accounting_entity_id: null,
    accounting_entry_id: null,
    accounting_line_id: null,
    accounting_linked_by: null,
    accounting_linked_at: null,
    updated_by: actor,
  };
  const result = await db.batch([
    db
      .prepare(
        `UPDATE outside_gift_details SET accounting_entity_id=NULL,accounting_entry_id=NULL,accounting_line_id=NULL,accounting_linked_by=NULL,accounting_linked_at=NULL,revision=?,updated_by=? WHERE gift_id=? AND parish_id=? AND revision=? AND accounting_line_id=?`
      )
      .bind(next.revision, actor, row.id, parishId, row.revision, row.accounting_line_id),
    auditStatement(db, next, 'accounting_unlinked', actor, reason, now),
  ]);
  if (result[0].meta.changes !== 1) throw new OutsideGiftError('This link changed. Refresh before unlinking.', 409);
  return outsideGiftRow(db, parishId, row.id);
}

export async function outsideAccountingAction(request, env, registration, id, action, body) {
  if (action === 'unlink' && request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const context = await accountingContext(
    request,
    env,
    registration.parishId,
    request.method === 'GET' ? 'accounting.view' : 'accounting.reconcile'
  );
  if (!context)
    return reply({ error: 'Unlock Accounting with an authorized staff profile first, then return to this gift.' }, 403);
  if (context.error) return context.error;
  const db = env.AGAPAY_DB;
  const row = await outsideGiftRow(db, registration.parishId, id);
  if (!row) throw new OutsideGiftError('Gift not found.', 404);
  if (request.method === 'GET') {
    const result = await context.db
      .prepare(eligibleLines + ' AND f.giving_source_id=? ORDER BY e.entry_date DESC,l.id LIMIT 101')
      .bind(row.fund_id)
      .all();
    const linked = await db
      .prepare(
        `SELECT d.accounting_line_id, SUM(m.amount_cents) allocated FROM outside_gift_details d JOIN manual_income_entries m ON m.id=d.gift_id WHERE d.parish_id=? AND d.accounting_entity_id=? AND d.record_state='active' AND d.accounting_line_id IS NOT NULL GROUP BY d.accounting_line_id`
      )
      .bind(registration.parishId, context.entityId)
      .all();
    const amounts = new Map(linked.results.map((r) => [r.accounting_line_id, Number(r.allocated)]));
    const lines = result.results
      .slice(0, 100)
      .map((line) => ({ ...line, availableCents: line.credit_amount - (amounts.get(line.line_id) || 0) }));
    const currentLink =
      row.accounting_line_id && row.accounting_entity_id === context.entityId
        ? await context.db
            .prepare(eligibleLines + ' AND l.id=? AND f.giving_source_id=?')
            .bind(row.accounting_line_id, row.fund_id)
            .first()
        : null;
    const linkValid =
      !row.accounting_line_id ||
      Boolean(currentLink && Number(currentLink.credit_amount) >= (amounts.get(row.accounting_line_id) || 0));
    return reply({
      lines,
      hasMore: result.results.length > 100,
      linkValid,
      note: 'Latest 100 eligible posted contributions for this fund. Linking does not post income again.',
    });
  }
  const actor = context.actor.type + ':' + context.actor.id;
  const next =
    action === 'unlink'
      ? await unlinkOutsideGift(db, registration.parishId, actor, row, body)
      : await linkOutsideGift(db, context.db, registration.parishId, context.entityId, actor, row, body);
  return reply({ gift: await outsideGiftDto(db, next, registration) });
}
