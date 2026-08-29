// Private, service-binding-only staging harness. Never part of src/worker.js.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { POLICY_VERSION, PortabilityError } from '../../src/portability/catalog.js';
import { sha256 } from '../../src/portability/archive.js';
import { getJob, publicJob, downloadExport, confirmClosure, processExport, retryExport } from '../../src/portability/service.js';
import { assertRestoreSafe } from '../../src/portability/suppression.js';
import { replayClosureSuppressions, sanitizeRestoredParish } from '../../src/portability/restore.js';
import { portabilityBudget, portabilityBudgetUsage } from '../../src/portability/budget.js';
import { sweepAccountingBackupRetention } from '../../src/accounting/backup-retention.js';
import { Buffer } from 'node:buffer';

const prefix='agapay-portability-staging-20260828';
const parishId='portability-staging-a',other='portability-staging-b';
function check(condition,label){if(!condition)throw new PortabilityError('staging_assertion_failed',label);}

export default class PortabilityStagingDrill extends WorkerEntrypoint {
  async fetch(){return new Response('Not found',{status:404});}
  async run(input) {
    check(this.env.PORTABILITY_PRIVATE_DRILL==='true' && this.env.AGAPAY_ENVIRONMENT==='staging' && this.env.PARISH_SUPPRESSION_AUTHORITY===prefix,'Wrong staging environment');
    check(/^[a-f0-9-]{36}$/.test(this.env.DRILL_JOB_ID),'Missing synthetic job');
    check(/^[a-f0-9]{64}$/.test(this.env.DRILL_EVIDENCE_SHA256),'Missing reviewed evidence');
    check(input && typeof input.action==='string','Missing action');
    const restored=input.action.startsWith('restore-');
    const base=restored?{...this.env,AGAPAY_DB:this.env.RESTORE_AGAPAY_DB,DRILL_BOOKS:this.env.RESTORE_DRILL_BOOKS,AGAPAY_REGISTRATIONS:this.env.RESTORE_AGAPAY_REGISTRATIONS,DIRECTORY_MEDIA:this.env.RESTORE_DIRECTORY_MEDIA,TAX_EXEMPTION_DOCS:this.env.RESTORE_TAX_EXEMPTION_DOCS,PARISH_EXPORTS:this.env.RESTORE_PARISH_EXPORTS}:this.env;
    const env=portabilityBudget(base);
    const jobId=this.env.DRILL_JOB_ID;
    try {
      if(!restored)await assertRestoreSafe(env);
      let result;
      switch(input.action){
        case 'status': result=publicJob(env,await getJob(env,parishId,jobId));break;
        case 'download': {
          const download=await downloadExport(env,parishId,jobId);
          const bytes=new Uint8Array(await download.object.arrayBuffer());
          check(await sha256(bytes)===download.job.archive_sha256,'Stored ZIP hash mismatch');
          check(!new TextDecoder().decode(bytes).includes('synthetic-book-secret'),'Credential in ZIP');
          result={base64:Buffer.from(bytes).toString('base64'),sha256:download.job.archive_sha256};break;
        }
        case 'refresh-backup-evidence': result=await sweepAccountingBackupRetention(env);break;
        case 'confirm': result=publicJob(env,await confirmClosure(env,{parishId,jobId,actorHash:await sha256(prefix+':synthetic-administrator'),archiveHash:input.archiveHash,policyVersion:POLICY_VERSION,saved:true,confirmation:parishId}));break;
        case 'tick': result=publicJob(env,await processExport(env,parishId,jobId));break;
        case 'retry': result=publicJob(env,await retryExport(env,parishId,jobId));break;
        case 'verify-closed': {
          const job=await getJob(env,parishId,jobId);check(job.status==='active_data_deleted','Closure is incomplete');
          await this.#verifyRemoved(env);
          check((await env.PARISH_EXPORTS.list()).objects.length===0,'Temporary ZIP remains');
          const retained=await env.PARISH_RETAINED_DATA.list();
          check(retained.objects.length===1,'Missing retained financial evidence');
          check(await (await env.PARISH_RETAINED_DATA.get(retained.objects[0].key)).text()==='synthetic financial evidence','Retained file differs');
          result={verified:true};break;
        }
        case 'restore-blocked': {
          let code;
          try{await assertRestoreSafe(env);}catch(error){code=error.code;}
          check(code==='restore_suppression_required','Old restore was not blocked');result={blocked:true};break;
        }
        case 'restore-replay': result=await replayClosureSuppressions({...env,PARISH_RESTORE_QUARANTINE:'true'},this.env.DRILL_EVIDENCE_SHA256);break;
        case 'restore-sanitize': result=await sanitizeRestoredParish({...env,PARISH_RESTORE_QUARANTINE:'true'},parishId,this.env.DRILL_EVIDENCE_SHA256);break;
        case 'restore-verify': {
          let code;try{await assertRestoreSafe({...env,PARISH_RESTORE_QUARANTINE:'true'});}catch(error){code=error.code;}
          check(code==='restore_quarantined','Quarantine did not block traffic');
          await assertRestoreSafe(env); // Only this test invocation removes quarantine.
          await this.#verifyRemoved(env);result={verified:true,quarantinePreserved:true};break;
        }
        default: throw new PortabilityError('staging_action_denied','Unknown staging action');
      }
      return JSON.stringify({ok:true,result,usage:portabilityBudgetUsage(env),versionId:this.env.DRILL_VERSION.id});
    } catch(error){return JSON.stringify({ok:false,code:error.code || 'staging_operation_failed',message:error instanceof PortabilityError?error.message:'The private staging operation failed.',usage:portabilityBudgetUsage(env),versionId:this.env.DRILL_VERSION.id});}
  }

  async #verifyRemoved(env){
    check(!await env.AGAPAY_DB.prepare('SELECT id FROM directory_people WHERE id=?').bind(parishId).first(),'Closed parish person remains');
    check(await env.AGAPAY_DB.prepare('SELECT id FROM directory_people WHERE id=?').bind(other).first(),'Other parish person missing');
    check(!await env.DIRECTORY_MEDIA.head('directory/'+parishId+'.txt'),'Closed parish file remains');
    check(await env.DIRECTORY_MEDIA.head('directory/'+other+'.txt'),'Other parish file missing');
    check(!await env.AGAPAY_REGISTRATIONS.get('legacy-'+parishId),'Closed legacy key remains');
    check(await env.AGAPAY_REGISTRATIONS.get('legacy-'+other),'Other legacy key missing');
    check(await env.AGAPAY_REGISTRATIONS.get('__agapay_donor__independent'),'Independent donor removed');
    check(!await env.DRILL_BOOKS.prepare("SELECT value FROM accounting_database_metadata WHERE key='api_secret'").first(),'Accounting credential remains');
    let frozen=false;
    try{await env.DRILL_BOOKS.prepare("INSERT INTO accounting_database_metadata(key,value) VALUES('hosted-late-write','denied')").run();}catch(error){frozen=String(error.message).includes('ACCOUNTING_CLOSURE_WRITE_BLOCKED');}
    check(frozen,'Accounting late write was not blocked');
  }
}
