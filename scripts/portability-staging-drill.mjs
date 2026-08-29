// Operator-only synthetic drill. No Worker deployment and no production bindings.
// --local is the default. --remote explicitly uses the provisioned staging stores.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { POLICY_VERSION, quoted } from '../src/portability/catalog.js';
import { sha256 } from '../src/portability/archive.js';
import { protectFileStorage } from '../src/portability/storage.js';
import { protectLegacyStorage, collectLegacyRecords } from '../src/portability/legacy.js';
import { assertRestoreSafe } from '../src/portability/suppression.js';
import { replayClosureSuppressions, sanitizeRestoredParish } from '../src/portability/restore.js';
import { startExport, processExport, getJob, downloadExport, confirmClosure, retryExport } from '../src/portability/service.js';
import { sweepAccountingBackupRetention } from '../src/accounting/backup-retention.js';

const remote=process.argv.includes('--remote');
assert.ok(process.argv.slice(2).every(arg=>['--local','--remote'].includes(arg)));
const dir=path.resolve('artifacts/portability-staging');
assert.ok(!remote || !existsSync(path.join(dir,'natural-expiry-state.json')), 'Natural lifecycle observation has started. Do not run this drill or its backup sweep; use the read-only expiry check.');
const configPath=path.join(dir,'wrangler.json');
const config=JSON.parse(readFileSync(configPath,'utf8'));
const resources=JSON.parse(readFileSync(path.join(dir,'resources.json'),'utf8'));
const prefix='agapay-portability-staging-20260828';
assert.equal(config.name,prefix);assert.equal(resources.prefix,prefix);
assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);
assert.deepEqual(config.triggers.crons,[]);
const protectedIds=new Set([...readFileSync('wrangler.toml','utf8').matchAll(/(?:database_id|\bid)\s*=\s*"([a-f0-9-]+)"/g)].map(m=>m[1]));
for(const r of config.d1_databases){assert.equal(r.database_id,resources.d1[r.binding]?.id);assert.equal(r.database_name,resources.d1[r.binding]?.name);assert.ok(r.database_name.includes('staging')&&r.database_name.includes('portability'));assert.ok(!protectedIds.has(r.database_id));assert.equal(r.remote,true);}
for(const r of config.kv_namespaces){assert.equal(r.id,resources.kv[r.binding]?.id);assert.ok(resources.kv[r.binding].name.startsWith(prefix+'-'));assert.ok(!protectedIds.has(r.id));assert.equal(r.remote,true);}
for(const r of config.r2_buckets){assert.equal(r.bucket_name,resources.r2[r.binding]?.name);assert.ok(r.bucket_name.startsWith(prefix+'-'));assert.equal(r.remote,true);}
assert.equal(config.d1_databases.length,4);assert.equal(config.kv_namespaces.length,2);assert.equal(config.r2_buckets.length,9);
assert.ok(!config.services&&!config.routes&&!config.main&&!config.assets&&!config.browser);
for(const binding of Object.keys(resources.r2)) {
  assert.match(resources.safeguards[binding]?.publicAccess || '',/Public access via the r2\.dev URL is disabled/);
  assert.match(resources.safeguards[binding]?.domains || '',/There are no custom domains/);
}
for(const rule of ['authority','closures','completions'])assert.equal(resources.safeguards['lock-'+rule],true);
const audit=JSON.parse(readFileSync(path.join(dir,'schema-audit.json'),'utf8'));
for(const schema of audit.schemas)assert.equal(await sha256(readFileSync(path.join(dir,schema.kind+'-baseline.sql'))),schema.baselineSha256);
const evidenceSha256=await sha256(JSON.stringify({audit,resources}));
const statePath=path.join(dir,remote?'remote-drill-state.json':'local-drill-state.json');
const state=remote&&existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{remote,startedAt:new Date().toISOString(),evidenceSha256,checkpoints:[]};
assert.equal(state.remote,remote);assert.equal(state.evidenceSha256,evidenceSha256,'Resource/schema evidence changed; review before resuming');
const save=()=>writeFileSync(statePath,JSON.stringify(state,null,2)+'\n');
const pass=message=>{if(!state.checkpoints.includes(message))state.checkpoints.push(message);save();console.log('PASS - '+message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const proxy=await getPlatformProxy({configPath,envFiles:[],remoteBindings:remote,persist:false});
// The Node/workerd bridge transfers an R2 body when its getter is read. Normalize
// that transport once so service code sees the usual repeatable body property;
// all bytes/metadata still come from the real bound store, without mock storage.
const boundEnv={...proxy.env};
for(const {binding} of config.r2_buckets){
  const bucket=proxy.env[binding];
  boundEnv[binding]=new Proxy(bucket,{get(target,key){
    if(key==='get')return async(...args)=>{
      const raw=await target.get(...args);if(!raw)return raw;
      const body=raw.body;
      const object={key:raw.key,size:raw.size,etag:raw.etag,httpEtag:raw.httpEtag,uploaded:raw.uploaded,httpMetadata:raw.httpMetadata,customMetadata:raw.customMetadata};
      return body?{...object,body,arrayBuffer:()=>new Response(body).arrayBuffer(),text:()=>new Response(body).text()}:object;
    };
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
}
// Test attestations apply only to these isolated synthetic stores. The report
// explicitly distinguishes controlled-clock expiry from natural lifecycle expiry.
const env={...boundEnv,AGAPAY_ENVIRONMENT:'staging',PARISH_PORTABILITY_ENABLED:'true',PARISH_STORAGE_GUARDS_ENABLED:'true',PARISH_AUTOMATIC_CLOSURE_ENABLED:'true',ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED:'true',ACCOUNTING_BACKUP_RETENTION_DAYS:'1',PARISH_SUPPRESSION_AUTHORITY:prefix,PARISH_BACKUP_EXPIRY_VERIFIED:POLICY_VERSION,PARISH_LEGACY_INVENTORY_VERIFIED:POLICY_VERSION,ACCOUNTING_DATABASE_BINDINGS:JSON.stringify({[resources.d1.DRILL_BOOKS.name]:'DRILL_BOOKS'})};
const restored={...env,AGAPAY_DB:env.RESTORE_AGAPAY_DB,DRILL_BOOKS:env.RESTORE_DRILL_BOOKS,AGAPAY_REGISTRATIONS:env.RESTORE_AGAPAY_REGISTRATIONS,DIRECTORY_MEDIA:env.RESTORE_DIRECTORY_MEDIA,TAX_EXEMPTION_DOCS:env.RESTORE_TAX_EXEMPTION_DOCS,PARISH_EXPORTS:env.RESTORE_PARISH_EXPORTS};
const parishId='portability-staging-a', other='portability-staging-b';
const actorHash=await sha256(prefix+':synthetic-administrator');
async function batch(db,statements){for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));}
async function install(db,kind){
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results;
  for(const {name}of tables)assert.equal((await db.prepare(`SELECT count(*) n FROM ${quoted(name)}`).first()).n,0,'Refusing to initialize a populated database');
  const sql=readFileSync(path.join(dir,kind+'-baseline.sql'),'utf8');
  await batch(db,unstable_splitSqlQuery(sql).map(sql=>db.prepare(sql.replace(/^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) (?!IF NOT EXISTS)/i,'CREATE $1 IF NOT EXISTS '))));
}
async function waitLegacy(target){
  for(let attempt=0;;attempt++){try{return await collectLegacyRecords(target,parishId);}catch(error){if(!remote||attempt>=5||!['legacy_not_converged','legacy_changed','legacy_index_invalid'].includes(error.code))throw error;console.log('Waiting for remote KV convergence');await pause(15000);}}
}
async function snapshot(db,key,target){
  let object=await env.ACCOUNTING_BACKUPS.get(key);
  if(!object){
    const schema=(await db.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all()).results;
    const tables=[];for(const row of schema.filter(r=>r.type==='table'))tables.push({name:row.name,rows:(await db.prepare(`SELECT * FROM ${quoted(row.name)}`).all()).results});
    const body=JSON.stringify({schema,tables});
    await env.ACCOUNTING_BACKUPS.put(key,body,{customMetadata:{sha256:await sha256(body)},httpMetadata:{cacheControl:'private, no-store'}});object=await env.ACCOUNTING_BACKUPS.get(key);
  }
  const body=await object.text();assert.equal(await sha256(body),object.customMetadata.sha256);
  state.snapshotHashes??={};state.snapshotHashes[key]=object.customMetadata.sha256;save();
  const data=JSON.parse(body);
  // Restore only into an empty synthetic destination, never over a running DB.
  for(const table of (await target.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results)assert.equal((await target.prepare(`SELECT count(*) n FROM ${quoted(table.name)}`).first()).n,0);
  await batch(target,data.schema.filter(r=>r.type!=='trigger').map(r=>target.prepare(r.sql.replace(/^CREATE (TABLE|INDEX|UNIQUE INDEX) (?!IF NOT EXISTS)/i,'CREATE $1 IF NOT EXISTS '))));
  const inserts=[target.prepare('PRAGMA defer_foreign_keys=ON')];
  for(const table of data.tables)for(const row of table.rows)inserts.push(target.prepare(`INSERT INTO ${quoted(table.name)}(${Object.keys(row).map(quoted)}) VALUES(${Object.keys(row).map(()=>'?')})`).bind(...Object.values(row)));
  await target.batch(inserts);
  await batch(target,data.schema.filter(r=>r.type==='trigger').map(r=>target.prepare(r.sql)));
}
try {
  if(!state.schemaInstalled){await install(env.AGAPAY_DB,'central');await install(env.DRILL_BOOKS,'accounting');state.schemaInstalled=true;save();}
  if(!state.seeded){
    assert.equal((await env.AGAPAY_DB.prepare('SELECT count(*) n FROM parish_data_closures').first()).n,0);
    const authority=JSON.stringify({id:prefix,policyVersion:POLICY_VERSION});
    const existing=await env.PARISH_CLOSURE_LEDGER.get('authority.json');
    if(existing)assert.equal(await existing.text(),authority);else await env.PARISH_CLOSURE_LEDGER.put('authority.json',authority,{httpMetadata:{cacheControl:'private, no-store'}});
    for(const p of [parishId,other]){
      await env.AGAPAY_DB.prepare('INSERT OR IGNORE INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').bind('ref-'+p,p,new Date().toISOString(),JSON.stringify({parishId:p,parishName:p,password:'synthetic-secret'})).run();
      await env.AGAPAY_DB.prepare('INSERT OR IGNORE INTO directory_people(id,created_by_parish_id,preferred_name,created_at,updated_at) VALUES(?,?,?,1,1)').bind(p,p,p).run();
      await env.AGAPAY_DB.prepare("INSERT OR IGNORE INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) VALUES(?,?,?,'member',1,1)").bind('aff-'+p,p,p).run();
    }
    await env.AGAPAY_DB.prepare("INSERT OR IGNORE INTO giving_funds(id,parish_id,name,code) VALUES('drill-fund',?,'Synthetic retained fund','DRILL')").bind(parishId).run();
    await env.AGAPAY_DB.prepare("INSERT OR IGNORE INTO accounting_entities(id,parish_id) VALUES('drill-entity',?)").bind(parishId).run();
    await env.AGAPAY_DB.prepare("INSERT OR IGNORE INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('drill-db','drill-entity','staging',?)").bind(resources.d1.DRILL_BOOKS.name).run();
    await env.DRILL_BOOKS.prepare("INSERT OR IGNORE INTO accounting_database_metadata(key,value) VALUES('parish_id',?),('api_secret','synthetic-book-secret')").bind(parishId).run();
    const guarded=protectLegacyStorage(protectFileStorage(env));
    for(const p of [parishId,other]){
      await guarded.DIRECTORY_MEDIA.put('directory/'+p+'.txt','synthetic photo '+p,{customMetadata:{agapayParishId:p}});
      await guarded.AGAPAY_REGISTRATIONS.put('legacy-'+p,JSON.stringify({parishId:p,parishName:p,password:'synthetic-secret'}));
    }
    await guarded.TAX_EXEMPTION_DOCS.put('financial/a.txt','synthetic financial evidence',{customMetadata:{agapayParishId:parishId}});
    await guarded.AGAPAY_REGISTRATIONS.put('__agapay_donor__independent',JSON.stringify({email:'synthetic@example.test'}));
    await waitLegacy(env);state.seeded=true;save();
  }
  pass('Complete schema baselines initialized with synthetic data only');
  if(!state.backupTested){
    await env.ACCOUNTING_BACKUPS.put('trial/expiry-test.txt','synthetic recovery marker');
    const report=await sweepAccountingBackupRetention(env,Date.now()+2*86400000);
    assert.equal(report.deleted,1);assert.equal(await env.ACCOUNTING_BACKUPS.head('trial/expiry-test.txt'),null);
    state.backupTested=true;state.backupClockSimulated=true;save();
  }
  await sweepAccountingBackupRetention(env);
  if(remote&&!state.lockTested){
    const before=await (await env.PARISH_CLOSURE_LEDGER.get('authority.json')).text();
    await assert.rejects(env.PARISH_CLOSURE_LEDGER.put('authority.json','unauthorized overwrite'));
    await assert.rejects(env.PARISH_CLOSURE_LEDGER.delete('authority.json'));
    assert.equal(await (await env.PARISH_CLOSURE_LEDGER.get('authority.json')).text(),before);state.lockTested=true;save();
  }
  pass('Backup sweep deletion verified with a controlled clock; natural lifecycle expiry remains pending');
  if(!state.centralSnapshot){await snapshot(env.AGAPAY_DB,'trial/central-snapshot.json',restored.AGAPAY_DB);state.centralSnapshot=true;save();}
  if(!state.bookSnapshot){await snapshot(env.DRILL_BOOKS,'trial/accounting-snapshot.json',restored.DRILL_BOOKS);state.bookSnapshot=true;save();}
  if(!state.filesSnapshot){
    for(const binding of ['DIRECTORY_MEDIA','TAX_EXEMPTION_DOCS']){
      const page=await env[binding].list();assert.equal(page.truncated,false);
      for(const item of page.objects){const o=await env[binding].get(item.key);await restored[binding].put(item.key,await o.arrayBuffer(),{customMetadata:o.customMetadata,httpMetadata:o.httpMetadata});}
    }
    const page=await env.AGAPAY_REGISTRATIONS.list();assert.equal(page.list_complete,true);
    for(const {name}of page.keys)await restored.AGAPAY_REGISTRATIONS.put(name,await env.AGAPAY_REGISTRATIONS.get(name));
    await waitLegacy(restored);state.filesSnapshot=true;save();
  }
  pass('Hashed R2 backups restored into separate central/accounting databases; files and KV isolated; ledger not restored');
  if(!state.jobId){const job=await startExport(env,{parishId,actorHash,mode:'close',requestKey:prefix+'-closure'});state.jobId=job.id;save();}
  let job=await getJob(env,parishId,state.jobId);
  if(job.status==='failed')job=await retryExport(env,parishId,job.id);
  if(job.status==='preparing')job=await processExport(env,parishId,job.id);
  if(job.status==='ready'){
    const downloaded=await downloadExport(env,parishId,job.id);const bytes=new Uint8Array(await downloaded.object.arrayBuffer());
    assert.equal(await sha256(bytes),job.archive_sha256);assert.ok(!new TextDecoder().decode(bytes).includes('synthetic-secret'));assert.ok(!new TextDecoder().decode(bytes).includes('synthetic-book-secret'));
    state.archiveSha256=job.archive_sha256;state.archiveBytes=bytes.length;save();
    await confirmClosure(env,{parishId,actorHash,jobId:job.id,archiveHash:job.archive_sha256,policyVersion:POLICY_VERSION,saved:true,confirmation:parishId});
  }
  for(let phase=0;phase<3;phase++){
    job=await getJob(env,parishId,state.jobId);
    if(job.confirmed_at)break;
    assert.equal(job.status,'preparing');assert.ok(job.confirmation_stage);
    await processExport(env,parishId,job.id);
  }
  assert.ok((await getJob(env,parishId,state.jobId)).confirmed_at);
  await assert.rejects(protectFileStorage(env).DIRECTORY_MEDIA.put('late.txt','late',{customMetadata:{agapayParishId:parishId}}));
  await assert.rejects(env.DRILL_BOOKS.prepare("INSERT INTO accounting_database_metadata(key,value) VALUES('late-write','denied')").run(),/ACCOUNTING_CLOSURE_WRITE_BLOCKED/);
  for(let attempt=0;;attempt++){
    try{job=await getJob(env,parishId,state.jobId);if(job.status==='failed')await retryExport(env,parishId,job.id);await processExport(env,parishId,job.id);break;}catch(error){if(!remote||attempt>=5||error.code!=='legacy_deletion_pending')throw error;await pause(15000);}
  }
  assert.equal((await getJob(env,parishId,state.jobId)).status,'active_data_deleted');
  await assertRestoreSafe(env);
  assert.equal(await env.DIRECTORY_MEDIA.head('directory/'+parishId+'.txt'),null);assert.ok(await env.DIRECTORY_MEDIA.head('directory/'+other+'.txt'));
  assert.equal(await env.AGAPAY_DB.prepare('SELECT id FROM directory_people WHERE id=?').bind(parishId).first(),null);
  assert.ok(await env.AGAPAY_DB.prepare('SELECT id FROM directory_people WHERE id=?').bind(other).first());
  assert.equal(await env.DRILL_BOOKS.prepare("SELECT value FROM accounting_database_metadata WHERE key='api_secret'").first(),null);
  assert.equal((await env.PARISH_EXPORTS.list()).objects.length,0);
  const retained=(await env.PARISH_RETAINED_DATA.list()).objects;assert.equal(retained.length,1);assert.equal(await (await env.PARISH_RETAINED_DATA.get(retained[0].key)).text(),'synthetic financial evidence');
  assert.ok(await env.AGAPAY_REGISTRATIONS.get('__agapay_donor__independent'));
  pass('Confirmed export/closure completed; books frozen, credentials removed, financial evidence retained, other parish preserved');
  if(!state.restoreCompleted){
    await assert.rejects(assertRestoreSafe(restored),/suppression replay/);
    const quarantined={...restored,PARISH_RESTORE_QUARANTINE:'true'};
    await replayClosureSuppressions(quarantined,evidenceSha256);
    await assert.rejects(assertRestoreSafe(restored),/suppression replay/);
    for(let attempt=0;;attempt++){
      try{await sanitizeRestoredParish(quarantined,parishId,evidenceSha256);break;}catch(error){if(!remote||attempt>=5||error.code!=='legacy_deletion_pending')throw error;await pause(15000);}
    }
    await assert.rejects(assertRestoreSafe(quarantined),/quarantined/);
    await assertRestoreSafe(restored);state.restoreCompleted=true;save();
  }
  await sanitizeRestoredParish({...restored,PARISH_RESTORE_QUARANTINE:'true'},parishId,evidenceSha256);
  await assertRestoreSafe(restored);
  assert.equal(await restored.AGAPAY_DB.prepare('SELECT id FROM directory_people WHERE id=?').bind(parishId).first(),null);
  assert.ok(await restored.AGAPAY_DB.prepare('SELECT id FROM directory_people WHERE id=?').bind(other).first());
  assert.equal(await restored.DIRECTORY_MEDIA.head('directory/'+parishId+'.txt'),null);
  assert.equal(await restored.AGAPAY_REGISTRATIONS.get('legacy-'+parishId),null);
  assert.equal(await restored.DRILL_BOOKS.prepare("SELECT value FROM accounting_database_metadata WHERE key='api_secret'").first(),null);
  pass('Old central/books/files/KV restore blocked until quarantined sanitization; repeated sanitization passes');
  state.completedAt=new Date().toISOString();state.status='passed';delete state.error;save();
  console.log(`${remote?'REMOTE STORAGE':'LOCAL'} synthetic drill passed. No hosted application deployment or production release approval. Natural expiry, public media, browser/MFA and production data reconciliation remain gates.`);
} catch(error){state.status='incomplete';state.error={code:error.code||null,message:error.message};save();throw error;}
finally {await proxy.dispose();}
