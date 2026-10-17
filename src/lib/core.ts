import type {
  CoreEnvironment,
  MarketplaceEntry,
  RegistrationCursorRow,
  DatabaseReadEnv,
  EntitlementRegistration,
  DonorRecord,
} from './core-composition-contracts.js';

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

export type { PasswordRecord, RegistrationCursorRow } from './core-operation-contracts.js';

export { d1, d1First, d1All } from './database-reads.js';

export { json, corsHeaders, corsJson, corsPreflightResponse, SECURITY_HEADERS } from './http-responses.js';

export { DONOR_OFFERING_KEY_PREFIX } from './kv-reads.js';

export { normalizeEmail } from './normalize-email.js';

export { listKvKeys } from './kv-reads.js';

export { parseJsonRow, safeParseJsonRow } from './json-rows.js';
export {
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
  PASSWORD_HASH_VERSION,
  PASSWORD_HASH_ITERATIONS,
  DONOR_SESSION_TTL_MS,
  ADMIN_SESSION_TTL_MS,
  ADMIN_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  PARISH_SESSION_MAX,
  STRIPE_EVENT_PROCESSING_RETRY_MS,
} from './core-shared.js';
export {
  secureCompare,
  sha256Hex,
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
export {
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

export function privilegedMfaRequired(env: Partial<Env>) {
  return (
    String(env?.PRIVILEGED_MFA_REQUIRED || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

export function marketplaceSearchText(entry: MarketplaceEntry = {}) {
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

export function matchMarketplaceFilters(
  entry: MarketplaceEntry,
  { query, category, spotlight }: { query: string; category: string; spotlight: string }
) {
  if (category && category !== 'all' && entry.category !== category) return false;
  if (spotlight && spotlight !== 'all' && !(entry.tags || []).includes(spotlight)) return false;
  if (query && !marketplaceSearchText(entry).includes(query)) return false;
  return true;
}

export function buildMarketplaceCategorySummaries(products: MarketplaceEntry[] = []) {
  const counts = new Map();
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

export function handleMarketplaceCatalog(request: Request) {
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

export function applyGivingEmbedHeaders(request: Request, response: Response) {
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

export function unauthorized() {
  return json({ error: 'Unauthorized' }, { status: 401 });
}

export function isSystemKvKey(keyName: unknown) {
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

export function getAdminToken(request: Request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return request.headers.get('X-AGAPAY-Admin-Token') || '';
}

export function getBearerToken(request: Request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return '';
}

export function clientIp(request: Request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function rateLimit(
  request: Request,
  env: Partial<Env>,
  bucket: string,
  { limit = 10, windowSeconds = 60 }: { limit?: number; windowSeconds?: number } = {}
) {
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const ipHash = await sha256Hex(clientIp(request));
  const key = `${RATE_LIMIT_PREFIX}${bucket}:ip:${ipHash}:${windowId}`;
  return rateLimitCounter(env, key, { limit, windowSeconds });
}

export async function rateLimitByKey(
  request: Request,
  env: Partial<Env>,
  bucket: string,
  identifier: unknown,
  { limit = 10, windowSeconds = 60 }: { limit?: number; windowSeconds?: number } = {}
) {
  const normalizedIdentifier = String(identifier || '')
    .trim()
    .toLowerCase();
  if (!normalizedIdentifier) return null;
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const identifierHash = await sha256Hex(normalizedIdentifier);
  const key = `${RATE_LIMIT_PREFIX}${bucket}:key:${identifierHash}:${windowId}`;
  return rateLimitCounter(env, key, { limit, windowSeconds });
}

export async function verifyTurnstileIfConfigured(request: Request, env: CoreEnvironment, token: unknown) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return null;
  if (!token) return json({ error: 'Security check is required. Please refresh and try again.' }, { status: 403 });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token as string,
      remoteip: clientIp(request),
    }),
  });
  const result = await (response.json().catch(() => ({})) as Promise<{ success?: boolean }>);
  if (!result.success) return json({ error: 'Security check failed. Please refresh and try again.' }, { status: 403 });
  return null;
}

export function handleSecurityConfig(env: CoreEnvironment) {
  return json({
    turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
  });
}

export function donorKey(email: unknown) {
  return `${DONOR_KEY_PREFIX}${normalizeEmail(email)}`;
}

export function donorOfferingKey(email: string, id: string) {
  return `${DONOR_OFFERING_KEY_PREFIX}${normalizeEmail(email)}:${id}`;
}

export function donorCheckoutIndexKey(checkoutSessionId: string) {
  return `${DONOR_CHECKOUT_INDEX_PREFIX}${checkoutSessionId}`;
}

export function parishIdIndexKey(parishId: string) {
  return `${PARISH_ID_INDEX_PREFIX}${parishId}`;
}

export function stripeAccountIndexKey(stripeAccountId: string) {
  return `${STRIPE_ACCOUNT_INDEX_PREFIX}${stripeAccountId}`;
}

export function stripeSubscriptionIndexKey(subscriptionId: string) {
  return `${STRIPE_SUBSCRIPTION_INDEX_PREFIX}${subscriptionId}`;
}

export function stripePaymentIntentIndexKey(paymentIntentId: string) {
  return `${STRIPE_PAYMENT_INTENT_INDEX_PREFIX}${paymentIntentId}`;
}

export function stripeEventKey(eventId: string) {
  return `${STRIPE_EVENT_PREFIX}${eventId}`;
}

export function hasProductionStore(env: Partial<Env>) {
  return Boolean(env.AGAPAY_DB || env.AGAPAY_REGISTRATIONS);
}

export function missingProductionStoreResponse() {
  return json({ error: 'AGAPAY production data store is not configured' }, { status: 500 });
}

export function clampListLimit(value: unknown, defaultLimit: number = 50, maxLimit: number = 250) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.floor(parsed)));
}

export function encodeListCursor(row: RegistrationCursorRow = {}) {
  const payload = {
    receivedAt: row.received_at || row.receivedAt || '',
    reference: row.reference || '',
  };
  if (!payload.receivedAt || !payload.reference) return '';
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeListCursor(cursor: unknown) {
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

export async function d1Run(env: DatabaseReadEnv, sql: string, ...params: unknown[]) {
  if (!d1(env)) return null;
  return d1(env)!
    .prepare(sql)
    .bind(...params)
    .run();
}

// Runs multiple statements as a single atomic D1 batch (Cloudflare's D1Database#batch),
// so related local finalization writes (status flip, cache-column update, audit insert,
// etc.) either all commit or none do. Statements are { sql, params: [...] } objects, in
// the order they should execute. Stripe calls cannot participate in this — this is for
// D1-only atomicity, always performed either entirely before or entirely after any
// Stripe API call, never interleaved with one.
export async function d1Batch(
  env: DatabaseReadEnv,
  statements: readonly { sql: string; params?: readonly unknown[] }[] | null | undefined
) {
  if (!d1(env)) return null;
  if (!Array.isArray(statements) || !statements.length) return null;
  const prepared = statements.map(({ sql, params = [] }: { sql: string; params?: readonly unknown[] }) =>
    d1(env)!
      .prepare(sql)
      .bind(...params)
  );
  return d1(env)!.batch(prepared);
}

export async function d1GetSetting(env: DatabaseReadEnv, key: string) {
  const row = await d1First<{
    id: string;
    value: string;
    status: string;
    received_at: string;
    email: string;
    data: string;
  }>(env, 'SELECT value FROM app_settings WHERE key = ?1', key);
  return row?.value || '';
}

export async function d1SetSetting(env: DatabaseReadEnv, key: string, value: string) {
  await d1Run(
    env,
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    new Date().toISOString()
  );
}

export function parseStoredStripeEvent(raw: string | null): { status?: string; receivedAt?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { status: 'processed', receivedAt: raw };
}

export function staleStripeProcessingEvent(receivedAt: string | undefined, nowMs: number = Date.now()) {
  const receivedMs = Date.parse(receivedAt || '');
  return Number.isFinite(receivedMs) && nowMs - receivedMs > STRIPE_EVENT_PROCESSING_RETRY_MS;
}

export async function claimStripeEvent(env: Partial<Env>, event: { id?: string; type?: string } = {}) {
  const eventId = event.id || '';
  if (!eventId) return { claimed: true };
  const now = new Date().toISOString();
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
      const row = await d1First<{
        id: string;
        value: string;
        status: string;
        received_at: string;
        email: string;
        data: string;
      }>(env, 'SELECT status, received_at FROM stripe_events WHERE id = ?1', eventId);
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
      const row = await d1First<{
        id: string;
        value: string;
        status: string;
        received_at: string;
        email: string;
        data: string;
      }>(env, 'SELECT id FROM stripe_events WHERE id = ?1', eventId);
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

export async function finishStripeEvent(
  env: Partial<Env>,
  eventId: string,
  status: string = 'processed',
  errorMessage: string = ''
) {
  if (!eventId) return;
  const now = new Date().toISOString();
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
        String(errorMessage || '').slice(0, 1000)
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
        errorMessage: String(errorMessage || '').slice(0, 1000),
      }),
      {
        expirationTtl: 60 * 60 * 24 * 90,
      }
    );
  }
}

export async function recordStripeEvent(env: CoreEnvironment, eventId: string) {
  if (!eventId) return;
  const now = new Date().toISOString();
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

export function generateSecret(prefix: string | number = 'agp') {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function pbkdf2Hex(password: string, salt: string, iterations: number = PASSWORD_HASH_ITERATIONS) {
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

export function publicDonor(donor: DonorRecord) {
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

export async function loadDonor(env: Partial<Env>, email: unknown): Promise<DonorRecord | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  if (d1(env)) {
    const row = await d1First<{
      id: string;
      value: string;
      status: string;
      received_at: string;
      email: string;
      data: string;
    }>(env, 'SELECT data FROM donors WHERE email = ?1', normalized);
    const donor = parseJsonRow(row) as DonorRecord | null;
    if (donor) return donor;
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(donorKey(normalized));
  if (!raw) return null;
  const donor = JSON.parse(raw);
  if (d1(env)) await saveDonor(env, donor);
  return donor;
}

export async function saveDonor(env: CoreEnvironment, donor: DonorRecord) {
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
      record.updatedAt || new Date().toISOString(),
      data
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(donorKey(email), data);
  }

  return donor;
}

export async function deleteDonor(env: CoreEnvironment, email: unknown) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (d1(env)) await d1Run(env, 'DELETE FROM donors WHERE email = ?1', normalized);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.delete(donorKey(normalized));
}

// A comp grant is active if it was actually granted and hasn't passed its
// expiresAt. Entirely separate from the Stripe subscription fields — a
// comped parish has no Stripe customer/subscription at all.
export function hasActiveStewardshipComp(registration: EntitlementRegistration | null | undefined) {
  const comp = registration?.stewardshipComp;
  if (!comp?.active) return false;
  if (!comp.expiresAt) return true;
  return new Date(comp.expiresAt).getTime() > Date.now();
}

export function stewardshipStatus(registration: EntitlementRegistration | null | undefined) {
  if (hasActiveStewardshipComp(registration)) return 'comped';
  return registration?.stewardshipStatus || 'no_subscription';
}

export function hasStewardshipAccess(registration: EntitlementRegistration | null | undefined) {
  if (hasActiveStewardshipComp(registration)) return true;
  return STEWARDSHIP_ACTIVE_STATES.has(stewardshipStatus(registration));
}
