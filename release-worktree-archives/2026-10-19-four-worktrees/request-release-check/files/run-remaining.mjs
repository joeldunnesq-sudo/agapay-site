import {testGroups} from './scripts/test-manifest.mjs';import{spawnSync}from'node:child_process';import fs from'node:fs';
const start=testGroups.all.indexOf('scripts/meta-referral-tracking-tests.mjs');const failed=[];
for(const spec of testGroups.all.slice(start)){const args=spec.startsWith('node-check:')?['--check',spec.slice(11)]:spec.split(' ');const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:20e6});fs.appendFileSync('remaining-tests.log',`\n${spec}\n${r.stdout}\n${r.stderr}`);if(r.status!==0){failed.push(spec);console.log('FAIL',spec,r.stderr?.slice(-800));}else console.log('PASS',spec);}
fs.writeFileSync('failed-tests.json',JSON.stringify(failed));console.log('Remaining failures',failed);process.exit(failed.length?1:0);
