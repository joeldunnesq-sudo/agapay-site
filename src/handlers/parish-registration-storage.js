// Generated from src/handlers/parish-registration-storage.ts by npm run build:server. Do not edit.
import { parishClosureState } from '../portability/closure.js';
import './parish-commemorations.js';
import {
  clampListLimit,
  d1All,
  d1First,
  d1Run,
  decodeListCursor,
  encodeListCursor,
  hasProductionStore,
  isSystemKvKey,
  listKvKeys,
  parishIdIndexKey,
  parseJsonRow,
  safeParseJsonRow,
  stripeAccountIndexKey,
  stripeSubscriptionIndexKey,
} from '../lib/core.js';
import '../lib/mfa.js';
import '../lib/stewardship-funds.js';
import './parish-donor-offerings.js';
import './parish-giving-read-models.js';
import './parish-checkout.js';
import './parish-dashboard-handler.js';
import '../lib/entitlements.js';
import '../lib/subscriptions.js';
import { parishSlug } from '../lib/format.js';
import '../lib/audit-log.js';
import '../lib/registration-intake.js';
import '../lib/payment-fees.js';
import '../lib/parish-pricing-usage.js';
import '../lib/stripe-fees.js';
import '../lib/stripe-connect.js';
import '../lib/parish-notifications.js';
import './parish-shared.js';
import { d1 } from './parish-shared.js';
import { parishFromRegistration } from './parish.js';
import './parish-authentication.js';
async function saveRegistrationRecord(env, reference, registration, previous = null) {
  if (!reference) return registration;
  const parishId = registration.parishId || parishSlug(registration.parishName, registration.city);
  const previousParishId = previous ? previous.parishId || parishSlug(previous.parishName, previous.city) : '';
  if (d1(env)) {
    const saved = await d1Run(
      env,
      `INSERT INTO registrations (
        reference, parish_id, status, parish_name, community_type,
        stripe_account_id, stripe_subscription_id, received_at, updated_at, data
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(reference) DO UPDATE SET
         parish_id = excluded.parish_id,
         status = excluded.status,
         parish_name = excluded.parish_name,
         community_type = excluded.community_type,
         stripe_account_id = excluded.stripe_account_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         received_at = excluded.received_at,
         updated_at = excluded.updated_at,
         data = excluded.data
       WHERE COALESCE(json_extract(registrations.data, '$.goLiveAt'), '') = ?11`,
      reference,
      parishId,
      registration.status || 'pending',
      registration.parishName || '',
      registration.communityType || '',
      registration.stripeAccountId || '',
      registration.stripeSubscriptionId || '',
      registration.receivedAt || '',
      registration.reviewedAt ||
        registration.parishUpdatedAt ||
        registration.subscriptionUpdatedAt ||
        /* @__PURE__ */ new Date().toISOString(),
      JSON.stringify(registration),
      (previous || registration).goLiveAt || ''
    );
    if (saved?.meta?.changes === 0) {
      const error = new Error(
        'The parish was launched while this change was being saved. Refresh the dashboard and review your changes before saving again.'
      );
      error.code = 'registration_publication_conflict';
      throw error;
    }
    return registration;
  }
  if (hasProductionStore(env)) {
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(registration));
    if (parishId) await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), reference);
    if (previousParishId && previousParishId !== parishId)
      await env.AGAPAY_REGISTRATIONS.delete(parishIdIndexKey(previousParishId));
    if (registration.stripeAccountId)
      await env.AGAPAY_REGISTRATIONS.put(stripeAccountIndexKey(registration.stripeAccountId), reference);
    if (previous?.stripeAccountId && previous.stripeAccountId !== registration.stripeAccountId) {
      await env.AGAPAY_REGISTRATIONS.delete(stripeAccountIndexKey(previous.stripeAccountId));
    }
    if (registration.stripeSubscriptionId)
      await env.AGAPAY_REGISTRATIONS.put(stripeSubscriptionIndexKey(registration.stripeSubscriptionId), reference);
    if (previous?.stripeSubscriptionId && previous.stripeSubscriptionId !== registration.stripeSubscriptionId) {
      await env.AGAPAY_REGISTRATIONS.delete(stripeSubscriptionIndexKey(previous.stripeSubscriptionId));
    }
  }
  return registration;
}
async function loadIndexedRegistration(env, indexKey) {
  if (!env.AGAPAY_REGISTRATIONS || !indexKey) return null;
  const reference = await env.AGAPAY_REGISTRATIONS.get(indexKey);
  if (!reference) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  try {
    return { key: reference, registration: JSON.parse(raw) };
  } catch {
    return null;
  }
}
async function loadRegistrationByReference(env, reference) {
  if (!reference) return null;
  if (d1(env)) {
    const row = await d1First(env, 'SELECT data FROM registrations WHERE reference = ?1', reference);
    const registration2 = parseJsonRow(row);
    if (registration2) return registration2;
  }
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  const registration = JSON.parse(raw);
  if (d1(env)) await saveRegistrationRecord(env, reference, registration);
  return registration;
}
async function loadVerifiedRegistrationParishPage(env, options = {}) {
  const limit = clampListLimit(options.limit, 100, 250);
  const cursor = decodeListCursor(options.cursor);
  const query = String(options.query || options.q || '')
    .trim()
    .toLowerCase();
  const type = String(options.type || '')
    .trim()
    .toLowerCase();
  const jurisdiction = String(options.jurisdiction || '')
    .trim()
    .toLowerCase();
  if (d1(env)) {
    const where = ["status = 'verified'"];
    const params = [];
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
      )`);
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }
    if (type) {
      where.push("LOWER(COALESCE(json_extract(data, '$.communityType'), '')) LIKE ?");
      params.push(`%${type}%`);
    }
    if (jurisdiction) {
      where.push("LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?");
      params.push(`%${jurisdiction}%`);
    }
    const rows = await d1All(
      env,
      `SELECT reference, received_at, data
       FROM registrations
       WHERE ${where.join(' AND ')}
       ORDER BY received_at DESC, reference DESC
       LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    const parishes = pageRows.map(safeParseJsonRow).map(parishFromRegistration).filter(Boolean);
    return {
      parishes,
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: 'd1',
    };
  }
  if (!env.AGAPAY_REGISTRATIONS) return { parishes: [], cursor: null, hasMore: false, limit, source: 'none' };
  const keys = await listKvKeys(env, { limit });
  const verified = [];
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const parish = parishFromRegistration(JSON.parse(raw));
      if (parish) verified.push(parish);
    } catch {}
  }
  return { parishes: verified, cursor: null, hasMore: false, limit, source: 'kv' };
}
async function verifiedRegistrationParishes(env, options = {}) {
  const page = await loadVerifiedRegistrationParishPage(env, options);
  return page.parishes;
}
async function findRegistrationByParishId(env, parishId) {
  if (await parishClosureState(env, parishId)) return null;
  if (d1(env)) {
    const row = await d1First(
      env,
      `SELECT reference, data FROM registrations
       WHERE parish_id = ?1
       ORDER BY COALESCE(json_extract(data, '$.updatedAt'), updated_at, received_at) DESC, updated_at DESC, reference DESC
       LIMIT 1`,
      parishId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, parishIdIndexKey(parishId));
  if (indexed) return indexed;
  const keys = await listKvKeys(env, { limit: 1e3 });
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      const currentParishId = registration.parishId || parishSlug(registration.parishName, registration.city);
      if (currentParishId === parishId) {
        await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), key.name);
        return { key: key.name, registration };
      }
    } catch {}
  }
  return null;
}
async function findRegistrationByStripeSubscriptionId(env, subscriptionId) {
  if (!subscriptionId) return null;
  if (d1(env)) {
    const row = await d1First(
      env,
      'SELECT reference, data FROM registrations WHERE stripe_subscription_id = ?1 LIMIT 1',
      subscriptionId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeSubscriptionIndexKey(subscriptionId));
  if (indexed) return indexed;
  const keys = await listKvKeys(env, { limit: 1e3 });
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (registration.stripeSubscriptionId === subscriptionId) {
        await env.AGAPAY_REGISTRATIONS.put(stripeSubscriptionIndexKey(subscriptionId), key.name);
        return { key: key.name, registration };
      }
    } catch {}
  }
  return null;
}
async function findRegistrationByStripeAccountId(env, stripeAccountId) {
  if (!stripeAccountId) return null;
  if (d1(env)) {
    const row = await d1First(
      env,
      'SELECT reference, data FROM registrations WHERE stripe_account_id = ?1 LIMIT 1',
      stripeAccountId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeAccountIndexKey(stripeAccountId));
  if (indexed) return indexed;
  const keys = await listKvKeys(env, { limit: 1e3 });
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (registration.stripeAccountId === stripeAccountId) {
        await env.AGAPAY_REGISTRATIONS.put(stripeAccountIndexKey(stripeAccountId), key.name);
        return { key: key.name, registration };
      }
    } catch {}
  }
  return null;
}
async function findCheckoutParish(env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return null;
  const parish = parishFromRegistration(found.registration);
  if (!parish) return null;
  return {
    ...parish,
    stripeAccountId: found.registration.stripeAccountId || '',
  };
}
export {
  findCheckoutParish,
  findRegistrationByParishId,
  findRegistrationByStripeAccountId,
  findRegistrationByStripeSubscriptionId,
  loadIndexedRegistration,
  loadRegistrationByReference,
  loadVerifiedRegistrationParishPage,
  saveRegistrationRecord,
  verifiedRegistrationParishes,
};
