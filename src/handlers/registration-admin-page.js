import {
  clampListLimit,
  d1,
  d1All,
  decodeListCursor,
  encodeListCursor,
  isSystemKvKey,
  listKvKeys,
  safeParseJsonRow,
} from '../lib/core.js';
import { defaultSubscriptionTier } from '../lib/subscriptions.js';

export function adminRegistrationSummary(registration = {}, fallbackReference = '') {
  registration = registration || {};
  return {
    reference: registration.reference || fallbackReference || '',
    status: registration.status || 'pending',
    parishName: registration.parishName || '',
    communityType: registration.communityType || '',
    liturgicalCalendar: registration.liturgicalCalendar || 'julian',
    jurisdiction: registration.jurisdiction || '',
    city: registration.city || '',
    state: registration.state || '',
    priestEmail: registration.priestEmail || '',
    treasurerEmail: registration.treasurerEmail || '',
    givingStatus: registration.givingStatus || 'active',
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionStatus: registration.subscriptionStatus || 'not_started',
    stripeAccountStatus: registration.stripeAccountStatus || 'not_started',
    dashboardInviteEmailStatus: registration.dashboardInviteEmailStatus || '',
    adminNotificationEmailStatus: registration.adminNotificationEmailStatus || '',
    receivedAt: registration.receivedAt || '',
  };
}

export async function loadAdminRegistrationPage(env, options = {}) {
  const limit = clampListLimit(options.limit, 100, 250);
  const cursor = decodeListCursor(options.cursor);
  const status = String(options.status || '')
    .trim()
    .toLowerCase();
  const query = String(options.query || options.q || '')
    .trim()
    .toLowerCase();

  if (d1(env)) {
    const where = [];
    const params = [];
    if (status && status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    if (cursor) {
      where.push('(received_at < ? OR (received_at = ? AND reference < ?))');
      params.push(cursor.receivedAt, cursor.receivedAt, cursor.reference);
    }
    if (query) {
      where.push(`(
        LOWER(COALESCE(json_extract(data, '$.parishName'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.city'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.state'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.priestEmail'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.treasurerEmail'), '')) LIKE ?
      )`);
      const like = `%${query}%`;
      params.push(like, like, like, like, like, like);
    }
    const rows = await d1All(
      env,
      `SELECT reference, received_at, data
       FROM registrations
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY received_at DESC, reference DESC
       LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    const registrations = pageRows.map((row) => {
      try {
        return adminRegistrationSummary(safeParseJsonRow(row), row.reference);
      } catch {
        return { reference: row.reference || '', status: 'unreadable' };
      }
    });
    return {
      registrations,
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: 'd1',
    };
  }

  const keys = await listKvKeys(env, { limit });
  const registrations = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (status && status !== 'all' && registration.status !== status) continue;
      if (query) {
        const haystack = [
          registration.parishName,
          registration.city,
          registration.state,
          registration.jurisdiction,
          registration.priestEmail,
          registration.treasurerEmail,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      registrations.push(adminRegistrationSummary(registration, key.name));
    } catch {
      registrations.push({ reference: key.name, status: 'unreadable' });
    }
  }

  registrations.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return { registrations, cursor: null, hasMore: false, limit, source: 'kv' };
}
