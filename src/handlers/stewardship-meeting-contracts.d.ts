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
  durationMinutes?: string | number;
  reportType?: string;
  createdBy?: string;
  signedBy?: string;
  signed_by?: string;
  fundName?: string;
  beginningBalance?: string | number;
  beginning_balance?: string | number;
  totalReceived?: string | number;
  total_received?: string | number;
  totalDisbursed?: string | number;
  total_disbursed?: string | number;
  endingBalance?: string | number;
  ending_balance?: string | number;
  fullName?: string;
  nominatedBy?: string;
  resolvedText?: string;
}
export interface MeetingPayload extends Record<string, unknown> {
  title?: string;
  fiscal_year?: string | number;
  meeting_date?: string;
  meeting_time?: string;
  parish_name_override?: string;
  fiscalYear?: string | number;
  meetingDate?: string;
  meetingTime?: string;
  location?: string;
  parishNameOverride?: string;
  jurisdiction?: string;
  address?: string;
  agendaItems?: MeetingPayloadItem[];
  reports?: MeetingPayloadItem[];
  restrictedFunds?: MeetingPayloadItem[];
  nominees?: MeetingPayloadItem[];
  resolutions?: MeetingPayloadItem[];
  financialSummary?: {
    totalIncome?: string | number;
    total_income?: string | number;
    totalExpense?: string | number;
    total_expense?: string | number;
    notes?: string;
  };
}
