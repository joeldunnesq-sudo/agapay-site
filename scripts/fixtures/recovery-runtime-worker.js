import { portabilityBudget, portabilityBudgetUsage } from '../../src/portability/budget.js';
import { startRecovery, advanceRecovery, recoveryStatus } from '../../src/recovery/service.js';

export async function executeRecoveryDrill(env, body) {
  if (body.managedBooks) {
    const db = env.DRILL_BOOKS;
    env = {
      ...env,
      ACCOUNTING_DATABASE_BINDINGS: '{}',
      ACCOUNTING_PROVISIONER: {
        async resolve(name) {
          return name === 'test-books-a' ? { providerId: name, name } : null;
        },
        async query(name, statements) {
          if (name !== 'test-books-a') throw new Error('Wrong synthetic accounting owner');
          return db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.params)));
        },
      },
    };
  }
  // Fault injection exists only in this synthetic rehearsal entrypoint.
  if (body.failFileWrite) {
    const bucket = env.SACRAMENT_DOCUMENTS;
    env = {
      ...env,
      SACRAMENT_DOCUMENTS: new Proxy(bucket, {
        get(target, key) {
          if (key === 'put')
            return () => {
              throw new Error('Synthetic interrupted file write');
            };
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    };
  }
  env = portabilityBudget(env);
  try {
    let result;
    if (body.action === 'start') result = await startRecovery(env, 'parish-a', 'synthetic-actor', body.input);
    else if (body.action === 'advance')
      result = await advanceRecovery(env, 'parish-a', body.id, body.operation || 'advance');
    else result = await recoveryStatus(env, 'parish-a', body.scope || 'parish');
    return { status: 200, payload: result, operations: portabilityBudgetUsage(env).operations };
  } catch (error) {
    return {
      status: 500,
      payload: { error: error.message, code: error.code },
      operations: portabilityBudgetUsage(env).operations,
    };
  }
}
export default {
  async fetch(request, env) {
    if (env.RECOVERY_LOCAL_DRILL !== 'true' || request.headers.get('authorization') !== 'Bearer ' + env.DRILL_TOKEN)
      return new Response('Not found', { status: 404 });
    const result = await executeRecoveryDrill(env, await request.json());
    return Response.json(result.payload, {
      status: result.status,
      headers: { 'x-drill-operations': String(result.operations) },
    });
  },
};
