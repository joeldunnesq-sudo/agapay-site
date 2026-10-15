import type { DirectoryMemberOptions } from './request-contracts.js';
export function getPublishedMinistry(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;
export function listPublishedMinistries(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;

import type { DirectorySelfContext } from './contracts.js';

export function getMyMinistries(env: Partial<Env>, options: { context: DirectorySelfContext }): Promise<unknown>;

export function submitMinistryInterest(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    ministryId?: unknown;
    interestType?: unknown;
    memberNote?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function withdrawMinistryInterest(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; requestId?: unknown; correlationId?: string }
): Promise<unknown>;

import type { DirectoryContext } from './contracts.js';

export function assignMinistryLeader(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    ministryId?: unknown;
    personId?: unknown;
    assignmentType?: unknown;
    publish?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function assignMinistryParticipantCandidate(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    ministryId?: unknown;
    candidateId?: unknown;
    personId?: unknown;
    correlationId?: string;
    options?: unknown;
  }
): Promise<unknown>;

export function createMinistry(
  env: Partial<Env>,
  options: { context: DirectoryContext; data?: Record<string, unknown>; correlationId?: string }
): Promise<unknown>;

export function deleteMinistry(
  env: Partial<Env>,
  options: { context: DirectoryContext; ministryId?: unknown; correlationId?: string }
): Promise<{ imageStorageKey: string }>;

export function endMinistryLeader(
  env: Partial<Env>,
  options: { context: DirectoryContext; leaderId?: unknown; correlationId?: string }
): Promise<unknown>;

export function getMinistryAdmin(
  env: Partial<Env>,
  options: { context: DirectoryContext; ministryId?: unknown }
): Promise<{ ministry: { hasImage?: boolean } }>;

export function listMinistriesAdmin(
  env: Partial<Env>,
  options: { context: DirectoryContext; status?: unknown; query?: unknown; limit?: unknown }
): Promise<unknown>;

export function searchMinistryParticipantCandidates(
  env: Partial<Env>,
  options: { context: DirectoryContext; query?: unknown; limit?: unknown }
): Promise<unknown>;

export function removeMinistryParticipant(
  env: Partial<Env>,
  options: { context: DirectoryContext; participantId?: unknown; reasonCode?: unknown; correlationId?: string }
): Promise<unknown>;

export function setMinistryParticipationPublication(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    participantId?: unknown;
    preference?: unknown;
    approvedPublication?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function setMinistryImage(
  env: Partial<Env>,
  options: {
    context: DirectoryContext;
    ministryId?: unknown;
    storageKey?: unknown;
    contentType?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function updateMinistry(
  env: Partial<Env>,
  options: { context: DirectoryContext; ministryId?: unknown; patch?: Record<string, unknown>; correlationId?: string }
): Promise<unknown>;
