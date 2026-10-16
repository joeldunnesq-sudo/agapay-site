import type { SelfServiceSqlRow, SelfServiceContext } from './self-service-composition-contracts.js';

import { d1All, d1First } from '../lib/core.js';

import '../lib/authorization.js';

import { DirectoryServiceError, removeHouseholdMember } from './foundation.js';

import {
  createContactMethod,
  deactivateContactMethod,
  listActiveAddressesForOwner,
  listActiveContactsForOwner,
  updateContactMethod,
} from './contacts.js';

import { listParishDirectoryInvitations } from './invitations.js';

import { setFieldPrivacyPreference } from './privacy.js';

import { getPublicationProfile } from './publication.js';

import {
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  isActiveHouseholdAdmin,
  nowMs,
  runAtomic,
} from './shared.js';
import { EDITABLE_HOUSEHOLD_FIELDS } from './self-service-shared.js';
import {
  toBool,
  cleanDate,
  normalizeStarterVisibility,
  householdDto,
  memberDto,
  contactDto,
  addressDto,
  requestDto,
  selfActor,
  assertExpectedVersion,
  assertNoUnknownFields,
} from './self-service-shared.js';
import './self-service-context.js';
import './self-service-profile.js';
import './self-service-namedays.js';
import './self-service-contact-privacy.js';
import './self-service-requests.js';
import './self-service-invitations.js';

export async function getHouseholdSelfServiceProfile(
  env: Partial<Env>,
  { context, householdId }: { context: SelfServiceContext; householdId?: unknown }
) {
  const cleanedHouseholdId = cleanText(householdId, { required: true, max: 160, field: 'householdId' });
  const managed = context.manageableHouseholds.find((household) => household.id === cleanedHouseholdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot manage this household.', 403);
  const household = await d1First<SelfServiceSqlRow>(
    env,
    'SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2 AND active = 1',
    cleanedHouseholdId,
    managed.parishId
  );
  if (!household) throw new DirectoryServiceError('not_found', 'Household was not found.', 404);
  const [contacts, addresses, publication, members, admins, invitations, requests, anniversaryPreference] =
    await Promise.all([
      listActiveContactsForOwner(env, {
        parishId: managed.parishId,
        ownerType: 'household',
        ownerId: cleanedHouseholdId,
      }),
      listActiveAddressesForOwner(env, {
        parishId: managed.parishId,
        ownerType: 'household',
        ownerId: cleanedHouseholdId,
      }),
      getPublicationProfile(env, { parishId: managed.parishId, ownerType: 'household', ownerId: cleanedHouseholdId }),
      d1All<SelfServiceSqlRow>(
        env,
        `SELECT hm.person_id, hm.relationship, p.preferred_name, p.date_of_birth, p.updated_at AS person_updated_at,
              COALESCE(f.is_child, 0) AS is_child,
              COALESCE(f.protected_person, 0) AS protected_person,
              EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.active = 1) AS account_linked
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id
       LEFT JOIN directory_person_privacy_flags f ON f.person_id = p.id AND f.parish_id = ?2 AND f.active = 1
       WHERE hm.household_id = ?1 AND hm.active = 1 AND p.active = 1
       ORDER BY p.preferred_name`,
        cleanedHouseholdId,
        managed.parishId
      ),
      d1All<SelfServiceSqlRow>(
        env,
        `SELECT ha.person_id, p.preferred_name
       FROM directory_household_admins ha
       JOIN directory_people p ON p.id = ha.person_id
       WHERE ha.household_id = ?1 AND ha.active = 1
       ORDER BY p.preferred_name`,
        cleanedHouseholdId
      ),
      listParishDirectoryInvitations(env, { actor: selfActor(context, managed.parishId), parishId: managed.parishId }),
      d1All<SelfServiceSqlRow>(
        env,
        "SELECT * FROM directory_change_requests WHERE parish_id = ?1 AND household_id = ?2 AND status = 'pending' ORDER BY created_at DESC",
        managed.parishId,
        cleanedHouseholdId
      ),
      d1First<SelfServiceSqlRow>(
        env,
        `SELECT visibility, publication_eligible
       FROM directory_field_privacy_preferences
       WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2
         AND field_key = 'household_anniversary' AND active = 1`,
        managed.parishId,
        cleanedHouseholdId
      ),
    ]);
  const membersWithDetails = await Promise.all(
    members.map(async (row) => {
      const member = memberDto(row);
      if (member.child) return { ...member, contacts: [], birthdayVisibility: 'private' };
      const [personContacts, birthdayPreference] = await Promise.all([
        listActiveContactsForOwner(env, { parishId: managed.parishId, ownerType: 'person', ownerId: member.personId }),
        d1First<SelfServiceSqlRow>(
          env,
          `SELECT visibility
           FROM directory_field_privacy_preferences
          WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2
            AND field_key = 'adult_birthday' AND active = 1`,
          managed.parishId,
          member.personId
        ),
      ]);
      return {
        ...member,
        contacts: personContacts.map(contactDto),
        birthdayVisibility: birthdayPreference?.visibility || 'private',
      };
    })
  );
  return {
    household: householdDto({ ...household, anniversary_visibility: anniversaryPreference?.visibility || 'private' }),
    contacts: contacts.map(contactDto),
    addresses: addresses.map(addressDto),
    publication,
    members: membersWithDetails,
    administrators: admins.map((row) => ({ personId: row.person_id, preferredName: row.preferred_name })),
    pendingInvitations: invitations
      .filter(
        (invitation) =>
          invitation!.intendedHouseholdId === cleanedHouseholdId &&
          ['pending', 'sent', 'opened', 'accepted'].includes(invitation!.status)
      )
      .map((invitation) => ({
        id: invitation!.id,
        invitationType: invitation!.invitationType,
        intendedPersonId: invitation!.intendedPersonId,
        status: invitation!.status,
        expiresAt: invitation!.expiresAt,
      })),
    pendingRequests: requests.map(requestDto),
    editableFields: EDITABLE_HOUSEHOLD_FIELDS,
  };
}
export async function saveManagedHouseholdMemberContact(
  env: Partial<Env>,
  {
    context,
    parishId,
    personId,
    contactType,
    value,
    visibility,
    correlationId = '',
  }: {
    context: SelfServiceContext;
    parishId: string;
    personId: string;
    contactType: string;
    value: unknown;
    visibility: unknown;
    correlationId?: string;
  }
) {
  const existingContacts = await listActiveContactsForOwner(env, { parishId, ownerType: 'person', ownerId: personId });
  const existing =
    existingContacts.find((contact) => contact.contactType === contactType && contact.primary) ||
    existingContacts.find((contact) => contact.contactType === contactType);
  const cleanedValue = String(value || '').trim();
  const serviceActor = { ...selfActor(context, parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] };
  if (!cleanedValue) {
    if (existing)
      await deactivateContactMethod(env, { actor: serviceActor, parishId, contactId: existing.id, correlationId });
    return null;
  }
  if (existing) {
    return updateContactMethod(env, {
      actor: serviceActor,
      parishId,
      contactId: existing.id,
      patch: {
        value: cleanedValue,
        label: existing.label || (contactType === 'phone' ? 'mobile' : 'personal'),
        primary: true,
        visibility,
      },
      correlationId,
    });
  }
  return createContactMethod(env, {
    actor: serviceActor,
    parishId,
    ownerType: 'person',
    ownerId: personId,
    contactType,
    value: cleanedValue,
    label: contactType === 'phone' ? 'mobile' : 'personal',
    primary: true,
    verified: false,
    visibility,
    correlationId,
  });
}

export async function updateHouseholdMember(
  env: Partial<Env>,
  {
    context,
    householdId,
    personId,
    data = {},
    correlationId = '',
  }: {
    context: SelfServiceContext;
    householdId?: unknown;
    personId?: unknown;
    data?: Record<string, unknown>;
    correlationId?: string;
  }
) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot edit this household.', 403);
  if (!(await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id }))) {
    throw new DirectoryServiceError('forbidden', 'Only a household administrator can edit family members.', 403);
  }
  const member = await d1First<SelfServiceSqlRow>(
    env,
    `SELECT hm.person_id, hm.relationship, p.preferred_name, p.date_of_birth, p.updated_at AS person_updated_at,
            COALESCE(f.is_child, 0) AS is_child,
            EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.active = 1) AS account_linked
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f ON f.person_id = p.id AND f.parish_id = ?3 AND f.active = 1
      WHERE hm.household_id = ?1 AND hm.person_id = ?2 AND hm.active = 1`,
    householdId,
    personId,
    managed.parishId
  );
  if (!member) throw new DirectoryServiceError('not_found', 'That household member was not found.', 404);
  const relationship = cleanText(data.relationship || member.relationship, {
    required: true,
    max: 80,
    field: 'relationship',
  });
  if (!['spouse', 'child', 'adult_child', 'other'].includes(relationship)) {
    throw new DirectoryServiceError('validation_failed', 'Choose a supported household relationship.', 422);
  }
  const canRename = toBool(member.is_child) || !toBool(member.account_linked);
  const preferredName = cleanText(data.preferredName || member.preferred_name, {
    required: true,
    max: 160,
    field: 'preferredName',
  });
  const dateOfBirth = 'dateOfBirth' in data ? cleanDate(data.dateOfBirth, 'dateOfBirth') : member.date_of_birth;
  const birthdayVisibility =
    'birthdayVisibility' in data ? normalizeStarterVisibility(data.birthdayVisibility, 'private') : null;
  if (!canRename && preferredName !== member.preferred_name) {
    throw new DirectoryServiceError('account_managed', 'This adult manages their own name through My AGAPAY.', 409);
  }
  const timestamp = nowMs();
  const statements = [
    {
      sql: 'UPDATE directory_household_members SET relationship = ?, updated_at = ? WHERE household_id = ? AND person_id = ? AND active = 1',
      params: [relationship, timestamp, householdId, personId],
    },
  ];
  if (preferredName !== member.preferred_name) {
    statements.push(
      {
        sql: 'UPDATE directory_people SET preferred_name = ?, updated_at = ? WHERE id = ? AND active = 1',
        params: [preferredName, timestamp, personId],
      },
      {
        sql: 'UPDATE directory_household_namedays SET display_name = ?, updated_at = ? WHERE parish_id = ? AND household_id = ? AND active = 1 AND display_name = ?',
        params: [preferredName, timestamp, managed.parishId, householdId, member.preferred_name],
      }
    );
  }
  if (dateOfBirth !== member.date_of_birth) {
    statements.push({
      sql: 'UPDATE directory_people SET date_of_birth = ?, updated_at = ? WHERE id = ? AND active = 1',
      params: [dateOfBirth, timestamp, personId],
    });
  }
  statements.push(
    auditStatement({
      action: 'directory.self_service.household_member_updated',
      actor: selfActor(context, managed.parishId),
      parishId: managed.parishId,
      targetType: 'directory_person',
      targetId: personId as string,
      householdId: householdId as string | null | undefined,
      before: {
        preferredName: member.preferred_name,
        relationship: member.relationship,
        dateOfBirth: member.date_of_birth || '',
      },
      after: { preferredName, relationship, dateOfBirth: dateOfBirth || '' },
      correlationId,
    })
  );
  await runAtomic(env, statements);
  const serviceActor = { ...selfActor(context, managed.parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] };
  if (birthdayVisibility !== null && !toBool(member.is_child)) {
    await setFieldPrivacyPreference(env, {
      actor: serviceActor,
      parishId: managed.parishId,
      ownerType: 'person',
      ownerId: personId,
      fieldKey: 'adult_birthday',
      visibility: birthdayVisibility,
      publicationEligible: birthdayVisibility === 'directory_members',
      correlationId,
    });
  }
  if (!toBool(member.is_child)) {
    if ('email' in data || 'emailVisibility' in data) {
      await saveManagedHouseholdMemberContact(env, {
        context,
        parishId: managed.parishId,
        personId: personId as string,
        contactType: 'email',
        value: data.email,
        visibility: normalizeStarterVisibility(data.emailVisibility, 'private'),
        correlationId,
      });
    }
    if ('phone' in data || 'phoneVisibility' in data) {
      await saveManagedHouseholdMemberContact(env, {
        context,
        parishId: managed.parishId,
        personId: personId as string,
        contactType: 'phone',
        value: data.phone,
        visibility: normalizeStarterVisibility(data.phoneVisibility, 'private'),
        correlationId,
      });
    }
  }
  return {
    personId,
    preferredName,
    dateOfBirth: dateOfBirth || '',
    birthdayVisibility: birthdayVisibility || 'private',
    relationship,
    child: toBool(member.is_child),
    accountLinked: toBool(member.account_linked),
    version: timestamp,
  };
}

export async function deleteHouseholdMember(
  env: Partial<Env>,
  {
    context,
    householdId,
    personId,
    correlationId = '',
  }: { context: SelfServiceContext; householdId?: unknown; personId?: unknown; correlationId?: string }
) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot edit this household.', 403);
  if (!(await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id }))) {
    throw new DirectoryServiceError('forbidden', 'Only a household administrator can remove family members.', 403);
  }
  if (personId === context.currentPerson?.id) {
    throw new DirectoryServiceError('cannot_remove_self', 'You cannot remove yourself from the household here.', 409);
  }
  const otherAdmin = await d1First<SelfServiceSqlRow>(
    env,
    'SELECT id FROM directory_household_admins WHERE household_id = ?1 AND person_id = ?2 AND active = 1',
    householdId,
    personId
  );
  if (otherAdmin) {
    throw new DirectoryServiceError(
      'administrator_member',
      'A household administrator must be removed by parish staff.',
      409
    );
  }
  const serviceActor = { ...selfActor(context, managed.parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] };
  return removeHouseholdMember(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    householdId,
    personId,
    correlationId,
  });
}

export async function updateHouseholdSelfServiceProfile(
  env: Partial<Env>,
  {
    context,
    householdId,
    patch = {},
    correlationId = '',
  }: { context: SelfServiceContext; householdId?: unknown; patch?: Record<string, unknown>; correlationId?: string }
) {
  assertNoUnknownFields(patch, EDITABLE_HOUSEHOLD_FIELDS);
  const current = await getHouseholdSelfServiceProfile(env, { context, householdId });
  assertExpectedVersion(current.household.version, patch.expectedVersion);
  const displayName =
    'displayName' in patch
      ? cleanText(patch.displayName, { required: true, max: 200, field: 'displayName' })
      : current.household.displayName;
  const anniversaryDate =
    'anniversaryDate' in patch
      ? cleanDate(patch.anniversaryDate, 'anniversaryDate')
      : current.household.anniversaryDate;
  const timestamp = nowMs();
  const actor = selfActor(context, current.household.parishId);
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_households SET display_name = ?, anniversary_date = ?, updated_at = ? WHERE id = ? AND updated_at = ?',
      params: [displayName, anniversaryDate, timestamp, current.household.id, current.household.version],
    },
    auditStatement({
      action: 'directory.self_service.household_profile_updated',
      actor,
      parishId: current.household.parishId,
      targetType: 'directory_household',
      targetId: current.household.id,
      householdId: current.household.id,
      before: { displayName: current.household.displayName, anniversaryDate: current.household.anniversaryDate },
      after: { displayName, anniversaryDate },
      correlationId,
    }),
  ]);
  if ('anniversaryVisibility' in patch) {
    const visibility = normalizeStarterVisibility(patch.anniversaryVisibility, 'private');
    await setFieldPrivacyPreference(env, {
      actor,
      parishId: current.household.parishId,
      ownerType: 'household',
      ownerId: current.household.id,
      fieldKey: 'household_anniversary',
      visibility,
      publicationEligible: visibility === 'directory_members',
      correlationId,
    });
  }
  return getHouseholdSelfServiceProfile(env, { context, householdId });
}
