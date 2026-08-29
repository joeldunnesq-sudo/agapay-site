import { accountingBackupRetentionDays, strictBackupExpiryEnabled } from '../accounting/backup-retention.js';
import { PortabilityError } from './catalog.js';

export async function verifyBackupExpiryEvidence(env, at = Date.now()) {
  if (!strictBackupExpiryEnabled(env)) throw new PortabilityError('backup_expiry_disabled', 'Strict backup expiry must be enabled and verified before closure.');
  const object = await env.PARISH_CLOSURE_LEDGER?.get('backup-expiry/latest.json');
  if (!object || object.size > 8192) throw new PortabilityError('backup_evidence_missing', 'A recent verified backup expiry sweep is required.');
  const evidence = JSON.parse(await object.text());
  if (evidence.strictExpiryEnabled !== true) throw new PortabilityError('backup_evidence_stale', 'Backup expiry evidence predates the strict-expiry release gate.');
  if (!Number.isSafeInteger(evidence.verifiedAt) || evidence.verifiedAt > at || at - evidence.verifiedAt > 48 * 3600000 || evidence.retentionDays !== accountingBackupRetentionDays(env) || evidence.newestBackupPreserved !== false || evidence.skipped || (evidence.oldestRetainedAt !== null && (!Number.isSafeInteger(evidence.oldestRetainedAt) || evidence.oldestRetainedAt < evidence.verifiedAt - evidence.retentionDays * 86400000))) throw new PortabilityError('backup_evidence_stale', 'Backup expiry evidence is stale or inconsistent with the configured policy.');
  return evidence;
}
