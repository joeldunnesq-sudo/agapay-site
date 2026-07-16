import { d1First } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { getDirectorySettings } from "./settings.js";
import {
  assertCanManageOwner,
  assertOwnerInParish,
  assertParishActor,
  assertVisibility,
  auditStatement,
  boolToInt,
  cleanText,
  DIRECTORY_CAPABILITIES,
  mostRestrictive,
  nowMs,
  normalizeOwner,
  runAtomic,
  VISIBILITY_RANK
} from "./shared.js";

export const FIELD_DEFAULTS = Object.freeze({
  household_display_name: { visibility: "directory_members", eligible: true },
  adult_preferred_name: { visibility: "directory_members", eligible: true },
  adult_legal_name: { visibility: "staff", eligible: false },
  adult_email: { visibility: "private", eligible: false },
  adult_phone: { visibility: "private", eligible: false },
  street_address: { visibility: "staff", eligible: false },
  city_state: { visibility: "directory_members", eligible: true },
  household_address: { visibility: "staff", eligible: false },
  child_name: { visibility: "private", eligible: false },
  child_birth_date: { visibility: "private", eligible: false },
  child_age: { visibility: "private", eligible: false },
  household_relationship: { visibility: "household", eligible: false },
  person_notes: { visibility: "private", eligible: false },
  household_notes: { visibility: "private", eligible: false },
  parish_affiliation: { visibility: "leadership", eligible: false },
  giving_information: { visibility: "private", eligible: false },
  future_skills: { visibility: "leadership", eligible: false }
});

export function defaultPrivacyForField(fieldKey) {
  return FIELD_DEFAULTS[fieldKey] || { visibility: "private", eligible: false };
}

export async function getPersonPrivacyFlags(env, { parishId, personId }) {
  const row = await d1First(
    env,
    "SELECT * FROM directory_person_privacy_flags WHERE parish_id = ?1 AND person_id = ?2 AND active = 1",
    parishId,
    personId
  );
  return {
    isChild: Number(row?.is_child || 0) === 1,
    protectedPerson: Number(row?.protected_person || 0) === 1
  };
}

export async function setPersonPrivacyFlags(env, { actor: actorInput, parishId, personId, isChild = false, protectedPerson = false, correlationId = "" }) {
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const actor = assertParishActor(actorInput, cleanedParishId, [DIRECTORY_CAPABILITIES.householdsManage, DIRECTORY_CAPABILITIES.manage]);
  await assertOwnerInParish(env, { ownerType: "person", ownerId: personId, parishId: cleanedParishId });
  const before = await getPersonPrivacyFlags(env, { parishId: cleanedParishId, personId });
  const timestamp = nowMs();
  const id = (await d1First(env, "SELECT id FROM directory_person_privacy_flags WHERE parish_id = ?1 AND person_id = ?2", cleanedParishId, personId))?.id || `dir_priv_${crypto.randomUUID?.() || timestamp}`;

  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_person_privacy_flags
              (id, parish_id, person_id, is_child, protected_person, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(parish_id, person_id) DO UPDATE SET
              is_child = excluded.is_child,
              protected_person = excluded.protected_person,
              active = 1,
              updated_at = excluded.updated_at`,
      params: [id, cleanedParishId, personId, boolToInt(isChild), boolToInt(protectedPerson), timestamp, timestamp]
    },
    auditStatement({
      action: "directory.protected_person_status_changed",
      actor,
      parishId: cleanedParishId,
      targetType: "directory_person",
      targetId: personId,
      before,
      after: { isChild: Boolean(isChild), protectedPerson: Boolean(protectedPerson) },
      correlationId
    })
  ]);
  return getPersonPrivacyFlags(env, { parishId: cleanedParishId, personId });
}

export async function setFieldPrivacyPreference(env, { actor: actorInput, parishId, ownerType, ownerId, fieldKey, visibility, publicationEligible = false, correlationId = "" }) {
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const owner = normalizeOwner(ownerType, ownerId);
  await assertOwnerInParish(env, { ...owner, parishId: cleanedParishId });
  const actor = await assertCanManageOwner(env, actorInput, { parishId: cleanedParishId, ...owner });
  const cleanedField = cleanText(fieldKey, { required: true, max: 80, field: "fieldKey" });
  const requested = assertVisibility(visibility);
  const effective = await evaluateFieldPolicy(env, {
    parishId: cleanedParishId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    fieldKey: cleanedField,
    requestedVisibility: requested,
    publicationEligible
  });
  if (effective.visibility !== requested || effective.publicationEligible !== Boolean(publicationEligible)) {
    throw new DirectoryServiceError("privacy_policy_denied", "Requested visibility is weaker than parish or safety policy permits.", 403);
  }

  const before = await d1First(
    env,
    "SELECT visibility, publication_eligible FROM directory_field_privacy_preferences WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND field_key = ?4",
    cleanedParishId, owner.ownerType, owner.ownerId, cleanedField
  );
  const timestamp = nowMs();
  const id = (await d1First(env, "SELECT id FROM directory_field_privacy_preferences WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND field_key = ?4", cleanedParishId, owner.ownerType, owner.ownerId, cleanedField))?.id || `dir_fpref_${timestamp}_${Math.random().toString(16).slice(2)}`;

  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_field_privacy_preferences
              (id, parish_id, owner_type, owner_id, field_key, visibility, publication_eligible, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(parish_id, owner_type, owner_id, field_key) DO UPDATE SET
              visibility = excluded.visibility,
              publication_eligible = excluded.publication_eligible,
              active = 1,
              updated_at = excluded.updated_at`,
      params: [id, cleanedParishId, owner.ownerType, owner.ownerId, cleanedField, requested, boolToInt(publicationEligible), timestamp, timestamp]
    },
    auditStatement({
      action: "directory.visibility_preference_changed",
      actor,
      parishId: cleanedParishId,
      targetType: `directory_${owner.ownerType}`,
      targetId: owner.ownerId,
      before: before ? { fieldKey: cleanedField, visibility: before.visibility, publicationEligible: Boolean(before.publication_eligible) } : null,
      after: { fieldKey: cleanedField, visibility: requested, publicationEligible: Boolean(publicationEligible) },
      correlationId
    })
  ]);
  return { fieldKey: cleanedField, visibility: requested, publicationEligible: Boolean(publicationEligible) };
}

export async function evaluateFieldPolicy(env, { parishId, ownerType, ownerId, fieldKey, requestedVisibility = "", publicationEligible = false, protectedAddress = false }) {
  const settings = await getDirectorySettings(env, parishId);
  const defaults = defaultPrivacyForField(fieldKey);
  const preference = await d1First(
    env,
    "SELECT visibility, publication_eligible FROM directory_field_privacy_preferences WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND field_key = ?4 AND active = 1",
    parishId, ownerType, ownerId, fieldKey
  );
  const requested = requestedVisibility ? assertVisibility(requestedVisibility) : null;
  const baseVisibility = preference?.visibility || requested || defaults.visibility;
  let maxVisibility = "directory_members";
  if (fieldKey.includes("address") || fieldKey === "street_address" || fieldKey === "city_state") maxVisibility = settings.addressMaxVisibility;
  if (fieldKey.includes("email") || fieldKey.includes("phone")) maxVisibility = settings.contactMaxVisibility;
  let visibility = mostRestrictive(baseVisibility, maxVisibility);

  const explicitOptInEligible = ["adult_email", "adult_phone", "city_state", "household_display_name", "adult_preferred_name"].includes(fieldKey);
  let eligible = preference ? Number(preference.publication_eligible || 0) === 1 : Boolean(publicationEligible && (defaults.eligible || explicitOptInEligible));
  if (ownerType === "person") {
    const flags = await getPersonPrivacyFlags(env, { parishId, personId: ownerId });
    if (flags.isChild || flags.protectedPerson) {
      visibility = "private";
      eligible = false;
    }
  }
  if (protectedAddress) {
    visibility = VISIBILITY_RANK[visibility] > VISIBILITY_RANK.staff ? "staff" : visibility;
    eligible = false;
  }
  if (fieldKey === "giving_information" || fieldKey === "person_notes" || fieldKey === "household_notes" || fieldKey === "adult_legal_name" || fieldKey === "child_birth_date" || fieldKey === "child_age") {
    eligible = false;
    if (VISIBILITY_RANK[visibility] > VISIBILITY_RANK[defaults.visibility]) visibility = defaults.visibility;
  }
  return { visibility, publicationEligible: eligible, settings };
}
