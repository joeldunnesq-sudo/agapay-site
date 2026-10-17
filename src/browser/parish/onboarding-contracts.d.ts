// Existing dashboard and onboarding JSON shapes consumed by the setup controller.
interface ParishGivingOption {
  description?: string;
  active?: boolean;
  donorVisible?: boolean;
  givingEnabled?: boolean;
  restrictionType?: string;
  code?: string | null;
  reportCode?: string;
  isDefault?: boolean;
  destinationFundId?: string;
  accountingFundId?: string;
}
interface ParishOnboardingWorkflow {
  enabled?: boolean;
  state?: string;
  materialVersion?: string;
  updatedAt?: string;
  canGoLive?: boolean;
  accountingSetupRequired?: boolean;
  stripe?: { checkedAt?: string; ready?: boolean; connected?: boolean };
  parishStages?: { key: string; title: string; detail?: string; passed?: boolean }[];
  steps?: { key: string; passed?: boolean }[];
  blockers?: { key: string }[];
  checks?: Record<string, { note?: string }>;
  summary?: ParishOnboardingSummary;
}
interface ParishOnboardingSummary {
  treasurerEmail?: string;
  givingUrl?: string;
  organization?: { publicName?: string; legalReceiptName?: string };
  stripe?: {
    payoutBankName?: string;
    payoutBankLast4?: string;
    accountId?: string;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
  };
  plan?: {
    status?: string;
    totalMonthlyCents?: number | null;
    monthlyCents?: number;
    trialEndsAt?: string;
    addOns?: { label: string; monthlyCents: number }[];
    modules?: string[];
    transactionRateLabel?: string;
    label?: string;
    id?: string;
  };
  giving?: {
    designatedFunds?: ParishGivingOption[];
    campaigns?: ParishGivingOption[];
    feastCampaigns?: ParishGivingOption[];
    generalFunds?: ParishGivingOption[];
    recurringGivingEnabled?: boolean;
  };
  receipt?: { legalName?: string; contact?: string };
}
interface ParishWorkspaceIdentity {
  onboarding?: ParishOnboardingWorkflow;
  recurringGivingEnabled?: boolean;
  candlesEnabled?: boolean;
  setup?: { stripeConnected?: boolean; billingActive?: boolean };
  subscriptionIntroDemoEligible?: boolean;
  subscriptionStatus?: string;
}
declare function hasGivingPlusAccess(): boolean;
declare const fallbackFundsArray: import('./app-session-and-navigation.js').ParishAppPart1['fallbackFundsArray'];
declare function isGeneralDashboardFund(fund: ParishGivingOption): boolean;
declare function isCandleDashboardFund(fund: ParishGivingOption): boolean;
declare function slugifyLocal(value: string): string;
declare function givingCatalogSnapshot(): string;
declare let givingCatalogBaseline: string;
declare function accountingCatalogSnapshot(): string;
declare let accountingCatalogBaseline: string;
declare function tierOptionsMarkup(tier?: string): string;
declare function setupCheckMarkup(): string;
declare function parishHouseholdPickerMarkup(options: {
  tierSelectId: string;
  bandSelectId: string;
  groupId: string;
  summaryId: string;
}): string;
declare function syncParishHouseholdPricing(tier: string, band: string, group: string, summary: string): void;
interface ParishOnboardingResponse {
  error?: string;
  message?: string;
  detail?: string;
  code: string;
  errors?: string[];
  onboarding?: ParishOnboardingWorkflow;
  parish?: Partial<ParishWorkspaceIdentity>;
}

interface GivingSetupDraft {
  general: ParishGivingOption & { name: string; description: string };
  designatedFunds: ParishGivingOption[];
  campaigns: ParishGivingOption[];
  recurringGivingEnabled: boolean;
  candlesEnabled: boolean;
  importDecision: string;
}

interface ParishWorkspaceIdentity {
  dedicatedGivingUrl?: string;
}
