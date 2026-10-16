import type { MinistryContext, MinistrySqlRow } from './ministries-contracts.js';

import { d1All, d1First, generateSecret, loadDonor, normalizeEmail } from '../lib/core.js';

import { ensurePlatformUser } from '../lib/identity.js';

import { DirectoryServiceError } from './foundation.js';

import { getDirectorySettings } from './settings.js';

import { getPersonPrivacyFlags } from './privacy.js';

import { assertParishActor, auditStatement, cleanText, DIRECTORY_CAPABILITIES, nowMs, runAtomic } from './shared.js';
export {
  d1All,
  d1First,
  generateSecret,
  loadDonor,
  normalizeEmail,
  ensurePlatformUser,
  DirectoryServiceError,
  getDirectorySettings,
  getPersonPrivacyFlags,
  assertParishActor,
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  nowMs,
  runAtomic,
};

export const MINISTRY_CATEGORIES = Object.freeze([
  'liturgical',
  'educational',
  'charitable',
  'hospitality',
  'administrative',
  'maintenance',
  'youth',
  'fellowship',
  'outreach',
  'bookstore',
  'committee',
  'other',
]);

export const MINISTRY_STATUSES = Object.freeze(['draft', 'active', 'paused', 'archived']);

export const MINISTRY_VISIBILITIES = Object.freeze(['staff_only', 'parish_members', 'participants_only', 'hidden']);

export const MINISTRY_REQUEST_POLICIES = Object.freeze(['closed', 'request_interest', 'administrator_assignment_only']);

export const MINISTRY_LEADERSHIP_TYPES = Object.freeze([
  'leader',
  'assistant_leader',
  'clergy_liaison',
  'coordinator',
  'administrator',
]);

export const MINISTRY_PARTICIPATION_TYPES = Object.freeze(['participant', 'volunteer', 'member', 'helper', 'advisor']);

export const MANAGE_CAPS = [
  DIRECTORY_CAPABILITIES.ministriesManage,
  DIRECTORY_CAPABILITIES.assignmentsManage,
  DIRECTORY_CAPABILITIES.manage,
];

export const REVIEW_CAPS = [
  DIRECTORY_CAPABILITIES.ministryInterestReview,
  DIRECTORY_CAPABILITIES.requestsReview,
  DIRECTORY_CAPABILITIES.manage,
];

export function parishIdFor(context: MinistryContext) {
  return (context.parishId ||
    context.activeParishContexts?.[0]?.parishId ||
    context.manageableHouseholds?.[0]?.parishId ||
    '') as string;
}

export function personIdFor(context: MinistryContext) {
  return (context.personId || context.currentPerson?.id || '') as string;
}

export function hasAny(context: MinistryContext, caps: readonly string[]) {
  return caps.some((capability) => ((context.capabilities || []) as readonly string[]).includes(capability));
}

export function actorFromContext(context: MinistryContext) {
  const parishId = parishIdFor(context);
  return {
    userId: context.user!.id,
    parishId,
    capabilities: context.capabilities || [],
    personId: personIdFor(context),
  };
}

export function requireManage(context: MinistryContext) {
  return assertParishActor(actorFromContext(context), parishIdFor(context), MANAGE_CAPS);
}

export function requireReview(context: MinistryContext) {
  return assertParishActor(actorFromContext(context), parishIdFor(context), REVIEW_CAPS);
}

export function parishProfileCandidateId(email: unknown) {
  return `parish-profile:${normalizeEmail(email)}`;
}

export function parishProfileEmail(candidateId: unknown) {
  const value = String(candidateId || '');
  return value.startsWith('parish-profile:') ? normalizeEmail(value.slice('parish-profile:'.length)) : '';
}

export function enumValue(value: unknown, allowed: readonly string[], field: string, fallback: string = '') {
  const cleaned = cleanText(value || fallback, { required: !fallback, max: 80, field });
  if (!allowed.includes(cleaned!)) throw new DirectoryServiceError('validation_failed', `${field} is not supported.`);
  return cleaned!;
}

export function slugify(value: unknown) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug) throw new DirectoryServiceError('validation_failed', 'Ministry slug is required.');
  return slug;
}

export function ministryDto(row: MinistrySqlRow | null, extras: Record<string, unknown> = {}) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    canonicalName: row.canonical_name,
    displayName: row.display_name,
    slug: row.slug,
    shortDescription: row.short_description || '',
    detailedDescription: row.detailed_description || '',
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    requestPolicy: row.request_policy,
    participantPublicationPolicy: row.participant_publication_policy,
    leaderPublicationPolicy: row.leader_publication_policy,
    childParticipationPolicy: row.child_participation_policy,
    displayOrder: Number(row.display_order || 100),
    active: row.status === 'active',
    acceptingInterest: row.status === 'active' && row.request_policy === 'request_interest',
    hasImage: Boolean(row.image_storage_key),
    imageUrl: row.image_storage_key ? `/api/donor/groups/${encodeURIComponent(row.id)}/image` : '',
    imageUpdatedAt: Number(row.image_updated_at || 0),
    version: `${row.updated_at || ''}:${row.revision || 1}`,
    ...extras,
  };
}

export function leaderDto(row: MinistrySqlRow) {
  return {
    id: row.id,
    ministryId: row.ministry_id,
    personId: row.person_id,
    displayName: row.preferred_name || 'Parish member',
    assignmentType: row.assignment_type,
    published: row.publication_state === 'published',
    version: `${row.updated_at || ''}:${row.revision || 1}`,
  };
}

export function participantDto(row: MinistrySqlRow) {
  return {
    id: row.id,
    ministryId: row.ministry_id,
    personId: row.person_id,
    displayName: row.preferred_name || 'Parish member',
    status: row.status,
    participationType: row.participation_type,
    publicationPreference: row.publication_preference,
    approvedPublication: Number(row.approved_publication || 0) === 1,
    source: row.source,
    version: `${row.updated_at || ''}:${row.revision || 1}`,
  };
}

export function requestDto(row: MinistrySqlRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    ministryId: row.ministry_id,
    ministryName: row.display_name || '',
    personId: row.person_id,
    requesterUserId: row.requester_user_id,
    requesterPersonId: row.requester_person_id,
    displayName: row.preferred_name || 'Parishioner',
    interestType: row.interest_type,
    memberNote: row.member_note || '',
    reviewerNote: row.reviewer_note || '',
    status: row.status,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    version: `${row.updated_at || ''}:${row.revision || 1}`,
  };
}

export async function resolvePersonAlias(
  env: Partial<Env>,
  { parishId, personId }: { parishId: string; personId?: unknown }
) {
  let current = cleanText(personId, { required: true, max: 180, field: 'personId' });
  const seen = new Set();
  for (let i = 0; i < 8; i += 1) {
    if (seen.has(current)) throw new DirectoryServiceError('alias_loop', 'Directory alias resolution failed.', 409);
    seen.add(current);
    const alias = await d1First<MinistrySqlRow>(
      env,
      "SELECT survivor_entity_id FROM directory_merge_aliases WHERE parish_id = ?1 AND entity_type = 'person' AND old_entity_id = ?2 AND active = 1",
      parishId,
      current
    ).catch(() => null);
    if (!alias) return current as string;
    current = alias.survivor_entity_id;
  }
  throw new DirectoryServiceError('alias_loop', 'Directory alias resolution failed.', 409);
}

export async function loadMinistry(
  env: Partial<Env>,
  { parishId, ministryId = '', slug = '' }: { parishId: string; ministryId?: unknown; slug?: string }
) {
  const row = ministryId
    ? await d1First<MinistrySqlRow>(
        env,
        'SELECT * FROM directory_ministries WHERE parish_id = ?1 AND id = ?2',
        parishId,
        ministryId
      )
    : await d1First<MinistrySqlRow>(
        env,
        'SELECT * FROM directory_ministries WHERE parish_id = ?1 AND slug = ?2',
        parishId,
        slug
      );
  if (!row) throw new DirectoryServiceError('not_found', 'Ministry was not found.', 404);
  return row;
}

export async function loadAdultPerson(
  env: Partial<Env>,
  { parishId, personId, allowProtected = false }: { parishId: string; personId?: unknown; allowProtected?: boolean }
) {
  const resolvedId = await resolvePersonAlias(env, { parishId, personId });
  const row = await d1First<MinistrySqlRow>(
    env,
    `SELECT p.* FROM directory_people p
      WHERE p.id = ?1 AND p.active = 1 AND (
        p.created_by_parish_id = ?2
        OR EXISTS (SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id = p.id AND a.parish_id = ?2 AND a.active = 1 AND a.status != 'former_member')
        OR EXISTS (SELECT 1 FROM directory_household_members hm JOIN directory_households h ON h.id = hm.household_id WHERE hm.person_id = p.id AND hm.active = 1 AND h.active = 1 AND h.parish_id = ?2)
      )`,
    resolvedId,
    parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Directory person was not found for this parish.', 404);
  const flags = await getPersonPrivacyFlags(env, { parishId, personId: resolvedId as string });
  if (flags.isChild)
    throw new DirectoryServiceError(
      'child_not_allowed',
      'Children are excluded from Phase 5A ministry participation.',
      403
    );
  if (flags.protectedPerson && !allowProtected)
    throw new DirectoryServiceError(
      'protected_person_denied',
      'Protected people are excluded from this ministry workflow.',
      403
    );
  return { ...row, id: resolvedId, flags };
}

export async function isParticipant(
  env: Partial<Env>,
  { parishId, ministryId, personId }: { parishId: string; ministryId: unknown; personId?: unknown }
) {
  const row = await d1First<MinistrySqlRow>(
    env,
    "SELECT id FROM directory_ministry_participants WHERE parish_id = ?1 AND ministry_id = ?2 AND person_id = ?3 AND status IN ('active', 'paused')",
    parishId,
    ministryId,
    personId
  );
  return Boolean(row);
}

export function memberCanSeeMinistry(ministry: MinistrySqlRow, context: MinistryContext, participant: boolean = false) {
  if (
    hasAny(context, [
      DIRECTORY_CAPABILITIES.view,
      DIRECTORY_CAPABILITIES.ministriesManage,
      DIRECTORY_CAPABILITIES.manage,
    ])
  )
    return true;
  if (ministry.status === 'archived' || ministry.status === 'draft') return false;
  if (ministry.visibility === 'hidden' || ministry.visibility === 'staff_only') return false;
  if (ministry.visibility === 'participants_only') return participant;
  return ministry.visibility === 'parish_members';
}

export async function visibleLeaders(env: Partial<Env>, context: MinistryContext, ministryId: string) {
  const rows = await d1All<MinistrySqlRow>(
    env,
    `SELECT ml.*, p.preferred_name, COALESCE(f.protected_person, 0) AS protected_person, COALESCE(f.is_child, 0) AS is_child
       FROM directory_ministry_leaders ml
       JOIN directory_people p ON p.id = ml.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ml.parish_id AND f.person_id = ml.person_id AND f.active = 1
      WHERE ml.parish_id = ?1 AND ml.ministry_id = ?2 AND ml.active = 1 AND ml.publication_state = 'published'
      ORDER BY ml.assignment_type ASC, p.preferred_name ASC`,
    context.parishId,
    ministryId
  );
  return rows
    .filter((row) => Number(row.protected_person || 0) !== 1 && Number(row.is_child || 0) !== 1)
    .map(leaderDto);
}

export async function visibleParticipants(
  env: Partial<Env>,
  context: MinistryContext,
  ministryId: string,
  { includeList = false }: { includeList?: boolean } = {}
) {
  const rows = await d1All<MinistrySqlRow>(
    env,
    `SELECT mp.*, p.preferred_name, COALESCE(f.protected_person, 0) AS protected_person, COALESCE(f.is_child, 0) AS is_child
       FROM directory_ministry_participants mp
       JOIN directory_people p ON p.id = mp.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = mp.parish_id AND f.person_id = mp.person_id AND f.active = 1
      WHERE mp.parish_id = ?1 AND mp.ministry_id = ?2 AND mp.status = 'active'
        AND mp.publication_preference = 'directory' AND mp.approved_publication = 1
      ORDER BY p.preferred_name ASC
      LIMIT 100`,
    context.parishId,
    ministryId
  );
  const visible = rows.filter((row) => Number(row.protected_person || 0) !== 1 && Number(row.is_child || 0) !== 1);
  return includeList ? visible.map(participantDto) : visible.length;
}

export async function viewerStatus(env: Partial<Env>, context: MinistryContext, ministryId: string) {
  if (!context.personId) return { participant: false, request: null };
  const personId = personIdFor(context);
  const participant = await d1First<MinistrySqlRow>(
    env,
    "SELECT * FROM directory_ministry_participants WHERE parish_id = ?1 AND ministry_id = ?2 AND person_id = ?3 AND status IN ('active', 'paused')",
    context.parishId,
    ministryId,
    personId
  );
  const request = await d1First<MinistrySqlRow>(
    env,
    `SELECT r.*, m.display_name FROM directory_ministry_interest_requests r
       JOIN directory_ministries m ON m.id = r.ministry_id
      WHERE r.parish_id = ?1 AND r.ministry_id = ?2 AND r.person_id = ?3
      ORDER BY r.created_at DESC LIMIT 1`,
    context.parishId,
    ministryId,
    personId
  );
  return {
    participant: Boolean(participant),
    participation: participant ? participantDto({ ...participant, preferred_name: '' }) : null,
    request: requestDto(request),
  };
}

export function notificationStatement({
  context,
  recipientUserId,
  eventType,
  targetId,
  safeMessage,
}: {
  context: MinistryContext;
  recipientUserId: string;
  eventType: string;
  targetId: string;
  safeMessage: string;
}) {
  const parishId = parishIdFor(context);
  return {
    sql: `INSERT INTO directory_notification_events
            (id, parish_id, recipient_user_id, actor_user_id, event_type, target_type, target_id, safe_message, created_at)
          VALUES (?, ?, ?, ?, ?, 'directory_ministry_interest_request', ?, ?, ?)`,
    params: [
      generateSecret('dir_notify'),
      parishId,
      recipientUserId || null,
      context.user!.id,
      eventType,
      targetId,
      safeMessage,
      nowMs(),
    ],
  };
}
