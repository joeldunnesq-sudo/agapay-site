import { rows, query, rootKey } from './storage.js';
import { advanceRecovery } from './service.js';

export async function runRecoveryJobs(env) {
  if (env.PARISH_RECOVERY_ENABLED !== 'true') return { skipped: true };
  const active = await rows(
    env.AGAPAY_DB,
    "SELECT id,parish_id FROM parish_recovery_operations WHERE status='running' AND lease_until<? ORDER BY updated_at LIMIT 1",
    Date.now()
  );
  for (const op of active) {
    try {
      await advanceRecovery(env, op.parish_id, op.id);
    } catch (error) {
      if (error.code === 'recovery_busy') continue;
      console.error('parish_recovery_step_paused', error.code || 'step_failed');
      // Let the existing scheduled-job alerting wrapper report a paused recovery.
      // Do not forward raw database/provider errors into email or monitoring.
      throw new Error('Parish recovery is paused; inspect the saved recovery operation before retrying.');
    }
  }
  if (active.length) return { processed: active.length };
  const expired = await rows(
    env.AGAPAY_DB,
    "SELECT s.id FROM parish_recovery_snapshots s WHERE s.expires_at<? AND s.status<>'expired' AND NOT EXISTS(SELECT 1 FROM parish_recovery_operations o WHERE o.status IN ('running','paused') AND (o.target_id=s.id OR o.safety_id=s.id)) LIMIT 3",
    Date.now()
  );
  for (const s of expired) {
    for (const part of ['central', 'books', 'files']) await env.PARISH_EXPORTS.delete(rootKey(s.id) + part + '.json');
    await query(
      env.AGAPAY_DB,
      "UPDATE parish_recovery_snapshots SET status='expired',manifest_json=NULL,manifest_sha256=NULL WHERE id=?",
      s.id
    ).run();
  }
  return { expired: expired.length };
}
