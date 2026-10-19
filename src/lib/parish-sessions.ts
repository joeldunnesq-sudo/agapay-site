import type { RegistrationRecord } from '../organizations/types.js';
import { generateSecret, hashSessionToken, secureCompare } from './session-crypto.js';

export const PARISH_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
export const PARISH_SESSION_MAX = 16;

export interface ParishSessionOptions {
  mfaVerifiedAt?: string;
  accessType?: string;
}
export interface ResolvedParishSession {
  id: unknown;
  expiresAt: unknown;
  mfaVerifiedAt: unknown;
  accessType: unknown;
}

// Match JS property access on legacy JSON without assuming a validated record.
// The explicit receiver also preserves getter behavior on boxed primitives.
function field(value: unknown, key: string): unknown {
  if (value === null || value === undefined) return undefined;
  return Reflect.get(Object(value), key, value);
}

export function pruneParishDashboardSessions(sessions: unknown, nowMs = Date.now()): unknown[] {
  const entries: unknown[] = Array.isArray(sessions) ? sessions : [];
  return entries.filter((entry) => {
    const expiresAtMs = Date.parse(`${field(entry, 'expiresAt') || ''}`);
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

export async function issueParishDashboardSession<TRecord extends RegistrationRecord | null | undefined>(
  registration: TRecord,
  { mfaVerifiedAt = '', accessType = 'primary_parish' }: ParishSessionOptions = {}
) {
  const sessionAccess: 'staff' | 'primary_parish' = accessType === 'staff' ? 'staff' : 'primary_parish';
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
    accessType: sessionAccess,
  });
  sessions.sort((a, b) => String(field(a, 'createdAt') || '').localeCompare(String(field(b, 'createdAt') || '')));
  while (sessions.length > PARISH_SESSION_MAX) sessions.shift();
  return {
    token,
    createdAt,
    expiresAt,
    mfaVerifiedAt: mfaVerifiedAt || '',
    accessType: sessionAccess,
    registration: { ...registration, parishDashboardSessions: sessions },
  };
}

export async function resolveParishDashboardSession(
  registration: RegistrationRecord | null | undefined,
  token: string
): Promise<ResolvedParishSession | null> {
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

export function markParishDashboardSessionMfaVerified<TRecord extends RegistrationRecord | null | undefined>(
  registration: TRecord,
  sessionId: string | undefined,
  verifiedAt = new Date().toISOString()
) {
  if (!registration || !sessionId) return { registration, changed: false };
  let changed = false;
  const entries: unknown[] = Array.isArray(registration.parishDashboardSessions)
    ? registration.parishDashboardSessions
    : [];
  const sessions = entries.map((entry) => {
    if (field(entry, 'id') !== sessionId) return entry;
    changed = true;
    const record: object = Object(entry);
    return { ...record, mfaVerifiedAt: verifiedAt };
  });
  return { registration: changed ? { ...registration, parishDashboardSessions: sessions } : registration, changed };
}
