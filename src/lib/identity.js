// AGAPAY Accounting Package 0.75C -- Platform Identity.
//
// One platform_users row per real human, platform-wide (not parish-scoped).
// The authentication *mechanism* here is deliberately the same shape as the
// existing donor pattern (src/handlers/parish.js requireDonor / donor.js
// session issuance): verified email, salted hashed session token, expiry,
// constant-time comparison -- generalized, not copy-pasted onto the donor
// table, per docs/accounting/02d-identity-and-capability-model.md.
//
// This module knows nothing about parishes, roles, or capabilities -- that
// is src/lib/memberships.js and src/lib/authorization.js. This module only
// answers "who is this person" and "is their session valid."
//
// This is purely additive: it does not modify requireDonor, requireAdmin,
// or verifyParishDashboardBearer, and the legacy shared parish-bearer
// pathway continues to work unchanged for every existing route.

import {
  d1,
  d1First,
  d1Run,
  generateSecret,
  hashSessionToken,
  secureCompare,
  normalizeEmail,
  createPasswordRecord,
  verifyPasswordRecord,
  getBearerToken,
  loadDonor
} from "./core.js";

const PLATFORM_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours -- shorter than the donor default, appropriate for a staff/back-office identity
const PLATFORM_USER_EMAIL_HEADER = "X-AGAPAY-User-Email";
const DONOR_EMAIL_HEADER = "X-AGAPAY-Donor-Email";

export { PLATFORM_USER_EMAIL_HEADER };

function nowIso() {
  return new Date().toISOString();
}

function rowToPlatformUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || "",
    emailVerifiedAt: row.email_verified_at || "",
    status: row.status || "active",
    hasPassword: Boolean(row.password_record),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findPlatformUserByEmail(env, email) {
  if (!d1(env)) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return d1First(env, "SELECT * FROM platform_users WHERE email = ?1", normalized);
}

export async function findPlatformUserById(env, userId) {
  if (!d1(env) || !userId) return null;
  return d1First(env, "SELECT * FROM platform_users WHERE id = ?1", userId);
}

// Idempotent by email: returns the existing row if one already exists
// (e.g. a person invited to a second parish), otherwise creates a new one.
// Never sets a password or verifies the email itself -- that happens
// through whatever accepted the invitation or a future explicit login setup.
export async function ensurePlatformUser(env, { email, displayName = "" } = {}) {
  if (!d1(env)) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const existing = await findPlatformUserByEmail(env, normalized);
  if (existing) return existing;

  const id = generateSecret("user");
  const timestamp = nowIso();
  await d1Run(
    env,
    `INSERT INTO platform_users (id, email, display_name, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'active', ?4, ?4)`,
    id,
    normalized,
    String(displayName || "").trim().slice(0, 200),
    timestamp
  );
  return findPlatformUserById(env, id);
}

// Sets (or replaces) a platform user's password and marks their email
// verified -- the action that happens when accepting an invitation for the
// first time. Never called for an unverified, unauthenticated request.
export async function setPlatformUserPassword(env, userId, password) {
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

export async function verifyPlatformUserPassword(env, email, password) {
  const row = await findPlatformUserByEmail(env, email);
  if (!row || !row.password_record || row.status !== "active") return null;
  const ok = await verifyPasswordRecord(password, row.password_record);
  return ok ? row : null;
}

// Issues a new session token for a platform user, invalidating any prior
// session (single active session per user, deliberately simple for this
// foundational package -- multi-session support is not required here).
export async function issuePlatformUserSession(env, userId) {
  if (!d1(env) || !userId) return null;
  const token = generateSecret("agp_user");
  const salt = generateSecret("user_salt");
  const tokenHash = await hashSessionToken(token, salt);
  const expiresAt = new Date(Date.now() + PLATFORM_SESSION_TTL_MS).toISOString();
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
  return { token, expiresAt };
}

export async function revokePlatformUserSession(env, userId) {
  if (!d1(env) || !userId) return;
  await d1Run(
    env,
    `UPDATE platform_users
     SET session_token_hash = NULL, session_salt = NULL, session_expires_at = NULL, updated_at = ?2
     WHERE id = ?1`,
    userId,
    nowIso()
  );
}

// The platform-user analog of requireDonor. Resolves a request's bearer
// token + email header to a specific, currently-valid platform user row --
// never trusts a client-asserted user id, only what a valid session proves.
export async function requirePlatformUser(request, env) {
  if (!d1(env)) return null;
  const email = normalizeEmail(request.headers.get(PLATFORM_USER_EMAIL_HEADER));
  const token = getBearerToken(request);
  if (!token) return null;

  if (email) {
    const row = await findPlatformUserByEmail(env, email);
    if (row?.status === "active" && row.session_token_hash && row.session_salt && (!row.session_expires_at || new Date(row.session_expires_at).getTime() >= Date.now())) {
      const submittedHash = await hashSessionToken(token, row.session_salt);
      if (secureCompare(submittedHash, row.session_token_hash)) return rowToPlatformUser(row);
    }
  }

  const donorEmail = normalizeEmail(request.headers.get(DONOR_EMAIL_HEADER));
  if (!donorEmail) return null;
  const donor = await loadDonor(env, donorEmail);
  if (!donor?.emailVerifiedAt || !donor.sessionTokenHash || !donor.sessionSalt) return null;
  if (donor.sessionExpiresAt && new Date(donor.sessionExpiresAt).getTime() < Date.now()) return null;
  const submittedDonorHash = await hashSessionToken(token, donor.sessionSalt);
  if (!secureCompare(submittedDonorHash, donor.sessionTokenHash)) return null;
  const row = await findPlatformUserByEmail(env, donorEmail);
  if (!row || row.status !== "active") return null;
  return rowToPlatformUser(row);
}

export function publicPlatformUser(row) {
  return rowToPlatformUser(row);
}
