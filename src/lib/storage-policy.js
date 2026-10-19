// Generated from src/lib/storage-policy.ts by npm run build:server. Do not edit.
import { json } from './api-responses.js';
import { d1First, d1Run } from './storage.js';
function hasProductionStore(env) {
  return Boolean(env.AGAPAY_DB || env.AGAPAY_REGISTRATIONS);
}
function missingProductionStoreResponse() {
  return json({ error: 'AGAPAY production data store is not configured' }, { status: 500 });
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
export { d1GetSetting, d1SetSetting, hasProductionStore, missingProductionStoreResponse };
