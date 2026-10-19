// Generated from src/lib/identity.ts by npm run build:server. Do not edit.
import { d1, d1First, d1Run } from './storage.js';
import { generateSecret, hashSessionToken, secureCompare } from './session-crypto.js';
import { normalizeEmail } from './format.js';
import { createPasswordRecord, verifyPasswordRecord } from './password-records.js';
import { getBearerToken } from './api-responses.js';
import { loadDonor } from './donor-repository.js';
import { privilegedMfaRequired } from './authentication-policy.js';
import { storedField } from './stored-values.js';
import { resolveDonorSession } from './donor-sessions.js';
const PLATFORM_SESSION_TTL_MS = 1e3 * 60 * 60 * 12;
const PLATFORM_USER_EMAIL_HEADER = 'X-AGAPAY-User-Email';
const DONOR_EMAIL_HEADER = 'X-AGAPAY-Donor-Email';
function nowIso() {
  return /* @__PURE__ */ new Date().toISOString();
}
function rowToPlatformUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || '',
    emailVerifiedAt: row.email_verified_at || '',
    status: row.status || 'active',
    hasPassword: Boolean(row.password_record),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
async function findPlatformUserByEmail(env, email) {
  if (!d1(env)) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return d1First(env, 'SELECT * FROM platform_users WHERE email = ?1', normalized);
}
async function findPlatformUserById(env, userId) {
  if (!d1(env) || !userId) return null;
  return d1First(env, 'SELECT * FROM platform_users WHERE id = ?1', userId);
}
async function ensurePlatformUser(env, { email, displayName = '' } = {}) {
  if (!d1(env)) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const existing = await findPlatformUserByEmail(env, normalized);
  if (existing) return existing;
  const id = generateSecret('user');
  const timestamp = nowIso();
  await d1Run(
    env,
    `INSERT INTO platform_users (id, email, display_name, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'active', ?4, ?4)`,
    id,
    normalized,
    String(displayName || '')
      .trim()
      .slice(0, 200),
    timestamp
  );
  return findPlatformUserById(env, id);
}
async function setPlatformUserPassword(env, userId, password) {
  if (!d1(env) || !userId || !password) return false;
  const record = JSON.stringify(await createPasswordRecord(password));
  const timestamp = nowIso();
  await d1Run(
    env,
    `UPDATE platform_users
     SET password_record = ?2, email_verified_at = COALESCE(email_verified_at, ?3), updated_at = ?3
     WHERE id = ?1`,
    userId,
    record,
    timestamp
  );
  return true;
}
async function verifyPlatformUserPassword(env, email, password) {
  const row = await findPlatformUserByEmail(env, email);
  if (!row || !row.password_record || row.status !== 'active') return null;
  const ok = await verifyPasswordRecord(password, row.password_record);
  return ok ? row : null;
}
async function issuePlatformUserSession(env, userId, { mfaVerifiedAt = '' } = {}) {
  if (!d1(env) || !userId) return null;
  const token = generateSecret('agp_user');
  const salt = generateSecret('user_salt');
  const tokenHash = await hashSessionToken(token, salt);
  const expiresAt = new Date(Date.now() + PLATFORM_SESSION_TTL_MS).toISOString();
  try {
    await d1Run(
      env,
      `UPDATE platform_users
       SET session_token_hash = ?2, session_salt = ?3, session_expires_at = ?4,
           session_mfa_verified_at = ?5, updated_at = ?6
       WHERE id = ?1`,
      userId,
      tokenHash,
      salt,
      expiresAt,
      mfaVerifiedAt || null,
      nowIso()
    );
  } catch (error) {
    if (
      privilegedMfaRequired(env) ||
      !String(storedField(error, 'message') || error).includes('session_mfa_verified_at')
    )
      throw error;
    await d1Run(
      env,
      `UPDATE platform_users
       SET session_token_hash = ?2, session_salt = ?3, session_expires_at = ?4, updated_at = ?5
       WHERE id = ?1`,
      userId,
      tokenHash,
      salt,
      expiresAt,
      nowIso()
    );
  }
  return { token, expiresAt, mfaVerifiedAt: mfaVerifiedAt || '' };
}
async function markPlatformUserSessionMfaVerified(env, userId, verifiedAt = nowIso()) {
  const db = d1(env);
  if (!db || !userId) return false;
  const result = await db
    .prepare(
      `UPDATE platform_users SET session_mfa_verified_at = ?2, updated_at = ?2
     WHERE id = ?1 AND session_token_hash IS NOT NULL`
    )
    .bind(userId, verifiedAt)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}
async function revokePlatformUserSession(env, userId) {
  if (!d1(env) || !userId) return;
  try {
    await d1Run(
      env,
      `UPDATE platform_users
       SET session_token_hash = NULL, session_salt = NULL, session_expires_at = NULL,
           session_mfa_verified_at = NULL, updated_at = ?2
       WHERE id = ?1`,
      userId,
      nowIso()
    );
  } catch (error) {
    if (!String(storedField(error, 'message') || error).includes('session_mfa_verified_at')) throw error;
    await d1Run(
      env,
      `UPDATE platform_users
       SET session_token_hash = NULL, session_salt = NULL, session_expires_at = NULL, updated_at = ?2
       WHERE id = ?1`,
      userId,
      nowIso()
    );
  }
}
async function requirePlatformUser(request, env) {
  if (!d1(env)) return null;
  const email = normalizeEmail(request.headers.get(PLATFORM_USER_EMAIL_HEADER));
  const token = getBearerToken(request);
  if (!token) return null;
  if (email) {
    const row2 = await findPlatformUserByEmail(env, email);
    if (
      row2?.status === 'active' &&
      row2.session_token_hash &&
      row2.session_salt &&
      (!row2.session_expires_at || new Date(row2.session_expires_at).getTime() >= Date.now())
    ) {
      const submittedHash = await hashSessionToken(token, row2.session_salt);
      if (secureCompare(submittedHash, row2.session_token_hash)) {
        if (privilegedMfaRequired(env) && !row2.session_mfa_verified_at) return null;
        return { ...rowToPlatformUser(row2), mfaVerifiedAt: row2.session_mfa_verified_at || '' };
      }
    }
  }
  const donorEmail = normalizeEmail(request.headers.get(DONOR_EMAIL_HEADER));
  if (!donorEmail) return null;
  const donor = await resolveDonorSession(await loadDonor(env, donorEmail), token);
  if (!donor) return null;
  const row =
    (await findPlatformUserByEmail(env, donorEmail)) ||
    (await ensurePlatformUser(env, {
      email: donorEmail,
      displayName: donor.donorName || donor.householdName || '',
    }));
  if (!row || row.status !== 'active') return null;
  return rowToPlatformUser(row);
}
function publicPlatformUser(row) {
  return rowToPlatformUser(row);
}
export {
  PLATFORM_USER_EMAIL_HEADER,
  ensurePlatformUser,
  findPlatformUserByEmail,
  findPlatformUserById,
  issuePlatformUserSession,
  markPlatformUserSessionMfaVerified,
  publicPlatformUser,
  requirePlatformUser,
  revokePlatformUserSession,
  setPlatformUserPassword,
  verifyPlatformUserPassword,
};
