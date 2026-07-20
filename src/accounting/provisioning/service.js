import { AccountingDatabaseError } from "../errors.js";
import { ACCOUNTING_FOUNDATION_MIGRATION, ACCOUNTING_FOUNDATION_TABLES, FORBIDDEN_PHASE_1B_TABLE_FRAGMENTS } from "./migration.js";
import { deterministicAccountingDatabaseName } from "./naming.js";

function rows(result) { return result?.[0]?.results || result?.results || []; }

export async function validateProvisionedAccountingDatabase(adapter, providerId) {
  const tableResult = await adapter.execute(providerId, "SELECT name FROM sqlite_master WHERE type = 'table'");
  const names = rows(tableResult).map((row) => String(row.name));
  const missing = ACCOUNTING_FOUNDATION_TABLES.filter((name) => !names.includes(name));
  const forbidden = names.filter((name) => FORBIDDEN_PHASE_1B_TABLE_FRAGMENTS.some((fragment) => name.toLowerCase().includes(fragment)) && !ACCOUNTING_FOUNDATION_TABLES.includes(name));
  const migrationResult = await adapter.execute(providerId, "SELECT version, checksum FROM accounting_migrations WHERE version = ?", [ACCOUNTING_FOUNDATION_MIGRATION.version]);
  const migration = rows(migrationResult)[0];
  const drift = migration && migration.checksum !== ACCOUNTING_FOUNDATION_MIGRATION.checksum;
  return { ok: missing.length === 0 && forbidden.length === 0 && Boolean(migration) && !drift, missing, forbidden, drift: Boolean(drift) };
}

export async function provisionAccountingDatabase({ adapter, parishId, environment }) {
  const name = await deterministicAccountingDatabaseName({ parishId, environment });
  const database = await adapter.findByName(name) || await adapter.create(name);
  await adapter.execute(database.providerId, ACCOUNTING_FOUNDATION_MIGRATION.statements[1]);
  const existing = rows(await adapter.execute(database.providerId, "SELECT version, checksum FROM accounting_migrations WHERE version = ?", [ACCOUNTING_FOUNDATION_MIGRATION.version]))[0];
  if (existing && existing.checksum !== ACCOUNTING_FOUNDATION_MIGRATION.checksum) throw new AccountingDatabaseError("Accounting migration checksum drift was detected.");
  if (!existing) {
    for (const statement of ACCOUNTING_FOUNDATION_MIGRATION.statements) await adapter.execute(database.providerId, statement);
    await adapter.execute(database.providerId, "INSERT OR IGNORE INTO accounting_migrations (version, checksum) VALUES (?, ?)", [ACCOUNTING_FOUNDATION_MIGRATION.version, ACCOUNTING_FOUNDATION_MIGRATION.checksum]);
  }
  const validation = await validateProvisionedAccountingDatabase(adapter, database.providerId);
  if (!validation.ok) throw new AccountingDatabaseError("Accounting database validation failed.", { details: validation });
  return { name, providerId: database.providerId, schemaVersion: ACCOUNTING_FOUNDATION_MIGRATION.schemaVersion, migrationVersion: ACCOUNTING_FOUNDATION_MIGRATION.version, validation };
}
