import type { SelfServiceSqlRow, SelfServiceUser, SelfServiceContext } from './self-service-composition-contracts.js';

import { d1All, d1First, generateSecret } from '../lib/core.js';

import { currentUser } from '../lib/authorization.js';

import { DirectoryServiceError } from './foundation.js';

import './contacts.js';

import './invitations.js';

import { getPersonPrivacyFlags } from './privacy.js';

import './publication.js';

import { auditStatement, DIRECTORY_CAPABILITIES, nowMs, runAtomic } from './shared.js';
import './self-service-shared.js';
import { personDto, affiliationDto, requestDto } from './self-service-shared.js';
import './self-service-profile.js';
import './self-service-namedays.js';
import './self-service-household-members.js';
import './self-service-contact-privacy.js';
import './self-service-requests.js';
import './self-service-invitations.js';
export async function householdWasParishVerified(env: Partial<Env>, parishId: string, householdId: string) {
  const row = await d1First<SelfServiceSqlRow>(
    env,
    `SELECT id FROM directory_publication_profiles
      WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2
        AND approval_status = 'approved'
      ORDER BY approved_at DESC LIMIT 1`,
    parishId,
    householdId
  );
  return Boolean(row);
}
export async function personBelongsToVerifiedHousehold(env: Partial<Env>, parishId: string, personId: string) {
  const row = await d1First<SelfServiceSqlRow>(
    env,
    `SELECT hm.id FROM directory_household_members hm
      JOIN directory_households h ON h.id = hm.household_id AND h.parish_id = ?1 AND h.active = 1
      JOIN directory_publication_profiles pub
        ON pub.parish_id = ?1 AND pub.owner_type = 'household' AND pub.owner_id = h.id
     WHERE hm.person_id = ?2 AND hm.active = 1 AND pub.approval_status = 'approved'
     LIMIT 1`,
    parishId,
    personId
  );
  return Boolean(row);
}
export async function loadLinkedPerson(env: Partial<Env>, userId: string) {
  const row = await d1First<SelfServiceSqlRow>(
    env,
    `SELECT p.* FROM directory_person_links l
     JOIN directory_people p ON p.id = l.person_id
     WHERE l.link_type = 'platform_user'
       AND l.external_id = ?1
       AND l.active = 1
       AND p.active = 1
     ORDER BY l.created_at ASC
     LIMIT 1`,
    userId
  );
  return row || null;
}
export async function restoreLinkedPersonFromSelfServiceRequest(env: Partial<Env>, user: SelfServiceUser) {
  if (!user?.id) return null;
  const row = await d1First<SelfServiceSqlRow>(
    env,
    `SELECT p.* FROM directory_change_requests r
     JOIN directory_people p ON p.id = r.target_id
     WHERE r.requester_user_id = ?1
       AND r.requester_person_id = r.target_id
       AND r.target_type = 'person'
       AND r.request_type = 'person_profile_review'
       AND p.active = 1
       AND NOT EXISTS (
         SELECT 1 FROM directory_person_links l
         WHERE l.person_id = p.id
           AND l.link_type = 'platform_user'
           AND l.external_id = ?1
           AND l.active = 1
       )
     ORDER BY r.created_at DESC
     LIMIT 1`,
    user.id
  );
  if (!row) return null;
  const timestamp = nowMs();
  const actor = {
    userId: user.id,
    actorType: 'platform_user',
    parishId: row.created_by_parish_id,
    personId: row.id,
    capabilities: [DIRECTORY_CAPABILITIES.selfManage],
  };
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_person_links
              (id, person_id, link_type, external_id, active, source, claim_id, created_at, updated_at)
            VALUES (?, ?, 'platform_user', ?, 1, 'self_service_recovered', NULL, ?, ?)`,
      params: [generateSecret('dir_link'), row.id, user.id, timestamp, timestamp],
    },
    auditStatement({
      action: 'directory.self_service.profile_link_recovered',
      actor,
      parishId: row.created_by_parish_id,
      targetType: 'directory_person',
      targetId: row.id,
    }),
  ]);
  return row;
}
export async function loadContextRows(env: Partial<Env>, personId: string) {
  const [affiliations, memberships, admins] = await Promise.all([
    d1All<SelfServiceSqlRow>(
      env,
      "SELECT * FROM directory_parish_affiliations WHERE person_id = ?1 AND active = 1 AND status != 'former_member' ORDER BY parish_id",
      personId
    ),
    d1All<SelfServiceSqlRow>(
      env,
      `SELECT hm.*, h.parish_id, h.display_name, h.active AS household_active
       FROM directory_household_members hm
       JOIN directory_households h ON h.id = hm.household_id
       WHERE hm.person_id = ?1 AND hm.active = 1 AND h.active = 1
       ORDER BY h.display_name`,
      personId
    ),
    d1All<SelfServiceSqlRow>(
      env,
      `SELECT ha.*, h.parish_id, h.display_name, h.active AS household_active
       FROM directory_household_admins ha
       JOIN directory_households h ON h.id = ha.household_id
       WHERE ha.person_id = ?1 AND ha.active = 1 AND h.active = 1
       ORDER BY h.display_name`,
      personId
    ),
  ]);
  return { affiliations, memberships, admins };
}
export async function shouldCreateSelfServiceHousehold(env: Partial<Env>, userId: string, personId: string) {
  const row = await d1First<SelfServiceSqlRow>(
    env,
    `SELECT id FROM directory_change_requests
     WHERE requester_user_id = ?1
       AND requester_person_id = ?2
       AND target_id = ?2
       AND target_type = 'person'
       AND request_type = 'person_profile_review'
     LIMIT 1`,
    userId,
    personId
  );
  return Boolean(row);
}
export async function createSelfServiceHouseholdForPerson(
  env: Partial<Env>,
  { user, person, parishId }: { user: SelfServiceUser; person: SelfServiceSqlRow; parishId: string }
) {
  const timestamp = nowMs();
  const householdId = generateSecret('dir_household');
  const householdMemberId = generateSecret('dir_hm');
  const householdAdminId = generateSecret('dir_ha');
  const householdPublicationId = generateSecret('dir_pub');
  const displayName = `${person.preferred_name || user.displayName || 'My'} Household`;
  const actor = {
    userId: user.id,
    actorType: 'platform_user',
    parishId,
    personId: person.id,
    capabilities: [DIRECTORY_CAPABILITIES.selfManage],
  };
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_households (id, parish_id, display_name, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)`,
      params: [householdId, parishId, displayName, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_household_members
              (id, household_id, person_id, relationship, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, 'head', NULL, NULL, 1, ?, ?)`,
      params: [householdMemberId, householdId, person.id, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_household_admins
              (id, household_id, person_id, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, NULL, NULL, 1, ?, ?)`,
      params: [householdAdminId, householdId, person.id, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_publication_profiles
              (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at)
            VALUES (?, ?, 'household', ?, 'draft', 'not_submitted', 1, ?, ?)`,
      params: [householdPublicationId, parishId, householdId, timestamp, timestamp],
    },
    auditStatement({
      action: 'directory.self_service.household_recovered',
      actor,
      parishId: parishId as string,
      targetType: 'directory_household',
      targetId: householdId as string,
      householdId: householdId as string | null | undefined,
      after: { displayName, administratorPersonId: person.id },
    }),
  ]);
}
export async function loadPendingRequests(
  env: Partial<Env>,
  { personId, parishIds }: { personId: string; parishIds: string[] }
) {
  if (!parishIds.length) return [];
  const placeholders = parishIds.map((_, index) => `?${index + 2}`).join(', ');
  const rows = await d1All<SelfServiceSqlRow>(
    env,
    `SELECT * FROM directory_change_requests
     WHERE requester_person_id = ?1 AND parish_id IN (${placeholders}) AND status = 'pending'
     ORDER BY created_at DESC`,
    personId,
    ...parishIds
  );
  return rows.map(requestDto);
}

export async function resolveDirectorySelfServiceContext(
  env: Partial<Env>,
  { request = null, user = null }: { request?: Request | null; user?: SelfServiceUser | null } = {}
): Promise<SelfServiceContext> {
  const platformUser = (user || (await currentUser(request as Request, env))) as SelfServiceUser | null;
  if (!platformUser)
    throw new DirectoryServiceError(
      'unauthorized',
      'Directory self-service requires an authenticated My AGAPAY account.',
      401
    );
  const linkedPerson =
    (await loadLinkedPerson(env, platformUser.id)) ||
    (await restoreLinkedPersonFromSelfServiceRequest(env, platformUser));
  if (!linkedPerson) {
    return {
      claimed: false,
      user: { id: platformUser.id, email: platformUser.email, displayName: platformUser.displayName || '' },
      currentPerson: null,
      activeParishContexts: [],
      memberHouseholds: [],
      manageableHouseholds: [],
      permissions: { canSelfManage: false, canManageHouseholds: false },
      pendingRequests: [],
      entitlement: { mission: true, parish: true, phase2AAvailable: true },
    };
  }
  const flags = await getPersonPrivacyFlags(env, {
    parishId: linkedPerson.created_by_parish_id,
    personId: linkedPerson.id,
  });
  if (flags.isChild)
    throw new DirectoryServiceError('forbidden', 'Child records cannot use directory self-service.', 403);
  let rows = await loadContextRows(env, linkedPerson.id);
  if (
    !rows.memberships.length &&
    !rows.admins.length &&
    (await shouldCreateSelfServiceHousehold(env, platformUser.id, linkedPerson.id))
  ) {
    await createSelfServiceHouseholdForPerson(env, {
      user: platformUser,
      person: linkedPerson,
      parishId: linkedPerson.created_by_parish_id,
    });
    rows = await loadContextRows(env, linkedPerson.id);
  }
  const parishIds = [
    ...new Set([
      ...rows.affiliations.map((row) => row.parish_id),
      ...rows.memberships.map((row) => row.parish_id),
      ...rows.admins.map((row) => row.parish_id),
    ]),
  ];
  const pendingRequests = await loadPendingRequests(env, { personId: linkedPerson.id, parishIds });
  return {
    claimed: true,
    user: { id: platformUser.id, email: platformUser.email, displayName: platformUser.displayName || '' },
    currentPerson: personDto(linkedPerson, flags)!,
    activeParishContexts: rows.affiliations.map(affiliationDto),
    memberHouseholds: rows.memberships.map((row) => ({
      id: row.household_id,
      parishId: row.parish_id,
      displayName: row.display_name,
      relationship: row.relationship,
    })),
    manageableHouseholds: rows.admins.map((row) => ({
      id: row.household_id,
      parishId: row.parish_id,
      displayName: row.display_name,
    })),
    permissions: {
      canSelfManage: rows.affiliations.length > 0,
      canManageHouseholds: rows.admins.length > 0,
      canInviteAdults: rows.admins.length > 0,
    },
    pendingRequests,
    entitlement: { mission: true, parish: true, phase2AAvailable: true },
  };
}
