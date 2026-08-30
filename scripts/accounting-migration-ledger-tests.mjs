import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
const legacyPlan = planAccountingMigrationLedger({
  manifest,
  tableExists: false,
  appliedNames: [],
  databaseState: 'legacy',
  detectedAppliedNames: [...baseline.slice(0, 14), baseline[17], ...baseline.slice(21, 25)],
  detectedBaselineMarker: 'legacy-phase-g-selective-2026-08',
});
assert.equal(legacyPlan.mode, 'bootstrap');
assert.equal(legacyPlan.missingBaseline.length, 19);
assert.equal(legacyPlan.baselineThrough, 'legacy-phase-g-selective-2026-08');
assert.ok(!legacyPlan.missingBaseline.includes('0019_phase_l_attachments.sql'));
assert.equal(
  planAccountingMigrationLedger({
    manifest,
    tableExists: true,
    appliedNames: legacyPlan.missingBaseline,
    databaseState: 'legacy',
  }).mode,
  'ready',
  'an interrupted deployment must leave Wrangler free to apply the unrecorded migrations on retry'
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
  () => planAccountingMigrationLedger({ manifest, tableExists: false, appliedNames: [], databaseState: 'legacy' }),
  /refusing to baseline/,
  'a legacy schema without an exact detected prefix must fail closed'
);
assert.throws(
  () =>
    planAccountingMigrationLedger({
      manifest,
      tableExists: true,
      appliedNames: ['unknown.sql'],
      databaseState: 'current',
    }),
  /unknown migration/,
  'an unknown native migration ledger entry must fail closed'
);

const sql = buildAccountingMigrationBaselineSql(baseline, manifest.baselineThrough);
assert.match(sql, new RegExp(ACCOUNTING_MIGRATION_TABLE));
assert.equal((sql.match(/INSERT OR IGNORE INTO/g) || []).length, 25);
assert.match(sql, /native_migration_baseline/);

const legacyCanary = new DatabaseSync(':memory:');
for (const migration of manifest.migrations.slice(0, 5)) {
  legacyCanary.exec(readFileSync(path.join(root, 'accounting-migrations', migration.name), 'utf8'));
}
legacyCanary.exec(readFileSync(path.join(root, 'scripts', 'accounting-canary-bootstrap.sql'), 'utf8'));
for (const migration of manifest.migrations.slice(5, 14)) {
  legacyCanary.exec(readFileSync(path.join(root, 'accounting-migrations', migration.name), 'utf8'));
}
for (const migration of [manifest.migrations[17], ...manifest.migrations.slice(21, 25)]) {
  legacyCanary.exec(readFileSync(path.join(root, 'accounting-migrations', migration.name), 'utf8'));
}
legacyCanary.exec(buildAccountingMigrationBaselineSql(legacyPlan.missingBaseline, legacyPlan.baselineThrough));
for (const migration of manifest.migrations.filter(
  (candidate) => !legacyPlan.missingBaseline.includes(candidate.name)
)) {
  legacyCanary.exec(readFileSync(path.join(root, 'accounting-migrations', migration.name), 'utf8'));
  legacyCanary.prepare(`INSERT INTO "${ACCOUNTING_MIGRATION_TABLE}" (name) VALUES (?)`).run(migration.name);
}
assert.equal(
  legacyCanary.prepare(`SELECT COUNT(*) count FROM "${ACCOUNTING_MIGRATION_TABLE}"`).get().count,
  25,
  'the legacy Phase G canary must safely converge through migration 0025'
);
assert.equal(
  legacyCanary.prepare("SELECT COUNT(*) count FROM accounting_accounts WHERE id='acct_5850'").get().count,
  1
);
assert.equal(
  legacyCanary
    .prepare("SELECT COUNT(*) count FROM pragma_table_info('accounting_funds') WHERE name='giving_enabled'")
    .get().count,
  1
);
legacyCanary.close();

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
