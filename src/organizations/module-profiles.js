import { ORGANIZATION_TYPES } from './types.js';

export const ORGANIZATION_MODULES = Object.freeze({
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
// Monasteries and dioceses already travel through today's parish subscription
// contracts. Keep their structural eligibility behavior-preserving until a
// product-specific catalog replaces this compatibility profile.
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

export function organizationModuleProfile(organizationType) {
  return PROFILES[organizationType] || RESERVED_PROFILE;
}

export function organizationTypeEligibleForModule(organizationType, moduleId) {
  return organizationModuleProfile(organizationType).eligibleModules.includes(moduleId);
}
