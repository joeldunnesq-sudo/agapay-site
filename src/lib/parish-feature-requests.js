import { d1, d1All, d1First, d1GetSetting, d1Run, d1SetSetting, sha256Hex } from "./core.js";

const FEATURE_REQUEST_PREFIX = "parish-feature-requests:";

function featureRequestKey(parishId) {
  return `${FEATURE_REQUEST_PREFIX}${String(parishId || "").trim().toLowerCase()}`;
}

async function readFeatureRequestStore(env, parishId) {
  const key = featureRequestKey(parishId);
  const raw = d1(env)
    ? await d1GetSetting(env, key)
    : await env.AGAPAY_REGISTRATIONS?.get(key);
  if (!raw) return { version: 1, features: {} };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? { version: 1, features: parsed.features && typeof parsed.features === "object" ? parsed.features : {} }
      : { version: 1, features: {} };
  } catch {
    return { version: 1, features: {} };
  }
}

async function writeFeatureRequestStore(env, parishId, store) {
  const key = featureRequestKey(parishId);
  const value = JSON.stringify(store);
  if (d1(env)) return d1SetSetting(env, key, value);
  return env.AGAPAY_REGISTRATIONS.put(key, value);
}

function publicFeatureRequest(featureId, entry = {}) {
  return {
    featureId,
    count: Math.max(0, Number(entry.count || 0)),
    firstRequestedAt: entry.firstRequestedAt || "",
    lastRequestedAt: entry.lastRequestedAt || ""
  };
}

export async function recordParishFeatureRequest(env, { parishId, featureId, donorEmail }) {
  const donorHash = await sha256Hex(String(donorEmail || "").trim().toLowerCase());
  const now = new Date().toISOString();

  if (d1(env)) {
    const result = await d1Run(
      env,
      `INSERT OR IGNORE INTO parish_feature_requests
         (parish_id, feature_id, donor_hash, created_at)
       VALUES (?, ?, ?, ?)`,
      parishId, featureId, donorHash, now
    );
    const duplicate = Number(result?.meta?.changes || 0) === 0;
    if (!duplicate) {
      await d1Run(
        env,
        "DELETE FROM parish_feature_request_dismissals WHERE parish_id = ? AND feature_id = ?",
        parishId, featureId
      );
    }
    const aggregate = await d1First(
      env,
      `SELECT COUNT(*) AS count, MIN(created_at) AS first_requested_at, MAX(created_at) AS last_requested_at
       FROM parish_feature_requests WHERE parish_id = ? AND feature_id = ?`,
      parishId, featureId
    );
    return {
      duplicate,
      request: publicFeatureRequest(featureId, {
        count: aggregate?.count,
        firstRequestedAt: aggregate?.first_requested_at,
        lastRequestedAt: aggregate?.last_requested_at
      })
    };
  }

  const store = await readFeatureRequestStore(env, parishId);
  const current = store.features[featureId] || {};
  const requestors = Array.isArray(current.requestors) ? current.requestors : [];
  const duplicate = requestors.includes(donorHash);

  if (!duplicate) {
    store.features[featureId] = {
      ...current,
      count: Math.max(0, Number(current.count || 0)) + 1,
      requestors: [...requestors, donorHash].slice(-500),
      firstRequestedAt: current.firstRequestedAt || now,
      lastRequestedAt: now,
      dismissedAt: ""
    };
    await writeFeatureRequestStore(env, parishId, store);
  }

  return {
    duplicate,
    request: publicFeatureRequest(featureId, store.features[featureId] || current)
  };
}

export async function loadPendingParishFeatureRequests(env, parishId) {
  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT r.feature_id, COUNT(*) AS count,
              MIN(r.created_at) AS first_requested_at,
              MAX(r.created_at) AS last_requested_at
       FROM parish_feature_requests r
       LEFT JOIN parish_feature_request_dismissals d
         ON d.parish_id = r.parish_id AND d.feature_id = r.feature_id
       WHERE r.parish_id = ? AND d.dismissed_at IS NULL
       GROUP BY r.feature_id`,
      parishId
    );
    return rows.map((row) => publicFeatureRequest(row.feature_id, {
      count: row.count,
      firstRequestedAt: row.first_requested_at,
      lastRequestedAt: row.last_requested_at
    }));
  }
  const store = await readFeatureRequestStore(env, parishId);
  return Object.entries(store.features)
    .filter(([, entry]) => Number(entry?.count || 0) > 0 && !entry?.dismissedAt)
    .map(([featureId, entry]) => publicFeatureRequest(featureId, entry));
}

export async function dismissParishFeatureRequest(env, parishId, featureId) {
  if (d1(env)) {
    const existing = await d1First(
      env,
      "SELECT 1 AS found FROM parish_feature_requests WHERE parish_id = ? AND feature_id = ? LIMIT 1",
      parishId, featureId
    );
    if (!existing) return false;
    await d1Run(
      env,
      `INSERT INTO parish_feature_request_dismissals (parish_id, feature_id, dismissed_at)
       VALUES (?, ?, ?)
       ON CONFLICT(parish_id, feature_id) DO UPDATE SET dismissed_at = excluded.dismissed_at`,
      parishId, featureId, new Date().toISOString()
    );
    return true;
  }
  const store = await readFeatureRequestStore(env, parishId);
  const current = store.features[featureId];
  if (!current) return false;
  store.features[featureId] = { ...current, dismissedAt: new Date().toISOString() };
  await writeFeatureRequestStore(env, parishId, store);
  return true;
}
