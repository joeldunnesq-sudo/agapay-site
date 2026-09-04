import { calendarLabel, liturgicalFeastsForYear, nextLiturgicalFeast, orthodoxPascha } from '../liturgical-calendar.js';
import { enrichLiturgicalDayWithOrthocal } from '../learn/readings-source.js';
import {
  d1,
  d1All,
  d1SetSetting,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  sha256Hex,
} from '../lib/core.js';
import { requireDonor } from './parish.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';

export async function handleWaitlist(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'waitlist', { limit: 8, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const product = String(body.product || '')
    .trim()
    .toLowerCase();
  const productLabels = {
    marketplace: 'AGAPAY Marketplace',
    directory: 'AGAPAY Directory',
  };
  if (!productLabels[product]) return json({ error: 'Choose a valid waitlist.' }, { status: 400 });

  const email = normalizeEmail(body.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const now = new Date().toISOString();
  const entry = {
    product,
    productLabel: productLabels[product],
    email,
    source: String(body.source || 'myagapay').slice(0, 80),
    createdAt: now,
    updatedAt: now,
    userAgent: request.headers.get('user-agent') || '',
    referer: request.headers.get('referer') || '',
  };
  const key = `waitlist:${product}:${await sha256Hex(email)}`;
  const value = JSON.stringify(entry);

  if (d1(env)) {
    await d1SetSetting(env, key, value);
  } else {
    await env.AGAPAY_REGISTRATIONS.put(key, value);
  }

  const notifyTo = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app';
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const emailResult = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to: [notifyTo],
    reply_to: email,
    subject: `${productLabels[product]} waitlist signup`,
    html: agapayEmailHtml(
      appUrl,
      `${productLabels[product]} waitlist`,
      `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A new person joined the <strong>${htmlEscape(productLabels[product])}</strong> waitlist.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px;margin:0 0 18px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Email:</strong> ${htmlEscape(email)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Source:</strong> ${htmlEscape(entry.source)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Time:</strong> ${htmlEscape(now)}</p>
      </div>
    `
    ),
    text: `${productLabels[product]} waitlist signup\n\nEmail: ${email}\nSource: ${entry.source}\nTime: ${now}`,
  });

  return json({
    ok: true,
    product,
    productLabel: productLabels[product],
    emailSent: emailResult.status === 'sent',
  });
}

export async function handleDirectoryIntake(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'directory-intake', { limit: 6, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    String(body.website || '').trim() &&
    !String(body.website || '').startsWith('http') &&
    String(body.website || '').includes('://')
  ) {
    return json({ error: 'Enter a valid website URL.' }, { status: 400 });
  }

  const kind = String(body.kind || 'business')
    .trim()
    .toLowerCase();
  const allowedKinds = new Set(['business', 'church', 'ministry', 'school', 'monastery', 'nonprofit', 'other']);
  if (!allowedKinds.has(kind)) return json({ error: 'Choose a valid listing type.' }, { status: 400 });

  const name = String(body.name || '')
    .trim()
    .slice(0, 160);
  const contactName = String(body.contactName || '')
    .trim()
    .slice(0, 120);
  const contactEmail = normalizeEmail(body.contactEmail);
  if (!name) return json({ error: 'Enter the organization name.' }, { status: 400 });
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return json({ error: 'Enter a valid contact email.' }, { status: 400 });
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const now = new Date().toISOString();
  const website = String(body.website || '')
    .trim()
    .slice(0, 240);
  const normalizedWebsite = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;
  const entry = {
    id: `dir_${await sha256Hex(`${kind}:${name}:${contactEmail}:${now}`)}`,
    status: 'submitted',
    kind,
    name,
    contactName,
    contactEmail,
    phone: String(body.phone || '')
      .trim()
      .slice(0, 80),
    address1: String(body.address1 || '')
      .trim()
      .slice(0, 180),
    address2: String(body.address2 || '')
      .trim()
      .slice(0, 120),
    city: String(body.city || '')
      .trim()
      .slice(0, 100),
    state: String(body.state || '')
      .trim()
      .slice(0, 80),
    postalCode: String(body.postalCode || '')
      .trim()
      .slice(0, 30),
    country: String(body.country || 'United States')
      .trim()
      .slice(0, 80),
    website: normalizedWebsite,
    jurisdiction: String(body.jurisdiction || '')
      .trim()
      .slice(0, 140),
    category: String(body.category || '')
      .trim()
      .slice(0, 120),
    description: String(body.description || '')
      .trim()
      .slice(0, 1400),
    services: String(body.services || '')
      .trim()
      .slice(0, 800),
    source: String(body.source || 'directory-page').slice(0, 80),
    createdAt: now,
    updatedAt: now,
    userAgent: request.headers.get('user-agent') || '',
    referer: request.headers.get('referer') || '',
  };

  const key = `directory:intake:${entry.id}`;
  const value = JSON.stringify(entry);
  if (d1(env)) {
    await d1SetSetting(env, key, value);
  } else {
    await env.AGAPAY_REGISTRATIONS.put(key, value);
  }

  const location = [entry.address1, entry.address2, entry.city, entry.state, entry.postalCode, entry.country]
    .filter(Boolean)
    .join(', ');
  const notifyTo = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app';
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const emailResult = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to: [notifyTo],
    reply_to: contactEmail,
    subject: `AGAPAY Directory submission: ${name}`,
    html: agapayEmailHtml(
      appUrl,
      'New Directory Submission',
      `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A new organization submitted information for the AGAPAY Directory.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px;margin:0 0 18px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Name:</strong> ${htmlEscape(entry.name)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Type:</strong> ${htmlEscape(entry.kind)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Category:</strong> ${htmlEscape(entry.category || 'Not provided')}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Contact:</strong> ${htmlEscape(entry.contactName || 'Not provided')} - ${htmlEscape(entry.contactEmail)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Phone:</strong> ${htmlEscape(entry.phone || 'Not provided')}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Address:</strong> ${htmlEscape(location || 'Not provided')}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Website:</strong> ${htmlEscape(entry.website || 'Not provided')}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Submitted:</strong> ${htmlEscape(now)}</p>
      </div>
      ${entry.description ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#171715;"><strong>Description:</strong><br>${htmlEscape(entry.description)}</p>` : ''}
      ${entry.services ? `<p style="margin:0;font-size:14px;line-height:1.7;color:#171715;"><strong>Helpful notes / services:</strong><br>${htmlEscape(entry.services)}</p>` : ''}
    `
    ),
    text: `AGAPAY Directory submission\n\nName: ${entry.name}\nType: ${entry.kind}\nCategory: ${entry.category}\nContact: ${entry.contactName} <${entry.contactEmail}>\nPhone: ${entry.phone}\nAddress: ${location}\nWebsite: ${entry.website}\nDescription: ${entry.description}\nNotes: ${entry.services}\nSubmitted: ${now}`,
  });

  return json({
    ok: true,
    id: entry.id,
    emailSent: emailResult.status === 'sent',
  });
}

export function handleLiturgicalCalendar(request) {
  const url = new URL(request.url);
  const year = Math.max(1900, Math.min(2199, Number(url.searchParams.get('year')) || new Date().getFullYear()));
  const calendar = String(url.searchParams.get('calendar') || 'julian')
    .toLowerCase()
    .includes('gregorian')
    ? 'gregorian'
    : 'julian';
  const nextFrom = url.searchParams.get('from');
  const fromDate = nextFrom && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) ? new Date(`${nextFrom}T00:00:00`) : new Date();

  return json({
    ok: true,
    year,
    calendar,
    label: calendarLabel(calendar),
    pascha: orthodoxPascha(year),
    feasts: liturgicalFeastsForYear(year, calendar),
    nextFeast: nextLiturgicalFeast(calendar, fromDate),
  });
}

async function loadDirectoryNamedaysForLiturgicalDay(env, request, civilDate) {
  if (!d1(env)) return [];
  const url = new URL(request.url);
  const requestedParishId = String(
    url.searchParams.get('parishId') || request.headers.get('X-AGAPAY-Parish-Id') || ''
  ).trim();
  if (!requestedParishId) return [];
  const donor = await requireDonor(request, env);
  if (!donor || donor.defaultParishId !== requestedParishId) return [];
  const monthDay = civilDate.slice(5);
  const rows = await d1All(
    env,
    `SELECT display_name, saint_name, feast_month_day
     FROM directory_household_namedays
     WHERE parish_id = ?1
       AND feast_month_day = ?2
       AND visibility = 'directory_members'
       AND active = 1
     ORDER BY display_name
     LIMIT 12`,
    requestedParishId,
    monthDay
  ).catch(() => []);
  return rows
    .map((row) => ({
      displayName: row.display_name || '',
      saintName: row.saint_name || '',
      feastMonthDay: row.feast_month_day || monthDay,
    }))
    .filter((row) => row.displayName && row.saintName);
}

export async function handleDonorLiturgicalDay(request, env) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date') || ''))
    ? url.searchParams.get('date')
    : today;
  const rawCalendar = String(url.searchParams.get('calendar') || 'julian').toLowerCase();
  const calendar =
    rawCalendar.includes('gregorian') || rawCalendar.includes('revised') || rawCalendar.includes('new')
      ? 'gregorian'
      : 'julian';
  const readingsCalendar = calendar === 'gregorian' ? 'revised-julian' : 'julian';
  const year = Number(civilDate.slice(0, 4)) || new Date().getFullYear();
  const feasts = liturgicalFeastsForYear(year, calendar);
  const feast = feasts.find((item) => item.date === civilDate) || null;
  const enriched = await enrichLiturgicalDayWithOrthocal(
    {
      civilDate,
      calendarType: readingsCalendar,
      feastTitle: feast?.name || '',
      feastRank: feast?.rank || '',
      fastingRule: feast?.rank === 'fast' ? 'Fast' : '',
      saints: feast?.name ? [feast.name] : [],
      saintStories: [],
    },
    { calendarType: readingsCalendar, civilDate }
  );
  enriched.nameDays = await loadDirectoryNamedaysForLiturgicalDay(env, request, civilDate);

  return json({
    ok: true,
    date: civilDate,
    calendar,
    label: calendarLabel(calendar),
    feast,
    today: enriched,
  });
}
