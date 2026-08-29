import { PortabilityError, POLICY_VERSION } from './catalog.js';
import { fileBucket, canonicalBinding, FILE_BINDINGS } from './storage.js';
import { releaseAccountingFreeze } from './accounting.js';
import { suppressionRecord } from './suppression.js';

// Operator-only functions. Deliberately not exposed by a public HTTP route.
export function requireQuarantine(env, evidenceSha256) {
  if (env.PARISH_RESTORE_QUARANTINE !== 'true' || !/^[a-f0-9]{64}$/.test(evidenceSha256 || '')) throw new PortabilityError('quarantine_required', 'Stop all writers, quarantine the target, and supply the reviewed maintenance evidence hash.');
}

export async function reconcileObjectOwnership(env, { binding, key, parishId, expectedEtag, evidenceSha256 }) {
  requireQuarantine(env,evidenceSha256);
  if (!FILE_BINDINGS.includes(binding) || typeof key !== 'string' || key.length > 1024) throw new PortabilityError('inventory_assignment_invalid', 'Invalid object ownership assignment.');
  binding = canonicalBinding(binding);
  const object = await fileBucket(env,binding).head(key);
  if (!object || object.etag !== expectedEtag) throw new PortabilityError('inventory_object_changed', 'The reviewed object version is no longer present.');
  if (!await env.AGAPAY_DB.prepare('SELECT 1 FROM registrations WHERE parish_id=?').bind(parishId).first()) throw new PortabilityError('inventory_owner_missing', 'The reviewed parish owner is missing.');
  const result = await env.AGAPAY_DB.prepare(`INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES(?,?,?,?,'stored',?,?)
    ON CONFLICT(binding,object_key) DO UPDATE SET state='stored',etag=excluded.etag,updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id`).bind(binding,key,parishId,['TAX_EXEMPTION_DOCS','NONPROFIT_PRICING_DOCS','GIVING_STATEMENTS','ACCOUNTING_ATTACHMENTS'].includes(binding) ? 'financial' : 'delete',object.etag,Date.now()).run();
  if (result.meta?.changes !== 1) throw new PortabilityError('inventory_owner_conflict', 'The object is registered to another parish.');
  await env.AGAPAY_DB.prepare('INSERT OR REPLACE INTO parish_portability_inventory_reviews(binding,policy_version,reviewed_at,evidence_sha256) VALUES(?,?,?,?)').bind(binding,POLICY_VERSION,Date.now(),evidenceSha256).run();
}

export async function reconcileFileOperation(env, { operationId, expectedEtag, evidenceSha256 }) {
  requireQuarantine(env,evidenceSha256);
  const operation = await env.AGAPAY_DB.prepare('SELECT * FROM parish_portability_storage_operations WHERE id=?').bind(operationId).first();
  if (!operation || !FILE_BINDINGS.includes(operation.binding)) throw new PortabilityError('operation_review_required', 'This is not a recoverable file operation. Legacy writes require a converged key/value reconciliation.');
  const object = await fileBucket(env,operation.binding).head(operation.object_key);
  if ((object?.etag || null) !== expectedEtag) throw new PortabilityError('operation_changed', 'The observed file outcome changed during review.');
  await env.AGAPAY_DB.batch([
    env.AGAPAY_DB.prepare('UPDATE parish_portability_objects SET state=?,etag=?,updated_at=? WHERE binding=? AND object_key=? AND parish_id=?').bind(object ? 'stored' : 'deleted',object?.etag || null,Date.now(),operation.binding,operation.object_key,operation.parish_id),
    env.AGAPAY_DB.prepare('INSERT OR REPLACE INTO parish_portability_inventory_reviews(binding,policy_version,reviewed_at,evidence_sha256) VALUES(?,?,?,?)').bind('operation:' + operation.id,POLICY_VERSION,Date.now(),evidenceSha256),
    env.AGAPAY_DB.prepare('DELETE FROM parish_portability_storage_operations WHERE id=?').bind(operation.id),
  ]);
}

export async function releaseAbandonedPreparation(env, { parishId, evidenceSha256 }) {
  requireQuarantine(env,evidenceSha256);
  const closure = await env.AGAPAY_DB.prepare('SELECT * FROM parish_data_closures WHERE parish_id=?').bind(parishId).first();
  const job = closure && await env.AGAPAY_DB.prepare('SELECT * FROM parish_portability_jobs WHERE id=?').bind(closure.job_id).first();
  if (!job || job.confirmed_at || closure.state !== 'preparing' || await suppressionRecord(env,parishId)) throw new PortabilityError('preparation_not_releasable', 'Confirmed closure cannot be undone by maintenance recovery.');
  await releaseAccountingFreeze(env,job);
  await env.AGAPAY_DB.batch([
    env.AGAPAY_DB.prepare("DELETE FROM parish_data_closures WHERE parish_id=? AND job_id=? AND state='preparing'").bind(parishId,job.id),
    env.AGAPAY_DB.prepare('DELETE FROM parish_portability_leases WHERE parish_id=?').bind(parishId),
    env.AGAPAY_DB.prepare('INSERT OR REPLACE INTO parish_portability_inventory_reviews(binding,policy_version,reviewed_at,evidence_sha256) VALUES(?,?,?,?)').bind('preparation:' + job.id,POLICY_VERSION,Date.now(),evidenceSha256),
  ]);
}
