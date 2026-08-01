import { d1All, d1First, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { cleanText, nowMs, runAtomic } from "./shared.js";

function messageDto(row) {
  return {
    id: row.id,
    direction: row.direction,
    body: row.body,
    createdByUserId: row.created_by_user_id,
    createdAt: Number(row.created_at || 0)
  };
}

export function directoryReviewMessageStatement({ parishId, sourceType, sourceId, direction, body, userId, timestamp = nowMs() }) {
  const cleanedBody = cleanText(body, { required: true, max: 1200, field: "message" });
  return {
    sql: `INSERT INTO directory_review_correspondence
            (id, parish_id, source_type, source_id, direction, body, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [generateSecret("dir_msg"), parishId, sourceType, sourceId, direction, cleanedBody, userId, timestamp]
  };
}

export async function listDirectoryReviewConversation(env, { parishId, sourceType, sourceId }) {
  const rows = await d1All(
    env,
    `SELECT * FROM directory_review_correspondence
      WHERE parish_id = ?1 AND source_type = ?2 AND source_id = ?3
      ORDER BY created_at ASC`,
    parishId,
    sourceType,
    sourceId
  ).catch(() => []);
  return rows.map(messageDto);
}

function manageableHouseholdIds(context) {
  return new Set((context.manageableHouseholds || []).map((item) => item.id));
}

function selfParishId(context) {
  const parishId = context.activeParishContexts?.[0]?.parishId || context.manageableHouseholds?.[0]?.parishId || context.memberHouseholds?.[0]?.parishId;
  if (!parishId) throw new DirectoryServiceError("forbidden", "A parish connection is required for directory confirmation.", 403);
  return parishId;
}

async function accessibleReturnedPublication(env, context, sourceId) {
  const parishId = selfParishId(context);
  const profile = await d1First(
    env,
    `SELECT * FROM directory_publication_profiles
      WHERE id = ?1 AND parish_id = ?2 AND active = 1`,
    sourceId,
    parishId
  );
  if (!profile) throw new DirectoryServiceError("not_found", "Directory confirmation request was not found.", 404);
  const accessible = profile.owner_type === "person"
    ? profile.owner_id === context.currentPerson?.id
    : manageableHouseholdIds(context).has(profile.owner_id);
  if (!accessible) throw new DirectoryServiceError("forbidden", "You cannot respond to this directory confirmation request.", 403);
  if (profile.status !== "draft" || profile.approval_status !== "rejected") {
    throw new DirectoryServiceError("invalid_transition", "This directory submission is not waiting for more information.", 409);
  }
  return profile;
}

export async function listMyDirectoryReviewRequests(env, { context }) {
  const parishId = selfParishId(context);
  const personId = context.currentPerson?.id || "";
  const householdIds = [...manageableHouseholdIds(context)];
  const rows = await d1All(
    env,
    `SELECT pp.*, COALESCE(p.preferred_name, h.display_name, 'Directory record') AS target_label
       FROM directory_publication_profiles pp
       LEFT JOIN directory_people p ON pp.owner_type = 'person' AND p.id = pp.owner_id
       LEFT JOIN directory_households h ON pp.owner_type = 'household' AND h.id = pp.owner_id
      WHERE pp.parish_id = ?1 AND pp.active = 1
        AND pp.status = 'draft' AND pp.approval_status = 'rejected'`,
    parishId
  ).catch(() => []);
  const visible = rows.filter((row) => row.owner_type === "person" ? row.owner_id === personId : householdIds.includes(row.owner_id));
  return Promise.all(visible.map(async (row) => ({
    sourceType: "publication_profile",
    sourceId: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    targetLabel: row.target_label,
    status: "information_requested",
    conversation: await listDirectoryReviewConversation(env, { parishId, sourceType: "publication_profile", sourceId: row.id })
  })));
}

export async function respondToDirectoryReviewRequest(env, { context, sourceType, sourceId, message }) {
  if (sourceType !== "publication_profile") throw new DirectoryServiceError("unsupported_review_type", "This confirmation request cannot be resubmitted here.", 422);
  const profile = await accessibleReturnedPublication(env, context, sourceId);
  const parishId = profile.parish_id;
  const timestamp = nowMs();
  await runAtomic(env, [
    directoryReviewMessageStatement({ parishId, sourceType, sourceId, direction: "member_to_staff", body: message, userId: context.user.id, timestamp }),
    {
      sql: `UPDATE directory_publication_profiles
               SET status = 'pending_approval', approval_status = 'pending', updated_at = ?
             WHERE id = ? AND parish_id = ? AND status = 'draft' AND approval_status = 'rejected'`,
      params: [timestamp, profile.id, parishId]
    },
    {
      sql: `UPDATE directory_review_metadata
               SET queue_status = 'pending_review', returned_at = NULL, completed_at = NULL, updated_at = ?
             WHERE parish_id = ? AND source_type = ? AND source_id = ?`,
      params: [timestamp, parishId, sourceType, sourceId]
    }
  ]);
  return { ok: true, status: "pending_review", sourceType, sourceId };
}
