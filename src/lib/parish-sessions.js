// Generated from src/lib/parish-sessions.ts by npm run build:server. Do not edit.
import { generateSecret, hashSessionToken, secureCompare } from './session-crypto.js';
const PARISH_SESSION_TTL_MS = 1e3 * 60 * 60 * 12;
const PARISH_SESSION_MAX = 16;
function field(value, key) {
  if (value === null || value === void 0) return void 0;
  return Reflect.get(Object(value), key, value);
}
function pruneParishDashboardSessions(sessions, nowMs = Date.now()) {
  const entries = Array.isArray(sessions) ? sessions : [];
  return entries.filter((entry) => {
    const expiresAtMs = Date.parse(`${field(entry, 'expiresAt') || ''}`);
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}
async function issueParishDashboardSession(registration, { mfaVerifiedAt = '', accessType = 'primary_parish' } = {}) {
  const nowMs = Date.now();
  const token = generateSecret('agp_parish');
  const sessionSalt = generateSecret('parish_salt');
  const tokenHash = await hashSessionToken(token, sessionSalt);
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + PARISH_SESSION_TTL_MS).toISOString();
  const sessions = pruneParishDashboardSessions(registration?.parishDashboardSessions, nowMs);
  sessions.push({
    id: generateSecret('parishsess'),
    tokenHash,
    sessionSalt,
    createdAt,
    expiresAt,
    mfaVerifiedAt: mfaVerifiedAt || '',
    accessType: accessType === 'staff' ? 'staff' : 'primary_parish',
  });
  sessions.sort((a, b) => String(field(a, 'createdAt') || '').localeCompare(String(field(b, 'createdAt') || '')));
  while (sessions.length > PARISH_SESSION_MAX) sessions.shift();
  return {
    token,
    createdAt,
    expiresAt,
    mfaVerifiedAt: mfaVerifiedAt || '',
    accessType: accessType === 'staff' ? 'staff' : 'primary_parish',
    registration: { ...registration, parishDashboardSessions: sessions },
  };
}
async function resolveParishDashboardSession(registration, token) {
  if (!registration || !token) return null;
  const active = pruneParishDashboardSessions(registration.parishDashboardSessions);
  for (const session of active) {
    const submitted = await hashSessionToken(token, field(session, 'sessionSalt') || '');
    if (secureCompare(submitted, field(session, 'tokenHash') || '')) {
      return {
        id: field(session, 'id') || '',
        expiresAt: field(session, 'expiresAt') || '',
        mfaVerifiedAt: field(session, 'mfaVerifiedAt') || '',
        accessType: field(session, 'accessType') || '',
      };
    }
  }
  return null;
}
function markParishDashboardSessionMfaVerified(
  registration,
  sessionId,
  verifiedAt = /* @__PURE__ */ new Date().toISOString()
) {
  if (!registration || !sessionId) return { registration, changed: false };
  let changed = false;
  const entries = Array.isArray(registration.parishDashboardSessions) ? registration.parishDashboardSessions : [];
  const sessions = entries.map((entry) => {
    if (field(entry, 'id') !== sessionId) return entry;
    changed = true;
    const record = Object(entry);
    return { ...record, mfaVerifiedAt: verifiedAt };
  });
  return { registration: changed ? { ...registration, parishDashboardSessions: sessions } : registration, changed };
}
export {
  PARISH_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  issueParishDashboardSession,
  markParishDashboardSessionMfaVerified,
  pruneParishDashboardSessions,
  resolveParishDashboardSession,
};
