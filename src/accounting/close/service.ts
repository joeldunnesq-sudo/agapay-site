import type { PortabilityDatabase, LedgerServiceActor } from './service-contracts.js';
import {
  CORE_CHECKS,
  ADVANCED_CHECKS,
  id,
  now,
  text,
  first,
  all,
  run,
  capability,
  entitled,
  digest,
  closeDto,
  checkDto,
  evaluateChecks,
  AccountingDatabaseError,
  ValidationError,
} from './service-shared.js';
import './adjustments.js';
import './year-end.js';
import './audit.js';
export { createAdjustment, postAdjustment, runAutoReversal, createAdjustmentTemplate } from './adjustments.js';
export { previewYearEndClose, executeYearEndClose, reopenYearEndClose } from './year-end.js';
export {
  auditReadiness,
  generateAccountantExport,
  closePacketHtml,
  auditTrailCsv,
  archiveFiscalYear,
  updateRetentionSettings,
  getRetentionSettings,
  createLegalHold,
  releaseLegalHold,
} from './audit.js';

export async function createCloseSession(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeType = 'month_end',
    fiscalYearId,
    accountingPeriodId = null,
    correlationId = '',
  }: {
    actor: LedgerServiceActor;
    entitlementTier: string;
    closeType?: string;
    fiscalYearId: string;
    accountingPeriodId?: string | null;
    correlationId?: string;
  }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.create');
  if (!['month_end', 'quarter_end', 'year_end', 'special'].includes(closeType))
    throw new ValidationError('Close type is invalid.');
  const year = await first(db, 'SELECT * FROM accounting_fiscal_years WHERE id=?', fiscalYearId);
  if (!year) throw new ValidationError('Fiscal year was not found.');
  let period = null;
  if (closeType !== 'year_end' || accountingPeriodId) {
    period = await first(
      db,
      'SELECT * FROM accounting_periods WHERE id=? AND fiscal_year_id=?',
      accountingPeriodId,
      fiscalYearId
    );
    if (!period) throw new ValidationError('Accounting period was not found in the fiscal year.');
  }
  const existing =
    period &&
    (await first(
      db,
      "SELECT * FROM accounting_close_sessions WHERE accounting_period_id=? AND close_type=? AND status NOT IN ('completed','voided','reopened')",
      period.id,
      closeType
    ));
  if (existing) return closeDto(existing);
  const sessionId = id('close');
  await run(
    db,
    `INSERT INTO accounting_close_sessions(id,close_type,fiscal_year_id,accounting_period_id,initiated_by_actor_type,initiated_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,?)`,
    sessionId,
    closeType,
    fiscalYearId,
    period?.id || null,
    actor.type || 'platform_user',
    actor.id,
    correlationId || null
  );
  const definitions = entitlementTier === 'parish' ? [...CORE_CHECKS, ...ADVANCED_CHECKS] : CORE_CHECKS;
  for (const [code, category, label, severity, blocking] of definitions)
    await run(
      db,
      `INSERT INTO accounting_close_checks(id,close_session_id,check_code,category,label,status,severity,blocking) VALUES(?,?,?,?,?,'pending',?,?)`,
      id('check'),
      sessionId,
      code,
      category,
      label,
      severity,
      blocking
    );
  return closeDto((await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', sessionId))!);
}

export async function validateCloseSession(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeSessionId,
    expectedVersion,
  }: { actor: LedgerServiceActor; entitlementTier: string; closeSessionId: string; expectedVersion: number }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.validate');
  const session = await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', closeSessionId);
  if (
    !session ||
    Number(session.version) !== Number(expectedVersion) ||
    ['completed', 'voided'].includes(session.status)
  )
    throw new AccountingDatabaseError('Close session changed or cannot be validated.', { details: { conflict: true } });
  await run(
    db,
    "UPDATE accounting_close_sessions SET status='validating',version=version+1 WHERE id=? AND version=?",
    session.id,
    Number(expectedVersion)
  );
  const evaluation = await evaluateChecks(db, session, entitlementTier, actor);
  for (const [code, [status, details]] of evaluation.results)
    await run(
      db,
      "UPDATE accounting_close_checks SET status=?,details_json=?,updated_at=datetime('now'),version=version+1 WHERE close_session_id=? AND check_code=?",
      status,
      JSON.stringify(details),
      session.id,
      code
    );
  const blockers = await first(
    db,
    "SELECT COUNT(*) count FROM accounting_close_checks WHERE close_session_id=? AND blocking=1 AND status='failed'",
    session.id
  );
  const status = Number(blockers!.count) ? 'blocked' : 'ready_for_review';
  await run(
    db,
    "UPDATE accounting_close_sessions SET status=?,last_validated_at=?,version=version+1,updated_at=datetime('now') WHERE id=?",
    status,
    now(),
    session.id
  );
  return closeSessionDetail(db, {
    actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), 'accounting.close.view'])] },
    entitlementTier,
    closeSessionId,
  });
}

export async function closeSessionDetail(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeSessionId,
  }: { actor: LedgerServiceActor; entitlementTier: string; closeSessionId: string }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.view');
  const session = await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', closeSessionId);
  if (!session) throw new ValidationError('Close session was not found.');
  const checks = (
    await all(
      db,
      'SELECT * FROM accounting_close_checks WHERE close_session_id=? ORDER BY category,check_code',
      closeSessionId
    )
  ).map(checkDto);
  return Object.freeze({
    ...closeDto(session),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      passed: checks.filter((x) => x.status === 'passed').length,
      warnings: checks.filter((x) => ['warning', 'waived'].includes(x.status)).length,
      failures: checks.filter((x) => x.status === 'failed').length,
      blockers: checks.filter((x) => x.blocking && x.status === 'failed').length,
    }),
  });
}

export async function waiveCloseCheck(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeSessionId,
    checkId,
    expectedVersion,
    reason,
  }: {
    actor: LedgerServiceActor;
    entitlementTier: string;
    closeSessionId: string;
    checkId: string;
    expectedVersion: number;
    reason: string;
  }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.review');
  if (!text(reason)) throw new ValidationError('A waiver reason is required.');
  const check = await first(
    db,
    'SELECT * FROM accounting_close_checks WHERE id=? AND close_session_id=?',
    checkId,
    closeSessionId
  );
  if (!check || Number(check.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Close check changed.', { details: { conflict: true } });
  if (check.blocking || !['warning', 'pending'].includes(check.status))
    throw new ValidationError('Critical or blocking checks cannot be waived.');
  const policy = await first(db, "SELECT * FROM accounting_close_policies WHERE id='primary'");
  if (!policy!.allow_warning_waivers) throw new ValidationError('Warning waivers are disabled by close policy.');
  await run(
    db,
    `UPDATE accounting_close_checks SET status='waived',resolved_by_actor_type=?,resolved_by_actor_id=?,resolved_at=?,resolution_note=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`,
    actor.type || 'platform_user',
    actor.id,
    now(),
    text(reason),
    check.id,
    Number(expectedVersion)
  );
  return checkDto((await first(db, 'SELECT * FROM accounting_close_checks WHERE id=?', check.id))!);
}

export async function reviewCloseSession(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeSessionId,
    expectedVersion,
    action,
  }: {
    actor: LedgerServiceActor;
    entitlementTier: string;
    closeSessionId: string;
    expectedVersion: number;
    action: string;
  }
) {
  entitled(entitlementTier);
  capability(actor, action === 'approve' ? 'accounting.close.approve' : 'accounting.close.review');
  const current = await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', closeSessionId);
  const allowed = action === 'review' ? ['ready_for_review'] : ['reviewed', 'ready_for_review'];
  if (!current || Number(current.version) !== Number(expectedVersion) || !allowed.includes(current.status))
    throw new AccountingDatabaseError('Close session changed or is not reviewable.', { details: { conflict: true } });
  const policy = await first(db, "SELECT * FROM accounting_close_policies WHERE id='primary'");
  if (policy!.require_separate_reviewer && current.initiated_by_actor_id === actor.id)
    throw new ValidationError('Close policy requires a separate reviewer.');
  const target = action === 'approve' ? 'approved' : 'reviewed',
    prefix = action === 'approve' ? 'approved' : 'reviewed';
  await run(
    db,
    `UPDATE accounting_close_sessions SET status=?,${prefix}_by_actor_type=?,${prefix}_by_actor_id=?,${prefix}_at=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`,
    target,
    actor.type || 'platform_user',
    actor.id,
    now(),
    current.id,
    Number(expectedVersion)
  );
  return closeDto((await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', current.id))!);
}

export async function completeCloseSession(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeSessionId,
    expectedVersion,
  }: { actor: LedgerServiceActor; entitlementTier: string; closeSessionId: string; expectedVersion: number }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.complete');
  const session = await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', closeSessionId);
  if (session?.status === 'completed') return closeDto(session);
  if (
    !session ||
    Number(session.version) !== Number(expectedVersion) ||
    !['ready_for_review', 'reviewed', 'approved'].includes(session.status)
  )
    throw new AccountingDatabaseError('Close session changed or is not completable.', { details: { conflict: true } });
  const blocking = await first(
    db,
    "SELECT COUNT(*) count FROM accounting_close_checks WHERE close_session_id=? AND blocking=1 AND status<>'passed'",
    session.id
  );
  if (Number(blocking!.count)) throw new ValidationError('Critical close checks must pass before completion.');
  const period = await first(db, 'SELECT * FROM accounting_periods WHERE id=?', session.accounting_period_id);
  const evaluation = await evaluateChecks(db, session, entitlementTier, actor);
  const checks = await all(
    db,
    'SELECT check_code,status,severity,blocking,resolution_note FROM accounting_close_checks WHERE close_session_id=? ORDER BY check_code',
    session.id
  );
  const snapshotBody = {
    closeSessionId: session.id,
    closeType: session.close_type,
    period: period ? { id: period.id, startDate: period.start_date, endDate: period.end_date } : null,
    trialBalance: evaluation.tb,
    financialPosition: evaluation.position,
    activities: evaluation.activities,
    checks,
    completedBy: actor.id,
  };
  const snapshotHash = await digest(snapshotBody),
    sequence = Number(
      (await first(
        db,
        'SELECT COALESCE(MAX(sequence_number),0)+1 next FROM accounting_close_snapshots WHERE close_session_id=?',
        session.id
      ))!.next
    );
  await run(
    db,
    `INSERT INTO accounting_close_snapshots(id,close_session_id,sequence_number,snapshot_type,snapshot_json,snapshot_hash,created_by_actor_type,created_by_actor_id) VALUES(?,?,?,?,?,?,?,?)`,
    id('closesnapshot'),
    session.id,
    sequence,
    session.close_type,
    JSON.stringify(snapshotBody),
    snapshotHash,
    actor.type || 'platform_user',
    actor.id
  );
  if (period) {
    await run(
      db,
      "UPDATE accounting_periods SET status='locked',closed_at=COALESCE(closed_at,?),locked_at=?,version=version+1,updated_at=datetime('now') WHERE id=?",
      now(),
      now(),
      period.id
    );
    await run(
      db,
      `INSERT INTO accounting_period_locks(id,accounting_period_id,lock_type,locked_by_actor_type,locked_by_actor_id,reason) VALUES(?,?,'hard_close',?,?,?)`,
      id('periodlock'),
      period.id,
      actor.type || 'platform_user',
      actor.id,
      `Completed close ${session.id}`
    );
  }
  await run(
    db,
    "UPDATE accounting_close_sessions SET status='completed',completed_at=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?",
    now(),
    session.id,
    Number(expectedVersion)
  );
  await run(
    db,
    'INSERT INTO accounting_ledger_events(id,event_type,actor_type,actor_id,correlation_id,metadata_json) VALUES(?,?,?,?,?,?)',
    id('event'),
    'close.period_completed',
    actor.type || 'platform_user',
    actor.id,
    session.correlation_id || null,
    JSON.stringify({ closeSessionId: session.id, snapshotHash })
  );
  return closeDto((await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', session.id))!);
}

export async function reopenCloseSession(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    closeSessionId,
    expectedVersion,
    reason,
  }: {
    actor: LedgerServiceActor;
    entitlementTier: string;
    closeSessionId: string;
    expectedVersion: number;
    reason: string;
  }
) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.reopen');
  if (!text(reason)) throw new ValidationError('A reopening reason is required.');
  const session = await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', closeSessionId);
  if (!session || Number(session.version) !== Number(expectedVersion) || session.status !== 'completed')
    throw new AccountingDatabaseError('Completed close changed or cannot be reopened.', {
      details: { conflict: true },
    });
  if (session.close_type === 'year_end')
    throw new ValidationError('Use the controlled fiscal-year reopening workflow for year-end closes.');
  await run(
    db,
    'UPDATE accounting_period_locks SET unlocked_at=? WHERE accounting_period_id=? AND unlocked_at IS NULL',
    now(),
    session.accounting_period_id
  );
  await run(
    db,
    "UPDATE accounting_periods SET status='open',locked_at=NULL,version=version+1,updated_at=datetime('now') WHERE id=?",
    session.accounting_period_id
  );
  await run(
    db,
    "UPDATE accounting_close_sessions SET status='reopened',reopened_at=?,reopen_reason=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?",
    now(),
    text(reason),
    session.id,
    Number(expectedVersion)
  );
  return closeDto((await first(db, 'SELECT * FROM accounting_close_sessions WHERE id=?', session.id))!);
}
