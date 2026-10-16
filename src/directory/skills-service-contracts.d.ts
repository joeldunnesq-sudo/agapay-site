export interface DirectoryPrintRow extends Record<string, string | null> {
  household_id: string;
  display_name: string;
  person_id: string;
  preferred_name: string;
  city: string;
  region: string;
  saint_name: string;
  feast_month_day: string;
  email: string;
  phone: string;
  approved_fields_json: string;
}

import type { DirectoryContext, DirectorySelfContext, DirectoryActorInput } from './contracts.js';

export type SkillContext = DirectoryActorInput & Partial<Omit<DirectorySelfContext, 'user'>>;

export interface SkillSqlRow {
  count: number;
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  is_platform_default: number;
  parish_id: string;
  is_active: number;
  sort_order: number;
  version: number;
  skill_id: string;
  custom_display_label: string;
  experience_level: string;
  service_mode: string;
  availability_note: string;
  contact_preference: string;
  visibility: string;
  status: string;
  consent_recorded_at: number;
  consent_withdrawn_at: number;
  person_id: string;
  preferred_name: string;
  parish_hidden_reason: string;
  reviewed_at: number;
  date_of_birth: string;
  label: string;
  value: string;
  contact_type: string;
  is_child: number;
  protected_person: string;
  skillsDirectoryEnabled: string;
  skillsMemberSearchEnabled: string;
  skillsStaffOnlyMode: string;
  skillsCustomEntriesEnabled: string;
  skillsDisclaimerText: string;
  skillsContactFallback: string;
  householdVerificationIntervalDays: string;
  parishId: string;
  verification_due_at: number;
  last_verified_at: number;
  verification_policy_version: string;
  intervalDays: string;
  verification_status: string;
  account_managed: string;
  display_name: string;
  skill_name: string;
  household_name: string;
  approved_fields_json: string;
}

export interface SkillContact {
  preference?: string;
  type?: string;
  label?: string;
  value?: string;
  fallback?: string;
  email?: string;
  phone?: string;
}

export type SkillInput = Record<string, unknown>;
export type { DirectoryContext, DirectorySelfContext, DirectoryActorInput };
