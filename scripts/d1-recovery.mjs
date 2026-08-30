#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import {
  assertManifestFresh,
  checksumFromFile,
  compareSnapshots,
  countSql,
  createBackupManifest,
  prepareRestoreSql,
  snapshotFromRemoteRows,
  unwrapD1Rows,
  userSchemaSql,
  verifyDownloadedBackup,
} from './lib/d1-recovery.mjs';

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

function required(name) {
  const value = option(name);
  if (!value) throw new Error(`Missing required --${name} option.`);
  return value;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readManifest() {
  return JSON.parse(readFileSync(required('manifest'), 'utf8'));
}

function wranglerJson(database, sql) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    executable,
    ['wrangler', 'd1', 'execute', database, '--remote', '--command', sql, '--json'],
    { encoding: 'utf8', env: process.env }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited ${result.status}`);
  return unwrapD1Rows(result.stdout);
}

const command = process.argv[2];

if (command === 'prepare-export') {
  const backupPath = required('backup');
  writeFileSync(backupPath, prepareRestoreSql(readFileSync(backupPath, 'utf8')));
  console.log(`PASS - prepared ${backupPath} for isolated restore`);
} else if (command === 'write-checksum') {
  const backupPath = required('backup');
  const output = required('output');
  writeFileSync(output, `${checksumFromFile(backupPath)}  ${basename(backupPath)}\n`);
  console.log(`PASS - wrote SHA-256 checksum for ${backupPath}`);
} else if (command === 'capture') {
  const backupPath = required('backup');
  const checksumPath = required('checksum');
  const backupKey = required('backup-key');
  const manifest = createBackupManifest({
    backupPath,
    checksumPath,
    backupKey,
    checksumKey: required('checksum-key'),
    manifestKey: required('manifest-key'),
    sourceDatabase: required('database'),
    createdAt: option('created-at', new Date().toISOString()),
  });
  const output = required('output');
  writeJson(output, manifest);
  console.log(
    `PASS - local restore, ${manifest.validation.tableCount} tables, ${manifest.validation.totalRows} rows, SHA-256 ${manifest.artifact.sha256}`
  );
} else if (command === 'resolve') {
  const manifest = readManifest();
  for (const [name, value] of [
    ['BACKUP_KEY', manifest.artifact?.backupKey],
    ['CHECKSUM_KEY', manifest.artifact?.checksumKey],
  ]) {
    if (!value) throw new Error(`Backup manifest is missing ${name}.`);
    console.log(`${name}=${value}`);
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
  }
} else if (command === 'inspect-manifest') {
  const manifest = readManifest();
  const maxAgeHours = Number(option('max-age-hours', '36'));
  const ageHours = assertManifestFresh(manifest, maxAgeHours);
  console.log(
    `PASS - latest backup is ${ageHours.toFixed(2)} hours old (${manifest.validation?.tableCount} tables, ${manifest.validation?.totalRows} rows)`
  );
} else if (command === 'verify-files') {
  const manifest = readManifest();
  const result = verifyDownloadedBackup({
    manifest,
    backupPath: required('backup'),
    checksumPath: required('checksum'),
    maxAgeHours: Number(option('max-age-hours', '48')),
  });
  console.log(
    `PASS - downloaded R2 artifact verified (${result.bytes} bytes, ${result.ageHours.toFixed(2)} hours old)`
  );
} else if (command === 'validate-database') {
  const configuredStartedAt = Number(option('started-at-epoch-ms'));
  const startedAt = Number.isFinite(configuredStartedAt) && configuredStartedAt > 0 ? configuredStartedAt : Date.now();
  const database = required('database');
  const manifest = readManifest();
  const schemaRows = wranglerJson(database, userSchemaSql());
  const tables = schemaRows.filter((row) => row.type === 'table').map((row) => row.name);
  const countRows = wranglerJson(database, countSql(tables));
  const quickCheckRows = wranglerJson(database, 'PRAGMA quick_check');
  if (String(quickCheckRows[0]?.quick_check || '').toLowerCase() !== 'ok')
    throw new Error('Remote D1 PRAGMA quick_check failed.');
  const restored = snapshotFromRemoteRows(schemaRows, countRows);
  const comparison = compareSnapshots(manifest.validation, restored);
  const completedAt = new Date().toISOString();
  const backupAgeHours = (Date.parse(completedAt) - Date.parse(manifest.createdAt)) / 3_600_000;
  const recoveryExerciseSeconds = (Date.now() - startedAt) / 1000;
  const evidence = {
    status: 'passed',
    sourceDatabase: manifest.sourceDatabase,
    recoveryDatabase: database,
    backupCreatedAt: manifest.createdAt,
    completedAt,
    backupAgeHours,
    recoveryExerciseSeconds,
    policy: manifest.policy,
    rpoMet: backupAgeHours <= Number(manifest.policy?.recoveryPointHours),
    rtoMet: recoveryExerciseSeconds <= Number(manifest.policy?.recoveryTimeHours) * 3600,
    quickCheck: 'ok',
    ...comparison,
  };
  writeJson(required('output'), evidence);
  if (!evidence.rpoMet || !evidence.rtoMet) throw new Error('Recovery drill exceeded its recorded RPO or RTO target.');
  console.log(`PASS - remote recovery drill matched ${evidence.tableCount} tables and ${evidence.totalRows} rows`);
} else {
  throw new Error(
    'Usage: d1-recovery.mjs <prepare-export|write-checksum|capture|resolve|inspect-manifest|verify-files|validate-database> [options]'
  );
}
