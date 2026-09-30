// Generated from src/organizations/module-profiles.ts by npm run build:server. Do not edit.
import { ORGANIZATION_TYPES } from './types.js';
const ORGANIZATION_MODULES = Object.freeze({
  GIVING: 'giving',
  GIVING_PLUS: 'givingPlus',
  STEWARDSHIP_HEALTH: 'stewardshipHealth',
  SACRAMENTS: 'sacraments',
  DIRECTORY: 'directory',
  LIBRARY: 'library',
  BOOKSTORE: 'bookstore',
  COMMERCE_SUITE: 'commerceSuite',
  COMMUNICATIONS: 'communications',
  TEXT_TO_GIVE: 'textToGive',
  ACCOUNTING: 'accounting',
});
function freezeProfile(profile) {
  return Object.freeze({ ...profile, eligibleModules: Object.freeze([...profile.eligibleModules]) });
}
const CHURCH_MODULES = Object.freeze(Object.values(ORGANIZATION_MODULES));
const ALL_CURRENT_MODULES = CHURCH_MODULES;
const PROFILES = Object.freeze({
  [ORGANIZATION_TYPES.CHURCH]: freezeProfile({
    id: 'church',
    activation: 'active',
    eligibleModules: CHURCH_MODULES,
  }),
  [ORGANIZATION_TYPES.MONASTERY]: freezeProfile({
    id: 'monastery',
    activation: 'active',
    eligibleModules: ALL_CURRENT_MODULES,
  }),
  [ORGANIZATION_TYPES.DIOCESE]: freezeProfile({
    id: 'diocese',
    activation: 'active',
    eligibleModules: ALL_CURRENT_MODULES,
  }),
});
const RESERVED_PROFILE = freezeProfile({
  id: 'reserved',
  activation: 'reserved',
  eligibleModules: [],
});
function organizationModuleProfile(organizationType) {
  return PROFILES[organizationType] || RESERVED_PROFILE;
}
function organizationTypeEligibleForModule(organizationType, moduleId) {
  return organizationModuleProfile(organizationType).eligibleModules.includes(moduleId);
}
export { ORGANIZATION_MODULES, organizationModuleProfile, organizationTypeEligibleForModule };
