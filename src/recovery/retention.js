import { FINANCIAL_TABLES } from '../portability/closure.js';
import { FINANCIAL_BINDINGS } from '../portability/storage.js';
import { sha256 } from '../portability/archive.js';
import { query, readPart, fail } from './storage.js';

// Rollback must not erase the prior financial evidence when the seven-day
// self-service safety point expires. Preserve it in the restricted retention
// store, outside both rollback scope and parish-facing download routes.
export async function retainFinancialEvidence(env, op, safety) {
  const bucket = env.PARISH_RETAINED_DATA;
  if (!bucket) fail('recovery_retention_unavailable', 'Restricted financial recovery storage is not configured.');
  const prefix = 'parish-recovery-audit/' + op.id + '/',
    parts = [];
  async function store(name, value) {
    const body = JSON.stringify(value),
      hash = await sha256(body),
      key = prefix + name + '.json';
    const exists = await bucket.head(key);
    if (!exists)
      await bucket.put(key, body, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
        customMetadata: { parishId: op.parish_id, sha256: hash },
      });
    const readback = await bucket.get(key);
    if (!readback || readback.size > 16 * 1024 * 1024 || (await sha256(await readback.text())) !== hash)
      fail(
        'recovery_retention_failed',
        'The pre-restore financial evidence could not be verified. No replacement can proceed.'
      );
    parts.push({ name, key, sha256: hash });
    return { key, hash };
  }
  const central = await readPart(env, safety, 'central');
  await store(
    'central-financial',
    central ? { schema: central.schema, tables: central.tables.filter((t) => FINANCIAL_TABLES.has(t.name)) } : null
  );
  const books = await readPart(env, safety, 'books');
  await store('accounting', books);
  const files = await readPart(env, safety, 'files');
  await store('financial-files', {
    files: files.files.filter((f) => FINANCIAL_BINDINGS.has(f.binding)),
    legacy: files.legacy.filter((r) => r.disposition === 'financial'),
  });
  const configured = (books?.tables || [])
    .filter((table) => table.name === 'accounting_retention_settings')
    .flatMap((table) =>
      table.rows.flatMap((row) =>
        Object.entries(row)
          .filter(([key]) => key.endsWith('_retention_years'))
          .map(([, value]) => Number(value))
      )
    );
  if (configured.some((years) => !Number.isInteger(years) || years < 1 || years > 100))
    fail('recovery_retention_invalid', 'The accounting retention settings require review.');
  const years = Math.max(7, ...configured);
  const reviewAfter = op.created_at + years * 366 * 86400000;
  const manifest = await store('manifest', {
    operationId: op.id,
    parishId: op.parish_id,
    scope: op.scope,
    targetId: op.target_id,
    safetyId: op.safety_id,
    createdAt: op.created_at,
    reviewAfter,
    parts: [...parts],
  });
  await query(
    env.AGAPAY_DB,
    'INSERT OR IGNORE INTO parish_recovery_retention(operation_id,parish_id,created_at,review_after,manifest_key,manifest_sha256) VALUES(?,?,?,?,?,?)',
    op.id,
    op.parish_id,
    op.created_at,
    reviewAfter,
    manifest.key,
    manifest.hash
  ).run();
}
