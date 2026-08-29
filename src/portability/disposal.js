import { PortabilityError, POLICY_VERSION, MAX_EXPORT_BYTES, exportRow } from './catalog.js';
import { sha256, utf8 } from './archive.js';
import { fileBucket, rawStorageEnv, FINANCIAL_BINDINGS, PUBLIC_BINDINGS, canonicalBinding } from './storage.js';
import { classifyLegacyRecord } from './legacy.js';
import { workerPublicMediaVerified } from './public-media.js';

export function retentionDeadline(confirmedAt, years) {
  if (!Number.isSafeInteger(confirmedAt) || !Number.isInteger(years) || years < 1 || years > 100) throw new PortabilityError('retention_policy_invalid', 'Retention settings require review.');
  const date = new Date(confirmedAt); date.setUTCFullYear(date.getUTCFullYear() + years); return date.getTime();
}

export async function recordRetention(env, job, resource, category, evidence, years = category === 'support' ? 3 : 7) {
  const until = retentionDeadline(job.confirmed_at, years);
  await env.AGAPAY_DB.prepare(`INSERT INTO parish_portability_retention(job_id,resource,category,retain_until,status,evidence_json,updated_at) VALUES(?,?,?,?,'restricted',?,?)
    ON CONFLICT(job_id,resource) DO NOTHING`).bind(job.id, resource, category, until, JSON.stringify({ policyVersion: POLICY_VERSION, ...evidence }), Date.now()).run();
  return until;
}

export async function retainBytes(env, job, resource, category, bytes, years) {
  const bucket = env.PARISH_RETAINED_DATA;
  if (!bucket?.put || !bucket?.get) throw new PortabilityError('retention_storage_missing', 'Private restricted retention storage is not configured.');
  if (bytes.byteLength > MAX_EXPORT_BYTES) throw new PortabilityError('retention_too_large', 'This retention copy requires operator assistance.');
  const key = 'retained/' + job.id + '/' + await sha256(resource), hash = await sha256(bytes);
  let object = await bucket.get(key);
  if (!object) {
    await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'private, no-store' }, customMetadata: { sha256: hash, category } });
    object = await bucket.get(key);
  }
  if (!object || object.size !== bytes.byteLength || await sha256(new Uint8Array(await object.arrayBuffer())) !== hash) throw new PortabilityError('retention_copy_unverified', 'The restricted copy could not be verified. The original has not been deleted.');
  await recordRetention(env, job, resource, category, { key, sha256: hash, bytes: bytes.byteLength },years);
}

async function completed(env, job, step) {
  return env.AGAPAY_DB.prepare("SELECT 1 FROM parish_portability_steps WHERE job_id=? AND step_key=? AND status='completed'").bind(job.id, step).first();
}
async function checkpoint(env, job, step, result) {
  await env.AGAPAY_DB.prepare("INSERT OR REPLACE INTO parish_portability_steps(job_id,step_key,status,result_json,updated_at) VALUES(?,?,'completed',?,?)").bind(job.id, step, JSON.stringify(result), Date.now()).run();
}

async function purgePublicCache(env, binding, key) {
  if (!PUBLIC_BINDINGS.has(binding)) return;
  // Verified Worker delivery is always no-store and the historical r2.dev
  // origins have been disabled, so there is no eligible zone cache URL.
  if (workerPublicMediaVerified(env)) return;
  if (env.PARISH_PUBLIC_CACHE_POLICY_VERIFIED !== POLICY_VERSION || !/^[a-f0-9]{32}$/.test(env.PARISH_ASSET_CACHE_ZONE_ID || '') || !env.PARISH_ASSET_CACHE_PURGE_TOKEN) throw new PortabilityError('cache_disposal_unverified', 'Public asset cache disposal is not configured and verified.');
  const root = new URL(env[binding + '_URL']);
  if (root.protocol !== 'https:' || root.search || root.hash || root.username || root.password) throw new PortabilityError('cache_url_invalid', 'The public asset URL requires review.');
  const url = root.href.replace(/\/$/,'') + '/' + key.split('/').map(encodeURIComponent).join('/');
  const response = await fetch('https://api.cloudflare.com/client/v4/zones/' + env.PARISH_ASSET_CACHE_ZONE_ID + '/purge_cache', {
    method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + env.PARISH_ASSET_CACHE_PURGE_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [url] }),
  });
  if (!response.ok || !(await response.json()).success) throw new PortabilityError('cache_disposal_failed', 'Public cache removal has not been confirmed.');
}

export async function disposeParishFiles(env, job, manifest, { replay = false } = {}) {
  for (const asset of manifest.assets || []) {
    const binding = canonicalBinding(asset.binding), bucket = fileBucket(env, binding);
    const resource = 'file:' + binding + ':' + asset.key, step = 'file:' + await sha256(resource);
    if (!replay && await completed(env, job, step)) continue;
    const object = await bucket.get(asset.key);
    if (object) {
      if (object.etag !== asset.etag || object.size > MAX_EXPORT_BYTES) throw new PortabilityError('file_changed_after_confirmation', 'A stored file changed after confirmation. Deletion has paused.');
      if (FINANCIAL_BINDINGS.has(binding)) await retainBytes(env, job, resource, 'financial', new Uint8Array(await object.arrayBuffer()),manifest.accountingRetentionYears);
      else if (object.body) await object.body.cancel();
      await bucket.delete(asset.key);
    } else if (FINANCIAL_BINDINGS.has(binding)) {
      // A retry may follow successful deletion with an uncommitted checkpoint.
      const retained = await env.AGAPAY_DB.prepare('SELECT evidence_json FROM parish_portability_retention WHERE job_id=? AND resource=?').bind(job.id,resource).first();
      if (!retained) throw new PortabilityError('retained_file_missing', 'A required retained file is missing.');
      const evidence = JSON.parse(retained.evidence_json), copy = await env.PARISH_RETAINED_DATA.get(evidence.key);
      if (!copy || copy.size !== evidence.bytes || await sha256(new Uint8Array(await copy.arrayBuffer())) !== evidence.sha256) throw new PortabilityError('retention_copy_unverified', 'The restricted file copy is unavailable.');
    }
    if (await bucket.head(asset.key)) throw new PortabilityError('file_deletion_unconfirmed', 'A parish file has not been removed.');
    await purgePublicCache(env, binding, asset.key);
    await checkpoint(env, job, step, { binding, disposition: FINANCIAL_BINDINGS.has(binding) ? 'restricted_retention' : 'deleted' });
    await env.AGAPAY_DB.prepare("UPDATE parish_portability_objects SET state='deleted',updated_at=? WHERE binding=? AND object_key=? AND parish_id=?").bind(Date.now(),binding,asset.key,job.parish_id).run();
  }
}

export async function disposeLegacyRecords(env, job, manifest, { replay = false } = {}) {
  const kv = rawStorageEnv(env).AGAPAY_REGISTRATIONS;
  // Indexes first; the manifest preserves exact ownership even after targets go.
  const records = [...(manifest.legacyRecords || [])].sort((a,b) => Number(b.kind === 'index') - Number(a.kind === 'index'));
  for (const record of records) {
    const resource = 'legacy:' + record.key, step = 'legacy:' + await sha256(record.key);
    if (!replay && await completed(env, job, step)) continue;
    const raw = await kv.get(record.key);
    if (raw !== null && raw !== undefined) {
      if (await sha256(raw) !== record.sourceHash) throw new PortabilityError('legacy_changed_after_confirmation', 'A legacy record changed after confirmation. Deletion has paused.');
      if (record.disposition !== 'delete') {
        const value = await classifyLegacyRecord(record.key, raw, key => kv.get(key));
        if (value?.parishId !== job.parish_id) throw new PortabilityError('legacy_owner_conflict', 'Legacy ownership changed.');
        await retainBytes(env, job, resource, record.disposition, utf8(JSON.stringify(value.data)));
      }
      await kv.delete(record.key);
    } else if (record.disposition !== 'delete' && !await env.AGAPAY_DB.prepare('SELECT 1 FROM parish_portability_retention WHERE job_id=? AND resource=?').bind(job.id,resource).first()) {
      throw new PortabilityError('legacy_retention_missing', 'A required legacy retention copy is missing.');
    }
    // KV can serve a stale value after deletion. That is pending, not success;
    // the authoritative closure guard prevents serving it while retries settle.
    if (await kv.get(record.key) != null) throw new PortabilityError('legacy_deletion_pending', 'Legacy deletion is propagating; the closed parish remains inaccessible.');
    await checkpoint(env, job, step, { kind: record.kind, disposition: record.disposition });
  }
}

export async function retainScopedSettings(env, job) {
  const rows = (await env.AGAPAY_DB.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'reconciliation-close:%' OR key LIKE '__agapay_parish_support_ticket:%'").all()).results;
  for (const row of rows) {
    const value = await classifyLegacyRecord(row.key,row.value);
    if (value?.parishId === job.parish_id) await retainBytes(env,job,'setting:' + row.key,value.disposition,utf8(JSON.stringify(exportRow('app_settings',row))));
  }
}

export async function reviewDueRetentions(env, at = Date.now()) {
  // Expiry opens a review; it never overrides immutable history or a legal hold.
  return env.AGAPAY_DB.prepare("UPDATE parish_portability_retention SET status='review_due',updated_at=? WHERE retain_until<=? AND status='restricted'").bind(at,at).run();
}

export async function removeParishExportCopies(env, job) {
  const bucket = env.PARISH_EXPORTS;
  const copies = (await env.AGAPAY_DB.prepare('SELECT id FROM parish_portability_jobs WHERE parish_id=? LIMIT 1001').bind(job.parish_id).all()).results;
  if (copies.length > 1000) throw new PortabilityError('archive_cleanup_review', 'Export history requires an operator-assisted cleanup.');
  const keys = new Set(copies.map(copy => `parish-exports/${copy.id}/parish.zip`));
  let cursor, scanned = 0;
  do {
    const page = await bucket.list({ prefix: 'parish-exports/', include: ['customMetadata'], limit: 100, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.objects)) throw new PortabilityError('archive_inventory_invalid', 'Private export inventory is unavailable.');
    for (const object of page.objects) {
      if (++scanned > 10000) throw new PortabilityError('archive_cleanup_review', 'Private export storage requires an operator-assisted cleanup.');
      if (!object.customMetadata?.agapayParishId && !keys.has(object.key)) throw new PortabilityError('archive_owner_unknown', 'An orphaned private export needs ownership review.');
      if (object.customMetadata?.agapayParishId === job.parish_id) keys.add(object.key);
      else if (keys.has(object.key) && object.customMetadata?.agapayParishId && object.customMetadata.agapayParishId !== job.parish_id) throw new PortabilityError('archive_owner_conflict', 'Private export ownership conflicts with the job history.');
    }
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw new PortabilityError('archive_inventory_invalid', 'Private export inventory could not be completed.');
    cursor = page.cursor;
  } while (true);
  for (const key of keys) {
    await bucket.delete(key);
    if (await bucket.head(key)) throw new PortabilityError('archive_cleanup_failed', 'A temporary parish export has not been removed.');
  }
  await env.AGAPAY_DB.prepare("UPDATE parish_portability_jobs SET status='cancelled',manifest_json=NULL,archive_key=NULL,updated_at=? WHERE parish_id=? AND id<>?").bind(Date.now(),job.parish_id,job.id).run();
}

export async function removeDisposedOwnershipIndexes(env, parishId) {
  // The independent closure marker prevents new writes. Source keys can contain
  // email addresses; do not keep obsolete ownership indexes indefinitely.
  await env.AGAPAY_DB.batch([
    env.AGAPAY_DB.prepare('DELETE FROM parish_portability_objects WHERE parish_id=?').bind(parishId),
    env.AGAPAY_DB.prepare('DELETE FROM parish_portability_legacy_keys WHERE parish_id=?').bind(parishId),
  ]);
}
