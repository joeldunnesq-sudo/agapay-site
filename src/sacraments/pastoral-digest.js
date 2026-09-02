import {
  d1,
  d1All,
  d1First,
  d1Run,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  sha256Hex,
  unauthorized,
} from '../lib/core.js';
import { requireAdmin } from '../handlers/parish.js';
import { sacramentsEnabledFor } from '../lib/entitlements.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';
import { loadAllRegistrations } from '../lib/registrations.js';

const UPCOMING_DAYS = 7;
const DISPLAY_LIMIT = 10;

const REASON_LABELS = Object.freeze({
  homebound: 'Homebound',
  hospitalized: 'Hospitalized',
  bereavement: 'Bereavement',
  newcomer: 'Newcomer',
  regular_check_in: 'Regular check-in',
  other: 'Pastoral care',
});

function dateOnly(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? '' : text;
}

function addUtcDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86400000);
}

export function pastoralReasonLabel(reason) {
  return REASON_LABELS[String(reason || '')] || REASON_LABELS.other;
}

export function buildPastoralDigestGroups(rows = [], todayValue, upcomingDays = UPCOMING_DAYS) {
  const today = dateOnly(todayValue);
  if (!today) throw new Error('A valid digest date is required.');
  const upcomingThrough = addUtcDays(today, upcomingDays);
  const grouped = new Map();

  for (const row of rows) {
    const recipientEmail = normalizeEmail(row.assigned_priest_email || row.assignedPriestEmail);
    const nextDueOn = dateOnly(row.next_due_on || row.nextDueOn);
    if (!recipientEmail || !nextDueOn || nextDueOn > upcomingThrough) continue;
    if (!grouped.has(recipientEmail)) {
      grouped.set(recipientEmail, {
        recipientEmail,
        assignedPriestName: String(row.assigned_priest_name || row.assignedPriestName || '').trim(),
        overdue: [],
        dueToday: [],
        upcoming: [],
      });
    }
    const group = grouped.get(recipientEmail);
    if (!group.assignedPriestName) {
      group.assignedPriestName = String(row.assigned_priest_name || row.assignedPriestName || '').trim();
    }
    const item = {
      id: String(row.id || ''),
      personName: String(row.preferred_name || row.personName || 'Parishioner').trim() || 'Parishioner',
      reason: String(row.reason || 'other'),
      nextDueOn,
    };
    if (nextDueOn < today) group.overdue.push(item);
    else if (nextDueOn === today) group.dueToday.push(item);
    else group.upcoming.push(item);
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      total: group.overdue.length + group.dueToday.length + group.upcoming.length,
      today,
      upcomingThrough,
    }))
    .sort((left, right) => left.recipientEmail.localeCompare(right.recipientEmail));
}

function maskEmail(value) {
  const [local = '', domain = ''] = normalizeEmail(value).split('@');
  if (!domain) return 'hidden';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

function dueLabel(item, today) {
  const difference = daysBetween(today, item.nextDueOn);
  if (difference < 0) return `${Math.abs(difference)} day${difference === -1 ? '' : 's'} overdue`;
  if (difference === 0) return 'due today';
  if (difference === 1) return 'due tomorrow';
  return `due ${new Date(`${item.nextDueOn}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })}`;
}

function digestSectionHtml(title, items, today, tone = 'neutral') {
  if (!items.length) return '';
  const colors =
    tone === 'overdue'
      ? { background: '#FBEFE9', border: 'rgba(178,68,30,0.28)', title: '#8B2A0E' }
      : tone === 'today'
        ? { background: '#FFF7E6', border: 'rgba(181,138,63,0.32)', title: '#76520E' }
        : { background: '#F6F1E8', border: 'rgba(166,159,145,0.34)', title: '#6F6A60' };
  const visible = items.slice(0, DISPLAY_LIMIT);
  const remaining = items.length - visible.length;
  return `<div style="background:${colors.background};border:1px solid ${colors.border};border-radius:12px;padding:16px 18px;margin:0 0 14px;">
    <p style="margin:0 0 9px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${colors.title};font-weight:700;">${htmlEscape(title)} · ${items.length}</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#171715;">
      ${visible.map((item) => `<li style="margin:0 0 5px;"><strong>${htmlEscape(item.personName)}</strong> <span style="color:#6F6A60;">— ${htmlEscape(pastoralReasonLabel(item.reason))}, ${htmlEscape(dueLabel(item, today))}</span></li>`).join('')}
      ${remaining ? `<li style="margin:0;color:#6F6A60;">And ${remaining} more in the Follow-up tab</li>` : ''}
    </ul>
  </div>`;
}

function digestSectionText(title, items, today) {
  if (!items.length) return [];
  const visible = items.slice(0, DISPLAY_LIMIT);
  const remaining = items.length - visible.length;
  return [
    `${title} (${items.length})`,
    ...visible.map((item) => `- ${item.personName}: ${pastoralReasonLabel(item.reason)}, ${dueLabel(item, today)}`),
    ...(remaining ? [`- And ${remaining} more in the Follow-up tab`] : []),
    '',
  ];
}

function digestSubject(group, parishName) {
  const location = parishName || 'your parish';
  if (group.overdue.length) {
    return `${group.overdue.length} pastoral follow-up${group.overdue.length === 1 ? '' : 's'} overdue at ${location}`;
  }
  if (group.dueToday.length) {
    return `${group.dueToday.length} pastoral follow-up${group.dueToday.length === 1 ? '' : 's'} due today at ${location}`;
  }
  return `Pastoral care: ${group.upcoming.length} upcoming contact${group.upcoming.length === 1 ? '' : 's'} at ${location}`;
}

function digestMessage(appUrl, parishName, group) {
  const baseUrl = String(appUrl || 'https://agapay.app').replace(/\/+$/, '');
  const dashboardUrl = `${baseUrl}/parish/dashboard.html`;
  const subject = digestSubject(group, parishName);
  const counts = `${group.overdue.length} overdue · ${group.dueToday.length} due today · ${group.upcoming.length} upcoming`;
  return {
    subject,
    html: agapayEmailHtml(
      baseUrl,
      'Pastoral Care Follow-up',
      `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#171715;">Here is your routine pastoral-care tickler for <strong>${htmlEscape(parishName || 'your parish')}</strong>.</p>
      <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6F6A60;">${htmlEscape(counts)}</p>
      ${digestSectionHtml('Overdue', group.overdue, group.today, 'overdue')}
      ${digestSectionHtml('Due today', group.dueToday, group.today, 'today')}
      ${digestSectionHtml('Upcoming · next 7 days', group.upcoming, group.today)}
      <p style="margin:20px 0 0;"><a href="${htmlEscape(dashboardUrl)}" style="display:inline-block;background:#07284A;color:#FFFFFF;text-decoration:none;border-radius:8px;padding:11px 16px;font-size:14px;font-weight:700;">Open Sacraments &amp; Services</a></p>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#6F6A60;">Open the Follow-up tab to record a contact, reschedule the next tickler, or close care that is no longer needed. Care notes are not included in this email.</p>
    `
    ),
    text: [
      subject,
      '',
      `Routine pastoral-care tickler for ${parishName || 'your parish'}`,
      counts,
      '',
      ...digestSectionText('OVERDUE', group.overdue, group.today),
      ...digestSectionText('DUE TODAY', group.dueToday, group.today),
      ...digestSectionText('UPCOMING · NEXT 7 DAYS', group.upcoming, group.today),
      `Open Sacraments & Services, then choose Follow-up: ${dashboardUrl}`,
      'Care notes are not included in this email.',
    ].join('\n'),
  };
}

async function deliveryIdentity(parishId, recipientEmail, digestDate) {
  const recipientKey = await sha256Hex(normalizeEmail(recipientEmail));
  const digestKey = await sha256Hex(`${parishId}|${recipientKey}|${digestDate}`);
  return {
    id: `pastoral_digest_${digestKey.slice(0, 40)}`,
    recipientKey,
    idempotencyKey: `pastoral-digest-${digestKey}`,
  };
}

async function beginDelivery(env, registration, group, identity, attemptedAt) {
  const existing = await d1First(
    env,
    `SELECT status FROM sacrament_pastoral_digest_deliveries
     WHERE parish_id = ? AND recipient_key = ? AND digest_date = ?`,
    registration.parishId,
    identity.recipientKey,
    group.today
  );
  if (existing?.status === 'sent') return false;
  await d1Run(
    env,
    `INSERT INTO sacrament_pastoral_digest_deliveries
      (id, parish_id, recipient_key, recipient_masked, digest_date, status,
       item_count, overdue_count, due_today_count, upcoming_count, attempted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(parish_id, recipient_key, digest_date) DO UPDATE SET
       status = 'pending', item_count = excluded.item_count,
       overdue_count = excluded.overdue_count, due_today_count = excluded.due_today_count,
       upcoming_count = excluded.upcoming_count, provider_message_id = NULL,
       error = NULL, attempted_at = excluded.attempted_at, updated_at = excluded.updated_at`,
    identity.id,
    registration.parishId,
    identity.recipientKey,
    maskEmail(group.recipientEmail),
    group.today,
    group.total,
    group.overdue.length,
    group.dueToday.length,
    group.upcoming.length,
    attemptedAt,
    attemptedAt,
    attemptedAt
  );
  return true;
}

async function finishDelivery(env, identity, email, finishedAt) {
  const sent = email?.status === 'sent';
  const detail = sent
    ? ''
    : String(email?.detail || email?.error || email?.body || email?.status || 'Email delivery failed').slice(0, 1000);
  await d1Run(
    env,
    `UPDATE sacrament_pastoral_digest_deliveries
     SET status = ?, provider_message_id = ?, error = ?, sent_at = ?, updated_at = ?
     WHERE id = ?`,
    sent ? 'sent' : 'failed',
    sent ? String(email.id || '') : '',
    detail,
    sent ? finishedAt : null,
    finishedAt,
    identity.id
  );
}

async function loadPastoralDigestRows(env, parishId, upcomingThrough) {
  return d1All(
    env,
    `SELECT f.id, f.reason, f.next_due_on, f.assigned_priest_name,
        f.assigned_priest_email, p.preferred_name
     FROM sacrament_pastoral_followups f
     JOIN directory_people p ON p.id = f.person_id
     WHERE f.parish_id = ? AND f.status = 'active'
       AND f.next_due_on <= ?
       AND f.assigned_priest_email IS NOT NULL
       AND trim(f.assigned_priest_email) != ''
     ORDER BY f.next_due_on ASC, p.preferred_name ASC
     LIMIT 1000`,
    parishId,
    upcomingThrough
  );
}

export async function sendDailyPastoralCareDigestEmails(env, scheduledTime, options = {}) {
  if (!d1(env)) return [];
  const now = new Date(scheduledTime || Date.now());
  const today = now.toISOString().slice(0, 10);
  const upcomingDays = Number.isInteger(options.upcomingDays) ? options.upcomingDays : UPCOMING_DAYS;
  const upcomingThrough = addUtcDays(today, upcomingDays);
  const registrations = options.registrations || (await loadAllRegistrations(env, { status: 'verified' }));
  const parishFilter = String(options.parishId || '').trim();
  const dryRun = Boolean(options.dryRun);
  const emailSender = options.emailSender || sendEmail;
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const results = [];

  for (const registration of registrations) {
    if (!registration.parishId || (parishFilter && registration.parishId !== parishFilter)) continue;
    if (!sacramentsEnabledFor(registration)) continue;
    const rows = await loadPastoralDigestRows(env, registration.parishId, upcomingThrough);
    const groups = buildPastoralDigestGroups(rows, today, upcomingDays);
    if (!groups.length) {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        status: 'skipped',
        reason: 'nothing_due',
      });
      continue;
    }

    for (const group of groups) {
      const resultBase = {
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        to: [group.recipientEmail],
        digestDate: today,
        itemCount: group.total,
        overdueCount: group.overdue.length,
        dueTodayCount: group.dueToday.length,
        upcomingCount: group.upcoming.length,
      };
      if (dryRun) {
        results.push({ ...resultBase, status: 'dry_run' });
        continue;
      }

      const identity = await deliveryIdentity(registration.parishId, group.recipientEmail, today);
      const attemptedAt = new Date().toISOString();
      if (!(await beginDelivery(env, registration, group, identity, attemptedAt))) {
        results.push({ ...resultBase, status: 'skipped', reason: 'already_sent' });
        continue;
      }
      const message = digestMessage(appUrl, registration.parishName || '', group);
      let email;
      try {
        email = await emailSender(
          env,
          {
            from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
            to: [group.recipientEmail],
            reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
            ...message,
          },
          { idempotencyKey: identity.idempotencyKey, timeoutMs: 15000 }
        );
      } catch (error) {
        email = { status: 'error', error: error?.message || String(error) };
      }
      const finishedAt = new Date().toISOString();
      await finishDelivery(env, identity, email, finishedAt);
      results.push({
        ...resultBase,
        status: email?.status || 'error',
        httpStatus: email?.httpStatus || 0,
      });
    }
  }

  return results;
}

export async function handleAdminDailyPastoralCareDigest(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-maintenance', {
    limit: 12,
    windowSeconds: 300,
  });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const body = await request.json().catch(() => ({}));
  const scheduledTime = body.scheduledTime || new Date().toISOString();
  const results = await sendDailyPastoralCareDigestEmails(env, scheduledTime, {
    dryRun: body.dryRun !== false,
    parishId: body.parishId || '',
  });
  return json({ ok: true, dryRun: body.dryRun !== false, scheduledTime, results });
}
