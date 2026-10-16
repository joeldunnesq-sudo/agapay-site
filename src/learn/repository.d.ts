import type { CalendarRepository } from './google-calendar.js';
import type { LearnGradeSetup } from './grade-records.js';
import type { AcademicSetup } from './academic-record-contracts.js';
import type { LiturgicalEnrichmentDay } from './hymn-source.js';
export interface LearnRepositorySeed {
  setupSnapshot?: LearnGradeSetup & AcademicSetup & { savedAt?: string };
  household?: { liturgicalCalendarType?: string };
}
export interface LearnDashboard {
  today: { liturgicalDay: LiturgicalEnrichmentDay; churchRhythms?: { title: string; note?: unknown }[] };
  [field: string]: unknown;
}
export class SeedLearnRepository implements CalendarRepository {
  constructor(seed?: LearnRepositorySeed);
  seed: LearnRepositorySeed;
  getDashboard(options?: { calendarType?: string; civilDate?: string }): LearnDashboard;
  getPlanner(options?: {
    calendarType?: string;
    view?: string;
    month?: string;
    civilDate?: string;
  }): ReturnType<CalendarRepository['getPlanner']>;
  getPrintCenter(options?: { calendarType?: string; month?: string }): Record<string, unknown>;
  getFormation(options?: { calendarType?: string; civilDate?: string }): LearnDashboard;
  getBooks(): unknown;
  getReports(): Record<string, unknown>;
  getCommunity(options?: { facebookGroupUrl?: string; communityResources?: unknown[] }): unknown;
  getCoOp(options?: { enabled?: boolean }): unknown;
  getOnboarding(): unknown;
}
export function createLearnRepositoryForRequest(
  request: Request,
  env: Partial<Env>,
  options?: { termId?: string; weekDate?: string }
): Promise<SeedLearnRepository | null>;
