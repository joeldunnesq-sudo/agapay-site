// Generated from src/lib/donor-sessions.ts by npm run build:server. Do not edit.
import { requireDonor as legacyRequireDonor } from '../handlers/parish-authentication.js';
import { generateSecret, hashSessionToken, secureCompare } from './session-crypto.js';
import './api-responses.js';
import './normalize-email.js';
import { saveDonor } from './donor-repository.js';
import './storage-policy.js';
import { storedDateMilliseconds } from './stored-values.js';
const DONOR_SESSION_TTL_MS = 1e3 * 60 * 60 * 24 * 14;
async function issueDonorSession(env, donor) {
  const token = generateSecret('agp_donor');
  const sessionSalt = generateSecret('session');
  const updated = {
    ...donor,
    sessionSalt,
    sessionTokenHash: await hashSessionToken(token, sessionSalt),
    sessionExpiresAt: new Date(Date.now() + DONOR_SESSION_TTL_MS).toISOString(),
    lastLoginAt: /* @__PURE__ */ new Date().toISOString(),
    updatedAt: /* @__PURE__ */ new Date().toISOString(),
  };
  await saveDonor(env, updated);
  return { token, donor: updated };
}
async function resolveDonorSession(donor, token) {
  if (!token || !isDonorRecord(donor)) return null;
  if (!donor.emailVerifiedAt || !donor.sessionTokenHash || !donor.sessionSalt) return null;
  if (donor.sessionExpiresAt && storedDateMilliseconds(donor.sessionExpiresAt) < Date.now()) return null;
  const submitted = await hashSessionToken(token, donor.sessionSalt);
  if (!secureCompare(submitted, donor.sessionTokenHash)) return null;
  return donor;
}
function isDonorRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const requireDonor = legacyRequireDonor;
export { DONOR_SESSION_TTL_MS, issueDonorSession, requireDonor, resolveDonorSession };
