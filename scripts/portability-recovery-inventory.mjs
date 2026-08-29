// Read-only inventory of repository-visible recovery copies and D1 Time Travel.
// Manual/off-provider copies cannot be discovered and remain an explicit gate.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/portability/archive.js';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'artifacts/portability-staging'),outPath=path.join(dir,'production-recovery-inventory.json');
if(process.argv.length===2){console.log(JSON.stringify({mode:'plan',command:'node scripts/portability-recovery-inventory.mjs --read-only',checks:['30 recent backup runs','all current GitHub artifacts','D1 Time Travel at 7/29/31 days','existing R2 lifecycle evidence'],restores:false,writes:false},null,2));process.exit(0);}
assert.deepEqual(process.argv.slice(2),['--read-only']);
function command(exe,args){const r=spawnSync(exe,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});return{ok:r.status===0,stdout:String(r.stdout||''),stderr:String(r.stderr||'')}}
const runs=JSON.parse(command('gh',['run','list','--workflow','Production D1 backup','--limit','30','--json','databaseId,status,conclusion,createdAt,updatedAt,headSha']).stdout);
const artifacts=[];for(let page=1;page<=4;page++){const r=command('gh',['api',`repos/joeldunnesq-sudo/agapay-site/actions/artifacts?per_page=100&page=${page}`]);assert.ok(r.ok);const body=JSON.parse(r.stdout);artifacts.push(...body.artifacts);if(body.artifacts.length<100)break;}
const backupArtifacts=artifacts.filter(item=>/(?:^|[-_])(backup|d1|database|sql)(?:[-_.]|$)/i.test(item.name));
const bin=path.join(root,'node_modules/wrangler/bin/wrangler.js'),dbs={central:'agapay-production',accounting:'agapay-acct-production-4ab22bac06dca8b80e70'},checks=[];
for(const [kind,database] of Object.entries(dbs))for(const days of [7,29,31]){const timestamp=new Date(Date.now()-days*86400000).toISOString();const r=command(process.execPath,[bin,'d1','time-travel','info',database,'--timestamp',timestamp,'--json']);checks.push({kind,days,available:r.ok,responseSha256:await sha256((r.ok?r.stdout:r.stderr).replace(/bookmark[^\n]*/ig,'bookmark:[redacted]'))});}
const backup=JSON.parse(readFileSync(path.join(dir,'production-backup-lifecycle.json'),'utf8'));
const core={recentRuns:runs.length,recentSuccessful:runs.filter(run=>run.status==='completed'&&run.conclusion==='success').length,oldestRecentRun:runs.at(-1)?.createdAt||null,newestRecentRun:runs[0]?.createdAt||null,currentGithubArtifacts:artifacts.length,githubDatabaseBackupArtifacts:backupArtifacts.length,timeTravel:checks,r2BackupObjects:backup.core.objectsScanned,r2RetentionDays:backup.core.retentionDays,r2LifecycleApplied:backup.status==='applied_and_verified',manualOrOffProviderCopiesVerified:false,naturalLifecycleObserved:false};
const status=core.githubDatabaseBackupArtifacts||!checks.filter(c=>c.days<=29).every(c=>c.available)||checks.filter(c=>c.days===31).some(c=>c.available)?'unexpected_recovery_state':'blocked_manual_copy_and_natural_expiry';
mkdirSync(dir,{recursive:true});writeFileSync(outPath,JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,restoresPerformed:false,status,...core,evidenceSha256:await sha256(JSON.stringify(core))},null,2)+'\n');
console.log(JSON.stringify({status,recentRuns:core.recentRuns,recentSuccessful:core.recentSuccessful,currentGithubArtifacts:core.currentGithubArtifacts,githubDatabaseBackupArtifacts:core.githubDatabaseBackupArtifacts,timeTravel:checks.map(({kind,days,available})=>({kind,days,available})),r2BackupObjects:core.r2BackupObjects,manualOrOffProviderCopiesVerified:false,naturalLifecycleObserved:false,writes:false},null,2));
if(status==='unexpected_recovery_state')process.exitCode=2;
