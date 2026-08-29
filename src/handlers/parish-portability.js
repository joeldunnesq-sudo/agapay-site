import { getBearerToken, json, rateLimit, resolveParishDashboardSession } from '../lib/core.js';
import { findRegistrationByParishId } from './parish.js';
import { stripeGetRequest } from '../lib/stripe-connect.js';
import { POLICY_VERSION, PortabilityError } from '../portability/catalog.js';
import { closureReadiness, retentionDisclosure } from '../portability/closure.js';
import { actorFingerprint, cancelExport, confirmClosure, downloadExport, getJob, jobReceipt, publicJob, requirePortability, retryExport, startExport, JOB_SELECTION } from '../portability/service.js';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const reply = (data, status = 200) => json(data, { status, headers });

async function requestBody(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new PortabilityError('invalid_content_type', 'Send JSON.', 415);
  if (!request.body) throw new PortabilityError('invalid_body', 'A request body is required.', 422);
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) { await reader.cancel(); throw new PortabilityError('body_too_large', 'The request body is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; }
  catch { throw new PortabilityError('invalid_body', 'Send a JSON object.', 422); }
}

async function requireCancelledBilling(env, registration) {
  if (!registration.stripeSubscriptionId) return;
  if (!env.STRIPE_SECRET_KEY) throw new PortabilityError('billing_verification_unavailable', 'Billing cancellation must be verified before closure.', 503);
  const result = await stripeGetRequest(env, '/v1/subscriptions/' + encodeURIComponent(registration.stripeSubscriptionId));
  if (!result.ok || !['canceled', 'incomplete_expired'].includes(result.body?.status)) throw new PortabilityError('cancel_billing_first', 'Cancel the AGAPAY subscription and wait until cancellation takes effect before closing. Exporting does not cancel billing.');
}

export async function handleParishPortability(request, env, parishId, suffix = '') {
  try {
    const token = getBearerToken(request);
    if (!token) return reply({ error: 'Unauthorized' }, 401);
    const actorHash = await actorFingerprint(token);
    // Use the same authoritative record selection as the rest of the parish
    // dashboard while the parish is active. A parish can have historical rows
    // with the same parish_id, and authenticating against a different row would
    // reject an otherwise valid dashboard session.
    const found = await findRegistrationByParishId(env, parishId);
    let registration = found?.registration || null;
    if (!registration && env.AGAPAY_DB) {
      // During closure the normal lookup intentionally denies access. Read the
      // record directly so the original bearer can retrieve its status receipt,
      // using the same deterministic ordering as findRegistrationByParishId.
      const row = await env.AGAPAY_DB.prepare(`SELECT data FROM registrations
        WHERE parish_id=?
        ORDER BY COALESCE(json_extract(data, '$.updatedAt'), updated_at, received_at) DESC,
          updated_at DESC, reference DESC
        LIMIT 1`).bind(parishId).first();
      registration = row ? JSON.parse(row.data) : null;
    }
    const session = registration ? await resolveParishDashboardSession(registration, token) : null;
    const item = suffix.match(/^\/([a-f0-9-]{36})(?:\/(download|confirm|cancel|retry|receipt))?$/);
    if (!session) {
      // After credentials are deleted the original bearer can only retrieve its
      // non-sensitive receipt, until the original export expiry. It cannot export.
      if (request.method === 'GET' && item?.[2] === 'receipt' && env.PARISH_PORTABILITY_ENABLED === 'true') {
        const job = await getJob(env, parishId, item[1]);
        if (job.requested_by === actorHash && job.confirmed_at && job.expires_at > Date.now()) return reply({ ok: true, receipt: await jobReceipt(env, job) });
      }
      return reply({ error: 'Unauthorized' }, 401);
    }
    const verified = Date.parse(session.mfaVerifiedAt || '');
    if (!Number.isFinite(verified) || verified > Date.now() || Date.now() - verified > 15 * 60000) return reply({ error: 'Confirm your identity before accessing parish data.', code: 'mfa_step_up_required', principalType: 'parish_admin', principalId: parishId }, 428);
    if (request.method === 'GET' && suffix === '') {
      const enabled = env.PARISH_PORTABILITY_ENABLED === 'true' && !!env.PARISH_EXPORTS;
      const jobs = enabled ? (await env.AGAPAY_DB.prepare(`SELECT ${JOB_SELECTION} FROM parish_portability_jobs j WHERE parish_id=? ORDER BY created_at DESC LIMIT 10`).bind(parishId).all()).results : [];
      return reply({ ok: true, enabled, policyVersion: POLICY_VERSION, disclosure: retentionDisclosure(env), closure: closureReadiness(env, null), jobs: jobs.map(job => publicJob(env, job)) });
    }
    requirePortability(env);
    if (request.method === 'GET' && item) {
      if (item[2] === 'download') {
        const { job, object } = await downloadExport(env, parishId, item[1]);
        return new Response(object.body, { headers: { ...headers, 'Content-Type': 'application/zip', 'Content-Length': String(job.archive_bytes), 'Content-Disposition': `attachment; filename="AGAPAY-parish-${job.id}.zip"`, 'X-Archive-SHA256': job.archive_sha256 } });
      }
      if (item[2] === 'receipt') return reply({ ok: true, receipt: await jobReceipt(env, await getJob(env, parishId, item[1])) });
      if (!item[2]) return reply({ ok: true, job: publicJob(env, await getJob(env, parishId, item[1])) });
    }
    if (request.method !== 'POST') return reply({ error: 'Not found' }, 404);
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(env.AGAPAY_APP_URL || request.url).origin) return reply({ error: 'Invalid origin' }, 403);
    const limited = await rateLimit(request, env, `parish-portability:${parishId}`, { limit: 20, windowSeconds: 300 });
    if (limited) return limited;
    const body = await requestBody(request);
    let job;
    if (suffix === '') {
      if (body.mode === 'close') await requireCancelledBilling(env, registration);
      job = await startExport(env, { parishId, actorHash, mode: body.mode, requestKey: body.requestKey });
    } else if (item?.[2] === 'confirm') {
      await requireCancelledBilling(env, registration);
      job = await confirmClosure(env, { parishId, jobId: item[1], actorHash, archiveHash: body.archiveHash, policyVersion: body.policyVersion, saved: body.saved, confirmation: body.confirmation });
    } else if (item?.[2] === 'cancel') job = await cancelExport(env, parishId, item[1]);
    else if (item?.[2] === 'retry') job = await retryExport(env, parishId, item[1]);
    else return reply({ error: 'Not found' }, 404);
    return reply({ ok: true, job: publicJob(env, job) }, 202);
  } catch (error) {
    if (error instanceof PortabilityError) return reply({ error: error.message, code: error.code }, error.status);
    // Export records, raw provider errors and credentials must never appear in logs.
    console.error('parish_portability_request_failed');
    return reply({ error: 'Parish portability could not complete this request. No successful deletion is being reported.', code: 'portability_failed' }, 503);
  }
}
