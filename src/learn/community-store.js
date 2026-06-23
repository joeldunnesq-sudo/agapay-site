import { d1, d1All, d1GetSetting, d1SetSetting, generateSecret, listKvKeys } from "../lib/core.js";

const COMMUNITY_RESOURCE_PREFIX = "__agapay_learn_community_resource:";
const ALLOWED_STATUSES = new Set(["pending", "approved", "hidden", "removed"]);

function key(id) {
  return `${COMMUNITY_RESOURCE_PREFIX}${id}`;
}

function parse(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clean(value, limit = 240) {
  return String(value || "").trim().slice(0, limit);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function save(env, record) {
  const raw = JSON.stringify(record);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(key(record.id), raw);
  if (d1(env)) await d1SetSetting(env, key(record.id), raw);
  return record;
}

export async function getLearnCommunityResource(env, id) {
  const resourceId = clean(id, 100);
  if (!resourceId) return null;
  if (d1(env)) {
    const stored = parse(await d1GetSetting(env, key(resourceId)));
    if (stored) return stored;
  }
  return env.AGAPAY_REGISTRATIONS ? parse(await env.AGAPAY_REGISTRATIONS.get(key(resourceId))) : null;
}

export async function listLearnCommunityResources(env, { includeAll = false } = {}) {
  const records = new Map();
  if (d1(env)) {
    const rows = await d1All(env, "SELECT value FROM app_settings WHERE key LIKE ?1 ORDER BY updated_at DESC LIMIT 1000", `${COMMUNITY_RESOURCE_PREFIX}%`);
    rows.map((row) => parse(row.value)).filter(Boolean).forEach((record) => records.set(record.id, record));
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: COMMUNITY_RESOURCE_PREFIX, limit: 1000 });
    const values = await Promise.all(keys.map((item) => env.AGAPAY_REGISTRATIONS.get(item.name)));
    values.map(parse).filter(Boolean).forEach((record) => {
      if (!records.has(record.id)) records.set(record.id, record);
    });
  }
  return [...records.values()]
    .filter((record) => includeAll || record.status === "approved")
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
}

export async function submitLearnCommunityResource(env, identity, body = {}) {
  const title = clean(body.title, 120);
  const url = safeUrl(body.url);
  const description = clean(body.description, 600);
  if (!title || !url || !description) return { ok: false, status: 400, error: "Title, link, and description are required." };
  const now = new Date().toISOString();
  const record = {
    id: generateSecret("learn_resource"),
    source: "community",
    title,
    url,
    description,
    subtitle: description,
    category: clean(body.category, 60) || "General",
    resourceType: clean(body.resourceType, 60) || "Website",
    mediaType: clean(body.mediaType, 60) || "Mixed Media",
    ageRange: clean(body.ageRange, 40) || "Family",
    tags: Array.isArray(body.tags) ? body.tags.map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 10) : clean(body.tags, 240).split(",").map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 10),
    submittedBy: identity.email,
    householdId: identity.householdId,
    status: "pending",
    flags: [],
    createdAt: now,
    updatedAt: now
  };
  await save(env, record);
  return { ok: true, resource: record };
}

export async function createCuratedLearnCommunityResource(env, adminContext, body = {}) {
  const title = clean(body.title, 120);
  const url = safeUrl(body.url);
  const description = clean(body.description, 600);
  if (!title || !url || !description) return { ok: false, status: 400, error: "Title, link, and description are required." };
  const now = new Date().toISOString();
  const record = {
    id: generateSecret("learn_resource"),
    source: "agapay-curated",
    title,
    url,
    description,
    subtitle: description,
    category: clean(body.category, 60) || "General",
    resourceType: clean(body.resourceType, 60) || "Website",
    mediaType: clean(body.mediaType, 60) || "Mixed Media",
    ageRange: clean(body.ageRange, 40) || "Family",
    tags: Array.isArray(body.tags) ? body.tags.map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 10) : clean(body.tags, 240).split(",").map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 10),
    sharedBy: "AGAPAY",
    submittedBy: adminContext.actor || "AGAPAY Admin",
    householdId: "",
    status: "approved",
    vetted: true,
    pinned: Boolean(body.pinned),
    flags: [],
    createdAt: now,
    updatedAt: now,
    curatedBy: adminContext.actor || "AGAPAY Admin",
    curatedAt: now
  };
  await save(env, record);
  return { ok: true, resource: record };
}

export async function flagLearnCommunityResource(env, identity, id, reason = "") {
  const record = await getLearnCommunityResource(env, id);
  if (!record || record.status !== "approved") return { ok: false, status: 404, error: "Community resource not found." };
  const flags = Array.isArray(record.flags) ? record.flags : [];
  if (!flags.some((flag) => flag.email === identity.email)) {
    flags.push({ email: identity.email, reason: clean(reason, 300) || "Inappropriate or inconsistent with Orthodox Christian standards.", createdAt: new Date().toISOString() });
  }
  const updated = { ...record, flags, updatedAt: new Date().toISOString() };
  await save(env, updated);
  return { ok: true, resource: updated };
}

export async function moderateLearnCommunityResource(env, adminContext, id, body = {}) {
  const record = await getLearnCommunityResource(env, id);
  if (!record) return { ok: false, status: 404, error: "Community resource not found." };
  const status = clean(body.status, 20).toLowerCase();
  if (!ALLOWED_STATUSES.has(status)) return { ok: false, status: 400, error: "Moderation status was invalid." };
  const updated = {
    ...record,
    status,
    moderationNote: clean(body.note, 500),
    moderatedBy: adminContext.actor || "Admin",
    moderatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await save(env, updated);
  return { ok: true, resource: updated };
}
