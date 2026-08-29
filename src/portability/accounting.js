import { loadAccountingDatabaseProviderRecord } from '../accounting/control-plane.js';
import { detectAccountingEnvironment } from '../accounting/environment.js';
import { createBoundD1ProvisioningAdapter, createD1DatabaseFacade } from '../accounting/provisioning/adapters.js';
import { PORTABILITY_SCHEMA } from './accounting-schema.js';
import { PortabilityError, quoted, exportRow, MAX_TABLE_ROWS, MAX_EXPORT_BYTES, D1_SYSTEM_TABLES, schemaMetadata } from './catalog.js';
import { accountingLegacyColumns } from './accounting-legacy.js';

export async function resolvePortabilityBooks(env, parishId, entities) {
  if (!entities.length) return null;
  if (entities.length !== 1 || entities[0].parish_id !== parishId) throw new PortabilityError('accounting_owner_mismatch', 'Accounting ownership must be reconciled before export.');
  const provider = await loadAccountingDatabaseProviderRecord(env, entities[0].id, detectAccountingEnvironment(env));
  if (!provider) throw new PortabilityError('accounting_unavailable', 'The parish accounting registry is incomplete.', 503);
  const adapter = createBoundD1ProvisioningAdapter(env);
  const physical = await adapter.findByName(provider.databaseIdentifier);
  if (!physical) throw new PortabilityError('accounting_unavailable', 'The parish accounting database must be bound to the exporter.', 503);
  const db = createD1DatabaseFacade(adapter, physical.providerId);
  const identity = await db.prepare("SELECT value FROM accounting_database_metadata WHERE key = 'parish_id'").first();
  if (identity?.value !== parishId) throw new PortabilityError('accounting_owner_mismatch', 'Accounting database identity does not match this parish.');
  return db;
}

async function inspectBooks(db) {
  const names = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;
  const reviewed = names.filter(({name}) => !D1_SYSTEM_TABLES.has(name) && !['accounting_portability_lock','accounting_portability_secrets'].includes(name));
  for (const {name} of reviewed) if (!PORTABILITY_SCHEMA[name] && !accountingLegacyColumns(name)) throw new PortabilityError('accounting_schema_unknown', `Accounting export needs a storage review for ${name}.`);
  const metadata = await schemaMetadata(db, reviewed.map(t=>t.name));
  const tables = [], emptyLegacyTables = [];
  for (const { name } of names) {
    if (D1_SYSTEM_TABLES.has(name) || name === 'accounting_portability_lock' || name === 'accounting_portability_secrets') continue;
    const legacyColumns = accountingLegacyColumns(name);
    const known = PORTABILITY_SCHEMA[name] || legacyColumns;
    if (!known) throw new PortabilityError('accounting_schema_unknown', `Accounting export needs a storage review for ${name}.`);
    const columns = metadata.get(name);
    if (columns.some(column => !known.includes(column.name))) throw new PortabilityError('accounting_schema_unknown', `Accounting export needs a field review for ${name}.`);
    if (legacyColumns) {
      if (await db.prepare(`SELECT 1 AS found FROM ${quoted(name)} LIMIT 1`).first()) throw new PortabilityError('accounting_legacy_data_requires_review', `Unexpected legacy data in accounting table ${name} requires ownership and migration review.`);
      emptyLegacyTables.push({ name });
      continue;
    }
    tables.push({name,columns});
  }
  return {tables,emptyLegacyTables};
}

export async function collectAccountingRecords(env, parishId, entities) {
  const db = await resolvePortabilityBooks(env, parishId, entities);
  if (!db) return { tables: [], attachments: [], holds: [] };
  const inventory = await inspectBooks(db);
  const tables = [], attachments = [], holds = [];
  let bytes = 0;
  for (const {name,columns} of inventory.tables) {
    const size = await db.prepare(`SELECT count(*) n, COALESCE(SUM(${columns.map(c => `COALESCE(length(CAST(${quoted(c.name)} AS BLOB)),0)`).join('+')}),0) bytes FROM ${quoted(name)}`).first();
    bytes += Number(size.bytes);
    if (Number(size.n) > MAX_TABLE_ROWS || bytes > MAX_EXPORT_BYTES / 2) throw new PortabilityError('accounting_export_too_large', 'The books exceed self-service limits. Contact support for a full accounting export.', 413);
    const raw = (await db.prepare(`SELECT * FROM ${quoted(name)} ORDER BY ${columns.map(c => quoted(c.name)).join(',')} LIMIT ${MAX_TABLE_ROWS + 1}`).all()).results;
    if (raw.length > MAX_TABLE_ROWS) throw new PortabilityError('accounting_export_too_large', 'The books changed during export. Please retry.', 413);
    tables.push({ name, rows: raw.map(row => exportRow(name, row)).filter(Boolean) });
    if (name === 'accounting_attachments') for (const row of raw) if (row.storage_status === 'stored' && !row.deleted_at) attachments.push(row);
    if (name === 'accounting_legal_holds') holds.push(...raw.filter(row => row.status === 'active').map(row => ({ id: row.id, entityType: row.entity_type, entityId: row.entity_id })));
  }
  return { tables, attachments, holds, emptyLegacyTables:inventory.emptyLegacyTables };
}

export async function freezeAccountingBooks(env, job, { requireExisting = false } = {}) {
  const names = (await env.AGAPAY_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_entities'").all()).results;
  if (!names.length) return null;
  const entities = (await env.AGAPAY_DB.prepare('SELECT * FROM accounting_entities WHERE parish_id=?').bind(job.parish_id).all()).results;
  const db = await resolvePortabilityBooks(env, job.parish_id, entities);
  if (!db) return null;
  // Inspect all actual tables before constructing triggers. Existing immutable
  // journal/close triggers remain installed and are never bypassed.
  const snapshot = await inspectBooks(db);
  const existing = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_portability_lock'").first();
  const lockBefore = existing && await db.prepare("SELECT * FROM accounting_portability_lock WHERE id='closure'").first();
  if (requireExisting && !lockBefore) throw new PortabilityError('accounting_barrier_invalid', 'The accounting freeze disappeared during confirmation.');
  if (lockBefore && !['preparing','retained'].includes(lockBefore.phase)) throw new PortabilityError('accounting_barrier_invalid', 'The accounting freeze is not in a safe phase.');
  const statements = [db.prepare("CREATE TABLE IF NOT EXISTS accounting_portability_lock (id TEXT PRIMARY KEY CHECK(id='closure'),job_id TEXT NOT NULL,parish_id TEXT NOT NULL,phase TEXT NOT NULL DEFAULT 'preparing' CHECK(phase IN ('preparing','purging_credentials','retained')),created_at INTEGER NOT NULL)"),db.prepare('CREATE TABLE IF NOT EXISTS accounting_portability_secrets (key TEXT PRIMARY KEY)')];
  const metadata = (await db.prepare('SELECT key,value FROM accounting_database_metadata').all()).results;
  for (const row of metadata) if (!exportRow('accounting_database_metadata',row)) statements.push(db.prepare('INSERT OR IGNORE INTO accounting_portability_secrets(key) VALUES(?)').bind(row.key));
  const triggers = [];
  for (const { name } of [...snapshot.tables,...(snapshot.emptyLegacyTables || [])]) for (const event of ['INSERT','UPDATE','DELETE']) {
    const trigger = 'portability_freeze_' + name + '_' + event.toLowerCase();
    const credentialException = name === 'accounting_database_metadata' && event === 'DELETE' ? " WHERE phase<>'purging_credentials' OR NOT EXISTS(SELECT 1 FROM accounting_portability_secrets WHERE key=OLD.key)" : '';
    const sql = `CREATE TRIGGER IF NOT EXISTS ${quoted(trigger)} BEFORE ${event} ON ${quoted(name)} WHEN EXISTS(SELECT 1 FROM accounting_portability_lock${credentialException}) BEGIN SELECT RAISE(ABORT,'ACCOUNTING_CLOSURE_WRITE_BLOCKED'); END`;
    triggers.push({ name: trigger, sql }); statements.push(db.prepare(sql));
  }
  statements.push(db.prepare("INSERT OR IGNORE INTO accounting_portability_lock(id,job_id,parish_id,created_at) VALUES('closure',?,?,?)").bind(job.id, job.parish_id, Date.now()));
  // On later phases, verify the original freeze; never silently repair missing
  // triggers after data may have changed across an invocation boundary.
  if (!lockBefore) await db.batch(statements);
  const lock = await db.prepare("SELECT * FROM accounting_portability_lock WHERE id='closure'").first();
  if (lock?.job_id !== job.id || lock?.parish_id !== job.parish_id) throw new PortabilityError('accounting_lock_conflict', 'Accounting closure belongs to another job.');
  const actual = new Map((await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'portability_freeze_%'").all()).results.map(row => [row.name, row.sql]));
  const normalize = sql => String(sql).replace(/IF NOT EXISTS\s+/gi,'').replace(/\s+/g,'').replace(/;$/,'').toLowerCase();
  for (const trigger of triggers) if (normalize(actual.get(trigger.name)) !== normalize(trigger.sql)) throw new PortabilityError('accounting_barrier_invalid', 'The accounting write barrier does not match the reviewed definition.');
  return db;
}

export async function purgeAccountingCredentials(db,job) {
  if (!db) return;
  const lock = await db.prepare("SELECT * FROM accounting_portability_lock WHERE id='closure'").first();
  if (!job.confirmed_at || lock?.job_id !== job.id || lock.parish_id !== job.parish_id) throw new PortabilityError('accounting_closure_unauthorized','Accounting credential removal requires confirmed closure.');
  // The narrow, temporary exception applies only to classified credential keys
  // in technical metadata. All journal/audit immutability triggers remain active.
  await db.batch([
    db.prepare("UPDATE accounting_portability_lock SET phase='purging_credentials' WHERE id='closure' AND job_id=?").bind(job.id),
    db.prepare('DELETE FROM accounting_database_metadata WHERE key IN (SELECT key FROM accounting_portability_secrets)'),
    db.prepare('DELETE FROM accounting_portability_secrets'),
    db.prepare("UPDATE accounting_portability_lock SET phase='retained' WHERE id='closure' AND job_id=?").bind(job.id),
  ]);
}

export async function releaseAccountingFreeze(env, job) {
  const exists = await env.AGAPAY_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_entities'").first();
  if (!exists) return;
  const entities = (await env.AGAPAY_DB.prepare('SELECT * FROM accounting_entities WHERE parish_id=?').bind(job.parish_id).all()).results;
  const db = await resolvePortabilityBooks(env, job.parish_id, entities);
  if (!db || !await db.prepare("SELECT name FROM sqlite_master WHERE name='accounting_portability_lock'").first()) return;
  await db.prepare("DELETE FROM accounting_portability_lock WHERE id='closure' AND job_id=? AND parish_id=?").bind(job.id,job.parish_id).run();
}
