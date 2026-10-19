// Generated from src/handlers/identity-access-providers.ts by npm run build:server. Do not edit.
import { rateLimit } from '../lib/core.js';
import { beginMfaAuthentication } from '../lib/mfa.js';
import {
  listMembershipsForUser,
  listMembershipsForParish,
  listInvitationsForParish,
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from '../lib/memberships.js';
import {
  requireCapability,
  CAPABILITY_CATALOG,
  ROLE_TEMPLATES,
  sanitizeGrantableCapabilities,
} from '../lib/authorization.js';
import {
  findRegistrationByParishId as rawLookup,
  saveRegistrationRecord,
  verifyParishDashboardBearer,
} from './parish.js';
import { identityRegistrationLookup } from './identity-invitation-contracts.js';
import { recommendedOnboardingState } from '../lib/parish-onboarding.js';
import { sendParishStaffAccessInvitation } from '../lib/parish-notifications.js';
import { createIdentityAccessHandlers } from './identity-access-handlers.js';
const findRegistrationByParishId = identityRegistrationLookup(rawLookup);
const {
  handleIdentityLogin,
  handleIdentityInvitationAccept,
  handleMembershipInvitationCreate,
  handleMembershipList,
  handleMembershipInvitationRevoke,
  handleIdentityCapabilityCatalog,
} = createIdentityAccessHandlers({
  rateLimit,
  beginMfaAuthentication,
  listMembershipsForUser,
  listMembershipsForParish,
  listInvitationsForParish,
  acceptInvitation,
  createInvitation,
  revokeInvitation,
  findRegistrationByParishId,
  saveRegistrationRecord,
  verifyParishDashboardBearer,
  requireCapability,
  recommendedOnboardingState,
  sendParishStaffAccessInvitation,
  sanitizeGrantableCapabilities,
  CAPABILITY_CATALOG,
  ROLE_TEMPLATES,
});
export {
  handleIdentityCapabilityCatalog,
  handleIdentityInvitationAccept,
  handleIdentityLogin,
  handleMembershipInvitationCreate,
  handleMembershipInvitationRevoke,
  handleMembershipList,
};
