import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const RECOVERY_POLICY = Object.freeze({
  recoveryPointHours: 24,
  recoveryTimeHours: 8,
});

const USER_SCHEMA_SQL = `SELECT type,name,tbl_name tableName
  FROM sqlite_schema
  WHERE type IN ('table','index','trigger','view')
    AND name NOT LIKE 'sqlite_%'
    AND name NOT LIKE '_cf_%'
  ORDER BY type,name`;

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function prepareRestoreSql(source) {
  const sql = String(source);
  return /^\s*PRAGMA\s+foreign_keys\s*=\s*OFF\s*;/i.test(sql) ? sql : `PRAGMA foreign_keys=OFF;\n${sql}`;
}

export function checksumFromFile(path) {
  return sha256(readFileSync(path));
}

export function parseChecksumFile(path) {
  const value = readFileSync(path, 'utf8').trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid SHA-256 checksum file: ${path}`);
  return value;
}

export function countSql(tableNames) {
  if (!tableNames.length) return `SELECT '' tableName,0 rowCount WHERE 0`;
  return tableNames
    .map((name) => `SELECT ${quoteLiteral(name)} tableName,COUNT(*) rowCount FROM ${quoteIdentifier(name)}`)
    .join(' UNION ALL ');
}

export function countStatementBatches(tableNames, batchSize = 50) {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new Error('Row-count batch size must be a positive integer.');
  if (!tableNames.length) return [`SELECT '' tableName,0 rowCount WHERE 0`];
  const batches = [];
  for (let index = 0; index < tableNames.length; index += batchSize) {
    batches.push(
      tableNames
        .slice(index, index + batchSize)
        .map((name) => `SELECT ${quoteLiteral(name)} tableName,COUNT(*) rowCount FROM ${quoteIdentifier(name)}`)
        .join(';\n')
    );
  }
  return batches;
}

export function quickCheckStatementBatches(tableNames, batchSize = 25) {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new Error('Quick-check batch size must be a positive integer.');
  if (!tableNames.length) return ['PRAGMA quick_check'];
  const batches = [];
  for (let index = 0; index < tableNames.length; index += batchSize) {
    batches.push(
      tableNames
        .slice(index, index + batchSize)
        .map((name) => `PRAGMA quick_check(${quoteIdentifier(name)})`)
        .join(';\n')
    );
  }
  return batches;
}

function normalizeSchemaObjects(rows) {
  return rows.map((row) => ({
    type: String(row.type),
    name: String(row.name),
    tableName: String(row.tableName),
  }));
}

function normalizeRowCounts(rows) {
  return Object.fromEntries(
    rows
      .map((row) => [String(row.tableName), Number(row.rowCount)])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export function snapshotSqlite(database) {
  const schemaObjects = normalizeSchemaObjects(database.prepare(USER_SCHEMA_SQL).all());
  const tables = schemaObjects.filter((object) => object.type === 'table').map((object) => object.name);
  const rowCounts = normalizeRowCounts(database.prepare(countSql(tables)).all());
  return {
    schemaObjects,
    schemaSha256: sha256(JSON.stringify(schemaObjects)),
    rowCounts,
    tableCount: tables.length,
    totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
  };
}

export function snapshotSqlExport(path) {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(readFileSync(path, 'utf8'));
    const quickCheck = database.prepare('PRAGMA quick_check').get();
    if (String(quickCheck?.quick_check || '').toLowerCase() !== 'ok') {
      throw new Error(`Local restore quick_check failed for ${path}`);
    }
    return snapshotSqlite(database);
  } finally {
    database.close();
  }
}

export function createBackupManifest({
  backupPath,
  checksumPath,
  backupKey,
  checksumKey,
  manifestKey,
  sourceDatabase,
  createdAt = new Date().toISOString(),
}) {
  const artifactSha256 = checksumFromFile(backupPath);
  const recordedSha256 = parseChecksumFile(checksumPath);
  if (artifactSha256 !== recordedSha256) throw new Error('Backup checksum does not match the exported SQL artifact.');
  const snapshot = snapshotSqlExport(backupPath);
  return {
    manifestVersion: 1,
    createdAt,
    sourceDatabase,
    artifact: {
      backupKey,
      checksumKey,
      manifestKey,
      bytes: readFileSync(backupPath).byteLength,
      sha256: artifactSha256,
    },
    policy: RECOVERY_POLICY,
    validation: {
      localRestore: 'passed',
      quickCheck: 'ok',
      ...snapshot,
    },
  };
}

export function assertManifestFresh(manifest, maxAgeHours, now = Date.now()) {
  const createdAt = Date.parse(String(manifest?.createdAt || ''));
  if (!Number.isFinite(createdAt)) throw new Error('Backup manifest has no valid createdAt timestamp.');
  const ageHours = (now - createdAt) / 3_600_000;
  if (ageHours < -0.25) throw new Error('Backup manifest timestamp is unexpectedly in the future.');
  if (ageHours > maxAgeHours) {
    throw new Error(`Latest backup is ${ageHours.toFixed(2)} hours old; maximum is ${maxAgeHours} hours.`);
  }
  return ageHours;
}

export function verifyDownloadedBackup({ manifest, backupPath, checksumPath, maxAgeHours = 48, now }) {
  const ageHours = assertManifestFresh(manifest, maxAgeHours, now);
  const downloadedSha256 = checksumFromFile(backupPath);
  const checksumSha256 = parseChecksumFile(checksumPath);
  if (downloadedSha256 !== manifest.artifact?.sha256 || checksumSha256 !== manifest.artifact?.sha256) {
    throw new Error('Downloaded R2 backup failed SHA-256 verification.');
  }
  const bytes = readFileSync(backupPath).byteLength;
  if (bytes !== Number(manifest.artifact?.bytes))
    throw new Error('Downloaded R2 backup size differs from its manifest.');
  return { ageHours, bytes, sha256: downloadedSha256 };
}

export function unwrapD1Rows(output) {
  const parsed = typeof output === 'string' ? JSON.parse(output) : output;
  const statements = Array.isArray(parsed) ? parsed : [parsed];
  if (!statements.length || statements.some((statement) => statement?.success !== true)) {
    throw new Error('D1 validation query did not report success.');
  }
  return statements.flatMap((statement) => statement.results || []);
}

export function compareSnapshots(expected, actual) {
  const differences = [];
  if (expected.schemaSha256 !== actual.schemaSha256) differences.push('schema inventory hash differs');
  const names = new Set([...Object.keys(expected.rowCounts || {}), ...Object.keys(actual.rowCounts || {})]);
  for (const name of [...names].sort()) {
    if (expected.rowCounts?.[name] !== actual.rowCounts?.[name]) {
      differences.push(
        `${name}: expected ${expected.rowCounts?.[name] ?? 'missing'}, restored ${actual.rowCounts?.[name] ?? 'missing'}`
      );
    }
  }
  if (differences.length) throw new Error(`Recovery validation failed: ${differences.slice(0, 20).join('; ')}`);
  return {
    schemaSha256: actual.schemaSha256,
    tableCount: actual.tableCount,
    totalRows: actual.totalRows,
  };
}

export function userSchemaSql() {
  return USER_SCHEMA_SQL;
}

export function snapshotFromRemoteRows(schemaRows, countRows) {
  const schemaObjects = normalizeSchemaObjects(schemaRows);
  const rowCounts = normalizeRowCounts(countRows);
  return {
    schemaObjects,
    schemaSha256: sha256(JSON.stringify(schemaObjects)),
    rowCounts,
    tableCount: schemaObjects.filter((object) => object.type === 'table').length,
    totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
  };
}
