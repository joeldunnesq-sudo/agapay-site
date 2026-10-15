import type { EntitlementRegistration } from '../lib/entitlements.js';
export interface MeetingRegistration extends EntitlementRegistration {
  parishName?: string;
  name?: string;
  jurisdiction?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  stewardshipPeriodEnd?: number;
  stewardshipCancelAtPeriodEnd?: boolean;
}
export interface MeetingRow {
  id?: string;
  title?: string;
  fiscal_year?: number | string;
  meeting_date?: string;
  meeting_time?: string;
  location?: string;
  parish_name_override?: string;
  jurisdiction?: string;
  address?: string;
  signature_line_count?: unknown;
  note_line_count?: unknown;
  status?: string;
  created_at?: string;
  updated_at?: string;
}
export interface MeetingItem {
  id?: string;
  title?: string;
  description?: string;
  duration_minutes?: number | string;
  report_type?: string;
  body?: string;
  created_by?: string;
  resolved_text?: string;
  fund_name?: string;
  beginning_balance_cents?: number;
  total_received_cents?: number;
  total_disbursed_cents?: number;
  ending_balance_cents?: number;
  notes?: string;
  full_name?: string;
  position?: string;
  bio?: string;
  nominated_by?: string;
}
export interface MeetingFinancialSummary {
  total_income_cents?: number;
  total_expense_cents?: number;
  net_cents?: number;
  notes?: string;
}
export interface MeetingPayloadItem extends MeetingItem {
  durationMinutes?: unknown;
  reportType?: unknown;
  createdBy?: unknown;
  signedBy?: unknown;
  signed_by?: unknown;
  fundName?: unknown;
  beginningBalance?: unknown;
  beginning_balance?: unknown;
  totalReceived?: unknown;
  total_received?: unknown;
  totalDisbursed?: unknown;
  total_disbursed?: unknown;
  endingBalance?: unknown;
  ending_balance?: unknown;
  fullName?: unknown;
  nominatedBy?: unknown;
  resolvedText?: unknown;
}
export interface MeetingPayload extends Record<string, unknown> {
  agendaItems?: MeetingPayloadItem[];
  reports?: MeetingPayloadItem[];
  restrictedFunds?: MeetingPayloadItem[];
  nominees?: MeetingPayloadItem[];
  resolutions?: MeetingPayloadItem[];
  financialSummary?: Record<string, unknown>;
}
