import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertManifestFresh,
  compareSnapshots,
  countSql,
  createBackupManifest,
  prepareRestoreSql,
  sha256,
  snapshotSqlExport,
  unwrapD1Rows,
  verifyDownloadedBackup,
} from './lib/d1-recovery.mjs';

const directory = mkdtempSync(join(tmpdir(), 'agapay-recovery-test-'));
const backupPath = join(directory, 'backup.sql');
const checksumPath = join(directory, 'backup.sql.sha256');
const sql = `PRAGMA foreign_keys=OFF;
CREATE TABLE parents(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE children(id TEXT PRIMARY KEY,parent_id TEXT NOT NULL,FOREIGN KEY(parent_id) REFERENCES parents(id));
CREATE INDEX children_parent ON children(parent_id);
INSERT INTO parents VALUES('p1','Parish');
INSERT INTO children VALUES('c1','p1'),('c2','p1');`;
writeFileSync(backupPath, sql);
writeFileSync(checksumPath, `${sha256(Buffer.from(sql))}  backup.sql\n`);

assert.equal(
  prepareRestoreSql('CREATE TABLE example(id TEXT);'),
  'PRAGMA foreign_keys=OFF;\nCREATE TABLE example(id TEXT);'
);
assert.equal(prepareRestoreSql(sql), sql, 'restore preparation must be idempotent');

const snapshot = snapshotSqlExport(backupPath);
assert.equal(snapshot.tableCount, 2);
assert.equal(snapshot.totalRows, 3);
assert.deepEqual(snapshot.rowCounts, { children: 2, parents: 1 });
assert.match(countSql(['a"b']), /"a""b"/);

const createdAt = '2026-08-29T12:00:00.000Z';
const manifest = createBackupManifest({
  backupPath,
  checksumPath,
  backupKey: 'platform-d1/backup.sql',
  checksumKey: 'platform-d1/backup.sql.sha256',
  manifestKey: 'platform-d1/backup.manifest.json',
  sourceDatabase: 'agapay-production',
  createdAt,
});
assert.equal(manifest.validation.localRestore, 'passed');
assert.equal(manifest.artifact.sha256, sha256(Buffer.from(sql)));
assert.equal(assertManifestFresh(manifest, 24, Date.parse(createdAt) + 23 * 3_600_000), 23);
assert.throws(() => assertManifestFresh(manifest, 24, Date.parse(createdAt) + 25 * 3_600_000), /maximum is 24/);
assert.deepEqual(
  verifyDownloadedBackup({ manifest, backupPath, checksumPath, maxAgeHours: 24, now: Date.parse(createdAt) }),
  { ageHours: 0, bytes: Buffer.byteLength(sql), sha256: manifest.artifact.sha256 }
);

const rows = unwrapD1Rows([{ success: true, results: [{ name: 'one' }] }]);
assert.deepEqual(rows, [{ name: 'one' }]);
assert.deepEqual(compareSnapshots(snapshot, snapshot), {
  schemaSha256: snapshot.schemaSha256,
  tableCount: 2,
  totalRows: 3,
});
assert.throws(
  () => compareSnapshots(snapshot, { ...snapshot, rowCounts: { ...snapshot.rowCounts, children: 1 } }),
  /children: expected 2, restored 1/
);

console.log('PASS - D1 backup manifest, checksum, freshness, and restore comparison tests');
