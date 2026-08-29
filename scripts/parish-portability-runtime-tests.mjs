// Runs production portability modules INSIDE workerd with native local D1/R2/KV.
// No Cloudflare credentials/config, remote bindings, network egress, or live data.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { directoryImportFixture } from './directory-import-fixture.mjs';
import { POLICY_VERSION } from '../src/portability/catalog.js';

// Esbuild 0.28 on Windows mis-resolves entry points when absWorkingDir retains
// the trailing separator returned for a directory file URL.
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]+$/, '');
// Read only the compatibility date, never any configured resource identities.
const compatibilityDate = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').match(/^compatibility_date = "([\d-]+)"/m)?.[1];
assert.ok(compatibilityDate);
const built = await build({ absWorkingDir: root, entryPoints: ['./scripts/fixtures/portability-runtime-worker.js'], bundle: true, format: 'esm', platform: 'neutral', conditions: ['workerd','worker','browser'], external: ['node:*'], write: false });
const token = randomUUID();
const storage = ['PARISH_EXPORTS','PARISH_RETAINED_DATA','PARISH_CLOSURE_LEDGER','ACCOUNTING_BACKUPS','DIRECTORY_MEDIA','TAX_EXEMPTION_DOCS','RESTORE_PARISH_EXPORTS','RESTORE_DIRECTORY_MEDIA','RESTORE_TAX_EXEMPTION_DOCS'];
let egressAttempts = 0;
const options = convertV4MiniflareOptions({
  modules: true, script: built.outputFiles[0].text, compatibilityDate, compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1', port: 0, cf: false,
  d1Databases: ['AGAPAY_DB','RESTORE_AGAPAY_DB'], kvNamespaces: ['AGAPAY_REGISTRATIONS','RESTORE_AGAPAY_REGISTRATIONS'], r2Buckets: storage,
  bindings: { PORTABILITY_LOCAL_DRILL: 'true', DRILL_TOKEN: token, AGAPAY_ENVIRONMENT: 'staging', PARISH_PORTABILITY_ENABLED: 'true', PARISH_STORAGE_GUARDS_ENABLED: 'true', PARISH_AUTOMATIC_CLOSURE_ENABLED: 'true', ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: 'true', PARISH_SUPPRESSION_AUTHORITY: 'local-synthetic-ledger', PARISH_BACKUP_EXPIRY_VERIFIED: POLICY_VERSION, PARISH_LEGACY_INVENTORY_VERIFIED: POLICY_VERSION },
  outboundService() { egressAttempts++; throw new Error('Network egress is forbidden in the portability drill'); },
});
options.telemetry = { enabled: false };
const mf = new Miniflare(options);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = name => '"' + name.replaceAll('"','""') + '"';
const passed = [];
const pass = message => { passed.push(message); console.log('PASS - ' + message); };
async function request(input, expected = 200) {
  const response = await mf.dispatchFetch('http://local.test/drill', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(response.status, expected, await response.clone().text());
  return response;
}
async function call(input, expected = 200) {
  const data = await (await request(input, expected)).json();
  return expected === 200 ? data.result : data;
}
async function batch(db, statements) {
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
}
function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = new Map();
  let position = 0;
  while (view.getUint32(position, true) === 0x04034b50) {
    const length = view.getUint32(position + 18, true), nameLength = view.getUint16(position + 26, true), extra = view.getUint16(position + 28, true);
    const name = new TextDecoder().decode(bytes.slice(position + 30, position + 30 + nameLength));
    const start = position + 30 + nameLength + extra;
    result.set(name, bytes.slice(start, start + length)); position = start + length;
  }
  return result;
}

try {
  const db = await mf.getD1Database('AGAPAY_DB');
  const restored = await mf.getD1Database('RESTORE_AGAPAY_DB');
  // Build the explicitly scoped test schema from the existing migration fixture.
  // This is not a full historical migration replay or production schema audit.
  const fixture = directoryImportFixture();
  try {
    for (const name of ['0109_parish_portability.sql','0110_portability_storage_safeguards.sql']) fixture.db.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
    fixture.db.exec('CREATE TABLE tax_exemption_documents(id TEXT PRIMARY KEY,registration_reference TEXT REFERENCES registrations(reference),storage_key TEXT)');
    const schema = fixture.db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name").all();
    await batch(db, schema.map(row => db.prepare(row.sql)));
    for (const { name } of fixture.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      await batch(db, fixture.db.prepare(`SELECT * FROM ${quote(name)}`).all().map(row => db.prepare(`INSERT INTO ${quote(name)}(${Object.keys(row).map(quote)}) VALUES(${Object.keys(row).map(() => '?')})`).bind(...Object.values(row))));
    }
  } finally { fixture.db.close(); }
  for (const id of ['parish-a','parish-b']) {
    await db.prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').bind('ref-' + id,id,'2026-08-28',JSON.stringify({ parishId:id, parishName:id, password:'secret-not-exported' })).run();
  }
  for (const [id,owner] of [['a','parish-a'],['b','parish-b'],['shared','parish-a']]) {
    await db.prepare('INSERT INTO directory_people(id,created_by_parish_id,preferred_name,created_at,updated_at) VALUES(?,?,?,1,1)').bind(id,owner,id).run();
    await db.prepare("INSERT INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) VALUES(?,?,?,'member',1,1)").bind(id + '-aff',id,owner).run();
  }
  await db.prepare("INSERT INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) VALUES('shared-b','shared','parish-b','member',1,1)").run();
  await db.prepare("INSERT INTO tax_exemption_documents VALUES('financial-a','ref-parish-a','financial/a.txt')").run();
  const ledger = await mf.getR2Bucket('PARISH_CLOSURE_LEDGER');
  await ledger.put('authority.json', JSON.stringify({ id:'local-synthetic-ledger', policyVersion:POLICY_VERSION }));
  assert.equal((await mf.dispatchFetch('http://local.test/drill', { method:'POST', body:'{}' })).status,404);
  await call({ action:'setup' });
  await call({ action:'validate' });
  pass('native D1 schema, triggers, file ownership, KV registry, and strict-expiry evidence initialized');

  // Capture the actual local D1/R2/KV pre-closure state into separate target stores.
  // The independent ledger is deliberately NOT copied or rolled back.
  const schema = (await db.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name").all()).results;
  await batch(restored, schema.filter(row => row.type !== 'trigger').map(row => restored.prepare(row.sql)));
  const restoredRows = [restored.prepare('PRAGMA defer_foreign_keys=ON')];
  for (const { name } of schema.filter(row => row.type === 'table')) {
    const rows = (await db.prepare(`SELECT * FROM ${quote(name)}`).all()).results;
    restoredRows.push(...rows.map(row => restored.prepare(`INSERT INTO ${quote(name)}(${Object.keys(row).map(quote)}) VALUES(${Object.keys(row).map(() => '?')})`).bind(...Object.values(row))));
  }
  // One small synthetic transaction: foreign keys remain enforced at commit.
  await restored.batch(restoredRows);
  await batch(restored, schema.filter(row => row.type === 'trigger').map(row => restored.prepare(row.sql)));
  for (const name of ['DIRECTORY_MEDIA','TAX_EXEMPTION_DOCS']) {
    const source = await mf.getR2Bucket(name), target = await mf.getR2Bucket('RESTORE_' + name);
    const page = await source.list(); assert.equal(page.truncated,false);
    for (const item of page.objects) {
      const object = await source.get(item.key);
      await target.put(item.key, await object.arrayBuffer(), { customMetadata:object.customMetadata, httpMetadata:object.httpMetadata });
    }
  }
  const kv = await mf.getKVNamespace('AGAPAY_REGISTRATIONS'), restoredKv = await mf.getKVNamespace('RESTORE_AGAPAY_REGISTRATIONS');
  const keys = await kv.list(); assert.equal(keys.list_complete,true);
  for (const key of keys.keys) await restoredKv.put(key.name, await kv.get(key.name));
  pass('pre-closure D1, R2, and KV snapshot restored to independent local target bindings');

  const ordinary = await call({ action:'export', mode:'export' });
  const ordinaryDownload = await request({ action:'download', jobId:ordinary.id });
  await ordinaryDownload.body.cancel();
  assert.equal((await db.prepare('SELECT count(*) n FROM directory_people').first()).n,3);
  assert.equal((await call({ action:'confirm', jobId:ordinary.id, archiveHash:ordinary.archive_sha256 },409)).code,'confirmation_unavailable');
  await call({ action:'cancel', jobId:ordinary.id });
  pass('ordinary and aborted downloads never authorize closure');

  const job = await call({ action:'export', mode:'close' });
  const download = await request({ action:'download', jobId:job.id });
  assert.equal(download.headers.get('cache-control'),'private, no-store');
  const bytes = new Uint8Array(await download.arrayBuffer());
  assert.equal(digest(bytes),job.archive_sha256);
  const files = entries(bytes), manifest = JSON.parse(job.manifest_json);
  for (const file of manifest.files) assert.equal(digest(files.get(file.path)),file.sha256,file.path);
  assert.equal(new TextDecoder().decode(bytes).includes('secret-not-exported'),false);
  const people = JSON.parse(new TextDecoder().decode(files.get('data/directory_people.json')));
  assert.deepEqual(people.map(p => p.id).sort(),['a','shared']);
  assert.equal(manifest.assets.length,2);
  await call({ action:'confirm', jobId:job.id, archiveHash:digest(bytes) });
  assert.equal((await call({ action:'job', jobId:job.id })).confirmed_at,null);
  await call({ action:'process', jobId:job.id });
  assert.equal((await call({ action:'job', jobId:job.id })).confirmed_at,null);
  await call({ action:'process', jobId:job.id });
  assert.ok((await call({ action:'job', jobId:job.id })).confirmed_at);
  await call({ action:'upload', uiDisabled:true },409);
  await call({ action:'legacy-write', uiDisabled:true },409);
  await assert.rejects(db.prepare("UPDATE directory_people SET preferred_name='late' WHERE id='a'").run(),/WRITE_BLOCKED/);
  pass('ZIP checksums, tenant scope, credential filtering, and database/file/KV write barriers verified');

  await call({ action:'process', jobId:job.id });
  assert.equal((await call({ action:'job', jobId:job.id })).status,'active_data_deleted');
  await call({ action:'validate' });
  const media = await mf.getR2Bucket('DIRECTORY_MEDIA');
  assert.equal(await media.head('directory/parish-a/orphan.txt'),null);
  assert.ok(await media.head('directory/parish-b/orphan.txt'));
  assert.equal(await kv.get('legacy-parish-a'),null);
  assert.equal(await kv.get('__agapay_index_parish_id__parish-a'),null);
  assert.ok(await kv.get('legacy-parish-b')); assert.ok(await kv.get('__agapay_donor__shared'));
  assert.deepEqual((await db.prepare('SELECT id FROM directory_people ORDER BY id').all()).results.map(r=>r.id),['b','shared']);
  const registration = await db.prepare("SELECT data,status FROM registrations WHERE parish_id='parish-a'").first();
  assert.equal(registration.status,'closed');
  assert.deepEqual(JSON.parse(registration.data),{ parishId:'parish-a',status:'closed' });
  assert.equal((await (await mf.getR2Bucket('PARISH_EXPORTS')).list()).objects.length,0);
  const retained = await mf.getR2Bucket('PARISH_RETAINED_DATA');
  const retainedObjects = (await retained.list()).objects;
  assert.equal(retainedObjects.length,1);
  assert.equal(await (await retained.get(retainedObjects[0].key)).text(),'restricted financial evidence');
  pass('eligible data erased, exports removed, other parish/shared donors preserved, financial evidence retained privately');

  assert.equal((await call({ action:'validate', target:'restore' },503)).code,'restore_suppression_required');
  assert.equal((await call({ action:'replay', target:'restore' },409)).code,'quarantine_required');
  await call({ action:'replay', target:'restore', quarantine:true });
  await restored.prepare("UPDATE parish_data_closures SET state='deleting' WHERE parish_id='parish-a'").run();
  assert.equal((await call({ action:'validate', target:'restore' },503)).code,'restore_suppression_required');
  await call({ action:'sanitize', target:'restore', quarantine:true });
  assert.equal((await call({ action:'validate', target:'restore', quarantine:true },503)).code,'restore_quarantined');
  await call({ action:'validate', target:'restore' });
  assert.deepEqual((await restored.prepare('SELECT id FROM directory_people ORDER BY id').all()).results.map(r=>r.id),['b','shared']);
  assert.equal(await (await mf.getR2Bucket('RESTORE_DIRECTORY_MEDIA')).head('directory/parish-a/orphan.txt'),null);
  assert.equal(await restoredKv.get('legacy-parish-a'),null);
  assert.ok(await restoredKv.get('legacy-parish-b')); assert.ok(await restoredKv.get('__agapay_donor__shared'));
  await call({ action:'sanitize', target:'restore', quarantine:true });
  await call({ action:'validate', target:'restore' });
  assert.equal(egressAttempts,0);
  pass('independent ledger blocks restored data until quarantine replay and sanitization; repeated sanitization is safe');
  console.log(`Portability local workerd drill passed (${passed.length} checkpoints). Natural lifecycle expiry, public-media migration, recovery-copy inventory, and rollout remain release gates.`);
} finally {
  await mf.dispose();
}
