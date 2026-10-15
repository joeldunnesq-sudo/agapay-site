import type { DirectoryMemberOptions } from './request-contracts.js';
export function searchSkillListings(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;

import type { DirectorySelfContext } from './contracts.js';

export function completeHouseholdVerification(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; householdId?: unknown; reconfirmSkills?: unknown; correlationId?: string }
): Promise<unknown>;

export function getHouseholdVerificationStatus(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; householdId?: unknown }
): Promise<unknown>;

export function listMySkillListings(env: Partial<Env>, options: { context: DirectorySelfContext }): Promise<unknown>;

export function pauseAllMySkillListings(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; correlationId?: string }
): Promise<unknown>;

export function saveMySkillListing(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    listingId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

import type { DirectoryContext } from './contracts.js';

export function createParishSkill(
  env: Partial<Env>,
  options: { context: DirectoryContext; data?: Record<string, unknown>; correlationId?: string }
): Promise<unknown>;

export function exportPublishedAdultsCsv(
  env: Partial<Env>,
  options: { context: DirectoryContext }
): Promise<{ body: string; contentType: string; filename: string }>;

export function exportSkillsRosterCsv(
  env: Partial<Env>,
  options: { context: DirectoryContext }
): Promise<{ body: string; contentType: string; filename: string }>;

export function getDirectoryMaintenanceDashboard(
  env: Partial<Env>,
  options: { context: DirectoryContext }
): Promise<unknown>;

export function listSkillCatalog(
  env: Partial<Env>,
  options: { context: DirectoryContext; parishId?: unknown }
): Promise<unknown>;

export function listSkillListingsAdmin(
  env: Partial<Env>,
  options: { context: DirectoryContext; status?: unknown; category?: unknown; q?: unknown; limit?: unknown }
): Promise<unknown>;

export function moderateSkillListing(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    listingId?: unknown;
    action?: unknown;
    reason?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function printDirectory(
  env: Partial<Env>,
  options: { context: DirectoryContext }
): Promise<NonNullable<import('../lib/directory-pdf.js').DirectoryPdfInput['directory']>>;

export function printSkillsRoster(env: Partial<Env>, options: { context: DirectoryContext }): Promise<unknown>;

export function updateParishSkill(
  env: Partial<Env>,
  options: { context: DirectoryContext; skillId?: unknown; patch?: Record<string, unknown>; correlationId?: string }
): Promise<unknown>;

export function updateSkillsSettings(
  env: Partial<Env>,
  options: { context: DirectoryContext; patch?: Record<string, unknown>; correlationId?: string }
): Promise<unknown>;
