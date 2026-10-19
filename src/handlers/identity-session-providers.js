// Generated from src/handlers/identity-session-providers.ts by npm run build:server. Do not edit.
import { listMembershipsForUser } from '../lib/memberships.js';
import { createIdentitySessionHandlers } from './identity-session-handlers.js';
const { handleIdentitySession, handleIdentityLogout } = createIdentitySessionHandlers({
  listMembershipsForUser,
});
export { handleIdentityLogout, handleIdentitySession };
