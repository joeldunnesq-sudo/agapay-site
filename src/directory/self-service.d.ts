import type { DirectorySelfContext } from './contracts.js';
export function resolveDirectorySelfServiceContext(
  env: Partial<Env>,
  options: { request: Request }
): Promise<DirectorySelfContext>;

export function cancelDirectoryChangeRequest(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; requestId?: unknown; correlationId?: string }
): Promise<unknown>;

export function createDirectoryChangeRequest(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    parishId?: unknown;
    targetType?: unknown;
    targetId?: unknown;
    householdId?: unknown;
    requestType?: unknown;
    summary?: unknown;
    payload?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function createHouseholdAdultInvitation(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    householdId?: unknown;
    personId?: unknown;
    email?: unknown;
    phone?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function createSelfServiceAddress(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    householdId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function createSelfServiceContact(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    ownerType?: unknown;
    ownerId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function deleteHouseholdMember(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; householdId?: unknown; personId?: unknown; correlationId?: string }
): Promise<unknown>;

export function deleteHouseholdNameday(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; householdId?: unknown; namedayId?: unknown; correlationId?: string }
): Promise<unknown>;

export function deleteSelfServiceContact(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; contactId?: unknown; correlationId?: string }
): Promise<unknown>;

export function getHouseholdSelfServiceProfile(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; householdId?: unknown }
): Promise<unknown>;

export function getSelfServiceProfile(env: Partial<Env>, options: { context: DirectorySelfContext }): Promise<unknown>;

export function listHouseholdNamedays(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; householdId?: unknown }
): Promise<unknown>;

export function requestHouseholdAdultAdd(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    householdId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function requestHouseholdChildAdd(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    householdId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function resendHouseholdAdultInvitation(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; invitationId?: unknown; correlationId?: string }
): Promise<unknown>;

export function revokeHouseholdAdultInvitation(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; invitationId?: unknown; correlationId?: string }
): Promise<unknown>;

export function saveHouseholdNameday(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    householdId?: unknown;
    namedayId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function setSelfServicePrivacyPreference(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    ownerType?: unknown;
    ownerId?: unknown;
    fieldKey?: unknown;
    visibility?: unknown;
    publicationEligible?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function startSelfServiceProfile(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; data?: Record<string, unknown>; correlationId?: string }
): Promise<unknown>;

export function transitionSelfServicePublication(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    ownerType?: unknown;
    ownerId?: unknown;
    status?: unknown;
    correlationId?: string;
  }
): Promise<unknown>;

export function updateHouseholdMember(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    householdId?: unknown;
    personId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function updateHouseholdSelfServiceProfile(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    householdId?: unknown;
    patch?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function updateSelfServiceContact(
  env: Partial<Env>,
  options: {
    context: DirectorySelfContext;
    contactId?: unknown;
    patch?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<unknown>;

export function updateSelfServicePersonProfile(
  env: Partial<Env>,
  options: { context: DirectorySelfContext; patch?: Record<string, unknown>; correlationId?: string }
): Promise<unknown>;
