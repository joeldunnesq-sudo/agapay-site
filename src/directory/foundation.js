import { d1, d1All, d1Batch, d1First, generateSecret } from "../lib/core.js";
import { requireCapability } from "../lib/authorization.js";

export const DIRECTORY_MANAGE_CAPABILITY = "directory.manage";

const PERSON_FIELDS = new Set([
  "preferredName",
  "legalName",
  "middleName",
  "suffix",
  "dateOfBirth",
  "biologicalSex",
  "deceased",
  "active",
  "notes"
]);

const BIOLOGICAL_SEXES = new Set(["unknown", "female", "male"]);
const HOUSEHOLD_RELATIONSHIPS = new Set(["head", "spouse", "child", "grandparent", "other"]);
const AFFILIATION_STATUSES = new Set(["member", "catechumen", "visitor", "clergy", "monastic", "former_member"]);
const INITIAL_LINK_TYPES = new Set(["platform_user", "donor", "learn_student"]);

export class DirectoryServiceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "DirectoryServiceError";
    this.code = code;
    this.status = status;
  }
}

function nowMs() {
  return Date.now();
}

function cleanText(value, { required = false, max = 240 } = {}) {
  const cleaned = String(value || "").trim();
  if (required && !cleaned) throw new DirectoryServiceError("validation_failed", "Required directory field is missing.");
  return cleaned ? cleaned.slice(0, max) : null;
}

function cleanDate(value, fieldName) {
  const cleaned = cleanText(value, { max: 10 });
  if (!cleaned) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new DirectoryServiceError("validation_failed", `${fieldName} must use YYYY-MM-DD format.`);
  }
  return cleaned;
}

function boolToInt(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue ? 1 : 0;
  return value ? 1 : 0;
}

function normalizeSex(value) {
  const cleaned = cleanText(value, { max: 20 }) || "unknown";
  if (!BIOLOGICAL_SEXES.has(cleaned)) {
    throw new DirectoryServiceError("validation_failed", "Biological sex must be unknown, female, or male.");
  }
  return cleaned;
}

function normalizeRelationship(value) {
  const cleaned = cleanText(value, { required: true, max: 40 }).toLowerCase();
  if (!HOUSEHOLD_RELATIONSHIPS.has(cleaned)) {
    throw new DirectoryServiceError("validation_failed", "Household relationship is not supported.");
  }
  return cleaned;
}

function normalizeAffiliationStatus(value) {
  const cleaned = cleanText(value, { required: true, max: 40 }).toLowerCase();
  if (!AFFILIATION_STATUSES.has(cleaned)) {
    throw new DirectoryServiceError("validation_failed", "Parish affiliation status is not supported.");
  }
  return cleaned;
}

function normalizeLinkType(value) {
  const cleaned = cleanText(value, { required: true, max: 64 }).toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(cleaned)) {
    throw new DirectoryServiceError("validation_failed", "External link type is not supported.");
  }
  return cleaned;
}

function normalizeActor(actor) {
  const userId = cleanText(actor?.userId || actor?.user?.id, { max: 160 });
  const parishId = cleanText(actor?.parishId || actor?.membership?.parishId, { max: 160 });
  const capabilities = Array.isArray(actor?.capabilities) ? actor.capabilities : [];
  return { userId, parishId, capabilities };
}

function assertAuthorized(actorInput, parishId, capability = DIRECTORY_MANAGE_CAPABILITY) {
  const actor = normalizeActor(actorInput);
  if (!actor.userId) throw new DirectoryServiceError("unauthorized", "Directory services require an authenticated platform user.", 401);
  if (!actor.parishId || actor.parishId !== parishId) {
    throw new DirectoryServiceError("forbidden", "Directory actor is not scoped to this parish.", 403);
  }
  if (!actor.capabilities.includes(capability)) {
    throw new DirectoryServiceError("forbidden", "Directory actor lacks the required capability.", 403);
  }
  return actor;
}

export async function directoryActorFromRequest(request, env, parishId, capability = DIRECTORY_MANAGE_CAPABILITY) {
  const ctx = await requireCapability(request, env, parishId, capability);
  if (!ctx) return null;
  return {
    userId: ctx.user.id,
    parishId: ctx.membership.parishId,
    capabilities: ctx.capabilities
  };
}

function safeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value).slice(0, 4000);
  } catch {
    return null;
  }
}

function auditStatement({ action, actor, parishId, targetType, targetId, householdId = null, before = null, after = null, metadata = null }) {
  return {
    sql: `INSERT INTO audit_log (
            id, actor_user_id, actor_type, action, target_type, target_id,
            organization_id, household_id, before_summary_json, after_summary_json,
            metadata_json, created_at
          ) VALUES (?, ?, 'platform_user', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    params: [
      generateSecret("audit"),
      actor.userId,
      action,
      targetType,
      targetId,
      parishId,
      householdId,
      safeJson(before),
      safeJson(after),
      safeJson(metadata)
    ]
  };
}

async function runAtomic(env, statements) {
  if (!d1(env)) throw new DirectoryServiceError("storage_unavailable", "Directory storage is not configured.", 500);
  if (typeof d1(env).batch !== "function") {
    throw new DirectoryServiceError("transaction_unavailable", "Directory service requires D1 batch support.", 500);
  }
  return d1Batch(env, statements);
}

function personFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdByParishId: row.created_by_parish_id,
    preferredName: row.preferred_name,
    legalName: row.legal_name || "",
    middleName: row.middle_name || "",
    suffix: row.suffix || "",
    dateOfBirth: row.date_of_birth || "",
    biologicalSex: row.biological_sex,
    deceased: Number(row.deceased || 0) === 1,
    active: Number(row.active || 0) === 1,
    notes: row.notes || "",
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

function householdFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    displayName: row.display_name,
    active: Number(row.active || 0) === 1,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

async function loadHouseholdForParish(env, householdId, parishId) {
  const row = await d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2", householdId, parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Directory household was not found for this parish.", 404);
  return row;
}

async function loadPersonForParish(env, personId, parishId) {
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

export async function createPerson(env, { actor: actorInput, parishId: parishIdInput, preferredName, legalName = "", middleName = "", suffix = "", dateOfBirth = "", biologicalSex = "unknown", deceased = false, active = true, notes = "" }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const timestamp = nowMs();
  const person = {
    id: generateSecret("dir_person"),
    createdByParishId: parishId,
    preferredName: cleanText(preferredName, { required: true }),
    legalName: cleanText(legalName),
    middleName: cleanText(middleName),
    suffix: cleanText(suffix, { max: 80 }),
    dateOfBirth: cleanDate(dateOfBirth, "dateOfBirth"),
    biologicalSex: normalizeSex(biologicalSex),
    deceased: boolToInt(deceased, false),
    active: boolToInt(active, true),
    notes: cleanText(notes, { max: 2000 }),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_people (
              id, created_by_parish_id, preferred_name, legal_name, middle_name, suffix,
              date_of_birth, biological_sex, deceased, active, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        person.id, person.createdByParishId, person.preferredName, person.legalName, person.middleName, person.suffix,
        person.dateOfBirth, person.biologicalSex, person.deceased, person.active, person.notes, person.createdAt, person.updatedAt
      ]
    },
    auditStatement({
      action: "directory.person_created",
      actor,
      parishId,
      targetType: "directory_person",
      targetId: person.id,
      after: { preferredName: person.preferredName, active: Boolean(person.active), deceased: Boolean(person.deceased) }
    })
  ]);

  return personFromRow(await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", person.id));
}

export async function updatePerson(env, { actor: actorInput, parishId: parishIdInput, personId, ...patch }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const before = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const next = { ...personFromRow(before) };

  for (const key of Object.keys(patch)) {
    if (!PERSON_FIELDS.has(key)) continue;
    if (key === "preferredName") next.preferredName = cleanText(patch[key], { required: true });
    else if (key === "legalName") next.legalName = cleanText(patch[key]);
    else if (key === "middleName") next.middleName = cleanText(patch[key]);
    else if (key === "suffix") next.suffix = cleanText(patch[key], { max: 80 });
    else if (key === "dateOfBirth") next.dateOfBirth = cleanDate(patch[key], "dateOfBirth");
    else if (key === "biologicalSex") next.biologicalSex = normalizeSex(patch[key]);
    else if (key === "deceased") next.deceased = Boolean(patch[key]);
    else if (key === "active") next.active = Boolean(patch[key]);
    else if (key === "notes") next.notes = cleanText(patch[key], { max: 2000 });
  }
  next.updatedAt = nowMs();

  await runAtomic(env, [
    {
      sql: `UPDATE directory_people
            SET preferred_name = ?, legal_name = ?, middle_name = ?, suffix = ?,
                date_of_birth = ?, biological_sex = ?, deceased = ?, active = ?,
                notes = ?, updated_at = ?
            WHERE id = ?`,
      params: [
        next.preferredName, next.legalName, next.middleName, next.suffix,
        next.dateOfBirth, next.biologicalSex, next.deceased ? 1 : 0, next.active ? 1 : 0,
        next.notes, next.updatedAt, before.id
      ]
    },
    auditStatement({
      action: "directory.person_updated",
      actor,
      parishId,
      targetType: "directory_person",
      targetId: before.id,
      before: { preferredName: before.preferred_name, active: Boolean(before.active), deceased: Boolean(before.deceased) },
      after: { preferredName: next.preferredName, active: next.active, deceased: next.deceased }
    })
  ]);

  return personFromRow(await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", before.id));
}

export async function deactivatePerson(env, { actor: actorInput, parishId: parishIdInput, personId }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const before = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const timestamp = nowMs();

  await runAtomic(env, [
    {
      sql: "UPDATE directory_people SET active = 0, updated_at = ? WHERE id = ?",
      params: [timestamp, before.id]
    },
    auditStatement({
      action: "directory.person_deactivated",
      actor,
      parishId,
      targetType: "directory_person",
      targetId: before.id,
      before: { preferredName: before.preferred_name, active: Boolean(before.active) },
      after: { preferredName: before.preferred_name, active: false }
    })
  ]);

  return personFromRow(await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", before.id));
}

export async function createHousehold(env, { actor: actorInput, parishId: parishIdInput, displayName, active = true }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const timestamp = nowMs();
  const household = {
    id: generateSecret("dir_household"),
    parishId,
    displayName: cleanText(displayName, { required: true }),
    active: boolToInt(active, true),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_households (id, parish_id, display_name, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [household.id, household.parishId, household.displayName, household.active, household.createdAt, household.updatedAt]
    },
    auditStatement({
      action: "directory.household_created",
      actor,
      parishId,
      targetType: "directory_household",
      targetId: household.id,
      householdId: household.id,
      after: { displayName: household.displayName, active: Boolean(household.active) }
    })
  ]);

  return householdFromRow(await d1First(env, "SELECT * FROM directory_households WHERE id = ?1", household.id));
}

export async function addHouseholdMember(env, { actor: actorInput, parishId: parishIdInput, householdId, personId, relationship, startDate = "", active = true }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const household = await loadHouseholdForParish(env, cleanText(householdId, { required: true, max: 160 }), parishId);
  const person = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const normalizedRelationship = normalizeRelationship(relationship);
  const timestamp = nowMs();
  const existing = await d1First(
    env,
    "SELECT * FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2",
    household.id,
    person.id
  );
  const memberId = existing?.id || generateSecret("dir_hm");

  await runAtomic(env, [
    existing ? {
      sql: `UPDATE directory_household_members
            SET relationship = ?, start_date = COALESCE(?, start_date), end_date = NULL, active = ?, updated_at = ?
            WHERE id = ?`,
      params: [normalizedRelationship, cleanDate(startDate, "startDate"), boolToInt(active, true), timestamp, existing.id]
    } : {
      sql: `INSERT INTO directory_household_members
              (id, household_id, person_id, relationship, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      params: [memberId, household.id, person.id, normalizedRelationship, cleanDate(startDate, "startDate"), boolToInt(active, true), timestamp, timestamp]
    },
    auditStatement({
      action: "directory.household_member_added",
      actor,
      parishId,
      targetType: "directory_household_member",
      targetId: memberId,
      householdId: household.id,
      after: { personId: person.id, relationship: normalizedRelationship }
    })
  ]);

  return d1First(env, "SELECT * FROM directory_household_members WHERE id = ?1", memberId);
}

export async function removeHouseholdMember(env, { actor: actorInput, parishId: parishIdInput, householdId, personId, endDate = "" }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const household = await loadHouseholdForParish(env, cleanText(householdId, { required: true, max: 160 }), parishId);
  const person = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const existing = await d1First(
    env,
    "SELECT * FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2 AND active = 1",
    household.id,
    person.id
  );
  if (!existing) throw new DirectoryServiceError("not_found", "Active household membership was not found.", 404);
  const timestamp = nowMs();
  const removalDate = cleanDate(endDate, "endDate");

  await runAtomic(env, [
    {
      sql: "UPDATE directory_household_members SET active = 0, end_date = ?, updated_at = ? WHERE id = ?",
      params: [removalDate, timestamp, existing.id]
    },
    auditStatement({
      action: "directory.household_member_removed",
      actor,
      parishId,
      targetType: "directory_household_member",
      targetId: existing.id,
      householdId: household.id,
      before: { personId: person.id, relationship: existing.relationship }
    })
  ]);

  return d1First(env, "SELECT * FROM directory_household_members WHERE id = ?1", existing.id);
}

export async function addHouseholdAdmin(env, { actor: actorInput, parishId: parishIdInput, householdId, personId, startDate = "" }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const household = await loadHouseholdForParish(env, cleanText(householdId, { required: true, max: 160 }), parishId);
  const person = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const timestamp = nowMs();
  const existing = await d1First(env, "SELECT * FROM directory_household_admins WHERE household_id = ?1 AND person_id = ?2", household.id, person.id);
  const adminId = existing?.id || generateSecret("dir_ha");

  await runAtomic(env, [
    existing ? {
      sql: "UPDATE directory_household_admins SET active = 1, end_date = NULL, updated_at = ? WHERE id = ?",
      params: [timestamp, existing.id]
    } : {
      sql: `INSERT INTO directory_household_admins
              (id, household_id, person_id, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`,
      params: [adminId, household.id, person.id, cleanDate(startDate, "startDate"), timestamp, timestamp]
    },
    auditStatement({
      action: "directory.household_admin_added",
      actor,
      parishId,
      targetType: "directory_household_admin",
      targetId: adminId,
      householdId: household.id,
      after: { personId: person.id }
    })
  ]);

  return d1First(env, "SELECT * FROM directory_household_admins WHERE id = ?1", adminId);
}

export async function removeHouseholdAdmin(env, { actor: actorInput, parishId: parishIdInput, householdId, personId, endDate = "" }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const household = await loadHouseholdForParish(env, cleanText(householdId, { required: true, max: 160 }), parishId);
  const person = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const existing = await d1First(env, "SELECT * FROM directory_household_admins WHERE household_id = ?1 AND person_id = ?2 AND active = 1", household.id, person.id);
  if (!existing) throw new DirectoryServiceError("not_found", "Active household administrator was not found.", 404);
  const timestamp = nowMs();

  await runAtomic(env, [
    {
      sql: "UPDATE directory_household_admins SET active = 0, end_date = ?, updated_at = ? WHERE id = ?",
      params: [cleanDate(endDate, "endDate"), timestamp, existing.id]
    },
    auditStatement({
      action: "directory.household_admin_removed",
      actor,
      parishId,
      targetType: "directory_household_admin",
      targetId: existing.id,
      householdId: household.id,
      before: { personId: person.id }
    })
  ]);

  return d1First(env, "SELECT * FROM directory_household_admins WHERE id = ?1", existing.id);
}

export async function linkExternalIdentity(env, { actor: actorInput, parishId: parishIdInput, personId, linkType, externalId, active = true }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const person = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const normalizedType = normalizeLinkType(linkType);
  const normalizedExternalId = cleanText(externalId, { required: true, max: 240 });
  const existing = await d1First(env, "SELECT * FROM directory_person_links WHERE link_type = ?1 AND external_id = ?2", normalizedType, normalizedExternalId);
  if (existing && existing.person_id !== person.id) {
    throw new DirectoryServiceError("duplicate_external_link", "External identity is already linked to another directory person.", 409);
  }
  const timestamp = nowMs();
  const linkId = existing?.id || generateSecret("dir_link");

  await runAtomic(env, [
    existing ? {
      sql: "UPDATE directory_person_links SET active = ?, updated_at = ? WHERE id = ?",
      params: [boolToInt(active, true), timestamp, existing.id]
    } : {
      sql: `INSERT INTO directory_person_links (id, person_id, link_type, external_id, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [linkId, person.id, normalizedType, normalizedExternalId, boolToInt(active, true), timestamp, timestamp]
    },
    auditStatement({
      action: "directory.external_link_created",
      actor,
      parishId,
      targetType: "directory_person_link",
      targetId: linkId,
      after: {
        personId: person.id,
        linkType: normalizedType,
        initialSupportedType: INITIAL_LINK_TYPES.has(normalizedType)
      }
    })
  ]);

  return d1First(env, "SELECT * FROM directory_person_links WHERE id = ?1", linkId);
}

export async function addParishAffiliation(env, { actor: actorInput, parishId: parishIdInput, personId, status, joinedDate = "", active = true }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const person = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const normalizedStatus = normalizeAffiliationStatus(status);
  const timestamp = nowMs();
  const existing = await d1First(
    env,
    "SELECT * FROM directory_parish_affiliations WHERE person_id = ?1 AND parish_id = ?2 AND status = ?3",
    person.id,
    parishId,
    normalizedStatus
  );
  const affiliationId = existing?.id || generateSecret("dir_aff");

  await runAtomic(env, [
    existing ? {
      sql: `UPDATE directory_parish_affiliations
            SET joined_date = COALESCE(?, joined_date), left_date = NULL, active = ?, updated_at = ?
            WHERE id = ?`,
      params: [cleanDate(joinedDate, "joinedDate"), boolToInt(active, true), timestamp, existing.id]
    } : {
      sql: `INSERT INTO directory_parish_affiliations
              (id, person_id, parish_id, status, joined_date, left_date, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      params: [affiliationId, person.id, parishId, normalizedStatus, cleanDate(joinedDate, "joinedDate"), boolToInt(active, true), timestamp, timestamp]
    },
    auditStatement({
      action: "directory.parish_affiliation_added",
      actor,
      parishId,
      targetType: "directory_parish_affiliation",
      targetId: affiliationId,
      after: { personId: person.id, status: normalizedStatus }
    })
  ]);

  return d1First(env, "SELECT * FROM directory_parish_affiliations WHERE id = ?1", affiliationId);
}

export async function removeParishAffiliation(env, { actor: actorInput, parishId: parishIdInput, personId, status, leftDate = "" }) {
  const parishId = cleanText(parishIdInput || actorInput?.parishId, { required: true, max: 160 });
  const actor = assertAuthorized(actorInput, parishId);
  const person = await loadPersonForParish(env, cleanText(personId, { required: true, max: 160 }), parishId);
  const normalizedStatus = normalizeAffiliationStatus(status);
  const existing = await d1First(
    env,
    "SELECT * FROM directory_parish_affiliations WHERE person_id = ?1 AND parish_id = ?2 AND status = ?3 AND active = 1",
    person.id,
    parishId,
    normalizedStatus
  );
  if (!existing) throw new DirectoryServiceError("not_found", "Active parish affiliation was not found.", 404);
  const timestamp = nowMs();

  await runAtomic(env, [
    {
      sql: "UPDATE directory_parish_affiliations SET active = 0, left_date = ?, updated_at = ? WHERE id = ?",
      params: [cleanDate(leftDate, "leftDate"), timestamp, existing.id]
    },
    auditStatement({
      action: "directory.parish_affiliation_removed",
      actor,
      parishId,
      targetType: "directory_parish_affiliation",
      targetId: existing.id,
      before: { personId: person.id, status: normalizedStatus }
    })
  ]);

  return d1First(env, "SELECT * FROM directory_parish_affiliations WHERE id = ?1", existing.id);
}

export async function listPeopleForParish(env, parishId) {
  const cleanedParishId = cleanText(parishId, { required: true, max: 160 });
  const rows = await d1All(
    env,
    `SELECT DISTINCT p.* FROM directory_people p
     LEFT JOIN directory_household_members hm ON hm.person_id = p.id
     LEFT JOIN directory_households h ON h.id = hm.household_id
     LEFT JOIN directory_parish_affiliations a ON a.person_id = p.id
     WHERE p.created_by_parish_id = ?1 OR h.parish_id = ?1 OR a.parish_id = ?1
     ORDER BY p.preferred_name ASC, p.id ASC`,
    cleanedParishId
  );
  return rows.map(personFromRow);
}
