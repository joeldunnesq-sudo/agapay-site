export interface TaxClaimRow {
  id: string;
  registration_reference: string;
  parish_id: string | null;
  jurisdiction: string;
  exemption_type: string;
  certificate_number: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  status: string;
  internal_review_status: string | null;
  authorized_representative_name: string;
  authorized_representative_title: string;
  certified_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  replacement_requested_at: string | null;
  replacement_requested_by: string | null;
  replacement_reason: string | null;
  keep_active_during_replacement: number;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  supersedes_tax_exemption_id: string | null;
  created_at: string;
  updated_at: string;
  upload_token_hash: string | null;
  upload_token_expires_at: string | null;
}
export interface TaxSyncRow {
  id: string;
  tax_exemption_id: string;
  registration_reference: string;
  stripe_customer_id: string;
  customer_role: string;
  desired_tax_exempt_status: string;
  previous_tax_exempt_status: string | null;
  agapay_owned_change: number;
  sync_status: string;
  stripe_request_id: string | null;
  idempotency_key: string | null;
  last_error: string | null;
  attempt_count: number;
  attempted_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface TaxDocumentRow {
  id: string;
  tax_exemption_id: string;
  registration_reference: string;
  storage_key: string;
  original_filename: string;
  sanitized_filename: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  uploaded_by_user_id: string | null;
  uploaded_at: string;
  is_current: number;
  replaces_document_id: string | null;
  archived_at: string | null;
  deleted_at: string | null;
}
export interface TaxAuditRow {
  id: string;
  tax_exemption_id: string | null;
  document_id: string | null;
  registration_reference: string;
  action: string;
  actor_type: string;
  actor_user_id: string | null;
  metadata_json: string | null;
  created_at: string;
}
export interface TaxNoteRow {
  id: string;
  tax_exemption_id: string;
  actor_user_id: string;
  note: string;
  created_at: string;
}
export interface TaxRegistration {
  reference?: string;
  stripeCustomerId?: string;
  stewardshipStripeCustomerId?: string;
  treasurerEmail?: string | null;
  priestEmail?: string | null;
}
export interface TaxCustomer {
  stripeCustomerId: string;
  customerRole: string;
}
export interface TaxMutation {
  taxExemptionId: string;
  registration: TaxRegistration;
  actor: string;
  expectedVersion?: string;
  reason: string;
  keepActiveDuringReplacement?: boolean;
  registrationReference: string;
}
export interface TaxAuditInput {
  taxExemptionId?: string | null;
  documentId?: string | null;
  registrationReference: string;
  action: string;
  actorType: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}

export type TaxEnvironment = Partial<Env> &
  import('./stripe-connect.js').StripeRequestEnv &
  import('./email.js').EmailEnv;
