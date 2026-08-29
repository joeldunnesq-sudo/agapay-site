import { PortabilityError } from './catalog.js';
import { storageGuardsEnabled, suppressionRecord } from './suppression.js';

export const FILE_BINDINGS = ['CAMPAIGN_ASSETS','ANNOUNCEMENT_ASSETS','TEACHING_ASSETS','GROUP_MESSAGE_ASSETS','PARISH_LIBRARY_ASSETS','DIRECTORY_MEDIA','TAX_EXEMPTION_DOCS','NONPROFIT_PRICING_DOCS','GIVING_STATEMENTS','ACCOUNTING_ATTACHMENTS'];
export const FINANCIAL_BINDINGS = new Set(['TAX_EXEMPTION_DOCS','NONPROFIT_PRICING_DOCS','GIVING_STATEMENTS','ACCOUNTING_ATTACHMENTS']);
export const PUBLIC_BINDINGS = new Set(['CAMPAIGN_ASSETS','ANNOUNCEMENT_ASSETS','TEACHING_ASSETS']);
const RAW_ENV = Symbol('portability raw storage');
export const rawStorageEnv = env => env[RAW_ENV] || env;
export const canonicalBinding = binding => binding === 'PARISH_LIBRARY_ASSETS' ? 'GROUP_MESSAGE_ASSETS' : binding;
export const fileBucket = (env, binding) => rawStorageEnv(env)[binding] || (binding === 'GROUP_MESSAGE_ASSETS' ? rawStorageEnv(env).PARISH_LIBRARY_ASSETS : null);
const denied = () => new PortabilityError('parish_closed', 'This parish is closing or has closed.', 409);

export async function assertParishWritable(env, parishId) {
  if (!storageGuardsEnabled(env)) return;
  if (!parishId || typeof parishId !== 'string') throw new PortabilityError('storage_owner_required', 'Storage requires an explicit parish owner.');
  if (await suppressionRecord(env, parishId) || await env.AGAPAY_DB.prepare('SELECT 1 FROM parish_data_closures WHERE parish_id=?').bind(parishId).first()) throw denied();
}

export async function withStorageOperation(env, { parishId, binding, key, operation }, work) {
  await assertParishWritable(env, parishId);
  const id = crypto.randomUUID();
  const result = await env.AGAPAY_DB.prepare(`INSERT INTO parish_portability_storage_operations(id,parish_id,binding,object_key,operation,started_at)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM parish_data_closures WHERE parish_id=?)`).bind(id, parishId, binding, key, operation, Date.now(), parishId).run();
  if (result.meta?.changes !== 1) throw denied();
  // Only a completed operation releases the durable fence. An exception may be
  // an ambiguous provider outcome; closure must wait for offline reconciliation.
  const value = await work();
  await env.AGAPAY_DB.prepare('DELETE FROM parish_portability_storage_operations WHERE id=?').bind(id).run();
  return value;
}

export async function assertStorageDrained(env, parishId) {
  if (await env.AGAPAY_DB.prepare('SELECT 1 FROM parish_portability_storage_operations WHERE parish_id=? LIMIT 1').bind(parishId).first()) throw new PortabilityError('storage_operation_pending', 'An upload or legacy write is still running or needs recovery. Closure has not started.');
}

export async function objectOwnership(env, binding, key) {
  return env.AGAPAY_DB.prepare('SELECT * FROM parish_portability_objects WHERE binding=? AND object_key=?').bind(canonicalBinding(binding), key).first();
}

function guardedBucket(env, binding, bucket) {
  const name = canonicalBinding(binding);
  const readable = async key => {
    const owner = await objectOwnership(env, name, key);
    if (owner) await assertParishWritable(env, owner.parish_id);
  };
  return new Proxy(bucket, { get(target, property) {
    if (property === 'put') return async (key, body, options = {}) => {
      const parishId = options.customMetadata?.agapayParishId;
      return withStorageOperation(env, { parishId, binding: name, key, operation: 'put' }, async () => {
        const registered = await env.AGAPAY_DB.prepare(`INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,updated_at) VALUES(?,?,?,?,'pending',?)
          ON CONFLICT(binding,object_key) DO UPDATE SET state='pending',updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id`).bind(name, key, parishId, FINANCIAL_BINDINGS.has(name) ? 'financial' : 'delete', Date.now()).run();
        if (registered.meta?.changes !== 1) throw new PortabilityError('storage_owner_conflict', 'The file belongs to another parish.');
        // New public objects must not create another year-long browser cache.
        const value = await target.put(key, body, { ...options, httpMetadata: { ...options.httpMetadata, cacheControl: PUBLIC_BINDINGS.has(name) ? 'no-store' : 'private, no-store' } });
        if (!value) throw new PortabilityError('storage_write_unconfirmed', 'File storage did not confirm the write.');
        await env.AGAPAY_DB.prepare("UPDATE parish_portability_objects SET state='stored',etag=?,updated_at=? WHERE binding=? AND object_key=? AND parish_id=?").bind(value.etag, Date.now(), name, key, parishId).run();
        return value;
      });
    };
    if (property === 'delete') return async keys => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        const owner = await objectOwnership(env, name, key);
        if (!owner) {
          if (!await target.head(key)) continue;
          throw new PortabilityError('storage_owner_required', 'Legacy file ownership must be reconciled before deletion.');
        }
        await withStorageOperation(env, { parishId: owner.parish_id, binding: name, key, operation: 'delete' }, async () => {
          await target.delete(key);
          if (await target.head(key)) throw new PortabilityError('storage_delete_unconfirmed', 'File deletion has not completed.');
          await env.AGAPAY_DB.prepare("UPDATE parish_portability_objects SET state='deleted',updated_at=? WHERE binding=? AND object_key=?").bind(Date.now(), name, key).run();
        });
      }
    };
    if (property === 'get' || property === 'head') return async (key, options) => { await readable(key); return target[property](key, options); };
    if (['createMultipartUpload','resumeMultipartUpload'].includes(property)) return () => { throw new PortabilityError('multipart_not_supported', 'Multipart uploads require a reviewed closure adapter.'); };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

export function protectFileStorage(env) {
  if (!storageGuardsEnabled(env) || env[RAW_ENV]) return env;
  const wrapped = { ...env, [RAW_ENV]: env };
  for (const binding of FILE_BINDINGS) if (env[binding]) wrapped[binding] = guardedBucket(env, binding, env[binding]);
  return wrapped;
}

// Enumerate the entire physical bucket, not just live DB references. A reviewed
// registry is required for random legacy keys and for orphaned/old file variants.
export async function inventoryParishObjects(env, parishId) {
  const found = [], visited = new Set();
  for (const binding of FILE_BINDINGS) {
    const name = canonicalBinding(binding), bucket = fileBucket(env, name);
    if (!bucket || visited.has(name)) continue;
    visited.add(name);
    let cursor, scanned = 0;
    do {
      const page = await bucket.list({ limit: 100, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(page.objects)) throw new PortabilityError('file_inventory_invalid', 'File inventory could not be completed.');
      for (const object of page.objects) {
        if (++scanned > 10000) throw new PortabilityError('file_inventory_too_large', 'The file inventory requires an operator-assisted export.');
        const owner = await objectOwnership(env, name, object.key);
        if (!owner || owner.state !== 'stored' || owner.etag !== object.etag) throw new PortabilityError('file_inventory_unreconciled', 'A legacy, orphaned, or changed file needs ownership reconciliation.');
        if (owner.parish_id === parishId) found.push({ binding: name, key: object.key, disposition: owner.disposition });
      }
      if (!page.truncated) break;
      if (!page.cursor || page.cursor === cursor) throw new PortabilityError('file_inventory_invalid', 'File inventory could not be completed.');
      cursor = page.cursor;
    } while (true);
  }
  return found.sort((a,b) => (a.binding + ':' + a.key).localeCompare(b.binding + ':' + b.key));
}
