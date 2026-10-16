export interface AdminAppRegistration extends AdminPresentationRegistration {
  internalCanary?: boolean;
  healthStatus?: string;
  email?: string;
  plan?: string;
  createdAt?: string;
  addressLine1?: string;
  addressLine2?: string;
  adminAuditLog?: AdminAppAuditEvent[];
  adminNotificationEmailStatus?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingCountry?: string;
  billingLegalName?: string;
  billingPostalCode?: string;
  billingState?: string;
  bishopOrAuthority?: string;
  campaigns?: ParishGivingOption[];
  candlesEnabled?: boolean;
  city?: string;
  commemorationsEnabled?: boolean;
  communityType?: string;
  country?: string;
  dashboardInviteEmailRecipients?: string;
  dashboardInviteEmailSentAt?: string;
  dashboardInviteEmailStatus?: string;
  dioceseOrDeanery?: string;
  emailLog?: AdminAppAuditEvent[];
  funds?: ParishGivingOption[];
  givingStatus?: string;
  jurisdiction?: string;
  liturgicalCalendar?: string;
  notes?: string;
  notesHistory?: AdminAppAuditEvent[];
  onboardingAccess?: { treasurer?: { status?: string; email?: string; lastSeenAt?: string } };
  onboardingChecks?: Record<string, AdminAppOnboardingCheck>;
  onboardingTestMode?: boolean;
  onboardingWorkflow?: AdminAppWorkflow;
  parishDashboardPasswordRecord?: string;
  parishDashboardToken?: string;
  parishHouseholdBand?: string;
  parishId?: string;
  parishName?: string;
  platformFee?: string;
  postalCode?: string;
  priestEmail?: string;
  priestFirst?: string;
  priestLast?: string;
  priestPhone?: string;
  receivedAt?: string;
  recurringGivingEnabled?: boolean;
  reference?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerNotes?: string;
  sacramentsEnabled?: boolean;
  state?: string;
  status?: string;
  stripeAccountId?: string;
  stripeAccountStatus?: string;
  stripeAccountUpdatedAt?: string;
  stripeChargesEnabled?: boolean;
  stripeCustomerId?: string;
  stripeOnboardingEmailSentAt?: string;
  stripeOnboardingEmailStatus?: string;
  stripePayoutsEnabled?: boolean;
  stripeStatusUpdatedAt?: string;
  stripeSubscriptionId?: string;
  subscriptionMonthlyCents?: number;
  subscriptionStatus?: string;
  subscriptionTier?: string;
  subscriptionUpdatedAt?: string;
  treasurerEmail?: string;
  treasurerFirst?: string;
  treasurerLast?: string;
  updatedAt?: string;
  verificationSource?: string;
  website?: string;
}
export interface AdminAppError extends Error {
  code?: string;
}
export interface AdminAppMonth {
  newSubscriptions?: number;
  month?: number;
  label?: string;
  registered?: number;
  verified?: number;
  ytdDonationsCents?: number;
  giftCount?: number;
  active?: number;
  trialing?: number;
  cancellations?: number;
  monthlyRecurringCents?: number;
}
export interface AdminAppSummary extends Partial<Omit<AdminPlatformSummary, 'monthly'>> {
  monthly?: AdminAppMonth[];
  overviewMetrics?: AdminOverviewMetrics;
  donationError?: string;
  revenue?: AdminAppRevenue;
  error?: string;
  ytdCents?: number;
  dataSource?: string;
  lastGiftAt?: string;
}
export interface AdminAppRevenueProduct {
  label?: string;
  monthlyCents?: number;
  activeCount?: number;
  trialingCount?: number;
}
export interface AdminAppRevenue {
  subscriptionRevenue?: {
    products?: AdminAppRevenueProduct[];
    monthLabel?: string;
    note?: string;
    totalMonthlyCents?: number;
  };
  donationFeeRevenue?: {
    agapayFeeCents?: number;
    connectedAccounts?: number;
    giftCount?: number;
    grossGiftCents?: number;
    monthLabel?: string;
    note?: string;
  };
}
export interface AdminAppScholarship {
  id?: string;
  code?: string;
  label?: string;
  percentOff?: number;
  maxRedemptions?: number;
}
export interface AdminAppModeration {
  counts?: Record<string, number>;
  resources?: AdminAppResource[];
}
export interface AdminAppResource {
  category?: string;
  resourceType?: string;
  mediaType?: string;
  ageRange?: string;
  tags?: string[];
  pinned?: boolean;
  id?: string;
  status?: string;
  title?: string;
  url?: string;
  description?: string;
  submittedBy?: string;
  createdAt?: string;
  flags?: { reason?: string }[];
  vetted?: boolean;
  source?: string;
}
export interface AdminAppFeedback {
  userNotification?: { status?: string };
  counts?: Record<string, number>;
  suggestions?: AdminAppSuggestion[];
}
export interface AdminAppSuggestion {
  id?: string;
  status?: string;
  subject?: string;
  message?: string;
  submittedBy?: string;
  familyName?: string;
  page?: string;
  createdAt?: string;
  consideredBy?: string;
  consideredAt?: string;
  userNotification?: { status?: string };
}
export interface AdminAppTicket extends AdminAppSuggestion {
  type?: string;
  source?: string;
  email?: { status?: string };
  userNotification?: { status?: string };
  parishName?: string;
  parishId?: string;
  adminNote?: string;
  updatedBy?: string;
}
export interface AdminAppResult {
  artifactReference?: string;
  departedCount?: number;
  entryCount?: number;
  livingCount?: number;
  message?: string;
  orderCount?: number;
  parishId?: string;
  parishName?: string;
  parishNetCents?: number;
  reason?: string;
  status?: string;
  taxCents?: number;
  to?: string;
  tone?: string;
  totalChargedCents?: number;
  verificationType?: string;
  verifiedAt?: string;
}
export interface AdminAppDeploymentCheck {
  configured?: boolean;
  evidence?: unknown;
  note?: string;
  ok?: boolean;
  status?: string;
}
export interface AdminAppOptions {
  sendDashboardInvite?: boolean;
  includeReviewerNotes?: boolean;
  preserveSelection?: boolean;
  noScroll?: boolean;
  trialDays?: number;
  silent?: boolean;
  force?: boolean;
  autosave?: boolean;
  refresh?: boolean;
}
export interface AdminAppAuditEvent {
  name?: string;
  church?: string;
  sub?: string;
  label?: string;
  time?: string;
  at?: string;
  actor?: string;
  details?: Record<string, unknown>;
  type?: string;
  status?: string;
  to?: string;
  sentAt?: string;
  detail?: string;
  author?: string;
  text?: string;
  action?: string;
  actorType?: string;
  actorUserId?: string;
  after?: unknown;
  before?: unknown;
  createdAt?: string;
  organizationId?: string;
  reason?: string;
  targetId?: string;
  targetType?: string;
}
export interface AdminAppOnboardingCheck {
  evidence?: string;
  status?: string;
  note?: string;
  passed?: boolean;
  checkedAt?: string;
}
export interface AdminAppWorkflow {
  enabled?: boolean;
  completedSteps?: number;
  totalSteps?: number;
  signoff?: { status?: string; signerName?: string; signedAt?: string; signedBy?: string };
  blockers?: { key: string; title?: string; detail?: string }[];
  canGoLive?: boolean;
  state?: string;
  updatedAt?: string;
  steps?: { key: string; title?: string; detail?: string; passed?: boolean }[];
  checks?: Record<string, AdminAppOnboardingCheck>;
}
export interface AdminAppInvite {
  detail?: string;
  sent?: boolean;
  status?: string;
  email?: string;
  recipients?: string[];
  error?: string;
}
export interface AdminAppAccountingHealth {
  status?: string;
  findings?: unknown[];
  activeWork?: number;
  disclaimer?: string;
  protectiveState?: { state?: string; version?: number; safeSummary?: string };
}
export interface AdminAppIntegrityScan {
  checksFailed?: number;
  checksPassed?: number;
  completedAt?: string;
  criticalFindingCount?: number;
  findingCount?: number;
  scanType?: string;
  scope?: string;
  startedAt?: string;
  status?: string;
}
export interface AdminAppProductCard {
  slug: string;
  title: string;
  status: string;
  statusTone?: string;
  metric: string;
  metricLabel: string;
  body: string;
  action: string;
  tab: string;
}
export interface AdminAppPayload extends Record<string, unknown> {
  health?: AdminAppAccountingHealth;
  result?: { sent?: number };
  totals?: Record<string, number>;
  parishes?: AdminAppNonprofitParish[];
  scans?: AdminAppIntegrityScan[];
  verifications?: AdminAppResult[];
  releaseStatus?: { featureFlags?: Record<string, boolean> };
  remaining?: number;
  claimed?: number;
  limit?: number;
  comp?: { expiresAt?: string };
  title?: string;
  authenticated?: { actor?: string; token?: string };
  checkoutUrl?: string;
  error?: string;
  message?: string;
  detail?: string;
  ok?: boolean;
  mfaRequired?: boolean;
  token?: string;
  actor?: string;
  environment?: string;
  targets?: AdminAppRegistration[];
  registration?: AdminAppRegistration;
  registrations?: AdminAppRegistration[];
  summary?: AdminAppSummary;
  learn?: AdminAppPayload;
  events?: AdminAppAuditEvent[];
  feedback?: AdminAppFeedback;
  scholarship?: AdminAppScholarship;
  scholarships?: AdminAppScholarship[];
  communityModeration?: AdminAppModeration;
  feedbackQueue?: AdminAppFeedback;
  subscriptions?: {
    counts?: Record<string, number>;
    monthly?: AdminAppMonth[];
    monthlyRecurringCents?: number;
    recent?: AdminAppRegistration[];
    totalRecords?: number;
    year?: number;
  };
  tickets?: AdminAppTicket[];
  counts?: Record<string, number>;
  dashboardInvite?: AdminAppInvite;
  cursor?: string;
  hasMore?: boolean;
  results?: AdminAppResult[];
  sessionsInvalidated?: boolean;
  dryRun?: boolean;
  recipient?: string;
  email?: AdminAppInvite;
  stagingPassword?: string;
  recovered?: boolean;
  resource?: AdminAppResource;
}

export interface AdminAppNonprofitParish {
  parishName?: string;
  parishId?: string;
  applicationStatus?: string;
  risk?: {
    thresholdExposurePercent?: number;
    riskBand?: string;
    classifiedNonDonationPercent?: number;
    headroomPercent?: number;
    additionalNonDonationCapacityCents?: number;
    thresholdExposureCents?: number;
  };
  volume?: {
    donationPercent?: number;
    donationNetCents?: number;
    nonDonationNetCents?: number;
    unclassifiedNetCents?: number;
    totalNetCents?: number;
    scan?: { complete?: boolean; lastCompletedAt?: string };
  };
}

export interface AdminAppDeploymentHealth {
  ok?: boolean;
  version?: string;
  deployedAt?: string;
  environment?: string;
  checks?: Record<string, AdminAppDeploymentCheck | boolean | string | undefined>;
}
