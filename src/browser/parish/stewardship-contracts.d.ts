// Consumed Stewardship workspace, chart and meeting contracts.
interface ParishWorkspaceIdentity {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  jurisdiction?: string;
}
interface StewardshipComp {
  expiresAt: string;
}
interface StewardshipSubscription {
  status?: string;
  active?: boolean;
  comp?: StewardshipComp;
  includedInParishTier?: boolean;
}
interface StewardshipMeetingItem extends Record<string, unknown> {
  title?: string;
  durationMinutes?: number;
  reportType?: string;
  body?: string;
  createdBy?: string;
  fundName?: string;
  beginningBalanceCents?: number;
  totalReceivedCents?: number;
  totalDisbursedCents?: number;
  endingBalanceCents?: number;
  fullName?: string;
  position?: string;
  bio?: string;
  nominatedBy?: string;
  resolvedText?: string;
}
interface StewardshipMeeting {
  id: string;
  title?: string;
  fiscalYear: number;
  meetingDate?: string;
  meetingTime?: string;
  location?: string;
  parishNameOverride?: string;
  jurisdiction?: string;
  address?: string;
  signatureLineCount?: number;
  noteLineCount?: number;
  status?: string;
  agendaItems: StewardshipMeetingItem[];
  reports: StewardshipMeetingItem[];
  restrictedFunds: StewardshipMeetingItem[];
  nominees: StewardshipMeetingItem[];
  resolutions: StewardshipMeetingItem[];
  financialSummary?: { totalIncomeCents: number; totalExpenseCents: number; netCents: number; notes?: string };
}
interface StewardshipWorkspaceState {
  loaded: boolean;
  stewardship: StewardshipSubscription | null;
  meetings: StewardshipMeeting[];
  selectedMeeting: StewardshipMeeting | null;
  subscribePlans?: unknown[];
  setupRequired?: boolean;
  comingSoon?: boolean;
}
interface StewardshipWorkspaceResponse {
  error?: string;
  stewardship?: StewardshipSubscription;
  meetings?: StewardshipMeeting[];
  meeting: StewardshipMeeting;
  subscribePlans?: unknown[];
  setupRequired?: boolean;
  comingSoon?: boolean;
  checkoutUrl?: string;
  portalUrl?: string;
}
interface StewardshipAttendancePoint {
  weekOf: string;
  headcount: number | null;
}
interface StewardshipAttendanceData {
  error?: string;
  points?: StewardshipAttendancePoint[];
  summary?: {
    latestHeadcount?: number | null;
    eightWeekAverage?: number | null;
    eightWeekChangePct: number | null;
    reportingCoveragePct?: number | null;
    latestWeekOf?: string;
    weeksReported?: number;
    expectedWeeks?: number;
  };
  delegateOptions?: { id: string; name: string }[];
  delegate?: { ministryId?: string; ministryName?: string };
  range?: { startWeekOf?: string; endWeekOf?: string };
}
interface StewardshipInsight {
  error?: string;
  detail?: string;
  tiers?: { count: number; label: string }[];
  total_donors?: number;
  fiscal_year?: number;
  retention_rate_pct?: number | null;
  retained?: number;
  new_donors?: number;
  lapsed?: number;
  prior_year?: number;
  prior_donors?: number;
  score?: number | null;
  components?: { key: string; label: string; score: number }[];
  status?: string;
  risk_level?: string;
  top10_pct?: number | null;
  top5_pct?: number | null;
  pct_of_total_giving_recurring?: number | null;
  recurring_donor_count?: number;
  monthly_recurring_revenue_cents?: number;
  avg_recurring_gift_cents?: number;
  failed_payments_90d: number;
  canceled_gifts_90d: number;
}
interface StewardshipMetricsResponse extends StewardshipAttendanceData, StewardshipInsight {
  headcount: number;
  weekOf: string;
}
interface StewardshipGivingResponse extends StewardshipSummaryView, StewardshipFundsView {
  detail?: string;
  total_cents?: number;
}
interface StewardshipSnapshotView {
  version?: number;
  updatedAt?: string;
}
interface StewardshipFinancialTotals {
  totalIncomeCents: number;
  totalExpenseCents: number;
  netCents: number;
  fiscalYear?: number;
}
interface StewardshipFinancialData {
  error?: string;
  message?: string;
  note?: string;
  meetings?: StewardshipMeeting[];
  snapshot?: StewardshipSnapshotView;
  totals?: StewardshipFinancialTotals;
  contributionTotals?: { agapayContributionsCents?: number; outsideContributionsCents?: number };
  agapayRestrictedFunds?: StewardshipRestrictedFund[];
  externalAssets?: StewardshipExternalAsset[];
  priorYear?: StewardshipFinancialTotals;
  revisions?: (StewardshipFinancialTotals & { version: number; createdAt: string })[];
  platformCosts?: { processing: { annual: { actualStripeFeeCents: number } }; service: { totalCents: number } };
  automaticCostsIncluded?: boolean;
}
interface StewardshipAccountingSummary {
  available: boolean;
  reason?: string;
  startDate?: string;
  endDate?: string;
  totalIncomeCents?: number;
  totalExpenseCents?: number;
  netCents?: number;
  restrictedFunds?: {
    fundName: string;
    beginningBalanceCents: number;
    totalReceivedCents: number;
    totalDisbursedCents: number;
    endingBalanceCents: number;
  }[];
  expenseLines?: { accountNumber: string; accountName: string; amount: number }[];
}
declare function isParishPlusActive(): boolean;
declare function checkNudgeEligibility(): unknown;
declare function renderGivingMetrics(
  summary: StewardshipSummaryView,
  funds: StewardshipFundsView,
  year: number
): string;
declare function renderStewardshipReadiness(): unknown;
declare const parishSessionStorageKey: string;
