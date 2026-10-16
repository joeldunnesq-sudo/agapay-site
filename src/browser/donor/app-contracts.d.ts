export interface DonorAppProfile extends AppHeaderDonorProfile {
  householdName?: string;
  donorName?: string;
  contactPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  pledgeAmountCents?: number;
  pledgeCadence?: string;
  defaultParish?: DonorAppParish | null;
}
export interface DonorAppParish extends DonorBookstoreParish {
  type?: string;
  givingPlusEnabled?: boolean;
  candlesEnabled?: boolean;
  designatedFundsEnabled?: boolean;
  pledgeTrackerEnabled?: boolean;
  directoryEnabled?: boolean;
  sacramentsEnabled?: boolean;
  campaigns?: DonorAppCampaign[];
  feastCampaigns?: DonorAppCampaign[];
}
export interface DonorAppFund extends ParishGivingOption {
  label?: string;
  note?: string;
}
export interface DonorAppCampaign {
  id: string;
  name?: string;
  campaignName?: string;
  enabled?: boolean;
  status?: string;
  destinationFundId?: string;
  amountCents?: number;
  goalAmountCents?: number;
  goalCents?: number;
  targetCents?: number;
  raisedCents?: number;
  currentCents?: number;
  donorGivenCents?: number;
  donorGiftCount?: number;
  coverPhotoUrl?: string;
  coverUrl?: string;
  imageUrl?: string;
  photoUrl?: string;
  photos?: (string | { url?: string })[];
  slug?: string;
  description?: string;
  feastId?: string;
  patronal?: boolean;
}
export interface DonorAppCommemoration extends DonorCommemoration {
  giftType?: string;
  living?: string[];
  departed?: string[];
  date?: string;
}
export interface DonorAppBilling {
  plan?: string;
  fullAccess?: boolean;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: string;
  currentPeriodEnd?: string;
  stripeSubscriptionId?: string;
}
export interface DonorAppNudge {
  id: string;
  fiscalYear: string;
  pledgeCents: number;
  givenCents: number;
  parishId: string;
  message?: string;
}
export interface DonorAppPayload extends DonorPagePayload {
  detail?: string;
  cursor?: string | null;
  donor?: DonorAppProfile;
  parish?: DonorAppParish | null;
  parishes?: DonorAppParish[];
  billing?: DonorAppBilling;
  fullAccess?: boolean;
  plan?: string;
  dashboard?: DonorAppPayload;
  termProgress?: { percent?: number; currentWeek?: number; totalWeeks?: number; label?: string };
  entries?: DonorAppCommemoration[];
  token?: string;
  resetUrl?: string;
  verificationUrl?: string;
  notifications?: DonorAppNudge[];
  paymentStatus?: string;
  status?: string;
  statements?: DonorAppStatement[];
}
export interface DonorAppStatement {
  id?: string;
  totalCents?: number;
  giftCount?: number;
  fiscalYear?: string | number;
  parishId?: string;
  parishName?: string;
  [key: string]: unknown;
}
export interface DonorAppError extends Error {
  status?: number;
  data?: DonorAppPayload;
}
export interface DonorAppOptions {
  force?: boolean;
  confirmed?: boolean;
  renderPledge?: boolean;
  syncGivingTier?: boolean;
  maxAgeMs?: number;
}
export interface DonorGiftOptions extends Record<string, unknown> {
  campaign?: string;
  fund?: string | null;
  amountCents?: number | string;
  kind?: string;
  frequency?: string;
}
export interface DonorStatusElement extends HTMLElement {
  bookstoreToastTimer?: number;
  bookstoreToastCleanupTimer?: number;
}
export type DonorTruthyFilter = <T>(value: T | null | undefined | false) => value is NonNullable<T>;

declare global {
  interface Window {
    agapaySelectedGivingParish?: DonorAppParish | null;
    __agapayDonorLoginControlsReady?: boolean;
    loginFromPage?: import('./app.js').DonorAppWindowHandlers['loginFromPage'];
    showDonorLogin?: import('./app.js').DonorAppWindowHandlers['showDonorLogin'];
    showDonorPasswordReset?: import('./app.js').DonorAppWindowHandlers['showDonorPasswordReset'];
    requestDonorPasswordReset?: import('./app.js').DonorAppWindowHandlers['requestDonorPasswordReset'];
    confirmDonorPasswordReset?: import('./app.js').DonorAppWindowHandlers['confirmDonorPasswordReset'];
  }
}

declare global {
  interface ParishGivingOption {
    note?: string;
  }
  interface DonorOffering {
    living?: string[];
    departed?: string[];
    date?: string;
    type?: string;
  }
}
