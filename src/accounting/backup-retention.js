const DAY_MS = 24 * 60 * 60 * 1000;
const R2_DELETE_BATCH_SIZE = 1000;

export const DEFAULT_ACCOUNTING_BACKUP_RETENTION_DAYS = 365;

export function strictBackupExpiryEnabled(env = {}) {
  return env.ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED === "true";
}

export function accountingBackupRetentionDays(env = {}) {
  const configured = String(env.ACCOUNTING_BACKUP_RETENTION_DAYS ?? "").trim();
  if (!configured) return DEFAULT_ACCOUNTING_BACKUP_RETENTION_DAYS;
  const days = Number(configured);
  if (!Number.isInteger(days) || days < 1 || days > 36500) {
    throw new Error("ACCOUNTING_BACKUP_RETENTION_DAYS_INVALID");
  }
  return days;
}

function uploadedAtMs(object) {
  const uploaded = object?.uploaded instanceof Date ? object.uploaded.getTime() : new Date(object?.uploaded).getTime();
  if (!Number.isFinite(uploaded)) throw new Error("ACCOUNTING_BACKUP_UPLOADED_AT_INVALID");
  return uploaded;
}

async function listAllBackups(bucket) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list(cursor ? { cursor } : {});
    if (!Array.isArray(page.objects)) throw new Error('ACCOUNTING_BACKUP_LIST_INVALID');
    objects.push(...page.objects);
    if (objects.length > 10000) throw new Error('ACCOUNTING_BACKUP_INVENTORY_TOO_LARGE');
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw new Error("ACCOUNTING_BACKUP_LIST_CURSOR_INVALID");
    cursor = page.cursor;
  } while (cursor);
  return objects;
}

export async function sweepAccountingBackupRetention(env = {}, asOf = Date.now()) {
  const retentionDays = accountingBackupRetentionDays(env);
  const asOfMs = new Date(asOf).getTime();
  if (!Number.isFinite(asOfMs)) throw new Error("ACCOUNTING_BACKUP_RETENTION_AS_OF_INVALID");
  const cutoffMs = asOfMs - retentionDays * DAY_MS;
  const cutoff = new Date(cutoffMs).toISOString();
  const bucket = env.ACCOUNTING_BACKUPS;
  if (!bucket?.list || !bucket?.delete || !bucket?.head) {
    return { objectsScanned: 0, deleted: 0, kept: 0, retentionDays, cutoff, newestBackupPreserved: false, skipped: "binding_missing" };
  }

  const objects = await listAllBackups(bucket);
  const ordered = objects
    .map((object) => ({ object, uploadedMs: uploadedAtMs(object) }))
    .sort((left, right) => right.uploadedMs - left.uploadedMs || String(left.object.key).localeCompare(String(right.object.key)));
  let expired = ordered.filter(({ uploadedMs }) => uploadedMs < cutoffMs);
  // Preserve the deployed retention policy until strict expiry has passed its
  // own release review. Portability UI/closure flags do not control this cron.
  const strictExpiry = strictBackupExpiryEnabled(env);
  const newestBackupPreserved = !strictExpiry && Boolean(expired.length && expired.length === ordered.length);
  if (newestBackupPreserved) expired = expired.filter(({ object }) => object.key !== ordered[0].object.key);

  const keys = expired.map(({ object }) => object.key);
  for (let offset = 0; offset < keys.length; offset += R2_DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(offset, offset + R2_DELETE_BATCH_SIZE));
    for (const key of keys.slice(offset, offset + R2_DELETE_BATCH_SIZE)) if (await bucket.head(key)) throw new Error('ACCOUNTING_BACKUP_DELETE_UNCONFIRMED');
  }

  const report = {
    objectsScanned: objects.length,
    deleted: keys.length,
    kept: objects.length - keys.length,
    retentionDays,
    cutoff,
    newestBackupPreserved,
  };
  if (strictExpiry && env.PARISH_CLOSURE_LEDGER) await env.PARISH_CLOSURE_LEDGER.put('backup-expiry/latest.json', JSON.stringify({ ...report, strictExpiryEnabled: true, verifiedAt: asOfMs, oldestRetainedAt: ordered.filter(({uploadedMs}) => uploadedMs >= cutoffMs).at(-1)?.uploadedMs || null }), { httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } });
  return report;
}
