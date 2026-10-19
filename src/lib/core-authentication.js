// Generated from src/lib/core-authentication.ts by npm run build:server. Do not edit.
import { secureCompare, sha256Hex } from './session-crypto.js';
import { createPasswordRecord, verifyPasswordRecord } from './password-records.js';
import {
  secureCompare as secureCompare2,
  sha256Hex as sha256Hex2,
  randomHex,
  hashSessionToken,
} from './session-crypto.js';
import {
  createPasswordRecord as createPasswordRecord2,
  parsePasswordRecord,
  verifyPasswordRecord as verifyPasswordRecord2,
} from './password-records.js';
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
async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
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
  createPasswordRecord2 as createPasswordRecord,
  hashPassword,
  hashSessionToken,
  parsePasswordRecord,
  randomHex,
  secureCompare2 as secureCompare,
  sha256Hex2 as sha256Hex,
  verifyDonorPassword,
  verifyParishDashboardPassword,
  verifyPasswordRecord2 as verifyPasswordRecord,
};
