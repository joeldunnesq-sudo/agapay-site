import type { DirectoryEnvironment, DirectorySelfContext, DirectoryShareInvitationRow } from './contracts.js';
import { d1All, d1First, generateSecret, randomHex, sha256Hex } from '../lib/core.js';
import { DirectoryServiceError } from './foundation.js';
import { auditStatement, cleanText, isActiveHouseholdAdmin, runAtomic, safeJson } from './shared.js';

const TOKEN_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const TOKEN_DOMAIN = 'directory_household_share:';

type LinkedStatementPair = {
  household_id: string;
  parish_id: string;
  household_name: string;
  recipient_id: string;
  recipient_person_id: string;
  recipient_name: string;
  recipient_email: string;
  spouse_id: string;
  spouse_person_id: string;
  spouse_name: string;
  spouse_email: string;
};

export const LINKED_STATEMENT_PAIRS_SQL = `
  SELECT h.id AS household_id, h.parish_id, h.display_name AS household_name,
         recipient.id AS recipient_id, head.person_id AS recipient_person_id,
         head_person.preferred_name AS recipient_name, recipient.email AS recipient_email,
         spouse.id AS spouse_id, partner.person_id AS spouse_person_id,
         spouse_person.preferred_name AS spouse_name, spouse.email AS spouse_email
    FROM directory_households h
    JOIN directory_household_members head ON head.household_id=h.id AND head.active=1 AND head.relationship='head'
    JOIN directory_household_admins admin ON admin.household_id=h.id AND admin.person_id=head.person_id AND admin.active=1
    JOIN directory_household_members partner ON partner.household_id=h.id AND partner.active=1 AND partner.relationship='spouse'
    JOIN directory_people head_person ON head_person.id=head.person_id AND head_person.active=1
    JOIN directory_people spouse_person ON spouse_person.id=partner.person_id AND spouse_person.active=1
    JOIN directory_person_links head_link ON head_link.person_id=head.person_id AND head_link.link_type='platform_user' AND head_link.active=1
    JOIN directory_person_links spouse_link ON spouse_link.person_id=partner.person_id AND spouse_link.link_type='platform_user' AND spouse_link.active=1
    JOIN platform_users recipient ON recipient.id=head_link.external_id AND recipient.status='active' AND recipient.email_verified_at IS NOT NULL
    JOIN platform_users spouse ON spouse.id=spouse_link.external_id AND spouse.status='active' AND spouse.email_verified_at IS NOT NULL
   WHERE h.active=1 AND recipient.id<>spouse.id
     AND (SELECT COUNT(*) FROM directory_household_members m WHERE m.household_id=h.id
       AND m.active=1 AND m.relationship IN ('head','spouse'))=2
     AND NOT EXISTS (SELECT 1 FROM directory_person_privacy_flags f
       WHERE f.parish_id=h.parish_id AND f.person_id IN (head.person_id,partner.person_id)
         AND f.active=1 AND (f.is_child=1 OR f.protected_person=1))
`;

export async function listLinkedHouseholdStatementChoices(env: DirectoryEnvironment, userId: string) {
  return d1All(
    env,
    `
    SELECT p.household_id AS id, p.household_name AS householdName, p.parish_id AS parishId,
           COALESCE(reg.parish_name,p.parish_id) AS parishName, p.recipient_name AS recipientName,
           p.recipient_id=?1 AS receivesStatement,
           MAX(CASE WHEN c.consenting_user_id=?1 THEN 1 ELSE 0 END) AS optedIn,
           COUNT(c.consenting_user_id)=2 AS bothOptedIn
      FROM (${LINKED_STATEMENT_PAIRS_SQL}) p
      LEFT JOIN registrations reg ON reg.parish_id=p.parish_id
      LEFT JOIN directory_household_giving_consent c ON c.household_id=p.household_id
        AND c.parish_id=p.parish_id AND c.recipient_user_id=p.recipient_id AND c.spouse_user_id=p.spouse_id
     WHERE ?1 IN (p.recipient_id,p.spouse_id)
       AND NOT EXISTS (SELECT 1 FROM directory_household_invitations i WHERE i.household_id=p.household_id
         AND i.combine_giving=1 AND i.status IN ('pending','claimed'))
     GROUP BY p.household_id, p.recipient_id, p.spouse_id
     ORDER BY parishName, householdName
  `,
    userId
  );
}

export async function updateLinkedHouseholdStatementConsent(
  env: DirectoryEnvironment,
  userId: string,
  householdId: string,
  enabled: boolean
) {
  const updated = enabled
    ? await d1First(
        env,
        `INSERT INTO directory_household_giving_consent
        (household_id,parish_id,recipient_user_id,spouse_user_id,consenting_user_id,created_at)
        SELECT p.household_id,p.parish_id,p.recipient_id,p.spouse_id,?1,?3
          FROM (${LINKED_STATEMENT_PAIRS_SQL}) p
         WHERE p.household_id=?2 AND ?1 IN (p.recipient_id,p.spouse_id)
           AND NOT EXISTS (SELECT 1 FROM directory_household_invitations i WHERE i.household_id=p.household_id
             AND i.combine_giving=1 AND i.status IN ('pending','claimed'))
        ON CONFLICT DO UPDATE SET created_at=excluded.created_at RETURNING household_id`,
        userId,
        householdId,
        Date.now()
      )
    : await d1First(
        env,
        `DELETE FROM directory_household_giving_consent
         WHERE consenting_user_id=?1 AND household_id=?2 RETURNING household_id`,
        userId,
        householdId
      );
  if (!updated) throw new DirectoryServiceError('not_found', 'Household statement sharing was not found.', 404);
}

export async function prepareLinkedHouseholdAtHomeParish(env: DirectoryEnvironment, userId: string) {
  const candidates = await d1All<LinkedStatementPair & { home_parish_id: string }>(
    env,
    `
     SELECT p.recipient_id,p.recipient_person_id,p.spouse_id,p.spouse_person_id,
            home.default_parish_id AS home_parish_id, MIN(p.household_name) AS household_name
       FROM (${LINKED_STATEMENT_PAIRS_SQL}) p
       JOIN donors home ON home.email=p.recipient_email
       JOIN donors spouse_home ON spouse_home.email=p.spouse_email
       JOIN registrations reg ON reg.parish_id=home.default_parish_id
      WHERE ?1 IN (p.recipient_id,p.spouse_id)
        AND home.default_parish_id=spouse_home.default_parish_id AND home.default_parish_id<>p.parish_id
        AND NOT EXISTS (
          SELECT 1 FROM directory_household_members m
          JOIN directory_households h ON h.id=m.household_id AND h.active=1
          WHERE h.parish_id=home.default_parish_id AND m.active=1
            AND m.person_id IN (p.recipient_person_id,p.spouse_person_id))
      GROUP BY p.recipient_id,p.recipient_person_id,p.spouse_id,p.spouse_person_id,home.default_parish_id
      LIMIT 2
  `,
    userId
  );
  if (candidates.length !== 1) return;
  const pair = candidates[0];
  const parishId = pair.home_parish_id;
  const householdId =
    'dir_household_transfer_' +
    (await sha256Hex(JSON.stringify([parishId, pair.recipient_person_id, pair.spouse_person_id])));
  const now = Date.now();
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_households (id,parish_id,display_name,created_at,updated_at)
       SELECT ?1,?2,?3,?4,?4
       WHERE NOT EXISTS (
         SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id
         WHERE h.parish_id=?2 AND h.active=1 AND m.active=1 AND m.person_id IN (?5,?6))
       ON CONFLICT(id) DO NOTHING`,
      params: [householdId, parishId, pair.household_name, now, pair.recipient_person_id, pair.spouse_person_id],
    },
    ...(
      [
        [pair.recipient_person_id, 'head'],
        [pair.spouse_person_id, 'spouse'],
      ] as const
    ).map(([personId, relationship]) => ({
      sql: `INSERT OR IGNORE INTO directory_household_members (id,household_id,person_id,relationship,created_at,updated_at)
       SELECT ?1,id,?3,?4,?5,?5 FROM directory_households WHERE id=?2 AND active=1`,
      params: [householdId + '_' + relationship, householdId, personId, relationship, now],
    })),
    {
      sql: `INSERT OR IGNORE INTO directory_household_admins (id,household_id,person_id,created_at,updated_at)
       SELECT ?1,id,?3,?4,?4 FROM directory_households WHERE id=?2 AND active=1`,
      params: [householdId + '_admin', householdId, pair.recipient_person_id, now],
    },
    auditStatement({
      action: 'directory.household_home_parish_connected',
      actor: { userId, parishId },
      parishId,
      targetType: 'directory_household',
      targetId: householdId,
      householdId,
      after: { homeParishId: parishId },
    }),
  ]);
}

export async function listHouseholdStatementSharing(env: DirectoryEnvironment, userId: string) {
  return d1All(
    env,
    `
    SELECT i.id, h.display_name AS householdName, p.preferred_name AS memberName,
           i.created_by_user_id = ?1 AS receivesStatement
      FROM directory_household_invitations i
      JOIN directory_households h ON h.id = i.household_id AND h.active = 1
      JOIN directory_people p ON p.id = i.person_id AND p.active = 1
     WHERE i.combine_giving = 1 AND (i.created_by_user_id = ?1 OR i.claimed_by_user_id = ?1)
       AND ((i.status = 'pending' AND julianday(i.expires_at) > julianday('now'))
         OR (i.status = 'claimed' AND EXISTS (
           SELECT 1 FROM directory_change_requests r
            WHERE json_extract(r.requested_payload_json, '$.shareToLink.invitationId') = i.id
              AND json_extract(r.requested_payload_json, '$.shareToLink.combineGiving') = 1
              AND r.status IN ('pending', 'under_review', 'returned', 'completed')
         )))
     ORDER BY h.display_name, p.preferred_name`,
    userId
  );
}

export async function stopHouseholdStatementSharing(env: DirectoryEnvironment, userId: string, invitationId: string) {
  const updated = await d1First(
    env,
    `
    UPDATE directory_household_invitations SET combine_giving = 0
     WHERE id = ?1 AND (created_by_user_id = ?2 OR claimed_by_user_id = ?2)
     RETURNING id`,
    invitationId,
    userId
  );
  if (!updated) throw new DirectoryServiceError('not_found', 'Statement sharing was not found.', 404);
}

async function tokenDigest(token: unknown) {
  const cleaned = cleanText(token, { required: true, max: 256, field: 'token' });
  return sha256Hex(`${TOKEN_DOMAIN}${cleaned}`);
}

function invitationStateError(row: DirectoryShareInvitationRow | null) {
  if (!row) return new DirectoryServiceError('invitation_not_found', 'This household link is not valid.', 404);
  if (row.status === 'claimed')
    return new DirectoryServiceError('invitation_already_claimed', 'This household link has already been used.', 409);
  if (row.status === 'cancelled')
    return new DirectoryServiceError('invitation_cancelled', 'This household link was cancelled.', 410);
  return new DirectoryServiceError(
    'invitation_expired',
    'This household link has expired. Ask your household member for a new link.',
    410
  );
}

async function loadInvitationByToken(env: DirectoryEnvironment, token: unknown) {
  const digest = await tokenDigest(token);
  const row = await d1First<DirectoryShareInvitationRow>(
    env,
    `SELECT i.*, h.display_name AS household_name, h.active AS household_active,
            p.preferred_name AS person_name, p.active AS person_active,
            hm.relationship, hm.active AS membership_active,
            COALESCE(f.is_child, 0) AS is_child,
            COALESCE(f.protected_person, 0) AS protected_person
       FROM directory_household_invitations i
       JOIN directory_households h ON h.id = i.household_id
       JOIN directory_people p ON p.id = i.person_id
       LEFT JOIN directory_household_members hm
         ON hm.household_id = i.household_id AND hm.person_id = i.person_id
       LEFT JOIN directory_person_privacy_flags f
         ON f.parish_id = i.parish_id AND f.person_id = i.person_id AND f.active = 1
      WHERE i.token = ?1`,
    digest
  );
  if (row?.status === 'pending' && Date.parse(row.expires_at) <= Date.now()) {
    await runAtomic(env, [
      {
        sql: "UPDATE directory_household_invitations SET status = 'expired' WHERE id = ?1 AND status = 'pending'",
        params: [row.id],
      },
    ]);
    row.status = 'expired';
  }
  return row;
}

function assertUsable(row: DirectoryShareInvitationRow | null): asserts row is DirectoryShareInvitationRow {
  if (!row || row.status !== 'pending') throw invitationStateError(row);
  if (!Number(row.household_active) || !Number(row.person_active) || !Number(row.membership_active)) {
    throw new DirectoryServiceError(
      'invitation_no_longer_eligible',
      'This person is no longer an active member of that household.',
      409
    );
  }
  if (Number(row.is_child) || Number(row.protected_person)) {
    throw new DirectoryServiceError(
      'invitation_no_longer_eligible',
      'This household link cannot be used for this person.',
      409
    );
  }
}

export async function createHouseholdShareInvitation(
  env: DirectoryEnvironment,
  {
    context,
    householdId,
    personId,
    combineGiving,
    correlationId = '',
  }: {
    context: DirectorySelfContext;
    householdId: string;
    personId: string;
    combineGiving?: unknown;
    correlationId?: string;
  }
) {
  const managed = context.manageableHouseholds?.find((household) => household.id === householdId);
  if (!managed || !context.currentPerson?.id) {
    throw new DirectoryServiceError('forbidden', 'You cannot create links for this household.', 403);
  }
  if (!(await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson.id }))) {
    throw new DirectoryServiceError(
      'forbidden',
      'Only an active household administrator can share household links.',
      403
    );
  }
  if (personId === context.currentPerson.id) {
    throw new DirectoryServiceError('validation_failed', 'Your account is already connected to you.', 422);
  }
  const member = await d1First<{ preferred_name: string; [field: string]: unknown }>(
    env,
    `SELECT p.preferred_name, hm.relationship,
            COALESCE(f.is_child, 0) AS is_child,
            COALESCE(f.protected_person, 0) AS protected_person,
            EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.active = 1) AS account_linked
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f
         ON f.parish_id = ?3 AND f.person_id = p.id AND f.active = 1
      WHERE hm.household_id = ?1 AND hm.person_id = ?2 AND hm.active = 1`,
    householdId,
    personId,
    managed.parishId
  );
  if (!member) throw new DirectoryServiceError('not_found', 'That household member was not found.', 404);
  if (Number(member.is_child) || Number(member.protected_person)) {
    throw new DirectoryServiceError(
      'forbidden',
      'Household share links are available only for unprotected adults.',
      403
    );
  }
  if (Number(member.account_linked)) {
    throw new DirectoryServiceError('already_connected', 'That household member already has a connected account.', 409);
  }

  const id = generateSecret('dir_household_inv');
  const rawToken = randomHex(32);
  const digest = await tokenDigest(rawToken);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();
  const actor = { userId: context.user.id, personId: context.currentPerson.id, parishId: managed.parishId };
  await runAtomic(env, [
    {
      sql: `UPDATE directory_household_invitations
               SET status = 'cancelled'
             WHERE household_id = ?1 AND person_id = ?2 AND status = 'pending'`,
      params: [householdId, personId],
    },
    {
      sql: `INSERT INTO directory_household_invitations
              (id, parish_id, household_id, person_id, token, created_by_user_id,
               status, created_at, expires_at, combine_giving)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      params: [
        id,
        managed.parishId,
        householdId,
        personId,
        digest,
        context.user.id,
        createdAt,
        expiresAt,
        combineGiving === true ? 1 : 0,
      ],
    },
    auditStatement({
      action: 'directory.household_share.created',
      actor,
      parishId: managed.parishId,
      targetType: 'directory_household_invitation',
      targetId: id,
      householdId,
      after: { personId, expiresAt },
      correlationId,
    }),
  ]);
  return {
    id,
    personId,
    personName: member.preferred_name,
    expiresAt,
    sharePath: `/myagapay/join-household?token=${encodeURIComponent(rawToken)}`,
  };
}

export async function inspectHouseholdShareInvitation(env: DirectoryEnvironment, { token }: { token: unknown }) {
  const row = await loadInvitationByToken(env, token);
  assertUsable(row);
  return {
    id: row.id,
    personName: row.person_name,
    householdName: row.household_name,
    expiresAt: row.expires_at,
    combineGivingOffered: row.combine_giving === 1,
    status: row.status,
  };
}

export function householdShareApprovalStatement({
  parishId,
  householdId,
  personId,
  invitationId,
  claimantUserId,
  timestamp,
}: {
  parishId: string;
  householdId: string;
  personId: string;
  invitationId: string;
  claimantUserId: string;
  timestamp: number;
}) {
  return {
    sql: `INSERT INTO directory_person_links
            (id, person_id, link_type, external_id, active, source, claim_id, created_at, updated_at)
          VALUES (
            ?1,
            (
              SELECT i.person_id
                FROM directory_household_invitations i
               WHERE i.id = ?2 AND i.parish_id = ?3 AND i.household_id = ?4 AND i.person_id = ?5
                 AND i.status = 'claimed' AND i.claimed_by_user_id = ?6
                 AND NOT EXISTS (
                   SELECT 1 FROM directory_person_links l
                    WHERE l.link_type = 'platform_user' AND l.active = 1
                      AND l.external_id = ?6 AND l.person_id <> ?5
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM directory_person_links l
                    WHERE l.link_type = 'platform_user' AND l.active = 1
                      AND l.person_id = ?5 AND l.external_id <> ?6
                 )
            ),
            'platform_user', ?6, 1, 'household_share_review', ?2, ?7, ?7
          )`,
    params: [
      `dir_household_share_${invitationId}`,
      invitationId,
      parishId,
      householdId,
      personId,
      claimantUserId,
      timestamp,
    ],
  };
}

export async function claimHouseholdShareInvitation(
  env: DirectoryEnvironment,
  {
    context,
    token,
    combineGiving,
    correlationId = '',
  }: { context: DirectorySelfContext; token: unknown; combineGiving?: unknown; correlationId?: string }
) {
  if (!context.user?.id)
    throw new DirectoryServiceError('unauthorized', 'Sign in before using this household link.', 401);
  const row = await loadInvitationByToken(env, token);
  assertUsable(row);

  const existingTargetLink = await d1First(
    env,
    "SELECT external_id FROM directory_person_links WHERE person_id = ?1 AND link_type = 'platform_user' AND active = 1 LIMIT 1",
    row.person_id
  );
  if (existingTargetLink?.external_id === context.user.id) {
    throw new DirectoryServiceError(
      'already_connected',
      'Your account is already connected to this household member.',
      409
    );
  }
  if (existingTargetLink) {
    throw new DirectoryServiceError(
      'person_already_connected',
      'This household member is already connected to another account. Parish staff can help resolve it.',
      409
    );
  }

  const claimantLink = await d1First(
    env,
    `SELECT l.person_id,
            EXISTS(
              SELECT 1 FROM directory_household_members hm
               WHERE hm.person_id = l.person_id AND hm.active = 1 AND hm.household_id <> ?2
            ) AS different_household
       FROM directory_person_links l
      WHERE l.link_type = 'platform_user' AND l.external_id = ?1 AND l.active = 1
      LIMIT 1`,
    context.user.id,
    row.household_id
  );
  const hasConflict = Boolean(
    claimantLink && (claimantLink.person_id !== row.person_id || Number(claimantLink.different_household))
  );
  const conflictMessage = hasConflict
    ? 'CONFLICT: claiming account is already connected to a different directory person or household; staff must resolve identity before approval.'
    : '';
  const summary = hasConflict
    ? `${conflictMessage} Review account link for ${row.person_name} in ${row.household_name}.`
    : `Review account link for ${row.person_name} in ${row.household_name}; submitted from a household share link.`;
  const requestId = generateSecret('dir_req');
  const timestamp = Date.now();
  const requester = await d1First<{ person_id: string }>(
    env,
    "SELECT person_id FROM directory_person_links WHERE link_type = 'platform_user' AND external_id = ?1 AND active = 1 LIMIT 1",
    row.created_by_user_id
  );
  if (!requester?.person_id) {
    throw new DirectoryServiceError(
      'inviter_no_longer_authorized',
      'The person who shared this link is no longer connected. Ask parish staff for help.',
      409
    );
  }
  const payload = {
    personId: row.person_id,
    relationship: row.relationship || 'other',
    shareToLink: {
      invitationId: row.id,
      claimantUserId: context.user.id,
      combineGiving: row.combine_giving === 1 && combineGiving === true,
      existingHouseholdConflict: hasConflict,
      conflictMessage,
    },
  };
  const actor = { userId: context.user.id, personId: context.currentPerson?.id || null, parishId: row.parish_id };
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_change_requests
              (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
               household_id, request_type, status, summary, requested_payload_json, created_at, updated_at)
            VALUES (
              ?1,
              (SELECT parish_id FROM directory_household_invitations
                WHERE id = ?2 AND parish_id = ?3 AND household_id = ?4 AND person_id = ?5
                  AND status = 'pending' AND expires_at > datetime('now')),
              ?6, ?7, 'household', ?4, ?4, 'household_membership_add', 'pending', ?8, ?9, ?10, ?10
            )`,
      params: [
        requestId,
        row.id,
        row.parish_id,
        row.household_id,
        row.person_id,
        row.created_by_user_id,
        requester.person_id,
        summary.slice(0, 240),
        safeJson(payload) || '{}',
        timestamp,
      ],
    },
    {
      sql: `UPDATE directory_household_invitations
               SET status = 'claimed', claimed_by_user_id = ?1, claimed_at = ?2
             WHERE id = ?3 AND status = 'pending' AND expires_at > datetime('now')`,
      params: [context.user.id, new Date().toISOString(), row.id],
    },
    auditStatement({
      action: 'directory.household_share.claimed_for_review',
      actor,
      parishId: row.parish_id,
      targetType: 'directory_household_invitation',
      targetId: row.id,
      householdId: row.household_id,
      after: { requestId, personId: row.person_id, existingHouseholdConflict: hasConflict },
      correlationId,
    }),
  ]);
  const createdRequest = await d1First(env, 'SELECT id FROM directory_change_requests WHERE id = ?1', requestId);
  if (!createdRequest) {
    throw new DirectoryServiceError('invitation_already_claimed', 'This household link has already been used.', 409);
  }
  return {
    requestId,
    status: 'pending_review',
    conflictFlagged: hasConflict,
    message:
      'Your request was submitted for parish review. Your account is not connected unless parish staff approves it.',
  };
}
