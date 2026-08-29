import { PortabilityError, POLICY_VERSION } from './catalog.js';
import { sha256 } from './archive.js';

export const storageGuardsEnabled = env => env.PARISH_STORAGE_GUARDS_ENABLED === 'true';
const prefix = 'closures/';
const fail = () => new PortabilityError('suppression_unavailable', 'The independent closure authority is unavailable. Access is paused.', 503);

async function authority(env) {
  const bucket = env.PARISH_CLOSURE_LEDGER;
  if (!bucket?.get || !bucket?.put || !bucket?.list || !env.PARISH_SUPPRESSION_AUTHORITY) throw fail();
  const object = await bucket.get('authority.json');
  if (!object || object.size > 2048) throw fail();
  const value = JSON.parse(await object.text());
  if (value.id !== env.PARISH_SUPPRESSION_AUTHORITY || value.policyVersion !== POLICY_VERSION) throw fail();
  return bucket;
}

export async function suppressionRecord(env, parishId) {
  const bucket = await authority(env);
  const object = await bucket.get(prefix + await sha256(parishId) + '.json');
  if (!object) return null;
  if (object.size > 4096) throw fail();
  const record = JSON.parse(await object.text());
  if (record.parishId !== parishId || record.policyVersion !== POLICY_VERSION || !record.jobId || !Number.isSafeInteger(record.confirmedAt)) throw fail();
  return record;
}

export async function recordSuppression(env, job) {
  if (!job.confirmed_at || job.mode !== 'close' || job.policy_version !== POLICY_VERSION) throw fail();
  const bucket = await authority(env);
  const accountingRetentionYears = JSON.parse(job.manifest_json || '{}').accountingRetentionYears || 7;
  if (!Number.isInteger(accountingRetentionYears) || accountingRetentionYears < 7 || accountingRetentionYears > 100) throw fail();
  const record = { parishId: job.parish_id, jobId: job.id, policyVersion: POLICY_VERSION, confirmedAt: job.confirmed_at, archiveSha256: job.archive_sha256, accountingRetentionYears };
  const key = prefix + await sha256(job.parish_id) + '.json';
  const existing = await suppressionRecord(env,job.parish_id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(record)) throw fail();
    return existing; // A locked marker must never need another PUT on retry.
  }
  // An immutable per-parish marker survives restoration of the application DB.
  // Never overwrite another closure, even if a registration ID is reused.
  await bucket.put(key, JSON.stringify(record), { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' }, customMetadata: { parishId: record.parishId, jobId: record.jobId, policyVersion: record.policyVersion, confirmedAt: String(record.confirmedAt), archiveSha256: record.archiveSha256 } });
  const stored = await suppressionRecord(env, job.parish_id);
  if (JSON.stringify(stored) !== JSON.stringify(record)) throw fail();
  return stored;
}

export async function recordSuppressionCompletion(env, job) {
  const suppression = await suppressionRecord(env,job.parish_id);
  if (suppression?.jobId !== job.id || suppression.confirmedAt !== job.confirmed_at) throw fail();
  const bucket = await authority(env), key = 'completions/' + await sha256(job.parish_id) + '.json';
  const record = { parishId:job.parish_id, jobId:job.id, policyVersion:POLICY_VERSION, confirmedAt:job.confirmed_at };
  const existing = await bucket.get(key);
  if (existing) {
    if (existing.size > 4096 || JSON.stringify(JSON.parse(await existing.text())) !== JSON.stringify(record)) throw fail();
    return;
  }
  await bucket.put(key,JSON.stringify(record),{ onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'},customMetadata:{...record,confirmedAt:String(record.confirmedAt)} });
  const object = await bucket.get(key);
  if (!object || object.size > 4096 || JSON.stringify(JSON.parse(await object.text())) !== JSON.stringify(record)) throw fail();
}

export async function listSuppressions(env) {
  const bucket = await authority(env), records = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: 100, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.objects)) throw fail();
    for (const item of page.objects) {
      if (records.length >= 1000 || !/^closures\/[a-f0-9]{64}\.json$/.test(item.key)) throw fail();
      const object = await bucket.get(item.key);
      if (!object || object.size > 4096) throw fail();
      const record = JSON.parse(await object.text());
      if (!record.parishId || !record.jobId || !Number.isSafeInteger(record.confirmedAt) || !Number.isInteger(record.accountingRetentionYears) || record.accountingRetentionYears < 7 || record.accountingRetentionYears > 100 || record.policyVersion !== POLICY_VERSION || item.key !== prefix + await sha256(record.parishId) + '.json') throw fail();
      records.push(record);
    }
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw fail();
    cursor = page.cursor;
  } while (true);
  return records;
}

// No cached negative result. A restored DB missing even one independent marker
// must not serve traffic or start scheduled writers. Errors also deny access.
export async function assertRestoreSafe(env) {
  if (!storageGuardsEnabled(env)) return;
  if (env.PARISH_RESTORE_QUARANTINE === 'true') throw new PortabilityError('restore_quarantined', 'This restored environment is quarantined.', 503);
  const bucket = await authority(env), records = [];
  for (const namespace of [prefix,'completions/']) {
   let cursor, scanned=0;
   do {
    const page = await bucket.list({ prefix:namespace, include: ['customMetadata'], limit: 100, ...(cursor ? {cursor} : {}) });
    if (!Array.isArray(page.objects)) throw fail();
    for (const object of page.objects) {
      const metadata = object.customMetadata;
      if (++scanned > 1000 || !metadata?.parishId || !metadata.jobId || metadata.policyVersion !== POLICY_VERSION || !Number.isSafeInteger(Number(metadata.confirmedAt)) || object.key !== namespace + await sha256(metadata.parishId) + '.json') throw fail();
      records.push({ ...metadata, confirmedAt: Number(metadata.confirmedAt), complete:namespace==='completions/' });
    }
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw fail();
    cursor = page.cursor;
   } while (true);
  }
  const rows = (await env.AGAPAY_DB.prepare("SELECT c.parish_id,c.job_id,c.state,j.confirmed_at,EXISTS(SELECT 1 FROM parish_portability_steps s WHERE s.job_id=j.id AND s.step_key='central_purge' AND s.status='completed') AS purged FROM parish_data_closures c JOIN parish_portability_jobs j ON j.id=c.job_id LIMIT 1001").all()).results;
  if (rows.length > 1000) throw fail();
  const byParish = new Map(rows.map(row => [row.parish_id,row]));
  for (const record of records) {
    const local = byParish.get(record.parishId);
    if (!local || local.job_id !== record.jobId || !['deleting','closed'].includes(local.state) || local.confirmed_at !== record.confirmedAt || (record.complete && (local.state !== 'closed' || !local.purged || !records.some(other=>!other.complete && other.parishId===record.parishId && other.jobId===record.jobId)))) throw new PortabilityError('restore_suppression_required', 'A restored database requires closure suppression replay before use.', 503);
  }
}
