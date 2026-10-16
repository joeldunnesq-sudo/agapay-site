// Generated from src/lib/core.ts by npm run build:server. Do not edit.
import { d1, d1First } from './database-reads.js';
import { json } from './http-responses.js';
import { DONOR_OFFERING_KEY_PREFIX } from './kv-reads.js';
import { normalizeEmail } from './normalize-email.js';
import './kv-reads.js';
import { parseJsonRow } from './json-rows.js';
import {
  ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_STORE_KEY,
  COMMEMORATION_KEY_PREFIX,
  DONOR_KEY_PREFIX,
  DONOR_CHECKOUT_INDEX_PREFIX,
  RATE_LIMIT_PREFIX,
  STRIPE_EVENT_PREFIX,
  PARISH_ID_INDEX_PREFIX,
  STRIPE_ACCOUNT_INDEX_PREFIX,
  STRIPE_SUBSCRIPTION_INDEX_PREFIX,
  STRIPE_PAYMENT_INTENT_INDEX_PREFIX,
  PASSWORD_HASH_ITERATIONS,
  STRIPE_EVENT_PROCESSING_RETRY_MS,
  marketplaceBrowseCategories,
  marketplaceFeaturedFilters,
  marketplaceShops,
  marketplaceProducts,
  STEWARDSHIP_ACTIVE_STATES,
} from './core-shared.js';
import { rateLimitCounter, toHex } from './core-shared.js';
import { sha256Hex } from './core-authentication.js';
import './core-sessions.js';
import { d1 as d12, d1First as d1First2, d1All } from './database-reads.js';
import { json as json2, corsHeaders, corsJson, corsPreflightResponse, SECURITY_HEADERS } from './http-responses.js';
import { DONOR_OFFERING_KEY_PREFIX as DONOR_OFFERING_KEY_PREFIX2 } from './kv-reads.js';
import { normalizeEmail as normalizeEmail2 } from './normalize-email.js';
import { listKvKeys } from './kv-reads.js';
import { parseJsonRow as parseJsonRow2, safeParseJsonRow } from './json-rows.js';
import {
  ADMIN_PASSWORD_KV_KEY as ADMIN_PASSWORD_KV_KEY2,
  ADMIN_SESSION_STORE_KEY as ADMIN_SESSION_STORE_KEY2,
  COMMEMORATION_KEY_PREFIX as COMMEMORATION_KEY_PREFIX2,
  DONOR_KEY_PREFIX as DONOR_KEY_PREFIX2,
  DONOR_CHECKOUT_INDEX_PREFIX as DONOR_CHECKOUT_INDEX_PREFIX2,
  RATE_LIMIT_PREFIX as RATE_LIMIT_PREFIX2,
  STRIPE_EVENT_PREFIX as STRIPE_EVENT_PREFIX2,
  PARISH_ID_INDEX_PREFIX as PARISH_ID_INDEX_PREFIX2,
  STRIPE_ACCOUNT_INDEX_PREFIX as STRIPE_ACCOUNT_INDEX_PREFIX2,
  STRIPE_SUBSCRIPTION_INDEX_PREFIX as STRIPE_SUBSCRIPTION_INDEX_PREFIX2,
  STRIPE_PAYMENT_INTENT_INDEX_PREFIX as STRIPE_PAYMENT_INTENT_INDEX_PREFIX2,
  PASSWORD_HASH_VERSION,
  PASSWORD_HASH_ITERATIONS as PASSWORD_HASH_ITERATIONS2,
  DONOR_SESSION_TTL_MS,
  ADMIN_SESSION_TTL_MS,
  ADMIN_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  PARISH_SESSION_MAX,
  STRIPE_EVENT_PROCESSING_RETRY_MS as STRIPE_EVENT_PROCESSING_RETRY_MS2,
} from './core-shared.js';
import {
  secureCompare,
  sha256Hex as sha256Hex2,
  randomHex,
  createPasswordRecord,
  parsePasswordRecord,
  verifyPasswordRecord,
  hashPassword,
  hashSessionToken,
  verifyDonorPassword,
  applyDonorPassword,
  verifyParishDashboardPassword,
  applyParishDashboardPassword,
} from './core-authentication.js';
import {
  parseAdminSessionStore,
  loadAdminSessionStore,
  saveAdminSessionStore,
  normalizeAdminActor,
  pruneAdminSessions,
  issueAdminSession,
  markAdminSessionMfaVerified,
  resolveAdminSession,
  pruneParishDashboardSessions,
  issueParishDashboardSession,
  resolveParishDashboardSession,
  markParishDashboardSessionMfaVerified,
} from './core-sessions.js';
function privilegedMfaRequired(env) {
  return (
    String(env?.PRIVILEGED_MFA_REQUIRED || '')
      .trim()
      .toLowerCase() === 'true'
  );
}
function marketplaceSearchText(entry = {}) {
  return [
    entry.name,
    entry.title,
    entry.subtitle,
    entry.shopName,
    entry.location,
    entry.category,
    ...(entry.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
function matchMarketplaceFilters(entry, { query, category, spotlight }) {
  if (category && category !== 'all' && entry.category !== category) return false;
  if (spotlight && spotlight !== 'all' && !(entry.tags || []).includes(spotlight)) return false;
  if (query && !marketplaceSearchText(entry).includes(query)) return false;
  return true;
}
function buildMarketplaceCategorySummaries(products = []) {
  const counts = /* @__PURE__ */ new Map();
  for (const product of products) {
    const key = product.category || 'all';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return marketplaceBrowseCategories
    .filter((category) => category.id !== 'all')
    .map((category) => ({
      ...category,
      itemCount: counts.get(category.id) || 0,
    }));
}
function handleMarketplaceCatalog(request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().toLowerCase();
  const category = (url.searchParams.get('category') || 'all').trim().toLowerCase();
  const spotlight = (url.searchParams.get('spotlight') || 'all').trim().toLowerCase();
  const filteredShops = marketplaceShops.filter((entry) =>
    matchMarketplaceFilters(entry, { query, category, spotlight })
  );
  const filteredProducts = marketplaceProducts.filter((entry) =>
    matchMarketplaceFilters(entry, { query, category, spotlight })
  );
  const featuredShops = filteredShops.slice(0, 8);
  const curatedPicks = filteredProducts.slice(0, 12);
  const popularCategories = buildMarketplaceCategorySummaries(
    filteredProducts.length ? filteredProducts : marketplaceProducts
  );
  return json({
    query: {
      q: query,
      category,
      spotlight,
    },
    browseCategories: marketplaceBrowseCategories,
    featuredFilters: marketplaceFeaturedFilters,
    featuredShops,
    popularCategories,
    curatedPicks,
    totals: {
      shops: filteredShops.length,
      products: filteredProducts.length,
    },
  });
}
function applyGivingEmbedHeaders(request, response) {
  const pathname = new URL(request.url).pathname;
  const campaignEmbed = /^\/give\/campaign-embed\/[^/]+\/[^/]+\/?$/.test(pathname);
  if (!(
    campaignEmbed ||
    pathname === '/give/embed' ||
    pathname === '/give/embed.html' ||
    /^\/give\/embed\/[^/]+\/?$/.test(pathname)
  ))
    return response;
  const headers = new Headers(response.headers);
  headers.delete('X-Frame-Options');
  headers.set('Content-Security-Policy', 'frame-ancestors *');
  headers.set('X-Robots-Tag', campaignEmbed ? 'noindex, indexifembedded' : 'noindex, nofollow');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function unauthorized() {
  return json({ error: 'Unauthorized' }, { status: 401 });
}
function isSystemKvKey(keyName) {
  const key = String(keyName || '');
  return (
    key === ADMIN_PASSWORD_KV_KEY ||
    key === ADMIN_SESSION_STORE_KEY ||
    key.startsWith(COMMEMORATION_KEY_PREFIX) ||
    key.startsWith(DONOR_KEY_PREFIX) ||
    key.startsWith(DONOR_OFFERING_KEY_PREFIX) ||
    key.startsWith(DONOR_CHECKOUT_INDEX_PREFIX) ||
    key.startsWith(RATE_LIMIT_PREFIX) ||
    key.startsWith(STRIPE_EVENT_PREFIX) ||
    key.startsWith(PARISH_ID_INDEX_PREFIX) ||
    key.startsWith(STRIPE_ACCOUNT_INDEX_PREFIX) ||
    key.startsWith(STRIPE_SUBSCRIPTION_INDEX_PREFIX) ||
    key.startsWith(STRIPE_PAYMENT_INTENT_INDEX_PREFIX)
  );
}
function getAdminToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return request.headers.get('X-AGAPAY-Admin-Token') || '';
}
function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return '';
}
function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
async function rateLimit(request, env, bucket, { limit = 10, windowSeconds = 60 } = {}) {
  const windowId = Math.floor(Date.now() / (windowSeconds * 1e3));
  const ipHash = await sha256Hex(clientIp(request));
  const key = `${RATE_LIMIT_PREFIX}${bucket}:ip:${ipHash}:${windowId}`;
  return rateLimitCounter(env, key, { limit, windowSeconds });
}
async function rateLimitByKey(request, env, bucket, identifier, { limit = 10, windowSeconds = 60 } = {}) {
  const normalizedIdentifier = String(identifier || '')
    .trim()
    .toLowerCase();
  if (!normalizedIdentifier) return null;
  const windowId = Math.floor(Date.now() / (windowSeconds * 1e3));
  const identifierHash = await sha256Hex(normalizedIdentifier);
  const key = `${RATE_LIMIT_PREFIX}${bucket}:key:${identifierHash}:${windowId}`;
  return rateLimitCounter(env, key, { limit, windowSeconds });
}
async function verifyTurnstileIfConfigured(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return null;
  if (!token) return json({ error: 'Security check is required. Please refresh and try again.' }, { status: 403 });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: clientIp(request),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!result.success) return json({ error: 'Security check failed. Please refresh and try again.' }, { status: 403 });
  return null;
}
function handleSecurityConfig(env) {
  return json({
    turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
  });
}
function donorKey(email) {
  return `${DONOR_KEY_PREFIX}${normalizeEmail(email)}`;
}
function donorOfferingKey(email, id) {
  return `${DONOR_OFFERING_KEY_PREFIX}${normalizeEmail(email)}:${id}`;
}
function donorCheckoutIndexKey(checkoutSessionId) {
  return `${DONOR_CHECKOUT_INDEX_PREFIX}${checkoutSessionId}`;
}
function parishIdIndexKey(parishId) {
  return `${PARISH_ID_INDEX_PREFIX}${parishId}`;
}
function stripeAccountIndexKey(stripeAccountId) {
  return `${STRIPE_ACCOUNT_INDEX_PREFIX}${stripeAccountId}`;
}
function stripeSubscriptionIndexKey(subscriptionId) {
  return `${STRIPE_SUBSCRIPTION_INDEX_PREFIX}${subscriptionId}`;
}
function stripePaymentIntentIndexKey(paymentIntentId) {
  return `${STRIPE_PAYMENT_INTENT_INDEX_PREFIX}${paymentIntentId}`;
}
function stripeEventKey(eventId) {
  return `${STRIPE_EVENT_PREFIX}${eventId}`;
}
function hasProductionStore(env) {
  return Boolean(env.AGAPAY_DB || env.AGAPAY_REGISTRATIONS);
}
function missingProductionStoreResponse() {
  return json({ error: 'AGAPAY production data store is not configured' }, { status: 500 });
}
function clampListLimit(value, defaultLimit = 50, maxLimit = 250) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.floor(parsed)));
}
function encodeListCursor(row = {}) {
  const payload = {
    receivedAt: row.received_at || row.receivedAt || '',
    reference: row.reference || '',
  };
  if (!payload.receivedAt || !payload.reference) return '';
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeListCursor(cursor) {
  if (!cursor) return null;
  try {
    const normalized = String(cursor).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    if (!payload?.receivedAt || !payload?.reference) return null;
    return payload;
  } catch {
    return null;
  }
}
async function d1Run(env, sql, ...params) {
  if (!d1(env)) return null;
  return d1(env)
    .prepare(sql)
    .bind(...params)
    .run();
}
async function d1Batch(env, statements) {
  if (!d1(env)) return null;
  if (!Array.isArray(statements) || !statements.length) return null;
  const prepared = statements.map(({ sql, params = [] }) =>
    d1(env)
      .prepare(sql)
      .bind(...params)
  );
  return d1(env).batch(prepared);
}
async function d1GetSetting(env, key) {
  const row = await d1First(env, 'SELECT value FROM app_settings WHERE key = ?1', key);
  return row?.value || '';
}
async function d1SetSetting(env, key, value) {
  await d1Run(
    env,
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    /* @__PURE__ */ new Date().toISOString()
  );
}
function parseStoredStripeEvent(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { status: 'processed', receivedAt: raw };
}
function staleStripeProcessingEvent(receivedAt, nowMs = Date.now()) {
  const receivedMs = Date.parse(receivedAt || '');
  return Number.isFinite(receivedMs) && nowMs - receivedMs > STRIPE_EVENT_PROCESSING_RETRY_MS;
}
async function claimStripeEvent(env, event = {}) {
  const eventId = event.id || '';
  if (!eventId) return { claimed: true };
  const now = /* @__PURE__ */ new Date().toISOString();
  if (d1(env)) {
    try {
      const result = await d1Run(
        env,
        `INSERT INTO stripe_events (id, event_type, status, received_at)
         VALUES (?1, ?2, 'processing', ?3)
         ON CONFLICT(id) DO NOTHING`,
        eventId,
        event.type || '',
        now
      );
      if ((result?.meta?.changes || 0) > 0) return { claimed: true };
      const row = await d1First(env, 'SELECT status, received_at FROM stripe_events WHERE id = ?1', eventId);
      if (row?.status === 'failed' || (row?.status === 'processing' && staleStripeProcessingEvent(row.received_at))) {
        await d1Run(
          env,
          `UPDATE stripe_events
           SET event_type = ?2, status = 'processing', received_at = ?3, processed_at = NULL, error_message = ''
           WHERE id = ?1`,
          eventId,
          event.type || '',
          now
        );
        return { claimed: true, retryingFailed: row?.status === 'failed', retryingStale: row?.status === 'processing' };
      }
      return { claimed: false, duplicate: true, status: row?.status || 'processed' };
    } catch (error) {
      const row = await d1First(env, 'SELECT id FROM stripe_events WHERE id = ?1', eventId);
      if (row) return { claimed: false, duplicate: true, status: 'processed', legacy: true };
      await d1Run(env, 'INSERT INTO stripe_events (id, received_at) VALUES (?1, ?2)', eventId, now);
      return { claimed: true, legacy: true };
    }
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const key = stripeEventKey(eventId);
    const existing = parseStoredStripeEvent(await env.AGAPAY_REGISTRATIONS.get(key));
    if (
      existing &&
      existing.status !== 'failed' &&
      !(existing.status === 'processing' && staleStripeProcessingEvent(existing.receivedAt))
    ) {
      return { claimed: false, duplicate: true, status: existing.status || 'processed' };
    }
    await env.AGAPAY_REGISTRATIONS.put(
      key,
      JSON.stringify({
        id: eventId,
        eventType: event.type || '',
        status: 'processing',
        receivedAt: now,
        processedAt: '',
        errorMessage: '',
      }),
      {
        expirationTtl: 60 * 60 * 24 * 90,
      }
    );
    return {
      claimed: true,
      retryingFailed: existing?.status === 'failed',
      retryingStale: existing?.status === 'processing',
    };
  }
  return { claimed: true };
}
async function finishStripeEvent(env, eventId, status = 'processed', errorMessage = '') {
  if (!eventId) return;
  const now = /* @__PURE__ */ new Date().toISOString();
  if (d1(env)) {
    try {
      await d1Run(
        env,
        `UPDATE stripe_events
         SET status = ?2, processed_at = ?3, error_message = ?4
         WHERE id = ?1`,
        eventId,
        status,
        status === 'processed' ? now : '',
        String(errorMessage || '').slice(0, 1e3)
      );
      return;
    } catch {
      if (status === 'failed') {
        await d1Run(env, 'DELETE FROM stripe_events WHERE id = ?1', eventId);
      }
      return;
    }
  }
  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(
      stripeEventKey(eventId),
      JSON.stringify({
        id: eventId,
        status,
        receivedAt: now,
        processedAt: status === 'processed' ? now : '',
        errorMessage: String(errorMessage || '').slice(0, 1e3),
      }),
      {
        expirationTtl: 60 * 60 * 24 * 90,
      }
    );
  }
}
async function recordStripeEvent(env, eventId) {
  if (!eventId) return;
  const now = /* @__PURE__ */ new Date().toISOString();
  if (d1(env)) {
    try {
      await d1Run(
        env,
        `INSERT INTO stripe_events (id, event_type, status, received_at, processed_at, error_message)
         VALUES (?1, '', 'processed', ?2, ?2, '')
         ON CONFLICT(id) DO UPDATE SET status = 'processed', processed_at = excluded.processed_at, error_message = ''`,
        eventId,
        now
      );
    } catch {
      await d1Run(
        env,
        `INSERT INTO stripe_events (id, received_at)
         VALUES (?1, ?2)
         ON CONFLICT(id) DO UPDATE SET received_at = excluded.received_at`,
        eventId,
        now
      );
    }
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(
      stripeEventKey(eventId),
      JSON.stringify({
        id: eventId,
        status: 'processed',
        receivedAt: now,
        processedAt: now,
        errorMessage: '',
      }),
      {
        expirationTtl: 60 * 60 * 24 * 90,
      }
    );
  }
}
function generateSecret(prefix = 'agp') {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
async function pbkdf2Hex(password, salt, iterations = PASSWORD_HASH_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(String(salt || '')),
      iterations,
    },
    keyMaterial,
    256
  );
  return toHex(derived);
}
function publicDonor(donor) {
  return {
    email: donor.email || '',
    donorName: donor.donorName || '',
    householdName: donor.householdName || donor.donorName || '',
    contactPhone: donor.contactPhone || '',
    defaultParishId: donor.defaultParishId || '',
    pledgeAmountCents: Number(donor.pledgeAmountCents || 0),
    pledgeCadence: donor.pledgeCadence === 'monthly' ? 'monthly' : 'annual',
    pledgeYear: donor.pledgeYear || '',
    addressLine1: donor.addressLine1 || '',
    addressLine2: donor.addressLine2 || '',
    city: donor.city || '',
    state: donor.state || '',
    postalCode: donor.postalCode || '',
    country: donor.country || '',
    emailVerifiedAt: donor.emailVerifiedAt || '',
    createdAt: donor.createdAt || '',
    updatedAt: donor.updatedAt || '',
    lastLoginAt: donor.lastLoginAt || '',
  };
}
async function loadDonor(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (d1(env)) {
    const row = await d1First(env, 'SELECT data FROM donors WHERE email = ?1', normalized);
    const donor2 = parseJsonRow(row);
    if (donor2) return donor2;
  }
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(donorKey(normalized));
  if (!raw) return null;
  const donor = JSON.parse(raw);
  if (d1(env)) await saveDonor(env, donor);
  return donor;
}
async function saveDonor(env, donor) {
  const email = normalizeEmail(donor.email);
  const record = { ...donor, email };
  const data = JSON.stringify(record);
  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO donors (email, default_parish_id, email_verified_at, created_at, updated_at, data)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(email) DO UPDATE SET
         default_parish_id = excluded.default_parish_id,
         email_verified_at = excluded.email_verified_at,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      email,
      record.defaultParishId || '',
      record.emailVerifiedAt || '',
      record.createdAt || '',
      record.updatedAt || /* @__PURE__ */ new Date().toISOString(),
      data
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(donorKey(email), data);
  }
  return donor;
}
async function deleteDonor(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (d1(env)) await d1Run(env, 'DELETE FROM donors WHERE email = ?1', normalized);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.delete(donorKey(normalized));
}
function hasActiveStewardshipComp(registration) {
  const comp = registration?.stewardshipComp;
  if (!comp?.active) return false;
  if (!comp.expiresAt) return true;
  return new Date(comp.expiresAt).getTime() > Date.now();
}
function stewardshipStatus(registration) {
  if (hasActiveStewardshipComp(registration)) return 'comped';
  return registration?.stewardshipStatus || 'no_subscription';
}
function hasStewardshipAccess(registration) {
  if (hasActiveStewardshipComp(registration)) return true;
  return STEWARDSHIP_ACTIVE_STATES.has(stewardshipStatus(registration));
}
export {
  ADMIN_PASSWORD_KV_KEY2 as ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_MAX,
  ADMIN_SESSION_STORE_KEY2 as ADMIN_SESSION_STORE_KEY,
  ADMIN_SESSION_TTL_MS,
  COMMEMORATION_KEY_PREFIX2 as COMMEMORATION_KEY_PREFIX,
  DONOR_CHECKOUT_INDEX_PREFIX2 as DONOR_CHECKOUT_INDEX_PREFIX,
  DONOR_KEY_PREFIX2 as DONOR_KEY_PREFIX,
  DONOR_OFFERING_KEY_PREFIX2 as DONOR_OFFERING_KEY_PREFIX,
  DONOR_SESSION_TTL_MS,
  PARISH_ID_INDEX_PREFIX2 as PARISH_ID_INDEX_PREFIX,
  PARISH_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  PASSWORD_HASH_ITERATIONS2 as PASSWORD_HASH_ITERATIONS,
  PASSWORD_HASH_VERSION,
  RATE_LIMIT_PREFIX2 as RATE_LIMIT_PREFIX,
  SECURITY_HEADERS,
  STRIPE_ACCOUNT_INDEX_PREFIX2 as STRIPE_ACCOUNT_INDEX_PREFIX,
  STRIPE_EVENT_PREFIX2 as STRIPE_EVENT_PREFIX,
  STRIPE_EVENT_PROCESSING_RETRY_MS2 as STRIPE_EVENT_PROCESSING_RETRY_MS,
  STRIPE_PAYMENT_INTENT_INDEX_PREFIX2 as STRIPE_PAYMENT_INTENT_INDEX_PREFIX,
  STRIPE_SUBSCRIPTION_INDEX_PREFIX2 as STRIPE_SUBSCRIPTION_INDEX_PREFIX,
  applyDonorPassword,
  applyGivingEmbedHeaders,
  applyParishDashboardPassword,
  buildMarketplaceCategorySummaries,
  claimStripeEvent,
  clampListLimit,
  clientIp,
  corsHeaders,
  corsJson,
  corsPreflightResponse,
  createPasswordRecord,
  d12 as d1,
  d1All,
  d1Batch,
  d1First2 as d1First,
  d1GetSetting,
  d1Run,
  d1SetSetting,
  decodeListCursor,
  deleteDonor,
  donorCheckoutIndexKey,
  donorKey,
  donorOfferingKey,
  encodeListCursor,
  finishStripeEvent,
  generateSecret,
  getAdminToken,
  getBearerToken,
  handleMarketplaceCatalog,
  handleSecurityConfig,
  hasActiveStewardshipComp,
  hasProductionStore,
  hasStewardshipAccess,
  hashPassword,
  hashSessionToken,
  isSystemKvKey,
  issueAdminSession,
  issueParishDashboardSession,
  json2 as json,
  listKvKeys,
  loadAdminSessionStore,
  loadDonor,
  markAdminSessionMfaVerified,
  markParishDashboardSessionMfaVerified,
  marketplaceSearchText,
  matchMarketplaceFilters,
  missingProductionStoreResponse,
  normalizeAdminActor,
  normalizeEmail2 as normalizeEmail,
  parishIdIndexKey,
  parseAdminSessionStore,
  parseJsonRow2 as parseJsonRow,
  parsePasswordRecord,
  parseStoredStripeEvent,
  pbkdf2Hex,
  privilegedMfaRequired,
  pruneAdminSessions,
  pruneParishDashboardSessions,
  publicDonor,
  randomHex,
  rateLimit,
  rateLimitByKey,
  recordStripeEvent,
  resolveAdminSession,
  resolveParishDashboardSession,
  safeParseJsonRow,
  saveAdminSessionStore,
  saveDonor,
  secureCompare,
  sha256Hex2 as sha256Hex,
  staleStripeProcessingEvent,
  stewardshipStatus,
  stripeAccountIndexKey,
  stripeEventKey,
  stripePaymentIntentIndexKey,
  stripeSubscriptionIndexKey,
  unauthorized,
  verifyDonorPassword,
  verifyParishDashboardPassword,
  verifyPasswordRecord,
  verifyTurnstileIfConfigured,
};
