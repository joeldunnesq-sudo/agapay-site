// Explicit remote provisioning, never a deployment. Default prints the plan.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'artifacts/portability-staging');
const prefix='agapay-portability-staging-20260828';
const d1={AGAPAY_DB:prefix+'-central',RESTORE_AGAPAY_DB:prefix+'-restore',DRILL_BOOKS:'agapay-acct-staging-portability-20260828',RESTORE_DRILL_BOOKS:'agapay-acct-staging-portability-restore-20260828'};
const kv={AGAPAY_REGISTRATIONS:prefix+'-kv',RESTORE_AGAPAY_REGISTRATIONS:prefix+'-restore-kv'};
const r2={PARISH_EXPORTS:prefix+'-exports',PARISH_RETAINED_DATA:prefix+'-retained',PARISH_CLOSURE_LEDGER:prefix+'-ledger',ACCOUNTING_BACKUPS:prefix+'-backups',DIRECTORY_MEDIA:prefix+'-media',TAX_EXEMPTION_DOCS:prefix+'-financial',RESTORE_PARISH_EXPORTS:prefix+'-restore-exports',RESTORE_DIRECTORY_MEDIA:prefix+'-restore-media',RESTORE_TAX_EXEMPTION_DOCS:prefix+'-restore-financial'};
if(process.argv[2]!=='--create') { console.log(JSON.stringify({d1,kv,r2,deploy:false,productionChanges:false},null,2)); process.exit(0); }
mkdirSync(dir,{recursive:true});
const audit=JSON.parse(readFileSync(path.join(dir,'schema-audit.json'),'utf8'));
assert.equal(audit.dataCopied,false);
for(const schema of audit.schemas) assert.equal(createHash('sha256').update(readFileSync(path.join(dir,schema.kind+'-baseline.sql'))).digest('hex'),schema.baselineSha256);
const manifestPath=path.join(dir,'resources.json');
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{prefix,createdAt:new Date().toISOString(),d1:{},kv:{},r2:{},safeguards:{}};
assert.equal(manifest.prefix,prefix);
function save(){writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
function cli(args){
  const r=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  if(r.status!==0) throw new Error(`${args.slice(0,4).join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout.replace(/\x1b\[[0-9;]*m/g,'');
}
for(const [binding,name] of Object.entries(d1)) {
  if(manifest.d1[binding]) {assert.equal(manifest.d1[binding].name,name);continue;}
  const output=cli(['d1','create',name,'--update-config=false']);
  const id=output.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
  assert.ok(id,output);manifest.d1[binding]={name,id};save();console.log('Created isolated D1 '+name);
}
for(const [binding,name] of Object.entries(kv)) {
  if(manifest.kv[binding]) {assert.equal(manifest.kv[binding].name,name);continue;}
  const output=cli(['kv','namespace','create',name,'--update-config=false']);
  const id=output.match(/["']?id["']?\s*[:=]\s*["']([a-f0-9]{32})["']/i)?.[1];
  assert.ok(id,output);manifest.kv[binding]={name,id};save();console.log('Created isolated KV '+name);
}
for(const [binding,name] of Object.entries(r2)) {
  if(!manifest.r2[binding]) {cli(['r2','bucket','create',name]);manifest.r2[binding]={name};save();console.log('Created isolated R2 '+name);}
  assert.equal(manifest.r2[binding].name,name);
  if(!manifest.safeguards[binding]) {
    cli(['r2','bucket','dev-url','disable',name]);
    const publicAccess=cli(['r2','bucket','dev-url','get',name]);
    const domains=cli(['r2','bucket','domain','list',name]);
    manifest.safeguards[binding]={checkedAt:new Date().toISOString(),publicAccess,domains};save();
  }
}
const ledger=r2.PARISH_CLOSURE_LEDGER;
for(const [id,objectPrefix] of [['authority','authority.json'],['closures','closures/'],['completions','completions/']]) {
  if(!manifest.safeguards['lock-'+id]) {cli(['r2','bucket','lock','add',ledger,'portability-'+id,objectPrefix,'--retention-indefinite','--force']);manifest.safeguards['lock-'+id]=true;save();}
}
for(const [binding,days,objectPrefix] of [['PARISH_EXPORTS',7,'parish-exports/'],['RESTORE_PARISH_EXPORTS',7,'parish-exports/'],['ACCOUNTING_BACKUPS',1,'trial/']]) {
  if(!manifest.safeguards['expiry-'+binding]) {cli(['r2','bucket','lifecycle','add',r2[binding],'portability-expiry',objectPrefix,'--expire-days',String(days),'--force']);manifest.safeguards['expiry-'+binding]=true;save();}
}
manifest.safeguards.ledgerLocks=cli(['r2','bucket','lock','list',ledger]);
manifest.safeguards.exportLifecycle=cli(['r2','bucket','lifecycle','list',r2.PARISH_EXPORTS]);
manifest.safeguards.backupLifecycle=cli(['r2','bucket','lifecycle','list',r2.ACCOUNTING_BACKUPS]);save();
const config={name:prefix,account_id:'9198ae5ea8adc59e5dedd1b09c9478b9',compatibility_date:'2026-05-25',compatibility_flags:['nodejs_compat'],workers_dev:false,preview_urls:false,
  vars:{AGAPAY_ENVIRONMENT:'staging',PARISH_PORTABILITY_ENABLED:'false',PARISH_STORAGE_GUARDS_ENABLED:'false',PARISH_AUTOMATIC_CLOSURE_ENABLED:'false',ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED:'false'},
  d1_databases:Object.entries(manifest.d1).map(([binding,r])=>({binding,database_name:r.name,database_id:r.id,remote:true})),
  kv_namespaces:Object.entries(manifest.kv).map(([binding,r])=>({binding,id:r.id,remote:true})),
  r2_buckets:Object.entries(manifest.r2).map(([binding,r])=>({binding,bucket_name:r.name,remote:true})),triggers:{crons:[]}};
writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify(config,null,2)+'\n');
console.log('Private isolated resources configured. No Worker deployed; feature flags remain off. Resource IDs and safeguard readbacks saved locally.');
