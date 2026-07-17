import { d1, d1Batch, d1First, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";

export const VISIBILITY_LEVELS = Object.freeze(["private", "household", "clergy", "staff", "leadership", "directory_members"]);
export const VISIBILITY_RANK = Object.freeze(Object.fromEntries(VISIBILITY_LEVELS.map((level, index) => [level, index])));

export const DIRECTORY_CAPABILITIES = Object.freeze({
  view: "directory.view",
  selfManage: "directory.self.manage",
  peopleManage: "directory.people.manage",
  householdsManage: "directory.households.manage",
  requestsReview: "directory.requests.review",
  membershipsReview: "directory.memberships.review",
  householdAdminsReview: "directory.household_admins.review",
  correctionsReview: "directory.corrections.review",
  protectedManage: "directory.protected.manage",
  notesView: "directory.notes.view",
  notesManage: "directory.notes.manage",
  assignmentsManage: "directory.assignments.manage",
  publicationReview: "directory.publication.review",
  settingsManage: "directory.settings.manage",
  privateContactView: "directory.private_contact.view",
  auditView: "directory.audit.view",
  manage: "directory.manage",
  // Phase 2B.1: narrow, operational capability for legacy-media audit and
  // reprocessing actions specifically -- distinct from publicationReview
  // (which authorizes ordinary approve/reject review decisions) because
  // reprocessing is an operational/technical action, not an editorial
  // decision, and a parish may reasonably want to grant one without the
  // other. See docs/directory/26-phase-2b1-legacy-media-remediation-plan.md.
  mediaReprocess: "directory.media.reprocess"
});

export function nowMs() {
  return Date.now();
}

export function cleanText(value, { required = false, max = 240, field = "field" } = {}) {
  const cleaned = String(value || "").trim();
  if (required && !cleaned) throw new DirectoryServiceError("validation_failed", `${field} is required.`);
  return cleaned ? cleaned.slice(0, max) : null;
}

export function boolToInt(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue ? 1 : 0;
  return value ? 1 : 0;
}

export function requireD1(env) {
  if (!d1(env)) throw new DirectoryServiceError("storage_unavailable", "Directory storage is not configured.", 500);
  return d1(env);
}

export async function runAtomic(env, statements) {
  const db = requireD1(env);
  if (typeof db.batch !== "function") {
    throw new DirectoryServiceError("transaction_unavailable", "Directory service requires D1 batch support.", 500);
  }
  return d1Batch(env, statements);
}

export function normalizeActor(actor) {
  return {
    userId: cleanText(actor?.userId || actor?.user?.id, { max: 160 }),
    parishId: cleanText(actor?.parishId || actor?.membership?.parishId, { max: 160 }),
    capabilities: Array.isArray(actor?.capabilities) ? actor.capabilities : [],
    personId: cleanText(actor?.personId, { max: 160 })
  };
}

export function hasAnyCapability(actor, capabilities = []) {
  const normalized = normalizeActor(actor);
  return capabilities.some((capability) => normalized.capabilities.includes(capability));
}

export function assertParishActor(actorInput, parishId, capabilities = [DIRECTORY_CAPABILITIES.manage]) {
  const actor = normalizeActor(actorInput);
  if (!actor.userId) throw new DirectoryServiceError("unauthorized", "Directory services require an authenticated platform user.", 401);
  if (!actor.parishId || actor.parishId !== parishId) {
    throw new DirectoryServiceError("forbidden", "Directory actor is not scoped to this parish.", 403);
  }
  if (!capabilities.some((capability) => actor.capabilities.includes(capability))) {
    throw new DirectoryServiceError("forbidden", "Directory actor lacks the required capability.", 403);
  }
  return actor;
}

export function assertVisibility(value) {
  const cleaned = cleanText(value, { required: true, max: 40, field: "visibility" });
  if (!VISIBILITY_LEVELS.includes(cleaned)) {
    throw new DirectoryServiceError("validation_failed", "Unknown directory visibility.");
  }
  return cleaned;
}

export function mostRestrictive(...levels) {
  const valid = levels.filter(Boolean).map(assertVisibility);
  if (!valid.length) return "private";
  return valid.reduce((current, next) => VISIBILITY_RANK[next] < VISIBILITY_RANK[current] ? next : current);
}

export function visibilityAllowedForAudience(visibility, audience) {
  const effective = assertVisibility(visibility);
  if (audience === "self" || audience === "staff") return true;
  if (audience === "household") return VISIBILITY_RANK[effective] <= VISIBILITY_RANK.household;
  if (audience === "clergy") return VISIBILITY_RANK[effective] <= VISIBILITY_RANK.clergy;
  if (audience === "leadership") return VISIBILITY_RANK[effective] <= VISIBILITY_RANK.leadership;
  if (audience === "directory_members") return effective === "directory_members";
  return false;
}

export function safeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value).slice(0, 4000);
  } catch {
    return null;
  }
}

export function maskValue(value, type = "text") {
  const text = String(value || "");
  if (!text) return "";
  if (type === "email") {
    const [left, right] = text.split("@");
    return `${left?.slice(0, 2) || "**"}***@${right || "hidden"}`;
  }
  if (type === "phone") return `***${text.replace(/\D/g, "").slice(-4)}`;
  if (type === "address") return "[address omitted]";
  return text.length > 12 ? `${text.slice(0, 4)}***` : "***";
}

export function auditStatement({ action, actor, parishId, targetType, targetId, householdId = null, before = null, after = null, metadata = null, correlationId = "" }) {
  return {
    sql: `INSERT INTO audit_log (
            id, actor_user_id, actor_type, action, target_type, target_id,
            organization_id, household_id, request_id, before_summary_json,
            after_summary_json, metadata_json, created_at
          ) VALUES (?, ?, 'platform_user', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    params: [
      generateSecret("audit"),
      actor.userId,
      action,
      targetType,
      targetId,
      parishId,
      householdId,
      correlationId || null,
      safeJson(before),
      safeJson(after),
      safeJson(metadata)
    ]
  };
}

export function normalizeOwner(ownerType, ownerId) {
  const type = cleanText(ownerType, { required: true, max: 40, field: "ownerType" });
  if (!["person", "household"].includes(type)) throw new DirectoryServiceError("validation_failed", "Unsupported directory owner type.");
  return { ownerType: type, ownerId: cleanText(ownerId, { required: true, max: 160, field: "ownerId" }) };
}

export async function loadHouseholdForParish(env, householdId, parishId) {
  const row = await d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2", householdId, parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Directory household was not found for this parish.", 404);
  return row;
}

export async function loadPersonForParish(env, personId, parishId) {
  const row = await d1First(
    env,
    `SELECT p.* FROM directory_people p
     WHERE p.id = ?1 AND (
       p.created_by_parish_id = ?2
       OR EXISTS (
         SELECT 1 FROM directory_household_members hm
         JOIN directory_households h ON h.id = hm.household_id
         WHERE hm.person_id = p.id AND h.parish_id = ?2
       )
       OR EXISTS (
         SELECT 1 FROM directory_parish_affiliations a
         WHERE a.person_id = p.id AND a.parish_id = ?2
       )
     )`,
    personId,
    parishId
  );
  if (!row) throw new DirectoryServiceError("not_found", "Directory person was not found for this parish.", 404);
  return row;
}

export async function assertOwnerInParish(env, { ownerType, ownerId, parishId }) {
  if (ownerType === "person") return loadPersonForParish(env, ownerId, parishId);
  return loadHouseholdForParish(env, ownerId, parishId);
}

export async function isActiveHouseholdAdmin(env, { householdId, personId }) {
  if (!householdId || !personId) return false;
  const row = await d1First(
    env,
    "SELECT id FROM directory_household_admins WHERE household_id = ?1 AND person_id = ?2 AND active = 1",
    householdId,
    personId
  );
  return Boolean(row);
}

export async function actorManagesOwner(env, actorInput, { parishId, ownerType, ownerId }) {
  const actor = normalizeActor(actorInput);
  if (actor.parishId !== parishId || !actor.userId) return false;
  if (hasAnyCapability(actor, [DIRECTORY_CAPABILITIES.manage, DIRECTORY_CAPABILITIES.householdsManage])) return true;
  if (ownerType === "person" && actor.personId === ownerId && hasAnyCapability(actor, [DIRECTORY_CAPABILITIES.selfManage])) return true;
  if (ownerType === "household" && actor.personId && hasAnyCapability(actor, [DIRECTORY_CAPABILITIES.selfManage])) {
    return isActiveHouseholdAdmin(env, { householdId: ownerId, personId: actor.personId });
  }
  return false;
}

export async function assertCanManageOwner(env, actorInput, { parishId, ownerType, ownerId }) {
  const actor = normalizeActor(actorInput);
  if (!actor.userId) throw new DirectoryServiceError("unauthorized", "Directory services require an authenticated platform user.", 401);
  if (!await actorManagesOwner(env, actor, { parishId, ownerType, ownerId })) {
    throw new DirectoryServiceError("forbidden", "Directory actor cannot manage this owner.", 403);
  }
  return actor;
}
