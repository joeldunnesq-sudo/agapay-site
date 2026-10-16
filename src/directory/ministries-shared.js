// Generated from src/directory/ministries-shared.ts by npm run build:server. Do not edit.
import { d1All, d1First, generateSecret, loadDonor, normalizeEmail } from '../lib/core.js';
import { ensurePlatformUser } from '../lib/identity.js';
import { DirectoryServiceError } from './foundation.js';
import { getDirectorySettings } from './settings.js';
import { getPersonPrivacyFlags } from './privacy.js';
import { assertParishActor, auditStatement, cleanText, DIRECTORY_CAPABILITIES, nowMs, runAtomic } from './shared.js';
const MINISTRY_CATEGORIES = Object.freeze([
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
const MINISTRY_STATUSES = Object.freeze(['draft', 'active', 'paused', 'archived']);
const MINISTRY_VISIBILITIES = Object.freeze(['staff_only', 'parish_members', 'participants_only', 'hidden']);
const MINISTRY_REQUEST_POLICIES = Object.freeze(['closed', 'request_interest', 'administrator_assignment_only']);
const MINISTRY_LEADERSHIP_TYPES = Object.freeze([
  'leader',
  'assistant_leader',
  'clergy_liaison',
  'coordinator',
  'administrator',
]);
const MINISTRY_PARTICIPATION_TYPES = Object.freeze(['participant', 'volunteer', 'member', 'helper', 'advisor']);
const MANAGE_CAPS = [
  DIRECTORY_CAPABILITIES.ministriesManage,
  DIRECTORY_CAPABILITIES.assignmentsManage,
  DIRECTORY_CAPABILITIES.manage,
];
const REVIEW_CAPS = [
  DIRECTORY_CAPABILITIES.ministryInterestReview,
  DIRECTORY_CAPABILITIES.requestsReview,
  DIRECTORY_CAPABILITIES.manage,
];
function parishIdFor(context) {
  return (
    context.parishId || context.activeParishContexts?.[0]?.parishId || context.manageableHouseholds?.[0]?.parishId || ''
  );
}
function personIdFor(context) {
  return context.personId || context.currentPerson?.id || '';
}
function hasAny(context, caps) {
  return caps.some((capability) => (context.capabilities || []).includes(capability));
}
function actorFromContext(context) {
  const parishId = parishIdFor(context);
  return {
    userId: context.user.id,
    parishId,
    capabilities: context.capabilities || [],
    personId: personIdFor(context),
  };
}
function requireManage(context) {
  return assertParishActor(actorFromContext(context), parishIdFor(context), MANAGE_CAPS);
}
function requireReview(context) {
  return assertParishActor(actorFromContext(context), parishIdFor(context), REVIEW_CAPS);
}
function parishProfileCandidateId(email) {
  return `parish-profile:${normalizeEmail(email)}`;
}
function parishProfileEmail(candidateId) {
  const value = String(candidateId || '');
  return value.startsWith('parish-profile:') ? normalizeEmail(value.slice('parish-profile:'.length)) : '';
}
function enumValue(value, allowed, field, fallback = '') {
  const cleaned = cleanText(value || fallback, { required: !fallback, max: 80, field });
  if (!allowed.includes(cleaned)) throw new DirectoryServiceError('validation_failed', `${field} is not supported.`);
  return cleaned;
}
function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug) throw new DirectoryServiceError('validation_failed', 'Ministry slug is required.');
  return slug;
}
function ministryDto(row, extras = {}) {
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
function leaderDto(row) {
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
function participantDto(row) {
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
function requestDto(row) {
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
async function resolvePersonAlias(env, { parishId, personId }) {
  let current = cleanText(personId, { required: true, max: 180, field: 'personId' });
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < 8; i += 1) {
    if (seen.has(current)) throw new DirectoryServiceError('alias_loop', 'Directory alias resolution failed.', 409);
    seen.add(current);
    const alias = await d1First(
      env,
      "SELECT survivor_entity_id FROM directory_merge_aliases WHERE parish_id = ?1 AND entity_type = 'person' AND old_entity_id = ?2 AND active = 1",
      parishId,
      current
    ).catch(() => null);
    if (!alias) return current;
    current = alias.survivor_entity_id;
  }
  throw new DirectoryServiceError('alias_loop', 'Directory alias resolution failed.', 409);
}
async function loadMinistry(env, { parishId, ministryId = '', slug = '' }) {
  const row = ministryId
    ? await d1First(env, 'SELECT * FROM directory_ministries WHERE parish_id = ?1 AND id = ?2', parishId, ministryId)
    : await d1First(env, 'SELECT * FROM directory_ministries WHERE parish_id = ?1 AND slug = ?2', parishId, slug);
  if (!row) throw new DirectoryServiceError('not_found', 'Ministry was not found.', 404);
  return row;
}
async function loadAdultPerson(env, { parishId, personId, allowProtected = false }) {
  const resolvedId = await resolvePersonAlias(env, { parishId, personId });
  const row = await d1First(
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
  const flags = await getPersonPrivacyFlags(env, { parishId, personId: resolvedId });
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
async function isParticipant(env, { parishId, ministryId, personId }) {
  const row = await d1First(
    env,
    "SELECT id FROM directory_ministry_participants WHERE parish_id = ?1 AND ministry_id = ?2 AND person_id = ?3 AND status IN ('active', 'paused')",
    parishId,
    ministryId,
    personId
  );
  return Boolean(row);
}
function memberCanSeeMinistry(ministry, context, participant = false) {
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
async function visibleLeaders(env, context, ministryId) {
  const rows = await d1All(
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
async function visibleParticipants(env, context, ministryId, { includeList = false } = {}) {
  const rows = await d1All(
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
async function viewerStatus(env, context, ministryId) {
  if (!context.personId) return { participant: false, request: null };
  const personId = personIdFor(context);
  const participant = await d1First(
    env,
    "SELECT * FROM directory_ministry_participants WHERE parish_id = ?1 AND ministry_id = ?2 AND person_id = ?3 AND status IN ('active', 'paused')",
    context.parishId,
    ministryId,
    personId
  );
  const request = await d1First(
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
function notificationStatement({ context, recipientUserId, eventType, targetId, safeMessage }) {
  const parishId = parishIdFor(context);
  return {
    sql: `INSERT INTO directory_notification_events
            (id, parish_id, recipient_user_id, actor_user_id, event_type, target_type, target_id, safe_message, created_at)
          VALUES (?, ?, ?, ?, ?, 'directory_ministry_interest_request', ?, ?, ?)`,
    params: [
      generateSecret('dir_notify'),
      parishId,
      recipientUserId || null,
      context.user.id,
      eventType,
      targetId,
      safeMessage,
      nowMs(),
    ],
  };
}
export {
  DIRECTORY_CAPABILITIES,
  DirectoryServiceError,
  MANAGE_CAPS,
  MINISTRY_CATEGORIES,
  MINISTRY_LEADERSHIP_TYPES,
  MINISTRY_PARTICIPATION_TYPES,
  MINISTRY_REQUEST_POLICIES,
  MINISTRY_STATUSES,
  MINISTRY_VISIBILITIES,
  REVIEW_CAPS,
  actorFromContext,
  assertParishActor,
  auditStatement,
  cleanText,
  d1All,
  d1First,
  ensurePlatformUser,
  enumValue,
  generateSecret,
  getDirectorySettings,
  getPersonPrivacyFlags,
  hasAny,
  isParticipant,
  leaderDto,
  loadAdultPerson,
  loadDonor,
  loadMinistry,
  memberCanSeeMinistry,
  ministryDto,
  normalizeEmail,
  notificationStatement,
  nowMs,
  parishIdFor,
  parishProfileCandidateId,
  parishProfileEmail,
  participantDto,
  personIdFor,
  requestDto,
  requireManage,
  requireReview,
  resolvePersonAlias,
  runAtomic,
  slugify,
  viewerStatus,
  visibleLeaders,
  visibleParticipants,
};
