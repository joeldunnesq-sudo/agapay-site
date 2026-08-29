// Read-only verification of inventoried public R2 objects through Worker URLs.
// Raw keys are used only in memory and are never printed or persisted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root=path.resolve('.'),proposalPath=path.join(root,'artifacts/portability-staging/production-storage-registry-proposal.json');
const policyVersion='2026-08-28-active-storage-v2';
const routes={CAMPAIGN_ASSETS:'campaign',ANNOUNCEMENT_ASSETS:'announcement',TEACHING_ASSETS:'teaching'};
if(process.argv[2]!=='--read-only'){
  console.log(JSON.stringify({mode:'plan',checks:['fresh ownership proposal','all inventoried public objects through Worker','HEAD status','no-store','content length'],rawKeysPersisted:false,writes:false},null,2));process.exit(0);
}
assert.equal(process.argv.length,3);
const config=readFileSync(path.join(root,'wrangler.toml'),'utf8');
assert.match(config,new RegExp(`PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED = "${policyVersion}"`));
assert.match(config,new RegExp(`^PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED = "${policyVersion}"`,'m'));
const proposal=JSON.parse(readFileSync(proposalPath,'utf8'));
assert.ok(Date.now()-Date.parse(proposal.checkedAt)<=30*60*1000,'Ownership proposal is older than 30 minutes; inventory again');
assert.equal(proposal.issues.length,0);
const objects=proposal.objects.filter(item=>routes[item.binding]);
assert.equal(objects.length,3,'Expected exactly three inventoried public objects');
const results=[];
for(const object of objects){
  const encoded=object.objectKey.split('/').map(encodeURIComponent).join('/');
  const response=await fetch(`https://agapay.app/api/public/parish-assets/${routes[object.binding]}/${encoded}`,{method:'HEAD',headers:{'Cache-Control':'no-cache'}});
  results.push({binding:object.binding,status:response.status,noStore:response.headers.get('cache-control')==='no-store',bytes:Number(response.headers.get('content-length'))});
}
assert.ok(results.every(result=>result.status===200&&result.noStore&&Number.isSafeInteger(result.bytes)&&result.bytes>=0),'Worker media verification failed');
const counts=Object.fromEntries(Object.keys(routes).map(binding=>[binding,results.filter(result=>result.binding===binding).length]));
console.log(JSON.stringify({status:'worker_delivery_verified',objectsChecked:results.length,bindingCounts:counts,status200:results.filter(result=>result.status===200).length,noStore:results.filter(result=>result.noStore).length,rawKeysPersisted:false,writes:false},null,2));
