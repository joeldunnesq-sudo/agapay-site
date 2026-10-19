// Generated from src/routes/organization-action-contracts.ts by npm run build:server. Do not edit.
function organizationRegistrationLookup(lookup) {
  return async (env, id) => {
    const found = await lookup(env, id);
    if (!found || !isRegistrationRecord(found.registration)) return null;
    return { key: found.key, registration: found.registration };
  };
}
function isRegistrationRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export { organizationRegistrationLookup };
