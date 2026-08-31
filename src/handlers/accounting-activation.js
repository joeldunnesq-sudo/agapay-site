import { json } from '../lib/core.js';
import { requireAccountingStaffProfile } from '../lib/accounting-staff.js';
import { activationDto, activationOperation, first, run } from '../accounting/provisioning/activation.js';
import { accountingContext } from './accounting-ledger.js';
import { previewActivationChart, commitActivationChart } from '../accounting/provisioning/chart-import.js';
import { ValidationError } from '../accounting/errors.js';

const reply = (body, status = 200) =>
  json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Authorization' },
  });

async function activationBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_100_000) {
        await reader.cancel();
        throw new ValidationError('Upload must be under 1 MB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes) || '{}');
  } catch {
    throw new ValidationError('A valid JSON request is required.');
  }
}

// Called only after the parish bearer and current Accounting entitlement are verified.
export async function handleAccountingActivation(request, env, parishId, path) {
  try {
    if (request.method === 'GET' && path === '/activation') {
      const operation = await activationOperation(env, parishId);
      const entity =
        !operation &&
        (await first(
          env,
          'SELECT entity_status,activation_status FROM accounting_entities WHERE parish_id=?',
          parishId
        ));
      if (entity)
        return reply(
          entity.entity_status === 'ready' && entity.activation_status === 'active'
            ? { status: 'ready', completed: true }
            : { status: 'review_required', available: false, completed: false }
        );
      const status = env.ACCOUNTING_PROVISIONER
        ? await env.ACCOUNTING_PROVISIONER.status(parishId)
        : activationDto(operation, false);
      if (status.status === 'ready' && !status.completed) {
        status.staffReady = Boolean(
          await requireAccountingStaffProfile(request, env, parishId, 'accounting.configure')
        );
      }
      return reply(status);
    }
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    if (Number(request.headers.get('Content-Length') || 0) > 1_100_000)
      return reply({ error: 'Upload must be under 1 MB.' }, 413);
    const body = await activationBody(request);
    if (path === '/activation/start') {
      if (!env.ACCOUNTING_PROVISIONER)
        return reply({ error: 'Automatic setup is awaiting platform configuration. Contact AGAPAY support.' }, 503);
      return reply(await env.ACCOUNTING_PROVISIONER.start(parishId, body), 202);
    }
    const staff = await requireAccountingStaffProfile(request, env, parishId, 'accounting.configure');
    if (!staff) return reply({ error: 'Sign in as a named Accounting administrator first.' }, 403);
    if (path === '/activation/complete') {
      const operation = await activationOperation(env, parishId);
      if (
        operation?.status !== 'ready' ||
        operation.entity_status !== 'ready' ||
        operation.activation_status !== 'active' ||
        operation.provisioning_status !== 'ready' ||
        operation.health_status !== 'healthy'
      )
        return reply({ error: 'The books are not ready.' }, 409);
      await run(
        env,
        "UPDATE accounting_provisioning_operations SET wizard_completed_at=COALESCE(wizard_completed_at,datetime('now')) WHERE id=?",
        operation.id
      );
      return reply({ ok: true });
    }
    if (['/activation/chart/preview', '/activation/chart/commit'].includes(path)) {
      const ctx = await accountingContext(request, env, parishId, 'accounting.migration.import');
      if (!ctx) return reply({ error: 'Accounting import access is required.' }, 403);
      if (ctx.error) return ctx.error;
      const input = { ...body, actor: ctx.actor };
      return reply(
        path.endsWith('/preview')
          ? { preview: await previewActivationChart(ctx.db, input) }
          : { result: await commitActivationChart(ctx.db, input) }
      );
    }
    return reply({ error: 'Not found' }, 404);
  } catch (error) {
    const validation = error?.name === 'ValidationError';
    return reply(
      {
        error: validation
          ? error.message
          : 'Accounting setup could not continue. Your books were preserved; retry or contact support.',
      },
      validation ? 400 : 503
    );
  }
}
