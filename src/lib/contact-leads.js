import { d1, sha256Hex } from './core.js';
import { sendEmail, agapayEmailHtml } from './email.js';
import { htmlEscape } from './format.js';
import { attributionEmail } from './lead-attribution.js';
import { logEvent } from './logging.js';

const LEASE_MS = 60000;
// Provider deduplication lasts 24h. Stop ambiguous retries before that expires.
const SAFE_RETRY_MS = 23 * 60 * 60 * 1000;

export async function getContactLead(env, id) {
  return d1(env).prepare('SELECT * FROM contact_leads WHERE id = ?1').bind(id).first();
}

function notification(env, lead) {
  const referral = attributionEmail(lead.attribution);
  const text = `AGAPAY Contact Form\nReference: ${lead.id}\n\nFrom: ${lead.name} <${lead.email}>\nOrganization: ${lead.organization || 'N/A'}\nTopic: ${lead.topic}\n\nMessage:\n${lead.message}\n\n${referral.text}`;
  return {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to: [...new Set([env.AGAPAY_SUPPORT_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app', env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || 'onboarding@agapay.app', 'onboarding@agapay.app'])],
    reply_to: lead.email,
    subject: `AGAPAY Contact: ${lead.topic}`,
    text,
    html: agapayEmailHtml(env.AGAPAY_APP_URL || 'https://agapay.app', `Contact: ${lead.topic}`,
      `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${htmlEscape(text)}</div>`),
  };
}

export async function saveContactLead(env, input, submissionKey) {
  const payloadHash = await sha256Hex(JSON.stringify([input.name, input.email, input.organization, input.topic, input.message]));
  // Old clients have no key: identical messages on the same UTC day deduplicate.
  const key = await sha256Hex(submissionKey || `legacy:${new Date().toISOString().slice(0, 10)}:${payloadHash}`);
  const lead = { ...input, id: crypto.randomUUID(), submittedAt: new Date().toISOString() };
  if (lead.attribution?.lastTouch) lead.attribution.lastTouch.timestamp = lead.submittedAt;
  const email = notification(env, lead);
  await d1(env).prepare(`INSERT INTO contact_leads
    (id, submission_key, payload_hash, data, created_at, notification_json)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(submission_key) DO NOTHING`)
    .bind(lead.id, key, payloadHash, JSON.stringify(lead), lead.submittedAt, JSON.stringify(email)).run();
  const row = await d1(env).prepare('SELECT * FROM contact_leads WHERE submission_key = ?1').bind(key).first();
  if (!row) throw new Error('Contact persistence failed');
  if (row.payload_hash !== payloadHash) return { conflict: true };
  return { row, duplicate: row.id !== lead.id };
}

export async function deliverContactNotification(env, id) {
  const now = Date.now();
  const token = crypto.randomUUID();
  // A single conditional UPDATE both claims and snapshots the job. No read/write race.
  const row = await d1(env).prepare(`UPDATE contact_leads SET
    notification_status = 'sending', lease_token = ?2, lease_until = ?3,
    attempts = attempts + 1, first_attempt_at = COALESCE(first_attempt_at, ?4), last_attempt_at = ?4
    WHERE id = ?1 AND notification_status IN ('pending', 'failed', 'error', 'not_configured', 'sending')
      AND (lease_until IS NULL OR lease_until <= ?4)
      AND (first_attempt_at IS NULL OR first_attempt_at > ?5)
    RETURNING *`).bind(id, token, now + LEASE_MS, now, now - SAFE_RETRY_MS).first();
  if (!row) {
    const existing = await getContactLead(env, id);
    return { status: existing?.notification_status === 'sent' ? 'sent' : 'review_required', busy: Boolean(existing?.lease_until > now) };
  }
  const result = await sendEmail(env, JSON.parse(row.notification_json), {
    idempotencyKey: `contact/${id}/${row.generation}`, timeoutMs: 10000,
  });
  // Persist only a safe classification, never provider response bodies or form content.
  const status = ['sent', 'failed', 'error', 'not_configured'].includes(result.status) ? result.status : 'error';
  const error = status === 'sent' ? null : `${status}${result.httpStatus ? ` (HTTP ${Number(result.httpStatus)})` : ''}`;
  await d1(env).prepare(`UPDATE contact_leads SET notification_status = ?3, provider_id = ?4,
    last_error = ?5, sent_at = ?6, lease_token = NULL, lease_until = NULL
    WHERE id = ?1 AND lease_token = ?2`).bind(id, token, status,
    status === 'sent' ? String(result.id || '').slice(0, 150) : null, error,
    status === 'sent' ? new Date().toISOString() : null).run();
  await logEvent(env, { eventType: 'contact.notification.completed', severity: status === 'sent' ? 'info' : 'warn',
    jobId: id, retryable: status !== 'sent', metadata: { status, attempts: row.attempts, httpStatus: result.httpStatus || null } });
  return { status };
}

export function contactLeadView(row) {
  const data = JSON.parse(row.data);
  return { ...data, id: row.id, notificationStatus: row.notification_status, attempts: row.attempts, generation: row.generation,
    providerId: row.provider_id, lastError: row.last_error, sentAt: row.sent_at,
    reviewRequired: row.notification_status !== 'sent' && (!row.lease_until || row.lease_until <= Date.now())
      && (row.notification_status === 'legacy_unknown' || (row.first_attempt_at && row.first_attempt_at <= Date.now() - SAFE_RETRY_MS)),
    retryAvailable: ['pending', 'failed', 'error', 'not_configured', 'sending'].includes(row.notification_status)
      && (!row.lease_until || row.lease_until <= Date.now())
      && (!row.first_attempt_at || row.first_attempt_at > Date.now() - SAFE_RETRY_MS) };
}

export async function resolveContactDelivery(env, row, resolution) {
  const delivered = resolution === 'delivered';
  return d1(env).prepare(`UPDATE contact_leads SET notification_status = ?2,
    generation = generation + 1, first_attempt_at = NULL, lease_token = NULL, lease_until = NULL,
    last_error = NULL, sent_at = ?3, notification_json = COALESCE(notification_json, ?4)
    WHERE id = ?1 AND attempts = ?5 AND generation = ?6 AND notification_status != 'sent'
      AND (lease_until IS NULL OR lease_until <= ?7) RETURNING id`)
    .bind(row.id, delivered ? 'sent' : 'pending', delivered ? new Date().toISOString() : null,
      JSON.stringify(notification(env, { ...JSON.parse(row.data), id: row.id })), row.attempts, row.generation, Date.now()).first();
}
