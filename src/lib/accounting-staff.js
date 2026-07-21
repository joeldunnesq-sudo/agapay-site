import { createPasswordRecord, d1, d1All, d1First, d1Run, generateSecret, hashSessionToken, secureCompare, verifyPasswordRecord } from "./core.js";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const ACCOUNTING_PROFILE_HEADER = "X-AGAPAY-Accounting-Profile";
export const ACCOUNTING_TOKEN_HEADER = "X-AGAPAY-Accounting-Token";

const publicProfile = (row) => row && ({ id: row.id, displayName: row.display_name, roleTemplate: row.role_template, status: row.status });
const capabilities = (row) => { try { const value = JSON.parse(row?.capabilities_json || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };

export async function listAccountingStaffProfiles(env, parishId) {
  if (!d1(env) || !parishId) return [];
  return (await d1All(env, "SELECT id,display_name,role_template,status FROM accounting_staff_profiles WHERE parish_id=?1 AND status='active' ORDER BY display_name", parishId)).map(publicProfile);
}

export async function createAccountingStaffProfile(env, { parishId, displayName, roleTemplate, capabilities: grants, pin, actorType, actorId = null }) {
  const name = String(displayName || "").trim().slice(0, 120);
  if (!d1(env) || !parishId || !name || !/^\d{6}$/.test(String(pin || "")) || !Array.isArray(grants) || !grants.includes("accounting.view")) return null;
  const id = generateSecret("acct_staff");
  const pinRecord = JSON.stringify(await createPasswordRecord(String(pin)));
  await d1Run(env, `INSERT INTO accounting_staff_profiles(id,parish_id,display_name,role_template,capabilities_json,pin_record,created_by_actor_type,created_by_actor_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`, id, parishId, name, roleTemplate, JSON.stringify([...new Set(grants)]), pinRecord, actorType, actorId);
  return publicProfile(await d1First(env, "SELECT * FROM accounting_staff_profiles WHERE id=?1", id));
}

export async function verifyAccountingStaffPin(env, { parishId, profileId, pin }) {
  if (!d1(env) || !parishId || !profileId || !/^\d{6}$/.test(String(pin || ""))) return null;
  const row = await d1First(env, "SELECT * FROM accounting_staff_profiles WHERE id=?1 AND parish_id=?2 AND status='active'", profileId, parishId);
  if (!row || (row.locked_until && Date.parse(row.locked_until) > Date.now())) return null;
  const ok = await verifyPasswordRecord(String(pin), row.pin_record);
  if (!ok) {
    const attempts = Number(row.failed_attempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await d1Run(env, "UPDATE accounting_staff_profiles SET failed_attempts=?2,locked_until=?3,updated_at=datetime('now') WHERE id=?1", row.id, attempts >= 5 ? 0 : attempts, lockedUntil);
    return null;
  }
  await d1Run(env, "UPDATE accounting_staff_profiles SET failed_attempts=0,locked_until=NULL,last_authenticated_at=datetime('now'),updated_at=datetime('now') WHERE id=?1", row.id);
  const token = generateSecret("agp_acct");
  const salt = generateSecret("acct_salt");
  const tokenHash = await hashSessionToken(token, salt);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await d1Run(env, "UPDATE accounting_staff_sessions SET revoked_at=datetime('now') WHERE profile_id=?1 AND revoked_at IS NULL", row.id);
  await d1Run(env, "INSERT INTO accounting_staff_sessions(id,profile_id,parish_id,token_hash,token_salt,expires_at) VALUES(?1,?2,?3,?4,?5,?6)", generateSecret("acct_session"), row.id, parishId, tokenHash, salt, expiresAt);
  return { token, expiresAt, profile: publicProfile(row) };
}

export async function requireAccountingStaffProfile(request, env, parishId, capability) {
  if (!d1(env)) return null;
  const profileId = String(request.headers.get(ACCOUNTING_PROFILE_HEADER) || "");
  const token = String(request.headers.get(ACCOUNTING_TOKEN_HEADER) || "");
  if (!profileId || !token) return null;
  const session = await d1First(env, `SELECT s.*,p.display_name,p.role_template,p.capabilities_json,p.status profile_status FROM accounting_staff_sessions s JOIN accounting_staff_profiles p ON p.id=s.profile_id WHERE s.profile_id=?1 AND s.parish_id=?2 AND s.revoked_at IS NULL ORDER BY s.created_at DESC LIMIT 1`, profileId, parishId);
  if (!session || session.profile_status !== "active" || Date.parse(session.expires_at) < Date.now()) return null;
  const submitted = await hashSessionToken(token, session.token_salt);
  if (!secureCompare(submitted, session.token_hash)) return null;
  const grants = capabilities(session);
  if (!grants.includes(capability)) return null;
  return { user: { id: session.profile_id, displayName: session.display_name }, membership: { parishId, roleTemplate: session.role_template }, capabilities: grants, actorType: "accounting_staff_profile" };
}

export async function revokeAccountingStaffSession(env, { parishId, profileId }) {
  if (!d1(env) || !parishId || !profileId) return;
  await d1Run(env, "UPDATE accounting_staff_sessions SET revoked_at=datetime('now') WHERE parish_id=?1 AND profile_id=?2 AND revoked_at IS NULL", parishId, profileId);
}

export async function updateAccountingStaffPin(env, { parishId, profileId, pin }) {
  if (!d1(env) || !parishId || !profileId || !/^\d{6}$/.test(String(pin || ""))) return false;
  const record = JSON.stringify(await createPasswordRecord(String(pin)));
  const result = await d1Run(env, "UPDATE accounting_staff_profiles SET pin_record=?3,failed_attempts=0,locked_until=NULL,updated_at=datetime('now') WHERE id=?1 AND parish_id=?2 AND status='active'", profileId, parishId, record);
  return Number(result?.meta?.changes || 0) === 1;
}
