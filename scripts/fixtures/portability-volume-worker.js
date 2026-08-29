// LOCAL VOLUME TEST ENTRYPOINT ONLY. Never deploy or import from src/worker.js.
// Production portability modules run inside workerd against native D1/R2/KV.
import { startExport, processExport, getJob } from '../../src/portability/service.js';

export default {
  async fetch(request, env) {
    if (env.PORTABILITY_VOLUME_GATE !== 'true' || !env.VOLUME_GATE_TOKEN || request.headers.get('authorization') !== `Bearer ${env.VOLUME_GATE_TOKEN}`) return new Response('Not found', { status: 404 });
    try {
      const input = await request.json();
      if (input.action !== 'export' || !/^[a-z0-9-]{1,80}$/.test(input.parishId || '')) return new Response('Not found', { status: 404 });
      const job = await startExport(env, {
        parishId: input.parishId,
        actorHash: 'synthetic-volume-gate-actor',
        mode: 'export',
        requestKey: `volume-gate-${input.parishId}`,
      });
      await processExport(env, input.parishId, job.id);
      const ready = await getJob(env, input.parishId, job.id);
      return Response.json({
        id: ready.id,
        status: ready.status,
        archiveKey: ready.archive_key,
        archiveSha256: ready.archive_sha256,
        archiveBytes: ready.archive_bytes,
        manifest: JSON.parse(ready.manifest_json),
      });
    } catch (error) {
      return Response.json({ code: error.code || 'runtime_error', message: error.message }, { status: error.status || 500 });
    }
  },
};
