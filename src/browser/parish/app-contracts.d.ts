export interface ParishAppEntitlements {
  parishPlusActive?: boolean;
  parishPlusIncludedInTier?: boolean;
  givingFeatures?: {
    branding?: boolean;
    starterDesignatedFund?: boolean;
    annualStatements?: boolean;
    [key: string]: boolean | undefined;
  };
  modules?: Record<string, { included?: boolean; enabled?: boolean }>;
}
export interface ParishAppPriceBand {
  id: string;
  label?: string;
  standardMonthlyCents?: number | null;
  monthlyCents?: number | null;
}
export interface ParishAppTier {
  id: string;
  label?: string;
  monthlyCents?: number;
  householdPriced?: boolean;
  householdBands?: ParishAppPriceBand[];
}
export interface ParishAppAddOn {
  id: string;
  label?: string;
  standardMonthlyCents?: number;
  monthlyCents?: number;
}
export interface ParishAppIdentity extends Omit<ParishWorkspaceIdentity, 'entitlements' | 'sacramentPriests'> {
  parishId: string;
  parishName?: string;
  name?: string;
  entitlements?: ParishAppEntitlements;
  stewardshipActive?: boolean;
  subscriptionTier?: string;
  parishLifeAvailable?: boolean;
  sacramentsEnabled?: boolean;
  directoryEnabled?: boolean;
  communicationsEnabled?: boolean;
  subscriptionTiers?: ParishAppTier[];
  parishHouseholdBand?: string;
  parishPricingUsage?: {
    linkedUsers?: number;
    representedHouseholds?: number;
    trackingAvailable?: boolean;
    upgradeRequired?: boolean;
    nextBandLabel?: string;
    recommendedBandLabel?: string;
    nextThreshold?: number;
    remainingUntilNextBand?: number;
  };
  subscriptionAddOns?: string[];
  subscriptionAddOnCatalog?: ParishAppAddOn[];
  subscriptionStatus?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  subscriptionTrialStartedAt?: string;
  subscriptionTrialEndsAt?: string;
  subscriptionActivatedAt?: string;
  subscriptionTrialDays?: number;
  subscriptionIntroDemoEligible?: boolean;
  subscriptionMonthlyCents?: number;
  subscriptionTierLabel?: string;
  parishPlusIncludedInTier?: boolean;
  setup?: { billingActive?: boolean; [key: string]: unknown };
  onboarding?: { state?: string; [key: string]: unknown };
  state?: string;
  communityType?: string;
  sacramentPriests?: ParishAppPriest[];
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  jurisdiction?: string;
  logoUrl?: string;
  priestEmail?: string;
  treasurerEmail?: string;
  website?: string;
  taxEin?: string;
  taxLegalName?: string;
  parishPatronalFeastDate?: string;
  parishPatronalFeastName?: string;
  recurringGivingEnabled?: boolean;
  candlesEnabled?: boolean;
  commemorationsEnabled?: boolean;
  stripeAccountId?: string;
  stripeChargesEnabled?: boolean;
  feastCampaigns?: ParishGivingOption[];
}
export type ParishAppPriest = Partial<import('./sacrament-feature-contracts.js').ParishSacPriest>;
export interface ParishAppFeatureRequest {
  featureId: string;
  count?: number;
  [key: string]: unknown;
}
export interface ParishAppSettlementProfile {
  id: string;
  name: string;
  profileType: string;
  isActive?: boolean;
  isDefaultGiving?: boolean;
  isDefaultCommerce?: boolean;
  modules?: string[];
}
export interface ParishAppSettlementState {
  loaded: boolean;
  loading: boolean;
  profiles: ParishAppSettlementProfile[];
  profileTypes: string[];
  stewardshipActive: boolean;
}
export interface ParishAppClaim {
  status?: string;
  createdAt?: string;
  expirationDate?: string;
  jurisdiction?: string;
  maskedCertificateNumber?: string;
  rejectionReason?: string;
  replacementReason?: string;
  revocationReason?: string;
}
export interface ParishAppVolume {
  connected?: boolean;
  scan?: { complete?: boolean };
  donationPercent?: number;
  thresholdPercent?: number;
  donationNetCents?: number;
  nonDonationNetCents?: number;
  unclassifiedNetCents?: number;
  note?: string;
}
export interface ParishAppNonprofit {
  status?: string;
  stripeAccountId?: string;
  attestedByName?: string;
  attestedByTitle?: string;
  einLastFour?: string;
  stripeEffectiveDate?: string;
  stripeSupportCaseId?: string;
  readiness?: {
    measurementComplete?: boolean;
    measuredAtOrAbove80?: boolean;
    attestationComplete?: boolean;
    hasNonprofitProof?: boolean;
    readyToSubmit?: boolean;
  };
  confirmations?: {
    accountOwnerSubmission?: boolean;
    over80Percent?: boolean;
    registeredNonprofit?: boolean;
    taxDeductibleDonations?: boolean;
  };
  documents?: { id: string; isCurrent?: boolean; documentType: string; filename?: string; [key: string]: unknown }[];
}
export interface ParishAppPayload extends Record<string, unknown> {
  error?: string;
  detail?: string;
  mfaRequired?: boolean;
  resetUrl?: string;
  parishId?: string;
  parishToken?: string;
  token?: string;
  identityEmail?: string;
  profiles?: ParishAppSettlementProfile[];
  profileTypes?: string[];
  stewardshipActive?: boolean;
  subscriptionStatus?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  subscriptionTrialStartedAt?: string;
  subscriptionTrialEndsAt?: string;
  parish?: ParishAppIdentity;
  onboarding?: ParishAppIdentity['onboarding'];
  recovered?: boolean;
  claim?: ParishAppClaim;
  hasDocument?: boolean;
  hasNoStatewideGeneralSalesTax?: boolean;
  guidance?: string;
  onboardingUrl?: string;
  registration?: ParishAppIdentity;
  checkoutUrl?: string;
  volume?: ParishAppVolume;
  application?: ParishAppNonprofit;
  portalUrl?: string;
  ticket?: { email?: { status?: string } };
}
export interface ParishAppOptions {
  quiet?: boolean;
  force?: boolean;
  [key: string]: unknown;
}
export interface ParishAppPicker {
  tierSelectId: string;
  bandSelectId: string;
  groupId: string;
  summaryId: string;
}
export type ParishAppTruthyFilter = <T>(value: T | null | undefined | false) => value is NonNullable<T>;
export interface ParishAppError extends Error {
  status?: number;
  data?: ParishAppPayload;
}

export type ParishAppSettingsPayload = Partial<ParishAppIdentity> & {
  newDashboardPassword?: string;
  givingCatalogChanged?: boolean;
  accountingCatalogChanged?: boolean;
};
export interface ParishAppGivingFeature extends ParishRegisteredFeature {
  init(): unknown;
  renderOverview(): unknown;
  renderOptions(): unknown;
}
export interface ParishAppStewardshipFeature extends ParishRegisteredFeature {
  getStatus(): { legacyAddOnActive?: boolean; includedInParishTier?: boolean; status?: string };
  renderMeetings(active: boolean): unknown;
}
export interface ParishAppAccountingFeature extends ParishRegisteredFeature {
  activate?(): unknown;
}
declare global {
  const defaultSacramentServiceTypes: import('./features/sacraments.js').ParishSacDefaultServices;
}
