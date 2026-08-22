import { currentMembership, currentUser } from "../lib/authorization.js";
import { d1All, d1First, safeParseJsonRow } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { getDirectorySettings } from "./settings.js";
import { cleanText, VISIBILITY_RANK } from "./shared.js";
import { personIdsWithPublishedMinistry, publishedMinistryAffiliationsForPerson } from "./ministries.js";

const PAGE_SIZE_DEFAULT = 24;
const PAGE_SIZE_MAX = 48;
const DIRECTORY_VISIBILITY = "directory_members";
const SAFE_NOT_FOUND = "Directory profile was not found.";

function visibleToMembers(visibility) {
  return VISIBILITY_RANK[visibility || "private"] >= VISIBILITY_RANK[DIRECTORY_VISIBILITY];
}

function limitFor(value) {
  return Math.max(1, Math.min(Number(value) || PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX));
}

function offsetFor(cursor = "") {
  const value = Number(String(cursor || "0").replace(/\D/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nextCursor(offset, limit, count) {
  return count > limit ? String(offset + limit) : "";
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeLetter(value) {
  const cleaned = String(value || "all").trim().toUpperCase();
  if (cleaned === "ALL") return "";
  if (cleaned === "#") return "#";
  return /^[A-Z]$/.test(cleaned) ? cleaned : "";
}

function nameParts(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

function directoryLastName(value, type = "person") {
  const normalized = type === "household"
    ? String(value || "").trim().replace(/^the\s+/i, "").replace(/\s+(family|household)$/i, "")
    : String(value || "").trim();
  return nameParts(normalized).at(-1) || normalized || "Parishioner";
}

function directorySortKey(value, type = "person") {
  const fullName = String(value || "").trim().toLocaleLowerCase("en-US");
  return `${directoryLastName(value, type).toLocaleLowerCase("en-US")}\u0000${fullName}`;
}

function directoryFirstLetter(value, type = "person") {
  const first = directoryLastName(value, type).normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

function contactDto(row) {
  return {
    type: row.contact_type,
    label: row.label || "",
    value: row.value,
    primary: Number(row.is_primary || 0) === 1
  };
}

function cityDto(row) {
  if (!row || Number(row.protected_address || 0) === 1 || !visibleToMembers(row.visibility)) return "";
  return [row.city, row.region].filter(Boolean).join(", ");
}

function skillPreviewDto(row) {
  return {
    id: row.id,
    displayLabel: row.custom_display_label || row.name,
    skill: {
      id: row.skill_id,
      name: row.name,
      category: row.category
    }
  };
}

function memberSkillsEnabled(context) {
  const settings = context.settings || {};
  return settings.skillsDirectoryEnabled !== false
    && settings.skillsMemberSearchEnabled !== false
    && !settings.skillsStaffOnlyMode;
}

function missingSkillsSchema(error) {
  return String(error?.message || error || "").includes("no such table: directory_person_skill_listings");
}

async function publishedSkillPreviewsForPerson(env, context, personId) {
  if (!memberSkillsEnabled(context)) return [];
  let rows;
  try {
    rows = await d1All(
      env,
      `SELECT listing.id, listing.skill_id, listing.custom_display_label,
            skill.name, skill.category
       FROM directory_person_skill_listings listing
       JOIN directory_skill_catalog skill ON skill.id = listing.skill_id AND skill.is_active = 1
      WHERE listing.parish_id = ?1 AND listing.person_id = ?2
        AND listing.status = 'active' AND listing.visibility = 'directory_members'
        AND listing.consent_recorded_at IS NOT NULL
        AND listing.consent_withdrawn_at IS NULL
      ORDER BY skill.name ASC, listing.id ASC
      LIMIT 8`,
      context.parishId,
      personId
    );
  } catch (error) {
    if (missingSkillsSchema(error)) return [];
    throw error;
  }
  return rows.map(skillPreviewDto);
}

async function publishedSkillPreviewsForHousehold(env, context, householdId) {
  const grouped = new Map();
  if (!memberSkillsEnabled(context)) return grouped;
  let rows;
  try {
    rows = await d1All(
      env,
      `SELECT membership.person_id, listing.id, listing.skill_id, listing.custom_display_label,
            skill.name, skill.category
       FROM directory_household_members membership
       JOIN directory_person_skill_listings listing
         ON listing.person_id = membership.person_id AND listing.parish_id = ?2
       JOIN directory_skill_catalog skill ON skill.id = listing.skill_id AND skill.is_active = 1
      WHERE membership.household_id = ?1 AND membership.active = 1
        AND listing.status = 'active' AND listing.visibility = 'directory_members'
        AND listing.consent_recorded_at IS NOT NULL
        AND listing.consent_withdrawn_at IS NULL
      ORDER BY skill.name ASC, listing.id ASC`,
      householdId,
      context.parishId
    );
  } catch (error) {
    if (missingSkillsSchema(error)) return grouped;
    throw error;
  }
  for (const row of rows) {
    const previews = grouped.get(row.person_id) || [];
    if (previews.length < 8) previews.push(skillPreviewDto(row));
    grouped.set(row.person_id, previews);
  }
  return grouped;
}

async function parishDirectoryIdentity(env, parishId) {
  let row = null;
  try {
    row = await d1First(
      env,
      `SELECT parish_name, data
         FROM registrations
        WHERE parish_id = ?1
        ORDER BY updated_at DESC, reference DESC
        LIMIT 1`,
      parishId
    );
  } catch {
    // Directory-only test and recovery databases may not include registration
    // records. The member directory remains available with a safe fallback.
  }
  const registration = safeParseJsonRow(row) || {};
  return {
    id: parishId,
    name: registration.parishName || row?.parish_name || "Parish",
    city: registration.city || "",
    state: registration.state || ""
  };
}

function photoDto(row, preferredVariant) {
  if (!row) return null;
  return {
    mediaAssetId: row.id,
    variantType: preferredVariant,
    url: `/api/directory/member/media/${encodeURIComponent(row.id)}/variants/${encodeURIComponent(preferredVariant)}`,
    alt: ""
  };
}

async function linkedPersonForUser(env, userId) {
  if (!userId) return null;
  return d1First(
    env,
    `SELECT p.* FROM directory_person_links l
     JOIN directory_people p ON p.id = l.person_id
     WHERE l.link_type = 'platform_user'
       AND l.external_id = ?1
       AND l.active = 1
       AND p.active = 1
     ORDER BY l.created_at ASC
     LIMIT 1`,
    userId
  );
}

async function staffParishes(env, userId) {
  const rows = await d1All(
    env,
    `SELECT pm.parish_id
       FROM parish_memberships pm
       JOIN membership_capabilities mc ON mc.membership_id = pm.id
      WHERE pm.user_id = ?1
        AND pm.status = 'active'
        AND mc.capability IN ('directory.view','directory.manage','directory.publication.review')`,
    userId
  );
  return rows.map((row) => row.parish_id);
}

async function visibleParishIds(env, userId, linkedPerson) {
  const affiliationRows = linkedPerson ? await d1All(
    env,
    `SELECT parish_id FROM directory_parish_affiliations
      WHERE person_id = ?1 AND active = 1 AND status != 'former_member'`,
    linkedPerson.id
  ) : [];
  const householdRows = linkedPerson ? await d1All(
    env,
    `SELECT h.parish_id
       FROM directory_household_members hm
       JOIN directory_households h ON h.id = hm.household_id
      WHERE hm.person_id = ?1 AND hm.active = 1 AND h.active = 1`,
    linkedPerson.id
  ) : [];
  return [...new Set([
    ...affiliationRows.map((row) => row.parish_id),
    ...householdRows.map((row) => row.parish_id),
    ...await staffParishes(env, userId)
  ])];
}

export async function resolveMemberDirectoryContext(env, { request, parishId = "" }) {
  const user = await currentUser(request, env);
  if (!user) throw new DirectoryServiceError("unauthorized", "Private directory access requires sign-in.", 401);
  const linkedPerson = await linkedPersonForUser(env, user.id);
  const parishIds = await visibleParishIds(env, user.id, linkedPerson);
  const requestedParish = cleanText(parishId, { max: 160, field: "parishId" }) || parishIds[0] || "";
  if (!requestedParish || !parishIds.includes(requestedParish)) {
    throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  }
  const settings = await getDirectorySettings(env, requestedParish);
  if (!settings.directoryEnabled || !settings.ordinaryMemberAccessEnabled) {
    throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  }
  const membership = await currentMembership(request, env, requestedParish);
  const viewerClass = membership?.capabilities?.some((capability) => ["directory.view", "directory.manage", "directory.publication.review"].includes(capability))
    ? "parish_staff"
    : "parish_member";
  return {
    user: { id: user.id, displayName: user.displayName || "" },
    parishId: requestedParish,
    personId: linkedPerson?.id || "",
    viewerClass,
    capabilities: membership?.capabilities || [],
    parishIds,
    settings,
    entitlement: { mission: true, parish: true, phase4Available: true }
  };
}

async function approvedOwnerIds(env, context, ownerType) {
  const rows = await d1All(
    env,
    `SELECT owner_id FROM directory_publication_profiles
      WHERE parish_id = ?1 AND owner_type = ?2 AND active = 1
        AND status = 'approved' AND approval_status = 'approved'`,
    context.parishId,
    ownerType
  );
  return new Set(rows.map((row) => row.owner_id));
}

async function peopleBaseRows(env, context) {
  const approved = await approvedOwnerIds(env, context, "person");
  if (!approved.size) return [];
  const rows = await d1All(
    env,
    `SELECT DISTINCT p.id, p.preferred_name, p.suffix, p.active, p.deceased, p.updated_at,
            COALESCE(f.is_child, 0) AS is_child,
            COALESCE(f.protected_person, 0) AS protected_person,
            h.id AS household_id,
            h.display_name AS household_name,
            hm.relationship
       FROM directory_people p
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
       LEFT JOIN directory_household_members hm ON hm.person_id = p.id AND hm.active = 1
       LEFT JOIN directory_households h ON h.id = hm.household_id AND h.parish_id = ?1 AND h.active = 1
      WHERE p.active = 1
        AND (p.created_by_parish_id = ?1 OR h.parish_id = ?1 OR EXISTS (
          SELECT 1 FROM directory_parish_affiliations a
           WHERE a.person_id = p.id AND a.parish_id = ?1 AND a.active = 1 AND a.status != 'former_member'
        ))
      ORDER BY p.preferred_name ASC, p.id ASC`,
    context.parishId
  );
  return rows.filter((row) => approved.has(row.id) && Number(row.protected_person || 0) !== 1 && Number(row.is_child || 0) !== 1);
}

async function householdBaseRows(env, context) {
  const approved = await approvedOwnerIds(env, context, "household");
  if (!approved.size) return [];
  const rows = await d1All(
    env,
    `SELECT h.*
       FROM directory_households h
      WHERE h.parish_id = ?1 AND h.active = 1
      ORDER BY h.display_name ASC, h.id ASC`,
    context.parishId
  );
  return rows.filter((row) => approved.has(row.id));
}

async function publishedContacts(env, context, ownerType, ownerId) {
  const rows = await d1All(
    env,
    `SELECT contact_type, label, value, is_primary
       FROM directory_contact_methods
      WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND active = 1
        AND visibility = 'directory_members'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 4`,
    context.parishId, ownerType, ownerId
  );
  return rows.map(contactDto);
}

async function publishedNamedaysForPerson(env, context, personId) {
  const rows = await d1All(
    env,
    `SELECT saint_name, feast_month_day
       FROM directory_household_namedays
      WHERE parish_id = ?1 AND person_id = ?2 AND active = 1
        AND visibility = 'directory_members'
      ORDER BY feast_month_day ASC, saint_name ASC`,
    context.parishId, personId
  );
  return rows.map((row) => ({
    saintName: row.saint_name || "",
    feastMonthDay: row.feast_month_day || ""
  }));
}

async function publishedCity(env, context, ownerType, ownerId) {
  const row = await d1First(
    env,
    `SELECT city, region, visibility, protected_address
       FROM directory_addresses
      WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND active = 1
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1`,
    context.parishId, ownerType, ownerId
  );
  return cityDto(row);
}

async function householdPhotoChildAuthorizationSatisfied(env, context, householdId) {
  const unauthorizedChild = await d1First(
    env,
    `SELECT hm.person_id
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f
         ON f.parish_id = ?2 AND f.person_id = p.id AND f.active = 1
      WHERE hm.household_id = ?1 AND hm.active = 1
        AND (hm.relationship = 'child' OR COALESCE(f.is_child, 0) = 1)
        AND (
          COALESCE(f.protected_person, 0) = 1
          OR NOT EXISTS (
            SELECT 1
              FROM directory_child_publication_requests cpr
             WHERE cpr.parish_id = ?2
               AND cpr.household_id = ?1
               AND cpr.child_person_id = p.id
               AND cpr.status = 'approved'
               AND cpr.approved_photo = 1
          )
        )
      LIMIT 1`,
    householdId,
    context.parishId
  );
  return !unauthorizedChild;
}

async function publishedPhoto(env, context, ownerType, ownerId) {
  if (ownerType === "household" && !await householdPhotoChildAuthorizationSatisfied(env, context, ownerId)) return null;
  const row = await d1First(
    env,
    `SELECT a.id
       FROM directory_media_assets a
       JOIN directory_media_assignments asn ON asn.media_asset_id = a.id
       JOIN directory_media_variants v ON v.media_asset_id = a.id
      WHERE asn.parish_id = ?1 AND asn.owner_type = ?2 AND asn.owner_id = ?3
        AND asn.assignment_status = 'active'
        AND a.lifecycle_status = 'approved'
        AND a.processing_status = 'securely_transformed'
        AND a.visibility = 'directory_members'
        AND a.publication_eligible = 1
        AND v.variant_type = ?4
        AND v.ready = 1
        AND v.secure_transform_status = 'securely_transformed'
      ORDER BY a.created_at DESC
      LIMIT 1`,
    context.parishId, ownerType, ownerId, ownerType === "person" ? "avatar_medium" : "household_card"
  );
  return photoDto(row, ownerType === "person" ? "avatar_medium" : "household_card");
}

async function personDto(env, context, row, { detail = false, skillsPreview = null } = {}) {
  const [contacts, namedays, city, photo, publishedSkills, ministries] = await Promise.all([
    detail ? publishedContacts(env, context, "person", row.id) : Promise.resolve([]),
    publishedNamedaysForPerson(env, context, row.id),
    publishedCity(env, context, "person", row.id),
    publishedPhoto(env, context, "person", row.id),
    Array.isArray(skillsPreview) ? Promise.resolve(skillsPreview) : publishedSkillPreviewsForPerson(env, context, row.id),
    publishedMinistryAffiliationsForPerson(env, { context, personId: row.id }).catch(() => [])
  ]);
  const displayName = row.preferred_name || "Parish member";
  if (photo) photo.alt = displayName;
  return {
    id: row.id,
    type: "person",
    displayName,
    sortKey: directorySortKey(displayName, "person"),
    letter: directoryFirstLetter(displayName, "person"),
    suffix: row.suffix || "",
    household: row.household_id ? { id: row.household_id, displayName: row.household_name || "" } : null,
    relationship: detail ? row.relationship || "" : "",
    city,
    contacts,
    namedays,
    ministries,
    skillsPreview: publishedSkills,
    photo,
    profileUrl: `/myagapay/directory?view=person&id=${encodeURIComponent(row.id)}`,
    version: String(row.updated_at || "")
  };
}

async function householdMembers(env, context, householdId, { detail = false } = {}) {
  const [rows, skillsByPerson] = await Promise.all([
    d1All(
      env,
      `SELECT p.id, p.preferred_name, p.suffix, p.updated_at, hm.relationship,
            h.id AS household_id, h.display_name AS household_name,
            COALESCE(f.is_child, 0) AS is_child,
            COALESCE(f.protected_person, 0) AS protected_person
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id
       JOIN directory_households h ON h.id = hm.household_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?2 AND f.person_id = p.id AND f.active = 1
      WHERE hm.household_id = ?1 AND hm.active = 1 AND p.active = 1
        AND h.parish_id = ?2
        AND (
          NOT EXISTS (
            SELECT 1 FROM directory_parish_affiliations affiliation
             WHERE affiliation.person_id = p.id AND affiliation.parish_id = ?2
          )
          OR EXISTS (
            SELECT 1 FROM directory_parish_affiliations affiliation
             WHERE affiliation.person_id = p.id AND affiliation.parish_id = ?2
               AND affiliation.active = 1 AND affiliation.status != 'former_member'
          )
        )
      ORDER BY p.preferred_name ASC, p.id ASC`,
      householdId, context.parishId
    ),
    publishedSkillPreviewsForHousehold(env, context, householdId)
  ]);
  const adults = await Promise.all(
    rows.filter((row) => Number(row.protected_person || 0) !== 1 && Number(row.is_child || 0) !== 1)
      .map((row) => personDto(env, context, row, { detail, skillsPreview: skillsByPerson.get(row.id) || [] }))
  );
  const children = await householdChildren(env, context, householdId);
  return [...adults, ...children];
}

// Phase 4B: children are never listed, searched, or browsed as standalone
// people (Part 14/16's chosen conservative policy -- no standalone child
// profile, no child entries in the People tab or its alphabet index).
// They appear only nested inside their household's member list/card, and
// only when a currently-approved child_publication_requests row exists.
// Every precondition is re-verified live, mirroring checkChildEligibility
// -- an approved row is never trusted on its own as "safe to show."
async function householdChildren(env, context, householdId) {
  const rows = await d1All(
    env,
    `SELECT cpr.approved_fields_json, cpr.approved_photo, cpr.child_person_id,
            p.id, p.preferred_name, p.updated_at,
            hm.relationship,
            COALESCE(f.is_child, 0) AS is_child,
            COALESCE(f.protected_person, 0) AS protected_person,
            aff.id AS affiliation_id
       FROM directory_child_publication_requests cpr
       JOIN directory_people p ON p.id = cpr.child_person_id AND p.active = 1
       JOIN directory_household_members hm ON hm.household_id = cpr.household_id AND hm.person_id = p.id AND hm.active = 1
       JOIN directory_households h ON h.id = cpr.household_id AND h.active = 1 AND h.parish_id = ?2
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?2 AND f.person_id = p.id AND f.active = 1
       LEFT JOIN directory_parish_affiliations aff ON aff.person_id = p.id AND aff.parish_id = ?2 AND aff.active = 1 AND aff.status != 'former_member'
      WHERE cpr.household_id = ?1 AND cpr.parish_id = ?2 AND cpr.status = 'approved'`,
    householdId, context.parishId
  );
  const eligible = rows.filter((row) => Number(row.is_child || 0) === 1 && Number(row.protected_person || 0) !== 1);
  const items = await Promise.all(eligible.map((row) => childDto(env, context, row)));
  return items.filter(Boolean);
}

function approvedChildFieldSet(json) {
  try {
    const parsed = JSON.parse(json || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function childDto(env, context, row) {
  const fields = approvedChildFieldSet(row.approved_fields_json);
  const displayName = fields.has("preferred_name") ? (row.preferred_name || "") : "";
  // Nothing identifying was approved -- do not render an entry at all,
  // rather than showing a placeholder that implies presence without a name.
  if (!displayName) return null;
  const [photo, namedays] = await Promise.all([
    Number(row.approved_photo || 0) === 1 ? publishedPhoto(env, context, "person", row.child_person_id) : Promise.resolve(null),
    publishedNamedaysForPerson(env, context, row.child_person_id)
  ]);
  if (photo) photo.alt = displayName;
  return {
    id: row.child_person_id,
    type: "child",
    displayName,
    sortKey: directorySortKey(displayName, "person"),
    letter: directoryFirstLetter(displayName, "person"),
    relationship: fields.has("relationship_label") ? row.relationship || "" : "",
    city: "",
    contacts: [],
    namedays,
    photo,
    profileUrl: "",
    version: String(row.updated_at || "")
  };
}

async function householdDto(env, context, row, { detail = false } = {}) {
  const [members, contacts, city, photo] = await Promise.all([
    householdMembers(env, context, row.id, { detail }),
    detail ? publishedContacts(env, context, "household", row.id) : Promise.resolve([]),
    publishedCity(env, context, "household", row.id),
    publishedPhoto(env, context, "household", row.id)
  ]);
  const displayName = row.display_name || "Parish household";
  const seenSkills = new Set();
  const skillsPreview = members.flatMap((member) => member.skillsPreview || []).filter((skill) => {
    const key = skill.id || skill.displayLabel;
    if (!key || seenSkills.has(key)) return false;
    seenSkills.add(key);
    return true;
  }).slice(0, 8);
  if (photo) photo.alt = displayName;
  return {
    id: row.id,
    type: "household",
    displayName,
    sortKey: directorySortKey(displayName, "household"),
    letter: directoryFirstLetter(displayName, "household"),
    city,
    members,
    publishedMemberCount: members.length,
    skillsPreview,
    contacts,
    photo,
    profileUrl: `/myagapay/directory?view=household&id=${encodeURIComponent(row.id)}`,
    version: String(row.updated_at || "")
  };
}

function applyBrowseFilters(items, { q = "", letter = "", sort = "az" } = {}) {
  const query = normalizeQuery(q);
  const activeLetter = normalizeLetter(letter);
  let out = items;
  if (query.length >= 2) {
    out = out.filter((item) => item.searchText.includes(query));
  }
  if (activeLetter) out = out.filter((item) => item.letter === activeLetter);
  out = out.sort((a, b) => sort === "za" ? b.sortKey.localeCompare(a.sortKey) : a.sortKey.localeCompare(b.sortKey));
  return out;
}

function paginate(items, { limit, cursor }) {
  const pageLimit = limitFor(limit);
  const offset = offsetFor(cursor);
  const page = items.slice(offset, offset + pageLimit + 1);
  return { items: page.slice(0, pageLimit), nextCursor: nextCursor(offset, pageLimit, page.length), totalVisible: items.length };
}

function alphabet(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.letter, (counts.get(item.letter) || 0) + 1);
  return ["ALL", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"].map((letter) => ({
    letter,
    count: letter === "ALL" ? items.length : counts.get(letter) || 0,
    available: letter === "ALL" ? items.length > 0 : counts.has(letter)
  }));
}

async function peopleItems(env, context) {
  const rows = await peopleBaseRows(env, context);
  const items = await Promise.all(rows.map((row) => personDto(env, context, row)));
  return items.map((item) => {
    return {
      ...item,
      searchText: normalizeQuery([item.displayName, item.suffix, item.household?.displayName, item.city, ...item.ministries.map((ministry) => ministry.displayName)].filter(Boolean).join(" "))
    };
  });
}

async function householdItems(env, context) {
  const rows = await householdBaseRows(env, context);
  const items = await Promise.all(rows.map((row) => householdDto(env, context, row)));
  return items.map((item) => ({
    ...item,
    searchText: normalizeQuery([
      item.displayName,
      item.city,
      ...item.members.flatMap((member) => [member.displayName, ...(member.ministries || []).map((ministry) => ministry.displayName)])
    ].filter(Boolean).join(" "))
  }));
}

function stripSearchText(item) {
  const { searchText: _searchText, sortKey: _sortKey, ...safe } = item;
  return safe;
}

export async function getMemberDirectoryHome(env, { context }) {
  const [peopleRows, householdRows, parish] = await Promise.all([
    peopleBaseRows(env, context),
    householdBaseRows(env, context),
    parishDirectoryIdentity(env, context.parishId)
  ]);
  const peopleIndex = peopleRows.map((row) => {
    const displayName = row.preferred_name || "Parish member";
    return {
      id: row.id,
      displayName,
      sortKey: directorySortKey(displayName, "person"),
      letter: directoryFirstLetter(displayName, "person"),
      searchText: normalizeQuery(displayName)
    };
  });
  const householdById = new Map(householdRows.map((row) => [row.id, row]));
  const householdIndex = householdRows.map((row) => {
    const displayName = row.display_name || "Parish household";
    return {
      id: row.id,
      displayName,
      sortKey: directorySortKey(displayName, "household"),
      letter: directoryFirstLetter(displayName, "household"),
      searchText: normalizeQuery(displayName)
    };
  });
  const firstPageIndex = paginate(applyBrowseFilters(householdIndex, { sort: "az" }), { limit: 24, cursor: "" });
  const firstPageItems = await Promise.all(firstPageIndex.items.map(async (item) => {
    const row = householdById.get(item.id);
    return stripSearchText(await householdDto(env, context, row));
  }));
  return {
    parish,
    context: {
      parishId: context.parishId,
      viewerClass: context.viewerClass,
      entitlement: context.entitlement
    },
    counts: { people: peopleIndex.length, households: householdIndex.length },
    alphabet: {
      people: alphabet(peopleIndex),
      households: alphabet(householdIndex)
    },
    households: {
      items: firstPageItems,
      nextCursor: firstPageIndex.nextCursor,
      totalVisible: firstPageIndex.totalVisible,
      alphabet: alphabet(householdIndex)
    },
    privacyReminder: "This directory is private to authorized members of your parish. Please use contact information respectfully and do not copy or distribute it outside the parish."
  };
}

export async function listMemberDirectoryPeople(env, { context, q = "", letter = "", sort = "az", ministryId = "", limit, cursor }) {
  let all = await peopleItems(env, context);
  if (ministryId) {
    const allowed = await personIdsWithPublishedMinistry(env, { context, ministryId });
    all = all.filter((item) => allowed.has(item.id));
  }
  const items = applyBrowseFilters(all, { q, letter, sort });
  const page = paginate(items, { limit, cursor });
  return { ...page, alphabet: alphabet(items), items: page.items.map(stripSearchText) };
}

export async function listMemberDirectoryHouseholds(env, { context, q = "", letter = "", sort = "az", limit, cursor }) {
  const items = applyBrowseFilters(await householdItems(env, context), { q, letter, sort });
  const page = paginate(items, { limit, cursor });
  return { ...page, alphabet: alphabet(items), items: page.items.map(stripSearchText) };
}

export async function searchMemberDirectory(env, { context, q = "", type = "all", ministryId = "", limit, cursor }) {
  const query = normalizeQuery(q);
  if (query.length < 2) return { items: [], nextCursor: "", totalVisible: 0, minimumQueryLength: 2 };
  const [people, households] = await Promise.all([
    type === "households" ? Promise.resolve([]) : peopleItems(env, context),
    type === "people" ? Promise.resolve([]) : householdItems(env, context)
  ]);
  let scopedPeople = people;
  if (ministryId) {
    const allowed = await personIdsWithPublishedMinistry(env, { context, ministryId });
    scopedPeople = people.filter((item) => allowed.has(item.id));
  }
  const items = applyBrowseFilters([...scopedPeople, ...households], { q: query, sort: "az" });
  const page = paginate(items, { limit, cursor });
  return { ...page, minimumQueryLength: 2, items: page.items.map(stripSearchText) };
}

async function resolveAlias(env, context, entityType, entityId) {
  let current = cleanText(entityId, { required: true, max: 180, field: "entityId" });
  const seen = new Set();
  for (let i = 0; i < 8; i += 1) {
    if (seen.has(current)) throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
    seen.add(current);
    const alias = await d1First(
      env,
      "SELECT survivor_entity_id FROM directory_merge_aliases WHERE parish_id = ?1 AND entity_type = ?2 AND old_entity_id = ?3 AND active = 1",
      context.parishId, entityType, current
    );
    if (!alias) return current;
    current = alias.survivor_entity_id;
  }
  throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
}

export async function getMemberDirectoryPerson(env, { context, personId }) {
  const resolvedId = await resolveAlias(env, context, "person", personId);
  const rows = await peopleBaseRows(env, context);
  const row = rows.find((candidate) => candidate.id === resolvedId);
  if (!row) throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  return { person: await personDto(env, context, row, { detail: true }), canonicalId: resolvedId };
}

export async function getMemberDirectoryHousehold(env, { context, householdId }) {
  const resolvedId = await resolveAlias(env, context, "household", householdId);
  const rows = await householdBaseRows(env, context);
  const row = rows.find((candidate) => candidate.id === resolvedId);
  if (!row) throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  return { household: await householdDto(env, context, row, { detail: true }), canonicalId: resolvedId };
}

export async function streamMemberDirectoryMediaVariant(env, { context, mediaAssetId, variantType }) {
  const assetId = cleanText(mediaAssetId, { required: true, max: 180, field: "mediaAssetId" });
  const variant = cleanText(variantType, { required: true, max: 60, field: "variantType" });
  const row = await d1First(
    env,
    `SELECT a.*, v.r2_object_key, v.mime_type
       FROM directory_media_assets a
       JOIN directory_media_variants v ON v.media_asset_id = a.id
       JOIN directory_media_assignments asn ON asn.media_asset_id = a.id
      WHERE a.id = ?1
        AND asn.parish_id = ?2
        AND a.parish_id = ?2
        AND asn.assignment_status = 'active'
        AND a.lifecycle_status = 'approved'
        AND a.processing_status = 'securely_transformed'
        AND a.visibility = 'directory_members'
        AND a.publication_eligible = 1
        AND v.variant_type = ?3
        AND v.ready = 1
        AND v.secure_transform_status = 'securely_transformed'`,
    assetId, context.parishId, variant
  );
  if (!row) throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  const ownerVisible = row.owner_type === "person"
    ? (await peopleBaseRows(env, context)).some((person) => person.id === row.owner_id)
    : (await householdBaseRows(env, context)).some((household) => household.id === row.owner_id);
  if (!ownerVisible) throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  if (row.owner_type === "household" && !await householdPhotoChildAuthorizationSatisfied(env, context, row.owner_id)) {
    throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  }
  const bucket = env?.DIRECTORY_MEDIA;
  if (!bucket) throw new DirectoryServiceError("storage_unavailable", "Directory media storage is not configured.", 503);
  const object = await bucket.get(row.r2_object_key);
  if (!object) throw new DirectoryServiceError("not_found", SAFE_NOT_FOUND, 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
