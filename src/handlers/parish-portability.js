// Generated from src/handlers/parish-portability.ts by npm run build:server. Do not edit.
import { getBearerToken, json, rateLimit, resolveParishDashboardSession } from '../lib/core.js';
import { findRegistrationByParishId } from './parish.js';
import { stripeGetRequest } from '../lib/stripe-connect.js';
import { POLICY_VERSION, PortabilityError } from '../portability/catalog.js';
import { closureReadiness } from '../portability/closure.js';
import { retentionDisclosure } from '../portability/policy.js';
import { downloadRecoverySnapshot } from '../recovery/archive.js';
import { recoveryStatus, startRecovery, advanceRecovery } from '../recovery/service.js';
import { cloudBackupStatus } from '../portability/cloud-backup.js';
import {
  actorFingerprint,
  cancelExport,
  confirmClosure,
  downloadExport,
  getJob,
  jobReceipt,
  publicJob,
  requirePortability,
  retryExport,
  startExport,
  JOB_SELECTION,
} from '../portability/service.js';
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};
const reply = (data, status = 200) => json(data, { status, headers });
async function requestBody(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    throw new PortabilityError('invalid_content_type', 'Send JSON.', 415);
  if (!request.body) throw new PortabilityError('invalid_body', 'A request body is required.', 422);
  const reader = request.body.getReader(),
    chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) {
        await reader.cancel();
        throw new PortabilityError('body_too_large', 'The request body is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new PortabilityError('invalid_body', 'Send a JSON object.', 422);
  }
}
async function requireCancelledBilling(env, registration) {
  if (!registration.stripeSubscriptionId) return;
  if (!env.STRIPE_SECRET_KEY)
    throw new PortabilityError(
      'billing_verification_unavailable',
      'Billing cancellation must be verified before closure.',
      503
    );
  const result = await stripeGetRequest(
    env,
    '/v1/subscriptions/' + encodeURIComponent(registration.stripeSubscriptionId)
  );
  if (!result.ok || !['canceled', 'incomplete_expired'].includes(result.body?.status))
    throw new PortabilityError(
      'cancel_billing_first',
      'Cancel the AGAPAY subscription and wait until cancellation takes effect before closing. Exporting does not cancel billing.'
    );
}
async function handleParishPortability(request, env, parishId, suffix = '') {
  try {
    const token = getBearerToken(request);
    if (!token) return reply({ error: 'Unauthorized' }, 401);
    const actorHash = await actorFingerprint(token);
    const found = await findRegistrationByParishId(env, parishId);
    let registration = found?.registration || null;
    if (!registration && env.AGAPAY_DB) {
      const row = await env.AGAPAY_DB.prepare(
        `SELECT data FROM registrations
        WHERE parish_id=?
        ORDER BY COALESCE(json_extract(data, '$.updatedAt'), updated_at, received_at) DESC,
          updated_at DESC, reference DESC
        LIMIT 1`
      )
        .bind(parishId)
        .first();
      registration = row ? JSON.parse(row.data) : null;
    }
    const session = registration ? await resolveParishDashboardSession(registration, token) : null;
    const item = suffix.match(/^\/([a-f0-9-]{36})(?:\/(download|confirm|cancel|retry|receipt))?$/);
    if (!session) {
      if (request.method === 'GET' && item?.[2] === 'receipt' && env.PARISH_PORTABILITY_ENABLED === 'true') {
        const job2 = await getJob(env, parishId, item[1]);
        if (job2.requested_by === actorHash && job2.confirmed_at && job2.expires_at > Date.now())
          return reply({ ok: true, receipt: await jobReceipt(env, job2) });
      }
      return reply({ error: 'Unauthorized' }, 401);
    }
    if (session.accessType !== 'primary_parish') {
      return reply(
        {
          error: 'Sign out, then use the parish’s primary login to access data portability or close the account.',
          code: 'primary_parish_login_required',
        },
        403
      );
    }
    if (request.method === 'GET' && suffix === '/backup-status') {
      return reply({
        ok: true,
        enabled: env.PARISH_PORTABILITY_ENABLED === 'true' && !!env.PARISH_EXPORTS,
        cloud: await cloudBackupStatus(env),
      });
    }
    if (request.method === 'GET' && suffix === '/recovery')
      return reply({
        ok: true,
        ...(await recoveryStatus(env, parishId, new URL(request.url).searchParams.get('scope') || 'parish')),
      });
    const continuation =
      request.method === 'POST' && suffix.match(/^\/recovery\/([a-f0-9-]{36})\/(advance|cancel|rollback)$/);
    const continuingOwner =
      continuation &&
      env.PARISH_RECOVERY_ENABLED === 'true' &&
      (await env.AGAPAY_DB.prepare(
        "SELECT 1 FROM parish_recovery_operations WHERE id=? AND parish_id=? AND actor_hash=? AND status IN ('running','paused')"
      )
        .bind(continuation[1], parishId, actorHash)
        .first());
    const verified = Date.parse(session.mfaVerifiedAt || '');
    if (!continuingOwner && (!Number.isFinite(verified) || verified > Date.now() || Date.now() - verified > 15 * 6e4))
      return reply(
        {
          error: 'Confirm your identity before accessing parish data.',
          code: 'mfa_step_up_required',
          principalType: 'parish_admin',
          principalId: parishId,
        },
        428
      );
    if (request.method === 'GET' && suffix === '') {
      const enabled = env.PARISH_PORTABILITY_ENABLED === 'true' && !!env.PARISH_EXPORTS;
      const jobs = enabled
        ? (
            await env.AGAPAY_DB.prepare(
              `SELECT ${JOB_SELECTION} FROM parish_portability_jobs j WHERE parish_id=? ORDER BY created_at DESC LIMIT 10`
            )
              .bind(parishId)
              .all()
          ).results
        : [];
      return reply({
        ok: true,
        enabled,
        policyVersion: POLICY_VERSION,
        disclosure: retentionDisclosure(env),
        closure: closureReadiness(env, null),
        jobs: jobs.map((job2) => publicJob(env, job2)),
      });
    }
    const recoveryDownload = suffix.match(/^\/recovery\/([a-f0-9-]{36})\/download$/);
    if (request.method === 'GET' && recoveryDownload) {
      const archive = await downloadRecoverySnapshot(
        env,
        parishId,
        recoveryDownload[1],
        new URL(request.url).searchParams.get('scope') || 'parish'
      );
      return new Response(archive, {
        headers: {
          ...headers,
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="AGAPAY-recovery-${recoveryDownload[1]}.zip"`,
        },
      });
    }
    requirePortability(env);
    if (request.method === 'GET' && item) {
      if (item[2] === 'download') {
        const { job: job2, object } = await downloadExport(env, parishId, item[1]);
        return new Response(object.body, {
          headers: {
            ...headers,
            'Content-Type': 'application/zip',
            'Content-Length': String(job2.archive_bytes),
            'Content-Disposition': `attachment; filename="AGAPAY-parish-${job2.id}.zip"`,
            'X-Archive-SHA256': job2.archive_sha256,
          },
        });
      }
      if (item[2] === 'receipt')
        return reply({ ok: true, receipt: await jobReceipt(env, await getJob(env, parishId, item[1])) });
      if (!item[2]) return reply({ ok: true, job: publicJob(env, await getJob(env, parishId, item[1])) });
    }
    if (request.method !== 'POST') return reply({ error: 'Not found' }, 404);
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(env.AGAPAY_APP_URL || request.url).origin)
      return reply({ error: 'Invalid origin' }, 403);
    const limited = await rateLimit(request, env, `parish-portability:${parishId}`, {
      limit: suffix.startsWith('/recovery') ? 100 : 20,
      windowSeconds: 300,
    });
    if (limited) return limited;
    const body = await requestBody(request);
    if (suffix === '/recovery')
      return reply({ ok: true, operation: await startRecovery(env, parishId, actorHash, body) }, 202);
    const recoveryItem = suffix.match(/^\/recovery\/([a-f0-9-]{36})\/(advance|cancel|rollback)$/);
    if (recoveryItem)
      return reply({ ok: true, operation: await advanceRecovery(env, parishId, recoveryItem[1], recoveryItem[2]) });
    let job;
    if (suffix === '') {
      if (body.mode === 'close') await requireCancelledBilling(env, registration);
      job = await startExport(env, { parishId, actorHash, mode: body.mode, requestKey: body.requestKey });
    } else if (item?.[2] === 'confirm') {
      await requireCancelledBilling(env, registration);
      job = await confirmClosure(env, {
        parishId,
        jobId: item[1],
        actorHash,
        archiveHash: body.archiveHash,
        policyVersion: body.policyVersion,
        saved: body.saved,
        confirmation: body.confirmation,
      });
    } else if (item?.[2] === 'cancel') job = await cancelExport(env, parishId, item[1]);
    else if (item?.[2] === 'retry') job = await retryExport(env, parishId, item[1]);
    else return reply({ error: 'Not found' }, 404);
    return reply({ ok: true, job: publicJob(env, job) }, 202);
  } catch (error) {
    if (error instanceof PortabilityError) return reply({ error: error.message, code: error.code }, error.status);
    console.error('parish_portability_request_failed');
    return reply(
      {
        error: suffix.startsWith('/recovery')
          ? 'Recovery did not complete this step. Recheck its status before retrying; any active write lock remains in place.'
          : 'Parish portability could not complete this request. No successful deletion is being reported.',
        code: 'portability_failed',
      },
      503
    );
  }
}
export { handleParishPortability };
