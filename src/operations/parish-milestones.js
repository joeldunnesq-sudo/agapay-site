import { d1All, d1First, d1Run } from '../lib/core.js';
import { loadAllRegistrations } from '../lib/registrations.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';
import {
  defaultMilestonePreferences,
  localOccasionClock,
  parishOccasions,
  relationshipSnapshot,
} from '../lib/parish-relationships.js';

export async function milestonePreferences(env, registration) {
  const row = await d1First(
    env,
    'SELECT data FROM parish_milestone_preferences WHERE reference = ?',
    registration.reference
  );
  return { ...defaultMilestonePreferences(registration), ...(row ? JSON.parse(row.data) : {}) };
}

export async function annualGivingReport(env, registration, now = new Date()) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const prior = new Date(start);
  prior.setUTCFullYear(prior.getUTCFullYear() - 1);
  const rows = await d1All(
    env,
    `SELECT
    CASE WHEN created_at >= ? THEN 'current' ELSE 'prior' END AS period,
    LOWER(COALESCE(json_extract(data, '$.currency'), 'usd')) AS currency,
    COUNT(*) AS gifts, COUNT(DISTINCT NULLIF(LOWER(TRIM(donor_email)), '')) AS donors,
    SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)) AS cents,
    SUM(CASE WHEN COALESCE(stripe_subscription_id, '') != '' THEN COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0) ELSE 0 END) AS recurring
    FROM donor_offerings WHERE parish_id = ? AND payment_status = 'paid' AND created_at >= ? AND created_at < ?
    GROUP BY period, currency`,
    start.toISOString(),
    registration.parishId,
    prior.toISOString(),
    end.toISOString()
  );
  const current = rows.filter((r) => r.period === 'current');
  const usd = current.find((r) => r.currency === 'usd');
  const earlier = rows.find((r) => r.period === 'prior' && r.currency === 'usd');
  const donors = await d1First(
    env,
    `SELECT COUNT(*) AS total, SUM(CASE WHEN first_gift < ? THEN 1 ELSE 0 END) AS returning_count FROM (
    SELECT LOWER(TRIM(donor_email)) AS email, MIN(created_at) AS first_gift, MAX(created_at) AS last_gift
    FROM donor_offerings WHERE parish_id = ? AND payment_status = 'paid' AND created_at < ? AND COALESCE(TRIM(donor_email), '') != ''
    GROUP BY LOWER(TRIM(donor_email)) HAVING MAX(created_at) >= ?)`,
    start.toISOString(),
    registration.parishId,
    end.toISOString(),
    start.toISOString()
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    currencies: current,
    donors: Number(donors?.total || 0),
    returning: Number(donors?.returning_count || 0),
    growth:
      Date.parse(registration.receivedAt) <= prior.getTime() && earlier?.cents > 0
        ? ((Number(usd?.cents || 0) - earlier.cents) / earlier.cents) * 100
        : null,
  };
}

export async function buildMilestoneMessage(env, registration, occasion, now = new Date()) {
  const prefs = await milestonePreferences(env, registration);
  const name = registration.parishName || 'your parish';
  const to = occasion.kind === 'feast' ? prefs.feastRecipient : prefs.recipient;
  const title = occasion.kind === 'feast' ? 'A blessed patronal feast' : 'A year of generosity. A ministry of love.';
  const subject =
    occasion.kind === 'feast' ? `A blessed ${occasion.title} to ${name}` : `Your year of giving with AGAPAY · ${name}`;
  let body;
  let report = null;
  if (occasion.kind === 'feast') {
    body = `<p>To the clergy and faithful of ${htmlEscape(name)},</p><p>Wishing your community a blessed patronal feast of ${htmlEscape(occasion.title)}. May this celebration bring joy, renewal, and strength to your parish's ministry.</p><p>It is a privilege to support your community and the generosity that sustains it.</p><p style="font:28px Georgia,serif;color:#957038">Many years!</p>`;
  } else {
    report = await annualGivingReport(env, registration, now);
    const money = (row) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: /^[a-z]{3}$/.test(row.currency) ? row.currency.toUpperCase() : 'USD',
      }).format(row.cents / 100);
    const giving = report.currencies.length
      ? report.currencies
          .map(
            (row) =>
              `<tr><td style="padding:14px;border-bottom:1px solid #deded5">Giving received (${htmlEscape(row.currency.toUpperCase())})</td><td style="padding:14px;font-weight:bold;text-align:right">${htmlEscape(money(row))}</td></tr>`
          )
          .join('')
      : '<tr><td style="padding:14px">No paid gifts recorded during this period.</td></tr>';
    const recurring = report.currencies.reduce((n, r) => n + Number(r.recurring), 0);
    body = `<p>To the clergy and community of ${htmlEscape(name)},</p><p>Happy anniversary with AGAPAY. Thank you for letting us serve your parish. Every gift is an act of love, and we are grateful to play a small part in your ministry.</p><p style="font-size:12px;color:#686b66">Your year in review · ${report.start} through ${report.end} (end exclusive, UTC)</p><table role="presentation" style="width:100%;background:#f1f5f2;border:1px solid #d5dfd7;border-collapse:collapse">${giving}<tr><td style="padding:14px">Donors who gave</td><td style="padding:14px;text-align:right;font-weight:bold">${report.donors}</td></tr><tr><td style="padding:14px">New / returning donors</td><td style="padding:14px;text-align:right">${report.donors - report.returning} / ${report.returning}</td></tr></table>`;
    for (const row of report.currencies)
      body += `<p>Recurring gifts contributed ${htmlEscape(money({ ...row, cents: row.recurring }))}${row.cents > 0 ? ` (${Math.round((row.recurring / row.cents) * 100)}% of recorded ${htmlEscape(row.currency.toUpperCase())} giving)` : ''}.</p>`;
    if (report.growth !== null)
      body += `<p>Recorded USD giving ${report.growth >= 0 ? 'increased' : 'decreased'} ${Math.abs(report.growth).toFixed(1)}% compared with the preceding twelve months.</p>`;
    body += `<h2 style="font:22px Georgia,serif;color:#173e39">An idea for the year ahead</h2><p>${report.donors === 0 ? 'Share your parish giving page in your bulletin and on your website so parishioners can find it easily.' : recurring > 0 ? 'Thank your regular givers and share a concrete story of the ministry their generosity supports.' : 'Invite parishioners to consider a recurring gift, helping your parish plan its ministry with greater confidence.'}</p><p style="font-size:12px;color:#686b66">These figures reflect paid gifts recorded through AGAPAY, before processing fees. They exclude offline giving and do not represent a bank reconciliation. Returning donors are identified by an earlier recorded gift using the same email address.</p>`;
  }
  body +=
    '<p style="font-size:12px;color:#686b66">To change the recipient or stop these annual messages, reply to this email.</p>';
  return {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to: [to],
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    subject,
    html: agapayEmailHtml(env.AGAPAY_APP_URL, title, `<div style="font-size:15px;line-height:1.8">${body}</div>`),
    report,
  };
}

export async function runParishMilestones(env, scheduledTime) {
  if (!env.AGAPAY_DB) return { status: 'not_configured' };
  const now = new Date(scheduledTime || Date.now());
  const registrations = await loadAllRegistrations(env, { hardLimit: 25000 });
  if (registrations.length >= 25000)
    throw new Error('Parish relationship scan limit reached; expand pagination before continuing.');
  await d1Run(
    env,
    'INSERT INTO parish_relationship_snapshots(day, data) VALUES (?, ?) ON CONFLICT(day) DO NOTHING',
    now.toISOString().slice(0, 10),
    JSON.stringify(relationshipSnapshot(registrations))
  );
  let sent = 0;
  for (const r of registrations) {
    if (r.status !== 'verified' || !r.parishId || ['cancelled', 'canceled', 'unpaid'].includes(r.subscriptionStatus))
      continue;
    const prefs = await milestonePreferences(env, r);
    const clock = localOccasionClock(now, prefs.timeZone);
    if (clock.hour !== 9) continue;
    for (const occasion of parishOccasions(r, clock.date, 0).filter((item) => item.date === clock.date)) {
      if (!prefs[occasion.kind] || !env.RESEND_API_KEY) continue;
      const message = await buildMilestoneMessage(env, r, occasion, now);
      if (!message.to[0]) continue;
      const id = `${r.reference}:${occasion.kind}:${occasion.date}`;
      // Claim once in D1 before the external side effect. Ambiguous outcomes need
      // review, never an automatic resend after the provider's idempotency window.
      const claim = await d1Run(
        env,
        `INSERT INTO parish_milestone_deliveries(id, reference, kind, occasion_date, status, updated_at) VALUES (?, ?, ?, ?, 'sending', ?) ON CONFLICT(id) DO NOTHING`,
        id,
        r.reference,
        occasion.kind,
        occasion.date,
        now.toISOString()
      );
      if (!claim?.meta?.changes) continue;
      const payload = { ...message };
      delete payload.report;
      const result = await sendEmail(env, payload, { idempotencyKey: id });
      const status = result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'unconfirmed';
      await d1Run(
        env,
        'UPDATE parish_milestone_deliveries SET status = ?, updated_at = ?, detail = ? WHERE id = ?',
        status,
        now.toISOString(),
        result.id || result.detail || result.status,
        id
      );
      if (status === 'sent') sent++;
    }
  }
  return { status: 'complete', sent };
}
