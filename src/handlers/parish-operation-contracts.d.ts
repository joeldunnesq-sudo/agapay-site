import type { CatalogRegistration } from './parish-giving-catalog.js';
export interface ParishFund {
  id?: string;
  code?: string;
  reportCode?: string;
  name?: string;
  enabled?: boolean;
  active?: boolean;
  description?: string;
  [field: string]: unknown;
}
export type ParishRegistration = CatalogRegistration & {
  parishPasswordResetExpiresAt?: string;
  parishPasswordResetTokenHash?: string;
  parishPasswordResetSalt?: string;
  adminAuditLog?: Record<string, unknown>[];
  parishId?: string;
  parishName?: string;
  city?: string;
  status?: string;
  givingStatus?: string;
  communityType?: string;
  funds?: ParishFund[];
  imageUrl?: string;
  photoUrl?: string;
  jurisdiction?: string;
  state?: string;
  logoUrl?: string;
  imageAlt?: string;
  liturgicalCalendar?: string;
  koinoniaCalendarUrl?: string;
  patronalFeast?: string;
  patronalFeastName?: string;
  parishPatronalFeastName?: string;
  patronalFeastDate?: string;
  parishPatronalFeastDate?: string;
  recurringGivingEnabled?: boolean;
  candlesEnabled?: boolean;
  commemorationsEnabled?: boolean;
  campaigns?: import('./parish-giving-catalog.js').CatalogCampaign[];
  feastCampaigns?: import('./parish-giving-catalog.js').CatalogCampaign[];
  stripeAccountId?: string;
  stripeSubscriptionId?: string;
  receivedAt?: string;
  reviewedAt?: string;
  parishUpdatedAt?: string;
  subscriptionUpdatedAt?: string;
  priestEmail?: string;
  treasurerEmail?: string;
};
export interface ParishSqlRow {
  id: string;
  reference: string;
  data: string;
  received_at: string;
  updated_at: string;
  status: string;
  giving_status: string;
  parish_id: string;
  stripe_account_id: string;
  stripe_subscription_id: string;
}
export interface CatalogPageOptions {
  query?: string | null;
  limit?: string | number | null;
  cursor?: string | null;
  q?: string | null;
  type?: string | null;
  jurisdiction?: string | null;
}
