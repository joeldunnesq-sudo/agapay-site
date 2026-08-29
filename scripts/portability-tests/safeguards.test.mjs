import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORTABILITY_SCHEMA } from '../../src/portability/schema.js';
import { POLICY_VERSION, inspectStorage, classification, exportRow, csvForRows } from '../../src/portability/catalog.js';
import { createZip, sha256, utf8 } from '../../src/portability/archive.js';
import { collectLegacyRecords } from '../../src/portability/legacy.js';
import { barrierStatements, closureReadiness } from '../../src/portability/closure.js';
import { retentionDisclosure, RETENTION_DISCLOSURE_VERSION } from '../../src/portability/policy.js';
import { portabilityDiagnosticSnapshot } from '../../src/portability/diagnostics.js';
import { processExport, getJob, publicJob, retryExport } from '../../src/portability/service.js';
import { handleParishPortability } from '../../src/handlers/parish-portability.js';
import { protectFileStorage, inventoryParishObjects, assertStorageDrained } from '../../src/portability/storage.js';
import { protectLegacyStorage } from '../../src/portability/legacy.js';
import { suppressionRecord, recordSuppression, recordSuppressionCompletion } from '../../src/portability/suppression.js';
import { reconcileObjectOwnership, reconcileFileOperation } from '../../src/portability/maintenance.js';
import { verifyBackupExpiryEvidence } from '../../src/portability/backup-evidence.js';
import { portabilityFixture as fixture, memoryBucket, zipEntries as entries, decodedText as text } from './fixtures.mjs';


const retentionDisclosureDraft = readFileSync(new URL('../../docs/data-portability/retention-disclosure-draft.md', import.meta.url), 'utf8');
assert.ok(retentionDisclosureDraft.includes(`**Disclosure version:** \`${RETENTION_DISCLOSURE_VERSION}\``));
assert.match(retentionDisclosureDraft, /Status:\*\* Draft pending formal approval/);
assert.match(retentionDisclosureDraft, /does not authorize production deletion/);
for (const section of retentionDisclosure({}).sections) assert.ok(retentionDisclosureDraft.includes(`### ${section.title}`), `review document must contain the ${section.key} section`);
const installedBarriers = readFileSync(new URL('../../docs/data-portability/install-write-barriers.sql', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
assert.deepEqual(exportRow('registrations', { data: JSON.stringify({ password: 'x', contact: 'ok', nested: { apiKey: 'x', passwordRecord: 'x' } }) }), { data: { contact: 'ok', nested: {} } });
assert.throws(() => exportRow('registrations', { data: '{broken' }), /safely exported/);
assert.throws(() => createZip([{ name: '../private', bytes: utf8('x') }]), /Unsafe/);
const standardZip = createZip([{ name: 'hello.txt', bytes: utf8('Portable parish records') }]);
assert.equal(text(entries(standardZip)['hello.txt']), 'Portable parish records');

{
  const privateValues = ['parish-secret', 'donor@example.test', 'Private Donor', 'exports/private/archive.zip'];
  const job = {
    id: 'safe-control-id',
    parish_id: privateValues[0],
    requested_by: 'private-actor-fingerprint',
    mode: 'close',
    status: 'failed',
    confirmed_at: 1,
    confirmation_stage: null,
    error_code: 'legacy_owner_conflict',
    manifest_json: JSON.stringify({ donor: privateValues[1], name: privateValues[2] }),
    archive_key: privateValues[3],
  };
  const diagnostic = portabilityDiagnosticSnapshot(job);
  assert.deepEqual(Object.keys(diagnostic), ['version', 'stage', 'failedSafeguard']);
  assert.deepEqual(diagnostic, { version: 1, stage: 'stopped_during_deletion', failedSafeguard: 'legacy_data' });
  assert.deepEqual(publicJob({}, job).diagnostic, diagnostic, 'authenticated job responses include only the allowlisted diagnostic projection');
  for (const privateValue of privateValues) assert.equal(JSON.stringify(diagnostic).includes(privateValue), false);
  assert.deepEqual(portabilityDiagnosticSnapshot({ status: 'preparing', confirmation_stage: 'freeze_books', error_code: 'backup_evidence_stale' }), { version: 1, stage: 'freezing_accounting', failedSafeguard: 'backup_expiry' });
  assert.equal(portabilityDiagnosticSnapshot({ status: 'failed', error_code: 'donor@example.test' }).failedSafeguard, 'unexpected_failure', 'unrecognized database values are never copied to diagnostics');
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
  const f = await fixture({ barriers: false });
  const job = await f.start('close'); await processExport(f.env, 'parish-a', job.id);
  await assert.rejects(f.confirm(await getJob(f.env, 'parish-a', job.id)), /write barriers/);
  assert.equal(closureReadiness({}, {}).available, false);
  const draftDisclosure = retentionDisclosure({});
  assert.equal(draftDisclosure.version, RETENTION_DISCLOSURE_VERSION);
  assert.equal(draftDisclosure.status, 'draft_pending_approval');
  assert.equal(draftDisclosure.approvalRequired, true);
  assert.deepEqual(draftDisclosure.sections.map(section => section.key), ['activeData','financial','support','closureRecords','sharedAccounts','backups','providers']);
  const withoutApproval = { ...f.env }; delete withoutApproval.PARISH_RETENTION_DISCLOSURE_APPROVED;
  assert.ok(closureReadiness(withoutApproval, {}).blockers.some(blocker => blocker.code === 'retention_disclosure_unapproved'));
  assert.ok(closureReadiness({ ...f.env, PARISH_RETENTION_DISCLOSURE_APPROVED: 'stale-version' }, {}).blockers.some(blocker => blocker.code === 'retention_disclosure_unapproved'));
  assert.equal(retentionDisclosure(f.env).status, 'approved');
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
