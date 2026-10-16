import type { DashboardRegistration } from './parish-dashboard-handler.js';
export type AdminRegistration = DashboardRegistration & {
  stripeAccountId?: string;
  reference?: string;
  parishId?: string;
  parishName?: string;
  city?: string;
  status?: string;
  taxReadinessStatus?: string;
  taxReadinessNotes?: string;
  parishUsername?: string;
  statusTimeline?: Record<string, unknown>[];
  stripeStatusHistory?: Record<string, unknown>[];
  subscriptionStatusHistory?: Record<string, unknown>[];
  reviewedBy?: string;
  verificationSource?: string;
  bishopOrAuthority?: string;
  dioceseOrDeanery?: string;
  notesHistory?: Record<string, unknown>[];
  reviewerNotes?: string;
  receivedAt?: string;
  billingStatus?: string;
  subscriptionStatus?: string;
  subscriptionTier?: string;
  subscriptionPricingProgram?: string;
  learnStatus?: string;
  learnSubscriptionStatus?: string;
  learnBillingInterval?: string;
  learnPlan?: string;
  stewardshipStatus?: string;
  stewardshipPlan?: string;
  stewardshipBillingInterval?: string;
};
export interface AdminSubscriptionProduct {
  id: string;
  label: string;
  monthlyCents: number;
  activeCount: number;
  trialingCount: number;
  estimated: boolean;
}
export interface AdminRevenueAccumulator {
  monthLabel: string;
  totalMonthlyCents: number;
  byProduct?: Record<string, AdminSubscriptionProduct>;
  products?: AdminSubscriptionProduct[];
  note: string;
}
export interface AdminSqlRow {
  total_registered: number;
  total_verified: number;
  connected_stripe_accounts: number;
  registration_count: number;
  verified_count: number;
  stripe_ready_count: number;
  subscription_ready_count: number;
  parishId: string;
  subscriptionTier: string;
  entityStatus: string;
  activationStatus: string;
  provisioningStatus: string;
  healthStatus: string;
  reference: string;
  data: string;
  received_at: string;
  month: number;
  registered: number;
  verified: number;
  connected: number;
  count: number;
  total_cents: number;
  parish_id: string;
  database_id: string;
  id: string;
}
export interface AdminListOptions {
  hardLimit?: number;
  status?: string;
}
export interface AdminMutation extends Partial<AdminRegistration> {
  action?: string;
  password?: string;
  adminPassword?: string;
  actor?: string;
  newAdminPassword?: string;
  confirmAdminPassword?: string;
  environment?: string;
  databaseIdentifier?: string;
  databaseId?: string;
  reason?: string;
  reasonCode?: string;
  safeSummary?: string;
  sourceScanId?: string;
  scanType?: string;
  scope?: string;
  correlationId?: string;
  resumeScanId?: string;
  expectedVersion?: number;
  state?: string;
  verificationType?: string;
  artifactReference?: string;
  artifactBody?: string;
  manifest?: Record<string, unknown>;
}
export type AdminEnvironment = Partial<Env> & {
  STRIPE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  DB?: D1Database;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_WEBHOOK_SECRET_CONNECT?: string;
  TURNSTILE_SECRET_KEY?: string;
  AGAPAY_ENABLE_KV_MIGRATION?: string;
  AGAPAY_ADMIN_TOKEN?: string;
};

export interface AdminChargeResult {
  ok: boolean;
  body: { data?: import('../lib/stripe-connect.js').StripeCharge[]; error?: { message?: string } };
}

export type RawAdminPageRead = (
  env: Parameters<typeof import('../lib/registrations.js').loadAdminRegistrationPage>[0],
  options: { limit?: number | string | null; cursor?: string | null; status?: string | null; q?: string | null }
) => ReturnType<typeof import('../lib/registrations.js').loadAdminRegistrationPage>;
export type RawAuditRead = (
  env: Parameters<typeof import('../lib/audit-log.js').listAuditEvents>[0],
  options: Omit<NonNullable<Parameters<typeof import('../lib/audit-log.js').listAuditEvents>[1]>, 'limit'> & {
    limit?: number | string | null;
  }
) => ReturnType<typeof import('../lib/audit-log.js').listAuditEvents>;
