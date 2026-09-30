import { registrationProjection } from './configuration.js';
import { quoted, schemaMetadata } from '../portability/catalog.js';
import { query, rows, fail, inventory, schemaHash, EXTERNAL } from './storage.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identity = (t, r) => JSON.stringify(t.pk.map((k) => r[k]));

export function validateLedger(snapshot) {
  if (!snapshot) return;
  const byName = new Map(snapshot.tables.map((t) => [t.name, t.rows]));
  const entries = byName.get('accounting_journal_entries');
  if (!entries) return;
  const lines = byName.get('accounting_journal_lines') || [];
  const accounts = new Set((byName.get('accounting_accounts') || []).map((r) => r.id));
  const funds = new Set((byName.get('accounting_funds') || []).map((r) => r.id));
  const totals = new Map(entries.map((e) => [e.id, { debit: 0, credit: 0 }]));
  for (const line of lines) {
    if (!totals.has(line.journal_entry_id) || !accounts.has(line.account_id) || !funds.has(line.fund_id))
      fail('recovery_ledger_invalid', 'The snapshot contains a broken accounting reference.');
    const sum = totals.get(line.journal_entry_id);
    sum.debit += line.debit_amount;
    sum.credit += line.credit_amount;
  }
  for (const entry of entries)
    if (['posted', 'reversed'].includes(entry.status)) {
      const sum = totals.get(entry.id);
      if (
        !sum.debit ||
        sum.debit !== sum.credit ||
        sum.debit !== entry.total_debits ||
        sum.credit !== entry.total_credits
      )
        fail('recovery_ledger_invalid', 'The snapshot contains an unbalanced posted journal.');
    }
}

export async function planDatabase(db, kind, parishId, target) {
  if (!db || !target) {
    if (db || target) fail('recovery_books_changed', 'Accounting activation changed since this snapshot.');
    return null;
  }
  if ((await schemaHash(db)) !== target.schema)
    fail(
      'recovery_schema_changed',
      'The database structure changed since this snapshot. A reviewed recovery is required.'
    );
  if ((await rows(db, 'PRAGMA foreign_key_check')).length)
    fail('recovery_integrity_failed', 'Existing database references need repair before self-service recovery.');
  if (
    kind === 'books' &&
    (await query(db, "SELECT 1 FROM sqlite_master WHERE name='accounting_legal_holds'").first()) &&
    (await query(db, "SELECT 1 FROM accounting_legal_holds WHERE status='active' LIMIT 1").first())
  )
    fail('recovery_legal_hold', 'An active accounting hold requires a reviewed recovery.');
  const items = await inventory(db, kind);
  if (
    !equal(
      items.map((t) => [t.name, t.columns, t.pk]),
      target.tables.map((t) => [t.name, t.columns, t.pk])
    )
  )
    fail('recovery_schema_changed', 'The snapshot inventory no longer matches the database.');
  if (kind === 'books') validateLedger(target);
  const changes = [];
  for (const item of items) {
    const saved = target.tables.find((t) => t.name === item.name);
    let current = await rows(
      db,
      `SELECT * FROM ${quoted(item.name)} t WHERE ${item.scope} ORDER BY ${item.pk.map(quoted).join(',')}`,
      ...(kind === 'central' ? [parishId] : [])
    );
    if (item.name === 'registrations') current = current.map(registrationProjection);
    if (equal(current, saved.rows)) continue;
    if (EXTERNAL.test(item.name))
      fail(
        'recovery_external_activity',
        'Payment or external-source records changed after this backup. Self-service rollback is blocked so real transactions are not lost or repeated. Contact support for reconciliation.'
      );
    if (
      item.name === 'registrations' &&
      !equal(
        current.map((r) => r.reference),
        saved.rows.map((r) => r.reference)
      )
    )
      fail('recovery_registration_changed', 'Parish ownership records changed since the snapshot.');
    const oldIds = new Set(saved.rows.map((r) => identity(item, r)));
    // Global PK collisions must not become an upsert into another tenant.
    const currentById = new Map(current.map((r) => [identity(item, r), r]));
    for (const row of saved.rows.filter((r) => !equal(r, currentById.get(identity(item, r))))) {
      const existing = await query(
        db,
        `SELECT 1 FROM ${quoted(item.name)} t WHERE ${item.pk.map((k) => `t.${quoted(k)} IS ?`).join(' AND ')} ${kind === 'central' ? `AND NOT (${item.scope.replaceAll('?1', '?')})` : ''}`,
        ...item.pk.map((k) => row[k]),
        ...(kind === 'central' ? [...item.scope.matchAll(/\?1/g)].map(() => parishId) : [])
      ).first();
      if (kind === 'central' && existing)
        fail('recovery_owner_conflict', 'A snapshot record is now shared or owned outside this parish.');
    }
    changes.push({
      ...item,
      rows: saved.rows,
      current,
      removed: current.filter((r) => !oldIds.has(identity(item, r))),
    });
  }
  const allNames = (
    await rows(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
    )
  ).map((r) => r.name);
  const keys = await schemaMetadata(db, allNames, 'foreign_key_list');
  // Reject cross-boundary incoming references, including ON DELETE CASCADE.
  // Preserved rows are not silently modified to make a rollback fit.
  for (const parent of changes)
    for (const row of parent.removed)
      for (const [childName, fks] of keys) {
        const child = changes.find((t) => t.name === childName);
        for (const fk of fks.filter((k) => k.table === parent.name)) {
          if (!fk.to) fail('recovery_reference_unsupported', 'An implicit foreign key needs a recovery review.');
          const linked = await rows(db, `SELECT * FROM ${quoted(childName)} WHERE ${quoted(fk.from)} IS ?`, row[fk.to]);
          if (
            linked.some(
              (r) => !child || !child.removed.some((removed) => identity(child, r) === identity(child, removed))
            )
          )
            fail(
              'recovery_shared_reference',
              'A record still has a reference outside the rollback. Recovery needs review.'
            );
        }
      }
  // Children first for removal. Cycles use deferred FK checks; cascade safety
  // was checked above against every row that will be removed.
  const sorted = [],
    seen = new Set();
  function visit(t) {
    if (seen.has(t.name)) return;
    seen.add(t.name);
    for (const child of changes) if ((keys.get(child.name) || []).some((f) => f.table === t.name)) visit(child);
    sorted.push(t);
  }
  changes.forEach(visit);
  if (
    sorted.reduce(
      (n, t) =>
        n +
        t.rows.filter(
          (r) =>
            !equal(
              r,
              t.current.find((c) => identity(t, c) === identity(t, r))
            )
        ).length +
        t.removed.length +
        6,
      0
    ) > 850
  )
    fail(
      'recovery_transaction_too_large',
      'This restore exceeds the self-service transaction limit. Contact support; no records have been replaced.'
    );
  const affected = new Set(sorted.map((t) => t.name));
  const triggers = (
    await rows(db, "SELECT tbl_name FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")
  ).filter((t) => affected.has(t.tbl_name));
  const statementCount =
    1 +
    2 * triggers.length +
    sorted.reduce((sum, t) => {
      const current = new Map(t.current.map((r) => [identity(t, r), r]));
      return sum + t.removed.length + t.rows.filter((r) => !equal(r, current.get(identity(t, r)))).length;
    }, 0);
  return { changes: sorted, schema: target.schema, statementCount };
}

export async function applyDatabase(db, kind, op, target, plan) {
  if (!plan) return;
  const defs = await rows(db, "SELECT name,sql,tbl_name FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL");
  const affected = new Set(plan.changes.map((t) => t.name));
  const triggers = defs.filter((t) => affected.has(t.tbl_name));
  // The lock bypass, data replacement, and exact trigger reinstatement commit
  // together. A failed statement rolls back the entire database transaction.
  const statements = [db.prepare('PRAGMA defer_foreign_keys=ON')];
  for (const trigger of triggers) statements.push(db.prepare(`DROP TRIGGER ${quoted(trigger.name)}`));
  for (const t of plan.changes)
    for (const row of t.removed)
      statements.push(
        query(
          db,
          `DELETE FROM ${quoted(t.name)} WHERE ${t.pk.map((k) => `${quoted(k)} IS ?`).join(' AND ')}`,
          ...t.pk.map((k) => row[k])
        )
      );
  for (const t of [...plan.changes].reverse()) {
    const old = new Map(t.current.map((r) => [identity(t, r), r]));
    for (const row of t.rows) {
      if (equal(row, old.get(identity(t, row)))) continue;
      if (t.name === 'registrations') {
        statements.push(
          query(
            db,
            "UPDATE registrations SET data=json_patch(data,?),parish_name=json_extract(?,'$.parishName') WHERE reference=? AND parish_id=?",
            row.data,
            row.data,
            row.reference,
            op.parish_id
          )
        );
        continue;
      }
      const updates = t.columns.filter((c) => !t.pk.includes(c));
      statements.push(
        query(
          db,
          `INSERT INTO ${quoted(t.name)}(${t.columns.map(quoted).join(',')}) VALUES(${t.columns.map(() => '?').join(',')}) ON CONFLICT(${t.pk.map(quoted).join(',')}) DO ${updates.length ? 'UPDATE SET ' + updates.map((c) => `${quoted(c)}=excluded.${quoted(c)}`).join(',') : 'NOTHING'}`,
          ...t.columns.map((c) => row[c])
        )
      );
    }
  }
  for (const trigger of triggers) statements.push(db.prepare(trigger.sql));
  if (statements.length > 900)
    fail(
      'recovery_transaction_too_large',
      'The restore requires a larger transaction than self-service supports. No records in this database were changed.'
    );
  await db.batch(statements);
  if ((await rows(db, 'PRAGMA foreign_key_check')).length)
    fail('recovery_integrity_failed', 'Recovery found a broken database reference. The workspace remains locked.');
  if ((await schemaHash(db)) !== target.schema)
    fail(
      'recovery_integrity_failed',
      'Database protections did not match after recovery. The workspace remains locked.'
    );
}
