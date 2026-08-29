import { PortabilityError, sanitizeValue, MAX_EXPORT_BYTES } from './catalog.js';
import { sha256 } from './archive.js';
import { rawStorageEnv, assertParishWritable, withStorageOperation } from './storage.js';
import { storageGuardsEnabled } from './suppression.js';

const INDEPENDENT_PREFIXES = ['__agapay_donor__','__agapay_learn_','__agapay_admin_','__agapay_rate_limit__','__agapay_stripe_event__','ops_alert:','resend:webhook:','waitlist:','directory:intake:','parish-interest:','stewardship_comp_promo:'];
const INDEX_PREFIXES = ['__agapay_index_parish_id__','__agapay_index_stripe_account__','__agapay_index_stripe_subscription__','__agapay_index_payment_intent__','__agapay_checkout_offering__'];
const parse = raw => { try { return JSON.parse(raw); } catch { return null; } };

export async function classifyLegacyRecord(key, raw, read, depth = 0) {
  if (raw == null) return null;
  if (INDEPENDENT_PREFIXES.some(prefix => key.startsWith(prefix)) || key === '__agapay_healthcheck__') return null;
  // The original stewardship integration still stores a full registration
  // JSON document at parish_id_index:{parishId}. Unlike the newer index
  // namespace below, its value is not a pointer to another KV key.
  if (key.startsWith('parish_id_index:')) {
    const parishId = key.slice('parish_id_index:'.length);
    const data = parse(raw);
    if (!parishId) throw new PortabilityError('legacy_index_invalid', 'A legacy parish index requires ownership reconciliation.');
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const embedded = data.parishId || data.parish_id || '';
      if (embedded && embedded !== parishId) throw new PortabilityError('legacy_index_invalid', 'A legacy parish index conflicts with its document owner.');
      return { parishId, kind: 'index', disposition: 'delete', data: sanitizeValue(data) };
    }
    // Earlier deployments stored a plain pointer to the registration key.
    // Resolve it and require independent owner agreement; never trust the
    // parish ID embedded in this index key alone.
    if (depth || typeof raw !== 'string' || !read || !/^[A-Za-z0-9:_-]{1,200}$/.test(raw)) throw new PortabilityError('legacy_index_invalid', 'A legacy parish index requires ownership reconciliation.');
    const target = await classifyLegacyRecord(raw, await read(raw), read, 1);
    if (!target || target.parishId !== parishId) throw new PortabilityError('legacy_index_invalid', 'A legacy parish index conflicts with its target owner.');
    return { parishId, kind: 'index', disposition: 'delete', data: { target: raw } };
  }
  if (INDEX_PREFIXES.some(prefix => key.startsWith(prefix))) {
    if (depth || typeof raw !== 'string' || !read) throw new PortabilityError('legacy_index_invalid', 'A legacy index requires ownership reconciliation.');
    const target = await classifyLegacyRecord(raw, await read(raw), read, 1);
    if (!target) throw new PortabilityError('legacy_index_invalid', 'A legacy index points to a missing or unclassified record.');
    if (key.startsWith('__agapay_index_parish_id__') && key.slice('__agapay_index_parish_id__'.length) !== target.parishId) throw new PortabilityError('legacy_index_invalid', 'A legacy parish index conflicts with its target owner.');
    return { parishId: target.parishId, kind: 'index', disposition: 'delete', data: { target: raw } };
  }
  const data = parse(raw);
  let parishId = data?.parishId || data?.parish_id || '';
  let kind = 'registration', disposition = 'delete';
  if (key.startsWith('parish-feature-requests:')) { parishId = key.slice('parish-feature-requests:'.length); kind = 'feature_requests'; }
  else if (key.startsWith('reconciliation-close:')) { parishId = key.slice('reconciliation-close:'.length).split(':')[0]; kind = 'reconciliation'; disposition = 'financial'; }
  else if (key.startsWith('legal_acceptance:')) { parishId = data?.organizationId || ''; kind = 'legal_acceptance'; disposition = 'financial'; if (!parishId && data?.actorType === 'individual') return null; }
  else if (key.startsWith('__agapay_parish_support_ticket:')) { kind = 'support_ticket'; disposition = 'support'; }
  else if (key.startsWith('__agapay_sacraments_google_calendar:')) { kind = 'calendar_credentials'; }
  else if (key.startsWith('__agapay_commemoration__')) { kind = 'commemoration'; disposition = 'financial'; }
  else if (key.startsWith('__agapay_donor_offering__')) { kind = 'offering'; disposition = 'financial'; }
  if (!parishId || typeof parishId !== 'string' || !data || typeof data !== 'object' || Array.isArray(data)) throw new PortabilityError('legacy_owner_unknown', 'A legacy record needs ownership reconciliation before export.');
  return { parishId, kind, disposition, data: kind === 'calendar_credentials' ? { parishId, excluded: 'OAuth credentials' } : sanitizeValue(data) };
}

export async function collectLegacyRecords(env, parishId) {
  const kv = rawStorageEnv(env).AGAPAY_REGISTRATIONS;
  if (!kv) return [];
  if (!kv.list || !kv.get) throw new PortabilityError('legacy_unavailable', 'The legacy parish store is unavailable.', 503);
  const records = [];
  const seen = new Set();
  const tracked = storageGuardsEnabled(env) ? (await env.AGAPAY_DB.prepare('SELECT * FROM parish_portability_legacy_keys WHERE parish_id=? LIMIT 10001').bind(parishId).all()).results : [];
  if (tracked.length > 10000) throw new PortabilityError('legacy_inventory_too_large', 'The legacy inventory requires an operator-assisted export.');
  async function add(name, raw) {
    if (seen.has(name)) return;
    seen.add(name);
    const expected = tracked.find(row => row.object_key === name);
    if (expected && ((expected.state === 'stored' && (raw == null || await sha256(raw) !== expected.source_hash)) || expected.state === 'pending' || (expected.state === 'deleted' && raw != null))) throw new PortabilityError('legacy_not_converged', 'The legacy store has not converged with its authoritative write registry.');
    if (raw == null) return;
    const record = await classifyLegacyRecord(name, raw, key => kv.get(key));
    if (!record || record.parishId !== parishId) return;
    bytes += new TextEncoder().encode(raw).byteLength;
    if (bytes > MAX_EXPORT_BYTES / 2) throw new PortabilityError('legacy_inventory_too_large', 'Legacy parish data exceeds the self-service export limit.', 413);
    records.push({ key: name, ...record, sourceHash: await sha256(raw) });
  }
  let cursor, scanned = 0, bytes = 0;
  do {
    const page = await kv.list({ limit: 100, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.keys)) throw new PortabilityError('legacy_unavailable', 'The legacy parish inventory could not be read.', 503);
    for (const { name } of page.keys) {
      if (++scanned > 10000) throw new PortabilityError('legacy_inventory_too_large', 'The legacy inventory requires an operator-assisted export.', 413);
      const raw = await kv.get(name);
      if (raw == null) throw new PortabilityError('legacy_changed', 'The legacy inventory changed during export. Please retry.');
      await add(name,raw);
    }
    if (page.list_complete) break;
    if (!page.cursor || page.cursor === cursor) throw new PortabilityError('legacy_cursor_invalid', 'The legacy inventory could not be completed.');
    cursor = page.cursor;
  } while (true);
  for (const row of tracked) if (!seen.has(row.object_key)) await add(row.object_key,await kv.get(row.object_key));
  return records.sort((a,b) => a.key.localeCompare(b.key));
}

export function protectLegacyStorage(env) {
  if (!storageGuardsEnabled(env) || !env.AGAPAY_REGISTRATIONS) return env;
  const kv = rawStorageEnv(env).AGAPAY_REGISTRATIONS;
  const owner = (key, value) => classifyLegacyRecord(key, value, target => kv.get(target));
  const wrapped = new Proxy(kv, { get(target, property) {
    if (property === 'getWithMetadata') return () => { throw new PortabilityError('legacy_read_not_supported', 'Legacy metadata reads require a reviewed closure guard.'); };
    if (property === 'put') return async (key, value, options) => {
      if (typeof value !== 'string') throw new PortabilityError('legacy_value_invalid', 'Legacy writes must be classifiable JSON or a declared index.');
      const next = await owner(key, value), previous = await owner(key, await target.get(key));
      if (previous && (!next || previous.parishId !== next.parishId)) throw new PortabilityError('legacy_owner_conflict', 'A legacy record cannot change parish ownership.');
      if (!next) return target.put(key, value, options);
      return withStorageOperation(env, { parishId: next.parishId, binding: 'AGAPAY_REGISTRATIONS', key, operation: 'put' }, async () => {
        const registered = await env.AGAPAY_DB.prepare(`INSERT INTO parish_portability_legacy_keys(object_key,parish_id,source_hash,state,updated_at) VALUES(?,?,?,'pending',?) ON CONFLICT(object_key) DO UPDATE SET source_hash=excluded.source_hash,state='pending',updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id`).bind(key,next.parishId,await sha256(value),Date.now()).run();
        if (registered.meta?.changes !== 1) throw new PortabilityError('legacy_owner_conflict', 'A legacy key is registered to another parish.');
        await target.put(key,value,options);
        await env.AGAPAY_DB.prepare("UPDATE parish_portability_legacy_keys SET state='stored',updated_at=? WHERE object_key=?").bind(Date.now(),key).run();
      });
    };
    if (property === 'delete') return async key => {
      const record = await owner(key, await target.get(key));
      if (!record) return target.delete(key);
      return withStorageOperation(env, { parishId: record.parishId, binding: 'AGAPAY_REGISTRATIONS', key, operation: 'delete' }, async () => {
        await target.delete(key);
        await env.AGAPAY_DB.prepare("INSERT INTO parish_portability_legacy_keys(object_key,parish_id,source_hash,state,updated_at) VALUES(?,?,?,'deleted',?) ON CONFLICT(object_key) DO UPDATE SET state='deleted',updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id").bind(key,record.parishId,await sha256(JSON.stringify(record.data)),Date.now()).run();
      });
    };
    if (property === 'get') return async (key, options) => {
      const raw = await target.get(key);
      const record = await owner(key, raw);
      if (record) {
        try { await assertParishWritable(env, record.parishId); }
        catch (error) { if (error.code === 'parish_closed') return null; throw error; }
      }
      if (!options || options === 'text' || options.type === 'text') return raw;
      return target.get(key, options);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { ...env, AGAPAY_REGISTRATIONS: wrapped };
}
