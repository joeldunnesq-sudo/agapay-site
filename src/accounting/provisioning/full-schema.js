import { digest } from '../csv-utils.js';
import { initializeLedgerChart, validateLedgerFoundation } from '../ledger/service.js';
import { initializeAccountingSetup } from '../setup/service.js';

export const provisioningActor = Object.freeze({
  id: 'accounting_provisioner',
  type: 'system',
  capabilities: ['accounting.configure', 'accounting.view'],
});

export async function applyAccountingMigration(db, migration) {
  const sql = migration.sql.replaceAll('\r\n', '\n');
  if ((await digest(sql)) !== migration.sha256) throw new Error('Accounting migration checksum mismatch.');
  const applied = await db
    .prepare('SELECT checksum FROM accounting_migrations WHERE version=?')
    .bind(migration.name)
    .first();
  if (applied) {
    if (applied.checksum !== migration.sha256) throw new Error('Accounting migration checksum drift.');
    return;
  }
  // D1 executes a batch transaction, including its immutable migration markers.
  // SQL is release-owned. A multi-statement migration is kept intact (including triggers).
  await db.batch([
    db.prepare(sql),
    db
      .prepare('INSERT INTO accounting_migrations(version,checksum) VALUES(?,?)')
      .bind(migration.name, migration.sha256),
    db.prepare('INSERT INTO _agapay_d1_migrations(name) VALUES(?)').bind(migration.name),
  ]);
}

export async function prepareAccountingMigrationLedger(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS accounting_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS _agapay_d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);`
    )
    .run();
}

export async function seedBeforeIntegrationMigration(db, migration) {
  if (migration.name.startsWith('0005_')) await initializeLedgerChart(db, { actor: provisioningActor });
}

export async function initializeProvisionedCalendar(db, options, reference) {
  await initializeAccountingSetup(db, {
    actor: provisioningActor,
    date: new Date(`${options.startDate}T12:00:00Z`),
    fiscalYearStartMonth: options.fiscalYearStartMonth,
    correlationId: reference,
  });
  await db.batch([
    db
      .prepare(
        `UPDATE accounting_settings SET fiscal_year_start_month=?,opening_balances_disposition='pending' WHERE id='primary' AND setup_completed_at IS NULL`
      )
      .bind(options.fiscalYearStartMonth),
    db
      .prepare(
        `UPDATE accounting_integration_settings SET integration_start_date=?,give_posting_enabled=0,stripe_posting_enabled=0,posting_mode='review_required' WHERE id='give_stripe'`
      )
      .bind(options.startDate),
  ]);
}

export async function validateProvisionedBooks(db, parishId, migrations) {
  const owner = await db.prepare("SELECT value FROM accounting_database_metadata WHERE key='parish_id'").first();
  if (owner?.value !== parishId) throw new Error('Accounting ownership check failed.');
  const integrity = (await db.prepare('PRAGMA quick_check').all()).results;
  const foreignKeys = (await db.prepare('PRAGMA foreign_key_check').all()).results;
  const ledger = await validateLedgerFoundation(db);
  const applied = (await db.prepare('SELECT version,checksum FROM accounting_migrations').all()).results;
  if (
    integrity.length !== 1 ||
    Object.values(integrity[0])[0] !== 'ok' ||
    foreignKeys.length ||
    !ledger.ok ||
    migrations.some((m) => !applied.some((a) => a.version === m.name && a.checksum === m.sha256))
  )
    throw new Error('Accounting validation did not pass.');
  return true;
}
