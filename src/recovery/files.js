import { rawStorageEnv, inventoryParishObjects, fileBucket, objectOwnership } from '../portability/storage.js';
import { collectLegacyRecords } from '../portability/legacy.js';
import { sha256 } from '../portability/archive.js';
import { query, fail, MAX_BYTES } from './storage.js';

const skipLegacy = (r) => ['registration', 'index', 'calendar_credentials', 'legal_acceptance'].includes(r.kind);
export const MAX_RECOVERY_FILE_ITEMS = 200;
function checkFileWork(...sets) {
  const items = new Set(
    sets.flatMap((value) => [
      ...value.files.map((item) => item.binding + ':' + item.key),
      ...value.legacy.map((item) => 'KV:' + item.key),
      ...(value.mirrors || []).map((key) => 'MIRROR:' + key),
    ])
  );
  if (items.size > MAX_RECOVERY_FILE_ITEMS)
    fail(
      'recovery_files_too_large',
      'This restore exceeds the self-service file limit. Contact support for assisted recovery; no replacement has started.'
    );
}
const encode = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};
const decode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function captureFiles(env, parishId, scope) {
  const raw = rawStorageEnv(env),
    files = [],
    legacy = [],
    mirrors = [];
  let total = 0;
  for (const item of await inventoryParishObjects(env, parishId)) {
    if (scope === 'accounting' && item.binding !== 'ACCOUNTING_ATTACHMENTS') continue;
    const object = await fileBucket(env, item.binding).get(item.key);
    if (!object || (total += object.size) > MAX_BYTES)
      fail('recovery_files_too_large', 'The uploaded files exceed the self-service snapshot limit or are unavailable.');
    const body = new Uint8Array(await object.arrayBuffer());
    files.push({
      ...item,
      body: encode(body),
      hash: await sha256(body),
      httpMetadata: object.httpMetadata || {},
      customMetadata: object.customMetadata || {},
    });
  }
  if (scope === 'parish')
    for (const item of await collectLegacyRecords(env, parishId)) {
      if (['registration', 'index'].includes(item.kind)) {
        const value = await raw.AGAPAY_REGISTRATIONS.get(item.key);
        try {
          const record = JSON.parse(value);
          if ((record?.parishId || record?.parish_id) === parishId) mirrors.push(item.key);
        } catch {}
      }
      if (skipLegacy(item)) continue;
      const body = await raw.AGAPAY_REGISTRATIONS.get(item.key);
      if (body == null || (await sha256(body)) !== item.sourceHash)
        fail('recovery_legacy_changed', 'Legacy records changed during the snapshot.');
      if ((total += new TextEncoder().encode(body).length) > MAX_BYTES)
        fail('recovery_files_too_large', 'The legacy records exceed the self-service snapshot limit.');
      legacy.push({ key: item.key, kind: item.kind, disposition: item.disposition, body, hash: item.sourceHash });
    }
  const result = { files, legacy, mirrors };
  checkFileWork(result);
  return result;
}

export async function validateFiles(env, parishId, scope, target, current) {
  // Bound both forward replacement and safety rollback before the first write.
  checkFileWork(target, current);
  const seen = new Set();
  for (const item of target.files) {
    if (scope === 'accounting' && item.binding !== 'ACCOUNTING_ATTACHMENTS')
      fail('recovery_scope_mismatch', 'The snapshot has the wrong recovery scope.');
    const identity = item.binding + ':' + item.key;
    if (seen.has(identity) || (await sha256(decode(item.body))) !== item.hash)
      fail('recovery_checksum_failed', 'A file in the snapshot failed verification.');
    seen.add(identity);
    const owner = await objectOwnership(env, item.binding, item.key);
    if (owner && owner.parish_id !== parishId)
      fail('recovery_owner_conflict', 'An uploaded file is owned outside this parish.');
  }
  // Financial legacy records correspond to completed external activity.
  const financial = (data) =>
    data.legacy.filter((r) => r.disposition === 'financial').map(({ key, hash }) => ({ key, hash }));
  if (JSON.stringify(financial(target)) !== JSON.stringify(financial(current)))
    fail(
      'recovery_external_activity',
      'Financial source records changed after this snapshot. Contact support for reconciliation.'
    );
  for (const item of target.legacy) {
    if (scope !== 'parish' || skipLegacy(item) || (await sha256(item.body)) !== item.hash)
      fail('recovery_scope_mismatch', 'A legacy snapshot record failed scope validation.');
    const owner = await query(
      env.AGAPAY_DB,
      'SELECT parish_id FROM parish_portability_legacy_keys WHERE object_key=?',
      item.key
    ).first();
    if (owner && owner.parish_id !== parishId)
      fail('recovery_owner_conflict', 'A legacy key is owned outside this parish.');
  }
}

export async function applyFiles(env, op, target, current) {
  const raw = rawStorageEnv(env),
    db = env.AGAPAY_DB;
  for (const item of target.files) {
    const bucket = fileBucket(env, item.binding),
      body = decode(item.body);
    await bucket.put(item.key, body, {
      httpMetadata: { ...item.httpMetadata, cacheControl: 'no-store' },
      customMetadata: { ...item.customMetadata, agapayParishId: op.parish_id },
    });
    const stored = await bucket.get(item.key);
    if (!stored || stored.size !== body.length || (await sha256(await stored.arrayBuffer())) !== item.hash)
      fail('recovery_file_verification_failed', 'A restored file could not be verified. Recovery remains paused.');
    await query(
      db,
      "INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES(?,?,?,?,'stored',?,?) ON CONFLICT(binding,object_key) DO UPDATE SET state='stored',etag=excluded.etag,updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id",
      item.binding,
      item.key,
      op.parish_id,
      item.disposition,
      stored.etag,
      Date.now()
    ).run();
  }
  for (const item of current.files)
    if (!target.files.some((t) => t.binding === item.binding && t.key === item.key)) {
      await fileBucket(env, item.binding).delete(item.key);
      if (await fileBucket(env, item.binding).head(item.key))
        fail('recovery_file_verification_failed', 'A file removal was not confirmed.');
      await query(
        db,
        "UPDATE parish_portability_objects SET state='deleted',updated_at=? WHERE binding=? AND object_key=? AND parish_id=?",
        Date.now(),
        item.binding,
        item.key,
        op.parish_id
      ).run();
    }
  for (const item of target.legacy) {
    await raw.AGAPAY_REGISTRATIONS.put(item.key, item.body);
    if ((await sha256((await raw.AGAPAY_REGISTRATIONS.get(item.key)) || '')) !== item.hash)
      fail('recovery_legacy_converging', 'Legacy storage is still converging. Resume verification shortly.');
    await query(
      db,
      "INSERT INTO parish_portability_legacy_keys(object_key,parish_id,source_hash,state,updated_at) VALUES(?,?,?,'stored',?) ON CONFLICT(object_key) DO UPDATE SET source_hash=excluded.source_hash,state='stored',updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id",
      item.key,
      op.parish_id,
      item.hash,
      Date.now()
    ).run();
  }
  for (const item of current.legacy)
    if (!target.legacy.some((t) => t.key === item.key)) {
      await raw.AGAPAY_REGISTRATIONS.delete(item.key);
      if ((await raw.AGAPAY_REGISTRATIONS.get(item.key)) != null)
        fail('recovery_legacy_converging', 'Legacy storage is still converging. Resume verification shortly.');
      await query(
        db,
        "UPDATE parish_portability_legacy_keys SET state='deleted',updated_at=? WHERE object_key=? AND parish_id=?",
        Date.now(),
        item.key,
        op.parish_id
      ).run();
    }
}
