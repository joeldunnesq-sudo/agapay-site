// Compatibility facade: typed identity handlers retain the established route exports.
export { handleIdentitySession, handleIdentityLogout } from './identity-session-providers.js';
export {
  handleIdentityLogin,
  handleIdentityInvitationAccept,
  handleMembershipInvitationCreate,
  handleMembershipList,
  handleMembershipInvitationRevoke,
  handleIdentityCapabilityCatalog,
} from './identity-access-providers.js';
export { PLATFORM_USER_EMAIL_HEADER } from '../lib/identity.js';
export { requireActiveMembership } from '../lib/authorization.js';
