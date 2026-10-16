import type { PortabilityDatabase } from '../../portability/contracts.js';

import type { LedgerServiceActor, JournalLineInput } from '../ledger/service.js';

export interface CloseJournalLine extends JournalLineInput {
  accountId: string;
  fundId: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
}

export interface CloseSqlRow {
  [column: string]: string | number | null;
  id: string;
  close_type: string;
  fiscal_year_id: string;
  accounting_period_id: string;
  status: string;
  initiated_by_actor_id: string;
  reviewed_by_actor_id: string;
  approved_by_actor_id: string;
  started_at: string;
  last_validated_at: string;
  completed_at: string;
  reopened_at: string;
  version: number;
  correlation_id: string;
  check_code: string;
  category: string;
  label: string;
  description: string;
  check_origin: string;
  severity: string;
  blocking: number;
  details_json: string;
  resolution_note: string;
  close_session_id: string;
  journal_entry_id: string;
  adjustment_type: string;
  effective_date: string;
  reason: string;
  supporting_memo: string;
  auto_reverse: number;
  reversal_date: string;
  reversal_status: string;
  reversal_journal_entry_id: string;
  raw_balance: string;
  account_id: string;
  fund_id: string;
  name: string;
  restriction_type: string;
  endingDebit: string;
  endingCredit: string;
  closing_date: string;
  closing_entry_id: string;
  revenue_total: string;
  expense_total: string;
  change_in_net_assets: string;
  restricted_change: string;
  unrestricted_change: string;
  count: number;
  manifest_json: string;
  format: string;
  requested_at: string;
  expires_at: string;
  map: string;
  accounting_records_retention_years: string;
  bank_statement_retention_years: string;
  invoice_retention_years: string;
  audit_log_retention_years: string;
  attachment_retention_years: string;
  close_packet_retention_years: string;
  allow_legal_hold: string;
  retention_policy_version: string;
  entity_type: string;
  entity_id: string;
  hold_reason: string;
  start_date: string;
  end_date: string;
  account_number: string;
  is_closed: string;
}

export interface AdjustmentInput {
  adjustmentType: string;
  effectiveDate: string;
  lines: JournalLineInput[];
  reason?: string;
  supportingMemo?: string;
  description?: string;
  closeSessionId?: string;
  autoReverse?: boolean;
  reversalDate?: string;
  correlationId?: string;
  name?: string;
  frequency?: string;
  nextRunDate?: string;
  endDate?: string;
}

export interface RetentionPatch {
  [key: string]: unknown;
}
export type { PortabilityDatabase, LedgerServiceActor, JournalLineInput };
