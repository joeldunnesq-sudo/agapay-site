// Generated from src/lib/donor-repository.ts by npm run build:server. Do not edit.
import { normalizeEmail } from './normalize-email.js';
import { donorKey } from './storage-keys.js';
import { d1, d1Run } from './storage.js';
import { storedField, storedObject } from './stored-values.js';
import * as core from './core.js';
const loadDonor = core.loadDonor;
import { deleteDonor } from './core.js';
async function saveDonor(env, donor) {
  if (donor === null || donor === void 0) throw new TypeError('Cannot read properties of null or undefined');
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
      storedField(record, 'updatedAt') || /* @__PURE__ */ new Date().toISOString(),
      data
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(donorKey(email), data);
  }
  return donor;
}
export { deleteDonor, loadDonor, saveDonor };
