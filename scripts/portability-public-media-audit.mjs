// Read-only production public-media exposure evidence. Default is a plan.
// --read-only checks provider r2.dev/custom-domain status and HEADs only the
// three inventoried public objects at their active delivery surface; raw keys
// are never printed or persisted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/portability/archive.js';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'artifacts/portability-staging');
const proposalPath=path.join(dir,'production-storage-registry-proposal.json'),reportPath=path.join(dir,'production-public-media-audit.json');
const targets={CAMPAIGN_ASSETS:{bucket:'agapay-campaign-assets',base:'https://pub-a8aecb95751f49ac9b078c3e3ed378b8.r2.dev',route:'campaign'},ANNOUNCEMENT_ASSETS:{bucket:'agapay-announcement-assets',base:'https://pub-b0974d02d1bf41288b3082849e87f676.r2.dev',route:'announcement'},TEACHING_ASSETS:{bucket:'agapay-teaching-assets',base:'https://pub-b6fa9c48d8be43bebaacef7f7ba448e4.r2.dev',route:'teaching'}};
if(process.argv.length===2){console.log(JSON.stringify({mode:'plan',command:'node scripts/portability-public-media-audit.mjs --read-only',checks:['r2.dev status','custom domains','inventoried object HEAD at active delivery surface'],objectBodies:false,writes:false},null,2));process.exit(0);}
assert.deepEqual(process.argv.slice(2),['--read-only']);
const proposal=JSON.parse(readFileSync(proposalPath,'utf8'));assert.equal(proposal.status,'verified_ready_for_registry_review');
function wrangler(args){const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(result.status!==0)throw new Error('Public media metadata check failed');return result.stdout.replace(/\x1b\[[0-9;]*m/g,'');}
const provider={},heads=[];
for(const [binding,target] of Object.entries(targets)){
  const dev=wrangler(['r2','bucket','dev-url','get',target.bucket]);
  const domains=wrangler(['r2','bucket','domain','list',target.bucket]);
  const r2DevEnabled=dev.includes(`Public access is enabled at '${target.base}'`),r2DevDisabled=dev.includes('Public access via the r2.dev URL is disabled.');
  assert.notEqual(r2DevEnabled,r2DevDisabled,'R2 public origin state is ambiguous');
  provider[binding]={r2DevEnabled,r2DevDisabled,customDomains:Number(domains.match(/There are no custom domains/) ? 0 : -1),devStatusSha256:await sha256(dev),domainStatusSha256:await sha256(domains)};
  for(const object of proposal.objects.filter(item=>item.binding===binding)){
    const encoded=object.objectKey.split('/').map(encodeURIComponent).join('/');
    const url=r2DevEnabled?target.base+'/'+encoded:`https://agapay.app/api/public/parish-assets/${target.route}/${encoded}`;
    const response=await fetch(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15000)});
    heads.push({binding,surface:r2DevEnabled?'r2_dev':'worker',status:response.status,cacheControl:String(response.headers.get('cache-control')||''),etagMatches:r2DevEnabled?response.headers.get('etag')?.replaceAll('"','')===object.etag:null,urlSha256:await sha256(url)});
  }
}
const core={provider,objectsChecked:heads.length,reachable:heads.filter(item=>item.status===200).length,immutableYearCache:heads.filter(item=>/public.*max-age=31536000.*immutable/i.test(item.cacheControl)).length,noStore:heads.filter(item=>/no-store/i.test(item.cacheControl)).length,etagMatches:heads.filter(item=>item.etagMatches).length,headEvidenceSha256:await sha256(JSON.stringify(heads))};
const allEnabled=Object.values(provider).every(item=>item.r2DevEnabled&&!item.r2DevDisabled&&item.customDomains===0),allDisabled=Object.values(provider).every(item=>item.r2DevDisabled&&!item.r2DevEnabled&&item.customDomains===0);
const status=allEnabled&&core.reachable===heads.length&&core.etagMatches===heads.length?'blocked_r2_dev_public':allDisabled&&core.reachable===heads.length&&core.noStore===heads.length?'verified_worker_only':'unexpected_provider_state';
mkdirSync(dir,{recursive:true});writeFileSync(reportPath,JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,objectBodiesRead:false,providerWrites:false,status,...core},null,2)+'\n');
console.log(JSON.stringify({status,objectsChecked:core.objectsChecked,reachable:core.reachable,immutableYearCache:core.immutableYearCache,noStore:core.noStore,etagMatches:core.etagMatches,r2DevEnabled:Object.values(provider).filter(item=>item.r2DevEnabled).length,r2DevDisabled:Object.values(provider).filter(item=>item.r2DevDisabled).length,customDomains:0,writes:false},null,2));
if(!['blocked_r2_dev_public','verified_worker_only'].includes(status))process.exitCode=2;
