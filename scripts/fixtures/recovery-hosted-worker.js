import { WorkerEntrypoint } from 'cloudflare:workers';
import { executeRecoveryDrill } from './recovery-runtime-worker.js';

// Service-binding only, synthetic parish IDs only. Never part of the app Worker.
export default class RecoveryHostedDrill extends WorkerEntrypoint {
  async fetch() {
    return new Response('Not found', { status: 404 });
  }
  async run(input) {
    if (
      this.env.RECOVERY_HOSTED_DRILL !== 'true' ||
      !/^agapay-restore-drill-\d+-\d+$/.test(this.env.DRILL_RESOURCE_PREFIX || '')
    )
      throw new Error('Disposable recovery environment required');
    return executeRecoveryDrill(this.env, input);
  }
}
