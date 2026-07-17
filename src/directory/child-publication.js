// Parish Directory Phase 4B -- Child Publication Safeguards.
//
// This module is the single source of truth for whether, and how, a child
// may appear in the private member directory. It is deliberately separate
// from src/directory/publication.js (the generic adult/household
// publication-profile engine, which has no field-level granularity) --
// see docs/directory/37-phase-4b-child-publication-policy.md.
//
// Core rule, enforced throughout this file: a child is hidden unless an
// explicit, currently-approved request exists AND every live precondition
// (active child, active household, not protected, etc.) still holds at
// the moment of every read -- approval status is never trusted as a cache
// of "safe to show," it is re-verified every time.

import { d1First, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { getPersonPrivacyFlags } from "./privacy.js";
import {
  auditStatement,
  cleanText,
  nowMs,
  runAtomic
} from "./shared.js";

export const POLICY_REVISION = "child-publication-v1";

// Centralized, server-side allowlist (Part 3). Deliberately narrower than
// the adult member allowlist, and deliberately limited to columns that
// genuinely exist on directory_people/directory_household_members --
// repository inspection (migrations/0022_directory_canonical_foundation.sql)
// confirmed there is no first-name/surname split, no patron-saint or
// name-day column, and no parish-role column on the canonical person
// record. "patron_saint"/"name_day" in particular live only in the Learn
// module's family-planning data, which the brief explicitly forbids ever
// publishing here, so they are deliberately NOT offered as field codes.
// "photo" is handled as its own boolean (requestedPhoto/approvedPhoto),
// not a field code, per Part 17's explicit separate-approval framing for
// media.
export const CHILD_FIELD_CODES = Object.freeze([
  "preferred_name",
  "relationship_label"
]);

const CHILD_FIELD_SET = new Set(CHILD_FIELD_CODES);
const NON_TERMINAL_STATUSES = Object.freeze(["draft", "submitted", "under_review", "returned"]);
const TERMINAL_STATUSES = Object.freeze(["approved", "rejected", "withdrawn", "revoked", "stale", "superseded"]);

export function sanitizeChildFields(requested) {
  if (!Array.isArray(requested)) return [];
  return [...new Set(requested.filter((code) => CHILD_FIELD_SET.has(code)))];
}

function requestDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    householdId: row.household_id,
    childPersonId: row.child_person_id,
    status: row.status,
    requestedFields: safeJsonParse(row.requested_fields_json),
    approvedFields: safeJsonParse(row.approved_fields_json),
    requestedPhoto: Number(row.requested_photo || 0) === 1,
    approvedPhoto: Number(row.approved_photo || 0) === 1,
    parentNote: row.parent_note || "",
    reviewerNote: row.reviewer_note || "",
    reasonCode: row.reason_code || "",
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    submittedAt: row.submitted_at ? Number(row.submitted_at) : null,
    approvedAt: row.approved_at ? Number(row.approved_at) : null,
    withdrawnAt: row.withdrawn_at ? Number(row.withdrawn_at) : null,
    revokedAt: row.revoked_at ? Number(row.revoked_at) : null,
    version: `${row.updated_at || ""}:${row.request_revision || 1}`
  };
}

function safeJsonParse(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- Eligibility (Part 1) --------------------------------------------

// Eligibility is a live, re-derivable fact, never cached. Every one of
// these conditions is re-checked on every call, and again independently at
// approval time (Part 11) and at every projection read (Part 5/19).
export async function checkChildEligibility(env, { parishId, childPersonId }) {
  const person = await d1First(env, "SELECT * FROM directory_people WHERE id = ?1 AND active = 1", childPersonId);
  if (!person) return { eligible: false, reasonCode: "child_inactive_or_missing" };

  const flags = await getPersonPrivacyFlags(env, { parishId, personId: childPersonId });
  if (!flags.isChild) return { eligible: false, reasonCode: "not_a_child_record" };
  if (flags.protectedPerson) return { eligible: false, reasonCode: "child_protected" };

  const affiliation = await d1First(
    env,
    "SELECT id FROM directory_parish_affiliations WHERE person_id = ?1 AND parish_id = ?2 AND active = 1 AND status != 'former_member'",
    childPersonId,
    parishId
  );
  const household = await d1First(
    env,
    `SELECT h.id AS household_id FROM directory_household_members hm
       JOIN directory_households h ON h.id = hm.household_id
      WHERE hm.person_id = ?1 AND hm.active = 1 AND h.active = 1 AND h.parish_id = ?2
      LIMIT 1`,
    childPersonId,
    parishId
  );
  if (!household) return { eligible: false, reasonCode: "child_no_active_household" };
  if (!affiliation) {
    // A child may still be eligible purely via active household membership
    // even without a standalone parish affiliation row (children are not
    // always separately affiliated) -- household membership in an active,
    // in-parish household is itself the operative eligibility signal here,
    // mirroring how Phase 4A treats household membership as a parish-
    // visibility signal for viewers (member-directory.js visibleParishIds).
  }

  return { eligible: true, reasonCode: "", householdId: household.household_id };
}

// ---- Requester authorization (Part 2) ---------------------------------

// Only an active household administrator of the child's own household may
// request publication. Parental/guardian authority beyond household
// administration is not modeled anywhere in this repository (confirmed by
// inspection -- no guardianship table exists), so household-administrator
// authority is used as documented in docs/directory/40-phase-4b-parent-reviewer-authorization.md.
// This function never infers authority from surname, address, or any
// other implicit signal.
export async function assertRequesterAuthority(env, { context, householdId }) {
  if (!context?.claimed) throw new DirectoryServiceError("unauthorized", "Directory self-service requires a claimed directory person.", 401);
  const managed = (context.manageableHouseholds || []).find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You are not an administrator of this household.", 403);
  return managed;
}

async function assertChildBelongsToHousehold(env, { householdId, childPersonId, parishId }) {
  const row = await d1First(
    env,
    "SELECT id FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2 AND active = 1",
    householdId,
    childPersonId
  );
  if (!row) throw new DirectoryServiceError("forbidden", "This child is not an active member of that household.", 403);
  return true;
}

function actorFromContext(context) {
  return { userId: context.user.id, parishId: context.manageableHouseholds?.[0]?.parishId || "", capabilities: [], personId: context.currentPerson?.id || "" };
}

// ---- Draft / submit / withdraw (parent-facing, Parts 4-7) --------------

export async function getChildPublicationStatus(env, { context, childPersonId, householdId }) {
  const managed = await assertRequesterAuthority(env, { context, householdId });
  const row = await d1First(
    env,
    `SELECT * FROM directory_child_publication_requests
      WHERE child_person_id = ?1 AND parish_id = ?2
      ORDER BY created_at DESC LIMIT 1`,
    childPersonId,
    managed.parishId
  );
  return requestDto(row);
}

export async function createOrUpdateChildPublicationDraft(env, {
  context,
  householdId,
  childPersonId,
  requestedFields = [],
  requestedPhoto = false,
  parentNote = "",
  correlationId = ""
}) {
  const managed = await assertRequesterAuthority(env, { context, householdId });
  const parishId = managed.parishId;
  await assertChildBelongsToHousehold(env, { householdId, childPersonId, parishId });

  const eligibility = await checkChildEligibility(env, { parishId, childPersonId });
  if (!eligibility.eligible) throw new DirectoryServiceError("child_not_eligible", "This child is not currently eligible for publication.", 422);

  const cleanedFields = sanitizeChildFields(requestedFields);
  const timestamp = nowMs();

  const existing = await d1First(
    env,
    `SELECT * FROM directory_child_publication_requests
      WHERE parish_id = ?1 AND child_person_id = ?2 AND status IN ('draft', 'returned')
      ORDER BY created_at DESC LIMIT 1`,
    parishId,
    childPersonId
  );

  const actor = actorFromContext(context);
  actor.parishId = parishId;

  if (existing) {
    await runAtomic(env, [
      {
        sql: `UPDATE directory_child_publication_requests
              SET requested_fields_json = ?1, requested_photo = ?2, parent_note = ?3,
                  request_revision = request_revision + 1, status = 'draft', updated_at = ?4
              WHERE id = ?5`,
        params: [JSON.stringify(cleanedFields), requestedPhoto ? 1 : 0, cleanText(parentNote, { max: 500 }) || null, timestamp, existing.id]
      },
      auditStatement({ action: "directory.child_publication.fields_selected", actor, parishId, targetType: "directory_child_publication_request", targetId: existing.id, metadata: { fields: cleanedFields, requestedPhoto }, correlationId })
    ]);
    return getChildPublicationStatus(env, { context, childPersonId, householdId });
  }

  const id = generateSecret("child_pub_req");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_child_publication_requests
              (id, parish_id, household_id, child_person_id, requester_user_id, requester_person_id,
               status, requested_fields_json, requested_photo, request_revision, policy_revision,
               parent_note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, 1, ?, ?, ?, ?)`,
      params: [
        id, parishId, householdId, childPersonId, context.user.id, context.currentPerson?.id || null,
        JSON.stringify(cleanedFields), requestedPhoto ? 1 : 0, POLICY_REVISION,
        cleanText(parentNote, { max: 500 }) || null, timestamp, timestamp
      ]
    },
    auditStatement({ action: "directory.child_publication.draft_created", actor, parishId, targetType: "directory_child_publication_request", targetId: id, metadata: { childPersonId, fields: cleanedFields, requestedPhoto }, correlationId })
  ]);
  return getChildPublicationStatus(env, { context, childPersonId, householdId });
}

export async function submitChildPublicationRequest(env, { context, requestId, correlationId = "" }) {
  const row = await d1First(env, "SELECT * FROM directory_child_publication_requests WHERE id = ?1", requestId);
  if (!row) throw new DirectoryServiceError("not_found", "Child publication request was not found.", 404);
  const managed = await assertRequesterAuthority(env, { context, householdId: row.household_id });
  const parishId = managed.parishId;
  if (row.parish_id !== parishId) throw new DirectoryServiceError("not_found", "Child publication request was not found.", 404);
  if (!["draft", "returned"].includes(row.status)) throw new DirectoryServiceError("invalid_transition", "Only a draft or returned request can be submitted.", 409);

  const fields = safeJsonParse(row.requested_fields_json);
  if (!fields.length && !Number(row.requested_photo)) {
    throw new DirectoryServiceError("validation_failed", "Select at least one field or the photo before submitting.", 422);
  }
  const eligibility = await checkChildEligibility(env, { parishId, childPersonId: row.child_person_id });
  if (!eligibility.eligible) throw new DirectoryServiceError("child_not_eligible", "This child is not currently eligible for publication.", 422);

  const child = await d1First(env, "SELECT updated_at FROM directory_people WHERE id = ?1", row.child_person_id);
  const household = await d1First(env, "SELECT updated_at FROM directory_households WHERE id = ?1", row.household_id);
  const timestamp = nowMs();
  const actor = actorFromContext(context);
  actor.parishId = parishId;

  await runAtomic(env, [
    {
      sql: `UPDATE directory_child_publication_requests
            SET status = 'submitted', submitted_at = ?1, child_revision = ?2, household_revision = ?3,
                request_revision = request_revision + 1, updated_at = ?1
            WHERE id = ?4`,
      params: [timestamp, String(child?.updated_at || ""), String(household?.updated_at || ""), row.id]
    },
    auditStatement({ action: "directory.child_publication.request_submitted", actor, parishId, targetType: "directory_child_publication_request", targetId: row.id, metadata: { childPersonId: row.child_person_id }, correlationId })
  ]);
  return getChildPublicationStatus(env, { context, childPersonId: row.child_person_id, householdId: row.household_id });
}

export async function withdrawChildPublicationRequest(env, { context, requestId, correlationId = "" }) {
  const row = await d1First(env, "SELECT * FROM directory_child_publication_requests WHERE id = ?1", requestId);
  if (!row) throw new DirectoryServiceError("not_found", "Child publication request was not found.", 404);
  const managed = await assertRequesterAuthority(env, { context, householdId: row.household_id });
  const parishId = managed.parishId;
  if (row.parish_id !== parishId) throw new DirectoryServiceError("not_found", "Child publication request was not found.", 404);
  if (TERMINAL_STATUSES.includes(row.status) && row.status !== "approved") {
    // Idempotent: withdrawing an already-terminal (non-approved) request is
    // a safe no-op rather than an error (Part 24: "repeated withdrawal
    // idempotent").
    return getChildPublicationStatus(env, { context, childPersonId: row.child_person_id, householdId: row.household_id });
  }
  const timestamp = nowMs();
  const actor = actorFromContext(context);
  actor.parishId = parishId;
  await runAtomic(env, [
    { sql: "UPDATE directory_child_publication_requests SET status = 'withdrawn', withdrawn_at = ?1, updated_at = ?1 WHERE id = ?2", params: [timestamp, row.id] },
    auditStatement({ action: "directory.child_publication.request_withdrawn", actor, parishId, targetType: "directory_child_publication_request", targetId: row.id, metadata: { childPersonId: row.child_person_id, previousStatus: row.status }, correlationId })
  ]);
  return getChildPublicationStatus(env, { context, childPersonId: row.child_person_id, householdId: row.household_id });
}

export { NON_TERMINAL_STATUSES, TERMINAL_STATUSES };
