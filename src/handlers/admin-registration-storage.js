// Generated from src/handlers/admin-registration-storage.ts by npm run build:server. Do not edit.
import {
  ADMIN_PASSWORD_KV_KEY,
  clampListLimit,
  COMMEMORATION_KEY_PREFIX,
  d1,
  d1All,
  d1SetSetting,
  decodeListCursor,
  DONOR_KEY_PREFIX,
  DONOR_OFFERING_KEY_PREFIX,
  encodeListCursor,
  hasProductionStore,
  isSystemKvKey,
  json,
  listKvKeys,
  missingProductionStoreResponse,
  rateLimit,
  recordStripeEvent,
  safeParseJsonRow,
  saveDonor,
  STRIPE_EVENT_PREFIX,
  unauthorized,
} from '../lib/core.js';
import '../lib/mfa.js';
import '../lib/admin-overview-metrics.js';
import { loadAdminRegistrationPage } from '../lib/registrations.js';
import '../lib/format.js';
import '../lib/subscriptions.js';
import '../lib/subscription-checkout.js';
import '../lib/parish-notifications.js';
import '../lib/memberships.js';
import '../lib/stripe-connect.js';
import { requireAdmin, requireAdminContext, saveRegistrationRecord, storeDonorOffering } from './parish.js';
import { saveCommemorationEntry } from './parish-commemorations.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import '../lib/tax-readiness.js';
import '../lib/parish-onboarding.js';
import '../lib/entitlements.js';
import '../lib/stewardship-funds.js';
import '../organizations/verification-policies.js';
import '../accounting/index.js';
import './accounting-ledger.js';
import './admin-shared.js';
import './admin-revenue.js';
import './admin-session-operations.js';
import './admin-registration-detail.js';
import './admin-onboarding-test.js';
import './admin-accounting-operations.js';
async function handleAdminRegistrations(request, env) {
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) {
    return missingProductionStoreResponse();
  }
  const url = new URL(request.url);
  const page = await loadAdminRegistrationPage(env, {
    limit: url.searchParams.get('limit'),
    cursor: url.searchParams.get('cursor'),
    status: url.searchParams.get('status'),
    q: url.searchParams.get('q') || url.searchParams.get('search'),
  });
  return json(page);
}
async function loadAllRegistrations(env, options = {}) {
  const hardLimit = clampListLimit(options.hardLimit, 1e4, 25e3);
  if (d1(env)) {
    const registrations = [];
    let cursor = '';
    do {
      const decoded = decodeListCursor(cursor);
      const where = [];
      const params = [];
      if (options.status) {
        where.push('status = ?');
        params.push(options.status);
      }
      if (decoded) {
        where.push('(received_at < ? OR (received_at = ? AND reference < ?))');
        params.push(decoded.receivedAt, decoded.receivedAt, decoded.reference);
      }
      const rows = await d1All(
        env,
        `SELECT reference, received_at, data
         FROM registrations
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY received_at DESC, reference DESC
         LIMIT ?`,
        ...params,
        501
      );
      const pageRows = rows.slice(0, 500);
      registrations.push(...pageRows.map(safeParseJsonRow).filter(Boolean));
      if (registrations.length >= hardLimit) return registrations.slice(0, hardLimit);
      cursor = rows.length > 500 ? encodeListCursor(pageRows[pageRows.length - 1]) : '';
    } while (cursor);
    return registrations;
  }
  return loadAllKvRegistrations(env, { hardLimit });
}
async function loadAllKvRegistrations(env, options = {}) {
  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { limit: options.hardLimit || 1e4 });
  const registrations = [];
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      registrations.push(JSON.parse(raw));
    } catch {
      registrations.push({ reference: key.name, status: 'unreadable' });
    }
  }
  return registrations;
}
async function handleAdminMigrateKvToD1(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-maintenance', { limit: 3, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!d1(env)) return json({ error: 'AGAPAY_DB D1 binding is not configured' }, { status: 500 });
  if (!env.AGAPAY_REGISTRATIONS)
    return json({ error: 'AGAPAY_REGISTRATIONS KV binding is not configured' }, { status: 500 });
  const keys = await listKvKeys(env, { limit: 5e3 });
  const migrated = {
    registrations: 0,
    donors: 0,
    offerings: 0,
    commemorations: 0,
    settings: 0,
    stripeEvents: 0,
    skipped: 0,
  };
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) {
      migrated.skipped += 1;
      continue;
    }
    try {
      if (key.name === ADMIN_PASSWORD_KV_KEY) {
        await d1SetSetting(env, ADMIN_PASSWORD_KV_KEY, raw);
        migrated.settings += 1;
      } else if (key.name.startsWith(DONOR_KEY_PREFIX)) {
        await saveDonor(env, JSON.parse(raw));
        migrated.donors += 1;
      } else if (key.name.startsWith(DONOR_OFFERING_KEY_PREFIX)) {
        await storeDonorOffering(env, JSON.parse(raw));
        migrated.offerings += 1;
      } else if (key.name.startsWith(COMMEMORATION_KEY_PREFIX)) {
        await saveCommemorationEntry(env, JSON.parse(raw));
        migrated.commemorations += 1;
      } else if (key.name.startsWith(STRIPE_EVENT_PREFIX)) {
        await recordStripeEvent(env, key.name.slice(STRIPE_EVENT_PREFIX.length));
        migrated.stripeEvents += 1;
      } else if (isSystemKvKey(key.name)) {
        migrated.skipped += 1;
      } else {
        const registration = JSON.parse(raw);
        await saveRegistrationRecord(env, registration.reference || key.name, registration);
        migrated.registrations += 1;
      }
    } catch {
      migrated.skipped += 1;
    }
  }
  return json({ ok: true, migrated, migratedAt: /* @__PURE__ */ new Date().toISOString() });
}
async function handleAdminRebuildIndexes(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-maintenance', { limit: 5, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const registrations = await loadAllRegistrations(env);
  let indexed = 0;
  for (const registration of registrations) {
    if (!registration.reference || registration.status === 'unreadable') continue;
    await saveRegistrationRecord(env, registration.reference, registration, registration);
    indexed += 1;
  }
  const rebuiltAt = /* @__PURE__ */ new Date().toISOString();
  await recordAuditEvent(env, request, {
    action: 'admin.index_rebuild',
    actorUserId: adminContext.actor,
    targetType: 'registrations',
    after: { indexed, rebuiltAt },
  });
  return json({ ok: true, indexed, rebuiltAt });
}
export {
  handleAdminMigrateKvToD1,
  handleAdminRebuildIndexes,
  handleAdminRegistrations,
  loadAllKvRegistrations,
  loadAllRegistrations,
};
