import type { LearnRuntimeSeed, LearnRuntimePlannerRow } from './setup-operation-contracts.js';
export type RepositoryDaily = Partial<LearnRuntimeSeed['dashboardDaily'][string]>;
export interface RepositoryLiturgicalDay {
  epistleRef?: string;
  gospelRef?: string;
  troparionTone?: string;
  troparionText?: string;
  kontakionTone?: string;
  kontakionText?: string;
  oldStyleDateLabel?: string;
  civilDate?: string;
  feastRank?: string;
  feastTitle?: string;
  fastingRule?: string;
  fastingType?: string;
  oldStyleLabel?: string;
  seasonLabel?: string;
  [field: string]: unknown;
}
export interface CommunityResource {
  id?: string;
  title?: string;
  url?: string;
  [field: string]: unknown;
}
export interface ProgressAssignment {
  childId?: string;
  formLabel?: string;
}
export interface RepositoryOptions {
  calendarType?: string;
  civilDate?: string;
  view?: string;
  month?: string;
  scope?: string;
  rowId?: string;
  fromWeekday?: unknown;
  mode?: string;
  facebookGroupUrl?: string;
  communityResources?: CommunityResource[];
  enabled?: boolean;
}

import type { LearnSetupSnapshot } from './setup-persistence.js';
export type ProgressSubject = Partial<LearnSetupSnapshot['subjects'][number]> & {
  id: string;
  title: string;
  subjectType: string;
};
export interface RepositoryBlock extends Partial<LearnRuntimePlannerRow> {
  subtitle?: string;
  minutesPlanned?: number;
  status?: string;
}
