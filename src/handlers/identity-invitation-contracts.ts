import { storedField, storedObject } from '../lib/stored-values.js';
import type { StoredRegistrationLookup } from '../lib/parish-registration-lookup.js';
import type { RegistrationRecord } from '../organizations/types.js';

export function identityRegistrationLookup<TEnv>(
  lookup: (env: TEnv, id: string) => Promise<StoredRegistrationLookup | null>
) {
  return async (env: TEnv, id: string): Promise<{ key: string; registration: RegistrationRecord } | null> => {
    const found = await lookup(env, id);
    if (!found || !isRecord(found.registration)) return null;
    return { key: found.key, registration: found.registration };
  };
}

export interface InvitationFailure {
  ok: false;
  error: unknown;
  code: unknown;
}
export interface InvitationCreated {
  ok: true;
  id: string;
  token: string;
  expiresAt: string;
}
export interface InvitationAccepted {
  ok: true;
  userId: string;
  email: string;
  parishId: string;
  membershipId: string;
  acceptedAt: string;
}

function requiredString(value: unknown, key: string): string {
  const field = storedField(value, key);
  if (typeof field !== 'string') throw new TypeError(`Invalid invitation result: ${key}`);
  return field;
}
function failure(value: unknown): InvitationFailure {
  return { ok: false, error: storedField(value, 'error'), code: storedField(value, 'code') };
}
export function invitationCreated(value: unknown): InvitationCreated | InvitationFailure {
  if (!storedField(value, 'ok')) return failure(value);
  return {
    ...storedObject(value),
    ok: true,
    id: requiredString(value, 'id'),
    token: requiredString(value, 'token'),
    expiresAt: requiredString(value, 'expiresAt'),
  };
}
export function invitationAccepted(value: unknown): InvitationAccepted | InvitationFailure {
  if (!storedField(value, 'ok')) return failure(value);
  return {
    ok: true,
    userId: requiredString(value, 'userId'),
    email: requiredString(value, 'email'),
    parishId: requiredString(value, 'parishId'),
    membershipId: requiredString(value, 'membershipId'),
    acceptedAt: requiredString(value, 'acceptedAt'),
  };
}

export async function identityRequestBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
