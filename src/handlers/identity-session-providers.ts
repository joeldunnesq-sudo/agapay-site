import { listMembershipsForUser } from '../lib/memberships.js';
import { createIdentitySessionHandlers } from './identity-session-handlers.js';
export const { handleIdentitySession, handleIdentityLogout } = createIdentitySessionHandlers({
  listMembershipsForUser,
});
