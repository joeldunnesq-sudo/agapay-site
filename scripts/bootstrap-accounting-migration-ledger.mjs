import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNTING_MIGRATION_TABLE,
  buildAccountingMigrationBaselineSql,
  loadAccountingMigrationManifest,
  planAccountingMigrationLedger,
  validateAccountingMigrationManifest,
} from './lib/accounting-migration-ledger.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = validateAccountingMigrationManifest(root, loadAccountingMigrationManifest(root));
const verifyOnly = process.argv.includes('--verify-only');
const databases = process.argv.filter((argument) => !argument.startsWith('--')).slice(2);
const targets = databases.length ? databases : ['ACCOUNTING_DB_ST_FIACRE', 'ACCOUNTING_DB_PHASE_G_CANARY'];

function wrangler(database, command) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    executable,
    ['--no-install', 'wrangler', 'd1', 'execute', database, '--remote', '--env', '', '--command', command, '--json'],
    { cwd: root, encoding: 'utf8', env: process.env }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler failed for ${database}.`);
  const payload = JSON.parse(result.stdout);
  return payload.flatMap((entry) => entry.results || []);
}

function inspectDatabase(database) {
  const rows = wrangler(
    database,
    `SELECT
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='${ACCOUNTING_MIGRATION_TABLE}') AS ledger_table,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_database_metadata') AS metadata_table,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_journal_entries') AS journal_entries,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_integration_source_events') AS source_events,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_funds') AS funds,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_settings') AS settings,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_attachments') AS attachments,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_payment_runs') AS payment_runs,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_migration_sessions') AS migration_sessions,
      EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_recurring_bill_schedules') AS recurring_bills,
      EXISTS(SELECT 1 FROM pragma_table_info('accounting_integration_source_events') WHERE name='commerce_channel') AS commerce_column,
      EXISTS(SELECT 1 FROM pragma_table_info('accounting_funds') WHERE name='giving_enabled') AS giving_column,
      EXISTS(SELECT 1 FROM pragma_table_info('accounting_settings') WHERE name='pledge_comparison_account_id') AS pledge_column`
  )[0];
  const stateValues = Object.entries(rows)
    .filter(([name]) => name !== 'ledger_table')
    .map(([, value]) => Number(value));
  const empty = Number(rows.metadata_table) === 0 && stateValues.every((value) => value === 0);
  const schemaCurrent = stateValues.every((value) => value === 1);
  let finalAccount = false;
  if (schemaCurrent) {
    finalAccount =
      Number(
        wrangler(database, "SELECT EXISTS(SELECT 1 FROM accounting_accounts WHERE id='acct_4200') AS present")[0]
          ?.present
      ) === 1;
  }
  return {
    tableExists: Number(rows.ledger_table) === 1,
    databaseState: empty ? 'empty' : schemaCurrent && finalAccount ? 'current' : 'incomplete',
  };
}

for (const database of targets) {
  const inspection = inspectDatabase(database);
  const appliedNames = inspection.tableExists
    ? wrangler(database, `SELECT name FROM "${ACCOUNTING_MIGRATION_TABLE}" ORDER BY id`).map((row) => row.name)
    : [];
  const plan = planAccountingMigrationLedger({ manifest, ...inspection, appliedNames });
  if (plan.mode === 'bootstrap') {
    if (verifyOnly) throw new Error(`${database} requires a one-time accounting migration ledger bootstrap.`);
    wrangler(database, buildAccountingMigrationBaselineSql(plan.missingBaseline, manifest.baselineThrough));
    console.log(
      `${database}: baselined ${plan.missingBaseline.length} existing migration(s) through ${manifest.baselineThrough}.`
    );
  } else {
    console.log(
      `${database}: migration ledger ${plan.mode === 'fresh' ? 'will initialize from migration 0001' : 'is ready'}.`
    );
  }
}
