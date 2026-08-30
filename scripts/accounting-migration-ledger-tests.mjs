import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNTING_MIGRATION_TABLE,
  baselineMigrationNames,
  buildAccountingMigrationBaselineSql,
  loadAccountingMigrationManifest,
  planAccountingMigrationLedger,
  validateAccountingMigrationManifest,
} from './lib/accounting-migration-ledger.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = validateAccountingMigrationManifest(root, loadAccountingMigrationManifest(root));
const baseline = baselineMigrationNames(manifest);

assert.equal(baseline.length, 25, 'the one-time production baseline must stop at the known deployed migration 0025');
assert.equal(baseline.at(-1), manifest.baselineThrough);

assert.deepEqual(
  planAccountingMigrationLedger({ manifest, tableExists: false, appliedNames: [], databaseState: 'empty' }),
  { mode: 'fresh', missingBaseline: [] },
  'a new database must apply every migration rather than receive a legacy baseline'
);
assert.equal(
  planAccountingMigrationLedger({ manifest, tableExists: false, appliedNames: [], databaseState: 'current' }).mode,
  'bootstrap',
  'an existing current production database must receive the one-time native ledger baseline'
);
assert.equal(
  planAccountingMigrationLedger({
    manifest,
    tableExists: true,
    appliedNames: baseline.slice(0, 10),
    databaseState: 'current',
  }).missingBaseline.length,
  15,
  'an interrupted baseline may safely resume from its ordered prefix'
);
assert.equal(
  planAccountingMigrationLedger({ manifest, tableExists: true, appliedNames: baseline, databaseState: 'current' }).mode,
  'ready'
);
assert.equal(
  planAccountingMigrationLedger({
    manifest,
    tableExists: true,
    appliedNames: baseline.slice(0, 2),
    databaseState: 'incomplete',
  }).mode,
  'ready',
  'a fresh database with an interrupted native migration run must resume instead of receiving a legacy baseline'
);
assert.throws(
  () => planAccountingMigrationLedger({ manifest, tableExists: false, appliedNames: [], databaseState: 'incomplete' }),
  /refusing to baseline/,
  'an incomplete legacy database must fail closed'
);
assert.throws(
  () =>
    planAccountingMigrationLedger({
      manifest,
      tableExists: true,
      appliedNames: [baseline[1]],
      databaseState: 'current',
    }),
  /ledger drift/,
  'an out-of-order native migration ledger must fail closed'
);

const sql = buildAccountingMigrationBaselineSql(baseline, manifest.baselineThrough);
assert.match(sql, new RegExp(ACCOUNTING_MIGRATION_TABLE));
assert.equal((sql.match(/INSERT OR IGNORE INTO/g) || []).length, 25);
assert.match(sql, /native_migration_baseline/);

const wrangler = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
const deployBlock = workflow.slice(workflow.indexOf('  deploy:'), workflow.indexOf('  post-deploy-accounting-smoke:'));
for (const binding of ['ACCOUNTING_DB_ST_FIACRE', 'ACCOUNTING_DB_PHASE_G_CANARY']) {
  const bindingStart = wrangler.indexOf(`binding = "${binding}"`);
  const bindingBlock = wrangler.slice(bindingStart, wrangler.indexOf('\n[[', bindingStart + 3));
  assert.match(bindingBlock, /migrations_dir = "accounting-migrations"/);
  assert.match(bindingBlock, /migrations_table = "_agapay_d1_migrations"/);
  assert.ok(workflow.includes(`d1 migrations apply ${binding} --remote`));
}
assert.ok(workflow.includes('node scripts/bootstrap-accounting-migration-ledger.mjs'));
assert.ok(!workflow.includes('d1 execute ACCOUNTING_DB_ST_FIACRE --remote --file accounting-migrations/0025'));
assert.ok(
  deployBlock.indexOf('run: npm ci') < deployBlock.indexOf('node scripts/bootstrap-accounting-migration-ledger.mjs'),
  'the deploy job must install its locked Wrangler before running the migration bootstrap'
);

console.log(
  'PASS - immutable accounting migration manifest, safe legacy baseline, and automatic production application'
);
