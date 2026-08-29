import { collectParishExport } from './export.js';
import { inspectStorage, PortabilityError, POLICY_VERSION, EXPORT_TTL_MS } from './catalog.js';
import { sha256 } from './archive.js';
import { closureReadiness, planCentralPurge, purgeCentralRecords, verifyBarriers } from './closure.js';
import { assertStorageDrained } from './storage.js';
import { recordSuppression, recordSuppressionCompletion } from './suppression.js';
import { freezeAccountingBooks, releaseAccountingFreeze, purgeAccountingCredentials } from './accounting.js';
import { disposeParishFiles, disposeLegacyRecords, retainScopedSettings, recordRetention, reviewDueRetentions, removeParishExportCopies, removeDisposedOwnershipIndexes } from './disposal.js';
import { verifyBackupExpiryEvidence } from './backup-evidence.js';
import { portabilityBudget, recoveryBudget } from './budget.js';

const now = () => Date.now();
const uuid = () => crypto.randomUUID();
const bucket = env => env.PARISH_EXPORTS;
const prepare = (env, sql, ...params) => env.AGAPAY_DB.prepare(sql).bind(...params);
const CONFIRMATION_STEP = 'confirmation_v1';
export const JOB_SELECTION = "j.*,(SELECT json_extract(s.result_json,'$.stage') FROM parish_portability_steps s WHERE s.job_id=j.id AND s.step_key='confirmation_v1' AND s.status='pending') AS confirmation_stage";

export function requirePortability(env) {
  if (env.PARISH_PORTABILITY_ENABLED !== 'true') throw new PortabilityError('portability_disabled', 'Parish portability is awaiting release verification.', 503);
  if (!env.AGAPAY_DB?.prepare || !bucket(env)?.put || !bucket(env)?.get || !bucket(env)?.head || !bucket(env)?.delete || !bucket(env)?.list) throw new PortabilityError('portability_unavailable', 'Private export storage is not configured.', 503);
}

export async function getJob(env, parishId, jobId) {
  const job = await prepare(env, `SELECT ${JOB_SELECTION} FROM parish_portability_jobs j WHERE j.id=? AND j.parish_id=?`, jobId, parishId).first();
  if (!job) throw new PortabilityError('not_found', 'Export not found.', 404);
  return job;
}

export function publicJob(env, job) {
  const manifest = job.manifest_json ? JSON.parse(job.manifest_json) : null;
  return {
    id: job.id, mode: job.mode, status: job.status === 'preparing' && job.confirmation_stage ? 'confirming' : job.status, confirmationStage: job.confirmation_stage || null, policyVersion: job.policy_version,
    createdAt: job.created_at, expiresAt: job.expires_at, confirmedAt: job.confirmed_at,
    completedAt: job.completed_at, archiveSha256: job.archive_sha256, archiveBytes: job.archive_bytes,
    errorCode: job.error_code, rowCount: manifest?.tables?.reduce((n, table) => n + table.rowCount, 0) || 0,
    closure: closureReadiness(env, manifest),
  };
}

export async function jobReceipt(env, job) {
  const step = await prepare(env, "SELECT result_json FROM parish_portability_steps WHERE job_id=? AND step_key='central_purge' AND status='completed'", job.id).first();
  const retention = (await prepare(env, 'SELECT category,retain_until,status FROM parish_portability_retention WHERE job_id=? ORDER BY category,retain_until',job.id).all()).results;
  return { ...publicJob(env, job), dataDisposition: step ? JSON.parse(step.result_json) : null, retention, note: 'Active-data status does not certify that retained records or backup copies have expired. Retention dates open a disposal review; legal holds are not overridden.' };
}

export async function startExport(env, { parishId, actorHash, mode, requestKey }) {
  requirePortability(env);
  if (!['export', 'close'].includes(mode) || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey || '')) throw new PortabilityError('invalid_request', 'A valid export request identifier and mode are required.', 422);
  if (mode === 'close' && !closureReadiness(env, null).available) throw new PortabilityError('closure_unavailable', 'Automatic closure is not enabled. You can still request a non-destructive export.');
  const prior = await prepare(env, 'SELECT * FROM parish_portability_jobs WHERE parish_id=? AND request_key=?', parishId, requestKey).first();
  if (prior) {
    if (prior.mode !== mode || prior.requested_by !== actorHash) throw new PortabilityError('request_conflict', 'This request identifier belongs to another export.');
    return prior;
  }
  if (await prepare(env, 'SELECT parish_id FROM parish_data_closures WHERE parish_id=?', parishId).first()) throw new PortabilityError('closure_in_progress', 'This parish is closing or has closed.');
  const pending = await prepare(env, "SELECT count(*) n FROM parish_portability_jobs WHERE parish_id=? AND status IN ('preparing','ready','deleting') AND expires_at>?", parishId, now()).first();
  if (Number(pending.n) >= 2) throw new PortabilityError('too_many_exports', 'Finish or cancel an existing export before starting another.', 429);
  const id = uuid(), at = now();
  await prepare(env, `INSERT INTO parish_portability_jobs(id,parish_id,requested_by,mode,status,request_key,policy_version,expires_at,created_at,updated_at) VALUES(?,?,?,?,'preparing',?,?,?,?,?)`, id, parishId, actorHash, mode, requestKey, POLICY_VERSION, at + EXPORT_TTL_MS, at, at).run();
  return getJob(env, parishId, id);
}

async function withLease(env, parishId, work) {
  const token = uuid(), at = now();
  await prepare(env, `INSERT INTO parish_portability_leases(parish_id,token,expires_at) VALUES(?,?,?) ON CONFLICT(parish_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE parish_portability_leases.expires_at<?`, parishId, token, at + 15 * 60000, at).run();
  const held = await prepare(env, 'SELECT token FROM parish_portability_leases WHERE parish_id=?', parishId).first();
  if (held?.token !== token) throw new PortabilityError('job_busy', 'Another portability step is running. Please try again shortly.', 409);
  try { return await work(); }
  finally { const restore=recoveryBudget(env); try { await prepare(env, 'DELETE FROM parish_portability_leases WHERE parish_id=? AND token=?', parishId, token).run(); } finally { restore(); } }
}

export async function processExport(env, parishId, jobId) {
  env = portabilityBudget(env);
  requirePortability(env);
  return withLease(env, parishId, async () => {
    const job = await getJob(env, parishId, jobId);
    if (!['preparing', 'deleting'].includes(job.status)) return job;
    try {
      if (job.status === 'deleting') return await finishDeletion(env, job);
      if (job.confirmation_stage) return await advanceConfirmation(env, job);
      if (job.expires_at <= now()) throw new PortabilityError('export_expired', 'The export request expired. Please start again.');
      if (await prepare(env, 'SELECT parish_id FROM parish_data_closures WHERE parish_id=?', parishId).first()) throw new PortabilityError('closure_in_progress', 'The parish is closing.');
      const result = await collectParishExport(env, parishId);
      const archiveKey = `parish-exports/${job.id}/parish.zip`;
      await bucket(env).put(archiveKey, result.archive, { httpMetadata: { contentType: 'application/zip', cacheControl: 'private, no-store' }, customMetadata: { jobId: job.id, agapayParishId: parishId, sha256: result.archiveHash } });
      const stored = await bucket(env).head(archiveKey);
      if (!stored || stored.size !== result.archive.byteLength || stored.customMetadata?.sha256 !== result.archiveHash) throw new PortabilityError('archive_verification_failed', 'The private archive could not be verified.');
      const update = await prepare(env, `UPDATE parish_portability_jobs SET status='ready',manifest_json=?,manifest_sha256=?,archive_key=?,archive_sha256=?,archive_bytes=?,error_code=NULL,updated_at=? WHERE id=? AND status='preparing' AND NOT EXISTS(SELECT 1 FROM parish_data_closures WHERE parish_id=?)`, JSON.stringify(result.manifest), result.manifestHash, archiveKey, result.archiveHash, result.archive.byteLength, now(), job.id, parishId).run();
      if (update.meta?.changes !== 1) {
        await bucket(env).delete(archiveKey);
        throw new PortabilityError('export_cancelled', 'The export was cancelled or the parish is closing.');
      }
      return getJob(env, parishId, jobId);
    } catch (error) {
      recoveryBudget(env);
      const code = error instanceof PortabilityError ? error.code : 'storage_operation_failed';
      if (job.confirmation_stage && job.confirmation_stage !== 'releasing' && !(await getJob(env,parishId,jobId)).confirmed_at) {
        // Record cleanup intent before releasing anything. A crash or release
        // failure leaves a durable, retryable cleanup stage and intact fences.
        await rejectConfirmation(env,job,code);
      }
      await prepare(env, "UPDATE parish_portability_jobs SET status='failed',error_code=?,updated_at=? WHERE id=? AND status IN ('preparing','deleting')", code, now(), job.id).run();
      throw error;
    }
  });
}

export async function downloadExport(env, parishId, jobId) {
  requirePortability(env);
  const job = await getJob(env, parishId, jobId);
  if (job.status !== 'ready' || job.expires_at <= now()) throw new PortabilityError('export_unavailable', 'This export is not ready or has expired.', 410);
  const object = await bucket(env).get(job.archive_key);
  if (!object?.body || object.size !== job.archive_bytes || object.customMetadata?.sha256 !== job.archive_sha256) throw new PortabilityError('archive_unavailable', 'The verified archive is unavailable. No deletion has been authorized.', 503);
  return { job, object };
}

export async function confirmClosure(env, { parishId, jobId, actorHash, archiveHash, policyVersion, saved, confirmation }) {
  env = portabilityBudget(env);
  requirePortability(env);
  return withLease(env, parishId, async () => {
    const job = await getJob(env, parishId, jobId);
    if (job.requested_by !== actorHash) throw new PortabilityError('wrong_actor', 'Confirm closure using the same administrator session that requested this export.', 403);
    if (saved !== true || confirmation !== parishId || archiveHash !== job.archive_sha256 || policyVersion !== job.policy_version || policyVersion !== POLICY_VERSION) throw new PortabilityError('confirmation_invalid', 'Verify the saved archive, accept the current policy, and type the parish identifier before confirming.', 422);
    if (job.confirmed_at && ['deleting', 'active_data_deleted'].includes(job.status)) return job;
    if (job.status === 'preparing' && job.confirmation_stage) return job;
    if (job.mode !== 'close' || job.status !== 'ready' || job.expires_at <= now()) throw new PortabilityError('confirmation_unavailable', 'This closure export is not ready or has expired.');
    const manifest = JSON.parse(job.manifest_json);
    const readiness = closureReadiness(env, manifest);
    if (!readiness.available) throw new PortabilityError('closure_blocked', readiness.blockers.map(b => b.message).join(' '));
    await verifyBackupExpiryEvidence(env);
    const download = await downloadExport(env, parishId, jobId);
    await download.object.body.cancel();
    const inventory = await inspectStorage(env.AGAPAY_DB);
    await verifyBarriers(env.AGAPAY_DB, inventory);
    const at = now();
    const intent = { stage:'freeze_books', requestedAt:at, expiresAt:Math.min(job.expires_at,at+15*60000), actorHash, archiveSha256:archiveHash, manifestSha256:job.manifest_sha256, policyVersion };
    // Consent and the central/storage fence commit together. This is not yet
    // deletion authorization. Each later scheduler invocation does one phase.
    await env.AGAPAY_DB.batch([
      prepare(env, "INSERT INTO parish_data_closures(parish_id,job_id,state,policy_version,created_at,updated_at) VALUES(?,?,'preparing',?,?,?)", parishId, jobId, POLICY_VERSION, at, at),
      prepare(env, "INSERT OR REPLACE INTO parish_portability_steps(job_id,step_key,status,result_json,updated_at) VALUES(?,?,'pending',?,?)",jobId,CONFIRMATION_STEP,JSON.stringify(intent),at),
      prepare(env, "UPDATE parish_portability_jobs SET status='preparing',updated_at=? WHERE id=? AND status='ready' AND confirmed_at IS NULL",at,jobId),
    ]);
    return getJob(env,parishId,jobId);
  });
}

async function confirmationIntent(env,job) {
  const row = await prepare(env,"SELECT result_json FROM parish_portability_steps WHERE job_id=? AND step_key=? AND status='pending'",job.id,CONFIRMATION_STEP).first();
  if (!row) throw new PortabilityError('confirmation_missing','The closure request needs a fresh confirmation.');
  return JSON.parse(row.result_json);
}

async function rejectConfirmation(env,job,code,disposition='failed') {
  if ((await getJob(env,job.parish_id,job.id)).confirmed_at) throw new PortabilityError('deletion_started','Confirmed closure cannot be released.');
  await prepare(env,"UPDATE parish_portability_steps SET result_json=?,updated_at=? WHERE job_id=? AND step_key=? AND status='pending'",JSON.stringify({stage:'releasing',code,disposition}),now(),job.id,CONFIRMATION_STEP).run();
  await releaseAccountingFreeze(env,job);
  if (disposition === 'cancelled') await bucket(env).delete(`parish-exports/${job.id}/parish.zip`);
  await env.AGAPAY_DB.batch([
    prepare(env,"DELETE FROM parish_data_closures WHERE parish_id=? AND job_id=? AND state='preparing'",job.parish_id,job.id),
    prepare(env,"UPDATE parish_portability_jobs SET status=?,error_code=?,updated_at=?,manifest_json=CASE WHEN ?='cancelled' THEN NULL ELSE manifest_json END,archive_key=CASE WHEN ?='cancelled' THEN NULL ELSE archive_key END WHERE id=? AND confirmed_at IS NULL",disposition,code,now(),disposition,disposition,job.id),
    prepare(env,"UPDATE parish_portability_steps SET status='completed',result_json=?,updated_at=? WHERE job_id=? AND step_key=?",JSON.stringify({stage:disposition,code}),now(),job.id,CONFIRMATION_STEP),
  ]);
  return getJob(env,job.parish_id,job.id);
}

async function advanceConfirmation(env,job) {
  const intent = await confirmationIntent(env,job);
  if (intent.stage === 'releasing') return rejectConfirmation(env,job,intent.code,intent.disposition);
  if (!['freeze_books','authorize'].includes(intent.stage) || intent.actorHash !== job.requested_by || intent.archiveSha256 !== job.archive_sha256 || intent.manifestSha256 !== job.manifest_sha256 || intent.policyVersion !== POLICY_VERSION || !Number.isSafeInteger(intent.requestedAt) || !Number.isSafeInteger(intent.expiresAt) || intent.requestedAt > now() || intent.expiresAt > intent.requestedAt+15*60000 || intent.expiresAt <= now() || job.expires_at <= now()) throw new PortabilityError('confirmation_expired','The closure confirmation expired or changed. Download and confirm a fresh export.');
  const fence = await prepare(env,"SELECT job_id,state FROM parish_data_closures WHERE parish_id=?",job.parish_id).first();
  if (fence?.job_id !== job.id || fence.state !== 'preparing') throw new PortabilityError('confirmation_fence_missing','The closure write fence changed. A fresh export is required.');
  const inventory = await inspectStorage(env.AGAPAY_DB);
  await verifyBarriers(env.AGAPAY_DB,inventory);
  await assertStorageDrained(env,job.parish_id);
  const manifest = JSON.parse(job.manifest_json);
  if (await sha256(JSON.stringify(manifest,null,2)) !== intent.manifestSha256) throw new PortabilityError('confirmation_changed','The confirmed export manifest changed.');
  if (!closureReadiness(env,manifest).available) throw new PortabilityError('closure_blocked','Closure prerequisites are no longer satisfied.');
  await verifyBackupExpiryEvidence(env);
  await freezeAccountingBooks(env,job,{requireExisting:intent.stage==='authorize'});
  if (intent.stage === 'freeze_books') {
    await prepare(env,"UPDATE parish_portability_steps SET result_json=?,updated_at=? WHERE job_id=? AND step_key=? AND status='pending'",JSON.stringify({...intent,stage:'authorize'}),now(),job.id,CONFIRMATION_STEP).run();
    return getJob(env,job.parish_id,job.id);
  }
  // The final source comparison and dependency check share one invocation, with
  // all fences still installed. No prior invocation's data comparison is reused.
  const current = await collectParishExport(env,job.parish_id);
  const comparison = m => JSON.stringify({tables:m.tables,files:m.files,legacyRecords:m.legacyRecords,assets:m.assets,activeLegalHolds:m.activeLegalHolds});
  if (comparison(current.manifest) !== comparison(manifest)) throw new PortabilityError('export_stale','Parish data changed after the export. Download and verify a new archive before closing.');
  if (!closureReadiness(env,current.manifest).available) throw new PortabilityError('closure_blocked','Closure prerequisites are no longer satisfied.');
  await planCentralPurge(env,job,inventory);
  const at = now();
  if (intent.expiresAt <= at) throw new PortabilityError('confirmation_expired','The closure confirmation expired. A fresh confirmation is required.');
  await env.AGAPAY_DB.batch([
    prepare(env,"UPDATE parish_portability_jobs SET status='deleting',confirmed_at=?,updated_at=? WHERE id=? AND status='preparing' AND confirmed_at IS NULL",at,at,job.id),
    prepare(env,"UPDATE parish_data_closures SET state='deleting',updated_at=? WHERE parish_id=? AND job_id=? AND state='preparing'",at,job.parish_id,job.id),
    prepare(env,"UPDATE parish_portability_steps SET status='completed',result_json=?,updated_at=? WHERE job_id=? AND step_key=? AND status='pending'",JSON.stringify({stage:'authorized',requestedAt:intent.requestedAt}),at,job.id,CONFIRMATION_STEP),
  ]);
  const confirmed = await getJob(env,job.parish_id,job.id);
  await recordSuppression(env,confirmed);
  return confirmed;
}

async function finishDeletion(env, job) {
  if (!job.confirmed_at || job.policy_version !== POLICY_VERSION) throw new PortabilityError('closure_not_authorized', 'A valid closure authorization is required.');
  const manifest = JSON.parse(job.manifest_json);
  const readiness = closureReadiness(env, manifest);
  if (!readiness.available) throw new PortabilityError('closure_blocked', 'Closure prerequisites are no longer satisfied.');
  await recordSuppression(env,job);
  await assertStorageDrained(env,job.parish_id);
  let step = await prepare(env, "SELECT result_json FROM parish_portability_steps WHERE job_id=? AND step_key='central_purge'", job.id).first();
  if (!step) {
    await verifyBackupExpiryEvidence(env);
    const books = await freezeAccountingBooks(env,job);
    await purgeAccountingCredentials(books,job);
    if (books) await recordRetention(env,job,'accounting-books','accounting',{ disposition: 'frozen_in_original_dedicated_database', holds: manifest.activeLegalHolds },manifest.accountingRetentionYears);
    await retainScopedSettings(env,job);
    await disposeParishFiles(env,job,manifest);
    await disposeLegacyRecords(env,job,manifest);
    const result = await purgeCentralRecords(env, job, await inspectStorage(env.AGAPAY_DB));
    step = { result_json: JSON.stringify(result) };
  }
  const disposition = JSON.parse(step.result_json);
  if (disposition.retainedTables?.length) await recordRetention(env,job,'central-financial-records','financial',{ tables: disposition.retainedTables },manifest.accountingRetentionYears);
  // Other downloads for the same parish are copies too. Delete all known export
  // objects, including an object uploaded before its metadata write failed.
  await removeParishExportCopies(env,job);
  await removeDisposedOwnershipIndexes(env,job.parish_id);
  await recordSuppressionCompletion(env,job);
  await prepare(env, "UPDATE parish_portability_jobs SET status='active_data_deleted',completed_at=?,updated_at=?,manifest_json=NULL,archive_key=NULL,error_code=NULL WHERE id=? AND status='deleting'", now(), now(), job.id).run();
  return getJob(env, job.parish_id, job.id);
}

export async function cancelExport(env, parishId, jobId) {
  env = portabilityBudget(env);
  return withLease(env, parishId, async () => {
    const job = await getJob(env, parishId, jobId);
    if (job.confirmed_at) throw new PortabilityError('deletion_started', 'Deletion has been authorized and cannot be undone.');
    if (job.confirmation_stage) return rejectConfirmation(env,job,'confirmation_cancelled','cancelled');
    if (await prepare(env,'SELECT 1 FROM parish_data_closures WHERE parish_id=?',parishId).first()) throw new PortabilityError('closure_preparation_pending', 'Closure preparation is running or needs recovery. Its write barrier cannot be removed by cancelling an export.');
    await bucket(env).delete(`parish-exports/${job.id}/parish.zip`);
    await prepare(env, "UPDATE parish_portability_jobs SET status='cancelled',manifest_json=NULL,archive_key=NULL,updated_at=? WHERE id=? AND confirmed_at IS NULL", now(), jobId).run();
    return getJob(env, parishId, jobId);
  });
}

export async function retryExport(env, parishId, jobId) {
  const job = await getJob(env, parishId, jobId);
  if (job.status !== 'failed' || (!job.confirmed_at && !job.confirmation_stage && job.expires_at <= now())) throw new PortabilityError('retry_unavailable', 'This job cannot be retried. Start a new export.');
  await prepare(env, "UPDATE parish_portability_jobs SET status=?,error_code=NULL,updated_at=? WHERE id=? AND status='failed'", job.confirmed_at ? 'deleting' : 'preparing', now(), jobId).run();
  return getJob(env, parishId, jobId);
}

export async function runPortabilityJobs(env) {
  if (env.PARISH_PORTABILITY_ENABLED !== 'true') return { skipped: true };
  env = portabilityBudget(env);
  requirePortability(env);
  await reviewDueRetentions(env);
  const jobs = (await prepare(env, "SELECT id,parish_id,status FROM parish_portability_jobs j WHERE status IN ('preparing','deleting') OR (status='failed' AND (confirmed_at IS NOT NULL OR EXISTS(SELECT 1 FROM parish_portability_steps s WHERE s.job_id=j.id AND s.step_key='confirmation_v1' AND s.status='pending'))) ORDER BY updated_at LIMIT 1").all()).results;
  for (const job of jobs) {
    if (job.status === 'failed') await retryExport(env, job.parish_id, job.id);
    await processExport(env, job.parish_id, job.id);
  }
  // Do not combine a full phase with expiration cleanup in the same invocation.
  if (jobs.length) return {processed:jobs.length,expired:0};
  const expired = (await prepare(env, "SELECT id,parish_id FROM parish_portability_jobs WHERE expires_at<? AND confirmed_at IS NULL AND status IN ('ready','failed') LIMIT 10", now()).all()).results;
  for (const job of expired) await cancelExport(env, job.parish_id, job.id);
  return { processed: jobs.length, expired: expired.length };
}

export async function actorFingerprint(bearer) { return sha256('parish-portability-session:' + bearer); }
