import { d1All, d1First, generateSecret, loadDonor } from "../lib/core.js";
import { currentUser } from "../lib/authorization.js";
import { addHouseholdMember, createPerson, DirectoryServiceError, removeHouseholdMember } from "./foundation.js";
import {
  createAddress,
  createContactMethod,
  deactivateContactMethod,
  listActiveAddressesForOwner,
  listActiveContactsForOwner,
  updateAddress,
  updateContactMethod
} from "./contacts.js";
import { createDirectoryInvitation, listParishDirectoryInvitations, resendDirectoryInvitation, revokeDirectoryInvitation } from "./invitations.js";
import { getPersonPrivacyFlags, setFieldPrivacyPreference, setPersonPrivacyFlags } from "./privacy.js";
import { createPublicationProfile, getPublicationProfile, transitionPublicationProfile } from "./publication.js";
import {
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  isActiveHouseholdAdmin,
  maskValue,
  nowMs,
  runAtomic,
  safeJson
} from "./shared.js";

const EDITABLE_PERSON_FIELDS = Object.freeze(["preferredName", "middleName", "suffix", "dateOfBirth", "birthdayVisibility"]);
const REVIEW_PERSON_FIELDS = Object.freeze(["legalName", "biologicalSex", "deceased", "active", "notes"]);
const EDITABLE_HOUSEHOLD_FIELDS = Object.freeze(["displayName", "anniversaryDate", "anniversaryVisibility"]);
const CHANGE_REQUEST_TYPES = Object.freeze([
  "person_profile_review",
  "household_membership_add",
  "household_membership_remove",
  "household_relationship_change",
  "household_move_request",
  "household_merge_review"
]);

function toBool(value) {
  return Number(value || 0) === 1;
}

function cleanDate(value, field) {
  const cleaned = cleanText(value, { max: 10, field });
  if (!cleaned) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new DirectoryServiceError("validation_failed", `${field} must use YYYY-MM-DD format.`);
  }
  return cleaned;
}

function normalizeStarterParishId(value) {
  const cleaned = cleanText(value, { required: true, max: 160, field: "parishId" });
  if (!/^[a-z0-9][a-z0-9_.-]{1,159}$/i.test(cleaned)) {
    throw new DirectoryServiceError("validation_failed", "Choose a parish before starting your directory profile.", 422);
  }
  return cleaned;
}

function normalizeStarterVisibility(value, fallback = "private") {
  const cleaned = cleanText(value || fallback, { max: 40, field: "visibility" }) || fallback;
  if (!["private", "staff", "directory_members"].includes(cleaned)) {
    throw new DirectoryServiceError("validation_failed", "Choose a supported directory sharing option.", 422);
  }
  return cleaned;
}

async function householdWasParishVerified(env, parishId, householdId) {
  const row = await d1First(
    env,
    `SELECT id FROM directory_publication_profiles
      WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2
        AND approval_status = 'approved'
      ORDER BY approved_at DESC LIMIT 1`,
    parishId,
    householdId
  );
  return Boolean(row);
}

async function personBelongsToVerifiedHousehold(env, parishId, personId) {
  const row = await d1First(
    env,
    `SELECT hm.id FROM directory_household_members hm
      JOIN directory_households h ON h.id = hm.household_id AND h.parish_id = ?1 AND h.active = 1
      JOIN directory_publication_profiles pub
        ON pub.parish_id = ?1 AND pub.owner_type = 'household' AND pub.owner_id = h.id
     WHERE hm.person_id = ?2 AND hm.active = 1 AND pub.approval_status = 'approved'
     LIMIT 1`,
    parishId,
    personId
  );
  return Boolean(row);
}

function personDto(row, flags = {}) {
  if (!row) return null;
  return {
    id: row.id,
    preferredName: row.preferred_name,
    legalName: row.legal_name || "",
    middleName: row.middle_name || "",
    suffix: row.suffix || "",
    dateOfBirth: row.date_of_birth || "",
    biologicalSex: row.biological_sex || "unknown",
    active: toBool(row.active),
    protectedPerson: Boolean(flags.protectedPerson),
    child: Boolean(flags.isChild),
    version: Number(row.updated_at || 0)
  };
}

function householdDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    displayName: row.display_name,
    anniversaryDate: row.anniversary_date || "",
    anniversaryVisibility: row.anniversary_visibility || "private",
    active: toBool(row.active),
    version: Number(row.updated_at || 0)
  };
}

function affiliationDto(row) {
  return {
    parishId: row.parish_id,
    status: row.status,
    active: toBool(row.active)
  };
}

function memberDto(row) {
  return {
    personId: row.person_id,
    preferredName: row.preferred_name,
    dateOfBirth: row.date_of_birth || "",
    relationship: row.relationship,
    child: toBool(row.is_child),
    protectedPerson: toBool(row.protected_person),
    accountLinked: toBool(row.account_linked),
    version: Number(row.person_updated_at || 0)
  };
}

function contactDto(row) {
  return {
    id: row.id,
    contactType: row.contactType,
    label: row.label,
    value: row.value,
    maskedValue: maskValue(row.value, row.contactType),
    primary: row.primary,
    verified: row.verified,
    smsCapable: row.smsCapable,
    visibility: row.visibility,
    active: row.active,
    version: row.updatedAt
  };
}

function addressDto(row) {
  return {
    id: row.id,
    addressType: row.addressType,
    line1: row.protectedAddress ? "" : row.line1,
    line2: row.protectedAddress ? "" : row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.protectedAddress ? "" : row.postalCode,
    country: row.country,
    primary: row.primary,
    protectedAddress: row.protectedAddress,
    visibility: row.visibility,
    active: row.active,
    version: row.updatedAt
  };
}

function requestDto(row) {
  return {
    id: row.id,
    parishId: row.parish_id,
    requestType: row.request_type,
    targetType: row.target_type,
    targetId: row.target_id,
    householdId: row.household_id || "",
    status: row.status,
    summary: row.summary,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

function selfActor(context, parishId) {
  return {
    userId: context.user.id,
    parishId,
    personId: context.currentPerson?.id,
    capabilities: [
      DIRECTORY_CAPABILITIES.selfManage,
      "directory.invitations.manage"
    ]
  };
}

function assertExpectedVersion(existingVersion, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new DirectoryServiceError("stale_update_required", "A current record version is required.", 409);
  }
  if (Number(expectedVersion) !== Number(existingVersion)) {
    throw new DirectoryServiceError("stale_update", "This directory record changed before your update was saved.", 409);
  }
}

function assertNoUnknownFields(patch, allowed, reviewable = []) {
  const known = new Set([...allowed, ...reviewable, "expectedVersion"]);
  const unknown = Object.keys(patch || {}).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new DirectoryServiceError("protected_field_denied", `This field cannot be changed here: ${unknown[0]}.`, 403);
  }
}

async function loadLinkedPerson(env, userId) {
  const row = await d1First(
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
  return row || null;
}

async function restoreLinkedPersonFromSelfServiceRequest(env, user) {
  if (!user?.id) return null;
  const row = await d1First(
    env,
    `SELECT p.* FROM directory_change_requests r
     JOIN directory_people p ON p.id = r.target_id
     WHERE r.requester_user_id = ?1
       AND r.requester_person_id = r.target_id
       AND r.target_type = 'person'
       AND r.request_type = 'person_profile_review'
       AND p.active = 1
       AND NOT EXISTS (
         SELECT 1 FROM directory_person_links l
         WHERE l.person_id = p.id
           AND l.link_type = 'platform_user'
           AND l.external_id = ?1
           AND l.active = 1
       )
     ORDER BY r.created_at DESC
     LIMIT 1`,
    user.id
  );
  if (!row) return null;
  const timestamp = nowMs();
  const actor = { userId: user.id, actorType: "platform_user", parishId: row.created_by_parish_id, personId: row.id, capabilities: [DIRECTORY_CAPABILITIES.selfManage] };
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_person_links
              (id, person_id, link_type, external_id, active, source, claim_id, created_at, updated_at)
            VALUES (?, ?, 'platform_user', ?, 1, 'self_service_recovered', NULL, ?, ?)`,
      params: [generateSecret("dir_link"), row.id, user.id, timestamp, timestamp]
    },
    auditStatement({
      action: "directory.self_service.profile_link_recovered",
      actor,
      parishId: row.created_by_parish_id,
      targetType: "directory_person",
      targetId: row.id
    })
  ]);
  return row;
}

async function loadContextRows(env, personId) {
  const [affiliations, memberships, admins] = await Promise.all([
    d1All(env, "SELECT * FROM directory_parish_affiliations WHERE person_id = ?1 AND active = 1 AND status != 'former_member' ORDER BY parish_id", personId),
    d1All(
      env,
      `SELECT hm.*, h.parish_id, h.display_name, h.active AS household_active
       FROM directory_household_members hm
       JOIN directory_households h ON h.id = hm.household_id
       WHERE hm.person_id = ?1 AND hm.active = 1 AND h.active = 1
       ORDER BY h.display_name`,
      personId
    ),
    d1All(
      env,
      `SELECT ha.*, h.parish_id, h.display_name, h.active AS household_active
       FROM directory_household_admins ha
       JOIN directory_households h ON h.id = ha.household_id
       WHERE ha.person_id = ?1 AND ha.active = 1 AND h.active = 1
       ORDER BY h.display_name`,
      personId
    )
  ]);
  return { affiliations, memberships, admins };
}

async function shouldCreateSelfServiceHousehold(env, userId, personId) {
  const row = await d1First(
    env,
    `SELECT id FROM directory_change_requests
     WHERE requester_user_id = ?1
       AND requester_person_id = ?2
       AND target_id = ?2
       AND target_type = 'person'
       AND request_type = 'person_profile_review'
     LIMIT 1`,
    userId,
    personId
  );
  return Boolean(row);
}

async function createSelfServiceHouseholdForPerson(env, { user, person, parishId }) {
  const timestamp = nowMs();
  const householdId = generateSecret("dir_household");
  const householdMemberId = generateSecret("dir_hm");
  const householdAdminId = generateSecret("dir_ha");
  const householdPublicationId = generateSecret("dir_pub");
  const displayName = `${person.preferred_name || user.displayName || "My"} Household`;
  const actor = { userId: user.id, actorType: "platform_user", parishId, personId: person.id, capabilities: [DIRECTORY_CAPABILITIES.selfManage] };
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_households (id, parish_id, display_name, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)`,
      params: [householdId, parishId, displayName, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_household_members
              (id, household_id, person_id, relationship, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, 'head', NULL, NULL, 1, ?, ?)`,
      params: [householdMemberId, householdId, person.id, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_household_admins
              (id, household_id, person_id, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, NULL, NULL, 1, ?, ?)`,
      params: [householdAdminId, householdId, person.id, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_publication_profiles
              (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at)
            VALUES (?, ?, 'household', ?, 'draft', 'not_submitted', 1, ?, ?)`,
      params: [householdPublicationId, parishId, householdId, timestamp, timestamp]
    },
    auditStatement({
      action: "directory.self_service.household_recovered",
      actor,
      parishId,
      targetType: "directory_household",
      targetId: householdId,
      householdId,
      after: { displayName, administratorPersonId: person.id }
    })
  ]);
}

async function loadPendingRequests(env, { personId, parishIds }) {
  if (!parishIds.length) return [];
  const placeholders = parishIds.map((_, index) => `?${index + 2}`).join(", ");
  const rows = await d1All(
    env,
    `SELECT * FROM directory_change_requests
     WHERE requester_person_id = ?1 AND parish_id IN (${placeholders}) AND status = 'pending'
     ORDER BY created_at DESC`,
    personId,
    ...parishIds
  );
  return rows.map(requestDto);
}

async function notificationStatement({ context, parishId, eventType, targetType, targetId, householdId = "", safeMessage, metadata = null }) {
  return {
    sql: `INSERT INTO directory_notification_events
            (id, parish_id, recipient_user_id, actor_user_id, event_type, target_type, target_id,
             household_id, safe_message, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      generateSecret("dir_note"),
      parishId,
      context.user.id,
      context.user.id,
      eventType,
      targetType,
      targetId,
      householdId || null,
      safeMessage,
      safeJson(metadata),
      nowMs()
    ]
  };
}

export async function resolveDirectorySelfServiceContext(env, { request = null, user = null } = {}) {
  const platformUser = user || await currentUser(request, env);
  if (!platformUser) throw new DirectoryServiceError("unauthorized", "Directory self-service requires an authenticated My AGAPAY account.", 401);
  const linkedPerson = await loadLinkedPerson(env, platformUser.id) || await restoreLinkedPersonFromSelfServiceRequest(env, platformUser);
  if (!linkedPerson) {
    return {
      claimed: false,
      user: { id: platformUser.id, email: platformUser.email, displayName: platformUser.displayName || "" },
      currentPerson: null,
      activeParishContexts: [],
      memberHouseholds: [],
      manageableHouseholds: [],
      permissions: { canSelfManage: false, canManageHouseholds: false },
      pendingRequests: [],
      entitlement: { mission: true, parish: true, phase2AAvailable: true }
    };
  }
  const flags = await getPersonPrivacyFlags(env, { parishId: linkedPerson.created_by_parish_id, personId: linkedPerson.id });
  if (flags.isChild) throw new DirectoryServiceError("forbidden", "Child records cannot use directory self-service.", 403);
  let rows = await loadContextRows(env, linkedPerson.id);
  if (!rows.memberships.length && !rows.admins.length && await shouldCreateSelfServiceHousehold(env, platformUser.id, linkedPerson.id)) {
    await createSelfServiceHouseholdForPerson(env, { user: platformUser, person: linkedPerson, parishId: linkedPerson.created_by_parish_id });
    rows = await loadContextRows(env, linkedPerson.id);
  }
  const parishIds = [...new Set([
    ...rows.affiliations.map((row) => row.parish_id),
    ...rows.memberships.map((row) => row.parish_id),
    ...rows.admins.map((row) => row.parish_id)
  ])];
  const pendingRequests = await loadPendingRequests(env, { personId: linkedPerson.id, parishIds });
  return {
    claimed: true,
    user: { id: platformUser.id, email: platformUser.email, displayName: platformUser.displayName || "" },
    currentPerson: personDto(linkedPerson, flags),
    activeParishContexts: rows.affiliations.map(affiliationDto),
    memberHouseholds: rows.memberships.map((row) => ({
      id: row.household_id,
      parishId: row.parish_id,
      displayName: row.display_name,
      relationship: row.relationship
    })),
    manageableHouseholds: rows.admins.map((row) => ({
      id: row.household_id,
      parishId: row.parish_id,
      displayName: row.display_name
    })),
    permissions: {
      canSelfManage: rows.affiliations.length > 0,
      canManageHouseholds: rows.admins.length > 0,
      canInviteAdults: rows.admins.length > 0
    },
    pendingRequests,
    entitlement: { mission: true, parish: true, phase2AAvailable: true }
  };
}

export async function getSelfServiceProfile(env, { context }) {
  if (!context.claimed) return context;
  const donor = await loadDonor(env, context.user.email).catch(() => null);
  if (donor) await syncSelfServiceContactsFromDonor(env, { context, donor }).catch(() => null);
  const parishId = context.activeParishContexts[0]?.parishId || context.currentPerson.id;
  const [contacts, addresses, publication, namePreference, birthdayPreference] = await Promise.all([
    listActiveContactsForOwner(env, { parishId, ownerType: "person", ownerId: context.currentPerson.id }),
    listActiveAddressesForOwner(env, { parishId, ownerType: "person", ownerId: context.currentPerson.id }),
    getPublicationProfile(env, { parishId, ownerType: "person", ownerId: context.currentPerson.id }),
    d1First(
      env,
      `SELECT visibility, publication_eligible
       FROM directory_field_privacy_preferences
       WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2
         AND field_key = 'adult_preferred_name' AND active = 1`,
      parishId,
      context.currentPerson.id
    ),
    d1First(
      env,
      `SELECT visibility, publication_eligible
       FROM directory_field_privacy_preferences
       WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2
         AND field_key = 'adult_birthday' AND active = 1`,
      parishId,
      context.currentPerson.id
    )
  ]);
  return {
    ...context,
    profile: {
      person: context.currentPerson,
      contacts: contacts.map(contactDto),
      addresses: addresses.map(addressDto),
      publication,
      sharing: {
        name: {
          visibility: namePreference?.visibility || "directory_members",
          publicationEligible: namePreference ? toBool(namePreference.publication_eligible) : true
        },
        birthday: {
          visibility: birthdayPreference?.visibility || "private",
          publicationEligible: birthdayPreference ? toBool(birthdayPreference.publication_eligible) : false
        }
      },
      editableFields: EDITABLE_PERSON_FIELDS,
      reviewFields: REVIEW_PERSON_FIELDS
    }
  };
}

export async function syncSelfServiceContactsFromDonor(env, { context, donor, correlationId = "" }) {
  if (!context?.claimed || !donor) return { synced: false };
  const parishId = context.activeParishContexts[0]?.parishId;
  const personId = context.currentPerson?.id;
  if (!parishId || !personId) return { synced: false };
  const actor = selfActor(context, parishId);
  const contacts = await listActiveContactsForOwner(env, { parishId, ownerType: "person", ownerId: personId });
  const syncContact = async (contactType, value, label) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    const existing = contacts.find((contact) => contact.contactType === contactType && contact.primary)
      || contacts.find((contact) => contact.contactType === contactType);
    if (!existing) {
      await createContactMethod(env, {
        actor,
        parishId,
        ownerType: "person",
        ownerId: personId,
        contactType,
        value: cleaned,
        label,
        primary: true,
        verified: contactType === "email" && Boolean(donor.emailVerifiedAt),
        visibility: "private",
        correlationId
      });
    } else if (String(existing.value || "").trim() !== cleaned) {
      await updateContactMethod(env, {
        actor,
        parishId,
        contactId: existing.id,
        patch: { value: cleaned, label: existing.label || label, primary: true, visibility: existing.visibility || "private" },
        correlationId
      });
    }
  };
  await syncContact("email", donor.email, "personal").catch(() => null);
  await syncContact("phone", donor.contactPhone, "mobile").catch(() => null);

  const household = context.manageableHouseholds.find((item) => item.parishId === parishId)
    || context.manageableHouseholds[0];
  const addressComplete = String(donor.addressLine1 || "").trim() && String(donor.city || "").trim();
  if (household && addressComplete) {
    const addresses = await listActiveAddressesForOwner(env, { parishId: household.parishId, ownerType: "household", ownerId: household.id });
    const existing = addresses.find((address) => address.primary) || addresses[0];
    const addressData = {
      line1: donor.addressLine1,
      line2: donor.addressLine2 || "",
      city: donor.city,
      region: donor.state || "",
      postalCode: donor.postalCode || "",
      country: donor.country || "US",
      primary: true
    };
    if (existing) {
      const changed = ["line1", "line2", "city", "region", "postalCode", "country"]
        .some((key) => String(existing[key] || "").trim() !== String(addressData[key] || "").trim());
      if (changed) {
        await updateAddress(env, {
          actor: selfActor(context, household.parishId),
          parishId: household.parishId,
          addressId: existing.id,
          patch: { ...addressData, visibility: existing.visibility || "private" },
          correlationId
        }).catch(() => null);
      }
    } else {
      await createAddress(env, {
        actor: selfActor(context, household.parishId),
        parishId: household.parishId,
        ownerType: "household",
        ownerId: household.id,
        addressType: "residential",
        ...addressData,
        protectedAddress: false,
        visibility: "private",
        correlationId
      }).catch(() => null);
    }
  }
  return { synced: true };
}

export async function startSelfServiceProfile(env, { context, data = {}, correlationId = "" }) {
  if (context.claimed) return getSelfServiceProfile(env, { context });
  const parishId = normalizeStarterParishId(data.parishId);
  const preferredName = cleanText(data.preferredName || context.user.displayName || context.user.email?.split("@")[0], { required: true, max: 160, field: "preferredName" });
  const legalName = cleanText(data.legalName, { max: 160, field: "legalName" });
  const dateOfBirth = cleanDate(data.dateOfBirth, "dateOfBirth");
  const email = cleanText(data.email || context.user.email, { max: 320, field: "email" });
  const phone = cleanText(data.phone, { max: 40, field: "phone" });
  const profileVisibility = normalizeStarterVisibility(data.profileVisibility, "directory_members");
  const emailVisibility = normalizeStarterVisibility(data.emailVisibility, "private");
  const phoneVisibility = normalizeStarterVisibility(data.phoneVisibility, "private");
  const publicationPreferences = {
    adultPreferredName: { visibility: profileVisibility, publicationEligible: profileVisibility === "directory_members" },
    adultEmail: { visibility: emailVisibility, publicationEligible: emailVisibility === "directory_members" },
    adultPhone: { visibility: phoneVisibility, publicationEligible: phoneVisibility === "directory_members" }
  };
  const timestamp = nowMs();
  const personId = generateSecret("dir_person");
  const householdId = generateSecret("dir_household");
  const linkId = generateSecret("dir_link");
  const affiliationId = generateSecret("dir_affil");
  const householdMemberId = generateSecret("dir_hm");
  const householdAdminId = generateSecret("dir_ha");
  const publicationId = generateSecret("dir_pub");
  const householdPublicationId = generateSecret("dir_pub");
  const requestId = generateSecret("dir_req");
  const householdName = cleanText(data.householdName || `${preferredName} Household`, { required: true, max: 200, field: "householdName" });
  const actor = { userId: context.user.id, actorType: "platform_user", parishId, personId, capabilities: [DIRECTORY_CAPABILITIES.selfManage] };
  const statements = [
    {
      sql: `INSERT INTO directory_people
              (id, created_by_parish_id, preferred_name, legal_name, middle_name, suffix,
               date_of_birth, biological_sex, deceased, active, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, '', '', ?, 'unknown', 0, 1, ?, ?, ?)`,
      params: [personId, parishId, preferredName, legalName, dateOfBirth, "Created from My AGAPAY self-service onboarding; pending parish review.", timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_person_links
              (id, person_id, link_type, external_id, active, created_at, updated_at)
            VALUES (?, ?, 'platform_user', ?, 1, ?, ?)`,
      params: [linkId, personId, context.user.id, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_households (id, parish_id, display_name, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)`,
      params: [householdId, parishId, householdName, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_household_members
              (id, household_id, person_id, relationship, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, 'head', NULL, NULL, 1, ?, ?)`,
      params: [householdMemberId, householdId, personId, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_household_admins
              (id, household_id, person_id, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, NULL, NULL, 1, ?, ?)`,
      params: [householdAdminId, householdId, personId, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_parish_affiliations
              (id, person_id, parish_id, status, joined_date, left_date, active, created_at, updated_at)
            VALUES (?, ?, ?, 'visitor', NULL, NULL, 1, ?, ?)`,
      params: [affiliationId, personId, parishId, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_publication_profiles
              (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at)
            VALUES (?, ?, 'person', ?, 'draft', 'not_submitted', 1, ?, ?)`,
      params: [publicationId, parishId, personId, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_publication_profiles
              (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at)
            VALUES (?, ?, 'household', ?, 'draft', 'not_submitted', 1, ?, ?)`,
      params: [householdPublicationId, parishId, householdId, timestamp, timestamp]
    },
    {
      sql: `INSERT INTO directory_change_requests
              (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
               household_id, request_type, status, summary, requested_payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'person', ?, NULL, 'person_profile_review', 'pending', ?, ?, ?, ?)`,
      params: [
        requestId,
        parishId,
        context.user.id,
        personId,
        personId,
        `New directory profile started by ${preferredName}`,
        safeJson({ preferredName, legalName, dateOfBirth, email, phone, publicationPreferences, source: "myagapay_directory_onboarding" }) || "{}",
        timestamp,
        timestamp
      ]
    },
    auditStatement({
      action: "directory.self_service.profile_started",
      actor,
      parishId,
      targetType: "directory_person",
      targetId: personId,
      householdId,
      after: { preferredName, householdName, status: "visitor", publicationStatus: "draft" },
      correlationId
    }),
    auditStatement({
      action: "directory.self_service.household_started",
      actor,
      parishId,
      targetType: "directory_household",
      targetId: householdId,
      householdId,
      after: { displayName: householdName, administratorPersonId: personId },
      correlationId
    }),
    auditStatement({
      action: "directory.change_request.created",
      actor,
      parishId,
      targetType: "directory_person",
      targetId: personId,
      after: { requestType: "person_profile_review", summary: `New directory profile started by ${preferredName}` },
      correlationId
    }),
    await notificationStatement({
      context: { ...context, currentPerson: { id: personId } },
      parishId,
      eventType: "directory.profile.started",
      targetType: "directory_person",
      targetId: personId,
      safeMessage: "Your draft directory profile was started and sent to the parish for review.",
      metadata: { source: "myagapay_directory_onboarding" }
    })
  ];
  await runAtomic(env, statements);

  const resolved = await resolveDirectorySelfServiceContext(env, { user: context.user });
  await setSelfServicePrivacyPreference(env, {
    context: resolved,
    ownerType: "person",
    ownerId: personId,
    fieldKey: "adult_preferred_name",
    visibility: profileVisibility,
    publicationEligible: profileVisibility === "directory_members",
    correlationId
  }).catch(() => null);
  if (email) {
    await createSelfServiceContact(env, {
      context: resolved,
      ownerType: "person",
      ownerId: personId,
      data: { contactType: "email", label: "personal", value: email, visibility: emailVisibility, primary: true },
      correlationId
    }).catch(() => null);
  }
  if (phone) {
    await createSelfServiceContact(env, {
      context: resolved,
      ownerType: "person",
      ownerId: personId,
      data: { contactType: "phone", label: "mobile", value: phone, visibility: phoneVisibility, primary: true },
      correlationId
    }).catch(() => null);
  }
  return getSelfServiceProfile(env, { context: await resolveDirectorySelfServiceContext(env, { user: context.user }) });
}

function namedayDto(row) {
  return {
    id: row.id,
    parishId: row.parish_id,
    householdId: row.household_id,
    personId: row.person_id || "",
    displayName: row.display_name || "",
    saintName: row.saint_name || "",
    feastMonthDay: row.feast_month_day || "",
    visibility: row.visibility || "private",
    version: String(row.updated_at || "")
  };
}

function cleanMonthDay(value) {
  const cleaned = cleanText(value, { required: true, max: 5, field: "feastMonthDay" });
  if (!/^\d{2}-\d{2}$/.test(cleaned)) throw new DirectoryServiceError("validation_failed", "Name day must use MM-DD format.");
  const [month, day] = cleaned.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new DirectoryServiceError("validation_failed", "Name day is not a valid month and day.");
  return cleaned;
}

function namedayVisibility(value) {
  const cleaned = cleanText(value || "private", { max: 40, field: "visibility" });
  if (!["private", "household", "staff", "directory_members"].includes(cleaned)) throw new DirectoryServiceError("validation_failed", "Name day visibility is not supported.");
  return cleaned;
}

export async function listHouseholdNamedays(env, { context, householdId }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot manage this household.", 403);
  const rows = await d1All(
    env,
    "SELECT * FROM directory_household_namedays WHERE parish_id = ?1 AND household_id = ?2 AND active = 1 ORDER BY feast_month_day, display_name",
    managed.parishId,
    householdId
  );
  return rows.map(namedayDto);
}

export async function saveHouseholdNameday(env, { context, householdId, namedayId = "", data = {}, correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot manage this household.", 403);
  const existing = namedayId
    ? await d1First(env, "SELECT * FROM directory_household_namedays WHERE id = ?1 AND parish_id = ?2 AND household_id = ?3 AND active = 1", namedayId, managed.parishId, householdId)
    : null;
  if (namedayId && !existing) throw new DirectoryServiceError("not_found", "Name day was not found.", 404);
  const timestamp = nowMs();
  const id = existing?.id || generateSecret("dir_nameday");
  const displayName = cleanText(data.displayName ?? existing?.display_name, { required: true, max: 160, field: "displayName" });
  const saintName = cleanText(data.saintName ?? existing?.saint_name, { required: true, max: 200, field: "saintName" });
  const feastMonthDay = cleanMonthDay(data.feastMonthDay ?? existing?.feast_month_day);
  const visibility = namedayVisibility(data.visibility ?? existing?.visibility);
  let personId = cleanText(data.personId ?? existing?.person_id, { max: 180, field: "personId" });
  if (!personId) {
    const matchingMember = await d1First(
      env,
      `SELECT p.id
         FROM directory_household_members hm
         JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
        WHERE hm.household_id = ?1 AND hm.active = 1
          AND LOWER(p.preferred_name) = LOWER(?2)
        ORDER BY p.id
        LIMIT 1`,
      householdId,
      displayName
    );
    personId = matchingMember?.id || "";
  }
  if (personId) {
    const member = await d1First(
      env,
      "SELECT id FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2 AND active = 1",
      householdId,
      personId
    );
    if (!member) throw new DirectoryServiceError("validation_failed", "Choose a nameday person from this household.", 422);
  }
  await runAtomic(env, [
    existing ? {
      sql: `UPDATE directory_household_namedays
            SET person_id = ?, display_name = ?, saint_name = ?, feast_month_day = ?, visibility = ?, updated_at = ?
            WHERE id = ? AND updated_at = ?`,
      params: [personId || null, displayName, saintName, feastMonthDay, visibility, timestamp, existing.id, existing.updated_at]
    } : {
      sql: `INSERT INTO directory_household_namedays
              (id, parish_id, household_id, person_id, display_name, saint_name, feast_month_day,
               visibility, active, created_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      params: [id, managed.parishId, householdId, personId || null, displayName, saintName, feastMonthDay, visibility, context.user.id, timestamp, timestamp]
    },
    auditStatement({
      action: existing ? "directory.household_nameday.updated" : "directory.household_nameday.created",
      actor: selfActor(context, managed.parishId),
      parishId: managed.parishId,
      targetType: "directory_household_nameday",
      targetId: id,
      householdId,
      after: { personId, displayName, saintName, feastMonthDay, visibility },
      correlationId
    })
  ]);
  return namedayDto(await d1First(env, "SELECT * FROM directory_household_namedays WHERE id = ?1", id));
}

export async function updateSelfServicePersonProfile(env, { context, patch = {}, correlationId = "" }) {
  if (!context.claimed) throw new DirectoryServiceError("unclaimed", "Claim a directory person before editing a profile.", 403);
  assertNoUnknownFields(patch, EDITABLE_PERSON_FIELDS, REVIEW_PERSON_FIELDS);
  const personId = context.currentPerson.id;
  const existing = await d1First(env, "SELECT * FROM directory_people WHERE id = ?1 AND active = 1", personId);
  if (!existing) throw new DirectoryServiceError("not_found", "Directory person was not found.", 404);
  assertExpectedVersion(existing.updated_at, patch.expectedVersion);
  const reviewFields = REVIEW_PERSON_FIELDS.filter((field) => field in patch);
  if (reviewFields.length) {
    return createDirectoryChangeRequest(env, {
      context,
      parishId: context.activeParishContexts[0]?.parishId || existing.created_by_parish_id,
      targetType: "person",
      targetId: personId,
      requestType: "person_profile_review",
      summary: `Review requested for ${reviewFields.join(", ")}`,
      payload: Object.fromEntries(reviewFields.map((field) => [field, patch[field]])),
      correlationId
    });
  }
  const next = {
    preferredName: "preferredName" in patch ? cleanText(patch.preferredName, { required: true, max: 160, field: "preferredName" }) : existing.preferred_name,
    middleName: "middleName" in patch ? cleanText(patch.middleName, { max: 160, field: "middleName" }) : existing.middle_name,
    suffix: "suffix" in patch ? cleanText(patch.suffix, { max: 80, field: "suffix" }) : existing.suffix,
    dateOfBirth: "dateOfBirth" in patch ? cleanDate(patch.dateOfBirth, "dateOfBirth") : existing.date_of_birth
  };
  const timestamp = nowMs();
  const parishId = context.activeParishContexts[0]?.parishId || existing.created_by_parish_id;
  await runAtomic(env, [
    {
      sql: `UPDATE directory_people
            SET preferred_name = ?, middle_name = ?, suffix = ?, date_of_birth = ?, updated_at = ?
            WHERE id = ? AND updated_at = ?`,
      params: [next.preferredName, next.middleName, next.suffix, next.dateOfBirth, timestamp, personId, existing.updated_at]
    },
    auditStatement({
      action: "directory.self_service.person_profile_updated",
      actor: selfActor(context, parishId),
      parishId,
      targetType: "directory_person",
      targetId: personId,
      before: { preferredName: existing.preferred_name },
      after: { preferredName: next.preferredName },
      correlationId
    }),
    await notificationStatement({
      context,
      parishId,
      eventType: "directory.profile.updated",
      targetType: "directory_person",
      targetId: personId,
      safeMessage: "Your directory profile was updated."
    })
  ]);
  if ("birthdayVisibility" in patch) {
    const visibility = normalizeStarterVisibility(patch.birthdayVisibility, "private");
    await setFieldPrivacyPreference(env, {
      actor: selfActor(context, parishId),
      parishId,
      ownerType: "person",
      ownerId: personId,
      fieldKey: "adult_birthday",
      visibility,
      publicationEligible: visibility === "directory_members",
      correlationId
    });
  }
  const updated = await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", personId);
  const flags = await getPersonPrivacyFlags(env, { parishId, personId });
  return personDto(updated, flags);
}

export async function getHouseholdSelfServiceProfile(env, { context, householdId }) {
  const cleanedHouseholdId = cleanText(householdId, { required: true, max: 160, field: "householdId" });
  const managed = context.manageableHouseholds.find((household) => household.id === cleanedHouseholdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot manage this household.", 403);
  const household = await d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2 AND active = 1", cleanedHouseholdId, managed.parishId);
  if (!household) throw new DirectoryServiceError("not_found", "Household was not found.", 404);
  const [contacts, addresses, publication, members, admins, invitations, requests, anniversaryPreference] = await Promise.all([
    listActiveContactsForOwner(env, { parishId: managed.parishId, ownerType: "household", ownerId: cleanedHouseholdId }),
    listActiveAddressesForOwner(env, { parishId: managed.parishId, ownerType: "household", ownerId: cleanedHouseholdId }),
    getPublicationProfile(env, { parishId: managed.parishId, ownerType: "household", ownerId: cleanedHouseholdId }),
    d1All(
      env,
      `SELECT hm.person_id, hm.relationship, p.preferred_name, p.date_of_birth, p.updated_at AS person_updated_at,
              COALESCE(f.is_child, 0) AS is_child,
              COALESCE(f.protected_person, 0) AS protected_person,
              EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.active = 1) AS account_linked
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id
       LEFT JOIN directory_person_privacy_flags f ON f.person_id = p.id AND f.parish_id = ?2 AND f.active = 1
       WHERE hm.household_id = ?1 AND hm.active = 1 AND p.active = 1
       ORDER BY p.preferred_name`,
      cleanedHouseholdId,
      managed.parishId
    ),
    d1All(
      env,
      `SELECT ha.person_id, p.preferred_name
       FROM directory_household_admins ha
       JOIN directory_people p ON p.id = ha.person_id
       WHERE ha.household_id = ?1 AND ha.active = 1
       ORDER BY p.preferred_name`,
      cleanedHouseholdId
    ),
    listParishDirectoryInvitations(env, { actor: selfActor(context, managed.parishId), parishId: managed.parishId }),
    d1All(
      env,
      "SELECT * FROM directory_change_requests WHERE parish_id = ?1 AND household_id = ?2 AND status = 'pending' ORDER BY created_at DESC",
      managed.parishId,
      cleanedHouseholdId
    ),
    d1First(
      env,
      `SELECT visibility, publication_eligible
       FROM directory_field_privacy_preferences
       WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2
         AND field_key = 'household_anniversary' AND active = 1`,
      managed.parishId,
      cleanedHouseholdId
    )
  ]);
  return {
    household: householdDto({ ...household, anniversary_visibility: anniversaryPreference?.visibility || "private" }),
    contacts: contacts.map(contactDto),
    addresses: addresses.map(addressDto),
    publication,
    members: members.map(memberDto),
    administrators: admins.map((row) => ({ personId: row.person_id, preferredName: row.preferred_name })),
    pendingInvitations: invitations.filter((invitation) => invitation.intendedHouseholdId === cleanedHouseholdId && ["pending", "sent", "opened", "accepted"].includes(invitation.status)).map((invitation) => ({
      id: invitation.id,
      invitationType: invitation.invitationType,
      intendedPersonId: invitation.intendedPersonId,
      status: invitation.status,
      expiresAt: invitation.expiresAt
    })),
    pendingRequests: requests.map(requestDto),
    editableFields: EDITABLE_HOUSEHOLD_FIELDS
  };
}

export async function updateHouseholdMember(env, { context, householdId, personId, data = {}, correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot edit this household.", 403);
  if (!await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id })) {
    throw new DirectoryServiceError("forbidden", "Only a household administrator can edit family members.", 403);
  }
  const member = await d1First(
    env,
    `SELECT hm.person_id, hm.relationship, p.preferred_name, p.date_of_birth, p.updated_at AS person_updated_at,
            COALESCE(f.is_child, 0) AS is_child,
            EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.active = 1) AS account_linked
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f ON f.person_id = p.id AND f.parish_id = ?3 AND f.active = 1
      WHERE hm.household_id = ?1 AND hm.person_id = ?2 AND hm.active = 1`,
    householdId,
    personId,
    managed.parishId
  );
  if (!member) throw new DirectoryServiceError("not_found", "That household member was not found.", 404);
  const relationship = cleanText(data.relationship || member.relationship, { required: true, max: 80, field: "relationship" });
  if (!["spouse", "child", "adult_child", "other"].includes(relationship)) {
    throw new DirectoryServiceError("validation_failed", "Choose a supported household relationship.", 422);
  }
  const canRename = toBool(member.is_child) || !toBool(member.account_linked);
  const preferredName = cleanText(data.preferredName || member.preferred_name, { required: true, max: 160, field: "preferredName" });
  const dateOfBirth = "dateOfBirth" in data ? cleanDate(data.dateOfBirth, "dateOfBirth") : member.date_of_birth;
  if (!canRename && preferredName !== member.preferred_name) {
    throw new DirectoryServiceError("account_managed", "This adult manages their own name through My AGAPAY.", 409);
  }
  if (!canRename && dateOfBirth !== member.date_of_birth) {
    throw new DirectoryServiceError("account_managed", "This adult manages their own birthday through My AGAPAY.", 409);
  }
  const timestamp = nowMs();
  const statements = [
    {
      sql: "UPDATE directory_household_members SET relationship = ?, updated_at = ? WHERE household_id = ? AND person_id = ? AND active = 1",
      params: [relationship, timestamp, householdId, personId]
    }
  ];
  if (preferredName !== member.preferred_name) {
    statements.push(
      {
        sql: "UPDATE directory_people SET preferred_name = ?, updated_at = ? WHERE id = ? AND active = 1",
        params: [preferredName, timestamp, personId]
      },
      {
        sql: "UPDATE directory_household_namedays SET display_name = ?, updated_at = ? WHERE parish_id = ? AND household_id = ? AND active = 1 AND display_name = ?",
        params: [preferredName, timestamp, managed.parishId, householdId, member.preferred_name]
      }
    );
  }
  if (dateOfBirth !== member.date_of_birth) {
    statements.push({
      sql: "UPDATE directory_people SET date_of_birth = ?, updated_at = ? WHERE id = ? AND active = 1",
      params: [dateOfBirth, timestamp, personId]
    });
  }
  statements.push(auditStatement({
    action: "directory.self_service.household_member_updated",
    actor: selfActor(context, managed.parishId),
    parishId: managed.parishId,
    targetType: "directory_person",
    targetId: personId,
    householdId,
    before: { preferredName: member.preferred_name, relationship: member.relationship, dateOfBirth: member.date_of_birth || "" },
    after: { preferredName, relationship, dateOfBirth: dateOfBirth || "" },
    correlationId
  }));
  await runAtomic(env, statements);
  return { personId, preferredName, dateOfBirth: dateOfBirth || "", relationship, child: toBool(member.is_child), accountLinked: toBool(member.account_linked), version: timestamp };
}

export async function deleteHouseholdMember(env, { context, householdId, personId, correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot edit this household.", 403);
  if (!await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id })) {
    throw new DirectoryServiceError("forbidden", "Only a household administrator can remove family members.", 403);
  }
  if (personId === context.currentPerson?.id) {
    throw new DirectoryServiceError("cannot_remove_self", "You cannot remove yourself from the household here.", 409);
  }
  const otherAdmin = await d1First(
    env,
    "SELECT id FROM directory_household_admins WHERE household_id = ?1 AND person_id = ?2 AND active = 1",
    householdId,
    personId
  );
  if (otherAdmin) {
    throw new DirectoryServiceError("administrator_member", "A household administrator must be removed by parish staff.", 409);
  }
  const serviceActor = { ...selfActor(context, managed.parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] };
  return removeHouseholdMember(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    householdId,
    personId,
    correlationId
  });
}

export async function deleteHouseholdNameday(env, { context, householdId, namedayId, correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot edit this household.", 403);
  if (!await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id })) {
    throw new DirectoryServiceError("forbidden", "Only a household administrator can remove namedays.", 403);
  }
  const existing = await d1First(
    env,
    "SELECT * FROM directory_household_namedays WHERE id = ?1 AND parish_id = ?2 AND household_id = ?3 AND active = 1",
    namedayId,
    managed.parishId,
    householdId
  );
  if (!existing) throw new DirectoryServiceError("not_found", "That nameday was not found.", 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_household_namedays SET active = 0, updated_at = ? WHERE id = ? AND active = 1",
      params: [timestamp, namedayId]
    },
    auditStatement({
      action: "directory.household_nameday.deleted",
      actor: selfActor(context, managed.parishId),
      parishId: managed.parishId,
      targetType: "directory_household_nameday",
      targetId: namedayId,
      householdId,
      before: namedayDto(existing),
      after: { active: false },
      correlationId
    })
  ]);
  return { ...namedayDto(existing), active: false };
}

export async function updateHouseholdSelfServiceProfile(env, { context, householdId, patch = {}, correlationId = "" }) {
  assertNoUnknownFields(patch, EDITABLE_HOUSEHOLD_FIELDS);
  const current = await getHouseholdSelfServiceProfile(env, { context, householdId });
  assertExpectedVersion(current.household.version, patch.expectedVersion);
  const displayName = "displayName" in patch ? cleanText(patch.displayName, { required: true, max: 200, field: "displayName" }) : current.household.displayName;
  const anniversaryDate = "anniversaryDate" in patch ? cleanDate(patch.anniversaryDate, "anniversaryDate") : current.household.anniversaryDate;
  const timestamp = nowMs();
  const actor = selfActor(context, current.household.parishId);
  await runAtomic(env, [
    {
      sql: "UPDATE directory_households SET display_name = ?, anniversary_date = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
      params: [displayName, anniversaryDate, timestamp, current.household.id, current.household.version]
    },
    auditStatement({
      action: "directory.self_service.household_profile_updated",
      actor,
      parishId: current.household.parishId,
      targetType: "directory_household",
      targetId: current.household.id,
      householdId: current.household.id,
      before: { displayName: current.household.displayName, anniversaryDate: current.household.anniversaryDate },
      after: { displayName, anniversaryDate },
      correlationId
    })
  ]);
  if ("anniversaryVisibility" in patch) {
    const visibility = normalizeStarterVisibility(patch.anniversaryVisibility, "private");
    await setFieldPrivacyPreference(env, {
      actor,
      parishId: current.household.parishId,
      ownerType: "household",
      ownerId: current.household.id,
      fieldKey: "household_anniversary",
      visibility,
      publicationEligible: visibility === "directory_members",
      correlationId
    });
  }
  return getHouseholdSelfServiceProfile(env, { context, householdId });
}

export async function createSelfServiceContact(env, { context, ownerType, ownerId, data = {}, correlationId = "" }) {
  const parishId = ownerType === "household"
    ? context.manageableHouseholds.find((household) => household.id === ownerId)?.parishId
    : context.activeParishContexts[0]?.parishId;
  if (!parishId) throw new DirectoryServiceError("forbidden", "You cannot manage this contact owner.", 403);
  if (ownerType === "person" && ownerId !== context.currentPerson?.id) throw new DirectoryServiceError("forbidden", "You cannot manage another adult's person-owned contacts.", 403);
  const contact = await createContactMethod(env, {
    actor: selfActor(context, parishId),
    parishId,
    ownerType,
    ownerId,
    contactType: data.contactType,
    value: data.value,
    label: data.label,
    primary: Boolean(data.primary),
    verified: false,
    smsCapable: data.smsCapable ?? null,
    visibility: data.visibility || "private",
    correlationId
  });
  return contactDto(contact);
}

export async function updateSelfServiceContact(env, { context, contactId, patch = {}, correlationId = "" }) {
  if ("verified" in patch) throw new DirectoryServiceError("protected_field_denied", "Directory contact verification is not self-service editable.", 403);
  const existing = await d1First(env, "SELECT * FROM directory_contact_methods WHERE id = ?1", cleanText(contactId, { required: true, max: 160, field: "contactId" }));
  if (!existing) throw new DirectoryServiceError("not_found", "Directory contact was not found.", 404);
  const ownerAllowed = existing.owner_type === "person"
    ? existing.owner_id === context.currentPerson?.id
    : context.manageableHouseholds.some((household) => household.id === existing.owner_id && household.parishId === existing.parish_id);
  if (!ownerAllowed) throw new DirectoryServiceError("forbidden", "You cannot manage this contact.", 403);
  assertExpectedVersion(existing.updated_at, patch.expectedVersion);
  const updated = await updateContactMethod(env, {
    actor: selfActor(context, existing.parish_id),
    parishId: existing.parish_id,
    contactId: existing.id,
    patch,
    correlationId
  });
  return contactDto(updated);
}

export async function deleteSelfServiceContact(env, { context, contactId, correlationId = "" }) {
  return updateSelfServiceContact(env, { context, contactId, patch: { active: false, expectedVersion: (await d1First(env, "SELECT updated_at FROM directory_contact_methods WHERE id = ?1", contactId))?.updated_at }, correlationId });
}

export async function createSelfServiceAddress(env, { context, householdId, data = {}, correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot manage this household address.", 403);
  const addresses = await listActiveAddressesForOwner(env, { parishId: managed.parishId, ownerType: "household", ownerId: householdId });
  const existing = Boolean(data.primary)
    ? addresses.find((address) => address.primary && address.addressType === (data.addressType || "residential"))
    : null;
  if (existing) {
    const updated = await updateAddress(env, {
      actor: selfActor(context, managed.parishId),
      parishId: managed.parishId,
      addressId: existing.id,
      patch: {
        line1: data.line1,
        line2: data.line2 || "",
        city: data.city,
        region: data.region || "",
        postalCode: data.postalCode || "",
        country: data.country || "US",
        primary: true,
        visibility: data.visibility || existing.visibility || "private"
      },
      correlationId
    });
    return addressDto(updated);
  }
  const address = await createAddress(env, {
    actor: selfActor(context, managed.parishId),
    parishId: managed.parishId,
    ownerType: "household",
    ownerId: householdId,
    addressType: data.addressType || "residential",
    line1: data.line1,
    line2: data.line2 || "",
    city: data.city,
    region: data.region || "",
    postalCode: data.postalCode || "",
    country: data.country || "US",
    primary: Boolean(data.primary),
    protectedAddress: Boolean(data.protectedAddress),
    visibility: data.visibility || "staff",
    correlationId
  });
  return addressDto(address);
}

export async function setSelfServicePrivacyPreference(env, { context, ownerType, ownerId, fieldKey, visibility, publicationEligible = false, correlationId = "" }) {
  const parishId = ownerType === "household"
    ? context.manageableHouseholds.find((household) => household.id === ownerId)?.parishId
    : context.activeParishContexts[0]?.parishId;
  if (!parishId) throw new DirectoryServiceError("forbidden", "You cannot manage this privacy preference.", 403);
  if (ownerType === "person" && ownerId !== context.currentPerson?.id) throw new DirectoryServiceError("forbidden", "You cannot manage another adult's privacy preferences.", 403);
  return setFieldPrivacyPreference(env, {
    actor: selfActor(context, parishId),
    parishId,
    ownerType,
    ownerId,
    fieldKey,
    visibility,
    publicationEligible,
    correlationId
  });
}

export async function transitionSelfServicePublication(env, { context, ownerType, ownerId, status, correlationId = "" }) {
  if (status === "approved") throw new DirectoryServiceError("self_approval_denied", "Self-service users cannot approve publication.", 403);
  const parishId = ownerType === "household"
    ? context.manageableHouseholds.find((household) => household.id === ownerId)?.parishId
    : context.activeParishContexts[0]?.parishId;
  if (!parishId) throw new DirectoryServiceError("forbidden", "You cannot manage this publication profile.", 403);
  if (ownerType === "person" && ownerId !== context.currentPerson?.id) throw new DirectoryServiceError("forbidden", "You cannot publish another adult's person profile.", 403);
  const existing = await getPublicationProfile(env, { parishId, ownerType, ownerId });
  const trustedHouseholdMember = ownerType === "person"
    && await personBelongsToVerifiedHousehold(env, parishId, ownerId);
  const returningToDirectory = status === "pending_approval"
    && (existing.approvalStatus === "approved" || trustedHouseholdMember);
  if (returningToDirectory) {
    let trustedProfile = existing;
    if (!trustedProfile.persisted) {
      trustedProfile = await createPublicationProfile(env, {
        actor: { ...selfActor(context, parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] },
        parishId,
        ownerType,
        ownerId,
        status: "draft",
        correlationId
      });
    }
    if (trustedProfile.status === "draft") {
      trustedProfile = await transitionPublicationProfile(env, {
        actor: selfActor(context, parishId),
        parishId,
        ownerType,
        ownerId,
        status: "pending_approval",
        correlationId
      });
    }
    return transitionPublicationProfile(env, {
      actor: { ...selfActor(context, parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] },
      parishId,
      ownerType,
      ownerId,
      status: "approved",
      correlationId
    });
  }
  return transitionPublicationProfile(env, {
    actor: selfActor(context, parishId),
    parishId,
    ownerType,
    ownerId,
    status,
    correlationId
  });
}

export async function createDirectoryChangeRequest(env, { context, parishId, targetType, targetId, householdId = "", requestType, summary, payload = {}, correlationId = "" }) {
  if (!CHANGE_REQUEST_TYPES.includes(requestType)) throw new DirectoryServiceError("validation_failed", "Change request type is not supported.");
  if (targetType === "person" && targetId !== context.currentPerson?.id && !householdId) {
    throw new DirectoryServiceError("forbidden", "You cannot request changes for this person.", 403);
  }
  if (targetType === "household" && !context.manageableHouseholds.some((household) => household.id === targetId && household.parishId === parishId)) {
    throw new DirectoryServiceError("forbidden", "You cannot request changes for this household.", 403);
  }
  if (householdId && !context.manageableHouseholds.some((household) => household.id === householdId && household.parishId === parishId)) {
    throw new DirectoryServiceError("forbidden", "You cannot request changes for this household.", 403);
  }
  const timestamp = nowMs();
  const id = generateSecret("dir_req");
  const actor = selfActor(context, parishId);
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_change_requests
              (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
               household_id, request_type, status, summary, requested_payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      params: [
        id,
        parishId,
        context.user.id,
        context.currentPerson.id,
        targetType,
        targetId,
        householdId || null,
        requestType,
        cleanText(summary, { required: true, max: 240, field: "summary" }),
        safeJson(payload) || "{}",
        timestamp,
        timestamp
      ]
    },
    auditStatement({
      action: "directory.change_request.created",
      actor,
      parishId,
      targetType: `directory_${targetType}`,
      targetId,
      householdId: householdId || null,
      after: { requestType, summary },
      correlationId
    }),
    await notificationStatement({
      context,
      parishId,
      eventType: "directory.change_request.created",
      targetType: `directory_${targetType}`,
      targetId,
      householdId,
      safeMessage: "Your directory change request was submitted.",
      metadata: { requestType }
    })
  ]);
  return requestDto(await d1First(env, "SELECT * FROM directory_change_requests WHERE id = ?1", id));
}

export async function requestHouseholdChildAdd(env, { context, householdId, data = {}, correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot add children for this household.", 403);
  if (!await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id })) {
    throw new DirectoryServiceError("forbidden", "Only an active household administrator can add children.", 403);
  }
  const preferredName = cleanText(data.preferredName, { required: true, max: 160, field: "preferredName" });
  const legalName = cleanText(data.legalName, { max: 200, field: "legalName" });
  const dateOfBirth = cleanDate(data.dateOfBirth || "", "dateOfBirth") || "";
  const relationshipLabel = cleanText(data.relationship || "child", { max: 80, field: "relationship" }) || "child";
  const existingMember = await d1First(
    env,
    `SELECT p.id FROM directory_household_members hm
      JOIN directory_people p ON p.id = hm.person_id
     WHERE hm.household_id = ?1 AND hm.active = 1 AND p.active = 1
       AND LOWER(p.preferred_name) = LOWER(?2)`,
    managed.id,
    preferredName
  );
  if (existingMember) throw new DirectoryServiceError("duplicate_member", "This child is already in your household.", 409);

  const serviceActor = {
    ...selfActor(context, managed.parishId),
    capabilities: [DIRECTORY_CAPABILITIES.manage]
  };
  const person = await createPerson(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    preferredName,
    legalName,
    dateOfBirth,
    biologicalSex: "unknown",
    notes: ""
  });
  await setPersonPrivacyFlags(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    personId: person.id,
    isChild: true,
    protectedPerson: false,
    correlationId
  });
  const membership = await addHouseholdMember(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    householdId: managed.id,
    personId: person.id,
    relationship: "child"
  });
  return {
    direct: true,
    personId: person.id,
    householdId: managed.id,
    membershipId: membership.id,
    preferredName,
    relationship: relationshipLabel,
    privacy: "private_by_default"
  };
}

export async function requestHouseholdAdultAdd(env, { context, householdId, data = {}, correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot add an adult for this household.", 403);
  if (!await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id })) {
    throw new DirectoryServiceError("forbidden", "Only an active household administrator can add a spouse or other adult.", 403);
  }
  const preferredName = cleanText(data.preferredName, { required: true, max: 160, field: "preferredName" });
  const legalName = cleanText(data.legalName, { max: 200, field: "legalName" });
  const dateOfBirth = cleanDate(data.dateOfBirth || "", "dateOfBirth") || "";
  const relationship = cleanText(data.relationship || "spouse", { max: 80, field: "relationship" }) || "spouse";
  const email = cleanText(data.email || "", { max: 320, field: "email" });
  const note = cleanText(data.note || "", { max: 500, field: "note" });
  const householdVerified = await householdWasParishVerified(env, managed.parishId, managed.id);
  if (householdVerified) {
    const existingMember = await d1First(
      env,
      `SELECT p.id FROM directory_household_members hm
        JOIN directory_people p ON p.id = hm.person_id
       WHERE hm.household_id = ?1 AND hm.active = 1 AND p.active = 1
         AND LOWER(p.preferred_name) = LOWER(?2)`,
      managed.id,
      preferredName
    );
    if (existingMember) throw new DirectoryServiceError("duplicate_member", "This person is already in your household.", 409);
  }
  const duplicate = await d1First(
    env,
    `SELECT id FROM directory_change_requests
      WHERE parish_id = ?1 AND requester_person_id = ?2 AND household_id = ?3
        AND request_type = 'household_membership_add' AND status = 'pending'
        AND json_extract(requested_payload_json, '$.adultAdd.preferredName') = ?4`,
    managed.parishId, context.currentPerson.id, managed.id, preferredName
  );
  if (duplicate) throw new DirectoryServiceError("duplicate_request", "A pending request for this adult is already waiting for parish review.", 409);
  const serviceActor = { ...selfActor(context, managed.parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] };
  const person = await createPerson(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    preferredName,
    legalName,
    dateOfBirth,
    biologicalSex: "unknown",
    notes: note ? `Household adult add request note: ${note}` : ""
  });
  if (email) {
    await createContactMethod(env, {
      actor: serviceActor,
      parishId: managed.parishId,
      ownerType: "person",
      ownerId: person.id,
      contactType: "email",
      value: email,
      label: "personal",
      primary: true,
      visibility: "private",
      correlationId
    });
  }
  if (householdVerified) {
    const membership = await addHouseholdMember(env, {
      actor: serviceActor,
      parishId: managed.parishId,
      householdId: managed.id,
      personId: person.id,
      relationship
    });
    return {
      direct: true,
      personId: person.id,
      householdId: managed.id,
      membershipId: membership.id,
      preferredName,
      relationship,
      accountManaged: true
    };
  }
  return createDirectoryChangeRequest(env, {
    context,
    parishId: managed.parishId,
    targetType: "household",
    targetId: managed.id,
    householdId: managed.id,
    requestType: "household_membership_add",
    summary: `Add ${relationship} to household: ${preferredName}`,
    payload: {
      personId: person.id,
      relationship,
      adultAdd: { preferredName, legalName, dateOfBirth, relationship, email, note }
    },
    correlationId
  });
}

export async function cancelDirectoryChangeRequest(env, { context, requestId, correlationId = "" }) {
  const existing = await d1First(env, "SELECT * FROM directory_change_requests WHERE id = ?1", cleanText(requestId, { required: true, max: 160, field: "requestId" }));
  if (!existing || existing.requester_person_id !== context.currentPerson?.id) throw new DirectoryServiceError("not_found", "Change request was not found.", 404);
  if (existing.status !== "pending") throw new DirectoryServiceError("invalid_transition", "Only pending requests can be cancelled.", 409);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_change_requests SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?",
      params: [timestamp, timestamp, existing.id]
    },
    auditStatement({
      action: "directory.change_request.cancelled",
      actor: selfActor(context, existing.parish_id),
      parishId: existing.parish_id,
      targetType: `directory_${existing.target_type}`,
      targetId: existing.target_id,
      householdId: existing.household_id,
      correlationId
    })
  ]);
  return requestDto(await d1First(env, "SELECT * FROM directory_change_requests WHERE id = ?1", existing.id));
}

export async function createHouseholdAdultInvitation(env, { context, householdId, personId, email = "", phone = "", correlationId = "" }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError("forbidden", "You cannot invite adults for this household.", 403);
  const flags = await getPersonPrivacyFlags(env, { parishId: managed.parishId, personId });
  if (flags.isChild) throw new DirectoryServiceError("child_invitation_denied", "Children cannot be invited to manage a household.", 403);
  if (!await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson.id })) {
    throw new DirectoryServiceError("forbidden", "Only active household administrators can invite another adult.", 403);
  }
  const created = await createDirectoryInvitation(env, {
    actor: selfActor(context, managed.parishId),
    parishId: managed.parishId,
    invitationType: "additional_household_admin",
    intendedPersonId: personId,
    intendedHouseholdId: householdId,
    intendedAuthority: "grant_household_admin",
    recipientEmail: email,
    recipientPhone: phone,
    recipientLabel: "Adult household member",
    correlationId
  });
  const invitation = created.invitation;
  return {
    id: invitation.id,
    invitationType: invitation.invitationType,
    intendedPersonId: invitation.intendedPersonId,
    intendedHouseholdId: invitation.intendedHouseholdId,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    token: created.rawToken
  };
}

export async function resendHouseholdAdultInvitation(env, { context, invitationId, correlationId = "" }) {
  const invitation = await d1First(env, "SELECT * FROM directory_invitations WHERE id = ?1", cleanText(invitationId, { required: true, max: 160, field: "invitationId" }));
  if (!invitation || !context.manageableHouseholds.some((household) => household.id === invitation.intended_household_id && household.parishId === invitation.parish_id)) {
    throw new DirectoryServiceError("not_found", "Invitation was not found.", 404);
  }
  const resent = await resendDirectoryInvitation(env, { actor: selfActor(context, invitation.parish_id), parishId: invitation.parish_id, invitationId, correlationId });
  return { id: resent.invitation.id, status: resent.invitation.status, expiresAt: resent.invitation.expiresAt, token: resent.rawToken };
}

export async function revokeHouseholdAdultInvitation(env, { context, invitationId, correlationId = "" }) {
  const invitation = await d1First(env, "SELECT * FROM directory_invitations WHERE id = ?1", cleanText(invitationId, { required: true, max: 160, field: "invitationId" }));
  if (!invitation || !context.manageableHouseholds.some((household) => household.id === invitation.intended_household_id && household.parishId === invitation.parish_id)) {
    throw new DirectoryServiceError("not_found", "Invitation was not found.", 404);
  }
  const revoked = await revokeDirectoryInvitation(env, { actor: selfActor(context, invitation.parish_id), parishId: invitation.parish_id, invitationId, correlationId });
  return { id: revoked.id, status: revoked.status };
}
