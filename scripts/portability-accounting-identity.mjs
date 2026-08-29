// Fixed-scope reconciliation for the one existing production accounting book.
// Default is a no-network plan. --verify is read-only and produces short-lived
// evidence. --apply <evidence-sha256> performs one guarded, idempotent metadata
// insert and then reads the value back. It never changes ledger or journal rows.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/portability/archive.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = path.join(root, 'artifacts/portability-staging');
const evidencePath = path.join(artifactDir, 'production-accounting-identity.json');
const central = 'agapay-production';
const database = Object.freeze({
  binding: 'ACCOUNTING_DB_ST_FIACRE',
  name: 'agapay-acct-production-4ab22bac06dca8b80e70',
  uuid: '7d3a6a59-f622-4303-9e84-e1074879d11d',
  createdAt: '2026-07-21T20:14:34.280Z',
  parishId: 'st-fiacre',
  introductionCommit: '1f433c18d7a2575ae19d32d48c0b57f828f2ec9b'
});
const args = process.argv.slice(2);

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    target: { binding: database.binding, name: database.name, uuid: database.uuid },
    verify: 'node scripts/portability-accounting-identity.mjs --verify',
    apply: 'node scripts/portability-accounting-identity.mjs --apply <evidence-sha256>',
    checks: ['Cloudflare UUID and creation time', 'Git introduction commit', 'production binding', 'central registry corroboration', 'book-internal aggregate source keys', 'existing identity conflict'],
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}
assert.ok(args[0] === '--verify' || args[0] === '--apply', 'Use --verify or --apply <evidence-sha256>');
assert.equal(args.length, args[0] === '--apply' ? 2 : 1, 'Apply requires exactly one evidence SHA-256');
if (args[0] === '--apply') assert.match(args[1], /^[a-f0-9]{64}$/, 'A full lowercase evidence SHA-256 is required');

function command(executable, commandArgs, label) {
  const result = spawnSync(executable, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  });
  if (result.status !== 0) throw new Error(`${label} failed`);
  return result.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
}

function wrangler(commandArgs) {
  return command(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], 'Wrangler identity reconciliation');
}

function d1Read(databaseName, sql) {
  const values = JSON.parse(wrangler(['d1', 'execute', databaseName, '--remote', '--command', sql, '--json']));
  assert.ok(Array.isArray(values) && values.length > 0);
  for (const item of values) {
    assert.equal(item.success, true);
    assert.equal(item.meta?.changes, 0, 'Read-only identity query changed data');
    assert.equal(item.meta?.rows_written, 0, 'Read-only identity query wrote rows');
    assert.equal(item.meta?.changed_db, false, 'Read-only identity query changed the database');
  }
  return values;
}

function git(commandArgs) {
  return command('git', commandArgs, 'Git identity evidence');
}

async function collectEvidence() {
  const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  assert.match(config, new RegExp(`binding = "${database.binding}"[\\s\\S]{0,160}database_name = "${database.name}"[\\s\\S]{0,160}database_id = "${database.uuid}"`));
  for (const flag of ['PARISH_PORTABILITY_ENABLED', 'PARISH_STORAGE_GUARDS_ENABLED', 'PARISH_AUTOMATIC_CLOSURE_ENABLED', 'ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED']) {
    const values = [...config.matchAll(new RegExp(`^${flag} = "([^"]+)"`, 'gm'))].map(match => match[1]);
    assert.ok(values.length && values.every(value => value === 'false'), `${flag} must remain false`);
  }

  const info = JSON.parse(wrangler(['d1', 'info', database.name, '--json']));
  assert.equal(info.uuid, database.uuid);
  assert.equal(info.name, database.name);
  assert.equal(info.created_at, database.createdAt);

  const commitFormat = '%H%n%aI%n%B';
  const commit = git(['show', '-s', `--format=${commitFormat}`, database.introductionCommit]).split(/\r?\n/);
  assert.equal(commit[0], database.introductionCommit);
  const commitAt = commit[1];
  const introduction = git(['show', '--format=', '--no-ext-diff', database.introductionCommit, '--', 'wrangler.toml']);
  assert.ok(introduction.includes(`binding = "${database.binding}"`));
  assert.ok(introduction.includes(`database_name = "${database.name}"`));
  assert.ok(introduction.includes(`database_id = "${database.uuid}"`));
  const introductionDelaySeconds = Math.round((Date.parse(commitAt) - Date.parse(database.createdAt)) / 1000);
  assert.ok(introductionDelaySeconds >= 0 && introductionDelaySeconds <= 15 * 60, 'Binding commit is not contemporaneous with database creation');

  const centralRows = d1Read(central, `SELECT e.parish_id,d.database_identifier FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id WHERE d.database_identifier='${database.name}' AND d.environment='production';`);
  assert.equal(centralRows[0].results.length, 1, 'Central registry mapping is missing or ambiguous');
  assert.equal(centralRows[0].results[0].parish_id, database.parishId, 'Central registry does not corroborate the independent identity');

  const bookRows = d1Read(database.name, `SELECT value FROM accounting_database_metadata WHERE key='parish_id'; SELECT count(*) n FROM accounting_journal_entries WHERE source_id LIKE '${database.parishId}:%'; SELECT count(*) n FROM accounting_journal_entries WHERE source_id LIKE 'st-%:%' AND source_id NOT LIKE '${database.parishId}:%';`);
  assert.equal(bookRows.length, 3);
  const currentIdentity = bookRows[0].results.length ? bookRows[0].results[0].value : null;
  assert.ok(currentIdentity === null || currentIdentity === database.parishId, 'The accounting book already contains a conflicting parish identity');
  const matchingJournalSources = Number(bookRows[1].results[0].n);
  const conflictingParishSources = Number(bookRows[2].results[0].n);
  assert.ok(matchingJournalSources > 0, 'The accounting book has no internal St. Fiacre source evidence');
  assert.equal(conflictingParishSources, 0, 'The accounting book contains a different parish source prefix');

  const core = {
    databaseName: database.name,
    databaseUuid: database.uuid,
    databaseCreatedAt: database.createdAt,
    parishId: database.parishId,
    binding: database.binding,
    introductionCommit: database.introductionCommit,
    introductionCommitAt: commitAt,
    introductionDelaySeconds,
    matchingJournalSources,
    conflictingParishSources,
    centralRegistryCorroborates: true,
    currentIdentity,
    productionReleaseFlagsFalse: true
  };
  return { core, evidenceSha256: await sha256(JSON.stringify(core)) };
}

mkdirSync(artifactDir, { recursive: true });

if (args[0] === '--verify') {
  const evidence = await collectEvidence();
  const report = { checkedAt: new Date().toISOString(), readOnly: true, status: evidence.core.currentIdentity ? 'already_reconciled' : 'verified_ready', ...evidence };
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checkedAt: report.checkedAt, evidenceSha256: report.evidenceSha256, matchingJournalSources: report.core.matchingJournalSources, writes: false }, null, 2));
  process.exit(0);
}

const saved = JSON.parse(readFileSync(evidencePath, 'utf8'));
assert.equal(saved.evidenceSha256, args[1], 'The supplied evidence hash does not match the saved verification');
assert.equal(await sha256(JSON.stringify(saved.core)), saved.evidenceSha256, 'The saved identity evidence was changed');
assert.ok(Date.now() - Date.parse(saved.checkedAt) <= 30 * 60 * 1000, 'Identity evidence is older than 30 minutes; verify again');
const fresh = await collectEvidence();
assert.equal(fresh.evidenceSha256, saved.evidenceSha256, 'Production identity evidence changed after verification');

let rowsWritten = 0;
if (fresh.core.currentIdentity === null) {
  const sql = `INSERT INTO accounting_database_metadata(key,value) SELECT 'parish_id','${database.parishId}' WHERE NOT EXISTS(SELECT 1 FROM accounting_database_metadata WHERE key='parish_id') AND (SELECT count(*) FROM accounting_journal_entries WHERE source_id LIKE '${database.parishId}:%')>0 AND (SELECT count(*) FROM accounting_journal_entries WHERE source_id LIKE 'st-%:%' AND source_id NOT LIKE '${database.parishId}:%')=0;`;
  const values = JSON.parse(wrangler(['d1', 'execute', database.name, '--remote', '--command', sql, '--json']));
  assert.equal(values.length, 1);
  assert.equal(values[0].success, true);
  assert.equal(values[0].meta?.changes, 1, 'Guarded identity insert did not make exactly one change');
  // D1 reports the logical row in `changes`; `rows_written` may additionally
  // count the primary-key index entry for this WITHOUT ROWID-independent table.
  assert.ok(values[0].meta?.rows_written >= 1 && values[0].meta?.rows_written <= 2, 'Guarded identity insert reported an unexpected physical write count');
  rowsWritten = 1;
}

const readback = d1Read(database.name, "SELECT value FROM accounting_database_metadata WHERE key='parish_id';");
assert.deepEqual(readback[0].results, [{ value: database.parishId }], 'Identity readback failed');
const appliedAt = new Date().toISOString();
writeFileSync(evidencePath, JSON.stringify({ ...saved, status: 'applied_and_verified', appliedAt, rowsWritten }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'applied_and_verified', appliedAt, evidenceSha256: saved.evidenceSha256, rowsWritten }, null, 2));
