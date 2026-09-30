import { configurationChangedSql } from './configuration.js';
import { inspectStorage, tableScope, quoted } from '../portability/catalog.js';
import { inspectBooks } from '../portability/accounting.js';
import { assertStorageDrained } from '../portability/storage.js';
import { sha256 } from '../portability/archive.js';
import { query, rows, fail, PRESERVED } from './storage.js';

async function guardHash(db, books) {
  const sql =
    "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND (name LIKE 'recovery_%' OR name LIKE 'parish_recovery_%') ORDER BY name";
  return sha256(JSON.stringify([await rows(db, sql), books ? await rows(books, sql) : null]));
}

async function verifyDefinitions(db, definitions) {
  const actual = new Map(
    (await rows(db, "SELECT name,sql FROM sqlite_master WHERE type='trigger'")).map((row) => [row.name, row.sql])
  );
  const normalize = (sql) =>
    String(sql)
      .replace(/IF NOT EXISTS\s+/gi, '')
      .replace(/\s+/g, '')
      .replace(/;$/, '')
      .toLowerCase();
  for (const sql of definitions) {
    const name = sql.match(/EXISTS "([^"]+)"/)[1];
    if (normalize(actual.get(name)) !== normalize(sql))
      fail('recovery_lock_changed', 'The installed write barrier does not match the reviewed definition.');
  }
}

export async function freeze(env, op, books) {
  const db = env.AGAPAY_DB;
  const statements = [];
  const centralDefinitions = [];
  const migrationGuards = new Set(
    (await rows(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'parish_recovery_%'")).map(
      (row) => row.name
    )
  );
  for (const name of [
    'storage_fence',
    'closure_fence',
    'export_fence',
    'admission_fence',
    'retention_immutable_update',
    'retention_immutable_delete',
  ]) {
    if (!migrationGuards.has('parish_recovery_' + name))
      fail('recovery_migration_incomplete', 'Recovery safeguards are not fully installed.');
  }
  // Triggers protect writes from HTTP, jobs, webhooks, and in-flight requests.
  for (const item of await inspectStorage(db)) {
    if (
      !item.scope ||
      item.classification === 'credentials' ||
      (PRESERVED.has(item.name) && !['accounting_entities', 'accounting_databases'].includes(item.name))
    )
      continue;
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      const refs = event === 'UPDATE' ? ['OLD', 'NEW'] : [event === 'INSERT' ? 'NEW' : 'OLD'];
      const scope = refs
        .map((ref) => '(' + tableScope(item.name, ref).replaceAll('?1', 'l.parish_id') + ')')
        .join(' OR ');
      const sql = `CREATE TRIGGER IF NOT EXISTS ${quoted('recovery_' + item.name + '_' + event.toLowerCase())} BEFORE ${event} ON ${quoted(item.name)} WHEN EXISTS(SELECT 1 FROM parish_recovery_locks l WHERE l.phase='frozen' AND (l.scope='parish' ${item.name.startsWith('accounting_') ? "OR l.scope='accounting'" : ''}) AND (${scope}) ${item.name === 'registrations' && event === 'UPDATE' ? 'AND (' + configurationChangedSql() + ')' : ''}) BEGIN SELECT RAISE(ABORT,'PARISH_RECOVERY_WRITE_BLOCKED'); END`;
      centralDefinitions.push(sql);
      statements.push(db.prepare(sql));
    }
  }
  statements.push(
    query(
      db,
      'INSERT INTO parish_recovery_locks(parish_id,operation_id,scope) VALUES(?,?,?) ON CONFLICT(parish_id) DO NOTHING',
      op.parish_id,
      op.id,
      op.scope
    )
  );
  await db.batch(statements);
  await verifyDefinitions(db, centralDefinitions);
  const lock = await query(db, 'SELECT * FROM parish_recovery_locks WHERE parish_id=?', op.parish_id).first();
  if (lock?.operation_id !== op.id) fail('recovery_busy', 'Another recovery operation holds this parish.');
  if (books) {
    const bookDefinitions = [];
    const defs = [
      books.prepare(
        'CREATE TABLE IF NOT EXISTS recovery_lock (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, phase TEXT NOT NULL)'
      ),
    ];
    const bookInventory = await inspectBooks(books);
    for (const { name } of [...bookInventory.tables, ...bookInventory.emptyLegacyTables])
      for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
        const sql = `CREATE TRIGGER IF NOT EXISTS ${quoted('recovery_' + name + '_' + event.toLowerCase())} BEFORE ${event} ON ${quoted(name)} WHEN EXISTS(SELECT 1 FROM recovery_lock WHERE phase='frozen') BEGIN SELECT RAISE(ABORT,'ACCOUNTING_RECOVERY_WRITE_BLOCKED'); END`;
        bookDefinitions.push(sql);
        defs.push(books.prepare(sql));
      }
    defs.push(
      query(books, "INSERT OR IGNORE INTO recovery_lock(id,operation_id,phase) VALUES('primary',?,'frozen')", op.id)
    );
    await books.batch(defs);
    await verifyDefinitions(books, bookDefinitions);
    const held = await query(books, "SELECT operation_id FROM recovery_lock WHERE id='primary'").first();
    if (held?.operation_id !== op.id) fail('recovery_busy', 'Another operation holds the accounting books.');
  }
  await assertStorageDrained(env, op.parish_id);
  await query(
    db,
    'UPDATE parish_recovery_operations SET guard_hash=? WHERE id=?',
    await guardHash(db, books),
    op.id
  ).run();
}

export async function assertFrozen(env, op, books) {
  const lock = await query(
    env.AGAPAY_DB,
    "SELECT operation_id FROM parish_recovery_locks WHERE parish_id=? AND phase='frozen'",
    op.parish_id
  ).first();
  if (lock?.operation_id !== op.id)
    fail('recovery_lock_missing', 'The recovery lock is missing. No restore can proceed.');
  if (
    books &&
    (await query(books, "SELECT operation_id FROM recovery_lock WHERE id='primary' AND phase='frozen'").first())
      ?.operation_id !== op.id
  )
    fail('recovery_lock_missing', 'The accounting recovery lock is missing.');
  if (!op.guard_hash || (await guardHash(env.AGAPAY_DB, books)) !== op.guard_hash)
    fail('recovery_lock_changed', 'The database write safeguards changed. Recovery requires review.');
  await assertStorageDrained(env, op.parish_id);
}

export async function unfreeze(env, op, books) {
  if (books && (await query(books, "SELECT 1 FROM sqlite_master WHERE name='recovery_lock'").first()))
    await query(books, 'DELETE FROM recovery_lock WHERE operation_id=?', op.id).run();
  await query(
    env.AGAPAY_DB,
    'DELETE FROM parish_recovery_locks WHERE parish_id=? AND operation_id=?',
    op.parish_id,
    op.id
  ).run();
}
