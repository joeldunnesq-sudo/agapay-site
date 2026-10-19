import { json } from './api-responses.js';
import { d1First, d1Run, type StorageEnvironment } from './storage.js';

export function hasProductionStore(env: StorageEnvironment): boolean {
  return Boolean(env.AGAPAY_DB || env.AGAPAY_REGISTRATIONS);
}

export function missingProductionStoreResponse(): Response {
  return json({ error: 'AGAPAY production data store is not configured' }, { status: 500 });
}

export async function d1GetSetting(env: StorageEnvironment, key: string): Promise<unknown> {
  const row = await d1First<{ value: unknown }>(env, 'SELECT value FROM app_settings WHERE key = ?1', key);
  return row?.value || '';
}

export async function d1SetSetting(env: StorageEnvironment, key: string, value: unknown): Promise<void> {
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
