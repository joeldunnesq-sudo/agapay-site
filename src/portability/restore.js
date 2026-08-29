import { listSuppressions, recordSuppressionCompletion } from './suppression.js';
import { requireQuarantine } from './maintenance.js';
import { inspectStorage, PortabilityError } from './catalog.js';
import { barrierStatements, verifyBarriers, purgeCentralRecords } from './closure.js';
import { assertStorageDrained, inventoryParishObjects, fileBucket } from './storage.js';
import { collectLegacyRecords } from './legacy.js';
import { freezeAccountingBooks, purgeAccountingCredentials } from './accounting.js';
import { disposeParishFiles, disposeLegacyRecords, retainScopedSettings, recordRetention, removeParishExportCopies, removeDisposedOwnershipIndexes } from './disposal.js';

// A restore runner supplies the quarantined target bindings and the ORIGINAL
// independent ledger. Never bind a copy of the ledger taken from the backup.
export async function replayClosureSuppressions(env, evidenceSha256) {
  requireQuarantine(env,evidenceSha256);
  const inventory = await inspectStorage(env.AGAPAY_DB);
  await env.AGAPAY_DB.batch(barrierStatements(inventory.map(t => t.name)).map(sql => env.AGAPAY_DB.prepare(sql)));
  await verifyBarriers(env.AGAPAY_DB,inventory);
  const records = await listSuppressions(env);
  for (const record of records) {
    await env.AGAPAY_DB.batch([
      env.AGAPAY_DB.prepare(`INSERT OR IGNORE INTO parish_portability_jobs(id,parish_id,requested_by,mode,status,request_key,policy_version,archive_sha256,expires_at,confirmed_at,created_at,updated_at)
        VALUES(?,?,'restore-suppression','close','deleting',?,?,?,?,?,?,?)`).bind(record.jobId,record.parishId,'restore-' + record.jobId,record.policyVersion,record.archiveSha256,record.confirmedAt,record.confirmedAt,record.confirmedAt,Date.now()),
      env.AGAPAY_DB.prepare("INSERT OR IGNORE INTO parish_data_closures(parish_id,job_id,state,policy_version,created_at,updated_at) VALUES(?,?,'preparing',?,?,?)").bind(record.parishId,record.jobId,record.policyVersion,record.confirmedAt,Date.now()),
    ]);
    const job = await env.AGAPAY_DB.prepare('SELECT * FROM parish_portability_jobs WHERE id=?').bind(record.jobId).first();
    const closure = await env.AGAPAY_DB.prepare('SELECT * FROM parish_data_closures WHERE parish_id=?').bind(record.parishId).first();
    if (job?.parish_id !== record.parishId || job.confirmed_at !== record.confirmedAt || job.archive_sha256 !== record.archiveSha256 || closure?.job_id !== record.jobId) throw new PortabilityError('restore_marker_conflict', 'Restored control data conflicts with the independent closure authority.');
  }
  return records.map(record => ({ parishId: record.parishId, jobId: record.jobId }));
}

export async function sanitizeRestoredParish(env, parishId, evidenceSha256) {
  requireQuarantine(env,evidenceSha256);
  const record = (await listSuppressions(env)).find(row => row.parishId === parishId);
  if (!record) throw new PortabilityError('restore_not_authorized', 'No independent closure authorization exists for this parish.');
  const job = await env.AGAPAY_DB.prepare('SELECT * FROM parish_portability_jobs WHERE id=? AND parish_id=?').bind(record.jobId,parishId).first();
  if (!job || job.confirmed_at !== record.confirmedAt) throw new PortabilityError('restore_replay_required', 'Replay the independent closure authority first.');
  await assertStorageDrained(env,parishId);
  // Replay also covers an older file/KV/accounting restore paired with a newer
  // central DB. Historical checkpoints are not evidence about restored copies.
  {
    const books = await freezeAccountingBooks(env,job);
    await purgeAccountingCredentials(books,job);
    if (books) await recordRetention(env,job,'accounting-books','accounting',{ disposition: 'restored_books_frozen_pending_retention_review', evidenceSha256 },record.accountingRetentionYears);
    const assets = [];
    for (const asset of await inventoryParishObjects(env,parishId)) assets.push({ ...asset, etag: (await fileBucket(env,asset.binding).head(asset.key)).etag });
    const legacyRecords = await collectLegacyRecords(env,parishId);
    await retainScopedSettings(env,job);
    await disposeParishFiles(env,job,{ assets,accountingRetentionYears:record.accountingRetentionYears },{ replay: true });
    await disposeLegacyRecords(env,job,{ legacyRecords },{ replay: true });
    await env.AGAPAY_DB.prepare("UPDATE parish_data_closures SET state='deleting',updated_at=? WHERE parish_id=? AND job_id=?").bind(Date.now(),parishId,job.id).run();
    const result = await purgeCentralRecords(env,job,await inspectStorage(env.AGAPAY_DB));
    await recordRetention(env,job,'central-financial-records','financial',{ tables: result.retainedTables, evidenceSha256 },record.accountingRetentionYears);
  }
  await removeParishExportCopies(env,job);
  await removeDisposedOwnershipIndexes(env,job.parish_id);
  await recordSuppressionCompletion(env,job);
  await env.AGAPAY_DB.prepare("UPDATE parish_portability_jobs SET status='active_data_deleted',manifest_json=NULL,archive_key=NULL,completed_at=?,updated_at=? WHERE id=?").bind(Date.now(),Date.now(),job.id).run();
  return { parishId, jobId: job.id, sanitized: true, quarantineStillRequired: true };
}
