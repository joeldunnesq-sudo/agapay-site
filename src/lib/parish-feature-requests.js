// Generated from src/lib/parish-feature-requests.ts by npm run build:server. Do not edit.
import { d1, d1All, d1First, d1GetSetting, d1Run, d1SetSetting, sha256Hex } from './core.js';
const FEATURE_REQUEST_PREFIX = 'parish-feature-requests:';
function featureRequestKey(parishId) {
  return `${FEATURE_REQUEST_PREFIX}${String(parishId || '')
    .trim()
    .toLowerCase()}`;
}
function isFeatureRequestRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isFeatureRequestEntry(value) {
  if (!isFeatureRequestRecord(value)) return false;
  for (const field of ['firstRequestedAt', 'lastRequestedAt', 'dismissedAt']) {
    if (value[field] !== void 0 && value[field] !== null && typeof value[field] !== 'string') return false;
  }
  if (value.count !== void 0 && value.count !== null) {
    if (typeof value.count !== 'number' && typeof value.count !== 'string') return false;
    if (!Number.isFinite(Number(value.count))) return false;
  }
  return (
    value.requestors === void 0 ||
    value.requestors === null ||
    (Array.isArray(value.requestors) && value.requestors.every((requestor) => typeof requestor === 'string'))
  );
}
async function readFeatureRequestStore(env, parishId, forWrite = false) {
  const key = featureRequestKey(parishId);
  const raw = d1(env) ? await d1GetSetting(env, key) : await env.AGAPAY_REGISTRATIONS?.get(key);
  if (raw === null || raw === void 0) return { version: 1, features: {} };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const record = isFeatureRequestRecord(parsed) ? parsed : null;
  const features = record?.features === void 0 ? {} : record.features;
  const validContainer = record !== null && isFeatureRequestRecord(features);
  const entries = isFeatureRequestRecord(features) ? Object.entries(features) : [];
  const validEntries = entries.filter((entry) => isFeatureRequestEntry(entry[1]));
  if (forWrite && (!validContainer || validEntries.length !== entries.length)) {
    throw new Error('Feature request data requires review before updating');
  }
  return { ...record, version: 1, features: Object.fromEntries(validEntries) };
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
    firstRequestedAt: entry.firstRequestedAt || '',
    lastRequestedAt: entry.lastRequestedAt || '',
  };
}
async function recordParishFeatureRequest(env, { parishId, featureId, donorEmail }) {
  const donorHash = await sha256Hex(
    String(donorEmail || '')
      .trim()
      .toLowerCase()
  );
  const now = /* @__PURE__ */ new Date().toISOString();
  if (d1(env)) {
    const result = await d1Run(
      env,
      `INSERT OR IGNORE INTO parish_feature_requests
         (parish_id, feature_id, donor_hash, created_at)
       VALUES (?, ?, ?, ?)`,
      parishId,
      featureId,
      donorHash,
      now
    );
    const duplicate2 = Number(result?.meta?.changes || 0) === 0;
    if (!duplicate2) {
      await d1Run(
        env,
        'DELETE FROM parish_feature_request_dismissals WHERE parish_id = ? AND feature_id = ?',
        parishId,
        featureId
      );
    }
    const aggregate = await d1First(
      env,
      `SELECT COUNT(*) AS count, MIN(created_at) AS first_requested_at, MAX(created_at) AS last_requested_at
       FROM parish_feature_requests WHERE parish_id = ? AND feature_id = ?`,
      parishId,
      featureId
    );
    return {
      duplicate: duplicate2,
      request: publicFeatureRequest(featureId, {
        count: aggregate?.count,
        firstRequestedAt: aggregate?.first_requested_at,
        lastRequestedAt: aggregate?.last_requested_at,
      }),
    };
  }
  const store = await readFeatureRequestStore(env, parishId, true);
  const current = Object.hasOwn(store.features, featureId) ? store.features[featureId] : {};
  const requestors = Array.isArray(current.requestors) ? current.requestors : [];
  const duplicate = requestors.includes(donorHash);
  if (!duplicate) {
    Object.defineProperty(store.features, featureId, {
      enumerable: true,
      configurable: true,
      writable: true,
      value: {
        ...current,
        count: Math.max(0, Number(current.count || 0)) + 1,
        requestors: [...requestors, donorHash].slice(-500),
        firstRequestedAt: current.firstRequestedAt || now,
        lastRequestedAt: now,
        dismissedAt: '',
      },
    });
    await writeFeatureRequestStore(env, parishId, store);
  }
  return {
    duplicate,
    request: publicFeatureRequest(
      featureId,
      Object.hasOwn(store.features, featureId) ? store.features[featureId] : current
    ),
  };
}
async function loadPendingParishFeatureRequests(env, parishId) {
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
    return rows.map((row) =>
      publicFeatureRequest(row.feature_id, {
        count: row.count,
        firstRequestedAt: row.first_requested_at,
        lastRequestedAt: row.last_requested_at,
      })
    );
  }
  const store = await readFeatureRequestStore(env, parishId);
  return Object.entries(store.features)
    .filter(([, entry]) => Number(entry?.count || 0) > 0 && !entry?.dismissedAt)
    .map(([featureId, entry]) => publicFeatureRequest(featureId, entry));
}
async function dismissParishFeatureRequest(env, parishId, featureId) {
  if (d1(env)) {
    const existing = await d1First(
      env,
      'SELECT 1 AS found FROM parish_feature_requests WHERE parish_id = ? AND feature_id = ? LIMIT 1',
      parishId,
      featureId
    );
    if (!existing) return false;
    await d1Run(
      env,
      `INSERT INTO parish_feature_request_dismissals (parish_id, feature_id, dismissed_at)
       VALUES (?, ?, ?)
       ON CONFLICT(parish_id, feature_id) DO UPDATE SET dismissed_at = excluded.dismissed_at`,
      parishId,
      featureId,
      /* @__PURE__ */ new Date().toISOString()
    );
    return true;
  }
  const store = await readFeatureRequestStore(env, parishId, true);
  const current = Object.hasOwn(store.features, featureId) ? store.features[featureId] : void 0;
  if (!current) return false;
  store.features[featureId] = { ...current, dismissedAt: /* @__PURE__ */ new Date().toISOString() };
  await writeFeatureRequestStore(env, parishId, store);
  return true;
}
export { dismissParishFeatureRequest, loadPendingParishFeatureRequests, recordParishFeatureRequest };
