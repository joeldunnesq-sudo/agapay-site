import type { PasswordRecord, DashboardRegistration, DonorRecord } from './core-composition-contracts.js';

import './database-reads.js';

import './http-responses.js';

import './kv-reads.js';

import './normalize-email.js';

import './kv-reads.js';

import './json-rows.js';
import { PASSWORD_HASH_VERSION, PASSWORD_HASH_ITERATIONS } from './core-shared.js';
import { pbkdf2Hex } from './core.js';
import { toHex } from './core-shared.js';
import './core-sessions.js';

export function secureCompare(a: string, b: string) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function sha256Hex(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return toHex(digest);
}

export function randomHex(byteLength: number = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPasswordRecord(password: string): Promise<PasswordRecord> {
  const salt = randomHex(16);
  return {
    version: PASSWORD_HASH_VERSION,
    iterations: PASSWORD_HASH_ITERATIONS,
    salt,
    hash: await pbkdf2Hex(password, salt, PASSWORD_HASH_ITERATIONS),
  };
}

export function parsePasswordRecord(value: unknown): Partial<PasswordRecord> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Partial<PasswordRecord>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function verifyPasswordRecord(password: string, record: unknown) {
  const parsed = parsePasswordRecord(record);
  if (!parsed || parsed.version !== PASSWORD_HASH_VERSION || !parsed.salt || !parsed.hash) return false;
  const submitted = await pbkdf2Hex(password, parsed.salt, Number(parsed.iterations || PASSWORD_HASH_ITERATIONS));
  return secureCompare(submitted, parsed.hash);
}

export async function hashPassword(password: string, salt: string) {
  return sha256Hex(`${salt}:${password}`);
}

export async function hashSessionToken(token: string, salt: string) {
  return sha256Hex(`session:${salt}:${token}`);
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

export async function applyParishDashboardPassword(
  registration: DashboardRegistration,
  password: string,
  { temporary = false, keepLegacyToken = false }: { temporary?: boolean; keepLegacyToken?: boolean } = {}
) {
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
