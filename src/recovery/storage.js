import { registrationProjection } from './configuration.js';
import {
  inspectStorage,
  tableScope,
  quoted,
  schemaMetadata,
  PortabilityError,
  MAX_TABLE_ROWS,
} from '../portability/catalog.js';
import { inspectBooks, resolvePortabilityBooks } from '../portability/accounting.js';
import { sha256 } from '../portability/archive.js';
import { rawStorageEnv } from '../portability/storage.js';
import { suppressionRecord, storageGuardsEnabled } from '../portability/suppression.js';

export const MAX_BYTES = 12 * 1024 * 1024;
export const TTL = 7 * 86400000;
export const fail = (code, message) => {
  throw new PortabilityError(code, message);
};
export const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
export const rows = async (db, sql, ...args) => (await query(db, sql, ...args).all()).results;
export const rootKey = (id) => 'parish-recovery/' + id + '/';
export const publicSnapshot = (s) => ({
  id: s.id,
  scope: s.scope,
  kind: s.kind,
  createdAt: s.created_at,
  verifiedAt: s.verified_at,
  expiresAt: s.expires_at,
  status: s.status,
});
// Access controls and provider/payment state must remain current. These records
// are explicitly excluded from rollback, even though ordinary exports include them.
export const PRESERVED = new Set([
  'parish_memberships',
  'membership_capabilities',
  'accounting_entities',
  'accounting_databases',
  'accounting_lifecycle_events',
  'accounting_provisioning_operations',
  'audit_log',
  'legal_acceptances',
  'accounting_staff_profiles',
  'accounting_staff_audit_log',
  'accounting_database_metadata',
  'accounting_migrations',
  'accounting_audit_log',
  'accounting_legal_holds',
  'accounting_recovery_verifications',
]);
export const EXTERNAL =
  /donation|payment|stripe|payout|refund|chargeback|receipt_delivery|donor_offerings|commerce_order|settlement_profile|agapay_service_invoice|source_event|source_document|posting_attempt|posting_job|check_sequence|check_stock|check_print|check_void|bank_feed|integration_event|external_transaction|legal_hold/i;

export async function requireRecovery(env, parishId) {
  if (env.PARISH_RECOVERY_ENABLED !== 'true' || !env.PARISH_EXPORTS || !storageGuardsEnabled(env))
    fail('recovery_unavailable', 'Restore-ready backups are not available on this deployment.');
  if (
    (await suppressionRecord(env, parishId)) ||
    (await query(env.AGAPAY_DB, 'SELECT 1 FROM parish_data_closures WHERE parish_id=?', parishId).first())
  )
    fail('parish_closed', 'A closed or closing parish cannot be restored.');
}

export async function booksFor(env, parishId) {
  if (
    !(await query(
      env.AGAPAY_DB,
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounting_entities'"
    ).first())
  )
    return null;
  const entities = await rows(env.AGAPAY_DB, 'SELECT * FROM accounting_entities WHERE parish_id=?', parishId);
  return resolvePortabilityBooks(rawStorageEnv(env), parishId, entities);
}

export function centralScope(name, alias = 't') {
  let scope = tableScope(name, alias);
  if (name === 'directory_people')
    scope += ` AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=${alias}.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=${alias}.id AND a.parish_id<>?1) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=${alias}.id AND h.parish_id<>?1)`;
  return scope;
}

export async function inventory(db, kind) {
  const items =
    kind === 'central'
      ? (await inspectStorage(db))
          .filter((t) => t.classification === 'parish' && !PRESERVED.has(t.name) && !/audit/.test(t.name))
          .map((t) => ({ ...t, scope: centralScope(t.name) }))
      : (await inspectBooks(db)).tables
          .filter((t) => !PRESERVED.has(t.name))
          .map((t) => ({ name: t.name, columns: t.columns.map((c) => c.name), scope: '1=1' }));
  const metadata = await schemaMetadata(
    db,
    items.map((t) => t.name)
  );
  for (const item of items) {
    if (item.name === 'registrations') item.columns = ['reference', 'parish_id', 'data'];
    item.pk = metadata
      .get(item.name)
      .filter((c) => c.pk)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    if (!item.pk.length)
      fail('recovery_schema_unsupported', 'A table without a primary key requires a recovery review.');
  }
  return items;
}

export async function schemaHash(db) {
  return sha256(
    JSON.stringify(
      await rows(
        db,
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'recovery_%' AND name NOT LIKE 'parish_recovery_%' ORDER BY type,name"
      )
    )
  );
}

export async function captureDatabase(db, kind, parishId) {
  if (!db) return null;
  const tables = [];
  let bytes = 0;
  for (const item of await inventory(db, kind)) {
    const data = await rows(
      db,
      `SELECT * FROM ${quoted(item.name)} t WHERE ${item.scope} ORDER BY ${item.pk.map(quoted).join(',')} LIMIT ${MAX_TABLE_ROWS + 1}`,
      ...(kind === 'central' ? [parishId] : [])
    );
    if (
      data.some((row) =>
        Object.values(row).some((value) => value !== null && !['string', 'number'].includes(typeof value))
      )
    )
      fail('recovery_type_unsupported', 'A database value needs a reviewed recovery encoding.');
    bytes += new TextEncoder().encode(JSON.stringify(data)).length;
    if (data.length > MAX_TABLE_ROWS || bytes > MAX_BYTES)
      fail('recovery_too_large', 'This snapshot exceeds the self-service recovery limit. Contact support.');
    tables.push({ ...item, rows: item.name === 'registrations' ? data.map(registrationProjection) : data });
  }
  return { schema: await schemaHash(db), tables };
}

export async function writePart(env, snapshotId, part, value) {
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).length > MAX_BYTES)
    fail('recovery_too_large', 'The snapshot exceeds the self-service size limit.');
  const hash = await sha256(body),
    key = rootKey(snapshotId) + part + '.json';
  await env.PARISH_EXPORTS.put(key, body, {
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    customMetadata: { sha256: hash },
  });
  const readback = await env.PARISH_EXPORTS.get(key);
  if (!readback || readback.size > MAX_BYTES || (await sha256(await readback.text())) !== hash)
    fail('recovery_checksum_failed', 'The recovery copy could not be verified.');
  return { part, hash, bytes: new TextEncoder().encode(body).length };
}

export async function readPart(env, snapshot, part) {
  const manifest = JSON.parse(snapshot.manifest_json);
  if ((await sha256(snapshot.manifest_json)) !== snapshot.manifest_sha256)
    fail('recovery_checksum_failed', 'Snapshot metadata failed verification.');
  const expected = manifest.parts.find((p) => p.part === part);
  if (!expected) fail('recovery_incomplete', 'The snapshot is incomplete.');
  const object = await env.PARISH_EXPORTS.get(rootKey(snapshot.id) + part + '.json');
  if (!object || object.size !== expected.bytes || object.size > MAX_BYTES)
    fail('recovery_incomplete', 'A snapshot component is missing or damaged.');
  const body = await object.text();
  if ((await sha256(body)) !== expected.hash) fail('recovery_checksum_failed', 'The snapshot checksum did not match.');
  return JSON.parse(body);
}
