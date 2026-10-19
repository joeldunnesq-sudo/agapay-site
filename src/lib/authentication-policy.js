// Generated from src/lib/authentication-policy.ts by npm run build:server. Do not edit.
function privilegedMfaRequired(env) {
  return (
    String(env?.PRIVILEGED_MFA_REQUIRED || '')
      .trim()
      .toLowerCase() === 'true'
  );
}
export { privilegedMfaRequired };
