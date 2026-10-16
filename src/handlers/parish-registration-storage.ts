import type {
  CatalogRegistration,
  ParishRegistration,
  ParishSqlRow,
  CatalogPageOptions,
} from './parish-composition-contracts.js';

// src/handlers/parish.js
// Parish handlers and shared helpers (Stripe, donor, admin extracted to own files).

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

export async function saveRegistrationRecord(
  env: Partial<Env>,
  reference: string,
  registration: CatalogRegistration,
  previous: CatalogRegistration | null = null
) {
  if (!reference) return registration;
  const parishId =
    (registration as ParishRegistration).parishId ||
    parishSlug((registration as ParishRegistration).parishName, (registration as ParishRegistration).city);
  const previousParishId = previous
    ? (previous as ParishRegistration).parishId ||
      parishSlug((previous as ParishRegistration).parishName, (previous as ParishRegistration).city)
    : '';

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
      (registration as ParishRegistration).status || 'pending',
      (registration as ParishRegistration).parishName || '',
      (registration as ParishRegistration).communityType || '',
      (registration as ParishRegistration).stripeAccountId || '',
      (registration as ParishRegistration).stripeSubscriptionId || '',
      (registration as ParishRegistration).receivedAt || '',
      (registration as ParishRegistration).reviewedAt ||
        (registration as ParishRegistration).parishUpdatedAt ||
        (registration as ParishRegistration).subscriptionUpdatedAt ||
        new Date().toISOString(),
      JSON.stringify(registration),
      (previous || registration).goLiveAt || ''
    );
    if (saved?.meta?.changes === 0) {
      const error = new Error(
        'The parish was launched while this change was being saved. Refresh the dashboard and review your changes before saving again.'
      ) as Error & { code?: string };
      error.code = 'registration_publication_conflict';
      throw error;
    }
    return registration;
  }

  if (hasProductionStore(env)) {
    await env.AGAPAY_REGISTRATIONS!.put(reference, JSON.stringify(registration));
    if (parishId) await env.AGAPAY_REGISTRATIONS!.put(parishIdIndexKey(parishId), reference);
    if (previousParishId && previousParishId !== parishId)
      await env.AGAPAY_REGISTRATIONS!.delete(parishIdIndexKey(previousParishId));

    if ((registration as ParishRegistration).stripeAccountId)
      await env.AGAPAY_REGISTRATIONS!.put(
        stripeAccountIndexKey((registration as ParishRegistration).stripeAccountId!),
        reference
      );
    if (
      (previous as ParishRegistration)?.stripeAccountId &&
      (previous as ParishRegistration).stripeAccountId !== (registration as ParishRegistration).stripeAccountId
    ) {
      await env.AGAPAY_REGISTRATIONS!.delete(stripeAccountIndexKey((previous as ParishRegistration).stripeAccountId!));
    }

    if ((registration as ParishRegistration).stripeSubscriptionId)
      await env.AGAPAY_REGISTRATIONS!.put(
        stripeSubscriptionIndexKey((registration as ParishRegistration).stripeSubscriptionId!),
        reference
      );
    if (
      (previous as ParishRegistration)?.stripeSubscriptionId &&
      (previous as ParishRegistration).stripeSubscriptionId !==
        (registration as ParishRegistration).stripeSubscriptionId
    ) {
      await env.AGAPAY_REGISTRATIONS!.delete(
        stripeSubscriptionIndexKey((previous as ParishRegistration).stripeSubscriptionId!)
      );
    }
  }

  return registration;
}

export async function loadIndexedRegistration<Registration extends CatalogRegistration = ParishRegistration>(
  env: Partial<Env>,
  indexKey: string
): Promise<{ key: string; registration: Registration } | null> {
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

export async function loadRegistrationByReference(env: Partial<Env>, reference: string) {
  if (!reference) return null;

  if (d1(env)) {
    const row = await d1First<ParishSqlRow>(env, 'SELECT data FROM registrations WHERE reference = ?1', reference);
    const registration = parseJsonRow(row);
    if (registration) return registration;
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  const registration = JSON.parse(raw);
  if (d1(env)) await saveRegistrationRecord(env, reference, registration);
  return registration;
}

export async function loadVerifiedRegistrationParishPage(env: Partial<Env>, options: CatalogPageOptions = {}) {
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

    const rows = await d1All<ParishSqlRow>(
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
    const parishes = pageRows
      .map(safeParseJsonRow as (row: ParishSqlRow) => ParishRegistration | null)
      .map(parishFromRegistration)
      .filter(Boolean) as NonNullable<ReturnType<typeof parishFromRegistration>>[];
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
    } catch {
      // Ignore malformed registration records in the public parish directory.
    }
  }

  return { parishes: verified, cursor: null, hasMore: false, limit, source: 'kv' };
}

export async function verifiedRegistrationParishes(env: Partial<Env>, options: CatalogPageOptions = {}) {
  const page = await loadVerifiedRegistrationParishPage(env, options);
  return page.parishes;
}

export async function findRegistrationByParishId<Registration extends CatalogRegistration = ParishRegistration>(
  env: Partial<Env>,
  parishId: string
): Promise<{ key: string; registration: Registration } | null> {
  if (await parishClosureState(env, parishId)) return null;
  if (d1(env)) {
    const row = await d1First<ParishSqlRow>(
      env,
      `SELECT reference, data FROM registrations
       WHERE parish_id = ?1
       ORDER BY COALESCE(json_extract(data, '$.updatedAt'), updated_at, received_at) DESC, updated_at DESC, reference DESC
       LIMIT 1`,
      parishId
    );
    const registration = parseJsonRow(row) as Registration | null;
    if (registration) return { key: row!.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration<Registration>(env, parishIdIndexKey(parishId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      const currentParishId =
        (registration as ParishRegistration).parishId ||
        parishSlug((registration as ParishRegistration).parishName, (registration as ParishRegistration).city);
      if (currentParishId === parishId) {
        await env.AGAPAY_REGISTRATIONS!.put(parishIdIndexKey(parishId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records while searching.
    }
  }

  return null;
}

export async function findRegistrationByStripeSubscriptionId(env: Partial<Env>, subscriptionId: string) {
  if (!subscriptionId) return null;
  if (d1(env)) {
    const row = await d1First<ParishSqlRow>(
      env,
      'SELECT reference, data FROM registrations WHERE stripe_subscription_id = ?1 LIMIT 1',
      subscriptionId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row!.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeSubscriptionIndexKey(subscriptionId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if ((registration as ParishRegistration).stripeSubscriptionId === subscriptionId) {
        await env.AGAPAY_REGISTRATIONS!.put(stripeSubscriptionIndexKey(subscriptionId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records during lookup.
    }
  }
  return null;
}

export async function findRegistrationByStripeAccountId(env: Partial<Env>, stripeAccountId: string) {
  if (!stripeAccountId) return null;
  if (d1(env)) {
    const row = await d1First<ParishSqlRow>(
      env,
      'SELECT reference, data FROM registrations WHERE stripe_account_id = ?1 LIMIT 1',
      stripeAccountId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row!.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeAccountIndexKey(stripeAccountId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if ((registration as ParishRegistration).stripeAccountId === stripeAccountId) {
        await env.AGAPAY_REGISTRATIONS!.put(stripeAccountIndexKey(stripeAccountId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records during lookup.
    }
  }
  return null;
}

export async function findCheckoutParish(env: Partial<Env>, parishId: string) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return null;

  const parish = parishFromRegistration(found.registration);
  if (!parish) return null;

  return {
    ...parish,
    stripeAccountId: found.registration.stripeAccountId || '',
  };
}
