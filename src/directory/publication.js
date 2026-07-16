import { d1First } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { getDirectorySettings } from "./settings.js";
import {
  assertCanManageOwner,
  assertOwnerInParish,
  assertParishActor,
  auditStatement,
  boolToInt,
  cleanText,
  DIRECTORY_CAPABILITIES,
  normalizeOwner,
  nowMs,
  runAtomic
} from "./shared.js";

export const PUBLICATION_STATUSES = Object.freeze(["not_configured", "draft", "pending_approval", "approved", "paused", "archived"]);

const ALLOWED_TRANSITIONS = Object.freeze({
  not_configured: new Set(["draft", "pending_approval", "archived"]),
  draft: new Set(["pending_approval", "paused", "archived"]),
  pending_approval: new Set(["approved", "draft", "paused", "archived"]),
  approved: new Set(["paused", "archived"]),
  paused: new Set(["draft", "pending_approval", "approved", "archived"]),
  archived: new Set([])
});

function normalizeStatus(status) {
  const cleaned = cleanText(status, { required: true, max: 40, field: "publicationStatus" });
  if (!PUBLICATION_STATUSES.includes(cleaned)) throw new DirectoryServiceError("validation_failed", "Publication status is not supported.");
  return cleaned;
}

function rowToProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    status: row.status,
    approvalStatus: row.approval_status,
    approvedByUserId: row.approved_by_user_id || "",
    approvedAt: row.approved_at ? Number(row.approved_at) : null,
    active: Number(row.active || 0) === 1,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

export async function getPublicationProfile(env, { parishId, ownerType, ownerId }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const row = await d1First(
    env,
    "SELECT * FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND active = 1",
    parishId, owner.ownerType, owner.ownerId
  );
  return rowToProfile(row) || {
    parishId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    status: "not_configured",
    approvalStatus: "not_submitted",
    active: true,
    persisted: false
  };
}

export async function createPublicationProfile(env, { actor: actorInput, parishId, ownerType, ownerId, status = "draft", correlationId = "" }) {
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const owner = normalizeOwner(ownerType, ownerId);
  await assertOwnerInParish(env, { ...owner, parishId: cleanedParishId });
  const actor = await assertCanManageOwner(env, actorInput, { parishId: cleanedParishId, ...owner });
  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === "approved") throw new DirectoryServiceError("illegal_publication_transition", "New publication profiles cannot be auto-approved.", 400);
  const timestamp = nowMs();
  const id = `dir_pub_${timestamp}_${Math.random().toString(16).slice(2)}`;
  const approvalStatus = normalizedStatus === "pending_approval" ? "pending" : "not_submitted";

  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_publication_profiles
              (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      params: [id, cleanedParishId, owner.ownerType, owner.ownerId, normalizedStatus, approvalStatus, timestamp, timestamp]
    },
    auditStatement({
      action: "directory.publication_profile_created",
      actor,
      parishId: cleanedParishId,
      targetType: `directory_${owner.ownerType}_publication`,
      targetId: id,
      after: { ownerType: owner.ownerType, status: normalizedStatus, approvalStatus },
      correlationId
    })
  ]);
  return getPublicationProfile(env, { parishId: cleanedParishId, ...owner });
}

export async function transitionPublicationProfile(env, { actor: actorInput, parishId, ownerType, ownerId, status, correlationId = "" }) {
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const owner = normalizeOwner(ownerType, ownerId);
  const nextStatus = normalizeStatus(status);
  const existing = await getPublicationProfile(env, { parishId: cleanedParishId, ...owner });
  if (!existing.persisted && existing.status === "not_configured") {
    return createPublicationProfile(env, { actor: actorInput, parishId: cleanedParishId, ...owner, status: nextStatus, correlationId });
  }
  const allowed = ALLOWED_TRANSITIONS[existing.status] || new Set();
  if (!allowed.has(nextStatus)) throw new DirectoryServiceError("illegal_publication_transition", "Publication state transition is not allowed.", 400);

  let actor;
  if (nextStatus === "approved") {
    actor = assertParishActor(actorInput, cleanedParishId, [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage]);
  } else {
    actor = await assertCanManageOwner(env, actorInput, { parishId: cleanedParishId, ...owner });
  }
  const settings = await getDirectorySettings(env, cleanedParishId);
  if (nextStatus === "approved" && settings.publicationApprovalRequired && !actor.capabilities.includes(DIRECTORY_CAPABILITIES.publicationReview) && !actor.capabilities.includes(DIRECTORY_CAPABILITIES.manage)) {
    throw new DirectoryServiceError("forbidden", "Publication approval requires review capability.", 403);
  }
  const timestamp = nowMs();
  const approvalStatus = nextStatus === "approved" ? "approved" : nextStatus === "pending_approval" ? "pending" : existing.approvalStatus === "approved" && nextStatus === "paused" ? "approved" : "not_submitted";
  const action = nextStatus === "pending_approval"
    ? "directory.publication_submitted"
    : nextStatus === "approved"
      ? "directory.publication_approved"
      : nextStatus === "paused"
        ? "directory.publication_paused"
        : "directory.publication_profile_updated";

  await runAtomic(env, [
    {
      sql: `UPDATE directory_publication_profiles
            SET status = ?, approval_status = ?, approved_by_user_id = ?, approved_at = ?, updated_at = ?
            WHERE id = ?`,
      params: [
        nextStatus,
        approvalStatus,
        nextStatus === "approved" ? actor.userId : existing.approvedByUserId || null,
        nextStatus === "approved" ? timestamp : existing.approvedAt,
        timestamp,
        existing.id
      ]
    },
    auditStatement({
      action,
      actor,
      parishId: cleanedParishId,
      targetType: `directory_${owner.ownerType}_publication`,
      targetId: existing.id,
      before: { status: existing.status, approvalStatus: existing.approvalStatus },
      after: { status: nextStatus, approvalStatus },
      correlationId
    })
  ]);
  return getPublicationProfile(env, { parishId: cleanedParishId, ...owner });
}

export async function publicationPermitsOrdinaryProjection(env, { parishId, ownerType, ownerId }) {
  const settings = await getDirectorySettings(env, parishId);
  if (!settings.directoryEnabled || !settings.ordinaryMemberAccessEnabled) return false;
  const profile = await getPublicationProfile(env, { parishId, ownerType, ownerId });
  return profile.status === "approved" && profile.approvalStatus === "approved" && profile.active;
}
