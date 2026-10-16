import type { AdjustmentInput, PortabilityDatabase, LedgerServiceActor } from './service-contracts.js';
import {
  DATE,
  ADJUSTMENT_TYPES,
  id,
  now,
  text,
  first,
  run,
  capability,
  entitled,
  elevated,
  digest,
  adjustmentDto,
  AccountingDatabaseError,
  ValidationError,
  createJournalDraft,
  postJournalEntry,
  reverseJournalEntry,
} from './service-shared.js';
import './service.js';
import './year-end.js';
import './audit.js';

export async function createAdjustment(
  db: PortabilityDatabase,
  { actor, entitlementTier, input }: { actor: LedgerServiceActor; entitlementTier: string; input: AdjustmentInput }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.adjust');
  if (
    !ADJUSTMENT_TYPES.has(input?.adjustmentType) ||
    !DATE.test(input?.effectiveDate || '') ||
    !text(input?.reason) ||
    !text(input?.supportingMemo)
  )
    throw new ValidationError('Adjustment type, effective date, reason, and supporting memo are required.');
  if (!Array.isArray(input.lines) || input.lines.length < 2)
    throw new ValidationError('At least two adjustment lines are required.');
  const effectivePeriod = await first(
    db,
    'SELECT id,status FROM accounting_periods WHERE ? BETWEEN start_date AND end_date',
    input.effectiveDate
  );
  if (!effectivePeriod || effectivePeriod.status !== 'open')
    throw new ValidationError('Adjustment effective date must be in an open period.');
  const debit = input.lines.reduce((sum, line) => sum + Number(line.debitAmount || 0), 0),
    credit = input.lines.reduce((sum, line) => sum + Number(line.creditAmount || 0), 0);
  if (!debit || debit !== credit) throw new ValidationError('Adjustment must balance.');
  if (
    input.closeSessionId &&
    !(await first(
      db,
      "SELECT id FROM accounting_close_sessions WHERE id=? AND status NOT IN ('completed','voided')",
      input.closeSessionId
    ))
  )
    throw new ValidationError('Close session is not available for adjustments.');
  let reversalPeriod = null;
  if (input.autoReverse) {
    if (!DATE.test(input.reversalDate || '') || input.reversalDate! <= input.effectiveDate)
      throw new ValidationError('Auto-reversal requires a future date.');
    reversalPeriod = await first(
      db,
      "SELECT id FROM accounting_periods WHERE ? BETWEEN start_date AND end_date AND status='open'",
      input.reversalDate
    );
    if (!reversalPeriod) throw new ValidationError('Auto-reversal requires a future open period.');
  }
  const adjustmentId = id('adjustment'),
    journal = await createJournalDraft(db, {
      actor: elevated(actor),
      entryDate: input.effectiveDate,
      description: input.description || `Adjustment · ${input.adjustmentType}`,
      sourceType: 'close_adjustment',
      sourceId: adjustmentId,
      lines: input.lines,
      correlationId: input.correlationId || '',
    });
  await run(
    db,
    `INSERT INTO accounting_adjustments(id,close_session_id,journal_entry_id,adjustment_type,effective_date,reason,supporting_memo,auto_reverse,reversal_date,reversal_period_id,reversal_status,created_by_actor_type,created_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    adjustmentId,
    input.closeSessionId || null,
    journal.id,
    input.adjustmentType,
    input.effectiveDate,
    text(input.reason),
    text(input.supportingMemo),
    Number(Boolean(input.autoReverse)),
    input.reversalDate || null,
    reversalPeriod?.id || null,
    input.autoReverse ? 'scheduled' : null,
    actor.type || 'platform_user',
    actor.id,
    input.correlationId || null
  );
  return adjustmentDto((await first(db, 'SELECT * FROM accounting_adjustments WHERE id=?', adjustmentId))!);
}

export async function postAdjustment(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    adjustmentId,
    expectedVersion,
  }: { actor: LedgerServiceActor; entitlementTier: string; adjustmentId: string; expectedVersion: number }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.adjust');
  const adjustment = await first(db, 'SELECT * FROM accounting_adjustments WHERE id=?', adjustmentId);
  if (!adjustment || Number(adjustment.version) !== Number(expectedVersion) || adjustment.status !== 'draft') {
    if (adjustment?.status === 'posted') return adjustmentDto(adjustment);
    throw new AccountingDatabaseError('Adjustment changed or cannot be posted.', { details: { conflict: true } });
  }
  const posted = await postJournalEntry(db, {
    actor: elevated(actor),
    journalEntryId: adjustment.journal_entry_id,
    idempotencyKey: `adjustment:${adjustment.id}:post`,
    requestHash: await digest({ adjustmentId: adjustment.id, journalEntryId: adjustment.journal_entry_id }),
    expectedVersion: 1,
    correlationId: adjustment.correlation_id || '',
  });
  await run(
    db,
    "UPDATE accounting_adjustments SET status='posted',posted_at=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?",
    now(),
    adjustment.id,
    Number(expectedVersion)
  );
  await run(
    db,
    'INSERT OR IGNORE INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?,?,?,?)',
    id('link'),
    posted!.id,
    'close_adjustment',
    adjustment.id,
    'adjustment'
  );
  return adjustmentDto((await first(db, 'SELECT * FROM accounting_adjustments WHERE id=?', adjustment.id))!);
}

export async function runAutoReversal(
  db: PortabilityDatabase,
  { actor, entitlementTier, adjustmentId }: { actor: LedgerServiceActor; entitlementTier: string; adjustmentId: string }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.adjust');
  const adjustment = await first(db, 'SELECT * FROM accounting_adjustments WHERE id=?', adjustmentId);
  if (!adjustment || adjustment.status !== 'posted' || !adjustment.auto_reverse)
    throw new ValidationError('Posted auto-reversing adjustment was not found.');
  if (adjustment.reversal_status === 'completed') return adjustmentDto(adjustment);
  try {
    const reversal = await reverseJournalEntry(db, {
      actor: elevated(actor),
      journalEntryId: adjustment.journal_entry_id,
      entryDate: adjustment.reversal_date,
      reason: `Scheduled reversal of ${adjustment.id}`,
      idempotencyKey: `adjustment:${adjustment.id}:auto-reverse`,
      requestHash: await digest({ adjustmentId: adjustment.id, reversalDate: adjustment.reversal_date }),
      correlationId: adjustment.correlation_id || '',
    });
    await run(
      db,
      "UPDATE accounting_adjustments SET status='reversed',reversal_status='completed',reversal_journal_entry_id=?,reversed_at=?,version=version+1,updated_at=datetime('now') WHERE id=?",
      reversal!.id,
      now(),
      adjustment.id
    );
  } catch (error) {
    await run(
      db,
      "UPDATE accounting_adjustments SET reversal_status='exception',version=version+1,updated_at=datetime('now') WHERE id=?",
      adjustment.id
    );
    throw error;
  }
  return adjustmentDto((await first(db, 'SELECT * FROM accounting_adjustments WHERE id=?', adjustment.id))!);
}

export async function createAdjustmentTemplate(
  db: PortabilityDatabase,
  { actor, entitlementTier, input }: { actor: LedgerServiceActor; entitlementTier: string; input: AdjustmentInput }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.adjust');
  if (
    !text(input?.name) ||
    !['monthly', 'quarterly', 'annually', 'custom'].includes(input?.frequency as string) ||
    !Array.isArray(input?.lines) ||
    input.lines.length < 2
  )
    throw new ValidationError('A valid recurring adjustment template is required.');
  const templateId = id('adjustmenttemplate');
  await run(
    db,
    `INSERT INTO accounting_adjustment_templates(id,name,frequency,default_description,default_lines_json,next_run_date,end_date,auto_create_draft,auto_reverse,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    templateId,
    text(input.name),
    input.frequency,
    text(input.description || input.name),
    JSON.stringify(input.lines),
    input.nextRunDate || null,
    input.endDate || null,
    1,
    Number(Boolean(input.autoReverse)),
    actor.id
  );
  return Object.freeze({
    id: templateId,
    name: text(input.name),
    frequency: input.frequency,
    autoPosts: false,
    version: 1,
  });
}
