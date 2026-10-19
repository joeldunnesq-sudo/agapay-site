import { normalizeEmail } from './format.js';
import { donorKey } from './storage-keys.js';
import { d1, d1First, d1Run, parseJsonRow, type StorageEnvironment } from './storage.js';
import { storedField, storedObject } from './stored-values.js';

export interface DonorRecord {
  [field: string]: unknown;
}

export async function loadDonor(env: StorageEnvironment, email: unknown): Promise<unknown> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (d1(env)) {
    const row = await d1First<{ data: unknown }>(env, 'SELECT data FROM donors WHERE email = ?1', normalized);
    const donor = parseJsonRow(row);
    if (donor) return donor;
  }
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(donorKey(normalized));
  if (!raw) return null;
  const donor: unknown = JSON.parse(raw);
  if (d1(env)) await saveDonor(env, donor);
  return donor;
}

export async function saveDonor<TDonor>(env: StorageEnvironment, donor: TDonor): Promise<TDonor> {
  // The old implementation accessed donor.email before spreading the value.
  if (donor === null || donor === undefined) throw new TypeError('Cannot read properties of null or undefined');
  const email = normalizeEmail(storedField(donor, 'email'));
  const record = { ...storedObject(donor), email };
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
      storedField(record, 'defaultParishId') || '',
      storedField(record, 'emailVerifiedAt') || '',
      storedField(record, 'createdAt') || '',
      storedField(record, 'updatedAt') || new Date().toISOString(),
      data
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(donorKey(email), data);
  }
  return donor;
}

export async function deleteDonor(env: StorageEnvironment, email: unknown): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (d1(env)) await d1Run(env, 'DELETE FROM donors WHERE email = ?1', normalized);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.delete(donorKey(normalized));
}
