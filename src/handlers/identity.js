// Generated from src/handlers/identity.ts by npm run build:server. Do not edit.
import { handleIdentitySession, handleIdentityLogout } from './identity-session-providers.js';
import {
  handleIdentityLogin,
  handleIdentityInvitationAccept,
  handleMembershipInvitationCreate,
  handleMembershipList,
  handleMembershipInvitationRevoke,
  handleIdentityCapabilityCatalog,
} from './identity-access-providers.js';
import { PLATFORM_USER_EMAIL_HEADER } from '../lib/identity.js';
import { requireActiveMembership } from '../lib/authorization.js';
export {
  PLATFORM_USER_EMAIL_HEADER,
  handleIdentityCapabilityCatalog,
  handleIdentityInvitationAccept,
  handleIdentityLogin,
  handleIdentityLogout,
  handleIdentitySession,
  handleMembershipInvitationCreate,
  handleMembershipInvitationRevoke,
  handleMembershipList,
  requireActiveMembership,
};
