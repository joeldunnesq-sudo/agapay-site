import type { DashboardRegistration } from './parish-dashboard-handler.js';
type ContentEnv = Partial<Env> & {
  DB?: D1Database;
  TEACHING_ASSETS?: R2Bucket;
  TEACHING_ASSETS_URL?: string;
  CLOUDFLARE_STREAM_API_TOKEN?: string;
  AGAPAY_PUBLIC_URL?: string;
};
interface ContentRow {
  id: string;
  parish_id: string;
  title: string;
  body: string;
  hero_image_url: string;
  category: string;
  status: string;
  pinned: number;
  published_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  donor_data: string;
  donor_email: string;
  read_at: string;
  donor_id: string;
  subscribed_at: string;
  unsubscribed_at: string;
  unsubscribe_token: string;
  last_digest_sent_at: string;
}
type ContentInput = Record<string, unknown>;
import { deleteContentReads, getReadContentIds, getReadReceipts, markContentRead } from '../lib/content-reads.js';
import { communicationsEnabledFor, hasModuleAccess } from '../lib/entitlements.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { loadAllRegistrations } from '../lib/registrations.js';
import { sendAnnouncementPush } from '../lib/push-notifications.js';
import { renderBoundedRichText } from '../lib/rich-text.js';
import {
  generateSecret,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import { findRegistrationByParishId, verifyParishDashboardBearer } from './parish.js';
import { verifiedHouseholdAccess } from './koinonia-access.js';
import { PARISH_EDITORIAL_IMAGE_MAX_BYTES, PARISH_EDITORIAL_IMAGE_TYPES } from './parish-giving-catalog.js';

const CONTENT_TYPE = 'announcement';
export const ANNOUNCEMENT_ALLOWED_TAGS = Object.freeze(['strong', 'em', 'a', 'ul', 'li', 'br']);
export const ANNOUNCEMENT_CATEGORIES = Object.freeze([
  'services',
  'events',
  'youth',
  'outreach',
  'education',
  'general',
]);

function announcementCategory(value: unknown, fallback: string = 'general') {
  const category = String(value ?? fallback)
    .trim()
    .toLowerCase();
  if (!ANNOUNCEMENT_CATEGORIES.includes(category)) throw new Error('Invalid announcement category.');
  return category;
}

function escapeAnnouncementHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderAnnouncementBody(value: unknown) {
  return renderBoundedRichText(value, ANNOUNCEMENT_ALLOWED_TAGS);
}

function announcementFromRow(row: Partial<ContentRow> = {}) {
  return {
    id: row.id || '',
    parishId: row.parish_id || '',
    title: row.title || '',
    body: row.body || '',
    bodyHtml: renderAnnouncementBody(row.body || ''),
    heroImageUrl: row.hero_image_url || '',
    category: row.category || 'general',
    status: row.status || 'draft',
    pinned: Boolean(row.pinned),
    publishedAt: row.published_at || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function validateAnnouncementInput(input: ContentInput = {}, { partial = false } = {}) {
  const result: {
    title?: string;
    body?: string;
    description?: string;
    pinned?: number;
    category?: string;
    audioUrl?: string;
  } = {};
  if (!partial || Object.prototype.hasOwnProperty.call(input, 'title')) {
    result.title = String(input.title || '')
      .trim()
      .slice(0, 180);
    if (!result.title) throw new Error('Announcement title is required.');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, 'body')) {
    result.body = String(input.body || '')
      .trim()
      .slice(0, 12000);
    if (!result.body) throw new Error('Announcement body is required.');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, 'pinned')) {
    result.pinned = input.pinned === true || input.pinned === 1 ? 1 : 0;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, 'category')) {
    result.category = announcementCategory(input.category);
  }
  return result;
}

export async function listParishAnnouncements(db: D1Database, parishId: string) {
  const result = await db
    .prepare(
      `
    SELECT * FROM parish_announcements
    WHERE parish_id = ?
    ORDER BY pinned DESC, updated_at DESC, created_at DESC
  `
    )
    .bind(parishId)
    .all<ContentRow>();
  return Promise.all(
    (result.results || []).map(async (row) => {
      const announcement = announcementFromRow(row);
      if (announcement.status !== 'published') return { ...announcement, readCount: 0 };
      const receipts = await getReadReceipts(db, {
        parishId,
        contentType: CONTENT_TYPE,
        contentId: announcement.id,
      });
      return { ...announcement, readCount: receipts.length };
    })
  );
}

function donorDisplayName(row: Partial<ContentRow> = {}) {
  let donor: Record<string, unknown> = {};
  try {
    donor = JSON.parse(row.donor_data || '{}');
  } catch {
    donor = {};
  }
  return String(
    donor.donorName ||
      [donor.firstName, donor.lastName].filter(Boolean).join(' ') ||
      donor.householdName ||
      row.donor_email ||
      'Parishioner'
  ).trim();
}

export async function getAnnouncementReadVisibility(
  db: D1Database,
  { parishId, announcementId }: { parishId: string; announcementId: string }
) {
  const announcement = await db
    .prepare(
      `
    SELECT id, status FROM parish_announcements WHERE id = ? AND parish_id = ?
  `
    )
    .bind(announcementId, parishId)
    .first<ContentRow>();
  if (!announcement) return null;
  if (announcement.status !== 'published') return { count: 0, readers: [] };

  const receipts = await getReadReceipts(db, {
    parishId,
    contentType: CONTENT_TYPE,
    contentId: announcementId,
  });
  if (!receipts.length) return { count: 0, readers: [] };
  const resolvedRows = [];
  for (let index = 0; index < receipts.length; index += 40) {
    const batch = receipts.slice(index, index + 40);
    const values = batch.map(() => '(?, ?)').join(', ');
    const parameters = batch.flatMap(({ donorId, readAt }) => [donorId, readAt]);
    const result = await db
      .prepare(
        `
      WITH receipt_rows(donor_email, read_at) AS (VALUES ${values})
      SELECT rr.donor_email, rr.read_at, d.data AS donor_data
      FROM receipt_rows rr
      LEFT JOIN donors d ON d.email = rr.donor_email
      ORDER BY rr.read_at ASC, rr.donor_email ASC
    `
      )
      .bind(...parameters)
      .all<ContentRow>();
    resolvedRows.push(...(result.results || []));
  }
  const readers = resolvedRows.map((row) => ({
    donorId: row.donor_email,
    displayName: donorDisplayName(row),
    readAt: row.read_at,
  }));
  return { count: readers.length, readers };
}

export async function createParishAnnouncement(
  db: D1Database,
  { parishId, createdBy, input }: { parishId: string; createdBy: string; input: ContentInput }
) {
  const fields = validateAnnouncementInput(input);
  const id = generateSecret('announcement');
  await db
    .prepare(
      `
    INSERT INTO parish_announcements
      (id, parish_id, title, body, category, status, pinned, created_by)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
  `
    )
    .bind(id, parishId, fields.title, fields.body, fields.category, fields.pinned, createdBy)
    .run();
  return announcementFromRow(
    (await db.prepare('SELECT * FROM parish_announcements WHERE id = ?').bind(id).first<ContentRow>())!
  );
}

export async function updateParishAnnouncement(
  db: D1Database,
  {
    parishId,
    announcementId,
    input,
    onPublished,
  }: {
    parishId: string;
    announcementId: string;
    input: ContentInput;
    onPublished?: (post: ReturnType<typeof announcementFromRow>) => void;
  }
) {
  const current = await db
    .prepare('SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?')
    .bind(announcementId, parishId)
    .first<ContentRow>();
  if (!current) return null;
  if (current.status === 'archived') throw new Error('Archived announcements cannot be edited.');

  const fields = validateAnnouncementInput(input, { partial: true });
  const requestedStatus = Object.prototype.hasOwnProperty.call(input, 'status')
    ? String(input.status || '')
        .trim()
        .toLowerCase()
    : current.status;
  if (!['draft', 'published'].includes(requestedStatus)) throw new Error('Invalid announcement status.');
  if (current.status === 'published' && requestedStatus === 'draft') {
    throw new Error('Published announcements cannot return to draft.');
  }

  const title = fields.title ?? current.title;
  const body = fields.body ?? current.body;
  const category = fields.category ?? current.category ?? 'general';
  const pinned = fields.pinned ?? current.pinned;
  const publishedAt = requestedStatus === 'published' ? current.published_at || new Date().toISOString() : null;
  await db
    .prepare(
      `
    UPDATE parish_announcements
    SET title = ?, body = ?, category = ?, pinned = ?, status = ?, published_at = ?, updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `
    )
    .bind(title, body, category, pinned, requestedStatus, publishedAt, announcementId, parishId)
    .run();
  const announcement = announcementFromRow(
    (await db.prepare('SELECT * FROM parish_announcements WHERE id = ?').bind(announcementId).first<ContentRow>())!
  );
  if (current.status !== 'published' && requestedStatus === 'published' && typeof onPublished === 'function') {
    onPublished(announcement);
  }
  return announcement;
}

export async function archiveParishAnnouncement(
  db: D1Database,
  { parishId, announcementId }: { parishId: string; announcementId: string }
) {
  await db
    .prepare(
      `
    UPDATE parish_announcements
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `
    )
    .bind(announcementId, parishId)
    .run();
  const row = await db
    .prepare('SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?')
    .bind(announcementId, parishId)
    .first<ContentRow>();
  return row ? announcementFromRow(row) : null;
}

export async function deleteParishAnnouncement(
  db: D1Database,
  { parishId, announcementId }: { parishId: string; announcementId: string }
) {
  const row = await db
    .prepare('SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?')
    .bind(announcementId, parishId)
    .first<ContentRow>();
  if (!row) return null;
  await deleteContentReads(db, { parishId, contentType: CONTENT_TYPE, contentId: announcementId });
  await db
    .prepare('DELETE FROM parish_announcements WHERE id = ? AND parish_id = ?')
    .bind(announcementId, parishId)
    .run();
  return announcementFromRow(row);
}

export async function getDonorAnnouncementFeed(
  db: D1Database,
  { parishId, donorId, category = '' }: { parishId: string; donorId: string; category?: string }
) {
  const selectedCategory = category ? announcementCategory(category, '') : '';
  const result = await db
    .prepare(
      `
    SELECT * FROM parish_announcements
    WHERE parish_id = ? AND status = 'published'${selectedCategory ? ' AND category = ?' : ''}
    ORDER BY pinned DESC, published_at DESC, created_at DESC
  `
    )
    .bind(...(selectedCategory ? [parishId, selectedCategory] : [parishId]))
    .all<ContentRow>();
  const announcements = (result.results || []).map(announcementFromRow);
  const contentIds = announcements.map(({ id }) => id);
  const readIds = await getReadContentIds(db, {
    parishId,
    contentType: CONTENT_TYPE,
    donorId,
    contentIds,
  });
  const readSet = new Set(readIds);
  return {
    announcements: announcements.map((announcement) => ({
      ...announcement,
      read: readSet.has(announcement.id),
    })),
    unreadCount: contentIds.length - readIds.length,
  };
}

export async function markAnnouncementRead(
  db: D1Database,
  { parishId, announcementId, donorId }: { parishId: string; donorId: string; announcementId: string }
) {
  const row = await db
    .prepare(
      `
    SELECT id FROM parish_announcements
    WHERE id = ? AND parish_id = ? AND status = 'published'
  `
    )
    .bind(announcementId, parishId)
    .first<ContentRow>();
  if (!row) return false;
  await markContentRead(db, {
    parishId,
    contentType: CONTENT_TYPE,
    contentId: announcementId,
    donorId,
  });
  return true;
}

function database(env: ContentEnv) {
  return env.AGAPAY_DB || env.DB || null;
}

function digestSubscriptionFromRow(row: Partial<ContentRow> = {}) {
  return {
    parishId: row.parish_id || '',
    donorId: row.donor_id || '',
    subscribedAt: row.subscribed_at || '',
    unsubscribedAt: row.unsubscribed_at || '',
    unsubscribeToken: row.unsubscribe_token || '',
    lastDigestSentAt: row.last_digest_sent_at || '',
    subscribed: Boolean(row.subscribed_at && !row.unsubscribed_at),
  };
}

export async function getAnnouncementDigestSubscription(
  db: D1Database,
  { parishId, donorId }: { parishId: string; donorId: string }
) {
  const row = await db
    .prepare(
      `
    SELECT * FROM parish_announcement_digest_subscriptions
    WHERE parish_id = ? AND donor_id = ?
  `
    )
    .bind(parishId, normalizeEmail(donorId))
    .first<ContentRow>();
  return row
    ? digestSubscriptionFromRow(row)
    : {
        parishId,
        donorId: normalizeEmail(donorId),
        subscribedAt: '',
        unsubscribedAt: '',
        unsubscribeToken: '',
        lastDigestSentAt: '',
        subscribed: false,
      };
}

export async function setAnnouncementDigestSubscription(
  db: D1Database,
  {
    parishId,
    donorId,
    subscribed,
    now = new Date().toISOString(),
  }: { parishId: string; donorId: string; subscribed: boolean; now?: string }
) {
  const normalizedDonorId = normalizeEmail(donorId);
  const current = await getAnnouncementDigestSubscription(db, { parishId, donorId: normalizedDonorId });
  if (subscribed && !current.subscribed) {
    const unsubscribeToken = generateSecret('digest_unsubscribe');
    await db
      .prepare(
        `
      INSERT INTO parish_announcement_digest_subscriptions
        (parish_id, donor_id, subscribed_at, unsubscribed_at, unsubscribe_token, last_digest_sent_at)
      VALUES (?, ?, ?, NULL, ?, NULL)
      ON CONFLICT(parish_id, donor_id) DO UPDATE SET
        subscribed_at = excluded.subscribed_at,
        unsubscribed_at = NULL,
        unsubscribe_token = excluded.unsubscribe_token,
        last_digest_sent_at = NULL
    `
      )
      .bind(parishId, normalizedDonorId, now, unsubscribeToken)
      .run();
  } else if (!subscribed && current.subscribed) {
    await db
      .prepare(
        `
      UPDATE parish_announcement_digest_subscriptions
      SET unsubscribed_at = ?
      WHERE parish_id = ? AND donor_id = ? AND unsubscribed_at IS NULL
    `
      )
      .bind(now, parishId, normalizedDonorId)
      .run();
  }
  return getAnnouncementDigestSubscription(db, { parishId, donorId: normalizedDonorId });
}

export async function unsubscribeAnnouncementDigest(db: D1Database, token: string, now = new Date().toISOString()) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return false;
  const subscription = await db
    .prepare(
      `
    SELECT parish_id FROM parish_announcement_digest_subscriptions
    WHERE unsubscribe_token = ?
  `
    )
    .bind(normalizedToken)
    .first<ContentRow>();
  if (!subscription) return false;
  await db
    .prepare(
      `
    UPDATE parish_announcement_digest_subscriptions
    SET unsubscribed_at = ?
    WHERE unsubscribe_token = ?
  `
    )
    .bind(now, normalizedToken)
    .run();
  return true;
}

function digestAddress(registration: DashboardRegistration = {}) {
  const locality = [registration.city, registration.state, registration.postalCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  return [registration.addressLine1, registration.addressLine2, locality, registration.country]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function hasDigestPhysicalAddress(registration: DashboardRegistration = {}) {
  return [registration.addressLine1, registration.city, registration.state, registration.postalCode].every((value) =>
    String(value || '').trim()
  );
}

function digestExcerpt(body: unknown) {
  const source = String(body || '').trim();
  return source.length > 420 ? `${source.slice(0, 417).trimEnd()}...` : source;
}

export function buildAnnouncementDigestEmail({
  registration,
  subscription,
  announcements,
  appUrl,
}: {
  registration: DashboardRegistration;
  subscription: ReturnType<typeof digestSubscriptionFromRow>;
  announcements: readonly Partial<ContentRow>[];
  appUrl?: string;
}) {
  const baseUrl = String(appUrl || 'https://agapay.app').replace(/\/+$/, '');
  const unsubscribeUrl = `${baseUrl}/api/donor/digest/unsubscribe?token=${encodeURIComponent(subscription.unsubscribeToken)}`;
  const address = digestAddress(registration);
  if (!hasDigestPhysicalAddress(registration)) {
    throw new Error('A parish physical mailing address is required before digest email can be sent.');
  }
  const parishName = registration.parishName || 'Your parish';
  const announcementHtml = announcements
    .map(
      (announcement) => `
    <article style="margin:0 0 24px;padding:0 0 22px;border-bottom:1px solid rgba(201,162,91,0.3);">
      ${announcement.hero_image_url ? `<img src="${escapeAnnouncementHtml(announcement.hero_image_url)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;margin:0 0 14px;border-radius:12px;" />` : ''}
      <h2 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.25;color:#061522;">${escapeAnnouncementHtml(announcement.title)}</h2>
      <div style="font-size:15px;line-height:1.7;color:#334650;">${renderAnnouncementBody(digestExcerpt(announcement.body))}</div>
    </article>
  `
    )
    .join('');
  const addressHtml = address.map(escapeAnnouncementHtml).join('<br>');
  const subject = `${parishName}: weekly parish announcements`;
  return {
    subject,
    unsubscribeUrl,
    html: agapayEmailHtml(
      baseUrl,
      'Weekly Parish Announcements',
      `
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Here are the latest announcements from <strong>${escapeAnnouncementHtml(parishName)}</strong>.</p>
      ${announcementHtml}
      <p style="margin:18px 0 8px;font-size:12px;line-height:1.6;color:#595959;">${addressHtml}</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#595959;">You opted in to this weekly digest in My AGAPAY. <a href="${escapeAnnouncementHtml(unsubscribeUrl)}" style="color:#72561e;">Unsubscribe</a> at any time; no login is required.</p>
    `
    ),
    text: [
      subject,
      '',
      ...announcements.flatMap((announcement) => [announcement.title, digestExcerpt(announcement.body), '']),
      address.join('\n'),
      '',
      `Unsubscribe (no login required): ${unsubscribeUrl}`,
    ].join('\n'),
  };
}

export async function sendWeeklyAnnouncementDigestEmails(
  env: ContentEnv,
  scheduledTime: number | string,
  options: { dryRun?: boolean; parishId?: string; donorId?: string } = {},
  dependencies: { registrations?: DashboardRegistration[]; sendEmail?: typeof sendEmail } = {}
) {
  const db = database(env);
  if (!db) return [];
  const cutoff = new Date(scheduledTime || Date.now()).toISOString();
  const dryRun = Boolean(options.dryRun);
  const parishFilter = String(options.parishId || '').trim();
  const donorFilter = normalizeEmail(options.donorId || '');
  const registrations = dependencies.registrations || (await loadAllRegistrations(env, { status: 'verified' }));
  const registrationsByParish = new Map(registrations.map((registration) => [registration.parishId, registration]));
  const subscriptions = await db
    .prepare(
      `
    SELECT * FROM parish_announcement_digest_subscriptions
    WHERE subscribed_at IS NOT NULL AND unsubscribed_at IS NULL
    ORDER BY parish_id, donor_id
  `
    )
    .all<ContentRow>();
  const results = [];
  const send = dependencies.sendEmail || sendEmail;

  for (const row of subscriptions.results || []) {
    const subscription = digestSubscriptionFromRow(row);
    if (parishFilter && subscription.parishId !== parishFilter) continue;
    if (donorFilter && subscription.donorId !== donorFilter) continue;
    const registration = registrationsByParish.get(subscription.parishId);
    if (!registration || !communicationsEnabledFor(registration)) continue;
    const since = subscription.lastDigestSentAt || subscription.subscribedAt;
    const announcementRows = await db
      .prepare(
        `
      SELECT id, title, body, hero_image_url, published_at
      FROM parish_announcements
      WHERE parish_id = ? AND status = 'published' AND published_at > ? AND published_at <= ?
      ORDER BY published_at ASC LIMIT 50
    `
      )
      .bind(subscription.parishId, since, cutoff)
      .all<ContentRow>();
    const announcements = announcementRows.results || [];
    if (!announcements.length) {
      results.push({
        parishId: subscription.parishId,
        donorId: subscription.donorId,
        status: 'skipped',
        reason: 'nothing_new',
      });
      continue;
    }
    if (!hasDigestPhysicalAddress(registration)) {
      results.push({
        parishId: subscription.parishId,
        donorId: subscription.donorId,
        status: 'skipped',
        reason: 'missing_physical_address',
      });
      continue;
    }
    const content = buildAnnouncementDigestEmail({
      registration,
      subscription,
      announcements,
      appUrl: env.AGAPAY_APP_URL || 'https://agapay.app',
    });
    if (dryRun) {
      results.push({
        parishId: subscription.parishId,
        donorId: subscription.donorId,
        status: 'dry_run',
        announcementCount: announcements.length,
      });
      continue;
    }
    const email = await send(env, {
      from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
      to: [subscription.donorId],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
      subject: content.subject,
      html: content.html,
      text: content.text,
      headers: { 'List-Unsubscribe': `<${content.unsubscribeUrl}>` },
    });
    if (email.status === 'sent') {
      await db
        .prepare(
          `
        UPDATE parish_announcement_digest_subscriptions
        SET last_digest_sent_at = ?
        WHERE parish_id = ? AND donor_id = ? AND unsubscribe_token = ? AND unsubscribed_at IS NULL
      `
        )
        .bind(cutoff, subscription.parishId, subscription.donorId, subscription.unsubscribeToken)
        .run();
    }
    results.push({
      parishId: subscription.parishId,
      donorId: subscription.donorId,
      status: email.status,
      announcementCount: announcements.length,
      httpStatus: email.httpStatus || 0,
    });
  }
  return results;
}

export async function handleDonorDigestSubscription(request: Request, env: ContentEnv) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access.response;
  const { donor, parishId } = access.context;
  if (request.method === 'GET') {
    const subscription = await getAnnouncementDigestSubscription(db, { parishId, donorId: donor.email });
    return json({ subscribed: subscription.subscribed, subscribedAt: subscription.subscribedAt });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'donor-digest-subscription', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const input = (await request.json().catch(() => ({}))) as ContentInput;
  if (typeof input.subscribed !== 'boolean')
    return json({ error: 'subscribed must be true or false' }, { status: 422 });
  const subscription = await setAnnouncementDigestSubscription(db, {
    parishId,
    donorId: donor.email,
    subscribed: input.subscribed,
  });
  return json({ ok: true, subscribed: subscription.subscribed, subscribedAt: subscription.subscribedAt });
}

export async function handleAnnouncementDigestUnsubscribe(request: Request, env: ContentEnv) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  const db = database(env);
  if (!db) return new Response('Email preferences are temporarily unavailable.', { status: 503 });
  const token = new URL(request.url).searchParams.get('token') || '';
  const unsubscribed = await unsubscribeAnnouncementDigest(db, token);
  const title = unsubscribed ? 'You’re unsubscribed' : 'Unsubscribe link unavailable';
  const message = unsubscribed
    ? 'You will no longer receive weekly parish announcement digests. You can opt in again from your My AGAPAY Feed at any time.'
    : 'This unsubscribe link is invalid.';
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title} | AGAPAY</title></head><body style="margin:0;background:#f4f0e6;color:#061522;font-family:Arial,sans-serif;"><main style="max-width:620px;margin:10vh auto;padding:36px;background:#fff;border:1px solid #d9c69e;border-radius:18px;"><p style="color:#8a6a25;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">AGAPAY</p><h1 style="font-family:Georgia,serif;font-size:36px;">${title}</h1><p style="font-size:17px;line-height:1.7;">${message}</p></main></body></html>`,
    {
      status: unsubscribed ? 200 : 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    }
  );
}

export async function validateAnnouncementHeroImage(request: Request) {
  const contentType = String(request.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const ext = PARISH_EDITORIAL_IMAGE_TYPES.get(contentType);
  if (!ext) return { error: 'Announcement images must be JPG, PNG, or WebP images.', status: 415 };
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > PARISH_EDITORIAL_IMAGE_MAX_BYTES) {
    return { error: 'Announcement image must be 10MB or smaller.', status: 413 };
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return { error: 'Announcement image is empty.', status: 422 };
  if (bytes.byteLength > PARISH_EDITORIAL_IMAGE_MAX_BYTES) {
    return { error: 'Announcement image must be 10MB or smaller.', status: 413 };
  }
  return { bytes, contentType, ext };
}

export async function handleParishAnnouncementHeroUpload(
  request: Request,
  env: ContentEnv,
  parishId: string,
  announcementId: string
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-communications-upload', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  if (!env.ANNOUNCEMENT_ASSETS || !env.ANNOUNCEMENT_ASSETS_URL) {
    return json({ error: 'Announcement image storage is not configured.' }, { status: 503 });
  }
  const current = await db
    .prepare('SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?')
    .bind(announcementId, parishId)
    .first<ContentRow>();
  if (!current) return json({ error: 'Announcement not found' }, { status: 404 });
  if (current.status === 'archived')
    return json({ error: 'Archived announcements cannot be edited.' }, { status: 422 });

  const upload = await validateAnnouncementHeroImage(request);
  if (upload.error) return json({ error: upload.error }, { status: upload.status });
  const safeSegment = (value: unknown, fallback: string) =>
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || fallback;
  const key = [
    'announcements',
    safeSegment(parishId, 'parish'),
    safeSegment(announcementId, 'announcement'),
    `${Date.now()}-${crypto.randomUUID()}.${upload.ext}`,
  ].join('/');
  await env.ANNOUNCEMENT_ASSETS.put(key, upload.bytes!, {
    customMetadata: { agapayParishId: parishId },
    httpMetadata: {
      contentType: upload.contentType,
      cacheControl: 'no-store',
    },
  });
  const publicBase = String(env.ANNOUNCEMENT_ASSETS_URL).replace(/\/+$/, '');
  const heroImageUrl = `${publicBase}/${key}`;
  try {
    await db
      .prepare(
        `
      UPDATE parish_announcements SET hero_image_url = ?, updated_at = datetime('now')
      WHERE id = ? AND parish_id = ?
    `
      )
      .bind(heroImageUrl, announcementId, parishId)
      .run();
  } catch (error) {
    await env.ANNOUNCEMENT_ASSETS.delete(key).catch(() => {});
    throw error;
  }
  const previousUrl = String(current.hero_image_url || '');
  if (previousUrl.startsWith(`${publicBase}/`)) {
    await env.ANNOUNCEMENT_ASSETS.delete(previousUrl.slice(publicBase.length + 1)).catch(() => {});
  }
  const announcement = announcementFromRow(
    (await db
      .prepare('SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?')
      .bind(announcementId, parishId)
      .first<ContentRow>())!
  );
  return json({
    ok: true,
    key,
    url: heroImageUrl,
    contentType: upload.contentType,
    size: upload.bytes!.byteLength,
    announcement,
  });
}

export async function requireCommunicationsAdmin(request: Request, env: ContentEnv, parishId: string) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: 'Parish not found' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) {
    return { error: unauthorized() };
  }
  if (!hasModuleAccess(found.registration, 'communications')) {
    return { error: json({ error: 'Communications requires the Parish tier.' }, { status: 403 }) };
  }
  return { found };
}

export async function handleParishCommunications(
  request: Request,
  env: ContentEnv,
  parishId: string,
  subpath = '',
  ctx: ExecutionContext | null = null
) {
  const normalizedSubpath = String(subpath || '').replace(/^\/+|\/+$/g, '');
  const parts = normalizedSubpath ? normalizedSubpath.split('/') : [];
  if (parts.length === 2 && parts[1] === 'hero-image') {
    return handleParishAnnouncementHeroUpload(request, env, parishId, decodeURIComponent(parts[0]));
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;

  try {
    if (!parts.length && request.method === 'GET') {
      return json({ announcements: await listParishAnnouncements(db, parishId) });
    }
    if (!parts.length && request.method === 'POST') {
      const input = (await request.json()) as ContentInput;
      const createdBy =
        normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) ||
        `parish:${parishId}`;
      const announcement = await createParishAnnouncement(db, { parishId, createdBy, input });
      return json({ ok: true, announcement }, { status: 201 });
    }
    if (parts.length === 1 && request.method === 'PATCH') {
      const announcement = await updateParishAnnouncement(db, {
        parishId,
        announcementId: decodeURIComponent(parts[0]),
        input: (await request.json()) as ContentInput,
        onPublished: (publishedAnnouncement) => {
          if (!ctx?.waitUntil) return;
          if (!communicationsEnabledFor(auth.found.registration)) return;
          const delivery = sendAnnouncementPush(env, {
            parishId,
            parishName: (auth.found.registration.parishName as string) || 'your parish',
            announcement: publishedAnnouncement,
          })
            .then((summary) =>
              console.log(
                'announcement_push_delivery',
                JSON.stringify({ parishId, announcementId: publishedAnnouncement.id, ...summary })
              )
            )
            .catch((error: unknown) =>
              console.error('announcement_push_delivery_failed', (error as Error | null)?.message || String(error))
            );
          ctx.waitUntil(delivery);
        },
      });
      return announcement
        ? json({ ok: true, announcement })
        : json({ error: 'Announcement not found' }, { status: 404 });
    }
    if (parts.length === 1 && request.method === 'DELETE') {
      const announcement = await deleteParishAnnouncement(db, {
        parishId,
        announcementId: decodeURIComponent(parts[0]),
      });
      if (!announcement) return json({ error: 'Announcement not found' }, { status: 404 });
      const publicBase = String(env.ANNOUNCEMENT_ASSETS_URL || '').replace(/\/+$/, '');
      if (
        announcement.heroImageUrl &&
        publicBase &&
        env.ANNOUNCEMENT_ASSETS &&
        announcement.heroImageUrl.startsWith(`${publicBase}/`)
      ) {
        await env.ANNOUNCEMENT_ASSETS.delete(announcement.heroImageUrl.slice(publicBase.length + 1)).catch(() => {});
      }
      return json({ ok: true, deletedId: announcement.id });
    }
    if (parts.length === 2 && parts[1] === 'readers' && request.method === 'GET') {
      const visibility = await getAnnouncementReadVisibility(db, {
        parishId,
        announcementId: decodeURIComponent(parts[0]),
      });
      return visibility
        ? json({ ok: true, ...visibility })
        : json({ error: 'Announcement not found' }, { status: 404 });
    }
    if (parts.length === 2 && parts[1] === 'archive' && request.method === 'POST') {
      const announcement = await archiveParishAnnouncement(db, {
        parishId,
        announcementId: decodeURIComponent(parts[0]),
      });
      return announcement
        ? json({ ok: true, announcement })
        : json({ error: 'Announcement not found' }, { status: 404 });
    }
    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return json({ error: (error as Error).message || 'Unable to save announcement' }, { status: 422 });
  }
}

export async function handleDonorFeed(request: Request, env: ContentEnv, announcementId: string = '') {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access.response;
  const { donor, parishId } = access.context;
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Your selected parish could not be found.' }, { status: 404 });
  if (!communicationsEnabledFor(found.registration)) {
    return json({
      available: false,
      parish: { id: parishId, name: found.registration.parishName || '' },
      announcements: [],
      unreadCount: 0,
    });
  }

  const donorId = normalizeEmail(donor.email);
  if (!announcementId && request.method === 'GET') {
    let feed;
    try {
      feed = await getDonorAnnouncementFeed(db, {
        parishId,
        donorId,
        category: new URL(request.url).searchParams.get('category') || '',
      });
    } catch (error) {
      return json({ error: (error as Error).message }, { status: 422 });
    }
    return json({
      available: true,
      parish: { id: parishId, name: found.registration.parishName || '' },
      ...feed,
    });
  }
  if (announcementId && request.method === 'POST') {
    const marked = await markAnnouncementRead(db, { parishId, announcementId, donorId });
    return marked ? json({ ok: true }) : json({ error: 'Published announcement not found' }, { status: 404 });
  }
  return json({ error: 'Method not allowed' }, { status: 405 });
}
