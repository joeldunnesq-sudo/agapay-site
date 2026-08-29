// --configure only writes local configs. --run uses the private deployed RPC
// Worker; every action is a distinct hosted invocation with native D1/R2/KV.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {getPlatformProxy} from 'wrangler';
import {sha256} from '../src/portability/archive.js';
import {POLICY_VERSION} from '../src/portability/catalog.js';
import {RETENTION_DISCLOSURE_VERSION} from '../src/portability/policy.js';

assert.ok(['--configure','--run'].includes(process.argv[2]),'Use --configure or --run');
const dir=path.resolve('artifacts/portability-staging');
const base=JSON.parse(readFileSync(path.join(dir,'wrangler.json'),'utf8'));
const resources=JSON.parse(readFileSync(path.join(dir,'resources.json'),'utf8'));
const prior=JSON.parse(readFileSync(path.join(dir,'remote-drill-state.json'),'utf8'));
const audit=JSON.parse(readFileSync(path.join(dir,'schema-audit.json'),'utf8'));
const prefix='agapay-portability-staging-20260828',name=prefix+'-drill';
const evidenceSha256=await sha256(JSON.stringify({audit,resources}));
assert.equal(prior.evidenceSha256,evidenceSha256);
assert.equal(base.name,prefix);assert.equal(resources.prefix,prefix);
assert.equal(base.workers_dev,false);assert.equal(base.preview_urls,false);
assert.ok(!base.main&&!base.routes&&!base.services&&!base.assets&&!base.browser);
assert.deepEqual(base.triggers.crons,[]);
assert.equal(base.d1_databases.length,4);assert.equal(base.kv_namespaces.length,2);assert.equal(base.r2_buckets.length,9);
const protectedIds=new Set([...readFileSync('wrangler.toml','utf8').matchAll(/(?:database_id|\bid)\s*=\s*"([a-f0-9-]+)"/g)].map(m=>m[1]));
for(const r of base.d1_databases){assert.equal(r.database_id,resources.d1[r.binding].id);assert.equal(r.database_name,resources.d1[r.binding].name);assert.ok(r.database_name.includes('staging')&&r.database_name.includes('portability'));assert.ok(!protectedIds.has(r.database_id));}
for(const r of base.kv_namespaces){assert.equal(r.id,resources.kv[r.binding].id);assert.ok(resources.kv[r.binding].name.startsWith(prefix+'-'));assert.ok(!protectedIds.has(r.id));}
for(const r of base.r2_buckets){assert.equal(r.bucket_name,resources.r2[r.binding].name);assert.ok(r.bucket_name.startsWith(prefix+'-'));assert.match(resources.safeguards[r.binding].publicAccess,/Public access via the r2\.dev URL is disabled/);assert.match(resources.safeguards[r.binding].domains,/There are no custom domains/);}
assert.ok(prior.centralSnapshot&&prior.bookSnapshot&&prior.filesSnapshot&&prior.lockTested);
assert.ok(!existsSync(path.join(dir,'natural-expiry-state.json')),'Do not contaminate a natural-expiry observation');
const config={...base,name,main:path.resolve('scripts/fixtures/portability-staging-worker.js'),routes:[],version_metadata:{binding:'DRILL_VERSION'},vars:{...base.vars,PORTABILITY_PRIVATE_DRILL:'true',DRILL_JOB_ID:prior.jobId,DRILL_EVIDENCE_SHA256:evidenceSha256,PARISH_PORTABILITY_ENABLED:'true',PARISH_STORAGE_GUARDS_ENABLED:'true',PARISH_AUTOMATIC_CLOSURE_ENABLED:'true',PARISH_RETENTION_DISCLOSURE_APPROVED:RETENTION_DISCLOSURE_VERSION,ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED:'true',ACCOUNTING_BACKUP_RETENTION_DAYS:'1',PARISH_SUPPRESSION_AUTHORITY:prefix,PARISH_BACKUP_EXPIRY_VERIFIED:POLICY_VERSION,PARISH_LEGACY_INVENTORY_VERIFIED:POLICY_VERSION,ACCOUNTING_DATABASE_BINDINGS:JSON.stringify({[resources.d1.DRILL_BOOKS.name]:'DRILL_BOOKS'})}};
for(const key of ['d1_databases','kv_namespaces','r2_buckets'])config[key]=config[key].map(({remote,...binding})=>binding);
const operator={name:prefix+'-operator',account_id:base.account_id,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags,workers_dev:false,preview_urls:false,services:[{binding:'DRILL',service:name,remote:true}]};
const configPath=path.join(dir,'hosted-worker.json'),operatorPath=path.join(dir,'hosted-operator.json');
if(process.argv[2]==='--configure'){
  writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');writeFileSync(operatorPath,JSON.stringify(operator,null,2)+'\n');
  console.log('Wrote private staging Worker and service-only operator configs. No deployment performed.');process.exit(0);
}
assert.deepEqual(JSON.parse(readFileSync(configPath,'utf8')),config,'Review/reconfigure changed hosted bindings');
assert.deepEqual(JSON.parse(readFileSync(operatorPath,'utf8')),operator);
const statePath=path.join(dir,'hosted-drill-state.json');
const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{startedAt:new Date().toISOString(),evidenceSha256,worker:name,jobId:prior.jobId,actions:[]};
assert.equal(state.evidenceSha256,evidenceSha256);assert.equal(state.jobId,prior.jobId);
const save=()=>writeFileSync(statePath,JSON.stringify(state,null,2)+'\n');
const proxy=await getPlatformProxy({configPath:operatorPath,envFiles:[],remoteBindings:true,persist:false});
async function call(action,extra={}){
  const response=JSON.parse(await proxy.env.DRILL.run({action,...extra}));
  state.actions.push({action,at:new Date().toISOString(),ok:response.ok,usage:response.usage,versionId:response.versionId,...(!response.ok?{code:response.code}:{})});save();
  if(!response.ok){const error=new Error(response.message);error.code=response.code;throw error;}
  assert.ok(response.usage.operations<=800,'Hosted successful phase exceeded work budget');
  console.log(`PASS - hosted ${action}: ${response.usage.operations} operations`);
  return response.result;
}
try {
  await call('refresh-backup-evidence');
  let job=await call('status');
  if(job.status==='failed'){await call('retry');job=await call('status');}
  if(job.status==='preparing'){await call('tick');job=await call('status');}
  if(job.status==='ready'){
    const download=await call('download');const bytes=new Uint8Array(Buffer.from(download.base64,'base64'));
    assert.equal(await sha256(bytes),download.sha256);assert.equal(download.sha256,job.archiveSha256);
    writeFileSync(path.join(dir,'hosted-verified-synthetic-export.zip'),bytes);
    state.archiveSha256=download.sha256;save();
    await call('confirm',{archiveHash:download.sha256});
  }
  for(let i=0;i<8;i++){
    job=await call('status');if(job.status==='active_data_deleted')break;
    if(job.status==='failed')await call('retry');
    try{await call('tick');}catch(error){if(error.code!=='legacy_deletion_pending')throw error;await new Promise(resolve=>setTimeout(resolve,15000));}
  }
  await call('verify-closed');state.closureVerified=true;save();
  if(!state.restoreReplayed){await call('restore-blocked');await call('restore-replay');state.restoreReplayed=true;save();await call('restore-blocked');}
  async function sanitize(){
    for(let attempt=0;;attempt++){
      try{return await call('restore-sanitize');}catch(error){if(!['legacy_changed','legacy_not_converged','legacy_deletion_pending'].includes(error.code)||attempt>=7)throw error;await new Promise(resolve=>setTimeout(resolve,15000));}
    }
  }
  await sanitize();await call('restore-verify');await sanitize();await call('restore-verify');
  state.status='passed';state.hostedInvocationCertified=true;state.completedAt=new Date().toISOString();delete state.error;save();
  console.log('Private hosted staging export/closure/restore drill passed. Production remains disabled.');
}catch(error){state.status='incomplete';state.error={code:error.code||null,message:error.message};save();throw error;}
finally{await proxy.dispose();}
