import { normalizeEmail } from './normalize-email.js';
import { donorKey } from './storage-keys.js';
import { d1, d1Run } from './storage.js';
import { storedField, storedObject } from './stored-values.js';
import * as core from './core.js';
import type { StorageEnvironment } from './storage.js';
export interface DonorRecord {
  [field: string]: unknown;
}
// Parsing remains lossless; authentication must narrow opaque saved values before use.
export const loadDonor: (env: StorageEnvironment, email: unknown) => Promise<unknown> = core.loadDonor;
export { deleteDonor } from './core.js';

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
