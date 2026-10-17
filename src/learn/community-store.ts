import type {
  LearnStoreEnvironment,
  LearnSubmitter,
  LearnAdministrator,
  CommunityResource,
} from './community-store-contracts.js';
import { d1, d1All, d1First, d1SetSetting, generateSecret, listKvKeys } from '../lib/core.js';
import { getLearnSeedSnapshot } from './demo-data.js';

import { isCommunityResource } from './stored-record-validation.js';

const COMMUNITY_RESOURCE_PREFIX = '__agapay_learn_community_resource:';
const ALLOWED_STATUSES = new Set(['pending', 'approved', 'hidden', 'removed']);

function key(id: string) {
  return `${COMMUNITY_RESOURCE_PREFIX}${id}`;
}

function parse(value: unknown, expectedId: string): CommunityResource | null {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    return isCommunityResource(parsed) && parsed.id === expectedId ? parsed : null;
  } catch {
    return null;
  }
}

function clean(value: unknown, limit: number = 240) {
  return String(value || '')
    .trim()
    .slice(0, limit);
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function seededCommunityResources() {
  const seed = getLearnSeedSnapshot() as { communityResources?: CommunityResource[] };
  return (Array.isArray(seed.communityResources) ? seed.communityResources : [])
    .filter((record) => record && record.id)
    .map((record) => ({
      ...record,
      source: record.source || 'agapay-curated',
      description: record.description || record.subtitle || '',
      status: record.status || 'approved',
      vetted: record.vetted ?? true,
      pinned: Boolean(record.pinned || record.vetted),
      sharedBy: record.sharedBy || 'AGAPAY Curated',
      submittedBy: record.submittedBy || 'AGAPAY',
      householdId: record.householdId || '',
      flags: Array.isArray(record.flags) ? record.flags : [],
      seeded: true,
    }));
}

function seededCommunityResource(id: unknown) {
  const resourceId = clean(id, 100);
  return seededCommunityResources().find((record) => record.id === resourceId) || null;
}

async function save(env: LearnStoreEnvironment, record: CommunityResource) {
  const raw = JSON.stringify(record);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(key(record.id), raw);
  if (d1(env)) await d1SetSetting(env, key(record.id), raw);
  return record;
}

export async function getLearnCommunityResource(env: LearnStoreEnvironment, id: unknown) {
  const resourceId = clean(id, 100);
  if (!resourceId) return null;
  if (d1(env)) {
    const row = await d1First<{ value: string }>(env, 'SELECT value FROM app_settings WHERE key = ?1', key(resourceId));
    if (row) return parse(row.value, resourceId);
  }
  const raw = env.AGAPAY_REGISTRATIONS ? await env.AGAPAY_REGISTRATIONS.get(key(resourceId)) : null;
  return raw === null ? seededCommunityResource(resourceId) : parse(raw, resourceId);
}

export async function listLearnCommunityResources(
  env: LearnStoreEnvironment,
  { includeAll = false, includeSeeded = false }: { includeAll?: boolean; includeSeeded?: boolean } = {}
) {
  const records = new Map<string, CommunityResource>();
  const canonicalIds = new Set<string>();
  if (includeSeeded) seededCommunityResources().forEach((record) => records.set(record.id, record));
  if (d1(env)) {
    const rows = await d1All<{ key: string; value: string }>(
      env,
      'SELECT key, value FROM app_settings WHERE key LIKE ?1 ORDER BY updated_at DESC LIMIT 1000',
      `${COMMUNITY_RESOURCE_PREFIX}%`
    );
    for (const row of rows) {
      if (!row.key.startsWith(COMMUNITY_RESOURCE_PREFIX)) continue;
      const id = row.key.slice(COMMUNITY_RESOURCE_PREFIX.length);
      canonicalIds.add(id);
      const record = parse(row.value, id);
      if (record) records.set(id, record);
      else records.delete(id);
    }
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: COMMUNITY_RESOURCE_PREFIX, limit: 1000 });
    const values = await Promise.all(keys.map((item) => env.AGAPAY_REGISTRATIONS!.get(item.name)));
    values.forEach((value, index) => {
      const id = keys[index]!.name.slice(COMMUNITY_RESOURCE_PREFIX.length);
      if (canonicalIds.has(id)) return;
      const record = parse(value, id);
      if (record) {
        if (!records.has(id)) records.set(id, record);
      } else records.delete(id);
    });
  }
  return [...records.values()]
    .filter((record) => includeAll || record.status === 'approved')
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
}

export async function submitLearnCommunityResource(
  env: LearnStoreEnvironment,
  identity: LearnSubmitter,
  body: Record<string, unknown> = {}
) {
  const title = clean(body.title, 120);
  const url = safeUrl(body.url);
  const description = clean(body.description, 600);
  if (!title || !url || !description)
    return { ok: false, status: 400, error: 'Title, link, and description are required.' };
  const now = new Date().toISOString();
  const record: CommunityResource = {
    id: generateSecret('learn_resource'),
    source: 'community',
    title,
    url,
    description,
    subtitle: description,
    category: clean(body.category, 60) || 'General',
    resourceType: clean(body.resourceType, 60) || 'Website',
    mediaType: clean(body.mediaType, 60) || 'Mixed Media',
    ageRange: clean(body.ageRange, 40) || 'Family',
    tags: Array.isArray(body.tags)
      ? body.tags
          .map((tag: unknown) => clean(tag, 40))
          .filter(Boolean)
          .slice(0, 10)
      : clean(body.tags, 240)
          .split(',')
          .map((tag) => clean(tag, 40))
          .filter(Boolean)
          .slice(0, 10),
    submittedBy: identity.email,
    householdId: identity.householdId,
    status: 'pending',
    flags: [],
    createdAt: now,
    updatedAt: now,
  };
  await save(env, record);
  return { ok: true, resource: record };
}

export async function createCuratedLearnCommunityResource(
  env: LearnStoreEnvironment,
  adminContext: LearnAdministrator,
  body: Record<string, unknown> = {}
) {
  const title = clean(body.title, 120);
  const url = safeUrl(body.url);
  const description = clean(body.description, 600);
  if (!title || !url || !description)
    return { ok: false, status: 400, error: 'Title, link, and description are required.' };
  const now = new Date().toISOString();
  const record: CommunityResource = {
    id: generateSecret('learn_resource'),
    source: 'agapay-curated',
    title,
    url,
    description,
    subtitle: description,
    category: clean(body.category, 60) || 'General',
    resourceType: clean(body.resourceType, 60) || 'Website',
    mediaType: clean(body.mediaType, 60) || 'Mixed Media',
    ageRange: clean(body.ageRange, 40) || 'Family',
    tags: Array.isArray(body.tags)
      ? body.tags
          .map((tag: unknown) => clean(tag, 40))
          .filter(Boolean)
          .slice(0, 10)
      : clean(body.tags, 240)
          .split(',')
          .map((tag) => clean(tag, 40))
          .filter(Boolean)
          .slice(0, 10),
    sharedBy: 'AGAPAY',
    submittedBy: adminContext.actor || 'AGAPAY Admin',
    householdId: '',
    status: 'approved',
    vetted: true,
    pinned: Boolean(body.pinned),
    flags: [],
    createdAt: now,
    updatedAt: now,
    curatedBy: adminContext.actor || 'AGAPAY Admin',
    curatedAt: now,
  };
  await save(env, record);
  return { ok: true, resource: record };
}

export async function updateCuratedLearnCommunityResource(
  env: LearnStoreEnvironment,
  adminContext: LearnAdministrator,
  id: unknown,
  body: Record<string, unknown> = {}
) {
  const record = await getLearnCommunityResource(env, id);
  if (!record) return { ok: false, status: 404, error: 'Community resource not found.' };
  if (!(record.vetted || record.source === 'agapay-curated')) {
    return { ok: false, status: 400, error: 'Only AGAPAY curated resources can be edited here.' };
  }
  const title = clean(body.title, 120);
  const url = safeUrl(body.url);
  const description = clean(body.description, 600);
  if (!title || !url || !description)
    return { ok: false, status: 400, error: 'Title, link, and description are required.' };
  const updated = {
    ...record,
    source: 'agapay-curated',
    title,
    url,
    description,
    subtitle: description,
    category: clean(body.category, 60) || 'General',
    resourceType: clean(body.resourceType, 60) || 'Website',
    mediaType: clean(body.mediaType, 60) || 'Mixed Media',
    ageRange: clean(body.ageRange, 40) || 'Family',
    tags: Array.isArray(body.tags)
      ? body.tags
          .map((tag: unknown) => clean(tag, 40))
          .filter(Boolean)
          .slice(0, 10)
      : clean(body.tags, 240)
          .split(',')
          .map((tag) => clean(tag, 40))
          .filter(Boolean)
          .slice(0, 10),
    sharedBy: 'AGAPAY',
    status: ALLOWED_STATUSES.has(clean(body.status, 20).toLowerCase())
      ? clean(body.status, 20).toLowerCase()
      : record.status || 'approved',
    vetted: true,
    pinned: Boolean(body.pinned),
    updatedAt: new Date().toISOString(),
    curatedBy: record.curatedBy || adminContext.actor || 'AGAPAY Admin',
    lastEditedBy: adminContext.actor || 'AGAPAY Admin',
    lastEditedAt: new Date().toISOString(),
  };
  await save(env, updated);
  return { ok: true, resource: updated };
}

export async function flagLearnCommunityResource(
  env: LearnStoreEnvironment,
  identity: LearnSubmitter,
  id: unknown,
  reason: unknown = ''
) {
  const record = await getLearnCommunityResource(env, id);
  if (!record || record.status !== 'approved')
    return { ok: false, status: 404, error: 'Community resource not found.' };
  const flags = Array.isArray(record.flags) ? record.flags : [];
  if (!flags.some((flag) => flag.email === identity.email)) {
    flags.push({
      email: identity.email,
      reason: clean(reason, 300) || 'Inappropriate or inconsistent with Orthodox Christian standards.',
      createdAt: new Date().toISOString(),
    });
  }
  const updated = { ...record, flags, updatedAt: new Date().toISOString() };
  await save(env, updated);
  return { ok: true, resource: updated };
}

export async function moderateLearnCommunityResource(
  env: LearnStoreEnvironment,
  adminContext: LearnAdministrator,
  id: unknown,
  body: Record<string, unknown> = {}
) {
  const record = await getLearnCommunityResource(env, id);
  if (!record) return { ok: false, status: 404, error: 'Community resource not found.' };
  const status = clean(body.status, 20).toLowerCase();
  if (!ALLOWED_STATUSES.has(status)) return { ok: false, status: 400, error: 'Moderation status was invalid.' };
  const updated = {
    ...record,
    status,
    flags: [],
    moderationNote: clean(body.note, 500),
    moderatedBy: adminContext.actor || 'Admin',
    moderatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await save(env, updated);
  return { ok: true, resource: updated };
}
