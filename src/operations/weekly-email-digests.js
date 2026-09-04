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
  unauthorized,
} from '../lib/core.js';
import { bookstoreEnabledFor, sacramentsEnabledFor } from '../lib/entitlements.js';
import { saveRegistrationRecord } from '../handlers/parish.js';
import { loadCommemorationEntries, weekWindow } from '../handlers/parish-commemorations.js';
import { sacramentTypeLabel } from '../handlers/parish-sacraments.js';
import { sendWeeklyAnnouncementDigestEmails } from '../handlers/parish-communications.js';
import { loadAllRegistrations } from '../lib/registrations.js';
import { requireAdmin } from '../handlers/admin.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';

function formatCommemorationNames(entries, field) {
  const names = entries.flatMap((entry) => (Array.isArray(entry[field]) ? entry[field] : []));
  if (!names.length) return '<p style="margin:0;color:#6F6A60;">No names submitted.</p>';
  return `<ul style="margin:0 0 0 18px;padding:0;color:#171715;line-height:1.7;">${names.map((name) => `<li>${htmlEscape(name)}</li>`).join('')}</ul>`;
}

function formatUsd(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function commerceWeeklyReportKey(module, start, end) {
  return `${String(module || 'bookstore')}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
}

function emailIdFromSendResult(email = {}) {
  if (!email.body) return '';
  try {
    const parsed = JSON.parse(email.body);
    return parsed.id || '';
  } catch {
    return '';
  }
}

export async function sendWeeklyCommemorationEmails(env, scheduledTime, options = {}) {
  const registrations = await loadAllRegistrations(env, { status: 'verified' });
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const { start, end } = weekWindow(new Date(scheduledTime || Date.now()));
  const parishFilter = String(options.parishId || '').trim();
  const dryRun = Boolean(options.dryRun);

  const results = [];
  for (const registration of registrations) {
    if (!registration.parishId) continue;
    if (parishFilter && registration.parishId !== parishFilter) continue;
    if (!registration.priestEmail) {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        status: 'skipped',
        reason: 'missing_priest_email',
      });
      continue;
    }
    const entries = await loadCommemorationEntries(env, registration.parishId, start, end);
    const livingCount = entries.reduce(
      (total, entry) => total + (Array.isArray(entry.living) ? entry.living.length : 0),
      0
    );
    const departedCount = entries.reduce(
      (total, entry) => total + (Array.isArray(entry.departed) ? entry.departed.length : 0),
      0
    );
    if (dryRun) {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        to: registration.priestEmail,
        status: 'dry_run',
        entryCount: entries.length,
        livingCount,
        departedCount,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
      });
      continue;
    }
    const email = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
      to: [registration.priestEmail],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
      subject: `Weekly AGAPAY commemorations for ${registration.parishName || 'your parish'}`,
      html: agapayEmailHtml(
        appUrl,
        'Weekly Commemoration List',
        `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Here is this week's AGAPAY commemoration list for <strong>${htmlEscape(registration.parishName || 'your parish')}</strong>.</p>
        <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Living</p>
          ${formatCommemorationNames(entries, 'living')}
        </div>
        <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Departed</p>
          ${formatCommemorationNames(entries, 'departed')}
        </div>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#6F6A60;">This message is sent every Saturday morning, even when no names were submitted.</p>
      `
      ),
      text: `Weekly AGAPAY commemorations for ${registration.parishName || 'your parish'}\n\nLiving:\n${entries.flatMap((entry) => entry.living || []).join('\n') || 'No names submitted.'}\n\nDeparted:\n${entries.flatMap((entry) => entry.departed || []).join('\n') || 'No names submitted.'}`,
    });
    results.push({
      parishId: registration.parishId,
      parishName: registration.parishName || '',
      to: registration.priestEmail,
      status: email.status,
      httpStatus: email.httpStatus || 0,
      entryCount: entries.length,
      livingCount,
      departedCount,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
    });
  }

  return results;
}

export async function handleAdminWeeklyCommemorationEmails(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-maintenance', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const body = await request.json().catch(() => ({}));
  const scheduledTime = body.scheduledTime || new Date().toISOString();
  const results = await sendWeeklyCommemorationEmails(env, scheduledTime, {
    dryRun: body.dryRun !== false,
    parishId: body.parishId || '',
  });
  return json({
    ok: true,
    dryRun: body.dryRun !== false,
    scheduledTime,
    results,
  });
}

async function loadWeeklyCommerceReport(env, parishId, start, end) {
  if (!d1(env) || !parishId) return null;
  const orders = await d1All(
    env,
    `SELECT id, order_number, donor_email, donor_name, item_description, quantity,
            subtotal_cents, tax_cents, total_charged_cents, parish_net_cents,
            fulfillment_status, created_at, completed_at
     FROM commerce_orders
     WHERE parish_id = ? AND commerce_module = 'bookstore'
       AND payment_status = 'paid' AND created_at >= ? AND created_at <= ?
     ORDER BY created_at DESC, id DESC`,
    parishId,
    start.toISOString(),
    end.toISOString()
  );
  const itemRows = await d1All(
    env,
    `SELECT i.item_name, COALESCE(SUM(i.quantity),0) AS units,
            COALESCE(SUM(i.total_cents),0) AS gross, COUNT(DISTINCT i.order_id) AS orders
     FROM commerce_order_items i
     JOIN commerce_orders o ON o.id = i.order_id
     WHERE i.parish_id = ? AND i.commerce_module = 'bookstore'
       AND o.payment_status = 'paid' AND o.created_at >= ? AND o.created_at <= ?
     GROUP BY i.item_name
     ORDER BY gross DESC
     LIMIT 8`,
    parishId,
    start.toISOString(),
    end.toISOString()
  );
  const totals = orders.reduce(
    (sum, order) => ({
      subtotalCents: sum.subtotalCents + Number(order.subtotal_cents || 0),
      taxCents: sum.taxCents + Number(order.tax_cents || 0),
      totalChargedCents: sum.totalChargedCents + Number(order.total_charged_cents || 0),
      parishNetCents: sum.parishNetCents + Number(order.parish_net_cents || 0),
      units: sum.units + Number(order.quantity || 0),
    }),
    { subtotalCents: 0, taxCents: 0, totalChargedCents: 0, parishNetCents: 0, units: 0 }
  );
  return {
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.order_number || '',
      donorName: order.donor_name || order.donor_email || 'Customer',
      donorEmail: order.donor_email || '',
      summary: order.item_description || 'Bookstore order',
      quantity: Number(order.quantity || 0),
      totalChargedCents: Number(order.total_charged_cents || 0),
      parishNetCents: Number(order.parish_net_cents || 0),
      fulfillmentStatus: order.fulfillment_status || 'pending',
      createdAt: order.created_at || order.completed_at || '',
    })),
    topItems: itemRows.map((item) => ({
      name: item.item_name || 'Bookstore item',
      units: Number(item.units || 0),
      grossCents: Number(item.gross || 0),
      orders: Number(item.orders || 0),
    })),
    totals,
  };
}

function commerceOrdersHtml(orders = []) {
  if (!orders.length) return '<p style="margin:0;color:#6F6A60;">No paid bookstore orders this week.</p>';
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;color:#171715;font-size:13px;">
    <thead><tr>
      <th align="left" style="padding:0 8px 8px 0;border-bottom:1px solid rgba(166,159,145,0.34);">Order</th>
      <th align="left" style="padding:0 8px 8px;border-bottom:1px solid rgba(166,159,145,0.34);">Customer</th>
      <th align="left" style="padding:0 8px 8px;border-bottom:1px solid rgba(166,159,145,0.34);">Items</th>
      <th align="right" style="padding:0 0 8px 8px;border-bottom:1px solid rgba(166,159,145,0.34);">Total</th>
    </tr></thead>
    <tbody>${orders
      .slice(0, 25)
      .map(
        (order) => `<tr>
      <td style="padding:9px 8px 9px 0;border-bottom:1px solid rgba(166,159,145,0.18);">${htmlEscape(order.orderNumber || order.id.slice(-8))}</td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(166,159,145,0.18);">${htmlEscape(order.donorName)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(166,159,145,0.18);">${htmlEscape(order.summary)}${order.quantity ? ` (${order.quantity})` : ''}</td>
      <td align="right" style="padding:9px 0 9px 8px;border-bottom:1px solid rgba(166,159,145,0.18);">${formatUsd(order.totalChargedCents)}</td>
    </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function commerceTopItemsHtml(items = []) {
  if (!items.length) return '<p style="margin:0;color:#6F6A60;">No top items to report yet.</p>';
  return `<ul style="margin:0 0 0 18px;padding:0;color:#171715;line-height:1.7;">${items.map((item) => `<li>${htmlEscape(item.name)} &mdash; ${item.units} sold, ${formatUsd(item.grossCents)}</li>`).join('')}</ul>`;
}

async function recordCommerceWeeklyReport(env, report) {
  if (!d1(env)) return;
  const now = new Date().toISOString();
  await d1Run(
    env,
    `INSERT INTO commerce_weekly_reports
      (id, parish_id, commerce_module, week_start, week_end, report_key, recipient_email,
       subject, order_count, subtotal_cents, tax_cents, total_charged_cents, parish_net_cents,
       status, email_id, error, sent_at, created_at, updated_at)
     VALUES (?, ?, 'bookstore', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(parish_id, report_key) DO UPDATE SET
       recipient_email = excluded.recipient_email,
       subject = excluded.subject,
       order_count = excluded.order_count,
       subtotal_cents = excluded.subtotal_cents,
       tax_cents = excluded.tax_cents,
       total_charged_cents = excluded.total_charged_cents,
       parish_net_cents = excluded.parish_net_cents,
       status = excluded.status,
       email_id = excluded.email_id,
       error = excluded.error,
       sent_at = excluded.sent_at,
       updated_at = excluded.updated_at`,
    report.id,
    report.parishId,
    report.weekStart,
    report.weekEnd,
    report.reportKey,
    report.recipientEmail || '',
    report.subject || '',
    report.orderCount || 0,
    report.subtotalCents || 0,
    report.taxCents || 0,
    report.totalChargedCents || 0,
    report.parishNetCents || 0,
    report.status || 'pending',
    report.emailId || '',
    report.error || '',
    report.sentAt || '',
    now,
    now
  );
}

export async function sendWeeklyTreasurerCommerceEmails(env, scheduledTime, options = {}) {
  const registrations = await loadAllRegistrations(env, { status: 'verified' });
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const { start, end } = weekWindow(new Date(scheduledTime || Date.now()));
  const parishFilter = String(options.parishId || '').trim();
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const reportKey = commerceWeeklyReportKey('bookstore', start, end);
  const results = [];

  for (const registration of registrations) {
    if (!registration.parishId) continue;
    if (parishFilter && registration.parishId !== parishFilter) continue;
    if (!bookstoreEnabledFor(registration)) continue;
    const recipient = registration.treasurerEmail || registration.priestEmail || '';
    if (!recipient) {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        status: 'skipped',
        reason: 'missing_treasurer_email',
      });
      continue;
    }

    const existing = d1(env)
      ? await d1First(
          env,
          `SELECT status, sent_at FROM commerce_weekly_reports WHERE parish_id = ? AND report_key = ?`,
          registration.parishId,
          reportKey
        )
      : null;
    if (!dryRun && !force && existing?.status === 'sent') {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        to: recipient,
        status: 'skipped',
        reason: 'already_sent',
        sentAt: existing.sent_at || '',
      });
      continue;
    }

    const report = await loadWeeklyCommerceReport(env, registration.parishId, start, end);
    const totals = report?.totals || {};
    const orderCount = report?.orders?.length || 0;
    if (!orderCount) {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        to: recipient,
        status: dryRun ? 'dry_run' : 'skipped',
        reason: 'no_paid_orders',
        orderCount: 0,
        weekStart: start.toISOString(),
        weekEnd: end.toISOString(),
      });
      continue;
    }

    const subject = `Weekly AGAPAY bookstore report for ${registration.parishName || 'your parish'}`;
    const resultBase = {
      parishId: registration.parishId,
      parishName: registration.parishName || '',
      to: recipient,
      reportKey,
      orderCount,
      subtotalCents: totals.subtotalCents || 0,
      taxCents: totals.taxCents || 0,
      totalChargedCents: totals.totalChargedCents || 0,
      parishNetCents: totals.parishNetCents || 0,
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
    };
    if (dryRun) {
      results.push({ ...resultBase, status: 'dry_run' });
      continue;
    }

    const email = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
      to: [recipient],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
      subject,
      html: agapayEmailHtml(
        appUrl,
        'Weekly Bookstore Report',
        `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Here is this week's AGAPAY bookstore sales report for <strong>${htmlEscape(registration.parishName || 'your parish')}</strong>.</p>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 20px;">
          <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:14px;"><p style="margin:0 0 4px;color:#6F6A60;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;">Orders</p><strong style="font-size:24px;color:#171715;">${orderCount}</strong></div>
          <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:14px;"><p style="margin:0 0 4px;color:#6F6A60;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;">Gross Sales</p><strong style="font-size:24px;color:#171715;">${formatUsd(totals.totalChargedCents)}</strong></div>
          <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:14px;"><p style="margin:0 0 4px;color:#6F6A60;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;">Tax Collected</p><strong style="font-size:24px;color:#171715;">${formatUsd(totals.taxCents)}</strong></div>
          <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:14px;"><p style="margin:0 0 4px;color:#6F6A60;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;">Parish Net</p><strong style="font-size:24px;color:#171715;">${formatUsd(totals.parishNetCents)}</strong></div>
        </div>
        <div style="background:#FFFFFF;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Orders</p>
          ${commerceOrdersHtml(report.orders)}
        </div>
        <div style="background:#FFFFFF;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Top Items</p>
          ${commerceTopItemsHtml(report.topItems)}
        </div>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#6F6A60;">This report is sent after the Saturday weekly close for paid bookstore orders in AGAPAY.</p>
      `
      ),
      text: [
        `Weekly AGAPAY bookstore report for ${registration.parishName || 'your parish'}`,
        '',
        `Orders: ${orderCount}`,
        `Gross sales: ${formatUsd(totals.totalChargedCents)}`,
        `Tax collected: ${formatUsd(totals.taxCents)}`,
        `Parish net: ${formatUsd(totals.parishNetCents)}`,
        '',
        'Orders:',
        ...report.orders.map(
          (order) =>
            `${order.orderNumber || order.id}: ${order.donorName} - ${order.summary} - ${formatUsd(order.totalChargedCents)}`
        ),
        '',
        'Top items:',
        ...(report.topItems.length
          ? report.topItems.map((item) => `${item.name}: ${item.units} sold, ${formatUsd(item.grossCents)}`)
          : ['No top items to report.']),
      ].join('\n'),
    });
    const sentAt = email.status === 'sent' ? new Date().toISOString() : '';
    await recordCommerceWeeklyReport(env, {
      id: `commerce_report_${registration.parishId}_${reportKey}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
      ...resultBase,
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      recipientEmail: recipient,
      subject,
      status: email.status,
      emailId: emailIdFromSendResult(email),
      error: email.status === 'sent' ? '' : email.body || email.error || '',
      sentAt,
    });
    results.push({ ...resultBase, status: email.status, httpStatus: email.httpStatus || 0, sentAt });
  }

  return results;
}

export async function handleAdminWeeklyTreasurerCommerceEmails(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-maintenance', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const body = await request.json().catch(() => ({}));
  const scheduledTime = body.scheduledTime || new Date().toISOString();
  const results = await sendWeeklyTreasurerCommerceEmails(env, scheduledTime, {
    dryRun: body.dryRun !== false,
    parishId: body.parishId || '',
    force: body.force === true,
  });
  return json({
    ok: true,
    dryRun: body.dryRun !== false,
    scheduledTime,
    results,
  });
}

// Weekly digest to the priest/treasurer for each Sacraments & Services
// enabled parish, summarizing what needs attention: unacknowledged
// requests (flagging ones over 48h old as overdue) and anything scheduled
// in the coming week. Deliberately weekly, not daily -- a per-parish
// reminder cadence the user asked to keep low-noise. If a parish has
// nothing pending, no email is sent at all that week.
export async function sendWeeklySacramentDigestEmails(env, scheduledTime, options = {}) {
  if (!d1(env)) return [];
  const registrations = await loadAllRegistrations(env, { status: 'verified' });
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const now = new Date(scheduledTime || Date.now());
  const overdueThreshold = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const todayIso = now.toISOString().slice(0, 10);
  const weekAheadIso = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const parishFilter = String(options.parishId || '').trim();
  const dryRun = Boolean(options.dryRun);
  const results = [];

  for (const registration of registrations) {
    if (!registration.parishId) continue;
    if (parishFilter && registration.parishId !== parishFilter) continue;
    if (!sacramentsEnabledFor(registration)) continue;
    const recipient = registration.priestEmail || registration.treasurerEmail || '';
    if (!recipient) {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        status: 'skipped',
        reason: 'missing_recipient_email',
      });
      continue;
    }

    const needsResponse = await d1All(
      env,
      `SELECT id, sacrament_type, other_type_label, created_at FROM sacrament_requests
       WHERE parish_id = ? AND status = 'requested' ORDER BY created_at ASC LIMIT 25`,
      registration.parishId
    );
    const overdue = needsResponse.filter((r) => r.created_at < overdueThreshold);
    const thisWeek = await d1All(
      env,
      `SELECT id, sacrament_type, other_type_label, confirmed_date FROM sacrament_requests
       WHERE parish_id = ? AND status = 'scheduled' AND confirmed_date BETWEEN ? AND ?
       ORDER BY confirmed_date ASC LIMIT 25`,
      registration.parishId,
      todayIso,
      weekAheadIso
    );
    const memorials = await d1All(
      env,
      `SELECT m.id, m.marker_type, m.target_date, m.status, p.preferred_name,
          c.assigned_priest_name, c.assigned_priest_email
       FROM sacrament_memorial_markers m
       JOIN sacrament_memorial_cycles c ON c.id = m.cycle_id
       JOIN directory_people p ON p.id = c.person_id
       WHERE c.parish_id = ? AND c.status = 'active'
         AND m.status = 'pending' AND m.remind_on <= ?
       ORDER BY m.target_date ASC LIMIT 25`,
      registration.parishId,
      weekAheadIso
    ).catch((error) => {
      if (/sacrament_memorial_|no such table/i.test(String(error?.message || error || ''))) return [];
      throw error;
    });
    const pastoralRecipients = [
      ...new Set(memorials.map((row) => normalizeEmail(row.assigned_priest_email)).filter(Boolean)),
    ];
    const recipients = [...new Set([recipient, ...pastoralRecipients].filter(Boolean))];

    if (!needsResponse.length && !thisWeek.length && !memorials.length) {
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        status: 'skipped',
        reason: 'nothing_pending',
      });
      continue;
    }
    if (dryRun) {
      for (const digestRecipient of recipients) {
        const ownsGeneralQueue = normalizeEmail(digestRecipient) === normalizeEmail(recipient);
        const recipientMemorials = memorials.filter(
          (row) => normalizeEmail(row.assigned_priest_email) === normalizeEmail(digestRecipient)
        );
        results.push({
          parishId: registration.parishId,
          parishName: registration.parishName || '',
          to: [digestRecipient],
          status: 'dry_run',
          needsResponseCount: ownsGeneralQueue ? needsResponse.length : 0,
          overdueCount: ownsGeneralQueue ? overdue.length : 0,
          thisWeekCount: ownsGeneralQueue ? thisWeek.length : 0,
          memorialCount: recipientMemorials.length,
        });
      }
      continue;
    }

    const typeLabel = (row) => htmlEscape(row.other_type_label || sacramentTypeLabel(row.sacrament_type));
    const listItem = (label, meta) =>
      `<li style="margin:0 0 6px;">${label}${meta ? ` <span style="color:#6F6A60;">— ${htmlEscape(meta)}</span>` : ''}</li>`;
    const section = (title, rows, metaFn, labelFn = typeLabel) =>
      rows.length
        ? `<p style="margin:18px 0 6px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">${title}</p><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#171715;">${rows.map((r) => listItem(labelFn(r), metaFn(r))).join('')}</ul>`
        : '';

    const memorialLabel = (row) =>
      ({
        third_day: '3rd-day memorial',
        ninth_day: '9th-day memorial',
        fortieth_day: '40th-day memorial',
        six_month: 'Six-month memorial',
        first_anniversary: 'First-anniversary memorial',
        annual_anniversary: 'Annual memorial',
      })[row.marker_type] || 'Memorial service';
    for (const digestRecipient of recipients) {
      const ownsGeneralQueue = normalizeEmail(digestRecipient) === normalizeEmail(recipient);
      const recipientNeedsResponse = ownsGeneralQueue ? needsResponse : [];
      const recipientOverdue = ownsGeneralQueue ? overdue : [];
      const recipientThisWeek = ownsGeneralQueue ? thisWeek : [];
      const recipientMemorials = memorials.filter(
        (row) => normalizeEmail(row.assigned_priest_email) === normalizeEmail(digestRecipient)
      );
      if (!recipientNeedsResponse.length && !recipientThisWeek.length && !recipientMemorials.length) continue;
      const subject = recipientOverdue.length
        ? `${recipientOverdue.length} sacrament request${recipientOverdue.length === 1 ? '' : 's'} waiting on ${registration.parishName || 'your parish'}`
        : recipientMemorials.length
          ? `${recipientMemorials.length} memorial observance${recipientMemorials.length === 1 ? '' : 's'} to arrange at ${registration.parishName || 'your parish'}`
          : `Sacraments & Services: this week at ${registration.parishName || 'your parish'}`;
      const email = await sendEmail(env, {
        from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
        to: [digestRecipient],
        reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
        subject,
        html: agapayEmailHtml(
          appUrl,
          'Sacraments & Services — Weekly Digest',
          `
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#171715;">Here's what needs attention in your Sacraments &amp; Services care list for <strong>${htmlEscape(registration.parishName || 'your parish')}</strong>.</p>
          ${recipientOverdue.length ? `<p style="margin:0;padding:10px 14px;background:#FBEFE9;border:1px solid rgba(178,68,30,0.28);border-radius:10px;font-size:14px;color:#8B2A0E;"><strong>${recipientOverdue.length}</strong> request${recipientOverdue.length === 1 ? ' has' : 's have'} been waiting more than 48 hours for a response.</p>` : ''}
          ${section('Needs a response', recipientNeedsResponse, (r) => `waiting since ${new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)}
          ${section('Memorial observances to arrange', recipientMemorials, (r) => `${r.preferred_name} · ${r.target_date}`, memorialLabel)}
          ${section('Scheduled this week', recipientThisWeek, (r) => r.confirmed_date)}
          <p style="margin:18px 0 0;font-size:13px;color:#6F6A60;">Review and respond from your parish dashboard, under Sacraments &amp; Services → Follow-up.</p>
        `
        ),
        text: [
          subject,
          '',
          'Needs a response:',
          ...(recipientNeedsResponse.length
            ? recipientNeedsResponse.map(
                (r) => `- ${r.other_type_label || sacramentTypeLabel(r.sacrament_type)} (since ${r.created_at})`
              )
            : ['None']),
          '',
          'Memorial observances to arrange:',
          ...(recipientMemorials.length
            ? recipientMemorials.map((r) => `- ${memorialLabel(r)} for ${r.preferred_name} (target ${r.target_date})`)
            : ['None']),
          '',
          'Scheduled this week:',
          ...(recipientThisWeek.length
            ? recipientThisWeek.map(
                (r) => `- ${r.other_type_label || sacramentTypeLabel(r.sacrament_type)} on ${r.confirmed_date}`
              )
            : ['None']),
        ].join('\n'),
      });
      results.push({
        parishId: registration.parishId,
        parishName: registration.parishName || '',
        to: [digestRecipient],
        status: email.status,
        needsResponseCount: recipientNeedsResponse.length,
        overdueCount: recipientOverdue.length,
        thisWeekCount: recipientThisWeek.length,
        memorialCount: recipientMemorials.length,
      });
    }
  }

  return results;
}
export async function handleAdminWeeklySacramentDigest(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-maintenance', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const body = await request.json().catch(() => ({}));
  const scheduledTime = body.scheduledTime || new Date().toISOString();
  const results = await sendWeeklySacramentDigestEmails(env, scheduledTime, {
    dryRun: body.dryRun !== false,
    parishId: body.parishId || '',
  });
  return json({ ok: true, dryRun: body.dryRun !== false, scheduledTime, results });
}

export async function handleAdminWeeklyAnnouncementDigest(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-maintenance', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const body = await request.json().catch(() => ({}));
  const scheduledTime = body.scheduledTime || new Date().toISOString();
  const results = await sendWeeklyAnnouncementDigestEmails(env, scheduledTime, {
    dryRun: body.dryRun !== false,
    parishId: body.parishId || '',
    donorId: body.donorId || '',
  });
  return json({ ok: true, dryRun: body.dryRun !== false, scheduledTime, results });
}

// Sends a one-time heads-up email roughly 30 days before a parish's
// "Founding 20" free-year AGAPAY Parish + comp grant expires, so nobody
// is surprised when access lapses. Marks the grant with reminderSentAt so
// this never fires twice for the same grant, even though this function
// runs every week.
export async function sendStewardshipCompExpiryReminders(env) {
  const registrations = await loadAllRegistrations(env, { status: 'verified' });
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const results = [];
  for (const registration of registrations) {
    const comp = registration.stewardshipComp;
    if (!comp?.active || !comp?.expiresAt) continue;
    if (comp.reminderSentAt) continue; // already reminded for this grant

    const expiresAt = new Date(comp.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) continue;
    const msUntilExpiry = expiresAt - now;
    // Fire once the grant is within 30 days of expiring (and hasn't already
    // expired outright — an already-lapsed grant gets no reminder, since a
    // "heads up, this expired a while ago" email isn't useful).
    if (msUntilExpiry > THIRTY_DAYS_MS || msUntilExpiry < 0) continue;

    const to = [
      ...new Set(
        [registration.priestEmail, registration.treasurerEmail, registration.email, registration.contactEmail]
          .filter(Boolean)
          .map((addr) => String(addr).trim().toLowerCase())
      ),
    ];
    if (!to.length) continue;

    const expiresLabel = new Date(comp.expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const daysLeft = Math.max(1, Math.round(msUntilExpiry / (24 * 60 * 60 * 1000)));

    const email = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
      to,
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
      subject: `Your free year of AGAPAY Parish + ends ${expiresLabel}`,
      html: agapayEmailHtml(
        appUrl,
        'AGAPAY Parish + — Free Year Ending Soon',
        `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">
          As one of our founding 20 parishes, <strong>${htmlEscape(registration.parishName || 'your parish')}</strong>
          received a free year of AGAPAY Parish +. That year ends on
          <strong>${expiresLabel}</strong> — about ${daysLeft} days from now.
        </p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">
          No action is needed if you'd simply like to let it lapse. If you'd like to continue with
          AGAPAY Parish + afterward, you can add it as a paid add-on to your parish's AGAPAY account
          at any time from your dashboard.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#6F6A60;">
          Thank you for being one of the first parishes to use AGAPAY Parish + — your feedback has
          shaped it directly. Reach out any time with questions.
        </p>
      `
      ),
      text: `Your free year of AGAPAY Parish + ends ${expiresLabel}\n\nAs one of our founding 20 parishes, ${registration.parishName || 'your parish'} received a free year of AGAPAY Parish +, ending ${expiresLabel} (about ${daysLeft} days from now).\n\nNo action is needed if you'd like to let it lapse. If you'd like to continue afterward, you can add AGAPAY Parish + as a paid add-on any time from your dashboard.\n\nThank you for being one of the first parishes to use it.`,
    });

    if (email.status !== 'not_configured') {
      registration.stewardshipComp = { ...comp, reminderSentAt: new Date().toISOString() };
      await saveRegistrationRecord(env, registration.reference, registration);
    }

    results.push({ parishId: registration.parishId, status: email.status });
  }

  return results;
}
