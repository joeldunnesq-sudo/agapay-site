// Contracts for legacy classic-script APIs. These declarations do not validate server JSON.
interface ParishFeatureDefinition {
  load(...args: unknown[]): unknown;
  [lifecycle: string]: unknown;
}
interface ParishRegisteredFeature extends ParishFeatureDefinition {
  readonly id: string;
}
interface ParishFeatureRegistryApi {
  register(id: string, definition: ParishFeatureDefinition): Readonly<ParishRegisteredFeature>;
  get(id: unknown): Readonly<ParishRegisteredFeature> | null;
  list(): Readonly<ParishRegisteredFeature>[];
}
interface ParishDiagnosticEntry {
  operation: string;
  type: string;
  status: number | null;
  time: string;
  stackSource: string;
  frames: readonly string[];
}
interface ParishDiagnosticError {
  stack?: unknown;
  status?: number;
  name?: string;
}
interface ParishMfaResult extends Record<string, unknown> {
  token?: string;
  parishToken?: string;
  parishId?: string;
  identityEmail?: string;
}
interface Window {
  ParishFeatureRegistry: ParishFeatureRegistryApi;
  ParishDashboardFeatures?: Record<string, Readonly<ParishRegisteredFeature>>;
  AgapayDiagnostics: { report(error: unknown, operation: unknown): string; recent(): ParishDiagnosticEntry[] };
  AgapayMfa: {
    installFetchStepUp(): void;
    isSupported(): boolean;
    runFlow(
      input: Record<string, unknown>,
      options?: { displayName?: string; enrollmentMethod?: 'totp'; required?: boolean }
    ): Promise<ParishMfaResult>;
  };
  addParishAuthenticator(button: HTMLButtonElement): Promise<void>;
}
declare function setStatus(message: string, tone?: string): void;
declare function showParishAuthForm(id: string): void;

interface ParishWorkspaceIdentity {
  name?: string;
  campaigns?: readonly ParishGivingOption[];
  givingStatus?: string;
  stripeAccountStatus?: string;
  libraryEnabled?: boolean;
  bookstoreEnabled?: boolean;
}
interface ParishLibraryContext {
  force?: boolean;
  parishId: string;
  headers(): Record<string, string>;
  notify(message: string, tone?: string): void;
  onSettingsChanged?(enabled: boolean): void;
}
interface Window {
  ParishLibraryAdmin?: { load(context: ParishLibraryContext): unknown };
}
declare const activeTab: string;
declare function moduleIncluded(module: string): boolean;
declare function syncTierRequirementNavigation(module: string, label: string, included: boolean): void;
declare function syncModuleStatusNavigation(module: string, included: boolean, enabled: boolean): void;
declare function loadSettlementProfilesPanel(): unknown;
interface StewardshipFeeBucketView {
  label: string;
  actualStripeFeeCents: number;
  donorFundedStripeFeeCents: number;
  parishFundedStripeFeeCents: number;
  donorFeeContributionCents: number;
  confirmedCount: number;
  pendingCount: number;
  estimatedStripeFeeCents: number;
  excessCoverageCents: number;
  refundedCents: number;
}
interface StewardshipFeeReportView {
  year: number;
  currency: string;
  annual: StewardshipFeeBucketView;
  quarterly: StewardshipFeeBucketView[];
  monthly: StewardshipFeeBucketView[];
  excludedCurrencyCount?: number;
}

interface ParishGivingOption {
  slug?: string;
}
interface ParishBookstoreProduct extends Record<string, unknown> {
  id?: string;
  status?: string;
}
interface ParishBookstoreCatalogState {
  loaded: boolean;
  products: ParishBookstoreProduct[];
  lowStockProducts: ParishBookstoreProduct[];
  countSessions: ParishBookstoreCountSession[];
  starterCatalog: ParishBookstoreStarterGroup[];
}
interface ParishCommerceKpis {
  netCents?: number;
  taxCents?: number;
  grossCents?: number;
  orderCount?: number;
  uniqueCustomers?: number;
  repeatCustomers?: number;
  unitsSold?: number;
}
interface ParishCommerceOrder {
  donorName?: string;
  summary?: string;
  createdAt?: string;
  grossCents?: number;
}
declare let dashboardLoadPromise: Promise<void> | null;
declare let parishFeatureRequests: Record<string, unknown>[];
declare function refreshSubscriptionStatus(options: { quiet: boolean }): Promise<unknown>;
declare function refreshStripeStatus(options: { quiet: boolean }): Promise<unknown>;
declare function saveSession(): void;
declare function renderDashboard(): void;
declare function switchTab(tab: 'sacraments' | 'stewardship' | 'accounting'): void;
declare function setSacramentsDashboardTab(tab: 'calendar'): void;
declare function showParishFeatureRequestPopup(items: Record<string, unknown>[]): void;
declare function updateStewardshipBadges(included: boolean, options: { renderPanel: boolean }): void;
declare function loadRegisteredParishFeature(id: string, force?: boolean): unknown;

interface Window {
  registrationRetryKey(): string;
  finishRegistrationRetry(): void;
  registrationError(message: string, fieldId: string): false;
  registrationEmailValid(value: unknown): boolean;
  clearRegistrationDraft(): void;
  goToStep(step: number): void;
  showOrganizationFlow(type: string): void;
  updateHouseholdBandVisibility(): void;
}

interface ParishStaffMember {
  id: string;
  status: string;
  displayName?: string;
  email?: string;
  roleTemplate?: string;
  expiresAt?: string;
}
interface ParishStaffResponse {
  error?: string;
  memberships?: ParishStaffMember[];
  invitations?: ParishStaffMember[];
  token: string;
  emailStatus?: string;
}
interface ParishNudgePreview {
  error?: string;
  thresholdActive?: boolean;
  year?: number;
  sent?: number;
  behind?: { donorEmail: string; pledgeCents: number; givenCents: number; expectedCents: number }[];
}
interface StewardshipSummaryView {
  total_pledged_cents: number;
  total_actual_cents: number;
  run_rate_cents: number;
  day_of_year: number;
  days_in_year: number;
  prior_year_actual_cents?: number;
  active_donors?: number;
  pledging_donors?: number;
  avg_per_donor_cents?: number;
}
interface StewardshipFundsView {
  error?: string;
  funds?: { total_cents: number; fund_name: string }[];
}
interface DiocesanStatisticsView {
  year?: number;
  attendance?: { status?: string; averageWeeklyAttendance?: number; weeksReported?: number };
  membership?: Record<string, number>;
  sacraments?: Record<string, number>;
  giving?: { totalActualCents?: number; activeDonors?: number };
  manualAdditions?: Record<string, number | null>;
  automaticTotals?: Record<string, number>;
}

interface StewardshipRestrictedFund {
  id?: string;
  code?: string;
  name?: string;
  receivedCents?: number;
  agapayReceivedCents?: number;
  outsideReceivedCents?: number;
  openingBalanceCents?: number;
  deductionsCents?: number;
  endingBalanceCents?: number;
  adjustmentNotes?: string;
}
interface StewardshipExternalAsset {
  assetType?: string;
  name?: string;
  valueCents?: number;
  asOfDate?: string;
  notes?: string;
}
interface StewardshipSnapshotView {
  id?: string;
  title?: string;
  importedFromAccountingAt?: string;
  otherRevenueCents?: number;
  enteredExpenseCents?: number;
  totalExpenseCents?: number;
  automaticCostsExcluded?: boolean;
  notes?: string;
}
declare function isParishTier(): boolean;
interface StewardshipManualEntry {
  id: string;
  entryDate: string;
  sourceLabel?: string;
  source: string;
  fundCode?: string;
  amountCents: number;
  batchReference?: string;
  notes?: string;
}
interface StewardshipManualForm extends HTMLFormElement {
  elements: HTMLFormControlsCollection & {
    sourceLabel: HTMLInputElement;
    amountCents: HTMLInputElement;
    [name: string]: HTMLInputElement | HTMLSelectElement;
  };
}

interface ParishPortabilityContext {
  parishId: string;
  headers(): Record<string, string>;
}
interface ParishPortabilityClosure {
  available: boolean;
  blockers: { message: string }[];
}
interface ParishPortabilityJob {
  id: string;
  status: string;
  mode: string;
  expiresAt: number;
  createdAt: number;
  rowCount: number;
  archiveBytes: number;
  archiveSha256: string;
  errorCode?: string;
  confirmedAt?: number;
  diagnostic?: { stage?: string; failedSafeguard?: string };
  closure: ParishPortabilityClosure;
}
interface ParishPortabilityState {
  error?: string;
  enabled: boolean;
  cloud: { backedUpAt?: string; status?: string };
  jobs: ParishPortabilityJob[];
  job: ParishPortabilityJob;
  receipt?: ParishPortabilityJob;
  policyVersion: string;
  disclosure: { approvalRequired: boolean; sections: { title: string; text: string }[] };
  closure: ParishPortabilityClosure;
}
interface Window {
  ParishBackup: { mount(context: ParishPortabilityContext & { element: HTMLElement }): void };
  ParishRecovery?: ParishRecoveryApi;
  ParishPortability: { open(context: ParishPortabilityContext): Promise<void> };
}
interface ParishLibraryResource {
  id: string;
  status: string;
  pinned: boolean;
  resourceType: string;
  title: string;
  description: string;
  category: string;
  fileReady: boolean;
  fileName?: string;
  expiresAt?: string;
  url?: string;
}
interface ParishLibraryResponse {
  error?: string;
  resources?: ParishLibraryResource[];
  resource: ParishLibraryResource;
  settings: { enabled: boolean };
}

interface GivingBoxApi {
  readonly version: string;
  mount(container: Element): HTMLIFrameElement | null;
  scan(root?: Document | HTMLElement): void;
  refreshTheme(): void;
}
interface Window {
  AGAPAYGivingBox?: GivingBoxApi;
  AGAPAYCampaignEmbed: Readonly<{ shareUrl: string }>;
  loadParishRelationships(): Promise<void>;
}
interface RelationshipParish {
  reference: string;
  name: string;
  attention: { tone: string; label: string } | null;
  occasions: { date: string; title: string; kind: string }[];
  preferences: Record<string, string | boolean>;
  eligible: boolean;
  hasFeast: boolean;
}
interface ParishRelationshipsView {
  error?: string;
  retention: {
    rate: number;
    revenueRate: number;
    retained: number;
    opening: number;
    lost: number;
    newPaid: number;
  } | null;
  baselineDay: string;
  trackingSince?: string;
  parishes: RelationshipParish[];
  onboarding: { registered: number; verified: number; connected: number; firstGift: number };
  history: { reference: string; kind: string; occasion_date: string; status: string }[];
  emailConfigured: boolean;
  message: { subject: string; html: string };
  note: string;
}
declare function loadDetail(reference: string | undefined): unknown;
declare function handleAuthFailure(response: Response, data: unknown): boolean;
interface DonorBookstoreExperienceProduct {
  id: string;
  variantId?: string;
  priceCents: number;
  regularPriceCents?: number;
  name: string;
  trackInventory?: boolean;
  stockQuantity?: number;
  imageUrl?: string;
  category: string;
  categoryLabel?: string;
  description?: string;
  onSale?: boolean;
  savingsPercent?: number;
  fulfillmentType?: string;
}

declare function setDonorStatus(message: string, tone?: string): void;

declare module '*attribution.js' {}
