import { generateSecret, hashSessionToken, secureCompare } from './session-crypto.js';
import { getBearerToken } from './api-responses.js';
import { normalizeEmail } from './format.js';
import { loadDonor, saveDonor, type DonorRecord } from './donor-repository.js';
import { hasProductionStore } from './storage-policy.js';
import type { StorageEnvironment } from './storage.js';
import { storedDateMilliseconds } from './stored-values.js';

export const DONOR_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export async function issueDonorSession<TDonor extends DonorRecord>(env: StorageEnvironment, donor: TDonor) {
  const token = generateSecret('agp_donor');
  const sessionSalt = generateSecret('session');
  const updated = {
    ...donor,
    sessionSalt,
    sessionTokenHash: await hashSessionToken(token, sessionSalt),
    sessionExpiresAt: new Date(Date.now() + DONOR_SESSION_TTL_MS).toISOString(),
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveDonor(env, updated);
  return { token, donor: updated };
}

export async function resolveDonorSession(donor: unknown, token: string): Promise<DonorRecord | null> {
  if (!token || !isDonorRecord(donor)) return null;
  if (!donor.emailVerifiedAt || !donor.sessionTokenHash || !donor.sessionSalt) return null;
  // Preserve Donor's strict '<' cutoff and native invalid-date behavior.
  if (donor.sessionExpiresAt && storedDateMilliseconds(donor.sessionExpiresAt) < Date.now()) return null;
  const submitted = await hashSessionToken(token, donor.sessionSalt);
  if (!secureCompare(submitted, donor.sessionTokenHash)) return null;
  return donor;
}

function isDonorRecord(value: unknown): value is DonorRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function requireDonor(request: Request, env: StorageEnvironment): Promise<DonorRecord | null> {
  if (!hasProductionStore(env)) return null;
  const email = normalizeEmail(request.headers.get('X-AGAPAY-Donor-Email'));
  const token = getBearerToken(request);
  if (!email || !token) return null;
  return resolveDonorSession(await loadDonor(env, email), token);
}
