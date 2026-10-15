export interface AccountingIntegrationActor {
  id: string;
  type?: string;
  capabilities: readonly string[];
}
export interface IntegrationSourceRow {
  id: string;
  status: string;
  source_type: string;
  source_system: string;
  gross_amount: number;
  donation_id: string;
  source_object_id: string;
  event_version: number;
  payment_intent_id: string;
  occurred_at: string;
  currency: string;
  campaign_id: string;
  revenue_stream_id: string;
  settlement_profile_id: string;
  designated_fund_id: string;
  donor_restricted: number;
  balance_transaction_id: string;
  fee_amount: number;
}
export interface IntegrationEvent {
  sourceSystem: string;
  sourceType: string;
  sourceEventId: string;
  sourceObjectId: string;
  occurredAt: string;
  currency: string;
  [field: string]: unknown;
}
export function ingestAccountingSourceEvent(
  db: D1Database,
  options: { actor: AccountingIntegrationActor; entitlementTier: string; event: IntegrationEvent }
): Promise<{ id: string }>;
export function processAccountingSourceEvent(
  db: D1Database,
  options: { actor: AccountingIntegrationActor; entitlementTier: string; sourceEventId: string }
): Promise<{ status: string; exceptionMessage?: string }>;
