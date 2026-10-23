import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
import { AccountingDatabaseError, ValidationError } from '../errors.js';
interface PeriodRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  version: number;
  fiscal_status: string;
}
const periodSql =
  'SELECT p.id,p.name,p.start_date,p.end_date,p.status,p.version,f.status fiscal_status FROM accounting_periods p JOIN accounting_fiscal_years f ON f.id=p.fiscal_year_id';
const dto = (row: PeriodRow) => ({
  id: row.id,
  name: row.name,
  startDate: row.start_date,
  endDate: row.end_date,
  status: row.status,
  version: Number(row.version),
  fiscalStatus: row.fiscal_status,
});
export async function listAccountingPeriods(db: PortabilityDatabase) {
  return ((await db.prepare(periodSql + ' ORDER BY p.start_date').all<PeriodRow>()).results || []).map(dto);
}
export async function openAccountingPeriod(
  db: PortabilityDatabase,
  { actor, periodId, expectedVersion }: { actor: LedgerServiceActor; periodId: string; expectedVersion: unknown }
) {
  if (!actor?.id || !actor.capabilities?.includes('accounting.configure'))
    throw new AccountingDatabaseError('Accounting configuration capability is required.');
  const version = Number(expectedVersion);
  if (!Number.isSafeInteger(version) || version < 1)
    throw new ValidationError('The current accounting period version is required.');
  const period = await db
    .prepare(periodSql + ' WHERE p.id=?')
    .bind(periodId)
    .first<PeriodRow>();
  if (!period) throw new ValidationError('Accounting period was not found.');
  if (period.status !== 'future' || period.fiscal_status !== 'open')
    throw new ValidationError(
      'Only an unopened period in an open fiscal year can be opened. Use the close workflow to reopen closed books.'
    );
  if (Number(period.version) !== version)
    throw new AccountingDatabaseError('Accounting period changed. Refresh and try again.', {
      details: { conflict: true },
    });
  const lock = await db
    .prepare('SELECT id FROM accounting_period_locks WHERE accounting_period_id=? AND unlocked_at IS NULL')
    .bind(periodId)
    .first();
  if (lock) throw new ValidationError('A locked period must be reopened through its close workflow.');
  await db.batch([
    db
      .prepare(
        "UPDATE accounting_periods SET status='open',opened_at=datetime('now'),updated_at=datetime('now'),version=CASE WHEN status='future' AND version=? AND EXISTS(SELECT 1 FROM accounting_fiscal_years f WHERE f.id=accounting_periods.fiscal_year_id AND f.status='open') AND NOT EXISTS(SELECT 1 FROM accounting_period_locks l WHERE l.accounting_period_id=accounting_periods.id AND l.unlocked_at IS NULL) THEN version+1 ELSE NULL END WHERE id=?"
      )
      .bind(version, periodId),
    db
      .prepare(
        'INSERT INTO accounting_ledger_events(id,event_type,actor_type,actor_id,metadata_json) VALUES(?,?,?,?,?)'
      )
      .bind(
        'event_' + crypto.randomUUID(),
        'period.opened',
        actor.type || 'platform_user',
        actor.id,
        JSON.stringify({ periodId, startDate: period.start_date, endDate: period.end_date })
      ),
  ]);
  return dto(
    (await db
      .prepare(periodSql + ' WHERE p.id=?')
      .bind(periodId)
      .first<PeriodRow>())!
  );
}
