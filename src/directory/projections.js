import { d1All, d1First } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { listActiveAddressesForOwner, listActiveContactsForOwner } from "./contacts.js";
import { getPersonPrivacyFlags, evaluateFieldPolicy } from "./privacy.js";
import { getPublicationProfile, publicationPermitsOrdinaryProjection } from "./publication.js";
import {
  actorManagesOwner,
  assertParishActor,
  cleanText,
  DIRECTORY_CAPABILITIES,
  hasAnyCapability,
  loadHouseholdForParish,
  loadPersonForParish,
  normalizeActor,
  visibilityAllowedForAudience
} from "./shared.js";

const PROJECTION_TYPES = new Set([
  "household_summary",
  "household_detail",
  "person_summary",
  "person_detail",
  "parish_staff_detail",
  "household_self_management_detail"
]);

function publicHousehold(row) {
  return {
    displayName: row.display_name,
    active: Number(row.active || 0) === 1
  };
}

function publicPerson(row) {
  return {
    preferredName: row.preferred_name,
    active: Number(row.active || 0) === 1,
    deceased: Number(row.deceased || 0) === 1
  };
}

async function hasActiveAffiliation(env, { parishId, personId }) {
  const row = await d1First(
    env,
    "SELECT id FROM directory_parish_affiliations WHERE parish_id = ?1 AND person_id = ?2 AND active = 1 AND status != 'former_member'",
    parishId,
    personId
  );
  return Boolean(row);
}

async function listHouseholdMembers(env, { parishId, householdId }) {
  const rows = await d1All(
    env,
    `SELECT p.*, hm.relationship FROM directory_household_members hm
     JOIN directory_people p ON p.id = hm.person_id
     JOIN directory_households h ON h.id = hm.household_id
     WHERE h.parish_id = ?1 AND hm.household_id = ?2 AND hm.active = 1 AND p.active = 1
     ORDER BY p.preferred_name ASC`,
    parishId,
    householdId
  );
  return rows;
}

async function projectContacts(env, { parishId, ownerType, ownerId, audience }) {
  const rows = await listActiveContactsForOwner(env, { parishId, ownerType, ownerId });
  const projected = [];
  for (const contact of rows) {
    const policy = await evaluateFieldPolicy(env, {
      parishId,
      ownerType,
      ownerId,
      fieldKey: contact.contactType === "email" ? "adult_email" : "adult_phone",
      requestedVisibility: contact.visibility,
      publicationEligible: contact.visibility === "directory_members"
    });
    if (visibilityAllowedForAudience(policy.visibility, audience)) {
      projected.push({
        type: contact.contactType,
        label: contact.label,
        value: contact.value,
        primary: contact.primary,
        verified: contact.verified,
        smsCapable: contact.smsCapable,
        visibility: policy.visibility
      });
    }
  }
  return projected;
}

async function projectAddresses(env, { parishId, ownerType, ownerId, audience }) {
  const rows = await listActiveAddressesForOwner(env, { parishId, ownerType, ownerId });
  const projected = [];
  for (const address of rows) {
    const policy = await evaluateFieldPolicy(env, {
      parishId,
      ownerType,
      ownerId,
      fieldKey: address.protectedAddress ? "street_address" : "city_state",
      requestedVisibility: address.visibility,
      publicationEligible: false,
      protectedAddress: address.protectedAddress
    });
    if (!visibilityAllowedForAudience(policy.visibility, audience)) continue;
    const includeStreet = audience === "staff" || audience === "self";
    projected.push({
      type: address.addressType,
      city: address.city,
      region: address.region,
      country: address.country,
      primary: address.primary,
      protectedAddress: address.protectedAddress,
      visibility: policy.visibility,
      ...(includeStreet ? {
        line1: address.line1,
        line2: address.line2,
        postalCode: address.postalCode
      } : {})
    });
  }
  return projected;
}

async function ordinaryProjectionAllowed(env, { parishId, ownerType, ownerId, actor }) {
  if (!hasAnyCapability(actor, [DIRECTORY_CAPABILITIES.view, DIRECTORY_CAPABILITIES.manage])) return false;
  return publicationPermitsOrdinaryProjection(env, { parishId, ownerType, ownerId });
}

async function audienceForProjection(env, { actor, parishId, projectionType, ownerType, ownerId }) {
  const normalized = normalizeActor(actor);
  if (!normalized.userId || normalized.parishId !== parishId) throw new DirectoryServiceError("forbidden", "Directory viewer is not scoped to this parish.", 403);
  if (projectionType === "parish_staff_detail") {
    assertParishActor(normalized, parishId, [DIRECTORY_CAPABILITIES.privateContactView, DIRECTORY_CAPABILITIES.manage]);
    return "staff";
  }
  if (projectionType === "household_self_management_detail") {
    if (!await actorManagesOwner(env, normalized, { parishId, ownerType, ownerId })) {
      throw new DirectoryServiceError("forbidden", "Viewer cannot manage this household.", 403);
    }
    return "self";
  }
  if (!await ordinaryProjectionAllowed(env, { parishId, ownerType, ownerId, actor: normalized })) {
    throw new DirectoryServiceError("not_publishable", "Directory projection is not publishable for this viewer.", 403);
  }
  return "directory_members";
}

export async function projectDirectoryRecord(env, { actor: actorInput, parishId, targetType, targetId, projectionType, correlationId = "" }) {
  void correlationId;
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const type = cleanText(projectionType, { required: true, max: 80, field: "projectionType" });
  if (!PROJECTION_TYPES.has(type)) throw new DirectoryServiceError("validation_failed", "Projection type is not supported.");
  const ownerType = cleanText(targetType, { required: true, max: 40, field: "targetType" });
  const ownerId = cleanText(targetId, { required: true, max: 160, field: "targetId" });
  if (!["person", "household"].includes(ownerType)) throw new DirectoryServiceError("validation_failed", "Projection target type is not supported.");
  const audience = await audienceForProjection(env, { actor: actorInput, parishId: cleanedParishId, projectionType: type, ownerType, ownerId });

  if (ownerType === "household") {
    const household = await loadHouseholdForParish(env, ownerId, cleanedParishId);
    if (!household.active || type !== "household_self_management_detail" && type !== "parish_staff_detail" && !await ordinaryProjectionAllowed(env, { parishId: cleanedParishId, ownerType, ownerId, actor: actorInput })) {
      throw new DirectoryServiceError("not_publishable", "Household is not publishable.", 403);
    }
    const projection = {
      type,
      household: publicHousehold(household),
      publication: await getPublicationProfile(env, { parishId: cleanedParishId, ownerType, ownerId })
    };
    if (["household_detail", "household_self_management_detail", "parish_staff_detail"].includes(type)) {
      projection.contacts = await projectContacts(env, { parishId: cleanedParishId, ownerType, ownerId, audience });
      projection.addresses = await projectAddresses(env, { parishId: cleanedParishId, ownerType, ownerId, audience });
      const members = await listHouseholdMembers(env, { parishId: cleanedParishId, householdId: ownerId });
      projection.members = [];
      for (const member of members) {
        const flags = await getPersonPrivacyFlags(env, { parishId: cleanedParishId, personId: member.id });
        if ((flags.isChild || flags.protectedPerson) && audience !== "staff" && audience !== "self") continue;
        projection.members.push({
          person: publicPerson(member),
          ...(audience === "staff" || audience === "self" ? { relationship: member.relationship } : {})
        });
      }
    }
    return projection;
  }

  const person = await loadPersonForParish(env, ownerId, cleanedParishId);
  const flags = await getPersonPrivacyFlags(env, { parishId: cleanedParishId, personId: ownerId });
  if ((flags.isChild || flags.protectedPerson) && audience === "directory_members") {
    throw new DirectoryServiceError("not_publishable", "Protected person is not publishable.", 403);
  }
  if (audience === "directory_members" && !await hasActiveAffiliation(env, { parishId: cleanedParishId, personId: ownerId })) {
    throw new DirectoryServiceError("not_publishable", "Inactive parish affiliation is not publishable.", 403);
  }
  const projection = {
    type,
    person: publicPerson(person),
    publication: await getPublicationProfile(env, { parishId: cleanedParishId, ownerType, ownerId })
  };
  if (["person_detail", "parish_staff_detail"].includes(type)) {
    projection.contacts = await projectContacts(env, { parishId: cleanedParishId, ownerType, ownerId, audience });
    projection.addresses = await projectAddresses(env, { parishId: cleanedParishId, ownerType, ownerId, audience });
  }
  return projection;
}
