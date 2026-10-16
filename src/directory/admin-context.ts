import type {
  DirectoryReviewSqlRow,
  DirectoryReviewActor,
  DirectoryReviewContext,
  DirectoryReviewUser,
} from './admin-composition-contracts.js';

import { hasModuleAccess } from '../lib/entitlements.js';

import './admin-actor.js';

import { currentUser, resolveAuthorizationContext } from '../lib/authorization.js';

import { d1First, getBearerToken, resolveParishDashboardSession } from '../lib/core.js';

import { findRegistrationByParishId } from '../handlers/parish.js';

import '../lib/household-verification.js';

import './foundation.js';

import { DirectoryServiceError } from './foundation.js';

import './publication.js';

import './privacy.js';

import './media.js';

import './media-transform.js';

import './duplicates.js';

import './child-publication.js';

import './ministries.js';

import './settings.js';

import './review-correspondence.js';

import './household-share-invitations.js';

import { assertParishActor, cleanText, DIRECTORY_CAPABILITIES } from './shared.js';
import { PARISH_DASHBOARD_DIRECTORY_CAPABILITIES } from './admin-shared.js';
import './admin-review-queue.js';
import './admin-shared.js';
import './admin-media-operations.js';
import './admin-person-records.js';
import './admin-review-commands.js';
import './admin-review-approval.js';
import './admin-household-records.js';
import './admin-notes-duplicates.js';
export function hasAny(actor: DirectoryReviewActor, capabilities: readonly string[]) {
  return capabilities.some((capability) => actor.capabilities.includes(capability));
}
export function requireAny(actor: DirectoryReviewActor, parishId: string, capabilities: readonly string[]) {
  return assertParishActor(actor, parishId, [...capabilities, DIRECTORY_CAPABILITIES.manage]);
}
export async function linkedPersonId(env: Partial<Env>, userId: string) {
  const row = await d1First<DirectoryReviewSqlRow>(
    env,
    "SELECT person_id FROM directory_person_links WHERE link_type = 'platform_user' AND external_id = ?1 AND active = 1 LIMIT 1",
    userId
  );
  return row?.person_id || '';
}

export async function resolveDirectoryAdminContext(
  env: Partial<Env>,
  { request, parishId }: { request: Request; parishId?: unknown }
): Promise<DirectoryReviewContext> {
  const parishDashboardContext = await requireParishDashboardDirectoryAccess(request, env, { parishId });
  if (parishDashboardContext) return parishDashboardContext;

  const user = (await currentUser(request, env)) as DirectoryReviewUser | null;
  if (!user)
    throw new DirectoryServiceError(
      'unauthorized',
      'Directory administration requires an authenticated platform user.',
      401
    );
  const cleanedParishId = cleanText(parishId, { required: true, max: 160, field: 'parishId' });
  const { membership, capabilities } = await resolveAuthorizationContext(env, {
    userId: user.id,
    parishId: cleanedParishId,
  });
  if (!membership)
    throw new DirectoryServiceError('forbidden', 'Directory administration requires an active parish membership.', 403);
  const directoryCapabilities = capabilities.filter((capability) => capability.startsWith('directory.'));
  if (!directoryCapabilities.length)
    throw new DirectoryServiceError('forbidden', 'Directory administration requires a directory capability.', 403);
  const found = await findRegistrationByParishId(env, cleanedParishId);
  if (!hasModuleAccess(found?.registration, 'directory'))
    throw new DirectoryServiceError('subscription_required', 'Parish Directory requires Give + or Parish.', 403);
  const personId = await linkedPersonId(env, user.id);
  const actor = { userId: user.id, parishId: cleanedParishId, capabilities, personId };
  return {
    user: { id: user.id, email: user.email || '', displayName: user.displayName || '' },
    parishId: cleanedParishId,
    personId,
    capabilities: directoryCapabilities,
    permissions: {
      canReviewRequests: hasAny(actor, [DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.manage]),
      canReviewPublication: hasAny(actor, [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage]),
      canManagePeople: hasAny(actor, [DIRECTORY_CAPABILITIES.peopleManage, DIRECTORY_CAPABILITIES.manage]),
      canManageHouseholds: hasAny(actor, [DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage]),
      canManageProtected: hasAny(actor, [DIRECTORY_CAPABILITIES.protectedManage, DIRECTORY_CAPABILITIES.manage]),
      canViewNotes: hasAny(actor, [
        DIRECTORY_CAPABILITIES.notesView,
        DIRECTORY_CAPABILITIES.notesManage,
        DIRECTORY_CAPABILITIES.manage,
      ]),
      canManageNotes: hasAny(actor, [DIRECTORY_CAPABILITIES.notesManage, DIRECTORY_CAPABILITIES.manage]),
      canAssign: hasAny(actor, [DIRECTORY_CAPABILITIES.assignmentsManage, DIRECTORY_CAPABILITIES.manage]),
      canViewAudit: hasAny(actor, [DIRECTORY_CAPABILITIES.auditView, DIRECTORY_CAPABILITIES.manage]),
      canViewPrivateContact: hasAny(actor, [DIRECTORY_CAPABILITIES.privateContactView, DIRECTORY_CAPABILITIES.manage]),
      canReviewDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage]),
      canMergeDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesMerge, DIRECTORY_CAPABILITIES.manage]),
      canManageInvitations: hasAny(actor, ['directory.invitations.manage', DIRECTORY_CAPABILITIES.manage]),
    },
    entitlement: { mission: true, parish: true, phase3AAvailable: true },
  };
}

export async function requireParishDashboardDirectoryAccess(
  request: Request,
  env: Partial<Env>,
  { parishId }: { parishId?: unknown } = {}
): Promise<DirectoryReviewContext | null> {
  const cleanedParishId = cleanText(parishId, { required: true, max: 160, field: 'parishId' });
  if (request?.headers?.get?.('X-AGAPAY-User-Email')) return null;
  let found = null;
  try {
    found = await findRegistrationByParishId(env, cleanedParishId);
  } catch {
    return null;
  }
  if (!found?.registration) return null;
  const session = await resolveParishDashboardSession(found.registration, getBearerToken(request));
  if (!session) return null;
  if (!hasModuleAccess(found.registration, 'directory'))
    throw new DirectoryServiceError('subscription_required', 'Parish Directory requires Give + or Parish.', 403);

  const actorId = cleanedParishId;
  const actorLabel =
    found.registration.contactEmail ||
    found.registration.email ||
    found.registration.parishName ||
    'Parish Dashboard Administrator';
  const actor = {
    userId: actorId,
    actorType: 'parish_dashboard_account',
    parishId: cleanedParishId,
    capabilities: [...PARISH_DASHBOARD_DIRECTORY_CAPABILITIES],
    personId: '',
  };
  return {
    authenticationType: 'parish_dashboard',
    actorType: 'parish_dashboard_account',
    actorId,
    actorLabel,
    parishSessionId: session.id || '',
    authenticatedAt: session.expiresAt || '',
    user: {
      id: actorId,
      email: found.registration.contactEmail || found.registration.email || '',
      displayName: actorLabel,
    },
    parishId: cleanedParishId,
    personId: '',
    capabilities: [...PARISH_DASHBOARD_DIRECTORY_CAPABILITIES],
    permissions: {
      canReviewRequests: hasAny(actor, [DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.manage]),
      canReviewPublication: hasAny(actor, [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage]),
      canManagePeople: hasAny(actor, [DIRECTORY_CAPABILITIES.peopleManage, DIRECTORY_CAPABILITIES.manage]),
      canManageHouseholds: hasAny(actor, [DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage]),
      canManageProtected: hasAny(actor, [DIRECTORY_CAPABILITIES.protectedManage, DIRECTORY_CAPABILITIES.manage]),
      canViewNotes: hasAny(actor, [
        DIRECTORY_CAPABILITIES.notesView,
        DIRECTORY_CAPABILITIES.notesManage,
        DIRECTORY_CAPABILITIES.manage,
      ]),
      canManageNotes: hasAny(actor, [DIRECTORY_CAPABILITIES.notesManage, DIRECTORY_CAPABILITIES.manage]),
      canAssign: hasAny(actor, [DIRECTORY_CAPABILITIES.assignmentsManage, DIRECTORY_CAPABILITIES.manage]),
      canViewAudit: hasAny(actor, [DIRECTORY_CAPABILITIES.auditView, DIRECTORY_CAPABILITIES.manage]),
      canViewPrivateContact: hasAny(actor, [DIRECTORY_CAPABILITIES.privateContactView, DIRECTORY_CAPABILITIES.manage]),
      canReviewDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage]),
      canMergeDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesMerge, DIRECTORY_CAPABILITIES.manage]),
      canManageInvitations: hasAny(actor, ['directory.invitations.manage', DIRECTORY_CAPABILITIES.manage]),
    },
    entitlement: { mission: true, parish: true, phase3AAvailable: true },
  };
}
