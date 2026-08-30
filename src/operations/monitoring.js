import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';

const PORTABILITY_MAX_AGE_MS = 20 * 60 * 1000;

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function tokenMatches(request, env) {
  const expected = String(env?.AGAPAY_MONITOR_CANARY_TOKEN || '');
  const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  const encode = (value) => new TextEncoder().encode(value);
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode(expected)),
    crypto.subtle.digest('SHA-256', encode(supplied)),
  ]);
  const left = new Uint8Array(expectedHash);
  const right = new Uint8Array(suppliedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ (right[index] || 0);
  return difference === 0;
}

function bindings(env) {
  return {
    d1: Boolean(env?.DB || env?.AGAPAY_DB),
    kv: Boolean(env?.AGAPAY_REGISTRATIONS),
    accountingBackups: Boolean(env?.ACCOUNTING_BACKUPS),
    sacramentDocuments: Boolean(env?.SACRAMENT_DOCUMENTS),
  };
}

export async function handleOperationsCanary(request, env) {
  if (!env?.AGAPAY_MONITOR_CANARY_TOKEN) return response({ ok: false, error: 'canary_not_configured' }, 503);
  if (!(await tokenMatches(request, env))) return response({ ok: false, error: 'unauthorized' }, 401);
  const bindingChecks = bindings(env);
  try {
    const result = await (env.DB || env.AGAPAY_DB)
      .prepare(
        `
      SELECT job_name,cron,status,run_id,started_at,completed_at,duration_ms,updated_at
      FROM operational_job_heartbeats ORDER BY job_name
    `
      )
      .all();
    const jobs = result.results || [];
    const portability = jobs.find((job) => job.job_name === 'parish_portability_jobs');
    const portabilityAgeMs = portability?.completed_at ? Date.now() - Date.parse(portability.completed_at) : Infinity;
    const schedulerFresh = Boolean(
      portability &&
      portability.status === 'completed' &&
      Number.isFinite(portabilityAgeMs) &&
      portabilityAgeMs <= PORTABILITY_MAX_AGE_MS
    );
    const failedJobs = jobs.filter((job) => job.status === 'failed').map((job) => job.job_name);
    const ok = Object.values(bindingChecks).every(Boolean) && schedulerFresh && failedJobs.length === 0;
    return response(
      {
        ok,
        checkedAt: new Date().toISOString(),
        bindings: bindingChecks,
        scheduler: {
          ok: schedulerFresh && failedJobs.length === 0,
          portabilityAgeSeconds: Number.isFinite(portabilityAgeMs) ? Math.round(portabilityAgeMs / 1000) : null,
          failedJobs,
          jobs,
        },
      },
      ok ? 200 : 503
    );
  } catch (error) {
    return response(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        bindings: bindingChecks,
        error: 'heartbeat_read_failed',
        detail: error?.message || String(error),
      },
      503
    );
  }
}

export async function handleOperationsMonitorAlert(request, env) {
  if (!env?.AGAPAY_MONITOR_CANARY_TOKEN) return response({ ok: false, error: 'canary_not_configured' }, 503);
  if (!(await tokenMatches(request, env))) return response({ ok: false, error: 'unauthorized' }, 401);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return response({ ok: false, error: 'invalid_json' }, 400);
  }
  const runId =
    String(payload?.runId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80) || 'unknown';
  const summary = String(payload?.summary || 'Production monitor failed.').slice(0, 2000);
  const recipient = String(env.AGAPAY_OPS_ALERT_EMAIL || '').trim();
  if (!recipient) return response({ ok: false, error: 'alert_recipient_not_configured' }, 503);
  const title = 'Production monitor failed';
  const result = await sendEmail(
    env,
    {
      from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
      to: [recipient],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
      subject: `[AGAPAY Ops] ${title}`,
      text: `${title}\n\n${summary}\n\nGitHub run: ${runId}`,
      html: agapayEmailHtml(
        env.AGAPAY_APP_URL,
        title,
        `
      <p style="font-size:15px;line-height:1.7;color:#171715;">${htmlEscape(summary)}</p>
      <p style="font-size:13px;color:#595959;">GitHub run: ${htmlEscape(runId)}</p>
    `
      ),
    },
    { idempotencyKey: `production-monitor-${runId}`, timeoutMs: 10_000 }
  );
  return response(
    { ok: result?.status === 'sent', status: result?.status || 'failed' },
    result?.status === 'sent' ? 202 : 502
  );
}
