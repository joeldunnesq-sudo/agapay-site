// Only a manifest published after cloud read-back verification is evidence.
// Return a small public summary, never storage keys or platform-wide row counts.
export async function cloudBackupStatus(env, now = Date.now()) {
  const result = {
    status: 'unavailable',
    backedUpAt: null,
    checkedAt: new Date(now).toISOString(),
    scope: 'AGAPAY central database',
  };
  try {
    const bucket = env.ACCOUNTING_BACKUPS;
    const object = await bucket?.get('platform-d1/verified.json');
    if (!object || object.size > 262144) return result;
    const manifest = JSON.parse(await object.text());
    const at = Date.parse(manifest.createdAt);
    const artifact = manifest.artifact;
    if (
      !Number.isFinite(at) ||
      at > now ||
      manifest.validation?.localRestore !== 'passed' ||
      manifest.validation?.quickCheck !== 'ok' ||
      !/^platform-d1\/.+\.sql$/.test(artifact?.backupKey || '') ||
      !/^[a-f0-9]{64}$/.test(artifact?.sha256 || '')
    )
      return result;
    const stored = await bucket.head(artifact.backupKey);
    if (!stored || stored.size !== artifact.bytes) return result;
    return {
      ...result,
      status: now - at > 48 * 3600000 ? 'overdue' : 'verified',
      backedUpAt: new Date(at).toISOString(),
    };
  } catch {
    return result;
  }
}
