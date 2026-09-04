import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';
import { recordScheduledHeartbeat } from './scheduled-heartbeats.js';

const SCHEDULED_ALERT_DEDUPE_SECONDS_DEFAULT = 60 * 60;
const SCHEDULED_ALERT_KEY_PREFIX = 'ops_alert:scheduled_job:';

function scheduledAlertDedupeSeconds(env = {}) {
  const configured = Number(env.AGAPAY_SCHEDULED_ALERT_DEDUPE_SECONDS);
  return Number.isFinite(configured) && configured >= 60
    ? Math.floor(configured)
    : SCHEDULED_ALERT_DEDUPE_SECONDS_DEFAULT;
}

function scheduledAlertKey(name) {
  return `${SCHEDULED_ALERT_KEY_PREFIX}${encodeURIComponent(String(name || 'unknown'))}`;
}

async function sendScheduledJobFailureAlert(env, name, error, failedAt) {
  const recipient = String(env?.AGAPAY_OPS_ALERT_EMAIL || '').trim();
  if (!recipient) return { status: 'disabled' };

  const windowSeconds = scheduledAlertDedupeSeconds(env);
  const key = scheduledAlertKey(name);
  const failedAtMs = Date.parse(failedAt);
  if (env.AGAPAY_REGISTRATIONS?.get) {
    try {
      const lastAlertAt = await env.AGAPAY_REGISTRATIONS.get(key);
      const lastAlertMs = Date.parse(String(lastAlertAt || ''));
      if (Number.isFinite(lastAlertMs) && failedAtMs - lastAlertMs < windowSeconds * 1000) {
        console.log('scheduled_job_alert_suppressed', JSON.stringify({ name, lastAlertAt, windowSeconds }));
        return { status: 'suppressed', lastAlertAt, windowSeconds };
      }
    } catch (dedupeError) {
      console.error('scheduled_job_alert_dedupe_check_failed', name, dedupeError?.message || String(dedupeError));
    }
  }

  const errorMessage = error?.message || String(error);
  const title = `Scheduled job failed: ${name}`;
  const result = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to: [recipient],
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    subject: `[AGAPAY Ops] ${title}`,
    text: `AGAPAY scheduled job failure\n\nJob: ${name}\nError: ${errorMessage}\nTimestamp: ${failedAt}\n\nThe job failure was logged and remains failed.`,
    html: agapayEmailHtml(
      env.AGAPAY_APP_URL,
      title,
      `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A scheduled AGAPAY job failed and requires attention.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#F8F5EE;border:1px solid #E4DAC7;border-radius:10px;">
        <tr><td style="padding:10px 12px;font-weight:700;color:#061522;">Job</td><td style="padding:10px 12px;color:#171715;">${htmlEscape(name || 'unknown')}</td></tr>
        <tr><td style="padding:10px 12px;font-weight:700;color:#061522;">Error</td><td style="padding:10px 12px;color:#171715;">${htmlEscape(errorMessage)}</td></tr>
        <tr><td style="padding:10px 12px;font-weight:700;color:#061522;">Timestamp</td><td style="padding:10px 12px;color:#171715;">${failedAt}</td></tr>
      </table>
    `
    ),
  });

  if (result?.status !== 'sent') return result || { status: 'failed' };
  if (env.AGAPAY_REGISTRATIONS?.put) {
    await env.AGAPAY_REGISTRATIONS.put(key, failedAt, { expirationTtl: windowSeconds });
  }
  return result;
}

export function observeScheduledTask(name, task, env = {}, event = {}) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const runId = `${name}:${event.scheduledTime || startedAtMs}`;
  const heartbeat = { name, cron: String(event.cron || 'unknown'), runId, startedAt };
  return Promise.all([Promise.resolve(task), recordScheduledHeartbeat(env, { ...heartbeat, status: 'running' })])
    .then(async ([results]) => {
      const completedAtMs = Date.now();
      await recordScheduledHeartbeat(env, {
        ...heartbeat,
        status: 'completed',
        completedAt: new Date(completedAtMs).toISOString(),
        durationMs: completedAtMs - startedAtMs,
      });
      console.log(name, JSON.stringify(results));
      return results;
    })
    .catch(async (error) => {
      const completedAtMs = Date.now();
      await recordScheduledHeartbeat(env, {
        ...heartbeat,
        status: 'failed',
        completedAt: new Date(completedAtMs).toISOString(),
        durationMs: completedAtMs - startedAtMs,
        errorSummary: String(error?.message || error).slice(0, 500),
      });
      console.error(`${name}_failed`, error?.message || String(error));
      try {
        const alert = await sendScheduledJobFailureAlert(env, name, error, new Date().toISOString());
        if (!['sent', 'suppressed', 'disabled'].includes(alert?.status)) {
          console.error(
            'scheduled_job_alert_failed',
            name,
            alert?.detail || alert?.error || alert?.status || 'unknown'
          );
        }
      } catch (alertError) {
        console.error('scheduled_job_alert_failed', name, alertError?.message || String(alertError));
      }
      throw error;
    });
}
