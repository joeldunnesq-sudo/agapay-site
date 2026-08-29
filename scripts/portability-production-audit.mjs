// Fixed-scope, read-only production audit. Default prints the plan. --read-only
// executes aggregate/schema/identity metadata queries and writes only hashes/counts.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../src/portability/archive.js';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'artifacts/portability-staging');
const central='agapay-production',books='agapay-acct-production-4ab22bac06dca8b80e70';
const policyVersion='2026-08-28-active-storage-v2',authorityId='25a7aefe-a931-456b-ac59-62d538428e9a';
const privateBuckets={PARISH_EXPORTS:'agapay-parish-exports',PARISH_RETAINED_DATA:'agapay-parish-retained-data',PARISH_CLOSURE_LEDGER:'agapay-parish-closure-ledger'};
const legacy=`registrations donors donor_offerings commemorations app_settings stripe_events learn_households learn_children learn_school_years learn_terms learn_liturgical_days learn_household_streams learn_child_tracks learn_lesson_days learn_household_lesson_blocks learn_child_lesson_blocks learn_church_rhythm_practices learn_narration_logs learn_books learn_book_assignments learn_cycle_frameworks learn_cycle_years learn_cycle_topics learn_curriculum_packages learn_household_pace_profiles learn_season_adjustments learn_print_templates learn_print_jobs learn_report_cards learn_transcripts learn_academic_records`.split(' ');
if(process.argv[2]!=='--read-only'){
  console.log(JSON.stringify({mode:'read-only',central,books,checks:['production flags','central registry identity hash','book identity hash','31 aggregate legacy table counts','portability schema/registries/barriers','backup lifecycle readback','private portability bucket safeguards'],rowContents:false,writes:false},null,2));process.exit(0);
}
assert.equal(process.argv.length,3);
const config=readFileSync(path.join(root,'wrangler.toml'),'utf8');
assert.match(config,new RegExp(`database_name = "${central}"[\\s\\S]{0,120}database_id = "24f514a6-6904-425b-a4c8-b3584b23c0be"`));
assert.match(config,new RegExp(`database_name = "${books}"[\\s\\S]{0,120}database_id = "7d3a6a59-f622-4303-9e84-e1074879d11d"`));
for(const flag of ['PARISH_PORTABILITY_ENABLED','PARISH_STORAGE_GUARDS_ENABLED','PARISH_AUTOMATIC_CLOSURE_ENABLED','ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED']){
  const values=[...config.matchAll(new RegExp(`^${flag} = "([^"]+)"`,'gm'))].map(m=>m[1]);assert.ok(values.length&&values.every(value=>value==='false'),flag+' must remain false');
}
function cli(args){
  const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  if(result.status!==0)throw new Error('Read-only production audit command failed');
  return result.stdout.replace(/\x1b\[[0-9;]*m/g,'');
}
function d1(database,command){
  const values=JSON.parse(cli(['d1','execute',database,'--remote','--command',command,'--json']));
  assert.ok(Array.isArray(values)&&values.every(item=>item.success&&item.meta?.changes===0&&item.meta?.rows_written===0&&item.meta?.changed_db===false));return values;
}
const centralRows=d1(central,`SELECT e.parish_id,d.database_identifier FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id WHERE d.database_identifier='${books}' AND d.environment='production'; SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('parish_portability_jobs','parish_portability_steps','parish_portability_leases','parish_data_closures','parish_portability_objects','parish_portability_legacy_keys','parish_portability_storage_operations','parish_portability_retention','parish_portability_inventory_reviews'); SELECT (SELECT count(*) FROM parish_portability_objects) objects,(SELECT count(*) FROM parish_portability_legacy_keys) legacy_keys,(SELECT count(*) FROM parish_portability_inventory_reviews) reviews,(SELECT count(*) FROM parish_portability_jobs) jobs,(SELECT count(*) FROM parish_data_closures) closures; SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'portability_%';`);
assert.equal(centralRows[0].results.length,1,'Production accounting registry identity is ambiguous');
assert.equal(Number(centralRows[1].results[0].n),9,'Production portability schema is incomplete');
assert.deepEqual(centralRows[2].results,[{objects:26,legacy_keys:18,reviews:3,jobs:0,closures:0}],'Production portability registries or control state changed');
assert.equal(Number(centralRows[3].results[0].n),441,'Production closure write barriers are incomplete');
const statements=["SELECT value FROM accounting_database_metadata WHERE key='parish_id'",...legacy.map(name=>`SELECT count(*) n FROM "${name}"`)];
const bookRows=d1(books,statements.join(';')+';');
assert.equal(bookRows.length,statements.length);
const bookIdentity=bookRows[0].results.length===1?bookRows[0].results[0].value:null;
const identityMatches=bookIdentity!=null&&bookIdentity===centralRows[0].results[0].parish_id;
const counts=Object.fromEntries(legacy.map((name,index)=>[name,Number(bookRows[index+1].results[0].n)]));
assert.ok(Object.values(counts).every(count=>count===0),'A production legacy accounting remnant contains data');
const lifecycle=cli(['r2','bucket','lifecycle','list','agapay-accounting-backups']);
const backupObjectExpiryPresent=/action:\s*(?:Delete|Expire)(?! incomplete)/i.test(lifecycle);
const privateReadbacks={};
for(const [binding,bucket] of Object.entries(privateBuckets)){
  const devUrl=cli(['r2','bucket','dev-url','get',bucket]),domains=cli(['r2','bucket','domain','list',bucket]);
  privateReadbacks[binding]={devUrlDisabled:/r2\.dev URL is disabled/i.test(devUrl),noCustomDomains:/no custom domains/i.test(domains),devUrlSha256:await sha256(devUrl),domainsSha256:await sha256(domains)};
}
const exportLifecycle=cli(['r2','bucket','lifecycle','list',privateBuckets.PARISH_EXPORTS]);
const exportExpiryPresent=exportLifecycle.includes('name:     AGAPAY seven-day temporary export expiry')&&/prefix:\s+parish-exports\//.test(exportLifecycle)&&/Expire objects after 7 days/.test(exportLifecycle);
const closureLocks=cli(['r2','bucket','lock','list',privateBuckets.PARISH_CLOSURE_LEDGER]);
const requiredLocks=[['AGAPAY immutable portability authority','authority.json'],['AGAPAY immutable closure authorizations','closures/'],['AGAPAY immutable closure completions','completions/']];
const closureLocksPresent=requiredLocks.every(([name,prefix])=>closureLocks.includes(`name:       ${name}`)&&closureLocks.includes(`prefix:     ${prefix}`))&&(closureLocks.match(/condition:\s+indefinitely/g)||[]).length>=3;
mkdirSync(dir,{recursive:true});
const authorityPath=path.join(dir,'.production-authority-audit.json');rmSync(authorityPath,{force:true});
cli(['r2','object','get',`${privateBuckets.PARISH_CLOSURE_LEDGER}/authority.json`,'--file',authorityPath,'--remote']);
assert.ok(existsSync(authorityPath),'Production closure authority could not be read');
const authority=JSON.parse(readFileSync(authorityPath,'utf8'));rmSync(authorityPath,{force:true});
const authorityMatches=authority.id===authorityId&&authority.policyVersion===policyVersion;
mkdirSync(dir,{recursive:true});
const privateStorageReady=Object.values(privateReadbacks).every(value=>value.devUrlDisabled&&value.noCustomDomains)&&exportExpiryPresent&&closureLocksPresent&&authorityMatches;
const releaseGate=!identityMatches?'blocked_missing_independent_book_identity':!backupObjectExpiryPresent?'blocked_missing_backup_object_expiry':!privateStorageReady?'blocked_missing_private_storage_safeguards':'passed_scoped_checks_only';
const report={checkedAt:new Date().toISOString(),readOnly:true,parishPayloadRowsRead:false,identityMetadataRead:true,productionFlagsFalse:true,centralRegistryIdentitySha256:await sha256(books+':'+centralRows[0].results[0].parish_id),bookIdentityPresent:bookIdentity!=null,centralRegistryMatchesBookIdentity:identityMatches,...(bookIdentity!=null?{bookIdentitySha256:await sha256(books+':'+bookIdentity)}:{}),portabilityTablesPresent:true,portabilityTableCount:9,ownershipObjects:26,legacyOwnershipKeys:18,inventoryReviews:3,portabilityJobs:0,activeClosures:0,writeBarrierTriggers:441,legacyTablesChecked:legacy.length,legacyCounts:counts,allLegacyTablesEmpty:true,backupLifecycleSha256:await sha256(lifecycle),backupLifecycleReadback:lifecycle,backupObjectExpiryPresent,privateReadbacks,exportLifecycleSha256:await sha256(exportLifecycle),exportExpiryPresent,closureLocksSha256:await sha256(closureLocks),closureLocksPresent,authoritySha256:await sha256(JSON.stringify(authority)),authorityMatches,privateStorageReady,releaseGate};
writeFileSync(path.join(dir,'production-readiness-audit.json'),JSON.stringify(report,null,2)+'\n');
assert.ok(identityMatches,'Production accounting book identity needs independent verification before any metadata write');
assert.ok(backupObjectExpiryPresent,'Production backup bucket needs an object-expiration lifecycle rule');
assert.ok(privateStorageReady,'Production private portability storage safeguards are incomplete');
console.log(`PASS - scoped read-only production audit: identity mapping matches, ${legacy.length} legacy tables are empty, 26 R2 and 18 KV ownership rows plus 441 barriers are present, portability flags are off, backup expiry is configured, and all three private portability buckets are safeguarded. Other release gates remain.`);
