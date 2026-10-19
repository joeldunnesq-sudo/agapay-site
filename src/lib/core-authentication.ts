import { secureCompare, sha256Hex } from './session-crypto.js';
import { createPasswordRecord, verifyPasswordRecord } from './password-records.js';
export { secureCompare, sha256Hex, randomHex, hashSessionToken } from './session-crypto.js';
export { createPasswordRecord, parsePasswordRecord, verifyPasswordRecord } from './password-records.js';
import type { DashboardRegistration, DonorRecord } from './core-composition-contracts.js';

import './database-reads.js';

import './http-responses.js';

import './kv-reads.js';

import './normalize-email.js';

import './kv-reads.js';

import './json-rows.js';
import './core-shared.js';
import './core.js';
import './core-shared.js';
import './core-sessions.js';

export async function hashPassword(password: string, salt: string) {
  return sha256Hex(`${salt}:${password}`);
}

export async function verifyDonorPassword(donor: DonorRecord, password: string) {
  if (donor?.passwordRecord && (await verifyPasswordRecord(password, donor.passwordRecord))) return true;
  if (!donor?.passwordHash) return false;
  const submittedHash = await hashPassword(password, donor.passwordSalt || '');
  return secureCompare(submittedHash, donor.passwordHash || '');
}

export async function applyDonorPassword(donor: DonorRecord, password: string) {
  return {
    ...donor,
    passwordRecord: await createPasswordRecord(password),
    passwordSalt: '',
    passwordHash: '',
    passwordUpdatedAt: new Date().toISOString(),
  };
}

export async function verifyParishDashboardPassword(registration: DashboardRegistration, password: string) {
  if (!registration || !password) return false;
  if (
    registration.parishDashboardPasswordRecord &&
    (await verifyPasswordRecord(password, registration.parishDashboardPasswordRecord))
  )
    return true;
  return Boolean(registration.parishDashboardToken && secureCompare(password, registration.parishDashboardToken));
}

export async function applyParishDashboardPassword<T extends DashboardRegistration>(
  registration: T,
  password: string,
  { temporary = false, keepLegacyToken = false }: { temporary?: boolean; keepLegacyToken?: boolean } = {}
): Promise<T & { parishDashboardTokenUpdatedAt?: string }> {
  if (!password) return registration;
  return {
    ...registration,
    parishDashboardPasswordRecord: await createPasswordRecord(password),
    parishDashboardToken: keepLegacyToken ? password : '',
    parishDashboardTokenTemporary: Boolean(temporary),
    parishDashboardTokenCreatedAt: registration.parishDashboardTokenCreatedAt || new Date().toISOString(),
    parishDashboardTokenUpdatedAt: new Date().toISOString(),
  };
}
