import { currentUser, resolveAuthorizationContext } from "../lib/authorization.js";
import { d1All, d1First, generateSecret, getBearerToken, resolveParishDashboardSession } from "../lib/core.js";
import { findRegistrationByParishId } from "../handlers/parish.js";
import {
  addHouseholdAdmin,
  addHouseholdMember,
  removeHouseholdAdmin,
  removeHouseholdMember
} from "./foundation.js";
import { DirectoryServiceError } from "./foundation.js";
import { transitionPublicationProfile } from "./publication.js";
import { setFieldPrivacyPreference } from "./privacy.js";
import { assertMediaAssetSecurelyTransformed, auditDirectoryMediaLegacyAssets, reprocessDirectoryMediaAsset } from "./media.js";
import {
  decideDuplicateCandidate,
  executeDuplicateMerge,
  generateDuplicateCandidates,
  getDuplicateComparison,
  listDuplicateCandidates,
  planDuplicateMerge
} from "./duplicates.js";
import { checkChildEligibility, sanitizeChildFields, POLICY_REVISION as CHILD_POLICY_REVISION } from "./child-publication.js";
import { approveMinistryInterestReview, closeMinistryInterestReview } from "./ministries.js";
import { getDirectorySettings } from "./settings.js";
import {
  assertParishActor,
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  maskValue,
  nowMs,
  runAtomic,
  safeJson
} from "./shared.js";

const PRIORITIES = new Set(["normal", "elevated", "urgent"]);
const DECISIONS = new Set(["approve", "deny", "return", "cancel"]);
const NOTE_CATEGORIES = new Set(["general", "verification", "household", "contact", "publication", "identity", "protected", "follow_up"]);
const BIOLOGICAL_SEXES = new Set(["unknown", "female", "male"]);

export const REVIEW_TYPES = Object.freeze({
  person_profile_review: {
    reviewType: "person_canonical_correction",
    sourceSystem: "directory_change_requests",
    capabilities: [DIRECTORY_CAPABILITIES.correctionsReview, DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "cancel", "priority", "note"]
  },
  household_membership_add: {
    reviewType: "membership_add_adult",
    sourceSystem: "directory_change_requests",
    capabilities: [DIRECTORY_CAPABILITIES.membershipsReview, DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "cancel", "priority", "note"]
  },
  household_membership_remove: {
    reviewType: "membership_remove",
    sourceSystem: "directory_change_requests",
    capabilities: [DIRECTORY_CAPABILITIES.membershipsReview, DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "cancel", "priority", "note"]
  },
  household_relationship_change: {
    reviewType: "household_relationship_change",
    sourceSystem: "directory_change_requests",
    capabilities: [DIRECTORY_CAPABILITIES.membershipsReview, DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "deny", "return", "cancel", "priority", "note"]
  },
  household_move_request: {
    reviewType: "membership_move",
    sourceSystem: "directory_change_requests",
    capabilities: [DIRECTORY_CAPABILITIES.membershipsReview, DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "deny", "return", "cancel", "priority", "note"]
  },
  household_merge_review: {
    reviewType: "household_merge_triage",
    sourceSystem: "directory_change_requests",
    capabilities: [DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "deny", "return", "cancel", "priority", "note"]
  },
  publication_person: {
    reviewType: "publication_person",
    sourceSystem: "directory_publication_profiles",
    capabilities: [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "priority", "note"]
  },
  publication_household: {
    reviewType: "publication_household",
    sourceSystem: "directory_publication_profiles",
    capabilities: [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "priority", "note"]
  },
  publication_media: {
    reviewType: "publication_media",
    sourceSystem: "directory_media_assets",
    capabilities: [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "priority", "note"]
  },
  duplicate_person: {
    reviewType: "person_duplicate_review",
    sourceSystem: "directory_duplicate_candidates",
    capabilities: [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "deny", "return", "priority", "note"]
  },
  duplicate_household: {
    reviewType: "household_duplicate_review",
    sourceSystem: "directory_duplicate_candidates",
    capabilities: [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "deny", "return", "priority", "note"]
  },
  // Phase 4B: deliberately requires childPublicationReview specifically --
  // NOT publicationReview. A reviewer authorized for ordinary adult/
  // household publication is not automatically authorized here (Part 9).
  child_publication_review: {
    reviewType: "child_publication_review",
    sourceSystem: "directory_child_publication_requests",
    capabilities: [DIRECTORY_CAPABILITIES.childPublicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "priority", "note"]
  },
  ministry_interest_review: {
    reviewType: "ministry_interest_review",
    sourceSystem: "directory_ministry_interest_requests",
    capabilities: [DIRECTORY_CAPABILITIES.ministryInterestReview, DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ["assign", "unassign", "begin", "approve", "deny", "return", "cancel", "priority", "note"]
  }
});

function hasAny(actor, capabilities) {
  return capabilities.some((capability) => actor.capabilities.includes(capability));
}

function requireAny(actor, parishId, capabilities) {
  return assertParishActor(actor, parishId, [...capabilities, DIRECTORY_CAPABILITIES.manage]);
}

function actorDto(ctx) {
  return {
    userId: ctx.user.id,
    actorType: ctx.actorType || "platform_user",
    parishId: ctx.parishId || ctx.membership?.parishId,
    capabilities: ctx.capabilities,
    personId: ctx.personId || ""
  };
}

async function linkedPersonId(env, userId) {
  const row = await d1First(
    env,
    "SELECT person_id FROM directory_person_links WHERE link_type = 'platform_user' AND external_id = ?1 AND active = 1 LIMIT 1",
    userId
  );
  return row?.person_id || "";
}

export async function resolveDirectoryAdminContext(env, { request, parishId }) {
  const parishDashboardContext = await requireParishDashboardDirectoryAccess(request, env, { parishId });
  if (parishDashboardContext) return parishDashboardContext;

  const user = await currentUser(request, env);
  if (!user) throw new DirectoryServiceError("unauthorized", "Directory administration requires an authenticated platform user.", 401);
  const cleanedParishId = cleanText(parishId, { required: true, max: 160, field: "parishId" });
  const { membership, capabilities } = await resolveAuthorizationContext(env, { userId: user.id, parishId: cleanedParishId });
  if (!membership) throw new DirectoryServiceError("forbidden", "Directory administration requires an active parish membership.", 403);
  const directoryCapabilities = capabilities.filter((capability) => capability.startsWith("directory."));
  if (!directoryCapabilities.length) throw new DirectoryServiceError("forbidden", "Directory administration requires a directory capability.", 403);
  const personId = await linkedPersonId(env, user.id);
  const actor = { userId: user.id, parishId: cleanedParishId, capabilities, personId };
  return {
    user: { id: user.id, email: user.email || "", displayName: user.displayName || "" },
    parishId: cleanedParishId,
    personId,
    capabilities: directoryCapabilities,
    permissions: {
      canReviewRequests: hasAny(actor, [DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.manage]),
      canReviewPublication: hasAny(actor, [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage]),
      canManagePeople: hasAny(actor, [DIRECTORY_CAPABILITIES.peopleManage, DIRECTORY_CAPABILITIES.manage]),
      canManageHouseholds: hasAny(actor, [DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage]),
      canManageProtected: hasAny(actor, [DIRECTORY_CAPABILITIES.protectedManage, DIRECTORY_CAPABILITIES.manage]),
      canViewNotes: hasAny(actor, [DIRECTORY_CAPABILITIES.notesView, DIRECTORY_CAPABILITIES.notesManage, DIRECTORY_CAPABILITIES.manage]),
      canManageNotes: hasAny(actor, [DIRECTORY_CAPABILITIES.notesManage, DIRECTORY_CAPABILITIES.manage]),
      canAssign: hasAny(actor, [DIRECTORY_CAPABILITIES.assignmentsManage, DIRECTORY_CAPABILITIES.manage]),
      canViewAudit: hasAny(actor, [DIRECTORY_CAPABILITIES.auditView, DIRECTORY_CAPABILITIES.manage]),
      canViewPrivateContact: hasAny(actor, [DIRECTORY_CAPABILITIES.privateContactView, DIRECTORY_CAPABILITIES.manage]),
      canReviewDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage]),
      canMergeDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesMerge, DIRECTORY_CAPABILITIES.manage])
    },
    entitlement: { mission: true, parish: true, phase3AAvailable: true }
  };
}

const PARISH_DASHBOARD_DIRECTORY_CAPABILITIES = Object.freeze([
  DIRECTORY_CAPABILITIES.manage,
  DIRECTORY_CAPABILITIES.peopleManage,
  DIRECTORY_CAPABILITIES.householdsManage,
  DIRECTORY_CAPABILITIES.requestsReview,
  DIRECTORY_CAPABILITIES.membershipsReview,
  DIRECTORY_CAPABILITIES.householdAdminsReview,
  DIRECTORY_CAPABILITIES.correctionsReview,
  DIRECTORY_CAPABILITIES.protectedManage,
  DIRECTORY_CAPABILITIES.duplicatesReview,
  DIRECTORY_CAPABILITIES.duplicatesMerge,
  DIRECTORY_CAPABILITIES.notesView,
  DIRECTORY_CAPABILITIES.notesManage,
  DIRECTORY_CAPABILITIES.assignmentsManage,
  DIRECTORY_CAPABILITIES.publicationReview,
  DIRECTORY_CAPABILITIES.childPublicationReview,
  DIRECTORY_CAPABILITIES.ministriesManage,
  DIRECTORY_CAPABILITIES.ministryInterestReview,
  DIRECTORY_CAPABILITIES.skillsView,
  DIRECTORY_CAPABILITIES.skillsManage,
  DIRECTORY_CAPABILITIES.skillsCatalogManage,
  DIRECTORY_CAPABILITIES.settingsManage,
  DIRECTORY_CAPABILITIES.privateContactView,
  DIRECTORY_CAPABILITIES.auditView,
  DIRECTORY_CAPABILITIES.mediaReprocess
]);

export async function requireParishDashboardDirectoryAccess(request, env, { parishId } = {}) {
  const cleanedParishId = cleanText(parishId, { required: true, max: 160, field: "parishId" });
  if (request?.headers?.get?.("X-AGAPAY-User-Email")) return null;
  let found = null;
  try {
    found = await findRegistrationByParishId(env, cleanedParishId);
  } catch {
    return null;
  }
  if (!found?.registration) return null;
  const session = await resolveParishDashboardSession(found.registration, getBearerToken(request));
  if (!session) return null;

  const actorId = cleanedParishId;
  const actorLabel = found.registration.contactEmail
    || found.registration.email
    || found.registration.parishName
    || "Parish Dashboard Administrator";
  const actor = { userId: actorId, actorType: "parish_dashboard_account", parishId: cleanedParishId, capabilities: [...PARISH_DASHBOARD_DIRECTORY_CAPABILITIES], personId: "" };
  return {
    authenticationType: "parish_dashboard",
    actorType: "parish_dashboard_account",
    actorId,
    actorLabel,
    parishSessionId: session.id || "",
    authenticatedAt: session.expiresAt || "",
    user: { id: actorId, email: found.registration.contactEmail || found.registration.email || "", displayName: actorLabel },
    parishId: cleanedParishId,
    personId: "",
    capabilities: [...PARISH_DASHBOARD_DIRECTORY_CAPABILITIES],
    permissions: {
      canReviewRequests: hasAny(actor, [DIRECTORY_CAPABILITIES.requestsReview, DIRECTORY_CAPABILITIES.manage]),
      canReviewPublication: hasAny(actor, [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage]),
      canManagePeople: hasAny(actor, [DIRECTORY_CAPABILITIES.peopleManage, DIRECTORY_CAPABILITIES.manage]),
      canManageHouseholds: hasAny(actor, [DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage]),
      canManageProtected: hasAny(actor, [DIRECTORY_CAPABILITIES.protectedManage, DIRECTORY_CAPABILITIES.manage]),
      canViewNotes: hasAny(actor, [DIRECTORY_CAPABILITIES.notesView, DIRECTORY_CAPABILITIES.notesManage, DIRECTORY_CAPABILITIES.manage]),
      canManageNotes: hasAny(actor, [DIRECTORY_CAPABILITIES.notesManage, DIRECTORY_CAPABILITIES.manage]),
      canAssign: hasAny(actor, [DIRECTORY_CAPABILITIES.assignmentsManage, DIRECTORY_CAPABILITIES.manage]),
      canViewAudit: hasAny(actor, [DIRECTORY_CAPABILITIES.auditView, DIRECTORY_CAPABILITIES.manage]),
      canViewPrivateContact: hasAny(actor, [DIRECTORY_CAPABILITIES.privateContactView, DIRECTORY_CAPABILITIES.manage]),
      canReviewDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage]),
      canMergeDuplicates: hasAny(actor, [DIRECTORY_CAPABILITIES.duplicatesMerge, DIRECTORY_CAPABILITIES.manage])
    },
    entitlement: { mission: true, parish: true, phase3AAvailable: true }
  };
}

function rowAge(row) {
  const submittedAt = Number(row.submitted_at || row.created_at || 0);
  return submittedAt ? Math.max(0, Math.floor((nowMs() - submittedAt) / 86400000)) : 0;
}

function metadataDto(row) {
  return {
    reviewItemId: row.review_item_id || `virtual:${row.source_type}:${row.source_id}`,
    queueStatus: row.queue_status || "pending_review",
    priority: row.priority || "normal",
    assignedToUserId: row.assigned_to_user_id || "",
    assignedAt: row.assigned_at ? Number(row.assigned_at) : null,
    version: `${row.source_updated_at || row.updated_at || ""}:${row.metadata_updated_at || ""}`
  };
}

function queueDto(row, context) {
  const meta = metadataDto(row);
  const protectedRecord = Number(row.protected_record || 0) === 1;
  const childRelated = Number(row.child_related || 0) === 1;
  return {
    ...meta,
    parishId: row.parish_id,
    reviewType: reviewDefinition(row).reviewType,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceStatus: row.source_status,
    submittedAt: Number(row.submitted_at || 0),
    ageDays: rowAge(row),
    requesterLabel: row.requester_label || "Directory user",
    targetLabel: row.target_label || "Directory record",
    targetType: row.target_type || "",
    targetId: row.target_id || "",
    protectedRecord: context.permissions.canManageProtected ? protectedRecord : protectedRecord ? true : false,
    childRelated,
    conflict: row.review_type === "household_merge_triage",
    summary: row.safe_summary || "Directory review item",
    permittedActions: permittedActions(row.review_key, context, row),
    version: meta.version
  };
}

function reviewDefinition(rowOrKey) {
  const key = typeof rowOrKey === "string" ? rowOrKey : rowOrKey.review_key;
  return REVIEW_TYPES[key] || REVIEW_TYPES.person_profile_review;
}

function permittedActions(key, context, row = {}) {
  const actor = { userId: context.user.id, parishId: context.parishId, capabilities: context.capabilities, personId: context.personId };
  const definition = reviewDefinition(key);
  if (!hasAny(actor, definition.capabilities)) return [];
  const actions = definition.allowedActions.filter((action) => action !== "priority" || context.permissions.canAssign);
  if (row.assigned_to_user_id && row.assigned_to_user_id !== context.user.id && !context.permissions.canAssign) {
    return actions.filter((action) => ["open", "note"].includes(action));
  }
  return actions;
}

async function reviewRows(env, parishId) {
  const changeRequests = await d1All(
    env,
    `SELECT cr.parish_id, 'change_request' AS source_type, cr.id AS source_id, cr.request_type AS review_key,
            cr.request_type AS review_type, cr.status AS source_status, cr.created_at AS submitted_at,
            cr.updated_at AS source_updated_at, cr.requester_user_id, cr.requester_person_id, cr.target_type,
            cr.target_id, cr.household_id, cr.summary AS safe_summary,
            COALESCE(rp.preferred_name, 'Directory user') AS requester_label,
            COALESCE(tp.preferred_name, th.display_name, 'Directory record') AS target_label,
            COALESCE(tf.protected_person, 0) AS protected_record, COALESCE(tf.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_change_requests cr
       LEFT JOIN directory_people rp ON rp.id = cr.requester_person_id
       LEFT JOIN directory_people tp ON cr.target_type = 'person' AND tp.id = cr.target_id
       LEFT JOIN directory_households th ON cr.target_type = 'household' AND th.id = cr.target_id
       LEFT JOIN directory_person_privacy_flags tf ON tf.parish_id = cr.parish_id AND tf.person_id = cr.target_id AND tf.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'change_request' AND rm.source_id = cr.id
      WHERE cr.parish_id = ?1 AND cr.status IN ('pending', 'approved')`,
    parishId
  );
  const publication = await d1All(
    env,
    `SELECT pp.parish_id, 'publication_profile' AS source_type, pp.id AS source_id,
            CASE WHEN pp.owner_type = 'person' THEN 'publication_person' ELSE 'publication_household' END AS review_key,
            CASE WHEN pp.owner_type = 'person' THEN 'publication_person' ELSE 'publication_household' END AS review_type,
            pp.status AS source_status, pp.created_at AS submitted_at, pp.updated_at AS source_updated_at,
            '' AS requester_user_id, '' AS requester_person_id, pp.owner_type AS target_type, pp.owner_id AS target_id,
            CASE WHEN pp.owner_type = 'household' THEN pp.owner_id ELSE NULL END AS household_id,
            'Publication approval requested' AS safe_summary,
            'Directory user' AS requester_label, COALESCE(p.preferred_name, h.display_name, 'Directory record') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record, COALESCE(f.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_publication_profiles pp
       LEFT JOIN directory_people p ON pp.owner_type = 'person' AND p.id = pp.owner_id
       LEFT JOIN directory_households h ON pp.owner_type = 'household' AND h.id = pp.owner_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = pp.parish_id AND f.person_id = pp.owner_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'publication_profile' AND rm.source_id = pp.id
      WHERE pp.parish_id = ?1 AND pp.active = 1 AND pp.status = 'pending_approval'`,
    parishId
  );
  const media = await d1All(
    env,
    `SELECT ma.parish_id, 'media_asset' AS source_type, ma.id AS source_id, 'publication_media' AS review_key,
            'publication_media' AS review_type, ma.lifecycle_status AS source_status, ma.created_at AS submitted_at,
            ma.updated_at AS source_updated_at, ma.uploaded_by_user_id AS requester_user_id, '' AS requester_person_id,
            ma.owner_type AS target_type, ma.owner_id AS target_id,
            CASE WHEN ma.owner_type = 'household' THEN ma.owner_id ELSE NULL END AS household_id,
            'Photo publication approval requested' AS safe_summary,
            'Directory user' AS requester_label, COALESCE(p.preferred_name, h.display_name, 'Directory record') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record, COALESCE(f.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_media_assets ma
       LEFT JOIN directory_people p ON ma.owner_type = 'person' AND p.id = ma.owner_id
       LEFT JOIN directory_households h ON ma.owner_type = 'household' AND h.id = ma.owner_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ma.parish_id AND f.person_id = ma.owner_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'media_asset' AND rm.source_id = ma.id
      WHERE ma.parish_id = ?1 AND ma.lifecycle_status = 'pending_approval'`,
    parishId
  ).catch(() => []);
  const duplicates = await d1All(
    env,
    `SELECT dc.parish_id, 'duplicate_candidate' AS source_type, dc.id AS source_id,
            CASE WHEN dc.entity_type = 'person' THEN 'duplicate_person' ELSE 'duplicate_household' END AS review_key,
            CASE WHEN dc.entity_type = 'person' THEN 'person_duplicate_review' ELSE 'household_duplicate_review' END AS review_type,
            dc.candidate_status AS source_status, dc.first_detected_at AS submitted_at,
            dc.updated_at AS source_updated_at, '' AS requester_user_id, '' AS requester_person_id,
            dc.entity_type AS target_type, dc.left_entity_id AS target_id,
            CASE WHEN dc.entity_type = 'household' THEN dc.left_entity_id ELSE NULL END AS household_id,
            CASE WHEN dc.entity_type = 'person' THEN 'Potential duplicate person records' ELSE 'Potential duplicate household records' END AS safe_summary,
            'Duplicate scanner' AS requester_label,
            CASE WHEN dc.entity_type = 'person'
              THEN COALESCE(lp.preferred_name, 'Left record') || ' / ' || COALESCE(rp.preferred_name, 'Right record')
              ELSE COALESCE(lh.display_name, 'Left household') || ' / ' || COALESCE(rh.display_name, 'Right household')
            END AS target_label,
            CASE WHEN dc.entity_type = 'person' THEN MAX(COALESCE(lf.protected_person, 0), COALESCE(rf.protected_person, 0)) ELSE 0 END AS protected_record,
            CASE WHEN dc.entity_type = 'person' THEN MAX(COALESCE(lf.is_child, 0), COALESCE(rf.is_child, 0)) ELSE 0 END AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_duplicate_candidates dc
       LEFT JOIN directory_people lp ON dc.entity_type = 'person' AND lp.id = dc.left_entity_id
       LEFT JOIN directory_people rp ON dc.entity_type = 'person' AND rp.id = dc.right_entity_id
       LEFT JOIN directory_households lh ON dc.entity_type = 'household' AND lh.id = dc.left_entity_id
       LEFT JOIN directory_households rh ON dc.entity_type = 'household' AND rh.id = dc.right_entity_id
       LEFT JOIN directory_person_privacy_flags lf ON lf.parish_id = dc.parish_id AND lf.person_id = dc.left_entity_id AND lf.active = 1
       LEFT JOIN directory_person_privacy_flags rf ON rf.parish_id = dc.parish_id AND rf.person_id = dc.right_entity_id AND rf.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'duplicate_candidate' AND rm.source_id = dc.id
      WHERE dc.parish_id = ?1 AND dc.candidate_status IN ('open', 'assigned', 'in_review', 'deferred', 'confirmed_duplicate', 'merge_planned', 'merge_ready', 'blocked')`,
    parishId
  ).catch(() => []);
  // Phase 4B: child publication requests, sourced from the dedicated
  // directory_child_publication_requests table (never directory_change_requests
  // or directory_publication_profiles -- Part 8: "do not create a separate
  // review queue," reused here by adding a fourth UNION arm, exactly the
  // established pattern for media/duplicates above).
  const childPublications = await d1All(
    env,
    `SELECT cpr.parish_id, 'child_publication' AS source_type, cpr.id AS source_id,
            'child_publication_review' AS review_key, 'child_publication_review' AS review_type,
            cpr.status AS source_status, cpr.submitted_at AS submitted_at,
            cpr.updated_at AS source_updated_at, cpr.requester_user_id AS requester_user_id,
            cpr.requester_person_id AS requester_person_id,
            'person' AS target_type, cpr.child_person_id AS target_id, cpr.household_id AS household_id,
            'Child publication request' AS safe_summary,
            'Household administrator' AS requester_label,
            COALESCE(p.preferred_name, 'Child record') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record,
            1 AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_child_publication_requests cpr
       LEFT JOIN directory_people p ON p.id = cpr.child_person_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = cpr.parish_id AND f.person_id = cpr.child_person_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'child_publication' AND rm.source_id = cpr.id
      WHERE cpr.parish_id = ?1 AND cpr.status IN ('submitted', 'under_review', 'returned')`,
    parishId
  ).catch(() => []);
  const ministryInterests = await d1All(
    env,
    `SELECT mir.parish_id, 'ministry_interest' AS source_type, mir.id AS source_id,
            'ministry_interest_review' AS review_key, 'ministry_interest_review' AS review_type,
            mir.status AS source_status, mir.submitted_at AS submitted_at,
            mir.updated_at AS source_updated_at, mir.requester_user_id AS requester_user_id,
            mir.requester_person_id AS requester_person_id,
            'person' AS target_type, mir.person_id AS target_id, NULL AS household_id,
            'Ministry interest request' AS safe_summary,
            COALESCE(rp.preferred_name, 'Directory user') AS requester_label,
            COALESCE(m.display_name, 'Ministry') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record,
            COALESCE(f.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_ministry_interest_requests mir
       JOIN directory_ministries m ON m.id = mir.ministry_id
       LEFT JOIN directory_people rp ON rp.id = mir.requester_person_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = mir.parish_id AND f.person_id = mir.person_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'ministry_interest' AND rm.source_id = mir.id
      WHERE mir.parish_id = ?1 AND mir.status IN ('submitted', 'under_review', 'returned')`,
    parishId
  ).catch(() => []);
  return [...changeRequests, ...publication, ...media, ...duplicates, ...childPublications, ...ministryInterests];
}

function applyQueueFilters(rows, filters = {}) {
  let filtered = rows;
  if (filters.type) filtered = filtered.filter((row) => row.review_type === filters.type);
  if (filters.status) filtered = filtered.filter((row) => (row.queue_status || "pending_review") === filters.status || row.source_status === filters.status);
  if (filters.priority) filtered = filtered.filter((row) => (row.priority || "normal") === filters.priority);
  if (filters.assignment === "mine") filtered = filtered.filter((row) => row.assigned_to_user_id === filters.userId);
  if (filters.assignment === "unassigned") filtered = filtered.filter((row) => !row.assigned_to_user_id);
  return filtered;
}

export async function listDirectoryReviewQueue(env, { context, filters = {} }) {
  const rows = await reviewRows(env, context.parishId);
  const visible = rows.filter((row) => permittedActions(row.review_key, context, row).length);
  return applyQueueFilters(visible, { ...filters, userId: context.user.id })
    .sort((a, b) => Number(a.submitted_at || 0) - Number(b.submitted_at || 0))
    .map((row) => queueDto(row, context));
}

export async function getDirectoryAdminDashboard(env, { context }) {
  const queue = await listDirectoryReviewQueue(env, { context });
  const peopleWithoutClaim = await d1First(
    env,
    `SELECT COUNT(DISTINCT p.id) AS count
       FROM directory_people p
       LEFT JOIN directory_person_links l ON l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1
      WHERE p.created_by_parish_id = ?1 AND p.active = 1 AND l.id IS NULL`,
    context.parishId
  );
  const householdsWithoutAdmins = await d1First(
    env,
    `SELECT COUNT(*) AS count
       FROM directory_households h
      WHERE h.parish_id = ?1 AND h.active = 1
        AND NOT EXISTS (SELECT 1 FROM directory_household_admins ha WHERE ha.household_id = h.id AND ha.active = 1)`,
    context.parishId
  );
  return {
    context,
    metrics: {
      totalPending: queue.length,
      unassigned: queue.filter((item) => !item.assignedToUserId).length,
      assignedToMe: queue.filter((item) => item.assignedToUserId === context.user.id).length,
      publicationRequests: queue.filter((item) => item.reviewType.startsWith("publication")).length,
      membershipRequests: queue.filter((item) => item.reviewType.startsWith("membership") || item.reviewType.startsWith("household")).length,
      protectedRecordRequests: queue.filter((item) => item.protectedRecord).length,
      oldestPendingAgeDays: queue.reduce((max, item) => Math.max(max, item.ageDays), 0),
      peopleWithoutClaimedProfiles: Number(peopleWithoutClaim?.count || 0),
      householdsWithoutAdministrators: Number(householdsWithoutAdmins?.count || 0)
    },
    highPriority: queue.filter((item) => ["urgent", "elevated"].includes(item.priority)).slice(0, 8)
  };
}

async function getReviewRow(env, context, sourceType, sourceId) {
  const rows = await reviewRows(env, context.parishId);
  const row = rows.find((item) => item.source_type === sourceType && item.source_id === sourceId);
  if (!row) throw new DirectoryServiceError("not_found", "Directory review item was not found.", 404);
  if (!permittedActions(row.review_key, context, row).length) throw new DirectoryServiceError("forbidden", "Directory reviewer lacks access to this item.", 403);
  return row;
}

async function ensureMetadata(env, { actor, row }) {
  if (row.review_item_id) return row.review_item_id;
  const timestamp = nowMs();
  const id = generateSecret("dir_review");
  await runAtomic(env, [{
    sql: `INSERT OR IGNORE INTO directory_review_metadata
            (id, parish_id, source_type, source_id, queue_status, priority, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'pending_review', 'normal', ?, ?)`,
    params: [id, row.parish_id, row.source_type, row.source_id, timestamp, timestamp]
  }, auditStatement({
    action: "directory.review_item.created",
    actor,
    parishId: row.parish_id,
    targetType: "directory_review_item",
    targetId: id,
    metadata: { sourceType: row.source_type, sourceId: row.source_id }
  })]);
  const saved = await d1First(env, "SELECT id FROM directory_review_metadata WHERE source_type = ?1 AND source_id = ?2", row.source_type, row.source_id);
  return saved.id;
}

export async function getDirectoryReviewItem(env, { context, sourceType, sourceId }) {
  const row = await getReviewRow(env, context, cleanText(sourceType, { required: true, max: 80, field: "sourceType" }), cleanText(sourceId, { required: true, max: 180, field: "sourceId" }));
  const notes = context.permissions.canViewNotes ? await listDirectoryNotes(env, { context, targetType: "review_item", targetId: row.review_item_id || `virtual:${row.source_type}:${row.source_id}` }) : [];
  let payload = {};
  if (row.source_type === "change_request") {
    const request = await d1First(env, "SELECT requested_payload_json FROM directory_change_requests WHERE id = ?1", row.source_id);
    payload = JSON.parse(request?.requested_payload_json || "{}");
  } else if (row.source_type === "duplicate_candidate") {
    return {
      item: queueDto(row, context),
      comparison: await getDuplicateComparison(env, { context, candidateId: row.source_id }),
      notes
    };
  }
  return {
    item: queueDto(row, context),
    current: await currentSnapshot(env, row, context),
    proposed: sanitizePayload(payload, context),
    notes
  };
}

async function currentSnapshot(env, row, context) {
  if (row.target_type === "person") {
    const person = await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", row.target_id);
    if (!person) return null;
    return {
      id: person.id,
      preferredName: person.preferred_name,
      legalName: context.permissions.canManagePeople ? person.legal_name || "" : maskValue(person.legal_name),
      active: Number(person.active || 0) === 1,
      version: person.updated_at
    };
  }
  if (row.target_type === "household") {
    const household = await d1First(env, "SELECT * FROM directory_households WHERE id = ?1", row.target_id);
    if (!household) return null;
    return { id: household.id, displayName: household.display_name, active: Number(household.active || 0) === 1, version: household.updated_at };
  }
  if (row.source_type === "duplicate_candidate") {
    return getDuplicateComparison(env, { context, candidateId: row.source_id });
  }
  return null;
}

function sanitizePayload(payload, context) {
  if (!payload || typeof payload !== "object") return {};
  const copy = { ...payload };
  if (!context.permissions.canManagePeople && "legalName" in copy) copy.legalName = maskValue(copy.legalName);
  if (!context.permissions.canManageProtected) delete copy.protectedReason;
  return copy;
}

function requestedDirectoryPublication(preferences = {}) {
  if (!preferences || typeof preferences !== "object") return false;
  return Object.values(preferences).some((pref) => pref && pref.publicationEligible && pref.visibility === "directory_members");
}

async function applyPersonPublicationPreferences(env, { context, personId, preferences = {}, correlationId = "" }) {
  if (!preferences || typeof preferences !== "object") return;
  const actor = actorDto(context);
  const fieldMap = {
    adultPreferredName: "adult_preferred_name",
    adultEmail: "adult_email",
    adultPhone: "adult_phone"
  };
  for (const [key, pref] of Object.entries(preferences)) {
    const fieldKey = fieldMap[key];
    if (!fieldKey || !pref || typeof pref !== "object") continue;
    await setFieldPrivacyPreference(env, {
      actor,
      parishId: context.parishId,
      ownerType: "person",
      ownerId: personId,
      fieldKey,
      visibility: pref.visibility || "private",
      publicationEligible: Boolean(pref.publicationEligible),
      correlationId
    });
  }
  if (requestedDirectoryPublication(preferences)) {
    const profile = await d1First(
      env,
      "SELECT status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1",
      context.parishId,
      personId
    );
    if (!profile || profile.status === "draft" || profile.status === "not_configured") {
      await transitionPublicationProfile(env, { actor, parishId: context.parishId, ownerType: "person", ownerId: personId, status: "pending_approval", correlationId });
    }
    await transitionPublicationProfile(env, { actor, parishId: context.parishId, ownerType: "person", ownerId: personId, status: "approved", correlationId });
  }
}

function cleanBoolean(value) {
  return value ? 1 : 0;
}

function normalizeSex(value) {
  const cleaned = cleanText(value || "unknown", { required: true, max: 20, field: "biologicalSex" });
  if (!BIOLOGICAL_SEXES.has(cleaned)) throw new DirectoryServiceError("validation_failed", "Biological sex is not supported.");
  return cleaned;
}

async function applyPersonAdminFields(env, { context, personId, patch = {}, allowedFields, expectedVersion = "", auditAction, correlationId = "" }) {
  const row = await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", cleanText(personId, { required: true, max: 180, field: "personId" }));
  if (!row) throw new DirectoryServiceError("not_found", "Directory person was not found.", 404);
  if (expectedVersion && String(expectedVersion) !== String(row.updated_at || "")) throw new DirectoryServiceError("stale_record", "Person changed. Refresh before correcting.", 409);
  const fields = new Set(allowedFields);
  const next = {
    preferredName: row.preferred_name,
    legalName: row.legal_name || "",
    middleName: row.middle_name || "",
    suffix: row.suffix || "",
    biologicalSex: row.biological_sex || "unknown",
    deceased: Number(row.deceased || 0),
    active: Number(row.active || 0),
    notes: row.notes || ""
  };
  if (fields.has("preferredName") && "preferredName" in patch) next.preferredName = cleanText(patch.preferredName, { required: true, max: 160, field: "preferredName" });
  if (fields.has("legalName") && "legalName" in patch) next.legalName = cleanText(patch.legalName, { max: 160, field: "legalName" });
  if (fields.has("middleName") && "middleName" in patch) next.middleName = cleanText(patch.middleName, { max: 160, field: "middleName" });
  if (fields.has("suffix") && "suffix" in patch) next.suffix = cleanText(patch.suffix, { max: 80, field: "suffix" });
  if (fields.has("biologicalSex") && "biologicalSex" in patch) next.biologicalSex = normalizeSex(patch.biologicalSex);
  if (fields.has("deceased") && "deceased" in patch) next.deceased = cleanBoolean(patch.deceased);
  if (fields.has("active") && "active" in patch) next.active = cleanBoolean(patch.active);
  if (fields.has("notes") && "notes" in patch) next.notes = cleanText(patch.notes, { max: 2000, field: "notes" });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `UPDATE directory_people
            SET preferred_name = ?, legal_name = ?, middle_name = ?, suffix = ?,
                biological_sex = ?, deceased = ?, active = ?, notes = ?, updated_at = ?
            WHERE id = ?`,
      params: [next.preferredName, next.legalName, next.middleName, next.suffix, next.biologicalSex, next.deceased, next.active, next.notes, timestamp, row.id]
    },
    auditStatement({
      action: auditAction,
      actor: actorDto(context),
      parishId: context.parishId,
      targetType: "directory_person",
      targetId: row.id,
      before: { preferredName: row.preferred_name, active: Boolean(row.active), deceased: Boolean(row.deceased) },
      after: { preferredName: next.preferredName, active: Boolean(next.active), deceased: Boolean(next.deceased) },
      correlationId
    })
  ]);
  return {
    id: row.id,
    preferredName: next.preferredName,
    legalName: next.legalName,
    middleName: next.middleName,
    suffix: next.suffix,
    biologicalSex: next.biologicalSex,
    deceased: Boolean(next.deceased),
    active: Boolean(next.active),
    notes: next.notes,
    updatedAt: timestamp
  };
}

export async function assignDirectoryReviewItem(env, { context, sourceType, sourceId, assigneeUserId = "", correlationId = "" }) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  if (assigneeUserId && assigneeUserId !== context.user.id) requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.assignmentsManage]);
  requireAny(actor, context.parishId, reviewDefinition(row).capabilities);
  const cleanedAssignee = cleanText(assigneeUserId || context.user.id, { required: true, max: 180, field: "assigneeUserId" });
  const auth = await resolveAuthorizationContext(env, { userId: cleanedAssignee, parishId: context.parishId });
  if (!auth.membership || !reviewDefinition(row).capabilities.some((capability) => auth.capabilities.includes(capability))) {
    throw new DirectoryServiceError("invalid_assignee", "Assignee is not an eligible reviewer for this item.", 422);
  }
  if (cleanedAssignee === row.requester_user_id) throw new DirectoryServiceError("self_assignment_denied", "Requester cannot be assigned to review their own request.", 403);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [{
    sql: `UPDATE directory_review_metadata
             SET queue_status = 'assigned', assigned_to_user_id = ?, assigned_by_user_id = ?,
                 assigned_at = ?, updated_at = ?
           WHERE id = ?`,
    params: [cleanedAssignee, context.user.id, timestamp, timestamp, id]
  }, auditStatement({
    action: "directory.review_item.assigned",
    actor,
    parishId: context.parishId,
    targetType: "directory_review_item",
    targetId: id,
    after: { assigneeUserId: cleanedAssignee },
    correlationId
  })]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function unassignDirectoryReviewItem(env, { context, sourceType, sourceId, correlationId = "" }) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  if (row.assigned_to_user_id !== context.user.id) requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.assignmentsManage]);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [{
    sql: "UPDATE directory_review_metadata SET queue_status = 'pending_review', assigned_to_user_id = NULL, assigned_by_user_id = NULL, assigned_at = NULL, updated_at = ? WHERE id = ?",
    params: [timestamp, id]
  }, auditStatement({ action: "directory.review_item.unassigned", actor, parishId: context.parishId, targetType: "directory_review_item", targetId: id, correlationId })]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function changeDirectoryReviewPriority(env, { context, sourceType, sourceId, priority, correlationId = "" }) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.assignmentsManage]);
  const cleanedPriority = cleanText(priority, { required: true, max: 40, field: "priority" });
  if (!PRIORITIES.has(cleanedPriority)) throw new DirectoryServiceError("validation_failed", "Review priority is not supported.");
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [{
    sql: "UPDATE directory_review_metadata SET priority = ?, updated_at = ? WHERE id = ?",
    params: [cleanedPriority, timestamp, id]
  }, auditStatement({ action: "directory.review_item.priority_changed", actor, parishId: context.parishId, targetType: "directory_review_item", targetId: id, after: { priority: cleanedPriority }, correlationId })]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function beginDirectoryReview(env, { context, sourceType, sourceId, correlationId = "" }) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  requireAny(actor, context.parishId, reviewDefinition(row).capabilities);
  if (row.assigned_to_user_id && row.assigned_to_user_id !== context.user.id) throw new DirectoryServiceError("assigned_elsewhere", "This item is assigned to another reviewer.", 409);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [{
    sql: "UPDATE directory_review_metadata SET queue_status = 'in_review', review_started_at = COALESCE(review_started_at, ?), updated_at = ? WHERE id = ?",
    params: [timestamp, timestamp, id]
  }, auditStatement({ action: "directory.review_item.opened", actor, parishId: context.parishId, targetType: "directory_review_item", targetId: id, correlationId })]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function decideDirectoryReviewItem(env, { context, sourceType, sourceId, decision, reasonCode = "", reviewerNote = "", requesterNote = "", expectedVersion = "", correlationId = "" }) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  requireAny(actor, context.parishId, reviewDefinition(row).capabilities);
  const cleanedDecision = cleanText(decision, { required: true, max: 40, field: "decision" });
  if (!DECISIONS.has(cleanedDecision)) throw new DirectoryServiceError("validation_failed", "Review decision is not supported.");
  if (expectedVersion && expectedVersion !== metadataDto(row).version) throw new DirectoryServiceError("stale_review_item", "Review item changed. Refresh before deciding.", 409);
  if (row.requester_user_id && row.requester_user_id === context.user.id && cleanedDecision === "approve") {
    throw new DirectoryServiceError("self_approval_denied", "Reviewers cannot approve their own directory request.", 403);
  }
  if (row.target_type === "person" && row.target_id === context.personId && cleanedDecision === "approve") {
    throw new DirectoryServiceError("self_approval_denied", "Reviewers cannot approve their own person record.", 403);
  }
  if (row.assigned_to_user_id && row.assigned_to_user_id !== context.user.id) throw new DirectoryServiceError("assigned_elsewhere", "This item is assigned to another reviewer.", 409);
  if (cleanedDecision === "approve") return approveReviewItem(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  return closeReviewItem(env, { context, row, decision: cleanedDecision, reasonCode, reviewerNote, requesterNote, correlationId });
}

async function closeReviewItem(env, { context, row, decision, reasonCode, reviewerNote, requesterNote, correlationId }) {
  const actor = actorDto(context);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  const sourceUpdates = [];
  if (row.source_type === "change_request") {
    const status = decision === "return" ? "pending" : decision === "cancel" ? "cancelled" : "denied";
    sourceUpdates.push({ sql: "UPDATE directory_change_requests SET status = ?, decision_reason_code = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'", params: [status, cleanText(reasonCode, { max: 80 }) || null, context.user.id, timestamp, timestamp, row.source_id] });
  } else if (row.source_type === "publication_profile") {
    const status = decision === "return" ? "draft" : "paused";
    sourceUpdates.push({ sql: "UPDATE directory_publication_profiles SET status = ?, approval_status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending_approval'", params: [status, timestamp, row.source_id] });
  } else if (row.source_type === "media_asset") {
    const status = decision === "return" ? "ready" : "rejected";
    sourceUpdates.push({ sql: "UPDATE directory_media_assets SET lifecycle_status = ?, updated_at = ? WHERE id = ? AND lifecycle_status = 'pending_approval'", params: [status, timestamp, row.source_id] });
  } else if (row.source_type === "duplicate_candidate") {
    const status = decision === "return" ? "deferred" : decision === "cancel" ? "cancelled" : "not_duplicate";
    sourceUpdates.push({ sql: "UPDATE directory_duplicate_candidates SET candidate_status = ?, decision = ?, decision_reason_code = ?, decided_by_user_id = ?, decided_at = ?, updated_at = ? WHERE id = ? AND parish_id = ?", params: [status, status, cleanText(reasonCode, { max: 80 }) || null, context.user.id, timestamp, timestamp, row.source_id, context.parishId] });
  } else if (row.source_type === "child_publication") {
    const status = decision === "return" ? "returned" : decision === "cancel" ? "withdrawn" : "rejected";
    sourceUpdates.push({
      sql: `UPDATE directory_child_publication_requests
            SET status = ?, reason_code = ?, reviewer_note = ?, reviewed_by_user_id = ?, updated_at = ?
            WHERE id = ? AND parish_id = ? AND status IN ('submitted', 'under_review', 'returned')`,
      params: [status, cleanText(reasonCode, { max: 80 }) || null, cleanText(reviewerNote, { max: 500 }) || null, context.user.id, timestamp, row.source_id, context.parishId]
    });
    sourceUpdates.push(auditStatement({
      action: `directory.child_publication.request_${decision === "return" ? "returned" : "rejected"}`,
      actor,
      parishId: context.parishId,
      targetType: "directory_child_publication_request",
      targetId: row.source_id,
      metadata: { reasonCode },
      correlationId
    }));
  } else if (row.source_type === "ministry_interest") {
    await closeMinistryInterestReview(env, { context, row, decision, reasonCode, reviewerNote, correlationId });
  }
  if (row.source_type === "ministry_interest") {
    const id = await ensureMetadata(env, { actor, row });
    await runAtomic(env, [
      { sql: "UPDATE directory_review_metadata SET queue_status = ?, returned_at = ?, completed_at = ?, updated_at = ? WHERE id = ?", params: [decision === "return" ? "returned" : decision === "cancel" ? "cancelled" : "denied", decision === "return" ? timestamp : null, decision === "return" ? null : timestamp, timestamp, id] },
      auditStatement({ action: `directory.review_item.${decision}ed`, actor, parishId: context.parishId, targetType: "directory_review_item", targetId: id, metadata: { sourceType: row.source_type, sourceId: row.source_id, reasonCode }, correlationId }),
      notificationStatement({ context, row, eventType: `directory.review.${decision}`, safeMessage: reviewNotification(decision) })
    ]);
    return { ok: true, decision, reviewItemId: id };
  }
  await runAtomic(env, [
    ...sourceUpdates,
    { sql: "UPDATE directory_review_metadata SET queue_status = ?, returned_at = ?, completed_at = ?, updated_at = ? WHERE id = ?", params: [decision === "return" ? "returned" : decision === "cancel" ? "cancelled" : "denied", decision === "return" ? timestamp : null, decision === "return" ? null : timestamp, timestamp, id] },
    auditStatement({ action: `directory.review_item.${decision}ed`, actor, parishId: context.parishId, targetType: "directory_review_item", targetId: id, metadata: { reasonCode, reviewerNote: cleanText(reviewerNote, { max: 500 }), requesterNote: cleanText(requesterNote, { max: 500 }) }, correlationId }),
    notificationStatement({ context, row, eventType: `directory.review.${decision}`, safeMessage: reviewNotification(decision) })
  ]);
  return { ok: true, decision, reviewItemId: id };
}

async function approveReviewItem(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId }) {
  if (row.source_type === "publication_profile") {
    const profile = await d1First(env, "SELECT * FROM directory_publication_profiles WHERE id = ?1 AND parish_id = ?2", row.source_id, context.parishId);
    await transitionPublicationProfile(env, { actor: actorDto(context), parishId: context.parishId, ownerType: profile.owner_type, ownerId: profile.owner_id, status: "approved", correlationId });
    return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  }
  if (row.source_type === "media_asset") {
    // Phase 2B.1 Approval Hard Gate: server-side, unconditional, no
    // reviewer/staff/platform-admin override exists anywhere in this call
    // path. Throws MEDIA_SECURE_TRANSFORMATION_REQUIRED (a
    // DirectoryServiceError, propagated to the caller as a 409) if the
    // asset or any of its required variants has not completed real image
    // transformation -- see src/directory/media.js's
    // assertMediaAssetSecurelyTransformed and
    // docs/directory/25-phase-2b1-security-review.md.
    await assertMediaAssetSecurelyTransformed(env, { mediaAssetId: row.source_id, parishId: context.parishId });
    const timestamp = nowMs();
    await runAtomic(env, [{ sql: "UPDATE directory_media_assets SET lifecycle_status = 'approved', updated_at = ? WHERE id = ? AND parish_id = ? AND lifecycle_status = 'pending_approval'", params: [timestamp, row.source_id, context.parishId] }]);
    return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  }
  if (row.source_type === "duplicate_candidate") {
    throw new DirectoryServiceError("use_duplicate_merge_flow", "Duplicate candidates must be confirmed, planned, and merged through the duplicate review workflow.", 422);
  }
  if (row.source_type === "child_publication") {
    return approveChildPublicationRequest(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  }
  if (row.source_type === "ministry_interest") {
    await approveMinistryInterestReview(env, { context, row, reviewerNote, correlationId });
    return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  }
  if (row.source_type !== "change_request") throw new DirectoryServiceError("unsupported_review_type", "Review source is not supported.", 422);
  const request = await d1First(env, "SELECT * FROM directory_change_requests WHERE id = ?1 AND parish_id = ?2 AND status = 'pending'", row.source_id, context.parishId);
  if (!request) throw new DirectoryServiceError("invalid_transition", "Only pending requests can be approved.", 409);
  const payload = JSON.parse(request.requested_payload_json || "{}");
  if (request.request_type === "person_profile_review") {
    await applyPersonAdminFields(env, {
      context,
      personId: request.target_id,
      patch: Object.fromEntries(["legalName", "biologicalSex", "deceased", "active", "notes"].filter((field) => field in payload).map((field) => [field, payload[field]])),
      allowedFields: ["legalName", "biologicalSex", "deceased", "active", "notes"],
      auditAction: "directory.admin.person_review_correction",
      correlationId
    });
    await applyPersonPublicationPreferences(env, { context, personId: request.target_id, preferences: payload.publicationPreferences, correlationId });
  } else if (request.request_type === "household_membership_add") {
    await addHouseholdMember(env, { actor: actorDto(context), parishId: context.parishId, householdId: request.household_id || request.target_id, personId: payload.personId, relationship: payload.relationship || "other" });
  } else if (request.request_type === "household_membership_remove") {
    await removeHouseholdMember(env, { actor: actorDto(context), parishId: context.parishId, householdId: request.household_id || request.target_id, personId: payload.personId });
  } else if (request.request_type === "household_admin_add") {
    await addHouseholdAdmin(env, { actor: actorDto(context), parishId: context.parishId, householdId: request.household_id || request.target_id, personId: payload.personId });
  } else if (request.request_type === "household_admin_remove") {
    await removeHouseholdAdmin(env, { actor: actorDto(context), parishId: context.parishId, householdId: request.household_id || request.target_id, personId: payload.personId });
  } else {
    throw new DirectoryServiceError("manual_review_required", "This request type can be triaged but is not auto-mutated in Phase 3A.", 422);
  }
  return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
}

// Phase 4B Approval Hard Gate for child publication (Part 11). Every
// precondition below is re-verified live at approval time -- none of them
// are trusted from the request row's stored status alone, since the
// child's/household's/requester's real-world state may have changed since
// submission (Part 24 concurrency). No reviewer, staff, or platform-admin
// override skips any of these checks.
async function approveChildPublicationRequest(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId }) {
  const request = await d1First(
    env,
    "SELECT * FROM directory_child_publication_requests WHERE id = ?1 AND parish_id = ?2 AND status IN ('submitted', 'under_review', 'returned')",
    row.source_id,
    context.parishId
  );
  if (!request) throw new DirectoryServiceError("invalid_transition", "Only a submitted request can be approved.", 409);

  // Child remains eligible (active, is_child, not protected, active household).
  const eligibility = await checkChildEligibility(env, { parishId: context.parishId, childPersonId: request.child_person_id });
  if (!eligibility.eligible) throw new DirectoryServiceError("child_not_eligible", "This child is no longer eligible for publication.", 409);

  // Requester remains an authorized household administrator of the same household.
  const requesterStillAuthorized = await d1First(
    env,
    `SELECT ha.id FROM directory_household_admins ha
       JOIN directory_person_links l ON l.person_id = ha.person_id AND l.link_type = 'platform_user' AND l.active = 1
      WHERE ha.household_id = ?1 AND ha.active = 1 AND l.external_id = ?2`,
    request.household_id,
    request.requester_user_id
  );
  if (!requesterStillAuthorized) throw new DirectoryServiceError("requester_no_longer_authorized", "The requesting household administrator is no longer authorized.", 409);

  // Parish directory must still be enabled.
  const settings = await getDirectorySettings(env, context.parishId);
  if (!settings.directoryEnabled) throw new DirectoryServiceError("directory_disabled", "The private directory is not enabled for this parish.", 409);

  // Requested fields must be exactly allowlisted -- re-sanitize and require
  // an exact match, so a corrupted or tampered row can never approve more
  // than the allowlist permits.
  const requestedFields = JSON.parse(request.requested_fields_json || "[]");
  const sanitizedFields = sanitizeChildFields(requestedFields);
  if (sanitizedFields.length !== requestedFields.length) {
    throw new DirectoryServiceError("invalid_requested_fields", "Requested fields are no longer valid against the current allowlist.", 409);
  }

  // Publication-policy revision must still be current.
  if (request.policy_revision !== CHILD_POLICY_REVISION) {
    throw new DirectoryServiceError("stale_policy_revision", "This request was submitted under a prior publication policy and must be resubmitted.", 409);
  }

  // Canonical child/household values must not have changed materially
  // since submission (Part 24: stale revision protection).
  const child = await d1First(env, "SELECT updated_at FROM directory_people WHERE id = ?1", request.child_person_id);
  const household = await d1First(env, "SELECT updated_at FROM directory_households WHERE id = ?1", request.household_id);
  if (request.child_revision && String(child?.updated_at || "") !== request.child_revision) {
    throw new DirectoryServiceError("stale_child_revision", "The child's record changed since this request was submitted. Ask the household to resubmit.", 409);
  }
  if (request.household_revision && String(household?.updated_at || "") !== request.household_revision) {
    throw new DirectoryServiceError("stale_household_revision", "The household changed since this request was submitted. Ask the household to resubmit.", 409);
  }

  // Photo: approved only if requested AND a currently active, approved,
  // securely-transformed photo exists for this exact child owner. If not
  // ready, the photo is silently excluded from approval (Part 11's
  // documented partial-approval policy) -- the rest of the request still
  // proceeds; the reviewer does not have to reject the whole request over
  // an unready photo.
  let approvedPhoto = false;
  if (Number(request.requested_photo)) {
    const photoRow = await d1First(
      env,
      `SELECT a.id FROM directory_media_assets a
         JOIN directory_media_assignments asn ON asn.media_asset_id = a.id
        WHERE asn.parish_id = ?1 AND asn.owner_type = 'person' AND asn.owner_id = ?2
          AND asn.assignment_status = 'active' AND a.lifecycle_status = 'approved'
          AND a.processing_status = 'securely_transformed' AND a.visibility = 'directory_members'
          AND a.publication_eligible = 1`,
      context.parishId,
      request.child_person_id
    );
    approvedPhoto = Boolean(photoRow);
  }

  const timestamp = nowMs();
  const actor = actorDto(context);
  await runAtomic(env, [
    {
      sql: `UPDATE directory_child_publication_requests
            SET status = 'approved', approved_fields_json = ?1, approved_photo = ?2,
                reviewed_by_user_id = ?3, reviewer_note = ?4, approved_at = ?5, updated_at = ?5
            WHERE id = ?6`,
      params: [JSON.stringify(sanitizedFields), approvedPhoto ? 1 : 0, context.user.id, cleanText(reviewerNote, { max: 500 }) || null, timestamp, request.id]
    },
    auditStatement({
      action: "directory.child_publication.request_approved",
      actor,
      parishId: context.parishId,
      targetType: "directory_child_publication_request",
      targetId: request.id,
      metadata: { fields: sanitizedFields, approvedPhoto, photoExcluded: Boolean(request.requested_photo) && !approvedPhoto },
      correlationId
    }),
    auditStatement({
      action: "directory.child_publication.projection_activated",
      actor,
      parishId: context.parishId,
      targetType: "directory_person",
      targetId: request.child_person_id,
      metadata: { requestId: request.id },
      correlationId
    })
  ]);
  return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
}

// Parish-staff revocation (Part 18/19). Immediately narrows effective
// visibility to hidden -- approval history is preserved (status becomes
// 'revoked', the row is never deleted), satisfying "do not automatically
// delete publication history."
export async function revokeChildPublicationApproval(env, { context, requestId, reasonCode = "", correlationId = "" }) {
  const actor = actorDto(context);
  requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.childPublicationReview, DIRECTORY_CAPABILITIES.manage]);
  const row = await d1First(env, "SELECT * FROM directory_child_publication_requests WHERE id = ?1 AND parish_id = ?2 AND status = 'approved'", requestId, context.parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Approved child publication request was not found.", 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_child_publication_requests SET status = 'revoked', revoked_at = ?1, reason_code = ?2, reviewed_by_user_id = ?3, updated_at = ?1 WHERE id = ?4", params: [timestamp, cleanText(reasonCode, { max: 80 }) || null, context.user.id, row.id] },
    auditStatement({ action: "directory.child_publication.approval_revoked", actor, parishId: context.parishId, targetType: "directory_child_publication_request", targetId: row.id, metadata: { reasonCode, childPersonId: row.child_person_id }, correlationId }),
    auditStatement({ action: "directory.child_publication.projection_deactivated", actor, parishId: context.parishId, targetType: "directory_person", targetId: row.child_person_id, metadata: { reason: "revoked" }, correlationId })
  ]);
  return { ok: true, id: row.id };
}

async function markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId }) {
  const actor = actorDto(context);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  const sourceUpdate = row.source_type === "change_request"
    ? { sql: "UPDATE directory_change_requests SET status = 'completed', decision_reason_code = ?, reviewed_by_user_id = ?, reviewed_at = ?, completed_at = ?, updated_at = ? WHERE id = ?", params: [cleanText(reasonCode, { max: 80 }) || null, context.user.id, timestamp, timestamp, timestamp, row.source_id] }
    : null;
  await runAtomic(env, [
    ...(sourceUpdate ? [sourceUpdate] : []),
    { sql: "UPDATE directory_review_metadata SET queue_status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?", params: [timestamp, timestamp, id] },
    auditStatement({ action: "directory.review_item.approved", actor, parishId: context.parishId, targetType: "directory_review_item", targetId: id, metadata: { sourceType: row.source_type, sourceId: row.source_id, reasonCode, reviewerNote: cleanText(reviewerNote, { max: 500 }), requesterNote: cleanText(requesterNote, { max: 500 }) }, correlationId }),
    notificationStatement({ context, row, eventType: "directory.review.approved", safeMessage: "Your directory request was approved." })
  ]);
  return { ok: true, decision: "approve", reviewItemId: id };
}

function notificationStatement({ context, row, eventType, safeMessage }) {
  return {
    sql: `INSERT INTO directory_notification_events
            (id, parish_id, recipient_user_id, actor_user_id, event_type, target_type, target_id, household_id, safe_message, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [generateSecret("dir_note"), context.parishId, row.requester_user_id || null, context.user.id, eventType, `directory_${row.target_type || "review"}`, row.target_id || row.source_id, row.household_id || null, safeMessage, safeJson({ sourceType: row.source_type, sourceId: row.source_id }), nowMs()]
  };
}

function reviewNotification(decision) {
  if (decision === "return") return "Your directory request was returned for correction.";
  if (decision === "cancel") return "Your directory request was cancelled by parish staff.";
  return "Your directory request was reviewed and denied.";
}

export async function listDirectoryPeopleAdmin(env, { context, query = "", limit = 50 }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.peopleManage, DIRECTORY_CAPABILITIES.requestsReview]);
  const q = `%${String(query || "").trim()}%`;
  const rows = await d1All(
    env,
    `SELECT p.id, p.preferred_name, p.active, p.updated_at,
            COUNT(DISTINCT hm.household_id) AS household_count,
            COUNT(DISTINCT cr.id) AS pending_request_count,
            MAX(COALESCE(f.protected_person, 0)) AS protected_person,
            MAX(COALESCE(f.is_child, 0)) AS is_child,
            CASE WHEN COUNT(DISTINCT l.id) > 0 THEN 1 ELSE 0 END AS claimed
       FROM directory_people p
       LEFT JOIN directory_household_members hm ON hm.person_id = p.id AND hm.active = 1
       LEFT JOIN directory_households h ON h.id = hm.household_id
       LEFT JOIN directory_change_requests cr ON cr.parish_id = ?1 AND cr.target_type = 'person' AND cr.target_id = p.id AND cr.status = 'pending'
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
       LEFT JOIN directory_person_links l ON l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1
      WHERE (p.created_by_parish_id = ?1 OR h.parish_id = ?1) AND (?2 = '%%' OR p.preferred_name LIKE ?2)
      GROUP BY p.id
      ORDER BY p.preferred_name
      LIMIT ?3`,
    context.parishId,
    q,
    Math.min(Number(limit) || 50, 100)
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.preferred_name,
    active: Number(row.active || 0) === 1,
    householdCount: Number(row.household_count || 0),
    pendingRequestCount: Number(row.pending_request_count || 0),
    protected: context.permissions.canManageProtected ? Number(row.protected_person || 0) === 1 : Number(row.protected_person || 0) === 1,
    child: Number(row.is_child || 0) === 1,
    claimed: Number(row.claimed || 0) === 1,
    lastUpdated: Number(row.updated_at || 0)
  }));
}

export async function getDirectoryPersonAdmin(env, { context, personId }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.peopleManage, DIRECTORY_CAPABILITIES.requestsReview]);
  const id = cleanText(personId, { required: true, max: 180, field: "personId" });
  const row = await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", id);
  if (!row) throw new DirectoryServiceError("not_found", "Directory person was not found.", 404);
  const [households, affiliations, publication, contacts, notes] = await Promise.all([
    d1All(env, `SELECT h.id, h.display_name, hm.relationship FROM directory_household_members hm JOIN directory_households h ON h.id = hm.household_id WHERE hm.person_id = ?1 AND h.parish_id = ?2 AND hm.active = 1`, id, context.parishId),
    d1All(env, "SELECT status, active FROM directory_parish_affiliations WHERE person_id = ?1 AND parish_id = ?2", id, context.parishId),
    d1First(env, "SELECT status, approval_status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1", context.parishId, id),
    context.permissions.canViewPrivateContact ? d1All(env, "SELECT contact_type, label, value, visibility FROM directory_contact_methods WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1", context.parishId, id) : [],
    context.permissions.canViewNotes ? listDirectoryNotes(env, { context, targetType: "person", targetId: id }) : []
  ]);
  return {
    person: { id: row.id, preferredName: row.preferred_name, legalName: context.permissions.canManagePeople ? row.legal_name || "" : maskValue(row.legal_name), active: Number(row.active || 0) === 1, version: row.updated_at },
    households,
    affiliations,
    publication: publication || null,
    contacts: contacts.map((contact) => ({ ...contact, value: context.permissions.canViewPrivateContact ? contact.value : maskValue(contact.value, contact.contact_type) })),
    notes
  };
}

export async function applyPersonDirectCorrection(env, { context, personId, patch = {}, expectedVersion, correlationId = "" }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.peopleManage]);
  const allowed = {};
  for (const key of ["preferredName", "middleName", "suffix"]) if (key in patch) allowed[key] = patch[key];
  return applyPersonAdminFields(env, {
    context,
    personId,
    patch: allowed,
    allowedFields: ["preferredName", "middleName", "suffix"],
    expectedVersion,
    auditAction: "directory.admin.person_direct_correction",
    correlationId
  });
}

export async function listDirectoryHouseholdsAdmin(env, { context, query = "", limit = 50 }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.requestsReview]);
  const q = `%${String(query || "").trim()}%`;
  const rows = await d1All(
    env,
    `SELECT h.id, h.display_name, h.active, h.updated_at,
            COUNT(DISTINCT hm.person_id) AS member_count,
            COUNT(DISTINCT ha.person_id) AS admin_count,
            COUNT(DISTINCT cr.id) AS pending_request_count,
            MAX(COALESCE(a.protected_address, 0)) AS protected_address
       FROM directory_households h
       LEFT JOIN directory_household_members hm ON hm.household_id = h.id AND hm.active = 1
       LEFT JOIN directory_household_admins ha ON ha.household_id = h.id AND ha.active = 1
       LEFT JOIN directory_change_requests cr ON cr.parish_id = h.parish_id AND cr.target_type = 'household' AND cr.target_id = h.id AND cr.status = 'pending'
       LEFT JOIN directory_addresses a ON a.parish_id = h.parish_id AND a.owner_type = 'household' AND a.owner_id = h.id AND a.active = 1
      WHERE h.parish_id = ?1 AND (?2 = '%%' OR h.display_name LIKE ?2)
      GROUP BY h.id
      ORDER BY h.display_name
      LIMIT ?3`,
    context.parishId,
    q,
    Math.min(Number(limit) || 50, 100)
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    active: Number(row.active || 0) === 1,
    memberCount: Number(row.member_count || 0),
    administratorCount: Number(row.admin_count || 0),
    pendingRequestCount: Number(row.pending_request_count || 0),
    protectedAddress: Number(row.protected_address || 0) === 1,
    lastUpdated: Number(row.updated_at || 0)
  }));
}

export async function getDirectoryHouseholdAdmin(env, { context, householdId }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.requestsReview]);
  const id = cleanText(householdId, { required: true, max: 180, field: "householdId" });
  const household = await d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2", id, context.parishId);
  if (!household) throw new DirectoryServiceError("not_found", "Directory household was not found.", 404);
  const [members, admins, publication, notes] = await Promise.all([
    d1All(env, `SELECT p.id, p.preferred_name, hm.relationship FROM directory_household_members hm JOIN directory_people p ON p.id = hm.person_id WHERE hm.household_id = ?1 AND hm.active = 1 ORDER BY p.preferred_name`, id),
    d1All(env, `SELECT p.id, p.preferred_name FROM directory_household_admins ha JOIN directory_people p ON p.id = ha.person_id WHERE ha.household_id = ?1 AND ha.active = 1 ORDER BY p.preferred_name`, id),
    d1First(env, "SELECT status, approval_status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2 AND active = 1", context.parishId, id),
    context.permissions.canViewNotes ? listDirectoryNotes(env, { context, targetType: "household", targetId: id }) : []
  ]);
  return { household: { id, displayName: household.display_name, active: Number(household.active || 0) === 1, version: household.updated_at }, members, administrators: admins, publication: publication || null, notes };
}

export async function applyHouseholdDirectCorrection(env, { context, householdId, patch = {}, expectedVersion, correlationId = "" }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.householdsManage]);
  const row = await d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2", cleanText(householdId, { required: true, max: 180, field: "householdId" }), context.parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Directory household was not found.", 404);
  if (String(expectedVersion || "") !== String(row.updated_at || "")) throw new DirectoryServiceError("stale_record", "Household changed. Refresh before correcting.", 409);
  const displayName = cleanText(patch.displayName, { required: true, max: 200, field: "displayName" });
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_households SET display_name = ?, updated_at = ? WHERE id = ? AND parish_id = ?", params: [displayName, timestamp, householdId, context.parishId] },
    auditStatement({ action: "directory.admin.household_direct_correction", actor: actorDto(context), parishId: context.parishId, targetType: "directory_household", targetId: householdId, before: { displayName: row.display_name }, after: { displayName }, correlationId })
  ]);
  return getDirectoryHouseholdAdmin(env, { context, householdId });
}

export async function listDirectoryNotes(env, { context, targetType, targetId }) {
  if (!context.permissions.canViewNotes) throw new DirectoryServiceError("forbidden", "Directory note access requires note-view capability.", 403);
  const rows = await d1All(
    env,
    `SELECT * FROM directory_internal_notes
      WHERE parish_id = ?1 AND target_type = ?2 AND target_id = ?3 AND archived_at IS NULL
        AND (visibility_class != 'protected' OR ?4 = 1)
      ORDER BY created_at DESC`,
    context.parishId,
    cleanText(targetType, { required: true, max: 40, field: "targetType" }),
    cleanText(targetId, { required: true, max: 180, field: "targetId" }),
    context.permissions.canManageProtected ? 1 : 0
  );
  return rows.map((row) => ({ id: row.id, targetType: row.target_type, targetId: row.target_id, category: row.category, visibilityClass: row.visibility_class, body: row.body, createdByUserId: row.created_by_user_id, createdAt: Number(row.created_at || 0), updatedAt: Number(row.updated_at || 0) }));
}

export async function createDirectoryNote(env, { context, targetType, targetId, category = "general", body, visibilityClass = "staff", correlationId = "" }) {
  if (!context.permissions.canManageNotes) throw new DirectoryServiceError("forbidden", "Directory note changes require note-management capability.", 403);
  const cleanedCategory = cleanText(category, { required: true, max: 40, field: "category" });
  if (!NOTE_CATEGORIES.has(cleanedCategory)) throw new DirectoryServiceError("validation_failed", "Directory note category is not supported.");
  const cleanedVisibility = cleanText(visibilityClass, { required: true, max: 40, field: "visibilityClass" });
  if (cleanedVisibility === "protected" && !context.permissions.canManageProtected) throw new DirectoryServiceError("forbidden", "Protected notes require protected-record authority.", 403);
  const timestamp = nowMs();
  const id = generateSecret("dir_note");
  await runAtomic(env, [
    { sql: `INSERT INTO directory_internal_notes (id, parish_id, target_type, target_id, category, visibility_class, body, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, params: [id, context.parishId, targetType, targetId, cleanedCategory, cleanedVisibility, cleanText(body, { required: true, max: 2000, field: "body" }), context.user.id, timestamp, timestamp] },
    auditStatement({ action: "directory.internal_note.created", actor: actorDto(context), parishId: context.parishId, targetType: `directory_${targetType}`, targetId, metadata: { category: cleanedCategory, visibilityClass: cleanedVisibility }, correlationId })
  ]);
  return (await listDirectoryNotes(env, { context, targetType, targetId })).find((note) => note.id === id);
}

export async function archiveDirectoryNote(env, { context, noteId, correlationId = "" }) {
  if (!context.permissions.canManageNotes) throw new DirectoryServiceError("forbidden", "Directory note changes require note-management capability.", 403);
  const row = await d1First(env, "SELECT * FROM directory_internal_notes WHERE id = ?1 AND parish_id = ?2", cleanText(noteId, { required: true, max: 180, field: "noteId" }), context.parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Directory note was not found.", 404);
  if (row.visibility_class === "protected" && !context.permissions.canManageProtected) throw new DirectoryServiceError("forbidden", "Protected notes require protected-record authority.", 403);
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_internal_notes SET archived_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?", params: [timestamp, context.user.id, timestamp, row.id] },
    auditStatement({ action: "directory.internal_note.archived", actor: actorDto(context), parishId: context.parishId, targetType: `directory_${row.target_type}`, targetId: row.target_id, correlationId })
  ]);
  return { ok: true };
}

export async function listDirectoryAuditHistory(env, { context, targetType = "", targetId = "", limit = 50 }) {
  if (!context.permissions.canViewAudit) throw new DirectoryServiceError("forbidden", "Directory audit access requires audit-view capability.", 403);
  const params = [context.parishId];
  let where = "organization_id = ?1 AND action LIKE 'directory.%'";
  if (targetType) { params.push(cleanText(targetType, { max: 80 })); where += ` AND target_type = ?${params.length}`; }
  if (targetId) { params.push(cleanText(targetId, { max: 180 })); where += ` AND target_id = ?${params.length}`; }
  params.push(Math.min(Number(limit) || 50, 100));
  const rows = await d1All(env, `SELECT id, actor_user_id, action, target_type, target_id, request_id, created_at FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT ?${params.length}`, ...params);
  return rows.map((row) => ({ id: row.id, actorUserId: row.actor_user_id || "", action: row.action, targetType: row.target_type, targetId: row.target_id, requestId: row.request_id || "", createdAt: row.created_at }));
}

export async function runDirectoryDuplicateScan(env, { context, entityType = "all", correlationId = "" }) {
  return generateDuplicateCandidates(env, { context, entityType, correlationId });
}

export async function listDirectoryDuplicateCandidates(env, { context, status = "open", entityType = "", limit = 50 }) {
  return listDuplicateCandidates(env, { context, status, entityType, limit });
}

export async function getDirectoryDuplicateCandidate(env, { context, candidateId }) {
  return getDuplicateComparison(env, { context, candidateId });
}

export async function decideDirectoryDuplicateCandidate(env, { context, candidateId, decision, reasonCode = "", expectedVersion = "", correlationId = "" }) {
  const candidate = await decideDuplicateCandidate(env, { context, candidateId, decision, reasonCode, expectedVersion, correlationId });
  const sourceRow = {
    parish_id: context.parishId,
    source_type: "duplicate_candidate",
    source_id: candidate.id,
    review_key: candidate.entityType === "person" ? "duplicate_person" : "duplicate_household",
    review_type: candidate.entityType === "person" ? "person_duplicate_review" : "household_duplicate_review"
  };
  if (["not_duplicate", "deferred"].includes(candidate.status)) {
    const reviewId = await ensureMetadata(env, { actor: actorDto(context), row: sourceRow });
    await runAtomic(env, [{
      sql: "UPDATE directory_review_metadata SET queue_status = ?, updated_at = ? WHERE id = ?",
      params: [candidate.status === "deferred" ? "returned" : "completed", nowMs(), reviewId]
    }]);
  }
  return candidate;
}

export async function planDirectoryDuplicateMerge(env, { context, candidateId, survivorId, expectedVersion = "", correlationId = "" }) {
  return planDuplicateMerge(env, { context, candidateId, survivorId, expectedVersion, correlationId });
}

export async function executeDirectoryDuplicateMerge(env, { context, candidateId, expectedVersion = "", correlationId = "" }) {
  const result = await executeDuplicateMerge(env, { context, candidateId, expectedVersion, correlationId });
  const row = await d1First(env, "SELECT entity_type FROM directory_duplicate_candidates WHERE id = ?1 AND parish_id = ?2", candidateId, context.parishId);
  const reviewId = await ensureMetadata(env, {
    actor: actorDto(context),
    row: {
      parish_id: context.parishId,
      source_type: "duplicate_candidate",
      source_id: candidateId,
      review_key: row?.entity_type === "household" ? "duplicate_household" : "duplicate_person",
      review_type: row?.entity_type === "household" ? "household_duplicate_review" : "person_duplicate_review"
    }
  });
  await runAtomic(env, [{ sql: "UPDATE directory_review_metadata SET queue_status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?", params: [nowMs(), nowMs(), reviewId] }]);
  return result;
}

// ── Phase 2B.1: legacy media audit + reprocessing (parish-scoped only) ──
// "Do not expose global bulk actions without strict capability and parish
// scoping" (Part 23) -- both functions below are hard-scoped to
// context.parishId; there is no route or parameter anywhere that lets a
// caller request a platform-wide sweep through these two functions.

export async function getDirectoryMediaLegacyAudit(env, { context, correlationId = "" }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.mediaReprocess, DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage]);
  return auditDirectoryMediaLegacyAssets(env, { parishId: context.parishId, correlationId });
}

export async function requestDirectoryMediaReprocessing(env, { context, mediaAssetId, correlationId = "" }) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.mediaReprocess, DIRECTORY_CAPABILITIES.manage]);
  const asset = await reprocessDirectoryMediaAsset(env, { context, mediaAssetId, correlationId });
  await runAtomic(env, [auditStatement({
    action: "directory.media.reviewer_requested_reprocessing",
    actor: actorDto(context),
    parishId: context.parishId,
    targetType: "directory_media_asset",
    targetId: mediaAssetId,
    correlationId
  })]);
  return asset;
}
