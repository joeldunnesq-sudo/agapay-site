import { d1, d1First, d1Run, type StorageEnvironment } from './storage.js';
import { generateSecret, hashSessionToken, secureCompare } from './session-crypto.js';
import { normalizeEmail } from './normalize-email.js';
import { createPasswordRecord, verifyPasswordRecord } from './password-records.js';
import { getBearerToken } from './api-responses.js';
import { loadDonor } from './donor-repository.js';
import { privilegedMfaRequired } from './authentication-policy.js';
import { storedField } from './stored-values.js';
import { resolveDonorSession } from './donor-sessions.js';
export type IdentityEnvironment = StorageEnvironment & Partial<Pick<Env, 'PRIVILEGED_MFA_REQUIRED'>>;
export interface PlatformUserRow {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: string | null;
  status: string;
  password_record: string | null;
  session_token_hash: string | null;
  session_salt: string | null;
  session_expires_at: string | null;
  session_mfa_verified_at?: string | null;
  created_at: string;
  updated_at: string;
}
export interface PublicPlatformUser {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string;
  status: string;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AuthenticatedPlatformUser extends PublicPlatformUser {
  mfaVerifiedAt?: string;
}

const PLATFORM_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours -- shorter than the donor default, appropriate for a staff/back-office identity
const PLATFORM_USER_EMAIL_HEADER = 'X-AGAPAY-User-Email';
const DONOR_EMAIL_HEADER = 'X-AGAPAY-Donor-Email';

export { PLATFORM_USER_EMAIL_HEADER };

function nowIso() {
  return new Date().toISOString();
}

function rowToPlatformUser(row: PlatformUserRow): PublicPlatformUser;
function rowToPlatformUser(row: PlatformUserRow | null): PublicPlatformUser | null;
function rowToPlatformUser(row: PlatformUserRow | null): PublicPlatformUser | null {
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

export async function findPlatformUserByEmail(env: IdentityEnvironment, email: unknown) {
  if (!d1(env)) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return d1First<PlatformUserRow>(env, 'SELECT * FROM platform_users WHERE email = ?1', normalized);
}

export async function findPlatformUserById(env: IdentityEnvironment, userId: string) {
  if (!d1(env) || !userId) return null;
  return d1First<PlatformUserRow>(env, 'SELECT * FROM platform_users WHERE id = ?1', userId);
}

// Idempotent by email: returns the existing row if one already exists
// (e.g. a person invited to a second parish), otherwise creates a new one.
// Never sets a password or verifies the email itself -- that happens
// through whatever accepted the invitation or a future explicit login setup.
export async function ensurePlatformUser(
  env: IdentityEnvironment,
  { email, displayName = '' }: { email?: unknown; displayName?: unknown } = {}
) {
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

// Sets (or replaces) a platform user's password and marks their email
// verified -- the action that happens when accepting an invitation for the
// first time. Never called for an unverified, unauthenticated request.
export async function setPlatformUserPassword(env: IdentityEnvironment, userId: string, password: string) {
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

export async function verifyPlatformUserPassword(env: IdentityEnvironment, email: unknown, password: string) {
  const row = await findPlatformUserByEmail(env, email);
  if (!row || !row.password_record || row.status !== 'active') return null;
  const ok = await verifyPasswordRecord(password, row.password_record);
  return ok ? row : null;
}

// Issues a new session token for a platform user, invalidating any prior
// session (single active session per user, deliberately simple for this
// foundational package -- multi-session support is not required here).
export async function issuePlatformUserSession(
  env: IdentityEnvironment,
  userId: string,
  { mfaVerifiedAt = '' }: { mfaVerifiedAt?: string } = {}
) {
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
    // Backward-compatible only while MFA is disabled, so pre-0106 local/test
    // databases can still issue legacy sessions during a staged rollout.
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

export async function markPlatformUserSessionMfaVerified(
  env: IdentityEnvironment,
  userId: string,
  verifiedAt = nowIso()
) {
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

export async function revokePlatformUserSession(env: IdentityEnvironment, userId: string) {
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

// The platform-user analog of requireDonor. Resolves a request's bearer
// token + email header to a specific, currently-valid platform user row --
// never trusts a client-asserted user id, only what a valid session proves.
export async function requirePlatformUser(
  request: Request,
  env: IdentityEnvironment
): Promise<AuthenticatedPlatformUser | null> {
  if (!d1(env)) return null;
  const email = normalizeEmail(request.headers.get(PLATFORM_USER_EMAIL_HEADER));
  const token = getBearerToken(request);
  if (!token) return null;

  if (email) {
    const row = await findPlatformUserByEmail(env, email);
    if (
      row?.status === 'active' &&
      row.session_token_hash &&
      row.session_salt &&
      (!row.session_expires_at || new Date(row.session_expires_at).getTime() >= Date.now())
    ) {
      const submittedHash = await hashSessionToken(token, row.session_salt);
      if (secureCompare(submittedHash, row.session_token_hash)) {
        if (privilegedMfaRequired(env) && !row.session_mfa_verified_at) return null;
        return { ...rowToPlatformUser(row), mfaVerifiedAt: row.session_mfa_verified_at || '' };
      }
    }
  }

  const donorEmail = normalizeEmail(request.headers.get(DONOR_EMAIL_HEADER));
  if (!donorEmail) return null;
  const donor = await resolveDonorSession(await loadDonor(env, donorEmail), token);
  if (!donor) return null;
  // My AGAPAY account creation predates the platform_users identity layer.
  // Provision the matching platform identity only after the verified donor
  // session has been authenticated so first-time directory users can reach
  // the private self-service onboarding flow. This also repairs existing
  // donor accounts that were created before platform identities existed.
  const row =
    (await findPlatformUserByEmail(env, donorEmail)) ||
    (await ensurePlatformUser(env, {
      email: donorEmail,
      displayName: donor.donorName || donor.householdName || '',
    }));
  if (!row || row.status !== 'active') return null;
  return rowToPlatformUser(row);
}

export function publicPlatformUser(row: PlatformUserRow | null): PublicPlatformUser | null {
  return rowToPlatformUser(row);
}
