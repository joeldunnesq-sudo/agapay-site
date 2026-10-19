// Generated from src/lib/parish-dashboard-bearer.ts by npm run build:server. Do not edit.
function createParishDashboardBearerVerifier(resolveParishDashboardSession) {
  return async function verifyParishDashboardBearer(registration, token) {
    return Boolean(await resolveParishDashboardSession(registration, token));
  };
}
export { createParishDashboardBearerVerifier };
