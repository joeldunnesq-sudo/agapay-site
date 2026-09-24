import { startRecovery, advanceRecovery, recoveryStatus } from '../../src/recovery/service.js';

export default {
  async fetch(request, env) {
    if (env.RECOVERY_LOCAL_DRILL !== 'true' || request.headers.get('authorization') !== 'Bearer ' + env.DRILL_TOKEN)
      return new Response('Not found', { status: 404 });
    try {
      const body = await request.json();
      let result;
      if (body.action === 'start') result = await startRecovery(env, 'parish-a', 'synthetic-actor', body.input);
      else if (body.action === 'advance') result = await advanceRecovery(env, 'parish-a', body.id);
      else result = await recoveryStatus(env, 'parish-a', body.scope || 'parish');
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error.message, code: error.code }, { status: 500 });
    }
  },
};
