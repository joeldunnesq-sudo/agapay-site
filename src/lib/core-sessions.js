// Generated from src/lib/core-sessions.ts by npm run build:server. Do not edit.
import { d1 } from './database-reads.js';
import './http-responses.js';
import './kv-reads.js';
import './normalize-email.js';
import './kv-reads.js';
import './json-rows.js';
import {
  ADMIN_SESSION_STORE_KEY,
  ADMIN_SESSION_TTL_MS,
  ADMIN_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  PARISH_SESSION_MAX,
} from './core-shared.js';
import { d1GetSetting, d1SetSetting, generateSecret } from './core.js';
import './core-shared.js';
import { secureCompare, hashSessionToken } from './core-authentication.js';
function parseAdminSessionStore(value) {
  if (!value) return { version: 1, sessions: [] };
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return { version: 1, sessions };
  } catch {
    return { version: 1, sessions: [] };
  }
}
async function loadAdminSessionStore(env) {
  if (d1(env)) {
    return parseAdminSessionStore(await d1GetSetting(env, ADMIN_SESSION_STORE_KEY));
  }
  if (env.AGAPAY_REGISTRATIONS) {
    return parseAdminSessionStore(await env.AGAPAY_REGISTRATIONS.get(ADMIN_SESSION_STORE_KEY));
  }
  return { version: 1, sessions: [] };
}
async function saveAdminSessionStore(env, store) {
  const payload = JSON.stringify({
    version: 1,
    sessions: Array.isArray(store?.sessions) ? store.sessions : [],
  });
  if (d1(env)) {
    await d1SetSetting(env, ADMIN_SESSION_STORE_KEY, payload);
    return;
  }
  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(ADMIN_SESSION_STORE_KEY, payload);
  }
}
function normalizeAdminActor(actor) {
  const cleaned = String(actor || '').trim();
  if (!cleaned) return 'Admin';
  return cleaned.slice(0, 80);
}
function pruneAdminSessions(sessions, nowMs = Date.now()) {
  return sessions.filter((entry) => {
    const expiresAtMs = Date.parse(entry?.expiresAt || '');
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}
async function issueAdminSession(env, actor = 'Admin', { mfaVerifiedAt = '' } = {}) {
  const nowMs = Date.now();
  const token = generateSecret('agp_admin');
  const sessionSalt = generateSecret('admin_salt');
  const tokenHash = await hashSessionToken(token, sessionSalt);
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + ADMIN_SESSION_TTL_MS).toISOString();
  const store = await loadAdminSessionStore(env);
  const sessions = pruneAdminSessions(store.sessions, nowMs);
  sessions.push({
    id: generateSecret('adminsess'),
    actor: normalizeAdminActor(actor),
    tokenHash,
    sessionSalt,
    createdAt,
    expiresAt,
    mfaVerifiedAt: mfaVerifiedAt || '',
  });
  sessions.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  while (sessions.length > ADMIN_SESSION_MAX) sessions.shift();
  await saveAdminSessionStore(env, { version: 1, sessions });
  return { token, actor: normalizeAdminActor(actor), createdAt, expiresAt, mfaVerifiedAt: mfaVerifiedAt || '' };
}
async function markAdminSessionMfaVerified(env, sessionId, verifiedAt = /* @__PURE__ */ new Date().toISOString()) {
  if (!sessionId) return false;
  const store = await loadAdminSessionStore(env);
  let changed = false;
  const sessions = store.sessions.map((entry) => {
    if (entry?.id !== sessionId) return entry;
    changed = true;
    return { ...entry, mfaVerifiedAt: verifiedAt };
  });
  if (changed) await saveAdminSessionStore(env, { version: 1, sessions });
  return changed;
}
async function resolveAdminSession(env, token) {
  if (!token) return null;
  const nowMs = Date.now();
  const store = await loadAdminSessionStore(env);
  const active = pruneAdminSessions(store.sessions, nowMs);
  if (active.length !== store.sessions.length) {
    await saveAdminSessionStore(env, { version: 1, sessions: active });
  }
  for (const session of active) {
    const submitted = await hashSessionToken(token, session.sessionSalt || '');
    if (secureCompare(submitted, session.tokenHash || '')) {
      return {
        id: session.id || '',
        actor: normalizeAdminActor(session.actor || 'Admin'),
        expiresAt: session.expiresAt,
        mfaVerifiedAt: session.mfaVerifiedAt || '',
      };
    }
  }
  return null;
}
function pruneParishDashboardSessions(sessions, nowMs = Date.now()) {
  return (Array.isArray(sessions) ? sessions : []).filter((entry) => {
    const expiresAtMs = Date.parse(entry?.expiresAt || '');
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
  sessions.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  while (sessions.length > PARISH_SESSION_MAX) sessions.shift();
  return {
    token,
    createdAt,
    expiresAt,
    mfaVerifiedAt: mfaVerifiedAt || '',
    accessType: accessType === 'staff' ? 'staff' : 'primary_parish',
    registration: {
      ...registration,
      parishDashboardSessions: sessions,
    },
  };
}
async function resolveParishDashboardSession(registration, token) {
  if (!registration || !token) return null;
  const active = pruneParishDashboardSessions(registration.parishDashboardSessions);
  for (const session of active) {
    const submitted = await hashSessionToken(token, session.sessionSalt || '');
    if (secureCompare(submitted, session.tokenHash || '')) {
      return {
        id: session.id || '',
        expiresAt: session.expiresAt || '',
        mfaVerifiedAt: session.mfaVerifiedAt || '',
        accessType: session.accessType || '',
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
  const sessions = (
    Array.isArray(registration.parishDashboardSessions) ? registration.parishDashboardSessions : []
  ).map((entry) => {
    if (entry?.id !== sessionId) return entry;
    changed = true;
    return { ...entry, mfaVerifiedAt: verifiedAt };
  });
  return { registration: changed ? { ...registration, parishDashboardSessions: sessions } : registration, changed };
}
export {
  issueAdminSession,
  issueParishDashboardSession,
  loadAdminSessionStore,
  markAdminSessionMfaVerified,
  markParishDashboardSessionMfaVerified,
  normalizeAdminActor,
  parseAdminSessionStore,
  pruneAdminSessions,
  pruneParishDashboardSessions,
  resolveAdminSession,
  resolveParishDashboardSession,
  saveAdminSessionStore,
};
