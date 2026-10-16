import type { CloseJournalLine, PortabilityDatabase, LedgerServiceActor } from './service-contracts.js';
import {
  id,
  now,
  text,
  first,
  all,
  run,
  capability,
  entitled,
  elevated,
  digest,
  yearCloseDto,
  AccountingDatabaseError,
  ValidationError,
  createJournalDraft,
  postJournalEntry,
  reverseJournalEntry,
  trialBalance,
} from './service-shared.js';
import './service.js';
import './adjustments.js';
import './audit.js';

export async function previewYearEndClose(
  db: PortabilityDatabase,
  { actor, entitlementTier, fiscalYearId }: { actor: LedgerServiceActor; entitlementTier: string; fiscalYearId: string }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.year_end.view');
  const year = await first(db, 'SELECT * FROM accounting_fiscal_years WHERE id=?', fiscalYearId);
  if (!year) throw new ValidationError('Fiscal year was not found.');
  const mapping = await first(db, "SELECT * FROM accounting_net_asset_mappings WHERE id='primary'");
  const activity = await all(
    db,
    `SELECT a.id account_id,a.account_number,a.name,t.category,f.id fund_id,f.restriction_type,SUM(l.debit_amount-l.credit_amount) raw_balance FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id JOIN accounting_funds f ON f.id=l.fund_id WHERE e.status IN ('posted','reversed') AND COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ? AND t.category IN ('revenue','expense') GROUP BY a.id,f.id HAVING raw_balance<>0 ORDER BY f.code,t.sort_order,a.account_number`,
    year.start_date,
    year.end_date
  );
  const lines: CloseJournalLine[] = [],
    changes = new Map<string, { restrictionType: string; amount: number }>();
  let revenueTotal = 0,
    expenseTotal = 0;
  for (const row of activity) {
    const raw = Number(row.raw_balance);
    if (row.category === 'revenue') {
      revenueTotal += -raw;
      lines.push({
        accountId: row.account_id,
        fundId: row.fund_id,
        debitAmount: Math.max(-raw, 0),
        creditAmount: Math.max(raw, 0),
        description: `Close ${row.name}`,
      });
    } else {
      expenseTotal += raw;
      lines.push({
        accountId: row.account_id,
        fundId: row.fund_id,
        debitAmount: Math.max(-raw, 0),
        creditAmount: Math.max(raw, 0),
        description: `Close ${row.name}`,
      });
    }
    changes.set(row.fund_id, changes.get(row.fund_id) || { restrictionType: row.restriction_type, amount: 0 });
    changes.get(row.fund_id)!.amount += row.category === 'revenue' ? -raw : -raw;
  }
  let restrictedChange = 0,
    unrestrictedChange = 0;
  for (const [fundId, item] of [...changes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!item.amount) continue;
    const restricted = item.restrictionType.startsWith('donor_restricted'),
      accountId = restricted
        ? mapping?.restricted_net_assets_account_id
        : (item.restrictionType === 'board_designated' && mapping?.board_designated_net_assets_account_id) ||
          mapping?.unrestricted_net_assets_account_id;
    if (!accountId) throw new ValidationError('Required net-asset mapping is incomplete.');
    lines.push({
      accountId: accountId as string,
      fundId,
      debitAmount: Math.max(-item.amount, 0),
      creditAmount: Math.max(item.amount, 0),
      description: restricted
        ? 'Close to net assets with donor restrictions'
        : 'Close to net assets without donor restrictions',
    });
    if (restricted) restrictedChange += item.amount;
    else unrestrictedChange += item.amount;
  }
  const debits = lines.reduce((sum, line) => sum + line.debitAmount, 0),
    credits = lines.reduce((sum, line) => sum + line.creditAmount, 0);
  const openPeriods = await first(
    db,
    "SELECT COUNT(*) count FROM accounting_periods WHERE fiscal_year_id=? AND status NOT IN ('closed','locked') AND end_date<>?",
    fiscalYearId,
    year.end_date
  );
  const closingPeriod = await first(
    db,
    'SELECT status FROM accounting_periods WHERE fiscal_year_id=? AND end_date=?',
    fiscalYearId,
    year.end_date
  );
  const prior = await first(
    db,
    "SELECT id FROM accounting_fiscal_year_closes WHERE fiscal_year_id=? AND status='completed'",
    fiscalYearId
  );
  const blockers = [];
  if (Number(openPeriods!.count)) blockers.push('periods_not_closed');
  if (!closingPeriod || closingPeriod.status !== 'open') blockers.push('closing_period_not_open');
  if (!mapping?.unrestricted_net_assets_account_id || !mapping?.restricted_net_assets_account_id)
    blockers.push('net_asset_mapping_missing');
  if (prior) blockers.push('prior_closing_entry_exists');
  if (debits !== credits) blockers.push('closing_entry_out_of_balance');
  return Object.freeze({
    fiscalYearId,
    closingDate: year.end_date,
    method: mapping?.closing_method || 'direct',
    revenueTotal,
    expenseTotal,
    changeInNetAssets: revenueTotal - expenseTotal,
    restrictedChange,
    unrestrictedChange,
    lines: Object.freeze(lines.map(Object.freeze as (line: CloseJournalLine) => Readonly<CloseJournalLine>)),
    blockers: Object.freeze(blockers),
    ready: blockers.length === 0,
  });
}

export async function executeYearEndClose(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeSessionId,
    expectedVersion,
  }: { actor: LedgerServiceActor; entitlementTier: string; closeSessionId: string; expectedVersion: number }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.year_end.execute');
  const session = await first(
    db,
    "SELECT * FROM accounting_close_sessions WHERE id=? AND close_type='year_end'",
    closeSessionId
  );
  if (!session || Number(session.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Year-end close changed.', { details: { conflict: true } });
  const existing = await first(
    db,
    "SELECT * FROM accounting_fiscal_year_closes WHERE fiscal_year_id=? AND status='completed'",
    session.fiscal_year_id
  );
  if (existing) return yearCloseDto(existing);
  const preview = await previewYearEndClose(db, {
    actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), 'accounting.year_end.view'])] },
    entitlementTier,
    fiscalYearId: session.fiscal_year_id,
  });
  if (!preview.ready) throw new ValidationError(`Year-end close is blocked: ${preview.blockers.join(', ')}`);
  const pre = await trialBalance(db, {
    actor: elevated(actor),
    startDate: '0001-01-01',
    endDate: preview.closingDate,
    includeZero: true,
  });
  let posted = null;
  if (preview.lines.length) {
    const journal = await createJournalDraft(db, {
      actor: elevated(actor),
      entryDate: preview.closingDate,
      description: `Fiscal year close · ${session.fiscal_year_id}`,
      sourceType: 'year_end_close',
      sourceId: session.fiscal_year_id,
      lines: preview.lines as CloseJournalLine[],
      correlationId: session.correlation_id || '',
    });
    posted = await postJournalEntry(db, {
      actor: elevated(actor),
      journalEntryId: journal.id,
      idempotencyKey: `year-end:${session.fiscal_year_id}:closing-entry`,
      requestHash: await digest(preview),
      expectedVersion: 1,
      correlationId: session.correlation_id || '',
    });
  }
  const post = await trialBalance(db, {
    actor: elevated(actor),
    startDate: '0001-01-01',
    endDate: preview.closingDate,
    includeZero: true,
  });
  const temporaryNonzero = post.rows!.filter(
    (row) => ['revenue', 'expense'].includes(row.category as string) && (row.endingDebit || row.endingCredit)
  );
  const status = post.totals.difference === 0 && temporaryNonzero.length === 0 ? 'completed' : 'failed';
  const closeId = id('yearclose');
  await run(
    db,
    `INSERT INTO accounting_fiscal_year_closes(id,fiscal_year_id,close_session_id,closing_date,closing_entry_id,status,pre_close_trial_balance_hash,post_close_trial_balance_hash,revenue_total,expense_total,change_in_net_assets,restricted_change,unrestricted_change,completed_by_actor_type,completed_by_actor_id,completed_at,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    closeId,
    session.fiscal_year_id,
    session.id,
    preview.closingDate,
    posted?.id || null,
    status,
    await digest(pre),
    await digest(post),
    preview.revenueTotal,
    preview.expenseTotal,
    preview.changeInNetAssets,
    preview.restrictedChange,
    preview.unrestrictedChange,
    actor.type || 'platform_user',
    actor.id,
    status === 'completed' ? now() : null,
    session.correlation_id || null
  );
  if (status !== 'completed')
    throw new ValidationError(
      'Post-close validation failed; the closing entry was preserved for controlled correction.'
    );
  await run(
    db,
    "UPDATE accounting_fiscal_years SET status='closed',closed_at=?,version=version+1,updated_at=datetime('now') WHERE id=?",
    now(),
    session.fiscal_year_id
  );
  await run(
    db,
    "UPDATE accounting_periods SET status='locked',closed_at=COALESCE(closed_at,?),locked_at=?,version=version+1,updated_at=datetime('now') WHERE fiscal_year_id=?",
    now(),
    now(),
    session.fiscal_year_id
  );
  await run(
    db,
    "UPDATE accounting_close_sessions SET status='completed',completed_at=?,version=version+1,updated_at=datetime('now') WHERE id=?",
    now(),
    session.id
  );
  return yearCloseDto((await first(db, 'SELECT * FROM accounting_fiscal_year_closes WHERE id=?', closeId))!);
}

export async function reopenYearEndClose(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    fiscalYearId,
    expectedVersion,
    reason,
  }: {
    actor: LedgerServiceActor;
    entitlementTier: string;
    fiscalYearId: string;
    expectedVersion: number;
    reason: string;
  }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.reopen');
  if (!text(reason)) throw new ValidationError('A year-end reopening reason is required.');
  const close = await first(
    db,
    "SELECT * FROM accounting_fiscal_year_closes WHERE fiscal_year_id=? AND status='completed'",
    fiscalYearId
  );
  if (!close || Number(close.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Fiscal-year close changed or cannot be reopened.', {
      details: { conflict: true },
    });
  const year = await first(db, 'SELECT * FROM accounting_fiscal_years WHERE id=?', fiscalYearId);
  const later = await first(
    db,
    "SELECT COUNT(*) count FROM accounting_journal_entries WHERE status IN ('posted','reversed') AND COALESCE(posting_date,entry_date)>?",
    year!.end_date
  );
  if (Number(later!.count))
    throw new ValidationError('Later-period activity must be reviewed before reopening this fiscal year.');
  await run(
    db,
    'UPDATE accounting_period_locks SET unlocked_at=? WHERE accounting_period_id IN (SELECT id FROM accounting_periods WHERE fiscal_year_id=?) AND unlocked_at IS NULL',
    now(),
    fiscalYearId
  );
  await run(
    db,
    "UPDATE accounting_periods SET status=CASE WHEN end_date=? THEN 'open' ELSE 'closed' END,locked_at=NULL,version=version+1,updated_at=datetime('now') WHERE fiscal_year_id=?",
    year!.end_date,
    fiscalYearId
  );
  await run(
    db,
    "UPDATE accounting_fiscal_years SET status='open',closed_at=NULL,version=version+1,updated_at=datetime('now') WHERE id=?",
    fiscalYearId
  );
  let reversal = null;
  if (close.closing_entry_id)
    reversal = await reverseJournalEntry(db, {
      actor: elevated(actor),
      journalEntryId: close.closing_entry_id,
      entryDate: year!.end_date,
      reason: text(reason),
      idempotencyKey: `year-end:${fiscalYearId}:reopen`,
      requestHash: await digest({ fiscalYearId, closingEntryId: close.closing_entry_id, reason: text(reason) }),
      correlationId: close.correlation_id || '',
    });
  await run(
    db,
    "UPDATE accounting_fiscal_year_closes SET status='reopened',reopened_at=?,version=version+1 WHERE id=? AND version=?",
    now(),
    close.id,
    Number(expectedVersion)
  );
  await run(
    db,
    "UPDATE accounting_close_sessions SET status='reopened',reopened_at=?,reopen_reason=?,version=version+1,updated_at=datetime('now') WHERE id=?",
    now(),
    text(reason),
    close.close_session_id
  );
  return Object.freeze({
    ...yearCloseDto((await first(db, 'SELECT * FROM accounting_fiscal_year_closes WHERE id=?', close.id))!),
    reversalJournalEntryId: reversal?.id || '',
  });
}
