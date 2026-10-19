import { d1, type StorageEnvironment } from './storage.js';
import { d1GetSetting, d1SetSetting } from './storage-policy.js';
import { ADMIN_SESSION_STORE_KEY } from './storage-keys.js';
import { generateSecret, hashSessionToken, secureCompare } from './session-crypto.js';
import { storedField, storedObject } from './stored-values.js';

export const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
export const ADMIN_SESSION_MAX = 32;
export interface AdminSessionStore {
  version: 1;
  sessions: unknown[];
}
export interface ResolvedAdminSession {
  id: unknown;
  actor: string;
  expiresAt: unknown;
  mfaVerifiedAt: unknown;
}

export function parseAdminSessionStore(value: unknown): AdminSessionStore {
  if (!value) return { version: 1, sessions: [] };
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    const entries: unknown = storedField(parsed, 'sessions');
    const sessions: unknown[] = Array.isArray(entries) ? entries : [];
    return { version: 1, sessions };
  } catch {
    return { version: 1, sessions: [] };
  }
}

export async function loadAdminSessionStore(env: StorageEnvironment): Promise<AdminSessionStore> {
  if (d1(env)) return parseAdminSessionStore(await d1GetSetting(env, ADMIN_SESSION_STORE_KEY));
  if (env.AGAPAY_REGISTRATIONS)
    return parseAdminSessionStore(await env.AGAPAY_REGISTRATIONS.get(ADMIN_SESSION_STORE_KEY));
  return { version: 1, sessions: [] };
}

export async function saveAdminSessionStore(env: StorageEnvironment, store: unknown): Promise<void> {
  const entries = storedField(store, 'sessions');
  const payload = JSON.stringify({ version: 1, sessions: Array.isArray(entries) ? entries : [] });
  if (d1(env)) {
    await d1SetSetting(env, ADMIN_SESSION_STORE_KEY, payload);
    return;
  }
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(ADMIN_SESSION_STORE_KEY, payload);
}

export function normalizeAdminActor(actor: unknown): string {
  const cleaned = String(actor || '').trim();
  if (!cleaned) return 'Admin';
  return cleaned.slice(0, 80);
}

export function pruneAdminSessions(sessions: readonly unknown[], nowMs = Date.now()): unknown[] {
  return sessions.filter((entry) => {
    const expiresAtMs = Date.parse(`${storedField(entry, 'expiresAt') || ''}`);
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

export async function issueAdminSession(
  env: StorageEnvironment,
  actor: unknown = 'Admin',
  { mfaVerifiedAt = '' }: { mfaVerifiedAt?: string } = {}
) {
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
  sessions.sort((a, b) =>
    String(storedField(a, 'createdAt') || '').localeCompare(String(storedField(b, 'createdAt') || ''))
  );
  while (sessions.length > ADMIN_SESSION_MAX) sessions.shift();
  await saveAdminSessionStore(env, { version: 1, sessions });
  return { token, actor: normalizeAdminActor(actor), createdAt, expiresAt, mfaVerifiedAt: mfaVerifiedAt || '' };
}

export async function markAdminSessionMfaVerified(
  env: StorageEnvironment,
  sessionId: string,
  verifiedAt = new Date().toISOString()
): Promise<boolean> {
  if (!sessionId) return false;
  const store = await loadAdminSessionStore(env);
  let changed = false;
  const sessions = store.sessions.map((entry) => {
    if (storedField(entry, 'id') !== sessionId) return entry;
    changed = true;
    return { ...storedObject(entry), mfaVerifiedAt: verifiedAt };
  });
  if (changed) await saveAdminSessionStore(env, { version: 1, sessions });
  return changed;
}

export async function resolveAdminSession(
  env: StorageEnvironment,
  token: string
): Promise<ResolvedAdminSession | null> {
  if (!token) return null;
  const nowMs = Date.now();
  const store = await loadAdminSessionStore(env);
  const active = pruneAdminSessions(store.sessions, nowMs);
  if (active.length !== store.sessions.length) await saveAdminSessionStore(env, { version: 1, sessions: active });
  for (const session of active) {
    const submitted = await hashSessionToken(token, storedField(session, 'sessionSalt') || '');
    if (secureCompare(submitted, storedField(session, 'tokenHash') || '')) {
      return {
        id: storedField(session, 'id') || '',
        actor: normalizeAdminActor(storedField(session, 'actor') || 'Admin'),
        expiresAt: storedField(session, 'expiresAt'),
        mfaVerifiedAt: storedField(session, 'mfaVerifiedAt') || '',
      };
    }
  }
  return null;
}
