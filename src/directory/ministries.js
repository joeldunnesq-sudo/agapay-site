import { d1All, d1First, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { getDirectorySettings } from "./settings.js";
import { getPersonPrivacyFlags } from "./privacy.js";
import {
  assertParishActor,
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  nowMs,
  runAtomic
} from "./shared.js";

export const MINISTRY_CATEGORIES = Object.freeze([
  "liturgical", "educational", "charitable", "hospitality", "administrative",
  "maintenance", "youth", "fellowship", "outreach", "bookstore", "committee", "other"
]);
export const MINISTRY_STATUSES = Object.freeze(["draft", "active", "paused", "archived"]);
export const MINISTRY_VISIBILITIES = Object.freeze(["staff_only", "parish_members", "participants_only", "hidden"]);
export const MINISTRY_REQUEST_POLICIES = Object.freeze(["closed", "request_interest", "administrator_assignment_only"]);
export const MINISTRY_LEADERSHIP_TYPES = Object.freeze(["leader", "assistant_leader", "clergy_liaison", "coordinator", "administrator"]);
export const MINISTRY_PARTICIPATION_TYPES = Object.freeze(["participant", "volunteer", "member", "helper", "advisor"]);

const MANAGE_CAPS = [DIRECTORY_CAPABILITIES.ministriesManage, DIRECTORY_CAPABILITIES.assignmentsManage, DIRECTORY_CAPABILITIES.manage];
const REVIEW_CAPS = [DIRECTORY_CAPABILITIES.ministryInterestReview, DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.manage];

function parishIdFor(context) {
  return context.parishId || context.activeParishContexts?.[0]?.parishId || context.manageableHouseholds?.[0]?.parishId || "";
}

function personIdFor(context) {
  return context.personId || context.currentPerson?.id || "";
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
    personId: personIdFor(context)
  };
}

function requireManage(context) {
  return assertParishActor(actorFromContext(context), parishIdFor(context), MANAGE_CAPS);
}

function requireReview(context) {
  return assertParishActor(actorFromContext(context), parishIdFor(context), REVIEW_CAPS);
}

function enumValue(value, allowed, field, fallback = "") {
  const cleaned = cleanText(value || fallback, { required: !fallback, max: 80, field });
  if (!allowed.includes(cleaned)) throw new DirectoryServiceError("validation_failed", `${field} is not supported.`);
  return cleaned;
}

function slugify(value) {
  const slug = String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug) throw new DirectoryServiceError("validation_failed", "Ministry slug is required.");
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
    shortDescription: row.short_description || "",
    detailedDescription: row.detailed_description || "",
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    requestPolicy: row.request_policy,
    participantPublicationPolicy: row.participant_publication_policy,
    leaderPublicationPolicy: row.leader_publication_policy,
    childParticipationPolicy: row.child_participation_policy,
    displayOrder: Number(row.display_order || 100),
    active: row.status === "active",
    acceptingInterest: row.status === "active" && row.request_policy === "request_interest",
    version: `${row.updated_at || ""}:${row.revision || 1}`,
    ...extras
  };
}

function leaderDto(row) {
  return {
    id: row.id,
    ministryId: row.ministry_id,
    personId: row.person_id,
    displayName: row.preferred_name || "Parish member",
    assignmentType: row.assignment_type,
    published: row.publication_state === "published",
    version: `${row.updated_at || ""}:${row.revision || 1}`
  };
}

function participantDto(row) {
  return {
    id: row.id,
    ministryId: row.ministry_id,
    personId: row.person_id,
    displayName: row.preferred_name || "Parish member",
    status: row.status,
    participationType: row.participation_type,
    publicationPreference: row.publication_preference,
    approvedPublication: Number(row.approved_publication || 0) === 1,
    source: row.source,
    version: `${row.updated_at || ""}:${row.revision || 1}`
  };
}

function requestDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    ministryId: row.ministry_id,
    ministryName: row.display_name || "",
    personId: row.person_id,
    requesterUserId: row.requester_user_id,
    requesterPersonId: row.requester_person_id,
    interestType: row.interest_type,
    memberNote: row.member_note || "",
    reviewerNote: row.reviewer_note || "",
    status: row.status,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    version: `${row.updated_at || ""}:${row.revision || 1}`
  };
}

async function resolvePersonAlias(env, { parishId, personId }) {
  let current = cleanText(personId, { required: true, max: 180, field: "personId" });
  const seen = new Set();
  for (let i = 0; i < 8; i += 1) {
    if (seen.has(current)) throw new DirectoryServiceError("alias_loop", "Directory alias resolution failed.", 409);
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
  throw new DirectoryServiceError("alias_loop", "Directory alias resolution failed.", 409);
}

async function loadMinistry(env, { parishId, ministryId = "", slug = "" }) {
  const row = ministryId
    ? await d1First(env, "SELECT * FROM directory_ministries WHERE parish_id = ?1 AND id = ?2", parishId, ministryId)
    : await d1First(env, "SELECT * FROM directory_ministries WHERE parish_id = ?1 AND slug = ?2", parishId, slug);
  if (!row) throw new DirectoryServiceError("not_found", "Ministry was not found.", 404);
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
  if (!row) throw new DirectoryServiceError("not_found", "Directory person was not found for this parish.", 404);
  const flags = await getPersonPrivacyFlags(env, { parishId, personId: resolvedId });
  if (flags.isChild) throw new DirectoryServiceError("child_not_allowed", "Children are excluded from Phase 5A ministry participation.", 403);
  if (flags.protectedPerson && !allowProtected) throw new DirectoryServiceError("protected_person_denied", "Protected people are excluded from this ministry workflow.", 403);
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
  if (hasAny(context, [DIRECTORY_CAPABILITIES.view, DIRECTORY_CAPABILITIES.ministriesManage, DIRECTORY_CAPABILITIES.manage])) return true;
  if (ministry.status === "archived" || ministry.status === "draft") return false;
  if (ministry.visibility === "hidden" || ministry.visibility === "staff_only") return false;
  if (ministry.visibility === "participants_only") return participant;
  return ministry.visibility === "parish_members";
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
  return rows.filter((row) => Number(row.protected_person || 0) !== 1 && Number(row.is_child || 0) !== 1).map(leaderDto);
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
  const participant = await d1First(env, "SELECT * FROM directory_ministry_participants WHERE parish_id = ?1 AND ministry_id = ?2 AND person_id = ?3 AND status IN ('active', 'paused')", context.parishId, ministryId, personId);
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
  return { participant: Boolean(participant), participation: participant ? participantDto({ ...participant, preferred_name: "" }) : null, request: requestDto(request) };
}

export async function createMinistry(env, { context, data = {}, correlationId = "" }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const name = cleanText(data.displayName || data.canonicalName, { required: true, max: 160, field: "displayName" });
  const canonicalName = cleanText(data.canonicalName || name, { required: true, max: 160, field: "canonicalName" });
  const slug = slugify(data.slug || name);
  const category = enumValue(data.category, MINISTRY_CATEGORIES, "category", "other");
  const status = enumValue(data.status, MINISTRY_STATUSES, "status", "draft");
  const visibility = enumValue(data.visibility, MINISTRY_VISIBILITIES, "visibility", "parish_members");
  const requestPolicy = enumValue(data.requestPolicy, MINISTRY_REQUEST_POLICIES, "requestPolicy", "closed");
  const timestamp = nowMs();
  const id = generateSecret("dir_ministry");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministries
              (id, parish_id, canonical_name, display_name, slug, short_description, detailed_description,
               category, status, visibility, request_policy, participant_publication_policy,
               leader_publication_policy, child_participation_policy, display_order,
               created_by_user_id, updated_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'excluded', ?, ?, ?, ?, ?)`,
      params: [
        id, parishId, canonicalName, name, slug,
        cleanText(data.shortDescription, { max: 300 }),
        cleanText(data.detailedDescription, { max: 1200 }),
        category, status, visibility, requestPolicy,
        enumValue(data.participantPublicationPolicy, ["hidden", "opt_in_reviewed", "leaders_only"], "participantPublicationPolicy", "opt_in_reviewed"),
        enumValue(data.leaderPublicationPolicy, ["hidden", "reviewed"], "leaderPublicationPolicy", "reviewed"),
        Number(data.displayOrder || 100), actor.userId, actor.userId, timestamp, timestamp
      ]
    },
    auditStatement({ action: "directory.ministry.created", actor, parishId, targetType: "directory_ministry", targetId: id, after: { name, status, visibility, requestPolicy }, correlationId })
  ]);
  return getMinistryAdmin(env, { context, ministryId: id });
}

export async function updateMinistry(env, { context, ministryId, patch = {}, correlationId = "" }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await loadMinistry(env, { parishId, ministryId });
  if (patch.expectedVersion && patch.expectedVersion !== ministryDto(row).version) throw new DirectoryServiceError("stale_record", "Ministry changed. Refresh before updating.", 409);
  const next = {
    canonicalName: cleanText(patch.canonicalName ?? row.canonical_name, { required: true, max: 160, field: "canonicalName" }),
    displayName: cleanText(patch.displayName ?? row.display_name, { required: true, max: 160, field: "displayName" }),
    slug: patch.slug ? slugify(patch.slug) : row.slug,
    shortDescription: cleanText(patch.shortDescription ?? row.short_description, { max: 300 }),
    detailedDescription: cleanText(patch.detailedDescription ?? row.detailed_description, { max: 1200 }),
    category: enumValue(patch.category ?? row.category, MINISTRY_CATEGORIES, "category"),
    status: enumValue(patch.status ?? row.status, MINISTRY_STATUSES, "status"),
    visibility: enumValue(patch.visibility ?? row.visibility, MINISTRY_VISIBILITIES, "visibility"),
    requestPolicy: enumValue(patch.requestPolicy ?? row.request_policy, MINISTRY_REQUEST_POLICIES, "requestPolicy"),
    participantPublicationPolicy: enumValue(patch.participantPublicationPolicy ?? row.participant_publication_policy, ["hidden", "opt_in_reviewed", "leaders_only"], "participantPublicationPolicy"),
    leaderPublicationPolicy: enumValue(patch.leaderPublicationPolicy ?? row.leader_publication_policy, ["hidden", "reviewed"], "leaderPublicationPolicy"),
    displayOrder: Number(patch.displayOrder ?? row.display_order ?? 100)
  };
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `UPDATE directory_ministries
               SET canonical_name = ?, display_name = ?, slug = ?, short_description = ?, detailed_description = ?,
                   category = ?, status = ?, visibility = ?, request_policy = ?, participant_publication_policy = ?,
                   leader_publication_policy = ?, display_order = ?, updated_by_user_id = ?, updated_at = ?,
                   archived_at = CASE WHEN ? = 'archived' THEN COALESCE(archived_at, ?) ELSE archived_at END,
                   revision = revision + 1
             WHERE id = ? AND parish_id = ?`,
      params: [next.canonicalName, next.displayName, next.slug, next.shortDescription, next.detailedDescription, next.category, next.status, next.visibility, next.requestPolicy, next.participantPublicationPolicy, next.leaderPublicationPolicy, next.displayOrder, actor.userId, timestamp, next.status, timestamp, ministryId, parishId]
    },
    auditStatement({ action: "directory.ministry.updated", actor, parishId, targetType: "directory_ministry", targetId: ministryId, before: ministryDto(row), after: next, correlationId })
  ]);
  return getMinistryAdmin(env, { context, ministryId });
}

export async function listMinistriesAdmin(env, { context, status = "", query = "", limit = 100 } = {}) {
  requireManage(context);
  const parishId = parishIdFor(context);
  const rows = await d1All(env, "SELECT * FROM directory_ministries WHERE parish_id = ?1 ORDER BY display_order ASC, display_name ASC LIMIT ?2", parishId, Math.min(Number(limit) || 100, 200));
  const q = String(query || "").trim().toLowerCase();
  return rows
    .filter((row) => !status || row.status === status)
    .filter((row) => !q || `${row.display_name} ${row.short_description || ""}`.toLowerCase().includes(q))
    .map((row) => ministryDto(row));
}

export async function getMinistryAdmin(env, { context, ministryId }) {
  requireManage(context);
  const parishId = parishIdFor(context);
  const row = await loadMinistry(env, { parishId, ministryId });
  const [leaders, participants, requests] = await Promise.all([
    d1All(env, `SELECT ml.*, p.preferred_name FROM directory_ministry_leaders ml JOIN directory_people p ON p.id = ml.person_id WHERE ml.parish_id = ?1 AND ml.ministry_id = ?2 AND ml.active = 1 ORDER BY p.preferred_name`, parishId, ministryId),
    d1All(env, `SELECT mp.*, p.preferred_name FROM directory_ministry_participants mp JOIN directory_people p ON p.id = mp.person_id WHERE mp.parish_id = ?1 AND mp.ministry_id = ?2 AND mp.status IN ('active','paused') ORDER BY p.preferred_name`, parishId, ministryId),
    d1All(env, `SELECT r.*, m.display_name FROM directory_ministry_interest_requests r JOIN directory_ministries m ON m.id = r.ministry_id WHERE r.parish_id = ?1 AND r.ministry_id = ?2 ORDER BY r.created_at DESC LIMIT 25`, parishId, ministryId)
  ]);
  return { ministry: ministryDto(row), leaders: leaders.map(leaderDto), participants: participants.map(participantDto), requests: requests.map(requestDto) };
}

export async function assignMinistryLeader(env, { context, ministryId, personId, assignmentType = "leader", publish = false, correlationId = "" }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  await loadMinistry(env, { parishId, ministryId });
  const person = await loadAdultPerson(env, { parishId, personId });
  const type = enumValue(assignmentType, MINISTRY_LEADERSHIP_TYPES, "assignmentType", "leader");
  const timestamp = nowMs();
  const id = generateSecret("dir_min_leader");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_leaders
              (id, parish_id, ministry_id, person_id, assignment_type, publication_state,
               active, effective_at, assigned_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      params: [id, parishId, ministryId, person.id, type, publish ? "published" : "hidden", timestamp, actor.userId, timestamp, timestamp]
    },
    auditStatement({ action: "directory.ministry.leader_assigned", actor, parishId, targetType: "directory_ministry_leader", targetId: id, metadata: { ministryId, personId: person.id, assignmentType: type, displayOnly: true }, correlationId })
  ]);
  return getMinistryAdmin(env, { context, ministryId });
}

export async function endMinistryLeader(env, { context, leaderId, correlationId = "" }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await d1First(env, "SELECT * FROM directory_ministry_leaders WHERE id = ?1 AND parish_id = ?2 AND active = 1", leaderId, parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Ministry leader assignment was not found.", 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_ministry_leaders SET active = 0, ended_at = ?1, updated_at = ?1, revision = revision + 1 WHERE id = ?2", params: [timestamp, leaderId] },
    auditStatement({ action: "directory.ministry.leader_ended", actor, parishId, targetType: "directory_ministry_leader", targetId: leaderId, metadata: { ministryId: row.ministry_id, personId: row.person_id }, correlationId })
  ]);
  return { ok: true, ministryId: row.ministry_id };
}

export async function assignMinistryParticipant(env, { context, ministryId, personId, participationType = "participant", publish = false, source = "administrator_assigned", requestId = "", correlationId = "" }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  await loadMinistry(env, { parishId, ministryId });
  const person = await loadAdultPerson(env, { parishId, personId });
  const type = enumValue(participationType, MINISTRY_PARTICIPATION_TYPES, "participationType", "participant");
  const timestamp = nowMs();
  const id = generateSecret("dir_min_part");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_participants
              (id, parish_id, ministry_id, person_id, source, status, participation_type,
               publication_preference, approved_publication, start_at, assigned_by_user_id,
               request_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, parishId, ministryId, person.id, source, type, publish ? "directory" : "hidden", publish ? 1 : 0, timestamp, actor.userId, requestId || null, timestamp, timestamp]
    },
    auditStatement({ action: "directory.ministry.participant_assigned", actor, parishId, targetType: "directory_ministry_participant", targetId: id, metadata: { ministryId, personId: person.id, participationType: type, grantsCapability: false }, correlationId })
  ]);
  return getMinistryAdmin(env, { context, ministryId });
}

export async function removeMinistryParticipant(env, { context, participantId, reasonCode = "", correlationId = "" }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await d1First(env, "SELECT * FROM directory_ministry_participants WHERE id = ?1 AND parish_id = ?2 AND status IN ('active','paused')", participantId, parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Ministry participant assignment was not found.", 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_ministry_participants SET status = 'removed', end_at = ?1, publication_preference = 'hidden', approved_publication = 0, updated_at = ?1, revision = revision + 1 WHERE id = ?2", params: [timestamp, participantId] },
    auditStatement({ action: "directory.ministry.participant_removed", actor, parishId, targetType: "directory_ministry_participant", targetId: participantId, metadata: { ministryId: row.ministry_id, personId: row.person_id, reasonCode }, correlationId })
  ]);
  return { ok: true, ministryId: row.ministry_id };
}

export async function setMinistryParticipationPublication(env, { context, participantId, preference = "hidden", approvedPublication = false, correlationId = "" }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await d1First(env, "SELECT * FROM directory_ministry_participants WHERE id = ?1 AND parish_id = ?2", participantId, parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Ministry participant assignment was not found.", 404);
  const pref = enumValue(preference, ["hidden", "directory"], "publicationPreference", "hidden");
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_ministry_participants SET publication_preference = ?1, approved_publication = ?2, updated_at = ?3, revision = revision + 1 WHERE id = ?4", params: [pref, approvedPublication ? 1 : 0, timestamp, participantId] },
    auditStatement({ action: "directory.ministry.participation_publication_updated", actor, parishId, targetType: "directory_ministry_participant", targetId: participantId, metadata: { preference: pref, approvedPublication: Boolean(approvedPublication) }, correlationId })
  ]);
  return { ok: true, participantId };
}

export async function listPublishedMinistries(env, { context, q = "", category = "", acceptingInterest = false, limit = 50, cursor = "" } = {}) {
  const rows = await d1All(env, "SELECT * FROM directory_ministries WHERE parish_id = ?1 AND status IN ('active','paused') ORDER BY display_order ASC, display_name ASC", context.parishId);
  const query = String(q || "").trim().toLowerCase();
  const out = [];
  for (const row of rows) {
    const participant = personIdFor(context) ? await isParticipant(env, { parishId: context.parishId, ministryId: row.id, personId: personIdFor(context) }) : false;
    if (!memberCanSeeMinistry(row, context, participant)) continue;
    if (category && row.category !== category) continue;
    if (acceptingInterest && !(row.status === "active" && row.request_policy === "request_interest")) continue;
    if (query.length >= 2 && !`${row.display_name} ${row.short_description || ""}`.toLowerCase().includes(query)) continue;
    out.push(ministryDto(row, {
      leaderCount: (await visibleLeaders(env, context, row.id)).length,
      visibleParticipantCount: await visibleParticipants(env, context, row.id)
    }));
  }
  const pageLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const offset = Math.max(0, Number(String(cursor || "0").replace(/\D/g, "")) || 0);
  const page = out.slice(offset, offset + pageLimit + 1);
  return { items: page.slice(0, pageLimit), totalVisible: out.length, nextCursor: page.length > pageLimit ? String(offset + pageLimit) : "" };
}

export async function getPublishedMinistry(env, { context, ministryId = "", slug = "" }) {
  const row = await loadMinistry(env, { parishId: context.parishId, ministryId, slug });
  const participant = personIdFor(context) ? await isParticipant(env, { parishId: context.parishId, ministryId: row.id, personId: personIdFor(context) }) : false;
  if (!memberCanSeeMinistry(row, context, participant)) throw new DirectoryServiceError("not_found", "Ministry was not found.", 404);
  const [leaders, participants, status] = await Promise.all([
    visibleLeaders(env, context, row.id),
    visibleParticipants(env, context, row.id, { includeList: row.participant_publication_policy === "opt_in_reviewed" }),
    viewerStatus(env, context, row.id)
  ]);
  return { ministry: ministryDto(row, { leaders, visibleParticipants: participants, visibleParticipantCount: participants.length, viewerStatus: status }) };
}

export async function submitMinistryInterest(env, { context, ministryId, interestType = "participant", memberNote = "", correlationId = "" }) {
  const requesterPersonId = personIdFor(context);
  if (!requesterPersonId) throw new DirectoryServiceError("unauthorized", "A linked adult directory profile is required.", 401);
  const parishId = parishIdFor(context);
  const settings = await getDirectorySettings(env, parishId);
  if (!settings.directoryEnabled) throw new DirectoryServiceError("not_found", "Ministry was not found.", 404);
  const ministry = await loadMinistry(env, { parishId, ministryId });
  if (ministry.status !== "active" || ministry.request_policy !== "request_interest") throw new DirectoryServiceError("requests_closed", "This ministry is not accepting interest requests.", 409);
  if (!memberCanSeeMinistry(ministry, context, false)) throw new DirectoryServiceError("not_found", "Ministry was not found.", 404);
  const person = await loadAdultPerson(env, { parishId, personId: requesterPersonId });
  if (await isParticipant(env, { parishId, ministryId, personId: person.id })) throw new DirectoryServiceError("already_participating", "You are already listed for this ministry.", 409);
  const type = enumValue(interestType, MINISTRY_PARTICIPATION_TYPES, "interestType", "participant");
  const timestamp = nowMs();
  const id = generateSecret("dir_min_interest");
  const actor = actorFromContext(context);
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_interest_requests
              (id, parish_id, ministry_id, person_id, requester_user_id, requester_person_id,
               interest_type, member_note, status, submitted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
      params: [id, parishId, ministryId, person.id, context.user.id, person.id, type, cleanText(memberNote, { max: 500 }), timestamp, timestamp, timestamp]
    },
    auditStatement({ action: "directory.ministry.interest_submitted", actor, parishId, targetType: "directory_ministry_interest_request", targetId: id, metadata: { ministryId, interestType: type }, correlationId }),
    notificationStatement({ context, recipientUserId: context.user.id, eventType: "directory.ministry.interest.submitted", targetId: id, safeMessage: "Your ministry interest request was submitted." })
  ]);
  return getMinistryInterestRequest(env, { context, requestId: id });
}

export async function withdrawMinistryInterest(env, { context, requestId, correlationId = "" }) {
  const parishId = parishIdFor(context);
  const row = await d1First(env, "SELECT * FROM directory_ministry_interest_requests WHERE id = ?1 AND parish_id = ?2", requestId, parishId);
  if (!row || row.requester_user_id !== context.user.id) throw new DirectoryServiceError("not_found", "Ministry interest request was not found.", 404);
  if (!["submitted", "under_review", "returned"].includes(row.status)) return requestDto(row);
  const timestamp = nowMs();
  const actor = actorFromContext(context);
  await runAtomic(env, [
    { sql: "UPDATE directory_ministry_interest_requests SET status = 'withdrawn', withdrawn_at = ?1, updated_at = ?1, revision = revision + 1 WHERE id = ?2", params: [timestamp, requestId] },
    auditStatement({ action: "directory.ministry.interest_withdrawn", actor, parishId, targetType: "directory_ministry_interest_request", targetId: requestId, metadata: { ministryId: row.ministry_id }, correlationId })
  ]);
  return getMinistryInterestRequest(env, { context, requestId });
}

export async function getMinistryInterestRequest(env, { context, requestId }) {
  const parishId = parishIdFor(context);
  const row = await d1First(
    env,
    `SELECT r.*, m.display_name FROM directory_ministry_interest_requests r
       JOIN directory_ministries m ON m.id = r.ministry_id
      WHERE r.parish_id = ?1 AND r.id = ?2`,
    parishId,
    requestId
  );
  if (!row) throw new DirectoryServiceError("not_found", "Ministry interest request was not found.", 404);
  if (row.requester_user_id !== context.user.id && !hasAny(context, REVIEW_CAPS) && !hasAny(context, MANAGE_CAPS)) {
    throw new DirectoryServiceError("not_found", "Ministry interest request was not found.", 404);
  }
  return requestDto(row);
}

export async function getMyMinistries(env, { context }) {
  const personId = personIdFor(context);
  if (!personId) return { participations: [], requests: [] };
  const parishId = parishIdFor(context);
  const participations = await d1All(
    env,
    `SELECT mp.*, p.preferred_name, m.display_name, m.slug, m.category
       FROM directory_ministry_participants mp
       JOIN directory_ministries m ON m.id = mp.ministry_id
       JOIN directory_people p ON p.id = mp.person_id
      WHERE mp.parish_id = ?1 AND mp.person_id = ?2
      ORDER BY m.display_order ASC, m.display_name ASC`,
    parishId,
    personId
  );
  const requests = await d1All(
    env,
    `SELECT r.*, m.display_name FROM directory_ministry_interest_requests r
       JOIN directory_ministries m ON m.id = r.ministry_id
      WHERE r.parish_id = ?1 AND r.person_id = ?2
      ORDER BY r.created_at DESC LIMIT 50`,
    parishId,
    personId
  );
  return {
    participations: participations.map((row) => ({ ...participantDto(row), ministryName: row.display_name, slug: row.slug, category: row.category })),
    requests: requests.map(requestDto)
  };
}

export async function approveMinistryInterestReview(env, { context, row, reviewerNote = "", correlationId = "" }) {
  requireReview(context);
  const parishId = parishIdFor(context);
  const request = await d1First(env, "SELECT * FROM directory_ministry_interest_requests WHERE id = ?1 AND parish_id = ?2 AND status IN ('submitted','under_review','returned')", row.source_id, parishId);
  if (!request) throw new DirectoryServiceError("invalid_transition", "Only active ministry interest requests can be approved.", 409);
  if (request.requester_user_id === context.user.id) throw new DirectoryServiceError("self_approval_denied", "Reviewers cannot approve their own ministry interest request.", 403);
  const ministry = await loadMinistry(env, { parishId, ministryId: request.ministry_id });
  if (ministry.status !== "active" || ministry.request_policy !== "request_interest") throw new DirectoryServiceError("requests_closed", "This ministry can no longer accept interest approval.", 409);
  const person = await loadAdultPerson(env, { parishId, personId: request.person_id });
  if (await isParticipant(env, { parishId, ministryId: request.ministry_id, personId: person.id })) {
    throw new DirectoryServiceError("duplicate_participation", "This person is already active in the ministry.", 409);
  }
  const actor = actorFromContext(context);
  const timestamp = nowMs();
  const participantId = generateSecret("dir_min_part");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_participants
              (id, parish_id, ministry_id, person_id, source, status, participation_type,
               publication_preference, approved_publication, start_at, assigned_by_user_id,
               request_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'member_requested', 'active', ?, 'hidden', 0, ?, ?, ?, ?, ?)`,
      params: [participantId, parishId, request.ministry_id, person.id, request.interest_type, timestamp, context.user.id, request.id, timestamp, timestamp]
    },
    { sql: "UPDATE directory_ministry_interest_requests SET status = 'approved', reviewer_note = ?1, reviewed_by_user_id = ?2, resolved_at = ?3, updated_at = ?3, revision = revision + 1 WHERE id = ?4", params: [cleanText(reviewerNote, { max: 500 }), context.user.id, timestamp, request.id] },
    auditStatement({ action: "directory.ministry.interest_approved", actor, parishId, targetType: "directory_ministry_interest_request", targetId: request.id, metadata: { ministryId: request.ministry_id, participantId }, correlationId }),
    auditStatement({ action: "directory.ministry.participant_assigned", actor, parishId, targetType: "directory_ministry_participant", targetId: participantId, metadata: { source: "member_requested", grantsCapability: false }, correlationId }),
    notificationStatement({ context, recipientUserId: request.requester_user_id, eventType: "directory.ministry.interest.approved", targetId: request.id, safeMessage: "Your ministry interest request was approved." })
  ]);
  return { ok: true, participantId };
}

export async function closeMinistryInterestReview(env, { context, row, decision, reviewerNote = "", reasonCode = "", correlationId = "" }) {
  requireReview(context);
  const parishId = parishIdFor(context);
  const request = await d1First(env, "SELECT * FROM directory_ministry_interest_requests WHERE id = ?1 AND parish_id = ?2 AND status IN ('submitted','under_review','returned')", row.source_id, parishId);
  if (!request) throw new DirectoryServiceError("invalid_transition", "Only active ministry interest requests can be closed.", 409);
  const status = decision === "return" ? "returned" : decision === "cancel" ? "cancelled" : "rejected";
  const timestamp = nowMs();
  const actor = actorFromContext(context);
  await runAtomic(env, [
    { sql: "UPDATE directory_ministry_interest_requests SET status = ?1, reviewer_note = ?2, reviewed_by_user_id = ?3, resolved_at = ?4, updated_at = ?4, revision = revision + 1 WHERE id = ?5", params: [status, cleanText(reviewerNote, { max: 500 }), context.user.id, timestamp, request.id] },
    auditStatement({ action: `directory.ministry.interest_${status}`, actor, parishId, targetType: "directory_ministry_interest_request", targetId: request.id, metadata: { ministryId: request.ministry_id, reasonCode }, correlationId }),
    notificationStatement({ context, recipientUserId: request.requester_user_id, eventType: `directory.ministry.interest.${status}`, targetId: request.id, safeMessage: status === "returned" ? "Your ministry interest request was returned for follow-up." : "Your ministry interest request was reviewed." })
  ]);
  return { ok: true, decision };
}

export async function publishedMinistryAffiliationsForPerson(env, { context, personId }) {
  const resolvedId = await resolvePersonAlias(env, { parishId: context.parishId, personId });
  const rows = await d1All(
    env,
    `SELECT m.id, m.display_name, m.slug, m.category, mp.participation_type,
            CASE WHEN ml.id IS NULL THEN '' ELSE ml.assignment_type END AS leadership_type
       FROM directory_ministry_participants mp
       JOIN directory_ministries m ON m.id = mp.ministry_id
       LEFT JOIN directory_ministry_leaders ml
         ON ml.parish_id = mp.parish_id AND ml.ministry_id = mp.ministry_id
        AND ml.person_id = mp.person_id AND ml.active = 1 AND ml.publication_state = 'published'
      WHERE mp.parish_id = ?1 AND mp.person_id = ?2
        AND mp.status = 'active'
        AND mp.publication_preference = 'directory' AND mp.approved_publication = 1
        AND m.status IN ('active','paused') AND m.visibility IN ('parish_members','participants_only')
      ORDER BY m.display_order ASC, m.display_name ASC`,
    context.parishId,
    resolvedId
  );
  const flags = await getPersonPrivacyFlags(env, { parishId: context.parishId, personId: resolvedId });
  if (flags.isChild || flags.protectedPerson) return [];
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    slug: row.slug,
    category: row.category,
    participationType: row.participation_type,
    leadershipType: row.leadership_type || "",
    profileUrl: `/myagapay/directory?view=ministry&id=${encodeURIComponent(row.id)}`
  }));
}

export async function personIdsWithPublishedMinistry(env, { context, ministryId }) {
  const rows = await d1All(
    env,
    `SELECT mp.person_id
       FROM directory_ministry_participants mp
       JOIN directory_ministries m ON m.id = mp.ministry_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = mp.parish_id AND f.person_id = mp.person_id AND f.active = 1
      WHERE mp.parish_id = ?1 AND mp.ministry_id = ?2
        AND mp.status = 'active' AND mp.publication_preference = 'directory' AND mp.approved_publication = 1
        AND m.status IN ('active','paused') AND m.visibility IN ('parish_members','participants_only')
        AND COALESCE(f.protected_person, 0) = 0 AND COALESCE(f.is_child, 0) = 0`,
    context.parishId,
    ministryId
  );
  return new Set(rows.map((row) => row.person_id));
}

function notificationStatement({ context, recipientUserId, eventType, targetId, safeMessage }) {
  const parishId = parishIdFor(context);
  return {
    sql: `INSERT INTO directory_notification_events
            (id, parish_id, recipient_user_id, actor_user_id, event_type, target_type, target_id, safe_message, created_at)
          VALUES (?, ?, ?, ?, ?, 'directory_ministry_interest_request', ?, ?, ?)`,
    params: [generateSecret("dir_notify"), parishId, recipientUserId || null, context.user.id, eventType, targetId, safeMessage, nowMs()]
  };
}
