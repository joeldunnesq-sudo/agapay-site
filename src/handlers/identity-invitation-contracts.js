// Generated from src/handlers/identity-invitation-contracts.ts by npm run build:server. Do not edit.
import { storedField, storedObject } from '../lib/stored-values.js';
function identityRegistrationLookup(lookup) {
  return async (env, id) => {
    const found = await lookup(env, id);
    if (!found || !isRecord(found.registration)) return null;
    return { key: found.key, registration: found.registration };
  };
}
function requiredString(value, key) {
  const field = storedField(value, key);
  if (typeof field !== 'string') throw new TypeError(`Invalid invitation result: ${key}`);
  return field;
}
function failure(value) {
  return { ok: false, error: storedField(value, 'error'), code: storedField(value, 'code') };
}
function invitationCreated(value) {
  if (!storedField(value, 'ok')) return failure(value);
  return {
    ...storedObject(value),
    ok: true,
    id: requiredString(value, 'id'),
    token: requiredString(value, 'token'),
    expiresAt: requiredString(value, 'expiresAt'),
  };
}
function invitationAccepted(value) {
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
async function identityRequestBody(request) {
  try {
    const value = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export { identityRegistrationLookup, identityRequestBody, invitationAccepted, invitationCreated };
