interface DonorDatedItem {
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  submittedAt?: string;
}
interface DonorOffering extends DonorDatedItem {
  amountCents?: number;
  parishNetCents?: number;
  giftAmountCents?: number;
  chargeCents?: number;
  totalFeeCents?: number;
  paymentStatus?: string;
  status?: string;
  coverFees?: boolean;
  fund?: string;
  campaign?: string;
  title?: string;
  giftType?: string;
  parishName?: string;
  parishId?: string;
  frequency?: string;
  stripeCustomerId?: string;
}
interface DonorHistoryActivity {
  product: string;
  title: string;
  subtitle?: string;
  meta?: string;
  status?: string;
  amountCents?: number;
  date?: string;
}
interface DonorBookstoreOrder extends DonorDatedItem {
  itemCategoryLabel?: string;
  itemCategory: string;
  itemDescription?: string;
  title?: string;
  status: string;
  totalChargedCents?: number;
  subtotalCents?: number;
  quantity?: number;
}
interface DonorCommemoration extends DonorDatedItem {
  names?: string;
  title?: string;
  parishName?: string;
  parishId?: string;
  kind?: string;
  type?: string;
  status?: string;
}
interface DonorPagePayload {
  offerings?: DonorOffering[];
  recentOfferings?: DonorOffering[];
  summary?: Record<string, number>;
  orders?: DonorBookstoreOrder[];
  recentCommemorations?: DonorCommemoration[];
  donor?: AppHeaderDonorProfile;
  portalUrl?: string;
}
interface Window {
  donorHistoryFilter?: string;
  donorHistoryPeriod?: string;
  donorHistoryActivities?: DonorHistoryActivity[];
  donorOfferings?: DonorOffering[];
}
declare function donorProfile(): (AppHeaderDonorProfile & { defaultParishId?: string }) | null;
declare function donorSession(): { email?: string; token?: string };
declare function readDonorCache<T = DonorPagePayload>(key: string): T | null;
declare const writeDonorCache: import('./app.js').DonorAppBindings['writeDonorCache'];
declare const donorApi: import('./app.js').DonorAppBindings['donorApi'];
declare function donorAuthHeaders(extra?: Record<string, string>): Record<string, string>;
declare function setDonorProfile(profile: AppHeaderDonorProfile): void;
declare function isDonorUnauthorized(error: unknown): boolean;
declare function clearDonorSession(): void;
declare function renderRecurringHomeCard(summary: Record<string, number>): void;
declare function loadGivingStatements(): unknown;
declare function setText(id: string, value: string): void;
