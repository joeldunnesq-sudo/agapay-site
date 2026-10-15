// Consumed legacy Admin service contracts; runtime services retain validation.

import type { DirectoryContext } from './contracts.js';

export function applyHouseholdDirectCorrection(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    householdId?: unknown;
    patch?: Record<string, unknown>;
    expectedVersion?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function applyPersonDirectCorrection(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    personId?: unknown;
    patch?: Record<string, unknown>;
    expectedVersion?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function removeDirectoryPersonFromParish(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    personId?: unknown;
    expectedVersion?: unknown;
    reasonCode?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function archiveDirectoryNote(
  env: Partial<Env>,
  options: { context: DirectoryContext; noteId?: unknown; correlationId?: string }
): Promise<unknown>;

export function assignDirectoryReviewItem(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    sourceType?: unknown;
    sourceId?: unknown;
    assigneeUserId?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function beginDirectoryReview(
  env: Partial<Env>,
  options: { context: DirectoryContext; sourceType?: unknown; sourceId?: unknown; correlationId?: string }
): Promise<unknown>;

export function changeDirectoryReviewPriority(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    sourceType?: unknown;
    sourceId?: unknown;
    priority?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function createDirectoryNote(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    targetType?: unknown;
    targetId?: unknown;
    category?: unknown;
    body?: unknown;
    visibilityClass?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function decideDirectoryReviewItem(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    sourceType?: unknown;
    sourceId?: unknown;
    decision?: unknown;
    reasonCode?: unknown;
    reviewerNote?: unknown;
    requesterNote?: unknown;
    expectedVersion?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function getDirectoryAdminDashboard(env: Partial<Env>, options: { context: DirectoryContext }): Promise<unknown>;

export function getDirectoryHouseholdAdmin(
  env: Partial<Env>,
  options: { context: DirectoryContext; householdId?: unknown }
): Promise<unknown>;

export function getDirectoryMediaLegacyAudit(
  env: Partial<Env>,
  options: { context: DirectoryContext; correlationId?: string }
): Promise<unknown>;

export function getDirectoryPersonAdmin(
  env: Partial<Env>,
  options: { context: DirectoryContext; personId?: unknown }
): Promise<{
  person: { preferredName: string };
  accountAccess?: { linked?: boolean };
  households?: { id: string; display_name?: string }[];
}>;

export function getDirectoryReviewItem(
  env: Partial<Env>,
  options: { context: DirectoryContext; sourceType?: unknown; sourceId?: unknown }
): Promise<unknown>;

export function getDirectoryDuplicateCandidate(
  env: Partial<Env>,
  options: { context: DirectoryContext; candidateId?: unknown }
): Promise<unknown>;

export function listDirectoryAuditHistory(
  env: Partial<Env>,
  options: { context: DirectoryContext; targetType?: unknown; targetId?: unknown; limit?: unknown }
): Promise<unknown>;

export function listDirectoryDuplicateCandidates(
  env: Partial<Env>,
  options: { context: DirectoryContext; status?: unknown; entityType?: unknown; limit?: unknown }
): Promise<unknown>;

export function listDirectoryHouseholdsAdmin(
  env: Partial<Env>,
  options: { context: DirectoryContext; query?: unknown; limit?: unknown }
): Promise<unknown>;

export function listDirectoryPeopleAdmin(
  env: Partial<Env>,
  options: { context: DirectoryContext; query?: unknown; limit?: unknown }
): Promise<unknown>;

export function listDirectoryReviewQueue(
  env: Partial<Env>,
  options: { context: DirectoryContext; filters?: Record<string, unknown> }
): Promise<unknown>;

export function decideDirectoryDuplicateCandidate(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    candidateId?: unknown;
    decision?: unknown;
    reasonCode?: unknown;
    expectedVersion?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function executeDirectoryDuplicateMerge(
  env: Partial<Env>,
  options: { context: DirectoryContext; candidateId?: unknown; expectedVersion?: unknown; correlationId?: string }
): Promise<unknown>;

export function planDirectoryDuplicateMerge(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    candidateId?: unknown;
    survivorId?: unknown;
    expectedVersion?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function requestDirectoryMediaReprocessing(
  env: Partial<Env>,
  options: { context: DirectoryContext; mediaAssetId?: unknown; correlationId?: string }
): Promise<unknown>;

export function resolveDirectoryAdminContext(
  env: Partial<Env>,
  options: { request: Request; parishId?: unknown }
): Promise<DirectoryContext>;

export function revokeChildPublicationApproval(
  env: Partial<Env>,
  options: { context: DirectoryContext; requestId?: unknown; reasonCode?: unknown; correlationId?: string }
): Promise<unknown>;

export function runDirectoryDuplicateScan(
  env: Partial<Env>,
  options: { context: DirectoryContext; entityType?: unknown; correlationId?: string }
): Promise<unknown>;

export function streamDirectoryAdminMediaVariant(
  env: Partial<Env>,
  options: { context: DirectoryContext; mediaAssetId?: unknown; variantType?: unknown }
): Promise<Response>;

export function unassignDirectoryReviewItem(
  env: Partial<Env>,
  options: { context: DirectoryContext; sourceType?: unknown; sourceId?: unknown; correlationId?: string }
): Promise<unknown>;
