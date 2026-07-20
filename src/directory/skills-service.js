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
  runAtomic,
  safeJson
} from "./shared.js";

export const SKILL_POLICY_VERSION = "phase5b-v1";
export const SKILL_DISCLAIMER = "Skills and experience are self-reported. AGAPAY and the parish do not verify licenses, credentials, insurance, background checks, or suitability.";

const CATEGORIES = Object.freeze(["home_and_repairs", "transportation", "hospitality_and_food", "education_and_tutoring", "technology", "language_and_translation", "professional_knowledge", "care_and_assistance", "arts_and_media", "parish_service", "agriculture_and_outdoors", "other"]);
const EXPERIENCE = Object.freeze(["willing_to_help", "experienced", "professional", "retired_professional", "other"]);
const SERVICE_MODES = Object.freeze(["parish_projects", "informal_parishioner_help", "advice_or_guidance", "transportation", "teaching_or_tutoring", "emergency_assistance", "professional_services", "other"]);
const CONTACT_PREFS = Object.freeze(["published_email", "published_phone", "parish_office", "ask_in_person", "no_direct_contact"]);
const VISIBILITIES = Object.freeze(["private", "parish_staff", "directory_members"]);
const STATUSES = Object.freeze(["draft", "active", "paused", "hidden_by_parish", "withdrawn", "archived"]);
const MANAGE_CAPS = [DIRECTORY_CAPABILITIES.skillsManage, DIRECTORY_CAPABILITIES.manage];
const VIEW_CAPS = [DIRECTORY_CAPABILITIES.skillsView, DIRECTORY_CAPABILITIES.skillsManage, DIRECTORY_CAPABILITIES.manage];
const CATALOG_CAPS = [DIRECTORY_CAPABILITIES.skillsCatalogManage, DIRECTORY_CAPABILITIES.skillsManage, DIRECTORY_CAPABILITIES.manage];

function parishIdFor(context) {
  return context.parishId || context.activeParishContexts?.[0]?.parishId || context.manageableHouseholds?.[0]?.parishId || "";
}

function actorFromContext(context, capabilities = []) {
  return {
    userId: context.user.id,
    actorType: context.actorType || "platform_user",
    parishId: parishIdFor(context),
    personId: context.personId || context.currentPerson?.id || "",
    capabilities: context.capabilities || capabilities
  };
}

function enumValue(value, allowed, field, fallback = "") {
  const cleaned = cleanText(value || fallback, { required: !fallback, max: 100, field });
  if (!allowed.includes(cleaned)) throw new DirectoryServiceError("validation_failed", `${field} is not supported.`);
  return cleaned;
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

function limitFor(value) {
  return Math.max(1, Math.min(Number(value) || 24, 50));
}

function offsetFor(cursor = "") {
  const value = Number(String(cursor || "0").replace(/\D/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nextCursor(offset, limit, count) {
  return count > limit ? String(offset + limit) : "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function skillDto(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || "",
    category: row.category,
    platformDefault: Number(row.is_platform_default || 0) === 1,
    parishId: row.parish_id || "",
    active: Number(row.is_active || 0) === 1,
    sortOrder: Number(row.sort_order || 100),
    version: String(row.version || 1)
  };
}

function listingDto(row, { includePerson = false, includeAdmin = false, contact = null } = {}) {
  const base = {
    id: row.id,
    parishId: row.parish_id,
    skill: { id: row.skill_id, code: row.code, name: row.name, category: row.category },
    displayLabel: row.custom_display_label || row.name,
    experienceLevel: row.experience_level,
    serviceMode: row.service_mode,
    availabilityNote: row.availability_note || "",
    contactPreference: row.contact_preference,
    visibility: row.visibility,
    status: row.status,
    consentRecordedAt: Number(row.consent_recorded_at || 0),
    consentWithdrawnAt: Number(row.consent_withdrawn_at || 0),
    version: String(row.version || 1)
  };
  if (includePerson) {
    base.person = { id: row.person_id, displayName: row.preferred_name || "Parish member" };
  }
  if (contact) base.contact = contact;
  if (includeAdmin) {
    base.parishHiddenReason = row.parish_hidden_reason || "";
    base.reviewedAt = Number(row.reviewed_at || 0);
  }
  return base;
}

async function featureSettings(env, parishId) {
  const settings = await getDirectorySettings(env, parishId);
  return {
    ...settings,
    skillsDirectoryEnabled: settings.skillsDirectoryEnabled !== false,
    skillsMemberSearchEnabled: settings.skillsMemberSearchEnabled !== false,
    skillsStaffOnlyMode: Boolean(settings.skillsStaffOnlyMode),
    skillsCustomEntriesEnabled: settings.skillsCustomEntriesEnabled !== false,
    skillsDisclaimerText: settings.skillsDisclaimerText || SKILL_DISCLAIMER,
    skillsContactFallback: settings.skillsContactFallback || "Contact the parish office if a direct published contact is unavailable.",
    householdVerificationIntervalDays: Number(settings.householdVerificationIntervalDays || 365)
  };
}

async function assertFeatureEnabled(env, parishId, { activation = false, memberSearch = false } = {}) {
  const settings = await featureSettings(env, parishId);
  if (!settings.directoryEnabled || !settings.skillsDirectoryEnabled) {
    throw new DirectoryServiceError("feature_disabled", "Skills & Service Directory is not enabled for this parish.", 403);
  }
  if (activation && settings.skillsStaffOnlyMode) {
    throw new DirectoryServiceError("feature_disabled", "Skills & Service Directory is currently staff-only.", 403);
  }
  if (memberSearch && (!settings.ordinaryMemberAccessEnabled || !settings.skillsMemberSearchEnabled || settings.skillsStaffOnlyMode)) {
    throw new DirectoryServiceError("not_found", "Skills & Service Directory is not available.", 404);
  }
  return settings;
}

async function assertAdultSelf(context, env, parishId) {
  if (!context.claimed || !context.currentPerson?.id) throw new DirectoryServiceError("unclaimed", "Claim a directory person before using skills.", 403);
  const personId = context.currentPerson.id;
  const flags = await getPersonPrivacyFlags(env, { parishId, personId });
  if (flags.isChild || flags.protectedPerson) throw new DirectoryServiceError("forbidden", "This person cannot be listed in Skills & Service.", 403);
  const row = await d1First(env, "SELECT date_of_birth FROM directory_people WHERE id = ?1 AND active = 1", personId);
  if (!row?.date_of_birth) throw new DirectoryServiceError("adult_evidence_required", "Adult status must be recorded before skills can be published.", 403);
  const birthday = Date.parse(`${row.date_of_birth}T00:00:00Z`);
  if (!Number.isFinite(birthday) || Date.now() - birthday < 18 * 365.2425 * 86400000) {
    throw new DirectoryServiceError("child_not_allowed", "Children cannot be listed in Skills & Service.", 403);
  }
  return personId;
}

async function loadSkill(env, { parishId, skillId }) {
  const row = await d1First(
    env,
    "SELECT * FROM directory_skill_catalog WHERE id = ?1 AND (parish_id IS NULL OR parish_id = ?2)",
    cleanText(skillId, { required: true, max: 180, field: "skillId" }),
    parishId
  );
  if (!row) throw new DirectoryServiceError("not_found", "Skill was not found.", 404);
  return row;
}

async function listingRow(env, { parishId, listingId }) {
  const row = await d1First(
    env,
    `SELECT l.*, s.code, s.name, s.category, p.preferred_name
       FROM directory_person_skill_listings l
       JOIN directory_skill_catalog s ON s.id = l.skill_id
       JOIN directory_people p ON p.id = l.person_id
      WHERE l.parish_id = ?1 AND l.id = ?2`,
    parishId,
    cleanText(listingId, { required: true, max: 180, field: "listingId" })
  );
  if (!row) throw new DirectoryServiceError("not_found", "Skill listing was not found.", 404);
  return row;
}

export async function listSkillCatalog(env, { context = null, parishId = "" } = {}) {
  const scopedParish = parishId || parishIdFor(context);
  const rows = await d1All(
    env,
    `SELECT * FROM directory_skill_catalog
      WHERE is_active = 1 AND (parish_id IS NULL OR parish_id = ?1)
      ORDER BY sort_order ASC, name ASC`,
    scopedParish
  );
  return rows.map(skillDto);
}

export async function createParishSkill(env, { context, data = {}, correlationId = "" }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), CATALOG_CAPS);
  const parishId = parishIdFor(context);
  await assertFeatureEnabled(env, parishId);
  const name = cleanText(data.name, { required: true, max: 120, field: "name" });
  const code = cleanText(data.code || name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), { required: true, max: 80, field: "code" });
  const category = enumValue(data.category, CATEGORIES, "category", "other");
  const timestamp = nowMs();
  const id = generateSecret("dir_skill");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_skill_catalog
              (id, code, name, description, category, is_platform_default, parish_id, is_active, sort_order,
               created_at, updated_at, created_by_actor_type, created_by_actor_id)
            VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?, ?)`,
      params: [id, code, name, cleanText(data.description, { max: 300 }), category, parishId, Number(data.sortOrder || 100), timestamp, timestamp, actor.actorType, actor.userId]
    },
    auditStatement({ action: "directory.skill_catalog.created", actor, parishId, targetType: "directory_skill_catalog", targetId: id, after: { name, category }, correlationId })
  ]);
  return skillDto(await d1First(env, "SELECT * FROM directory_skill_catalog WHERE id = ?1", id));
}

export async function updateParishSkill(env, { context, skillId, patch = {}, correlationId = "" }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), CATALOG_CAPS);
  const parishId = parishIdFor(context);
  const row = await loadSkill(env, { parishId, skillId });
  if (row.parish_id !== parishId) throw new DirectoryServiceError("forbidden", "Platform default skills cannot be edited here.", 403);
  const timestamp = nowMs();
  const active = "active" in patch ? Boolean(patch.active) : Number(row.is_active || 0) === 1;
  await runAtomic(env, [
    {
      sql: `UPDATE directory_skill_catalog SET
              name = ?, description = ?, category = ?, is_active = ?, updated_at = ?, version = version + 1
            WHERE id = ? AND parish_id = ?`,
      params: [
        cleanText(patch.name ?? row.name, { required: true, max: 120, field: "name" }),
        cleanText(patch.description ?? row.description, { max: 300 }),
        enumValue(patch.category ?? row.category, CATEGORIES, "category"),
        active ? 1 : 0,
        timestamp,
        row.id,
        parishId
      ]
    },
    auditStatement({ action: active ? "directory.skill_catalog.updated" : "directory.skill_catalog.disabled", actor, parishId, targetType: "directory_skill_catalog", targetId: row.id, before: skillDto(row), after: { active }, correlationId })
  ]);
  return skillDto(await d1First(env, "SELECT * FROM directory_skill_catalog WHERE id = ?1", row.id));
}

export async function listMySkillListings(env, { context }) {
  const parishId = parishIdFor(context);
  if (!context.claimed) return { catalog: await listSkillCatalog(env, { parishId }), listings: [], settings: await featureSettings(env, parishId) };
  const rows = await d1All(
    env,
    `SELECT l.*, s.code, s.name, s.category, p.preferred_name
       FROM directory_person_skill_listings l
       JOIN directory_skill_catalog s ON s.id = l.skill_id
       JOIN directory_people p ON p.id = l.person_id
      WHERE l.parish_id = ?1 AND l.person_id = ?2 AND l.status != 'archived'
      ORDER BY s.name ASC, l.created_at DESC`,
    parishId,
    context.currentPerson.id
  );
  return { catalog: await listSkillCatalog(env, { parishId }), listings: rows.map((row) => listingDto(row)), settings: await featureSettings(env, parishId), disclaimer: SKILL_DISCLAIMER };
}

export async function saveMySkillListing(env, { context, listingId = "", data = {}, correlationId = "" }) {
  const parishId = parishIdFor(context);
  const settings = await assertFeatureEnabled(env, parishId, { activation: data.status === "active" });
  const personId = data.status === "active" ? await assertAdultSelf(context, env, parishId) : context.currentPerson?.id;
  if (!personId) throw new DirectoryServiceError("unclaimed", "Claim a directory person before using skills.", 403);
  const existingListing = listingId ? await listingRow(env, { parishId, listingId }) : null;
  if (existingListing && existingListing.person_id !== personId) throw new DirectoryServiceError("not_found", "Skill listing was not found.", 404);
  const skill = await loadSkill(env, { parishId, skillId: data.skillId || existingListing?.skill_id });
  if (Number(skill.is_active || 0) !== 1 && !listingId) throw new DirectoryServiceError("disabled_skill", "This skill is not available for new listings.", 409);
  if (skill.parish_id && skill.parish_id !== parishId) throw new DirectoryServiceError("not_found", "Skill was not found.", 404);
  if (!settings.skillsCustomEntriesEnabled && data.customDisplayLabel) throw new DirectoryServiceError("custom_entries_disabled", "Custom skill labels are disabled for this parish.", 403);
  const status = enumValue(data.status, STATUSES, "status", existingListing?.status || "draft");
  if (["hidden_by_parish", "archived"].includes(status)) throw new DirectoryServiceError("forbidden", "This status is not self-service editable.", 403);
  const visibility = enumValue(data.visibility, VISIBILITIES, "visibility", existingListing?.visibility || "private");
  const timestamp = nowMs();
  const actor = actorFromContext(context, [DIRECTORY_CAPABILITIES.selfManage]);
  const values = {
    customDisplayLabel: cleanText(data.customDisplayLabel ?? existingListing?.custom_display_label, { max: 120 }),
    experienceLevel: enumValue(data.experienceLevel, EXPERIENCE, "experienceLevel", existingListing?.experience_level || "willing_to_help"),
    serviceMode: enumValue(data.serviceMode, SERVICE_MODES, "serviceMode", existingListing?.service_mode || "informal_parishioner_help"),
    availabilityNote: cleanText(data.availabilityNote ?? existingListing?.availability_note, { max: 300 }),
    contactPreference: enumValue(data.contactPreference, CONTACT_PREFS, "contactPreference", existingListing?.contact_preference || "parish_office"),
    visibility,
    status
  };
  if (listingId) {
    const existing = existingListing;
    if (existing.status === "hidden_by_parish" && status === "active") throw new DirectoryServiceError("hidden_by_parish", "The parish must restore this listing before it can be active.", 409);
    await runAtomic(env, [
      {
        sql: `UPDATE directory_person_skill_listings SET
                skill_id = ?, custom_display_label = ?, experience_level = ?, service_mode = ?, availability_note = ?,
                contact_preference = ?, visibility = ?, status = ?,
                consent_recorded_at = CASE WHEN ? = 'active' AND (consent_recorded_at IS NULL OR status != 'active') THEN ? ELSE consent_recorded_at END,
                consent_withdrawn_at = CASE WHEN ? = 'withdrawn' THEN ? ELSE consent_withdrawn_at END,
                consent_policy_version = CASE WHEN ? = 'active' THEN ? ELSE consent_policy_version END,
                consent_source = CASE WHEN ? = 'active' THEN 'myagapay_directory' ELSE consent_source END,
                updated_at = ?, version = version + 1
              WHERE id = ? AND parish_id = ?`,
        params: [skill.id, values.customDisplayLabel, values.experienceLevel, values.serviceMode, values.availabilityNote, values.contactPreference, values.visibility, values.status, status, timestamp, status, timestamp, status, SKILL_POLICY_VERSION, status, timestamp, existing.id, parishId]
      },
      auditStatement({ action: status === "withdrawn" ? "directory.skill_listing.consent_withdrawn" : status === "active" ? "directory.skill_listing.activated" : "directory.skill_listing.edited", actor, parishId, targetType: "directory_person_skill_listing", targetId: existing.id, after: values, correlationId })
    ]);
    return listingDto(await listingRow(env, { parishId, listingId: existing.id }));
  }
  const id = generateSecret("dir_skill_listing");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_person_skill_listings
              (id, parish_id, person_id, skill_id, custom_display_label, experience_level, service_mode,
               availability_note, contact_preference, visibility, status, consent_recorded_at, consent_policy_version,
               consent_source, created_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, parishId, personId, skill.id, values.customDisplayLabel, values.experienceLevel, values.serviceMode, values.availabilityNote, values.contactPreference, values.visibility, values.status, status === "active" ? timestamp : null, status === "active" ? SKILL_POLICY_VERSION : null, status === "active" ? "myagapay_directory" : null, context.user.id, timestamp, timestamp]
    },
    auditStatement({ action: status === "active" ? "directory.skill_listing.activated" : "directory.skill_listing.created", actor, parishId, targetType: "directory_person_skill_listing", targetId: id, after: values, correlationId })
  ]);
  return listingDto(await listingRow(env, { parishId, listingId: id }));
}

export async function pauseAllMySkillListings(env, { context, correlationId = "" }) {
  const parishId = parishIdFor(context);
  if (!context.currentPerson?.id) throw new DirectoryServiceError("unclaimed", "Claim a directory person before using skills.", 403);
  const timestamp = nowMs();
  const actor = actorFromContext(context, [DIRECTORY_CAPABILITIES.selfManage]);
  await runAtomic(env, [
    { sql: "UPDATE directory_person_skill_listings SET status = 'paused', updated_at = ?1, version = version + 1 WHERE parish_id = ?2 AND person_id = ?3 AND status = 'active'", params: [timestamp, parishId, context.currentPerson.id] },
    auditStatement({ action: "directory.skill_listing.paused_all", actor, parishId, targetType: "directory_person", targetId: context.currentPerson.id, correlationId })
  ]);
  return listMySkillListings(env, { context });
}

async function publishedContact(env, { parishId, personId, preference, fallback }) {
  if (preference === "no_direct_contact") return { label: "No direct contact", value: "", type: "none" };
  if (preference === "ask_in_person") return { label: "Ask in person", value: "", type: "in_person" };
  if (preference === "parish_office") return { label: fallback, value: "", type: "parish_office" };
  const contactType = preference === "published_phone" ? "phone" : "email";
  const row = await d1First(
    env,
    `SELECT contact_type, label, value FROM directory_contact_methods
      WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1
        AND contact_type = ?3 AND visibility = 'directory_members'
      ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    parishId,
    personId,
    contactType
  );
  if (!row) return { label: fallback, value: "", type: "parish_office" };
  return { label: row.label || contactType, value: row.value, type: row.contact_type };
}

async function visibleSkillRows(env, context, { admin = false } = {}) {
  const settings = await assertFeatureEnabled(env, context.parishId, { memberSearch: !admin });
  const visibilityClause = admin ? "l.visibility IN ('parish_staff', 'directory_members', 'private')" : "l.visibility = 'directory_members'";
  const statusClause = admin ? "l.status IN ('active','paused','hidden_by_parish','withdrawn','draft')" : "l.status = 'active'";
  const rows = await d1All(
    env,
    `SELECT l.*, s.code, s.name, s.category, p.preferred_name,
            COALESCE(f.is_child, 0) AS is_child, COALESCE(f.protected_person, 0) AS protected_person
       FROM directory_person_skill_listings l
       JOIN directory_skill_catalog s ON s.id = l.skill_id
       JOIN directory_people p ON p.id = l.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = l.parish_id AND f.person_id = l.person_id AND f.active = 1
      WHERE l.parish_id = ?1 AND ${statusClause} AND ${visibilityClause}
      ORDER BY s.name ASC, p.preferred_name ASC, l.id ASC`,
    context.parishId
  );
  return { rows: rows.filter((row) => Number(row.is_child || 0) !== 1 && (admin || Number(row.protected_person || 0) !== 1)), settings };
}

export async function searchSkillListings(env, { context, q = "", category = "", serviceMode = "", skillId = "", limit = "", cursor = "" }) {
  const { rows, settings } = await visibleSkillRows(env, context, { admin: false });
  const query = normalizeQuery(q);
  const filtered = rows.filter((row) => {
    if (category && !CATEGORIES.includes(category)) throw new DirectoryServiceError("validation_failed", "Skill category is not supported.", 400);
    if (serviceMode && !SERVICE_MODES.includes(serviceMode)) throw new DirectoryServiceError("validation_failed", "Service mode is not supported.", 400);
    if (category && row.category !== category) return false;
    if (serviceMode && row.service_mode !== serviceMode) return false;
    if (skillId && row.skill_id !== skillId) return false;
    if (query.length >= 2 && !`${row.name} ${row.custom_display_label || ""} ${row.preferred_name}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const pageLimit = limitFor(limit);
  const offset = offsetFor(cursor);
  const page = filtered.slice(offset, offset + pageLimit + 1);
  const items = await Promise.all(page.slice(0, pageLimit).map(async (row) => listingDto(row, {
    includePerson: true,
    contact: await publishedContact(env, { parishId: context.parishId, personId: row.person_id, preference: row.contact_preference, fallback: settings.skillsContactFallback })
  })));
  return { items, totalVisible: filtered.length, nextCursor: nextCursor(offset, pageLimit, page.length), disclaimer: settings.skillsDisclaimerText };
}

export async function listSkillListingsAdmin(env, { context, status = "", category = "", q = "", limit = "" } = {}) {
  assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const { rows, settings } = await visibleSkillRows(env, { ...context, parishId: parishIdFor(context) }, { admin: true });
  const query = normalizeQuery(q);
  return {
    settings,
    listings: rows
      .filter((row) => !status || row.status === status)
      .filter((row) => !category || row.category === category)
      .filter((row) => !query || `${row.name} ${row.custom_display_label || ""} ${row.preferred_name}`.toLowerCase().includes(query))
      .slice(0, Math.min(Number(limit) || 100, 250))
      .map((row) => listingDto(row, { includePerson: true, includeAdmin: true }))
  };
}

export async function moderateSkillListing(env, { context, listingId, action, reason = "", correlationId = "" }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), MANAGE_CAPS);
  const parishId = parishIdFor(context);
  const row = await listingRow(env, { parishId, listingId });
  const timestamp = nowMs();
  let status = row.status;
  if (action === "hide") status = "hidden_by_parish";
  else if (action === "restore") {
    if (!row.consent_recorded_at || row.consent_withdrawn_at) throw new DirectoryServiceError("consent_required", "Consent is not currently valid for this listing.", 409);
    status = "active";
  } else if (action === "archive") status = "archived";
  else throw new DirectoryServiceError("validation_failed", "Moderation action is not supported.");
  await runAtomic(env, [
    {
      sql: `UPDATE directory_person_skill_listings SET
              status = ?, parish_hidden_reason = CASE WHEN ? = 'hidden_by_parish' THEN ? ELSE parish_hidden_reason END,
              parish_hidden_at = CASE WHEN ? = 'hidden_by_parish' THEN ? ELSE parish_hidden_at END,
              reviewed_at = ?, reviewed_by_actor_type = ?, reviewed_by_actor_id = ?, updated_at = ?, version = version + 1
            WHERE id = ? AND parish_id = ?`,
      params: [status, status, cleanText(reason, { max: 300 }), status, timestamp, timestamp, actor.actorType, actor.userId, timestamp, row.id, parishId]
    },
    auditStatement({ action: `directory.skill_listing.${action}`, actor, parishId, targetType: "directory_person_skill_listing", targetId: row.id, metadata: { reason: cleanText(reason, { max: 300 }) }, correlationId })
  ]);
  return listingDto(await listingRow(env, { parishId, listingId: row.id }), { includePerson: true, includeAdmin: true });
}

export async function updateSkillsSettings(env, { context, patch = {}, correlationId = "" }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), [DIRECTORY_CAPABILITIES.settingsManage, DIRECTORY_CAPABILITIES.skillsManage, DIRECTORY_CAPABILITIES.manage]);
  const parishId = parishIdFor(context);
  const before = await featureSettings(env, parishId);
  const next = {
    skillsDirectoryEnabled: "skillsDirectoryEnabled" in patch ? Boolean(patch.skillsDirectoryEnabled) : before.skillsDirectoryEnabled,
    skillsMemberSearchEnabled: "skillsMemberSearchEnabled" in patch ? Boolean(patch.skillsMemberSearchEnabled) : before.skillsMemberSearchEnabled,
    skillsStaffOnlyMode: "skillsStaffOnlyMode" in patch ? Boolean(patch.skillsStaffOnlyMode) : before.skillsStaffOnlyMode,
    skillsCustomEntriesEnabled: "skillsCustomEntriesEnabled" in patch ? Boolean(patch.skillsCustomEntriesEnabled) : before.skillsCustomEntriesEnabled,
    skillsDisclaimerText: cleanText(patch.skillsDisclaimerText ?? before.skillsDisclaimerText, { required: true, max: 700, field: "skillsDisclaimerText" }),
    skillsContactFallback: cleanText(patch.skillsContactFallback ?? before.skillsContactFallback, { required: true, max: 240, field: "skillsContactFallback" }),
    householdVerificationIntervalDays: Math.max(30, Math.min(1095, Number(patch.householdVerificationIntervalDays ?? before.householdVerificationIntervalDays) || 365))
  };
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_parish_settings (
              parish_id, directory_enabled, publication_approval_required, child_names_allowed,
              child_photos_allowed, address_max_visibility, contact_max_visibility,
              ordinary_member_access_enabled, clergy_staff_access_policy, reconfirmation_interval_days,
              default_household_publication_status, skills_directory_enabled, skills_member_search_enabled,
              skills_staff_only_mode, skills_custom_entries_enabled, skills_disclaimer_text,
              skills_contact_fallback, skills_last_reviewed_at, household_verification_interval_days,
              created_at, updated_at
            ) VALUES (?, 1, 1, 0, 0, 'staff', 'directory_members', 1, 'capability_required', 365,
              'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(parish_id) DO UPDATE SET
              skills_directory_enabled = excluded.skills_directory_enabled,
              skills_member_search_enabled = excluded.skills_member_search_enabled,
              skills_staff_only_mode = excluded.skills_staff_only_mode,
              skills_custom_entries_enabled = excluded.skills_custom_entries_enabled,
              skills_disclaimer_text = excluded.skills_disclaimer_text,
              skills_contact_fallback = excluded.skills_contact_fallback,
              skills_last_reviewed_at = excluded.skills_last_reviewed_at,
              household_verification_interval_days = excluded.household_verification_interval_days,
              updated_at = excluded.updated_at`,
      params: [parishId, next.skillsDirectoryEnabled ? 1 : 0, next.skillsMemberSearchEnabled ? 1 : 0, next.skillsStaffOnlyMode ? 1 : 0, next.skillsCustomEntriesEnabled ? 1 : 0, next.skillsDisclaimerText, next.skillsContactFallback, timestamp, next.householdVerificationIntervalDays, timestamp, timestamp]
    },
    auditStatement({ action: "directory.skills.settings_changed", actor, parishId, targetType: "directory_parish_settings", targetId: parishId, before, after: next, correlationId })
  ]);
  return featureSettings(env, parishId);
}

export async function getHouseholdVerificationStatus(env, { context, householdId }) {
  const household = context.manageableHouseholds?.find((item) => item.id === householdId);
  if (!household) throw new DirectoryServiceError("forbidden", "You cannot verify this household.", 403);
  const settings = await featureSettings(env, household.parishId);
  const row = await d1First(env, "SELECT * FROM directory_household_verifications WHERE household_id = ?1 AND parish_id = ?2", householdId, household.parishId);
  const dueAt = row?.verification_due_at || nowMs();
  const status = row ? (dueAt < nowMs() && row.verification_status === "current" ? "overdue" : row.verification_status) : "due";
  return { householdId, parishId: household.parishId, status, dueAt: Number(dueAt), lastVerifiedAt: Number(row?.last_verified_at || 0), policyVersion: row?.verification_policy_version || SKILL_POLICY_VERSION, intervalDays: settings.householdVerificationIntervalDays };
}

export async function completeHouseholdVerification(env, { context, householdId, reconfirmSkills = false, correlationId = "" }) {
  const current = await getHouseholdVerificationStatus(env, { context, householdId });
  const timestamp = nowMs();
  const interval = Math.max(30, Math.min(1095, current.intervalDays || 365));
  const actor = actorFromContext(context, [DIRECTORY_CAPABILITIES.selfManage]);
  const statements = [
    {
      sql: `INSERT INTO directory_household_verifications
              (household_id, parish_id, verification_status, verification_due_at, last_verified_at,
               verification_started_at, verified_by_user_id, verification_policy_version, created_at, updated_at)
            VALUES (?, ?, 'current', ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(household_id) DO UPDATE SET
              verification_status = 'current',
              verification_due_at = excluded.verification_due_at,
              last_verified_at = excluded.last_verified_at,
              verified_by_user_id = excluded.verified_by_user_id,
              verification_policy_version = excluded.verification_policy_version,
              updated_at = excluded.updated_at,
              verification_version = verification_version + 1`,
      params: [householdId, current.parishId, timestamp + interval * 86400000, timestamp, timestamp, context.user.id, SKILL_POLICY_VERSION, timestamp, timestamp]
    },
    auditStatement({ action: "directory.household_verification.completed", actor, parishId: current.parishId, targetType: "directory_household", targetId: householdId, metadata: { reconfirmSkills: Boolean(reconfirmSkills) }, correlationId })
  ];
  if (reconfirmSkills && context.currentPerson?.id) {
    statements.push({
      sql: "UPDATE directory_person_skill_listings SET consent_recorded_at = ?1, updated_at = ?1, version = version + 1 WHERE parish_id = ?2 AND person_id = ?3 AND status = 'active'",
      params: [timestamp, current.parishId, context.currentPerson.id]
    });
  }
  await runAtomic(env, statements);
  return getHouseholdVerificationStatus(env, { context, householdId });
}

export async function getDirectoryMaintenanceDashboard(env, { context }) {
  assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const now = nowMs();
  const rows = await d1All(env, "SELECT verification_status, verification_due_at FROM directory_household_verifications WHERE parish_id = ?1", parishId);
  const staleSkills = await d1First(env, "SELECT COUNT(*) AS count FROM directory_person_skill_listings WHERE parish_id = ?1 AND status = 'active' AND consent_recorded_at < ?2", parishId, now - 365 * 86400000);
  const unclaimed = await d1First(env, "SELECT COUNT(*) AS count FROM directory_people p WHERE p.created_by_parish_id = ?1 AND p.active = 1 AND NOT EXISTS (SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1)", parishId);
  const dueHouseholds = await d1All(
    env,
    `SELECT h.id, h.display_name, v.verification_status, v.verification_due_at
       FROM directory_households h
       JOIN directory_household_verifications v ON v.household_id = h.id AND v.parish_id = h.parish_id
      WHERE h.parish_id = ?1 AND h.active = 1
        AND (v.verification_status != 'current' OR v.verification_due_at < ?2)
      ORDER BY v.verification_due_at ASC, h.display_name ASC
      LIMIT 20`,
    parishId,
    now
  );
  const unclaimedRecords = await d1All(
    env,
    `SELECT p.id, p.preferred_name
       FROM directory_people p
      WHERE p.created_by_parish_id = ?1 AND p.active = 1
        AND NOT EXISTS (SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1)
      ORDER BY p.preferred_name ASC
      LIMIT 20`,
    parishId
  );
  const staleSkillRecords = await d1All(
    env,
    `SELECT l.id, l.person_id, p.preferred_name, s.name AS skill_name, l.consent_recorded_at
       FROM directory_person_skill_listings l
       JOIN directory_people p ON p.id = l.person_id
       JOIN directory_skill_catalog s ON s.id = l.skill_id
      WHERE l.parish_id = ?1 AND l.status = 'active' AND l.consent_recorded_at < ?2
      ORDER BY l.consent_recorded_at ASC
      LIMIT 20`,
    parishId,
    now - 365 * 86400000
  );
  const due = rows.filter((row) => row.verification_status !== "current" || Number(row.verification_due_at || 0) < now);
  return {
    householdsCurrent: rows.length - due.length,
    householdsDue: due.filter((row) => Number(row.verification_due_at || 0) >= now).length,
    householdsOverdue: due.filter((row) => Number(row.verification_due_at || 0) < now).length,
    staleSkillConsents: Number(staleSkills?.count || 0),
    unclaimedPeople: Number(unclaimed?.count || 0),
    actions: {
      overdueHouseholds: dueHouseholds.filter((row) => Number(row.verification_due_at || 0) < now).map((row) => ({ id: row.id, displayName: row.display_name, dueAt: Number(row.verification_due_at || 0) })),
      dueHouseholds: dueHouseholds.filter((row) => Number(row.verification_due_at || 0) >= now).map((row) => ({ id: row.id, displayName: row.display_name, dueAt: Number(row.verification_due_at || 0) })),
      unclaimedPeople: unclaimedRecords.map((row) => ({ id: row.id, displayName: row.preferred_name })),
      staleSkillConsents: staleSkillRecords.map((row) => ({ id: row.id, personId: row.person_id, displayName: row.preferred_name, skillName: row.skill_name, consentRecordedAt: Number(row.consent_recorded_at || 0) }))
    }
  };
}

export async function exportSkillsRosterCsv(env, { context }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const { rows, settings } = await visibleSkillRows(env, { ...context, parishId }, { admin: true });
  const active = rows.filter((row) => row.status === "active");
  const header = ["Skill", "Category", "Person", "Experience", "Service mode", "Visibility", "Contact preference", "Availability note"];
  const lines = [header.join(",")];
  for (const row of active) {
    lines.push([row.custom_display_label || row.name, row.category, row.preferred_name, row.experience_level, row.service_mode, row.visibility, row.contact_preference, row.availability_note || ""].map(csvEscape).join(","));
  }
  await runAtomic(env, [auditStatement({ action: "directory.export.skills_roster_generated", actor, parishId, targetType: "directory_export", targetId: `skills-${timestampSlug()}`, metadata: { count: active.length }, correlationId: "" })]);
  return {
    filename: `agapay-${parishId}-skills-roster-${timestampSlug()}.csv`,
    contentType: "text/csv; charset=utf-8",
    body: `${settings.skillsDisclaimerText}\n\n${lines.join("\n")}\n`
  };
}

export async function printSkillsRoster(env, { context }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const { rows, settings } = await visibleSkillRows(env, { ...context, parishId }, { admin: true });
  const active = rows.filter((row) => row.status === "active").map((row) => listingDto(row, { includePerson: true, includeAdmin: false }));
  await runAtomic(env, [auditStatement({ action: "directory.print.skills_roster_generated", actor, parishId, targetType: "directory_print", targetId: `skills-${timestampSlug()}`, metadata: { count: active.length } })]);
  return { parishId, generatedAt: new Date().toISOString(), disclaimer: settings.skillsDisclaimerText, listings: active };
}

export async function exportPublishedAdultsCsv(env, { context }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const rows = await d1All(
    env,
    `SELECT p.preferred_name, h.display_name AS household_name
       FROM directory_people p
       JOIN directory_publication_profiles pub ON pub.parish_id = ?1 AND pub.owner_type = 'person' AND pub.owner_id = p.id
       LEFT JOIN directory_household_members hm ON hm.person_id = p.id AND hm.active = 1
       LEFT JOIN directory_households h ON h.id = hm.household_id AND h.parish_id = ?1
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
      WHERE p.active = 1 AND pub.status = 'approved' AND pub.approval_status = 'approved'
        AND COALESCE(f.is_child, 0) = 0 AND COALESCE(f.protected_person, 0) = 0
      ORDER BY p.preferred_name ASC`,
    parishId
  );
  await runAtomic(env, [auditStatement({ action: "directory.export.published_adults_generated", actor, parishId, targetType: "directory_export", targetId: `adults-${timestampSlug()}`, metadata: { count: rows.length } })]);
  const lines = [["Name", "Household"].join(","), ...rows.map((row) => [row.preferred_name, row.household_name || ""].map(csvEscape).join(","))];
  return { filename: `agapay-${parishId}-published-adults-${timestampSlug()}.csv`, contentType: "text/csv; charset=utf-8", body: `${lines.join("\n")}\n` };
}

export async function printDirectory(env, { context }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const rows = await d1All(
    env,
    `SELECT h.display_name, p.preferred_name
       FROM directory_households h
       JOIN directory_household_members hm ON hm.household_id = h.id AND hm.active = 1
       JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
       JOIN directory_publication_profiles pub ON pub.parish_id = ?1 AND pub.owner_type = 'person' AND pub.owner_id = p.id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
      WHERE h.parish_id = ?1 AND h.active = 1 AND pub.status = 'approved' AND pub.approval_status = 'approved'
        AND COALESCE(f.is_child, 0) = 0 AND COALESCE(f.protected_person, 0) = 0
      ORDER BY h.display_name ASC, p.preferred_name ASC`,
    parishId
  );
  await runAtomic(env, [auditStatement({ action: "directory.print.household_directory_generated", actor, parishId, targetType: "directory_print", targetId: `directory-${timestampSlug()}`, metadata: { count: rows.length } })]);
  return { parishId, generatedAt: new Date().toISOString(), privacyReminder: "Private parish directory. Do not distribute outside the parish.", households: rows };
}
