import type { MeetingRegistration, MeetingRow } from './stewardship-meeting-contracts.js';
import type { CatalogRegistration } from './parish-giving-catalog.js';
export type StewardshipRegistration = MeetingRegistration &
  CatalogRegistration & {
    parishId?: string;
    reference?: string;
    treasurerEmail?: string;
    priestEmail?: string;
    stewardshipStripeCustomerId?: string;
    stewardshipSubscriptionId?: string;
    stewardshipComp?: NonNullable<MeetingRegistration['stewardshipComp']> & {
      code?: string;
      grantedAt?: string;
      grantedBy?: string;
    };
  };
export interface StewardshipMeetingRow extends MeetingRow {
  id: string;
  parish_id: string;
  signature_line_count: number;
  note_line_count: number;
}
export interface StewardshipForm extends Record<string, unknown> {
  title: string;
  fiscal_year: string | number;
  meeting_date: string;
  meeting_time: string;
  location: string;
  parish_name_override: string;
  jurisdiction: string;
  address: string;
  signature_line_count: unknown;
  note_line_count: unknown;
  action: string;
  agenda_title: string | string[];
  agenda_duration: string | number | (string | number)[];
  report_type: string | string[];
  report_title: string | string[];
  report_body: string | string[];
  report_signed_by: string | string[];
  fin_income: string;
  fin_expense: string;
  fin_notes: string;
  fund_name: string | string[];
  fund_begin: string | number | (string | number)[];
  fund_received: string | number | (string | number)[];
  fund_disbursed: string | number | (string | number)[];
  fund_ending: string | number | (string | number)[];
  nominee_name: string | string[];
  nominee_position: string | string[];
  nominee_bio: string | string[];
  nominee_nominated_by: string | string[];
  resolution_title: string | string[];
  resolution_resolved: string | string[];
}
export type StewardshipEnvironment = Partial<Env> & { STRIPE_SECRET_KEY?: string; RESEND_API_KEY?: string };
