import { d1, json, rateLimit, unauthorized } from '../lib/core.js';
import { cleanText } from '../../public/attribution-core.js';
import { sanitizeAttribution } from '../lib/lead-attribution.js';
import { saveContactLead, deliverContactNotification, getContactLead, contactLeadView, resolveContactDelivery } from '../lib/contact-leads.js';
import { logEvent } from '../lib/logging.js';
import { requireAdminContext } from './parish.js';
import { recordAuditEvent } from '../lib/audit-log.js';

async function readContactBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 24000) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleContact(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'contact', { limit: 8, windowSeconds: 300 });
  if (limited) return limited;
  if (!d1(env)) return json({ error: 'Contact storage is temporarily unavailable.' }, { status: 503 });
  let body;
  try { body = await readContactBody(request); }
  catch (error) { return json({ error: 'Invalid contact request.' }, { status: error.message === 'body_too_large' ? 413 : 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid contact request.' }, { status: 400 });
  const input = {
    name: cleanText(body.name, 120), email: cleanText(body.email, 200),
    organization: cleanText(body.organization, 200), topic: cleanText(body.topic || 'General Question', 100),
    message: typeof body.message === 'string' ? body.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 4000) : '',
    attribution: sanitizeAttribution(body.attribution),
  };
  if (!input.name || !input.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return json({ error: 'Name, email, and message are required.' }, { status: 400 });
  }
  const submissionKey = body.submissionId;
  if (submissionKey != null && (typeof submissionKey !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(submissionKey))) {
    return json({ error: 'Invalid submission reference.' }, { status: 400 });
  }
  let id;
  try {
    const saved = await saveContactLead(env, input, submissionKey);
    if (saved.conflict) return json({ error: 'This submission reference was already used for different content.' }, { status: 409 });
    id = saved.row.id;
    const delivery = await deliverContactNotification(env, id);
    return json({ ok: true, reference: id, notificationStatus: delivery.status,
      message: delivery.status === 'sent' ? 'Your message was received.' : 'Your message was saved for the AGAPAY team to follow up.' }, { status: 200 });
  } catch {
    await logEvent(env, { eventType: 'contact.submission.failed', severity: 'error', jobId: id || null, retryable: true });
    // If persistence succeeded, acknowledge receipt without falsely claiming delivery.
    if (id) return json({ ok: true, reference: id, notificationStatus: 'review_required', message: 'Your message was saved for the AGAPAY team to follow up.' });
    return json({ error: 'Unable to save your message. Please try again.' }, { status: 503 });
  }
}

export async function handleAdminContactLeads(request, env) {
  const admin = await requireAdminContext(request, env);
  if (!admin) return unauthorized();
  if (!d1(env)) return json({ error: 'Contact storage is unavailable.' }, { status: 503 });
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/admin\/contact-leads\/([a-zA-Z0-9_-]{1,100})\/(retry|resolve)$/);
  if (request.method === 'POST' && match) {
    const limited = await rateLimit(request, env, 'contact-admin-retry', { limit: 20, windowSeconds: 300 });
    if (limited) return limited;
    const row = await getContactLead(env, match[1]);
    if (!row) return json({ error: 'Lead not found.' }, { status: 404 });
    if (match[2] === 'resolve') {
      const body = await readContactBody(request).catch(() => ({}));
      if (!['delivered', 'confirmed_not_delivered'].includes(body?.resolution) || !contactLeadView(row).reviewRequired
        || body.attempts !== row.attempts || body.generation !== row.generation) {
        return json({ error: 'Refresh this lead and confirm its provider delivery history before resolving.' }, { status: 409 });
      }
      await recordAuditEvent(env, request, { action: 'admin.contact_notification.resolve', actorUserId: admin.actor,
        actorType: 'admin', targetType: 'contact_lead', targetId: row.id, metadata: { resolution: body.resolution } });
      const updated = await resolveContactDelivery(env, row, body.resolution);
      if (!updated) return json({ error: 'The lead changed. Refresh before trying again.' }, { status: 409 });
      return json({ ok: true, lead: contactLeadView(await getContactLead(env, row.id)) });
    }
    if (!contactLeadView(row).retryAvailable) return json({ error: 'Delivery is complete, in progress, or requires manual provider review before resending.' }, { status: 409 });
    await recordAuditEvent(env, request, { action: 'admin.contact_notification.retry', actorUserId: admin.actor,
      actorType: 'admin', targetType: 'contact_lead', targetId: row.id });
    await deliverContactNotification(env, row.id);
    return json({ ok: true, lead: contactLeadView(await getContactLead(env, row.id)) });
  }
  if (request.method !== 'GET' || url.pathname !== '/api/admin/contact-leads') return json({ error: 'Method not allowed' }, { status: 405 });
  const [before = '9999', beforeId = '~'] = (url.searchParams.get('before') || '9999|~').split('|');
  const rows = await d1(env).prepare('SELECT * FROM contact_leads WHERE created_at < ?1 OR (created_at = ?1 AND id < ?2) ORDER BY created_at DESC, id DESC LIMIT 51').bind(before, beforeId).all();
  const leads = rows.results.slice(0, 50);
  return json({ ok: true, leads: leads.map(contactLeadView), nextCursor: rows.results.length > 50 ? `${leads.at(-1).created_at}|${leads.at(-1).id}` : null });
}
