import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
import { CapabilityDeniedError, ValidationError } from '../errors.js';
import { validateAccountingDate } from '../validation.js';

export interface Dimension {
  id: string;
  kind: string;
  code: string;
  name: string;
  is_active: number;
  version: number;
}
export function dimensionAccess(actor: LedgerServiceActor, capability = 'accounting.view') {
  if (!actor?.id || !actor.capabilities.includes(capability)) throw new CapabilityDeniedError();
}
export function dimensionText(value: unknown, max = 120, required = false) {
  const result = String(value ?? '').trim();
  if (result.length > max || (required && !result))
    throw new ValidationError(`A value of at most ${max} characters is required.`);
  return result;
}
export function dimensionDates(from: string, to: string) {
  validateAccountingDate(from);
  validateAccountingDate(to);
  if (from > to) throw new ValidationError('Report start must precede report end.');
  return { from, to };
}
export async function dimensionRefs(db: PortabilityDatabase, departmentId: unknown, projectId: unknown) {
  const department = dimensionText(departmentId, 100),
    project = dimensionText(projectId, 100);
  for (const [id, kind] of [
    [department, 'department'],
    [project, 'project'],
  ])
    if (
      id &&
      !(await db
        .prepare('SELECT id FROM accounting_dimensions WHERE id=? AND kind=? AND is_active=1')
        .bind(id, kind)
        .first())
    )
      throw new ValidationError(`Choose an active ${kind}.`);
  return { departmentId: department || null, projectId: project || null };
}
export async function listDimensions(db: PortabilityDatabase, actor: LedgerServiceActor) {
  dimensionAccess(actor);
  return (
    (
      await db
        .prepare('SELECT * FROM accounting_dimensions ORDER BY kind,is_active DESC,code LIMIT 1001')
        .all<Dimension>()
    ).results || []
  );
}
export async function saveDimension(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  input: { id?: string; kind: string; code: string; name: string; active?: boolean; expectedVersion?: number }
) {
  dimensionAccess(actor, 'accounting.configure');
  if (!['department', 'project'].includes(input.kind)) throw new ValidationError('Choose department or project.');
  const code = dimensionText(input.code, 32, true).toUpperCase(),
    name = dimensionText(input.name, 120, true),
    id = input.id ? dimensionText(input.id, 100, true) : `dim_${crypto.randomUUID()}`;
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code))
    throw new ValidationError('Use letters, numbers, dots, underscores or hyphens for the code.');
  const current = await db.prepare('SELECT * FROM accounting_dimensions WHERE id=?').bind(id).first<Dimension>();
  if (input.id && (!current || current.kind !== input.kind || current.version !== input.expectedVersion))
    throw new ValidationError('Dimension changed. Reload before saving.');
  if (
    !current &&
    Number((await db.prepare('SELECT COUNT(*) n FROM accounting_dimensions').first<{ n: number }>())?.n) >= 1000
  )
    throw new ValidationError('The reporting-label limit is 1,000.');
  await db.batch([
    current
      ? db
          .prepare(
            'UPDATE accounting_dimensions SET code=?,name=?,is_active=?,version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE id=?'
          )
          .bind(code, name, input.active === false ? 0 : 1, current.version, id)
      : db
          .prepare('INSERT INTO accounting_dimensions(id,kind,code,name,created_by) VALUES(?,?,?,?,?)')
          .bind(id, input.kind, code, name, actor.id),
    db
      .prepare(
        'INSERT INTO accounting_dimension_audit(id,entity_type,entity_id,action,actor_id,detail) VALUES(?,?,?,?,?,?)'
      )
      .bind(
        crypto.randomUUID(),
        'dimension',
        id,
        current ? 'updated' : 'created',
        actor.id,
        JSON.stringify({ code, name, active: input.active !== false })
      ),
  ]);
  return db.prepare('SELECT * FROM accounting_dimensions WHERE id=?').bind(id).first<Dimension>();
}
export async function dimensionTransactions(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  from: string,
  to: string,
  query = '',
  filters: { departmentId?: string; projectId?: string; accountId?: string; fundId?: string } = {}
) {
  dimensionAccess(actor);
  dimensionDates(from, to);
  const search = dimensionText(query, 100);
  const conditions: string[] = [],
    params: string[] = [];
  for (const [key, column] of [
    ['departmentId', 'CASE WHEN d.line_id IS NOT NULL THEN d.department_id ELSE rd.department_id END'],
    ['projectId', 'CASE WHEN d.line_id IS NOT NULL THEN d.project_id ELSE rd.project_id END'],
    ['accountId', 'l.account_id'],
    ['fundId', 'l.fund_id'],
  ]) {
    const value = dimensionText(filters[key as keyof typeof filters], 100);
    if (value) {
      conditions.push(`COALESCE(${column},'__unassigned__')=?`);
      params.push(value);
    }
  }
  const result =
    (
      await db
        .prepare(
          `SELECT l.id,l.account_id accountId,l.fund_id fundId,e.id journalId,e.entry_number entryNumber,e.posting_date date,
 e.description,a.account_number accountNumber,a.name accountName,t.category,f.name fundName,l.debit_amount debit,l.credit_amount credit,
 CASE WHEN d.line_id IS NOT NULL THEN d.department_id ELSE rd.department_id END departmentId,CASE WHEN d.line_id IS NOT NULL THEN d.project_id ELSE rd.project_id END projectId,COALESCE(d.version,0) version
 FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
 JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id
 JOIN accounting_funds f ON f.id=l.fund_id LEFT JOIN accounting_journal_line_dimensions d ON d.line_id=l.id LEFT JOIN accounting_journal_lines original_line ON e.source_type='reversal' AND original_line.journal_entry_id=e.source_id AND original_line.line_number=l.line_number LEFT JOIN accounting_journal_line_dimensions rd ON rd.line_id=original_line.id
 WHERE e.status IN ('posted','reversed') AND e.posting_date BETWEEN ? AND ? AND t.category IN ('revenue','expense')
 AND (?='' OR e.description LIKE ? OR a.name LIKE ? OR e.entry_number LIKE ?) ${conditions.length ? ' AND ' + conditions.join(' AND ') : ''}
 ORDER BY e.posting_date DESC,e.entry_number DESC,l.line_number LIMIT 501`
        )
        .bind(from, to, search, `%${search}%`, `%${search}%`, `%${search}%`, ...params)
        .all()
    ).results || [];
  return { rows: result.slice(0, 500), truncated: result.length > 500 };
}
export async function classifyJournalLine(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  lineId: string,
  input: { expectedVersion: number; departmentId?: string | null; projectId?: string | null; reason: string }
) {
  dimensionAccess(actor, 'accounting.configure');
  const refs = await dimensionRefs(db, input.departmentId, input.projectId),
    reason = dimensionText(input.reason, 800, true);
  const line = await db
    .prepare(
      `SELECT l.id FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
 JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id
 WHERE l.id=? AND e.status IN ('posted','reversed') AND t.category IN ('revenue','expense')`
    )
    .bind(lineId)
    .first();
  if (!line) throw new ValidationError('Choose a posted income or expense line.');
  const current = await db
    .prepare('SELECT version FROM accounting_journal_line_dimensions WHERE line_id=?')
    .bind(lineId)
    .first<{ version: number }>();
  if ((current?.version || 0) !== input.expectedVersion)
    throw new ValidationError('Classification changed. Reload before saving.');
  await db.batch([
    current
      ? db
          .prepare(
            "UPDATE accounting_journal_line_dimensions SET department_id=?,project_id=?,version=CASE WHEN version=? THEN version+1 ELSE NULL END,updated_by=?,updated_at=datetime('now') WHERE line_id=?"
          )
          .bind(refs.departmentId, refs.projectId, current.version, actor.id, lineId)
      : db
          .prepare(
            'INSERT INTO accounting_journal_line_dimensions(line_id,department_id,project_id,updated_by) VALUES(?,?,?,?)'
          )
          .bind(lineId, refs.departmentId, refs.projectId, actor.id),
    db
      .prepare(
        'INSERT INTO accounting_dimension_audit(id,entity_type,entity_id,action,actor_id,detail) VALUES(?,?,?,?,?,?)'
      )
      .bind(crypto.randomUUID(), 'journal_line', lineId, 'classified', actor.id, JSON.stringify({ ...refs, reason })),
  ]);
  return db.prepare('SELECT * FROM accounting_journal_line_dimensions WHERE line_id=?').bind(lineId).first();
}
