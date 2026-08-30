import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const ACCOUNTING_MIGRATION_TABLE = '_agapay_d1_migrations';

function migrationNames(manifest) {
  return manifest.migrations.map((migration) => migration.name);
}

export function loadAccountingMigrationManifest(rootDir) {
  const manifestPath = path.join(rootDir, 'accounting-migrations', 'manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function validateAccountingMigrationManifest(rootDir, manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.migrations) || !manifest.migrations.length) {
    throw new Error('Accounting migration manifest must use version 1 and contain migrations.');
  }

  const names = migrationNames(manifest);
  const files = readdirSync(path.join(rootDir, 'accounting-migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(files)) {
    throw new Error('Accounting migration manifest must list every SQL migration exactly once in filename order.');
  }
  if (!names.includes(manifest.baselineThrough)) {
    throw new Error('Accounting migration baseline must name a migration in the manifest.');
  }

  for (const migration of manifest.migrations) {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(migration.name)) {
      throw new Error(`Invalid accounting migration filename: ${migration.name}`);
    }
    const sql = readFileSync(path.join(rootDir, 'accounting-migrations', migration.name), 'utf8').replaceAll(
      '\r\n',
      '\n'
    );
    const actual = createHash('sha256').update(sql).digest('hex');
    if (actual !== migration.sha256) {
      throw new Error(`Accounting migration checksum drift: ${migration.name}`);
    }
  }

  return manifest;
}

export function baselineMigrationNames(manifest, baselineThrough = manifest.baselineThrough) {
  const baselineIndex = migrationNames(manifest).indexOf(baselineThrough);
  if (baselineIndex < 0) throw new Error(`Unknown accounting migration baseline: ${baselineThrough}`);
  return migrationNames(manifest).slice(0, baselineIndex + 1);
}

export function planAccountingMigrationLedger({
  manifest,
  tableExists,
  appliedNames,
  databaseState,
  detectedAppliedNames = [],
  detectedBaselineMarker,
}) {
  const expectedNames = migrationNames(manifest);
  const applied = [...appliedNames];
  const expected = new Set(expectedNames);

  for (const name of applied) {
    if (!expected.has(name)) throw new Error(`Accounting migration ledger contains an unknown migration: ${name}`);
  }
  if (new Set(applied).size !== applied.length)
    throw new Error('Accounting migration ledger contains duplicate names.');

  if (!tableExists && databaseState === 'empty') {
    return Object.freeze({ mode: 'fresh', missingBaseline: [] });
  }

  if (!tableExists && databaseState === 'legacy' && detectedAppliedNames.length) {
    for (const name of detectedAppliedNames) {
      if (!expected.has(name)) throw new Error(`Unknown detected accounting migration: ${name}`);
    }
    return Object.freeze({
      mode: 'bootstrap',
      missingBaseline: [...detectedAppliedNames],
      baselineThrough: detectedBaselineMarker || 'selective-legacy-baseline',
    });
  }

  if (tableExists && databaseState !== 'current') {
    return Object.freeze({ mode: 'ready', missingBaseline: [] });
  }
  const baselineNames = baselineMigrationNames(manifest);
  const appliedSet = new Set(applied);
  const missingBaseline = baselineNames.filter((name) => !appliedSet.has(name));
  if (missingBaseline.length) {
    if (databaseState !== 'current') {
      throw new Error('Existing accounting schema is incomplete; refusing to baseline its migration ledger.');
    }
    return Object.freeze({ mode: 'bootstrap', missingBaseline, baselineThrough: manifest.baselineThrough });
  }

  return Object.freeze({ mode: 'ready', missingBaseline: [] });
}

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildAccountingMigrationBaselineSql(missingNames, baselineThrough) {
  const inserts = missingNames
    .map((name) => `INSERT OR IGNORE INTO "${ACCOUNTING_MIGRATION_TABLE}" (name) VALUES (${quoteSql(name)});`)
    .join('\n');
  return `CREATE TABLE IF NOT EXISTS "${ACCOUNTING_MIGRATION_TABLE}"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
${inserts}
INSERT INTO accounting_database_metadata(key,value)
VALUES('native_migration_baseline',${quoteSql(baselineThrough)})
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now');`;
}
