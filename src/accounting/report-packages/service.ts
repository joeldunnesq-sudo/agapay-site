import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
import { dimensionAccess, dimensionDates, dimensionText } from '../dimensions/service.js';
import { dimensionBudget, dimensionReport } from '../dimensions/reporting.js';
import {
  statementOfActivities,
  statementOfFinancialPosition,
  statementOfCashFlows,
  fundActivity,
} from '../reports/service.js';
import { assetRegister, hash } from '../assets/service.js';
import { ValidationError } from '../errors.js';
const reports = ['activities', 'position', 'cashFlows', 'fundActivity', 'assets', 'departments', 'projects'];
interface Package {
  id: string;
  name: string;
  report_ids: string;
  version: number;
  is_active: number;
}
export async function listReportPackages(db: PortabilityDatabase, actor: LedgerServiceActor) {
  dimensionAccess(actor);
  return {
    packages:
      (
        await db
          .prepare('SELECT * FROM accounting_report_packages ORDER BY is_active DESC,name LIMIT 101')
          .all<Package>()
      ).results || [],
    runs:
      (
        await db
          .prepare(
            'SELECT r.id,r.package_id,r.start_date,r.end_date,r.created_at,p.name FROM accounting_report_package_runs r JOIN accounting_report_packages p ON p.id=r.package_id ORDER BY r.created_at DESC,r.id DESC LIMIT 50'
          )
          .all()
      ).results || [],
  };
}
export async function saveReportPackage(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  input: { id?: string; name: string; reportIds: string[]; expectedVersion?: number; active?: boolean }
) {
  dimensionAccess(actor, 'accounting.configure');
  const name = dimensionText(input.name, 120, true);
  if (
    !Array.isArray(input.reportIds) ||
    !input.reportIds.length ||
    input.reportIds.length > reports.length ||
    new Set(input.reportIds).size !== input.reportIds.length ||
    input.reportIds.some((v) => !reports.includes(v))
  )
    throw new ValidationError('Choose at least one supported report.');
  const id = input.id || `packet_${crypto.randomUUID()}`;
  const current = await db.prepare('SELECT * FROM accounting_report_packages WHERE id=?').bind(id).first<Package>();
  if (input.id && (!current || current.version !== input.expectedVersion))
    throw new ValidationError('Report package changed. Reload before saving.');
  if (
    !current &&
    Number((await db.prepare('SELECT COUNT(*) n FROM accounting_report_packages').first<{ n: number }>())?.n) >= 100
  )
    throw new ValidationError('Use at most 100 saved report packages.');
  await db.batch([
    current
      ? db
          .prepare(
            'UPDATE accounting_report_packages SET name=?,report_ids=?,is_active=?,version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE id=?'
          )
          .bind(name, JSON.stringify(input.reportIds), input.active === false ? 0 : 1, current.version, id)
      : db
          .prepare('INSERT INTO accounting_report_packages(id,name,report_ids,created_by) VALUES(?,?,?,?)')
          .bind(id, name, JSON.stringify(input.reportIds), actor.id),
    db
      .prepare(
        'INSERT INTO accounting_dimension_audit(id,entity_type,entity_id,action,actor_id,detail) VALUES(?,?,?,?,?,?)'
      )
      .bind(
        crypto.randomUUID(),
        'report_package',
        id,
        'saved',
        actor.id,
        JSON.stringify({ name, reportIds: input.reportIds })
      ),
  ]);
  return db.prepare('SELECT * FROM accounting_report_packages WHERE id=?').bind(id).first();
}
// A single SQLite stamp covers all report inputs. Audit-only report views do not change it.
const stampSql = `SELECT json_array(
 (SELECT COUNT(*) FROM accounting_journal_entries),(SELECT COALESCE(SUM(version),0) FROM accounting_journal_entries),
 (SELECT COALESCE(SUM(version),0) FROM accounting_accounts),(SELECT COALESCE(SUM(version),0) FROM accounting_funds),
 (SELECT COALESCE(SUM(version),0) FROM accounting_budgets),(SELECT COUNT(*) FROM accounting_budget_lines),(SELECT COALESCE(SUM(version),0) FROM accounting_budget_lines),
 (SELECT COUNT(*) FROM accounting_dimension_audit),(SELECT COUNT(*) FROM accounting_fixed_assets),(SELECT COALESCE(SUM(version),0) FROM accounting_fixed_assets),
 (SELECT COUNT(*) FROM accounting_report_packages),(SELECT COALESCE(SUM(version),0) FROM accounting_report_packages)) stamp`;
export async function generateReportPackage(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  tier: string,
  id: string,
  input: { from: string; to: string; budgetId?: string; operationKey: string }
) {
  dimensionAccess(actor);
  dimensionDates(input.from, input.to);
  const key = dimensionText(input.operationKey, 100, true),
    requestHash = await hash({ id, from: input.from, to: input.to, budgetId: input.budgetId || null });
  if (input.budgetId) {
    const plan = await dimensionBudget(db, actor, tier, input.budgetId);
    if (!['approved', 'locked'].includes(plan.budget.status))
      throw new ValidationError('Council packages use an approved or locked budget.');
    await dimensionReport(db, actor, tier, { from: input.from, to: input.to, budgetId: input.budgetId });
  }
  const prior = await db
    .prepare('SELECT id,request_hash,snapshot_json FROM accounting_report_package_runs WHERE operation_key=?')
    .bind(key)
    .first<{ id: string; request_hash: string; snapshot_json: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw new ValidationError('This package key was used with different dates.');
    const snapshot = JSON.parse(prior.snapshot_json);
    if (input.budgetId) dimensionAccess(actor, 'budgets.view');
    return { id: prior.id, snapshot, replayed: true };
  }
  const before = (await db.prepare(stampSql).first<{ stamp: string }>())!.stamp;
  const preset = await db
    .prepare('SELECT * FROM accounting_report_packages WHERE id=? AND is_active=1')
    .bind(id)
    .first<Package>();
  if (!preset) throw new ValidationError('Choose an active saved report package.');
  const reportIds = JSON.parse(preset.report_ids) as string[];
  const sections = [];
  for (const reportId of reportIds) {
    const options = { actor, startDate: input.from, endDate: input.to, asOfDate: input.to };
    let data: unknown;
    if (reportId === 'activities') data = await statementOfActivities(db, options);
    else if (reportId === 'position') data = await statementOfFinancialPosition(db, options);
    else if (reportId === 'cashFlows') data = await statementOfCashFlows(db, options);
    else if (reportId === 'fundActivity') data = await fundActivity(db, options);
    else if (reportId === 'assets') data = await assetRegister(db, actor, input.to);
    else if (reportId === 'departments' || reportId === 'projects')
      data = await dimensionReport(db, actor, tier, {
        ...input,
        groupBy: reportId === 'departments' ? 'department' : 'project',
      });
    else throw new ValidationError('This saved package contains an unsupported report.');
    sections.push({ reportId, data });
  }
  const snapshot = {
    name: preset.name,
    from: input.from,
    to: input.to,
    budgetId: input.budgetId || null,
    generatedAt: new Date().toISOString(),
    basis: 'Posting date; financial amounts in cents',
    sections,
  };
  const json = JSON.stringify(snapshot);
  if (new TextEncoder().encode(json).byteLength > 4_000_000)
    throw new ValidationError('This package is too large. Choose fewer reports or a shorter period.');
  const runId = `packet_run_${crypto.randomUUID()}`;
  // Deliberately force the NOT NULL constraint if a report input changes before saving.
  await db.batch([
    db
      .prepare(
        `INSERT INTO accounting_report_package_runs(id,package_id,start_date,end_date,budget_id,snapshot_json,operation_key,request_hash,created_by) SELECT ?,?,?,?,?,CASE WHEN (${stampSql})=? THEN ? ELSE NULL END,?,?,?`
      )
      .bind(runId, id, input.from, input.to, input.budgetId || null, before, json, key, requestHash, actor.id),
  ]);
  return { id: runId, snapshot, replayed: false };
}
export async function getReportPackageRun(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  id: string,
  tier = 'parish'
) {
  dimensionAccess(actor);
  const run = await db
    .prepare('SELECT snapshot_json FROM accounting_report_package_runs WHERE id=?')
    .bind(id)
    .first<{ snapshot_json: string }>();
  if (!run) throw new ValidationError('Report package snapshot was not found.');
  const snapshot = JSON.parse(run.snapshot_json);
  if (snapshot.budgetId) await dimensionBudget(db, actor, tier, snapshot.budgetId);
  return { id, snapshot };
}
