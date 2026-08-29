import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { directoryImportFixture } from './directory-import-fixture.mjs';
import { issueParishDashboardSession } from '../src/lib/core.js';
import { PORTABILITY_SCHEMA } from '../src/portability/schema.js';
import { POLICY_VERSION, inspectStorage, classification, exportRow, csvForRows } from '../src/portability/catalog.js';
import { createZip, sha256, utf8 } from '../src/portability/archive.js';
import { collectParishExport } from '../src/portability/export.js';
import { classifyLegacyRecord, collectLegacyRecords } from '../src/portability/legacy.js';
import { collectAccountingRecords } from '../src/portability/accounting.js';
import { barrierStatements, closureReadiness } from '../src/portability/closure.js';
import { actorFingerprint, startExport, processExport, confirmClosure, getJob, downloadExport, retryExport, cancelExport, runPortabilityJobs } from '../src/portability/service.js';
import { handleParishPortability } from '../src/handlers/parish-portability.js';
import { protectFileStorage, inventoryParishObjects, assertStorageDrained } from '../src/portability/storage.js';
import { protectLegacyStorage } from '../src/portability/legacy.js';
import { assertRestoreSafe, suppressionRecord, recordSuppression, recordSuppressionCompletion } from '../src/portability/suppression.js';
import { replayClosureSuppressions, sanitizeRestoredParish } from '../src/portability/restore.js';
import { reconcileObjectOwnership, reconcileFileOperation } from '../src/portability/maintenance.js';
import { reviewDueRetentions } from '../src/portability/disposal.js';
import { verifyBackupExpiryEvidence } from '../src/portability/backup-evidence.js';

function memoryBucket() {
  const objects = new Map();
  return {
    objects, failDelete: false,
    async put(key, bytes, options = {}) { if (options.onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) return null; const value = typeof bytes === 'string' ? utf8(bytes) : new Uint8Array(bytes); objects.set(key, { key, bytes: value, etag: await sha256(value), size: value.length, ...options }); return this.head(key); },
    async head(key) { const object = objects.get(key); return object ? { ...object } : null; },
    async get(key, options = {}) { const value = objects.get(key); if (!value) return null; if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== value.etag) return { ...value }; return { ...value, body: new Response(value.bytes).body, async text() { return new TextDecoder().decode(value.bytes); }, async arrayBuffer() { return value.bytes.slice().buffer; } }; },
    async list({ prefix = '' } = {}) { return { objects: [...objects.values()].filter(o => o.key.startsWith(prefix)).sort((a,b) => a.key.localeCompare(b.key)), truncated: false }; },
    async delete(key) { if (this.failDelete) throw new Error('synthetic storage failure'); objects.delete(key); },
  };
}
function sqliteBinding(db) {
  const prepare=sql=>({sql,params:[],bind(...params){this.params=params;return this;},async all(){return{results:db.prepare(sql).all(...this.params)};},async first(){return db.prepare(sql).get(...this.params)||null;},async run(){return{meta:{changes:db.prepare(sql).run(...this.params).changes}};}});
  return {prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
async function fixture({ barriers = true } = {}) {
  const f = directoryImportFixture();
  f.env.ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED = 'true';
  f.db.exec(readFileSync(new URL('../migrations/0109_parish_portability.sql', import.meta.url), 'utf8'));
  f.db.exec(readFileSync(new URL('../migrations/0110_portability_storage_safeguards.sql', import.meta.url), 'utf8'));
  Object.assign(f.env, { PARISH_PORTABILITY_ENABLED: 'true', PARISH_AUTOMATIC_CLOSURE_ENABLED: 'true', PARISH_STORAGE_GUARDS_ENABLED: 'true', PARISH_SUPPRESSION_AUTHORITY: 'test-ledger', PARISH_BACKUP_EXPIRY_VERIFIED: POLICY_VERSION, PARISH_EXPORTS: memoryBucket(), PARISH_CLOSURE_LEDGER: memoryBucket(), PARISH_RETAINED_DATA: memoryBucket() });
  await f.env.PARISH_CLOSURE_LEDGER.put('authority.json',JSON.stringify({ id: 'test-ledger', policyVersion: POLICY_VERSION }));
  await f.env.PARISH_CLOSURE_LEDGER.put('backup-expiry/latest.json',JSON.stringify({ strictExpiryEnabled: true, verifiedAt: Date.now(), retentionDays: 365, newestBackupPreserved: false, oldestRetainedAt: null }));
  for (const parish of ['parish-a', 'parish-b']) {
    const session = await issueParishDashboardSession({ parishId: parish, parishName: parish, password: 'do-not-export', nested: { apiKey: 'do-not-export' } }, { mfaVerifiedAt: new Date().toISOString() });
    f.db.prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').run('ref-' + parish, parish, '2026-08-28', JSON.stringify(session.registration));
    f[parish] = session.token;
  }
  for (const [id, owner, name] of [['a', 'parish-a', 'Alpha'], ['b', 'parish-b', 'Beta'], ['shared', 'parish-a', 'Shared']]) {
    f.db.prepare('INSERT INTO directory_people(id,created_by_parish_id,preferred_name,legal_name,notes,created_at,updated_at) VALUES(?,?,?,?,?,1,1)').run(id, owner, name, name + ' Legal', id === 'shared' ? 'private shared note' : 'own note');
    f.db.prepare('INSERT INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) VALUES(?,?,?,\'member\',1,1)').run(id + '-aff', id, owner);
  }
  f.db.prepare("INSERT INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) VALUES('other-aff','shared','parish-b','member',1,1)").run();
  f.db.prepare("INSERT INTO directory_contact_methods(id,parish_id,owner_type,owner_id,contact_type,label,value,normalized_value,created_at,updated_at) VALUES('other-private','parish-b','person','shared','email','personal','private@example.test','private@example.test',1,1)").run();
  if (barriers) for (const sql of barrierStatements((await inspectStorage(f.env.AGAPAY_DB)).map(t => t.name))) f.db.exec(sql);
  f.actor = await actorFingerprint(f['parish-a']);
  f.start = mode => startExport(f.env, { parishId: 'parish-a', actorHash: f.actor, mode, requestKey: crypto.randomUUID() });
  f.queueConfirmation = job => confirmClosure(f.env, { parishId: 'parish-a', jobId: job.id, actorHash: f.actor, archiveHash: job.archive_sha256, policyVersion: POLICY_VERSION, saved: true, confirmation: 'parish-a' });
  f.confirm = async job => {
    await f.queueConfirmation(job);
    await processExport(f.env,'parish-a',job.id); // Separate scheduler invocation: freeze.
    return processExport(f.env,'parish-a',job.id); // Separate invocation: compare and authorize.
  };
  return f;
}
function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = {};
  let position = 0;
  while (view.getUint32(position, true) === 0x04034b50) {
    const length = view.getUint32(position + 18, true), nameLength = view.getUint16(position + 26, true), extra = view.getUint16(position + 28, true);
    const name = new TextDecoder().decode(bytes.slice(position + 30, position + 30 + nameLength));
    const start = position + 30 + nameLength + extra;
    result[name] = bytes.slice(start, start + length); position = start + length;
  }
  return result;
}
const text = value => new TextDecoder().decode(value);

for (const name of Object.keys(PORTABILITY_SCHEMA)) if (!name.startsWith('parish_portability_') && name !== 'parish_data_closures') assert.doesNotThrow(() => classification(name), name);
assert.match(csvForRows([{ name: '=1+1', amount: 5 }]), /'=1\+1/);
assert.deepEqual(exportRow('registrations', { data: JSON.stringify({ password: 'x', contact: 'ok', nested: { apiKey: 'x', passwordRecord: 'x' } }) }), { data: { contact: 'ok', nested: {} } });
assert.throws(() => exportRow('registrations', { data: '{broken' }), /safely exported/);
assert.throws(() => createZip([{ name: '../private', bytes: utf8('x') }]), /Unsafe/);
const standardZip = createZip([{ name: 'hello.txt', bytes: utf8('Portable parish records') }]);
assert.equal(text(entries(standardZip)['hello.txt']), 'Portable parish records');

{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  const ready=await getJob(f.env,'parish-a',job.id);
  const queued=await f.queueConfirmation(ready);
  assert.equal(queued.confirmation_stage,'freeze_books');assert.equal(queued.confirmed_at,null);
  assert.equal(await suppressionRecord(f.env,'parish-a'),null);
  assert.throws(()=>f.db.prepare("UPDATE directory_people SET preferred_name='late' WHERE id='a'").run(),/WRITE_BLOCKED/);
  assert.equal((await f.queueConfirmation(ready)).confirmation_stage,'freeze_books','duplicate consent does not restart phases');
  await assert.rejects(confirmClosure(f.env,{parishId:'parish-a',jobId:job.id,actorHash:'wrong',archiveHash:ready.archive_sha256,policyVersion:POLICY_VERSION,saved:true,confirmation:'parish-a'}),/same administrator/);
  await processExport(f.env,'parish-a',job.id);
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmation_stage,'authorize');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  await cancelExport(f.env,'parish-a',job.id);
  assert.equal((await getJob(f.env,'parish-a',job.id)).manifest_json,null);
  assert.equal(await suppressionRecord(f.env,'parish-a'),null);
  f.db.prepare("UPDATE directory_people SET preferred_name='released' WHERE id='a'").run();
  f.db.close();
}
{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  await f.queueConfirmation(await getJob(f.env,'parish-a',job.id));
  await processExport(f.env,'parish-a',job.id);
  const originalNow=Date.now, future=Date.now()+16*60000;
  try { Date.now=()=>future;await assert.rejects(processExport(f.env,'parish-a',job.id),error=>error.code==='confirmation_expired'); }
  finally { Date.now=originalNow; }
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM directory_people WHERE id='a'").get().n,1);
  await retryExport(f.env,'parish-a',job.id);await processExport(f.env,'parish-a',job.id);
  assert.equal((await getJob(f.env,'parish-a',job.id)).status,'ready','expired consent cannot automatically authorize a new export');
  f.db.close();
}
{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  f.db.prepare("UPDATE directory_people SET preferred_name='stale' WHERE id='a'").run();
  await f.queueConfirmation(await getJob(f.env,'parish-a',job.id));
  await processExport(f.env,'parish-a',job.id);
  f.db.exec("CREATE TRIGGER prevent_release BEFORE DELETE ON parish_data_closures BEGIN SELECT RAISE(ABORT,'synthetic release failure'); END;");
  await assert.rejects(processExport(f.env,'parish-a',job.id),/synthetic release failure/);
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmation_stage,'releasing');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  assert.throws(()=>f.db.prepare("UPDATE directory_people SET preferred_name='late' WHERE id='a'").run(),/WRITE_BLOCKED/);
  f.db.exec('DROP TRIGGER prevent_release');
  await runPortabilityJobs(f.env);
  assert.equal((await getJob(f.env,'parish-a',job.id)).status,'failed');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmation_stage,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n,0);
  assert.equal(await suppressionRecord(f.env,'parish-a'),null);
  f.db.close();
}
{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  await f.queueConfirmation(await getJob(f.env,'parish-a',job.id));await processExport(f.env,'parish-a',job.id);
  f.db.exec('ALTER TABLE directory_people ADD COLUMN unexpected_between_phases TEXT');
  await assert.rejects(processExport(f.env,'parish-a',job.id),error=>error.code==='unclassified_column');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n,0);
  f.db.close();
}

{
  const f = await fixture();
  f.db.exec('CREATE TABLE stewardship_annual_meetings(id TEXT PRIMARY KEY,parish_id TEXT); CREATE TABLE stewardship_generated_packets(id TEXT PRIMARY KEY,annual_meeting_id TEXT,generated_at TEXT,generated_by TEXT,storage_key TEXT)');
  f.db.prepare("INSERT INTO stewardship_annual_meetings VALUES('meeting-a','parish-a')").run();
  f.db.prepare("INSERT INTO stewardship_generated_packets VALUES('packet-a','meeting-a','2026-08-28','admin','unmapped/packet.pdf')").run();
  await assert.rejects(collectParishExport(f.env,'parish-a'),error=>error.code==='legacy_packet_storage_unverified');
  f.db.prepare("UPDATE stewardship_generated_packets SET storage_key=NULL").run();
  assert.ok(entries((await collectParishExport(f.env,'parish-a')).archive)['data/stewardship_generated_packets.json']);
  f.db.close();
}
{
  const f = await fixture();
  const job={id:'locked-retry',parish_id:'parish-a',mode:'close',policy_version:POLICY_VERSION,confirmed_at:Date.now(),archive_sha256:'a'.repeat(64)};
  const record=await recordSuppression(f.env,job);
  await recordSuppressionCompletion(f.env,job);
  // R2 bucket locks can reject PUT even when the caller supplies a condition.
  // Replaying an identical authorization/completion must require only reads.
  f.env.PARISH_CLOSURE_LEDGER.put=async()=>{throw new Error('R2 object is locked');};
  assert.deepEqual(await recordSuppression(f.env,job),record);
  await recordSuppressionCompletion(f.env,job);
  await assert.rejects(recordSuppression(f.env,{...job,archive_sha256:'b'.repeat(64)}),error=>error.code==='suppression_unavailable');
  const key='completions/'+await sha256(job.parish_id)+'.json';
  const object=f.env.PARISH_CLOSURE_LEDGER.objects.get(key);
  object.bytes=utf8(JSON.stringify({...record,jobId:'different-job'}));object.size=object.bytes.length;
  await assert.rejects(recordSuppressionCompletion(f.env,job),error=>error.code==='suppression_unavailable');
  f.db.close();
}

{
  const f = await fixture();
  const result = await collectParishExport(f.env, 'parish-a');
  const files = entries(result.archive), people = JSON.parse(text(files['data/directory_people.json']));
  assert.equal(people.find(p => p.id === 'a').legal_name, 'Alpha Legal');
  assert.equal(people.find(p => p.id === 'shared').notes, undefined);
  assert.equal(people.some(p => p.id === 'b'), false);
  const registration = text(files['data/registrations.json']);
  assert.ok(!registration.includes('do-not-export') && !registration.includes('tokenHash'));
  assert.ok(!text(result.archive).includes('private@example.test'));
  for (const file of result.manifest.files) assert.equal(await sha256(files[file.path]), file.sha256, file.path);
  const job = await f.start('export');
  await processExport(f.env, 'parish-a', job.id);
  const download = await downloadExport(f.env, 'parish-a', job.id);
  await download.object.body.cancel();
  assert.equal(f.db.prepare('SELECT count(*) n FROM directory_people').get().n, 3, 'aborted download never deletes');
  await assert.rejects(f.confirm(await getJob(f.env, 'parish-a', job.id)), /not ready|expired/);
  await assert.rejects(getJob(f.env, 'parish-b', job.id), /not found/);
  await cancelExport(f.env, 'parish-a', job.id);
  assert.equal(f.env.PARISH_EXPORTS.objects.size, 0);
  f.db.exec('ALTER TABLE directory_people ADD COLUMN unreviewed TEXT');
  await assert.rejects(collectParishExport(f.env, 'parish-a'), /field/);
  f.db.close();
}
{
  const f = await fixture();
  f.db.exec('CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB)');
  assert.equal((await inspectStorage(f.env.AGAPAY_DB)).some(table=>table.name==='_cf_METADATA'),false);
  f.db.exec('CREATE TABLE _cf_unreviewed_application_data(secret TEXT)');
  await assert.rejects(inspectStorage(f.env.AGAPAY_DB), /_cf_unreviewed_application_data/,'provider exclusion must not hide arbitrary unreviewed tables');
  f.db.close();
}
{
  const f = await fixture();
  let job = await f.start('close');
  await processExport(f.env, 'parish-a', job.id); job = await getJob(f.env, 'parish-a', job.id);
  await assert.rejects(confirmClosure(f.env, { parishId: 'parish-a', jobId: job.id, actorHash: f.actor, archiveHash: 'bad', policyVersion: POLICY_VERSION, saved: true, confirmation: 'parish-a' }), /Verify/);
  f.db.prepare("UPDATE directory_people SET preferred_name='Changed' WHERE id='a'").run();
  await assert.rejects(f.confirm(job), /changed/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n, 0, 'stale export releases barrier and deletes nothing');
  await cancelExport(f.env, 'parish-a', job.id);
  job = await f.start('close'); await processExport(f.env, 'parish-a', job.id); job = await getJob(f.env, 'parish-a', job.id);
  await f.confirm(job);
  assert.throws(() => f.db.prepare("UPDATE directory_people SET preferred_name='Late writer' WHERE id='a'").run(), /WRITE_BLOCKED/);
  f.db.prepare("UPDATE directory_people SET preferred_name='Other parish update' WHERE id='b'").run();
  f.env.PARISH_EXPORTS.failDelete = true;
  await assert.rejects(processExport(f.env, 'parish-a', job.id), /synthetic/);
  assert.equal(f.db.prepare("SELECT count(*) n FROM directory_people WHERE id='a'").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM directory_people WHERE id IN ('b','shared')").get().n, 2);
  assert.equal(f.db.prepare("SELECT count(*) n FROM directory_contact_methods WHERE parish_id='parish-b'").get().n, 1);
  assert.throws(() => f.db.prepare("INSERT INTO directory_people(id,created_by_parish_id,preferred_name,created_at,updated_at) VALUES('late','parish-a','Late',1,1)").run(), /WRITE_BLOCKED/);
  assert.throws(() => f.db.prepare("INSERT INTO membership_capabilities(id,membership_id,capability,granted_at) VALUES('late-cap','deleted-membership','directory.manage','2026-08-28')").run(), /WRITE_BLOCKED/, 'parent-scoped records cannot return as orphans after closure');
  f.db.prepare("UPDATE directory_people SET preferred_name='Still shared' WHERE id='shared'").run();
  f.env.PARISH_EXPORTS.failDelete = false;
  await retryExport(f.env, 'parish-a', job.id); await processExport(f.env, 'parish-a', job.id);
  const completed = await getJob(f.env, 'parish-a', job.id);
  assert.equal(completed.status, 'active_data_deleted'); assert.equal(completed.manifest_json, null);
  assert.equal(f.env.PARISH_EXPORTS.objects.size, 0);
  const receipt = await handleParishPortability(new Request('https://agapay.test/api', { headers: { Authorization: 'Bearer ' + f['parish-a'] } }), f.env, 'parish-a', '/' + job.id + '/receipt');
  assert.equal(receipt.status, 200); assert.equal((await receipt.json()).receipt.status, 'active_data_deleted');
  assert.equal((await handleParishPortability(new Request('https://agapay.test/api'), f.env, 'parish-a')).status, 401);
  f.db.close();
}
{
  const f = await fixture({ barriers: false });
  const job = await f.start('close'); await processExport(f.env, 'parish-a', job.id);
  await assert.rejects(f.confirm(await getJob(f.env, 'parish-a', job.id)), /write barriers/);
  assert.equal(closureReadiness({}, {}).available, false);
  for (const manifest of [{ activeLegalHolds: [{ id: 'hold' }] }, { assets: [{ key: 'photo' }] }, { legacyRecords: [{ key: 'legacy' }] }, { tables: [{ table: 'accounting/ledger', rowCount: 1 }] }]) assert.equal(closureReadiness(f.env, manifest).available, false);
  const original = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE parish_id='parish-a'").get().data);
  original.parishDashboardSessions[0].mfaVerifiedAt = new Date(Date.now() + 60000).toISOString();
  f.db.prepare("UPDATE registrations SET data=? WHERE parish_id='parish-a'").run(JSON.stringify(original));
  const response = await handleParishPortability(new Request('https://agapay.test/api', { headers: { Authorization: 'Bearer ' + f['parish-a'] } }), f.env, 'parish-a');
  assert.equal(response.status, 428); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  f.db.close();
}
{
  const f = await fixture();
  const authoritative = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE reference='ref-parish-a'").get().data);
  authoritative.updatedAt = '2026-08-30T00:00:00.000Z';
  f.db.prepare("UPDATE registrations SET data=?, updated_at='2026-08-28T00:00:00.000Z' WHERE reference='ref-parish-a'").run(JSON.stringify(authoritative));
  f.db.prepare("INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES('ref-parish-a-history','parish-a','2026-08-29T00:00:00.000Z',?)").run(JSON.stringify({ parishId: 'parish-a', parishDashboardSessions: [] }));
  const response = await handleParishPortability(new Request('https://agapay.test/api', { headers: { Authorization: 'Bearer ' + f['parish-a'] } }), f.env, 'parish-a');
  assert.equal(response.status, 200, 'portability authenticates against the same authoritative duplicate parish record as the dashboard');
  f.db.close();
}
{
  const f = await fixture();
  const registration = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE reference='ref-parish-a'").get().data);
  registration.stripeSubscriptionId = 'sub_active_test';
  f.db.prepare("UPDATE registrations SET stripe_subscription_id=?, data=? WHERE reference='ref-parish-a'").run(registration.stripeSubscriptionId, JSON.stringify(registration));
  const closeRequest = () => new Request('https://agapay.test/api', { method: 'POST', headers: { Authorization: 'Bearer ' + f['parish-a'], 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'close', requestKey: crypto.randomUUID() }) });
  const missingSecret = await handleParishPortability(closeRequest(), f.env, 'parish-a');
  assert.equal(missingSecret.status, 503); assert.equal((await missingSecret.json()).code, 'billing_verification_unavailable');
  f.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
  const originalFetch = globalThis.fetch;
  let stripeReads = 0;
  try {
    globalThis.fetch = async (url) => {
      stripeReads += 1;
      assert.equal(String(url), 'https://api.stripe.com/v1/subscriptions/sub_active_test');
      return new Response(JSON.stringify({ id: 'sub_active_test', status: 'active' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const activeBilling = await handleParishPortability(closeRequest(), f.env, 'parish-a');
    assert.equal(activeBilling.status, 409); assert.equal((await activeBilling.json()).code, 'cancel_billing_first');
    assert.equal(f.db.prepare('SELECT count(*) n FROM parish_portability_jobs').get().n, 0, 'active billing blocks the final export before a job exists');
    globalThis.fetch = async () => { throw new Error('ordinary exports must not contact Stripe'); };
    const ordinary = await handleParishPortability(new Request('https://agapay.test/api', { method: 'POST', headers: { Authorization: 'Bearer ' + f['parish-a'], 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'export', requestKey: crypto.randomUUID() }) }), f.env, 'parish-a');
    assert.equal(ordinary.status, 202, 'ordinary data downloads remain independent of subscription cancellation');
    assert.equal(stripeReads, 1);
  } finally { globalThis.fetch = originalFetch; f.db.close(); }
}
{
  const indexed = await classifyLegacyRecord('parish_id_index:parish-a', JSON.stringify({ parishId: 'parish-a', parishName: 'Alpha', dashboardPasswordHash: 'hidden' }));
  assert.equal(indexed.parishId, 'parish-a'); assert.equal(indexed.kind, 'index'); assert.equal(indexed.data.dashboardPasswordHash, undefined);
  const pointed = await classifyLegacyRecord('parish_id_index:parish-a', 'registration:alpha', async key => key === 'registration:alpha' ? JSON.stringify({ parishId: 'parish-a' }) : null);
  assert.deepEqual(pointed.data, { target: 'registration:alpha' });
  await assert.rejects(classifyLegacyRecord('parish_id_index:parish-a', JSON.stringify({ parishId: 'parish-b' })), error => error.code === 'legacy_index_invalid');
  await assert.rejects(classifyLegacyRecord('parish_id_index:parish-a', 'registration:beta', async () => JSON.stringify({ parishId: 'parish-b' })), error => error.code === 'legacy_index_invalid');
}
{
  const values = new Map([['ref-a', JSON.stringify({ parishId: 'parish-a', parishName: 'Alpha', password: 'hidden' })], ['ref-b', JSON.stringify({ parishId: 'parish-b', parishName: 'Beta' })]]);
  const env = { AGAPAY_REGISTRATIONS: { async list({ cursor }) { return cursor ? { keys: [{ name: 'ref-b' }], list_complete: true } : { keys: [{ name: 'ref-a' }], list_complete: false, cursor: 'next' }; }, async get(key) { return values.get(key); } } };
  const records = await collectLegacyRecords(env, 'parish-a');
  assert.equal(records.length, 1); assert.equal(records[0].data.password, undefined);
  env.AGAPAY_REGISTRATIONS.list = async () => ({ keys: [], list_complete: false, cursor: 'stuck' });
  await assert.rejects(collectLegacyRecords(env, 'parish-a'), /completed/);
}
{
  const f = await fixture();
  const backup = await f.start('export'); await processExport(f.env, 'parish-a', backup.id);
  const job = await f.start('close'); await processExport(f.env, 'parish-a', job.id);
  const ready = await getJob(f.env, 'parish-a', job.id); await f.confirm(ready);
  f.db.exec("CREATE TRIGGER test_purge_failure BEFORE DELETE ON registrations WHEN OLD.parish_id='parish-a' BEGIN SELECT RAISE(ABORT,'synthetic transaction failure'); END;");
  await assert.rejects(processExport(f.env, 'parish-a', job.id), /transaction failure/);
  assert.equal(f.db.prepare("SELECT count(*) n FROM directory_people WHERE id='a'").get().n, 1, 'a late SQL failure rolls back preceding deletes');
  assert.equal(f.db.prepare("SELECT count(*) n FROM parish_portability_steps WHERE step_key='central_purge'").get().n, 0);
  f.db.exec('DROP TRIGGER test_purge_failure');
  await runPortabilityJobs(f.env);
  assert.equal((await getJob(f.env, 'parish-a', job.id)).status, 'active_data_deleted', 'scheduler resumes authorized failed deletion without the browser');
  assert.equal(f.env.PARISH_EXPORTS.objects.size, 0, 'closure removes earlier exports of the same parish too');
  assert.equal((await getJob(f.env, 'parish-a', backup.id)).status, 'cancelled');
  f.db.close();
}
{
  const f = await fixture();
  const registration = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE parish_id='parish-a'").get().data);
  registration.logoStorageKey = 'logos/parish-a.png';
  f.db.prepare("UPDATE registrations SET data=? WHERE parish_id='parish-a'").run(JSON.stringify(registration));
  f.env.CAMPAIGN_ASSETS = memoryBucket();
  await assert.rejects(collectParishExport(f.env, 'parish-a'), /verified ownership/);
  await f.env.CAMPAIGN_ASSETS.put('logos/parish-a.png', utf8('synthetic image bytes'), { httpMetadata: { contentType: 'image/png' } });
  f.db.prepare("INSERT INTO parish_portability_objects(binding,object_key,parish_id,state,etag,updated_at) VALUES('CAMPAIGN_ASSETS','logos/parish-a.png','parish-a','stored',?,1)").run((await f.env.CAMPAIGN_ASSETS.head('logos/parish-a.png')).etag);
  const result = await collectParishExport(f.env, 'parish-a');
  const asset = result.manifest.assets[0];
  assert.equal(text(entries(result.archive)[asset.archivePath]), 'synthetic image bytes');
  assert.equal(closureReadiness(f.env, result.manifest).available, false, 'a file adapter can export without falsely claiming purge coverage');
  const before = f.db.prepare('SELECT count(*) n FROM directory_people').get().n;
  const request = new Request('https://agapay.test/api', { method: 'POST', headers: { Authorization: 'Bearer ' + f['parish-a'], 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'x'.repeat(17000) }) });
  const response = await handleParishPortability(request, f.env, 'parish-a');
  assert.equal(response.status, 413); assert.equal(f.db.prepare('SELECT count(*) n FROM directory_people').get().n, before);
  f.db.close();
}
{
  const f = await fixture({ barriers: false }), books = new DatabaseSync(':memory:');
  f.db.exec(readFileSync(new URL('../migrations/0021_accounting_control_plane.sql', import.meta.url), 'utf8'));
  f.db.exec("INSERT INTO accounting_entities(id,parish_id) VALUES('entity-a','parish-a'); INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('books-a','entity-a','test','test-books-a');");
  books.exec(readFileSync(new URL('../accounting-migrations/0001_accounting_database_foundation.sql', import.meta.url), 'utf8'));
  books.exec('CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB)');
  books.exec('CREATE TABLE donors(email TEXT PRIMARY KEY,data TEXT)');
  books.exec("INSERT INTO accounting_database_metadata(key,value) VALUES('parish_id','parish-b'),('api_secret','not-exportable'); CREATE TABLE accounting_legal_holds(id TEXT,status TEXT,entity_type TEXT,entity_id TEXT); INSERT INTO accounting_legal_holds VALUES('hold-a','active','fiscal_year','year-a');");
  f.env.AGAPAY_ENVIRONMENT = 'test'; f.env.ACCOUNTING_DATABASE_BINDINGS = JSON.stringify({ 'test-books-a': 'TEST_BOOKS' });
  f.env.TEST_BOOKS = sqliteBinding(books);
  await assert.rejects(collectAccountingRecords(f.env, 'parish-a', [{ id: 'entity-a', parish_id: 'parish-a' }]), /does not match/);
  books.exec("UPDATE accounting_database_metadata SET value='parish-a' WHERE key='parish_id'");
  books.exec("INSERT INTO donors VALUES('legacy@example.test','{}')");
  await assert.rejects(collectAccountingRecords(f.env,'parish-a',[{id:'entity-a',parish_id:'parish-a'}]),/Unexpected legacy data/,'non-accounting data must never be silently omitted or assigned to the parish');
  books.exec('DELETE FROM donors');
  const result = await collectAccountingRecords(f.env, 'parish-a', [{ id: 'entity-a', parish_id: 'parish-a' }]);
  assert.equal(result.holds.length, 1); assert.equal(JSON.stringify(result).includes('not-exportable'), false);
  const archive = await collectParishExport(f.env, 'parish-a');
  assert.ok(entries(archive.archive)['accounting/accounting_legal_holds.json']);
  assert.equal(text(archive.archive).includes('test-books-a'), false, 'provider database identifiers are not parish export data');
  assert.equal(closureReadiness(f.env, archive.manifest).available, false);
  books.exec("DELETE FROM accounting_legal_holds; CREATE TABLE accounting_journal_entries(id TEXT PRIMARY KEY,status TEXT); INSERT INTO accounting_journal_entries VALUES('posted-journal','posted'); CREATE TRIGGER test_posted_immutable BEFORE DELETE ON accounting_journal_entries BEGIN SELECT RAISE(ABORT,'immutable posted journal'); END;");
  for(const sql of barrierStatements((await inspectStorage(f.env.AGAPAY_DB)).map(t=>t.name)))f.db.exec(sql);
  const job=await f.start('close'); await processExport(f.env,'parish-a',job.id); await f.confirm(await getJob(f.env,'parish-a',job.id));
  assert.throws(()=>books.prepare("INSERT INTO accounting_journal_entries VALUES('late','draft')").run(),/ACCOUNTING_CLOSURE_WRITE_BLOCKED/);
  await processExport(f.env,'parish-a',job.id);
  assert.equal(books.prepare('SELECT count(*) n FROM accounting_journal_entries').get().n,1);
  assert.equal(books.prepare("SELECT value FROM accounting_database_metadata WHERE key='api_secret'").get(),undefined,'technical credentials are not retained as accounting evidence');
  assert.ok(books.prepare("SELECT 1 FROM sqlite_master WHERE name='test_posted_immutable'").get(),'existing journal immutability is untouched');
  assert.ok(f.db.prepare("SELECT 1 FROM parish_portability_retention WHERE category='accounting'").get());
  assert.throws(()=>books.prepare("UPDATE accounting_database_metadata SET value='another-parish' WHERE key='parish_id'").run(),/ACCOUNTING_CLOSURE_WRITE_BLOCKED/);
  assert.throws(()=>books.prepare("INSERT INTO donors VALUES('late@example.test','{}')").run(),/ACCOUNTING_CLOSURE_WRITE_BLOCKED/,'empty reviewed legacy tables are frozen with the books');
  books.close(); f.db.close();
}
{
  const f = await fixture();
  f.env.DIRECTORY_MEDIA = memoryBucket();
  const guarded = protectFileStorage(f.env);
  await assert.rejects(guarded.DIRECTORY_MEDIA.put('unowned',utf8('x')),/explicit parish owner/);
  await guarded.DIRECTORY_MEDIA.put('directory/a/orphan.jpg',utf8('a'),{customMetadata:{agapayParishId:'parish-a'}});
  await guarded.DIRECTORY_MEDIA.put('directory/b/keep.jpg',utf8('b'),{customMetadata:{agapayParishId:'parish-b'}});
  assert.equal((await inventoryParishObjects(f.env,'parish-a')).length,1,'unreferenced uploads are inventoried');
  const job = await f.start('close'); await processExport(f.env,'parish-a',job.id);
  await f.confirm(await getJob(f.env,'parish-a',job.id));
  await assert.rejects(guarded.DIRECTORY_MEDIA.put('late.jpg',utf8('late'),{customMetadata:{agapayParishId:'parish-a'}}),/closed/);
  await processExport(f.env,'parish-a',job.id);
  assert.equal(await f.env.DIRECTORY_MEDIA.head('directory/a/orphan.jpg'),null);
  assert.ok(await guarded.DIRECTORY_MEDIA.get('directory/b/keep.jpg'));
  assert.ok(await suppressionRecord(f.env,'parish-a'));
  f.env.PARISH_PORTABILITY_ENABLED='false';
  await assert.rejects(guarded.DIRECTORY_MEDIA.put('late-again.jpg',utf8('late'),{customMetadata:{agapayParishId:'parish-a'}}),/closed/,'hiding the UI never disables storage guards');
  f.db.close();
}
{
  const f = await fixture();
  f.env.DIRECTORY_MEDIA = memoryBucket();
  const originalPut = f.env.DIRECTORY_MEDIA.put.bind(f.env.DIRECTORY_MEDIA);
  f.env.DIRECTORY_MEDIA.put = async (...args) => { await originalPut(...args); throw new Error('ambiguous upload'); };
  const guarded = protectFileStorage(f.env);
  await assert.rejects(guarded.DIRECTORY_MEDIA.put('uncertain.jpg',utf8('x'),{customMetadata:{agapayParishId:'parish-a'}}),/ambiguous/);
  await assert.rejects(assertStorageDrained(f.env,'parish-a'),/still running/);
  const op = f.db.prepare('SELECT * FROM parish_portability_storage_operations').get();
  const request = { operationId:op.id, expectedEtag:(await f.env.DIRECTORY_MEDIA.head('uncertain.jpg')).etag, evidenceSha256:'a'.repeat(64) };
  await assert.rejects(reconcileFileOperation(f.env,request),/quarantine/);
  f.env.PARISH_RESTORE_QUARANTINE='true';
  await reconcileFileOperation(f.env,request);
  await assertStorageDrained(f.env,'parish-a');
  await assert.rejects(reconcileObjectOwnership(f.env,{binding:'DIRECTORY_MEDIA',key:'uncertain.jpg',parishId:'parish-b',expectedEtag:request.expectedEtag,evidenceSha256:'a'.repeat(64)}),/another parish/);
  f.db.close();
}
{
  const f = await fixture();
  const values = new Map(), stale = new Map();
  const kv = { async put(key,value){values.set(key,value);}, async get(key){return stale.get(key) ?? values.get(key) ?? null;}, async delete(key){values.delete(key);}, async list(){return{keys:[...values.keys()].map(name=>({name})),list_complete:true};} };
  f.env.AGAPAY_REGISTRATIONS=kv; f.env.PARISH_LEGACY_INVENTORY_VERIFIED=POLICY_VERSION;
  const guarded = protectLegacyStorage(protectFileStorage(f.env));
  await guarded.AGAPAY_REGISTRATIONS.put('legacy-a',JSON.stringify({parishId:'parish-a',parishName:'Alpha',password:'secret'}));
  await guarded.AGAPAY_REGISTRATIONS.put('legacy-b',JSON.stringify({parishId:'parish-b',parishName:'Beta'}));
  await guarded.AGAPAY_REGISTRATIONS.put('__agapay_donor__shared',JSON.stringify({email:'shared@example.test',parishId:'parish-a'}));
  await guarded.AGAPAY_REGISTRATIONS.put('__agapay_index_parish_id__parish-a','legacy-a');
  stale.set('legacy-a',JSON.stringify({parishId:'parish-a',parishName:'old'}));
  await assert.rejects(collectLegacyRecords(f.env,'parish-a'),/not converged/);
  stale.clear();
  const realList = kv.list; kv.list=async()=>({keys:[],list_complete:true});
  assert.equal((await collectLegacyRecords(f.env,'parish-a')).length,2,'authoritative write registry covers stale KV list omissions'); kv.list=realList;
  const job=await f.start('close'); await processExport(f.env,'parish-a',job.id); await f.confirm(await getJob(f.env,'parish-a',job.id));
  const old=values.get('legacy-a'); stale.set('legacy-a',old);
  await assert.rejects(processExport(f.env,'parish-a',job.id),/propagating/);
  assert.equal(await guarded.AGAPAY_REGISTRATIONS.get('legacy-a'),null,'stale regional KV values are not served after closure');
  stale.clear(); await retryExport(f.env,'parish-a',job.id); await processExport(f.env,'parish-a',job.id);
  assert.ok(values.has('legacy-b')); assert.ok(values.has('__agapay_donor__shared'));
  assert.equal(values.has('__agapay_index_parish_id__parish-a'),false);
  await assert.rejects(guarded.AGAPAY_REGISTRATIONS.put('legacy-a',old),/closed/);
  f.db.close();
}
{
  const f=await fixture({barriers:false});
  f.db.exec("CREATE TABLE tax_exemption_documents(id TEXT PRIMARY KEY,registration_reference TEXT REFERENCES registrations(reference),storage_key TEXT); INSERT INTO tax_exemption_documents VALUES('doc','ref-parish-a','texdoc/a');");
  f.db.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?)').run('parish-feature-requests:parish-a',JSON.stringify({features:{test:1}}),'2026-08-28');
  f.db.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?)').run('__agapay_parish_support_ticket:a',JSON.stringify({parishId:'parish-a',message:'Help me'}),'2026-08-28');
  for(const sql of barrierStatements((await inspectStorage(f.env.AGAPAY_DB)).map(t=>t.name)))f.db.exec(sql);
  f.env.TAX_EXEMPTION_DOCS=memoryBucket();
  await protectFileStorage(f.env).TAX_EXEMPTION_DOCS.put('texdoc/a',utf8('financial evidence'),{customMetadata:{agapayParishId:'parish-a'}});
  const job=await f.start('close'); await processExport(f.env,'parish-a',job.id); await f.confirm(await getJob(f.env,'parish-a',job.id));
  await processExport(f.env,'parish-a',job.id);
  assert.equal(await f.env.TAX_EXEMPTION_DOCS.head('texdoc/a'),null);
  const registration=f.db.prepare("SELECT * FROM registrations WHERE parish_id='parish-a'").get();
  assert.equal(registration.status,'closed'); assert.equal(registration.parish_name,null);
  assert.deepEqual(JSON.parse(registration.data),{parishId:'parish-a',status:'closed'});
  assert.equal(f.db.prepare("SELECT count(*) n FROM app_settings WHERE key LIKE '%parish-a' OR key='__agapay_parish_support_ticket:a'").get().n,0);
  assert.equal(f.env.PARISH_RETAINED_DATA.objects.size,2,'only supporting evidence and support correspondence copied');
  const retention=f.db.prepare('SELECT * FROM parish_portability_retention').all();
  assert.ok(retention.some(row=>row.category==='support')); assert.ok(retention.some(row=>row.category==='financial'));
  await reviewDueRetentions(f.env,Date.UTC(2140,0,1));
  assert.ok(f.db.prepare('SELECT status FROM parish_portability_retention').all().every(row=>row.status==='review_due'));
  assert.equal(f.env.PARISH_RETAINED_DATA.objects.size,2,'review date is not an authorization to destroy legal evidence');
  assert.throws(()=>f.db.prepare("UPDATE registrations SET data='{}' WHERE parish_id='parish-a'").run(),/WRITE_BLOCKED/);
  f.db.close();
}
{
  const source=await fixture(), restored=await fixture();
  const job=await source.start('close'); await processExport(source.env,'parish-a',job.id); await source.confirm(await getJob(source.env,'parish-a',job.id)); await processExport(source.env,'parish-a',job.id);
  restored.env.PARISH_CLOSURE_LEDGER=source.env.PARISH_CLOSURE_LEDGER;
  await assert.rejects(assertRestoreSafe(restored.env),/suppression replay/);
  await assert.rejects(replayClosureSuppressions(restored.env,'b'.repeat(64)),/quarantine/);
  restored.env.PARISH_RESTORE_QUARANTINE='true';
  await replayClosureSuppressions(restored.env,'b'.repeat(64));
  await assert.rejects(assertRestoreSafe({...restored.env,PARISH_RESTORE_QUARANTINE:'false'}),/suppression replay/,'replay alone cannot authorize serving resurrected records');
  restored.db.prepare("UPDATE parish_data_closures SET state='deleting' WHERE parish_id='parish-a'").run();
  await assert.rejects(assertRestoreSafe({...restored.env,PARISH_RESTORE_QUARANTINE:'false'}),/suppression replay/,'an intermediate backup taken after authorization cannot defeat independent completion evidence');
  await sanitizeRestoredParish(restored.env,'parish-a','b'.repeat(64));
  await assert.rejects(assertRestoreSafe(restored.env),/quarantined/);
  await assertRestoreSafe({...restored.env,PARISH_RESTORE_QUARANTINE:'false'});
  assert.equal(restored.db.prepare("SELECT count(*) n FROM directory_people WHERE id='a'").get().n,0);
  assert.equal(restored.db.prepare("SELECT count(*) n FROM directory_people WHERE id='b'").get().n,1);
  await sanitizeRestoredParish(restored.env,'parish-a','b'.repeat(64));
  restored.env.PARISH_CLOSURE_LEDGER=memoryBucket();
  await assert.rejects(assertRestoreSafe({...restored.env,PARISH_RESTORE_QUARANTINE:'false'}),/authority/,'empty or misbound ledgers fail closed');
  source.db.close(); restored.db.close();
}
{
  const f=await fixture();
  await verifyBackupExpiryEvidence(f.env);
  await assert.rejects(verifyBackupExpiryEvidence({...f.env, ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED:'false'}), /Strict backup expiry/);
  assert.ok(closureReadiness({...f.env, ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED:'false'},{}).blockers.some(b=>b.code==='backup_expiry_disabled'));
  await f.env.PARISH_CLOSURE_LEDGER.put('backup-expiry/latest.json',JSON.stringify({verifiedAt:Date.now(),retentionDays:365,newestBackupPreserved:false,oldestRetainedAt:null}));
  await assert.rejects(verifyBackupExpiryEvidence(f.env), /predates/);
  await f.env.PARISH_CLOSURE_LEDGER.put('backup-expiry/latest.json',JSON.stringify({strictExpiryEnabled:true,verifiedAt:Date.now()-3*86400000,retentionDays:365,newestBackupPreserved:false,oldestRetainedAt:null}));
  const job=await f.start('close'); await processExport(f.env,'parish-a',job.id);
  await assert.rejects(f.confirm(await getJob(f.env,'parish-a',job.id)),/stale/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n,0);
  f.db.close();
}
{
  const f=await fixture();
  const job=await f.start('close'); await processExport(f.env,'parish-a',job.id);
  const put=f.env.PARISH_CLOSURE_LEDGER.put.bind(f.env.PARISH_CLOSURE_LEDGER);
  f.env.PARISH_CLOSURE_LEDGER.put=async(key,...args)=>{if(key.startsWith('closures/'))throw new Error('ledger unavailable');return put(key,...args);};
  await assert.rejects(f.confirm(await getJob(f.env,'parish-a',job.id)),/ledger unavailable/);
  assert.ok((await getJob(f.env,'parish-a',job.id)).confirmed_at,'committed authorization is preserved when the independent marker fails');
  await retryExport(f.env,'parish-a',job.id);
  await assert.rejects(processExport(f.env,'parish-a',job.id),/ledger unavailable/);
  assert.equal(f.db.prepare("SELECT count(*) n FROM directory_people WHERE id='a'").get().n,1,'no deletion precedes durable independent suppression');
  f.env.PARISH_CLOSURE_LEDGER.put=put;
  await retryExport(f.env,'parish-a',job.id); await processExport(f.env,'parish-a',job.id);
  assert.equal((await getJob(f.env,'parish-a',job.id)).status,'active_data_deleted');
  f.db.close();
}
{
  const f=await fixture();
  Object.assign(f.env,{CAMPAIGN_ASSETS:memoryBucket(),CAMPAIGN_ASSETS_URL:'https://media.agapay.test',PARISH_PUBLIC_CACHE_POLICY_VERIFIED:POLICY_VERSION,PARISH_ASSET_CACHE_ZONE_ID:'a'.repeat(32),PARISH_ASSET_CACHE_PURGE_TOKEN:'synthetic-test-token'});
  await protectFileStorage(f.env).CAMPAIGN_ASSETS.put('campaigns/parish-a/old.jpg',utf8('image'),{customMetadata:{agapayParishId:'parish-a'}});
  const job=await f.start('close'); await processExport(f.env,'parish-a',job.id); await f.confirm(await getJob(f.env,'parish-a',job.id));
  const fetchBefore=globalThis.fetch; const requests=[];
  try {
    globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({success:false}),{status:503});};
    await assert.rejects(processExport(f.env,'parish-a',job.id),/cache removal/);
    assert.equal((await getJob(f.env,'parish-a',job.id)).status,'failed');
    assert.deepEqual(requests[0].body.files,['https://media.agapay.test/campaigns/parish-a/old.jpg']);
    globalThis.fetch=async()=>new Response(JSON.stringify({success:true}));
    await retryExport(f.env,'parish-a',job.id); await processExport(f.env,'parish-a',job.id);
    assert.equal((await getJob(f.env,'parish-a',job.id)).status,'active_data_deleted');
  } finally {globalThis.fetch=fetchBefore;f.db.close();}
}
console.log('Parish portability tests passed: scoped export, immutable accounting boundaries, storage writer fencing, orphan inventory, private retention, KV convergence, backup evidence, cache failure recovery, and quarantined restore replay.');
