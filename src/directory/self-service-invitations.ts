import type { SelfServiceSqlRow, SelfServiceContext } from './self-service-composition-contracts.js';

import { d1First } from '../lib/core.js';

import '../lib/authorization.js';

import { DirectoryServiceError } from './foundation.js';

import './contacts.js';

import { createDirectoryInvitation, resendDirectoryInvitation, revokeDirectoryInvitation } from './invitations.js';

import { getPersonPrivacyFlags } from './privacy.js';

import './publication.js';

import { cleanText, isActiveHouseholdAdmin } from './shared.js';
import './self-service-shared.js';
import { selfActor } from './self-service-shared.js';
import './self-service-context.js';
import './self-service-profile.js';
import './self-service-namedays.js';
import './self-service-household-members.js';
import './self-service-contact-privacy.js';
import './self-service-requests.js';

export async function createHouseholdAdultInvitation(
  env: Partial<Env>,
  {
    context,
    householdId,
    personId,
    email = '',
    phone = '',
    correlationId = '',
  }: {
    context: SelfServiceContext;
    householdId?: unknown;
    personId?: unknown;
    email?: unknown;
    phone?: unknown;
    correlationId?: string;
  }
) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot invite adults for this household.', 403);
  const flags = await getPersonPrivacyFlags(env, { parishId: managed.parishId, personId });
  if (flags.isChild)
    throw new DirectoryServiceError(
      'child_invitation_denied',
      'Children cannot be invited to manage a household.',
      403
    );
  if (!(await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson!.id }))) {
    throw new DirectoryServiceError('forbidden', 'Only active household administrators can invite another adult.', 403);
  }
  const created = await createDirectoryInvitation(env, {
    actor: selfActor(context, managed.parishId),
    parishId: managed.parishId,
    invitationType: 'additional_household_admin',
    intendedPersonId: personId,
    intendedHouseholdId: householdId,
    intendedAuthority: 'grant_household_admin',
    recipientEmail: email,
    recipientPhone: phone,
    recipientLabel: 'Adult household member',
    correlationId,
  });
  const invitation = created.invitation;
  return {
    id: invitation!.id,
    invitationType: invitation!.invitationType,
    intendedPersonId: invitation!.intendedPersonId,
    intendedHouseholdId: invitation!.intendedHouseholdId,
    status: invitation!.status,
    expiresAt: invitation!.expiresAt,
    token: created.rawToken,
  };
}

export async function resendHouseholdAdultInvitation(
  env: Partial<Env>,
  {
    context,
    invitationId,
    correlationId = '',
  }: { context: SelfServiceContext; invitationId?: unknown; correlationId?: string }
) {
  const invitation = await d1First<SelfServiceSqlRow>(
    env,
    'SELECT * FROM directory_invitations WHERE id = ?1',
    cleanText(invitationId, { required: true, max: 160, field: 'invitationId' })
  );
  if (
    !invitation ||
    !context.manageableHouseholds.some(
      (household) => household.id === invitation!.intended_household_id && household.parishId === invitation!.parish_id
    )
  ) {
    throw new DirectoryServiceError('not_found', 'Invitation was not found.', 404);
  }
  const resent = await resendDirectoryInvitation(env, {
    actor: selfActor(context, invitation!.parish_id),
    parishId: invitation!.parish_id,
    invitationId: invitationId as string,
    correlationId,
  });
  return {
    id: resent.invitation!.id,
    status: resent.invitation!.status,
    expiresAt: resent.invitation!.expiresAt,
    token: resent.rawToken,
  };
}

export async function revokeHouseholdAdultInvitation(
  env: Partial<Env>,
  {
    context,
    invitationId,
    correlationId = '',
  }: { context: SelfServiceContext; invitationId?: unknown; correlationId?: string }
) {
  const invitation = await d1First<SelfServiceSqlRow>(
    env,
    'SELECT * FROM directory_invitations WHERE id = ?1',
    cleanText(invitationId, { required: true, max: 160, field: 'invitationId' })
  );
  if (
    !invitation ||
    !context.manageableHouseholds.some(
      (household) => household.id === invitation!.intended_household_id && household.parishId === invitation!.parish_id
    )
  ) {
    throw new DirectoryServiceError('not_found', 'Invitation was not found.', 404);
  }
  const revoked = await revokeDirectoryInvitation(env, {
    actor: selfActor(context, invitation!.parish_id),
    parishId: invitation!.parish_id,
    invitationId: invitationId as string,
    correlationId,
  });
  return { id: revoked!.id, status: revoked!.status };
}
