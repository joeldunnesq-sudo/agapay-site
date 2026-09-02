import { ORGANIZATION_SUBTYPES, ORGANIZATION_TYPES } from './types.js';

function freezeTerms(terms) {
  return Object.freeze({ ...terms });
}

export const TERMINOLOGY_PROFILES = Object.freeze({
  parish: freezeTerms({
    id: 'parish',
    organization: 'parish',
    organizationPlural: 'parishes',
    member: 'parishioner',
    memberPlural: 'parishioners',
    primaryLeader: 'priest',
    financeLeader: 'treasurer',
    fundraising: 'stewardship',
    donation: 'gift',
  }),
  mission: freezeTerms({
    id: 'mission',
    organization: 'mission',
    organizationPlural: 'missions',
    member: 'parishioner',
    memberPlural: 'parishioners',
    primaryLeader: 'priest',
    financeLeader: 'treasurer',
    fundraising: 'stewardship',
    donation: 'gift',
  }),
  cathedral: freezeTerms({
    id: 'cathedral',
    organization: 'cathedral',
    organizationPlural: 'cathedrals',
    member: 'parishioner',
    memberPlural: 'parishioners',
    primaryLeader: 'clergy administrator',
    financeLeader: 'treasurer',
    fundraising: 'stewardship',
    donation: 'gift',
  }),
  monastery: freezeTerms({
    id: 'monastery',
    organization: 'monastery',
    organizationPlural: 'monasteries',
    member: 'community member',
    memberPlural: 'community members',
    primaryLeader: 'abbot or abbess',
    financeLeader: 'finance contact',
    fundraising: 'support',
    donation: 'gift',
  }),
  diocese: freezeTerms({
    id: 'diocese',
    organization: 'diocese',
    organizationPlural: 'dioceses',
    member: 'member',
    memberPlural: 'members',
    primaryLeader: 'hierarch',
    financeLeader: 'finance administrator',
    fundraising: 'stewardship',
    donation: 'gift',
  }),
  organization: freezeTerms({
    id: 'organization',
    organization: 'organization',
    organizationPlural: 'organizations',
    member: 'member',
    memberPlural: 'members',
    primaryLeader: 'authorized representative',
    financeLeader: 'finance administrator',
    fundraising: 'fundraising',
    donation: 'contribution',
  }),
});

export function terminologyProfileForClassification(classification = {}) {
  if (classification.organizationType === ORGANIZATION_TYPES.MONASTERY) return TERMINOLOGY_PROFILES.monastery;
  if (classification.organizationType === ORGANIZATION_TYPES.DIOCESE) return TERMINOLOGY_PROFILES.diocese;
  if (classification.organizationType !== ORGANIZATION_TYPES.CHURCH) return TERMINOLOGY_PROFILES.organization;
  if (classification.organizationSubtype === ORGANIZATION_SUBTYPES.MISSION) return TERMINOLOGY_PROFILES.mission;
  if (classification.organizationSubtype === ORGANIZATION_SUBTYPES.CATHEDRAL) return TERMINOLOGY_PROFILES.cathedral;
  return TERMINOLOGY_PROFILES.parish;
}
