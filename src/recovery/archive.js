import { createZip, utf8, sha256 } from '../portability/archive.js';
import { exportRow, csvForRows } from '../portability/catalog.js';
import { readPart, query, fail, requireRecovery } from './storage.js';

export async function downloadRecoverySnapshot(env, parishId, id, scope) {
  await requireRecovery(env, parishId);
  const snapshot = await query(
    env.AGAPAY_DB,
    "SELECT * FROM parish_recovery_snapshots WHERE id=? AND parish_id=? AND scope=? AND status='ready' AND expires_at>?",
    id,
    parishId,
    scope,
    Date.now()
  ).first();
  if (!snapshot) fail('snapshot_not_found', 'This restore point is unavailable or expired.');
  const files = [];
  for (const part of ['central', 'books']) {
    const data = await readPart(env, snapshot, part);
    for (const table of data?.tables || []) {
      const records = table.rows.map((row) => exportRow(table.name, row)).filter(Boolean);
      files.push({ name: part + '/' + table.name + '.json', bytes: utf8(JSON.stringify(records, null, 2)) });
      files.push({ name: part + '/' + table.name + '.csv', bytes: utf8(csvForRows(records)) });
    }
  }
  const assets = await readPart(env, snapshot, 'files');
  const inventory = [];
  for (const [index, item] of assets.files.entries()) {
    const extension = item.key.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] || '.bin';
    const name = 'files/' + index + extension;
    files.push({ name, bytes: Uint8Array.from(atob(item.body), (c) => c.charCodeAt(0)) });
    inventory.push({ file: name, originalKey: item.key, sha256: item.hash });
  }
  const legacy = assets.legacy.map((item) => ({ key: item.key, record: exportRow('legacy', { data: item.body }) }));
  files.push({ name: 'legacy.json', bytes: utf8(JSON.stringify(legacy, null, 2)) });
  const manifest = {
    scope,
    createdAt: snapshot.created_at,
    parishId,
    assets: inventory,
    files: await Promise.all(files.map(async (file) => ({ name: file.name, sha256: await sha256(file.bytes) }))),
    note: 'Readable data archive. Credentials and access/billing configuration are excluded. Restore uses the verified private cloud snapshot, not this ZIP.',
  };
  files.push({ name: 'manifest.json', bytes: utf8(JSON.stringify(manifest, null, 2)) });
  return createZip(files);
}
