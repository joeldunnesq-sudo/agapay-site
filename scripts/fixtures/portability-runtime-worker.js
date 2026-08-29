// LOCAL TEST ENTRYPOINT ONLY. Never deploy or import from src/worker.js.
// Miniflare supplies ephemeral bindings and a per-run random capability token.
import { POLICY_VERSION, inspectStorage } from '../../src/portability/catalog.js';
import { barrierStatements } from '../../src/portability/closure.js';
import { protectFileStorage } from '../../src/portability/storage.js';
import { protectLegacyStorage } from '../../src/portability/legacy.js';
import { assertRestoreSafe } from '../../src/portability/suppression.js';
import { replayClosureSuppressions, sanitizeRestoredParish } from '../../src/portability/restore.js';
import { startExport, processExport, getJob, downloadExport, confirmClosure, cancelExport } from '../../src/portability/service.js';
import { sweepAccountingBackupRetention } from '../../src/accounting/backup-retention.js';

const parishId = 'parish-a';
const actorHash = 'synthetic-runtime-administrator';
const evidenceSha256 = 'b'.repeat(64); // Synthetic evidence, never a production attestation.

export default {
  async fetch(request, bindings) {
    if (bindings.PORTABILITY_LOCAL_DRILL !== 'true' || !bindings.DRILL_TOKEN || request.headers.get('authorization') !== `Bearer ${bindings.DRILL_TOKEN}`) return new Response('Not found', { status: 404 });
    const input = await request.json();
    const env = { ...bindings };
    if (input.target === 'restore') {
      for (const name of ['AGAPAY_DB','AGAPAY_REGISTRATIONS','DIRECTORY_MEDIA','TAX_EXEMPTION_DOCS','PARISH_EXPORTS']) env[name] = bindings['RESTORE_' + name];
    }
    if (input.quarantine) env.PARISH_RESTORE_QUARANTINE = 'true';
    if (input.uiDisabled) env.PARISH_PORTABILITY_ENABLED = 'false';
    try {
      let result;
      switch (input.action) {
        case 'setup': {
          const tables = await inspectStorage(env.AGAPAY_DB);
          await env.AGAPAY_DB.batch(barrierStatements(tables.map(t => t.name)).map(sql => env.AGAPAY_DB.prepare(sql)));
          const guarded = protectLegacyStorage(protectFileStorage(env));
          for (const owner of ['parish-a','parish-b']) {
            await guarded.DIRECTORY_MEDIA.put(`directory/${owner}/orphan.txt`, 'photo for ' + owner, { customMetadata: { agapayParishId: owner } });
            await guarded.AGAPAY_REGISTRATIONS.put('legacy-' + owner, JSON.stringify({ parishId: owner, parishName: owner, password: 'secret-not-exported' }));
          }
          await guarded.TAX_EXEMPTION_DOCS.put('financial/a.txt', 'restricted financial evidence', { customMetadata: { agapayParishId: parishId } });
          await guarded.AGAPAY_REGISTRATIONS.put('__agapay_index_parish_id__parish-a', 'legacy-parish-a');
          await guarded.AGAPAY_REGISTRATIONS.put('__agapay_donor__shared', JSON.stringify({ email: 'independent@example.test' }));
          result = await sweepAccountingBackupRetention(env);
          break;
        }
        case 'export': {
          const job = await startExport(env, { parishId, actorHash, mode: input.mode, requestKey: crypto.randomUUID() });
          result = await processExport(env, parishId, job.id);
          break;
        }
        case 'download': {
          const { object } = await downloadExport(env, parishId, input.jobId);
          return new Response(object.body, { headers: { 'content-type': 'application/zip', 'cache-control': 'private, no-store' } });
        }
        case 'cancel': result = await cancelExport(env, parishId, input.jobId); break;
        case 'confirm': result = await confirmClosure(env, { parishId, actorHash, jobId: input.jobId, archiveHash: input.archiveHash, policyVersion: POLICY_VERSION, saved: true, confirmation: parishId }); break;
        case 'process': result = await processExport(env, parishId, input.jobId); break;
        case 'job': result = await getJob(env, parishId, input.jobId); break;
        case 'validate': await assertRestoreSafe(env); result = { safe: true }; break;
        case 'replay': result = await replayClosureSuppressions(env, evidenceSha256); break;
        case 'sanitize': result = await sanitizeRestoredParish(env, parishId, evidenceSha256); break;
        case 'upload': {
          await protectFileStorage(env).DIRECTORY_MEDIA.put('late.txt', 'late write', { customMetadata: { agapayParishId: parishId } });
          result = { written: true }; break;
        }
        case 'legacy-write': {
          await protectLegacyStorage(env).AGAPAY_REGISTRATIONS.put('legacy-parish-a', JSON.stringify({ parishId }));
          result = { written: true }; break;
        }
        default: return new Response('Not found', { status: 404 });
      }
      return Response.json({ result: result ?? null });
    } catch (error) {
      return Response.json({ code: error.code || 'runtime_error', message: error.message }, { status: error.status || 500 });
    }
  },
};
