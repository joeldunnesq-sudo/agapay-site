// Generated from src/lib/core-authentication.ts by npm run build:server. Do not edit.
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
function secureCompare(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return toHex(digest);
}
function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function createPasswordRecord(password) {
  const salt = randomHex(16);
  return {
    version: PASSWORD_HASH_VERSION,
    iterations: PASSWORD_HASH_ITERATIONS,
    salt,
    hash: await pbkdf2Hex(password, salt, PASSWORD_HASH_ITERATIONS),
  };
}
function parsePasswordRecord(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
async function verifyPasswordRecord(password, record) {
  const parsed = parsePasswordRecord(record);
  if (!parsed || parsed.version !== PASSWORD_HASH_VERSION || !parsed.salt || !parsed.hash) return false;
  const submitted = await pbkdf2Hex(password, parsed.salt, Number(parsed.iterations || PASSWORD_HASH_ITERATIONS));
  return secureCompare(submitted, parsed.hash);
}
async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}
async function hashSessionToken(token, salt) {
  return sha256Hex(`session:${salt}:${token}`);
}
async function verifyDonorPassword(donor, password) {
  if (donor?.passwordRecord && (await verifyPasswordRecord(password, donor.passwordRecord))) return true;
  if (!donor?.passwordHash) return false;
  const submittedHash = await hashPassword(password, donor.passwordSalt || '');
  return secureCompare(submittedHash, donor.passwordHash || '');
}
async function applyDonorPassword(donor, password) {
  return {
    ...donor,
    passwordRecord: await createPasswordRecord(password),
    passwordSalt: '',
    passwordHash: '',
    passwordUpdatedAt: /* @__PURE__ */ new Date().toISOString(),
  };
}
async function verifyParishDashboardPassword(registration, password) {
  if (!registration || !password) return false;
  if (
    registration.parishDashboardPasswordRecord &&
    (await verifyPasswordRecord(password, registration.parishDashboardPasswordRecord))
  )
    return true;
  return Boolean(registration.parishDashboardToken && secureCompare(password, registration.parishDashboardToken));
}
async function applyParishDashboardPassword(
  registration,
  password,
  { temporary = false, keepLegacyToken = false } = {}
) {
  if (!password) return registration;
  return {
    ...registration,
    parishDashboardPasswordRecord: await createPasswordRecord(password),
    parishDashboardToken: keepLegacyToken ? password : '',
    parishDashboardTokenTemporary: Boolean(temporary),
    parishDashboardTokenCreatedAt:
      registration.parishDashboardTokenCreatedAt || /* @__PURE__ */ new Date().toISOString(),
    parishDashboardTokenUpdatedAt: /* @__PURE__ */ new Date().toISOString(),
  };
}
export {
  applyDonorPassword,
  applyParishDashboardPassword,
  createPasswordRecord,
  hashPassword,
  hashSessionToken,
  parsePasswordRecord,
  randomHex,
  secureCompare,
  sha256Hex,
  verifyDonorPassword,
  verifyParishDashboardPassword,
  verifyPasswordRecord,
};
