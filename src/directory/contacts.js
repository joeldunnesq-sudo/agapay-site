import { d1All, d1First, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { evaluateFieldPolicy } from "./privacy.js";
import {
  assertCanManageOwner,
  assertOwnerInParish,
  assertVisibility,
  auditStatement,
  boolToInt,
  cleanText,
  maskValue,
  normalizeOwner,
  nowMs,
  runAtomic
} from "./shared.js";

const EMAIL_LABELS = new Set(["personal", "work", "household", "other"]);
const PHONE_LABELS = new Set(["mobile", "home", "work", "household", "other"]);
const ADDRESS_TYPES = new Set(["residential", "mailing", "alternate"]);

export function normalizeEmailValue(value) {
  const cleaned = cleanText(value, { required: true, max: 320, field: "email" }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw new DirectoryServiceError("validation_failed", "Email address is invalid.");
  return cleaned;
}

export function normalizePhoneValue(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new DirectoryServiceError("validation_failed", "Phone number is invalid.");
  return digits;
}

function normalizeContactLabel(type, label) {
  const cleaned = (cleanText(label, { max: 40 }) || (type === "email" ? "personal" : "mobile")).toLowerCase();
  const allowed = type === "email" ? EMAIL_LABELS : PHONE_LABELS;
  if (!allowed.has(cleaned)) throw new DirectoryServiceError("validation_failed", "Contact label is not supported.");
  return cleaned;
}

function contactFieldKey(type) {
  return type === "email" ? "adult_email" : "adult_phone";
}

function rowToContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    contactType: row.contact_type,
    label: row.label,
    value: row.value,
    normalizedValue: row.normalized_value,
    primary: Number(row.is_primary || 0) === 1,
    verified: Number(row.verified || 0) === 1,
    smsCapable: row.sms_capable === null || row.sms_capable === undefined ? null : Number(row.sms_capable) === 1,
    visibility: row.visibility,
    active: Number(row.active || 0) === 1,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

function rowToAddress(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    addressType: row.address_type,
    line1: row.line1,
    line2: row.line2 || "",
    city: row.city,
    region: row.region || "",
    postalCode: row.postal_code || "",
    country: row.country || "US",
    normalizedValue: row.normalized_value,
    primary: Number(row.is_primary || 0) === 1,
    protectedAddress: Number(row.protected_address || 0) === 1,
    visibility: row.visibility,
    active: Number(row.active || 0) === 1,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

export async function createContactMethod(env, { actor: actorInput, parishId, ownerType, ownerId, contactType, value, label = "", primary = false, verified = false, smsCapable = null, visibility = "private", correlationId = "" }) {
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const owner = normalizeOwner(ownerType, ownerId);
  await assertOwnerInParish(env, { ...owner, parishId: cleanedParishId });
  const actor = await assertCanManageOwner(env, actorInput, { parishId: cleanedParishId, ...owner });
  const type = cleanText(contactType, { required: true, max: 20, field: "contactType" }).toLowerCase();
  if (!["email", "phone"].includes(type)) throw new DirectoryServiceError("validation_failed", "Contact type is not supported.");
  const normalized = type === "email" ? normalizeEmailValue(value) : normalizePhoneValue(value);
  const cleanedValue = cleanText(value, { required: true, max: 320, field: "value" });
  const cleanedLabel = normalizeContactLabel(type, label);
  const requestedVisibility = assertVisibility(visibility);
  const policy = await evaluateFieldPolicy(env, {
    parishId: cleanedParishId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    fieldKey: contactFieldKey(type),
    requestedVisibility,
    publicationEligible: requestedVisibility === "directory_members"
  });
  if (policy.visibility !== requestedVisibility) throw new DirectoryServiceError("privacy_policy_denied", "Requested contact visibility is not permitted.", 403);
  const timestamp = nowMs();
  const id = generateSecret("dir_contact");
  const statements = [];
  if (primary) {
    statements.push({
      sql: "UPDATE directory_contact_methods SET is_primary = 0, updated_at = ? WHERE owner_type = ? AND owner_id = ? AND contact_type = ? AND active = 1",
      params: [timestamp, owner.ownerType, owner.ownerId, type]
    });
  }
  statements.push({
    sql: `INSERT INTO directory_contact_methods
            (id, parish_id, owner_type, owner_id, contact_type, label, value, normalized_value,
             is_primary, verified, sms_capable, visibility, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    params: [
      id, cleanedParishId, owner.ownerType, owner.ownerId, type, cleanedLabel, cleanedValue, normalized,
      boolToInt(primary), boolToInt(verified), smsCapable === null ? null : boolToInt(smsCapable), requestedVisibility, timestamp, timestamp
    ]
  });
  if (primary) {
    statements.push(auditStatement({
      action: "directory.primary_contact_changed",
      actor,
      parishId: cleanedParishId,
      targetType: "directory_contact_method",
      targetId: id,
      after: { ownerType: owner.ownerType, contactType: type },
      correlationId
    }));
  }
  statements.push(auditStatement({
    action: "directory.contact_created",
    actor,
    parishId: cleanedParishId,
    targetType: "directory_contact_method",
    targetId: id,
    after: { ownerType: owner.ownerType, contactType: type, label: cleanedLabel, maskedValue: maskValue(cleanedValue, type), visibility: requestedVisibility },
    correlationId
  }));
  await runAtomic(env, statements);
  return rowToContact(await d1First(env, "SELECT * FROM directory_contact_methods WHERE id = ?1", id));
}

export async function updateContactMethod(env, { actor: actorInput, parishId, contactId, patch = {}, correlationId = "" }) {
  const existing = await d1First(env, "SELECT * FROM directory_contact_methods WHERE id = ?1", cleanText(contactId, { required: true, max: 160, field: "contactId" }));
  if (!existing) throw new DirectoryServiceError("not_found", "Directory contact method was not found.", 404);
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  if (existing.parish_id !== cleanedParishId) throw new DirectoryServiceError("not_found", "Directory contact method was not found for this parish.", 404);
  const actor = await assertCanManageOwner(env, actorInput, { parishId: cleanedParishId, ownerType: existing.owner_type, ownerId: existing.owner_id });
  const next = rowToContact(existing);
  if ("label" in patch) next.label = normalizeContactLabel(next.contactType, patch.label);
  if ("visibility" in patch) next.visibility = assertVisibility(patch.visibility);
  if ("verified" in patch) next.verified = Boolean(patch.verified);
  if ("smsCapable" in patch) next.smsCapable = patch.smsCapable === null ? null : Boolean(patch.smsCapable);
  if ("primary" in patch) next.primary = Boolean(patch.primary);
  if ("active" in patch) next.active = Boolean(patch.active);
  const policy = await evaluateFieldPolicy(env, {
    parishId: cleanedParishId,
    ownerType: existing.owner_type,
    ownerId: existing.owner_id,
    fieldKey: contactFieldKey(existing.contact_type),
    requestedVisibility: next.visibility,
    publicationEligible: next.visibility === "directory_members"
  });
  if (policy.visibility !== next.visibility) throw new DirectoryServiceError("privacy_policy_denied", "Requested contact visibility is not permitted.", 403);
  const timestamp = nowMs();
  const statements = [];
  if (next.primary) {
    statements.push({
      sql: "UPDATE directory_contact_methods SET is_primary = 0, updated_at = ? WHERE owner_type = ? AND owner_id = ? AND contact_type = ? AND active = 1",
      params: [timestamp, existing.owner_type, existing.owner_id, existing.contact_type]
    });
  }
  statements.push({
    sql: `UPDATE directory_contact_methods
          SET label = ?, is_primary = ?, verified = ?, sms_capable = ?, visibility = ?, active = ?, updated_at = ?
          WHERE id = ?`,
    params: [next.label, boolToInt(next.primary), boolToInt(next.verified), next.smsCapable === null ? null : boolToInt(next.smsCapable), next.visibility, boolToInt(next.active, true), timestamp, existing.id]
  });
  statements.push(auditStatement({
    action: next.active ? "directory.contact_updated" : "directory.contact_deactivated",
    actor,
    parishId: cleanedParishId,
    targetType: "directory_contact_method",
    targetId: existing.id,
    before: { visibility: existing.visibility, primary: Boolean(existing.is_primary), maskedValue: maskValue(existing.value, existing.contact_type) },
    after: { visibility: next.visibility, primary: next.primary, active: next.active },
    correlationId
  }));
  await runAtomic(env, statements);
  return rowToContact(await d1First(env, "SELECT * FROM directory_contact_methods WHERE id = ?1", existing.id));
}

export async function deactivateContactMethod(env, args) {
  return updateContactMethod(env, { ...args, patch: { active: false } });
}

function normalizeAddressValue({ line1, line2 = "", city, region = "", postalCode = "", country = "US" }) {
  return [line1, line2, city, region, postalCode, country].map((part) => String(part || "").trim().toLowerCase()).join("|");
}

export async function createAddress(env, { actor: actorInput, parishId, ownerType, ownerId, addressType = "residential", line1, line2 = "", city, region = "", postalCode = "", country = "US", primary = false, protectedAddress = false, visibility = "staff", correlationId = "" }) {
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const owner = normalizeOwner(ownerType, ownerId);
  await assertOwnerInParish(env, { ...owner, parishId: cleanedParishId });
  const actor = await assertCanManageOwner(env, actorInput, { parishId: cleanedParishId, ...owner });
  const type = cleanText(addressType, { required: true, max: 40, field: "addressType" }).toLowerCase();
  if (!ADDRESS_TYPES.has(type)) throw new DirectoryServiceError("validation_failed", "Address type is not supported.");
  const address = {
    line1: cleanText(line1, { required: true, max: 200, field: "line1" }),
    line2: cleanText(line2, { max: 200 }),
    city: cleanText(city, { required: true, max: 120, field: "city" }),
    region: cleanText(region, { max: 120 }),
    postalCode: cleanText(postalCode, { max: 40 }),
    country: cleanText(country, { required: true, max: 2, field: "country" }).toUpperCase()
  };
  const requestedVisibility = assertVisibility(visibility);
  const policy = await evaluateFieldPolicy(env, {
    parishId: cleanedParishId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    fieldKey: "street_address",
    requestedVisibility,
    publicationEligible: false,
    protectedAddress
  });
  if (policy.visibility !== requestedVisibility) throw new DirectoryServiceError("privacy_policy_denied", "Requested address visibility is not permitted.", 403);
  const timestamp = nowMs();
  const id = generateSecret("dir_addr");
  const statements = [];
  if (primary) {
    statements.push({
      sql: "UPDATE directory_addresses SET is_primary = 0, updated_at = ? WHERE owner_type = ? AND owner_id = ? AND address_type = ? AND active = 1",
      params: [timestamp, owner.ownerType, owner.ownerId, type]
    });
  }
  statements.push({
    sql: `INSERT INTO directory_addresses
            (id, parish_id, owner_type, owner_id, address_type, line1, line2, city, region, postal_code,
             country, normalized_value, is_primary, protected_address, visibility, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    params: [
      id, cleanedParishId, owner.ownerType, owner.ownerId, type, address.line1, address.line2, address.city,
      address.region, address.postalCode, address.country, normalizeAddressValue(address), boolToInt(primary),
      boolToInt(protectedAddress), requestedVisibility, timestamp, timestamp
    ]
  });
  if (protectedAddress) {
    statements.push(auditStatement({
      action: "directory.address_protected",
      actor,
      parishId: cleanedParishId,
      targetType: "directory_address",
      targetId: id,
      after: { ownerType: owner.ownerType, maskedValue: maskValue(address.line1, "address") },
      correlationId
    }));
  }
  statements.push(auditStatement({
    action: "directory.contact_created",
    actor,
    parishId: cleanedParishId,
    targetType: "directory_address",
    targetId: id,
    after: { ownerType: owner.ownerType, addressType: type, maskedValue: maskValue(address.line1, "address"), protectedAddress: Boolean(protectedAddress), visibility: requestedVisibility },
    correlationId
  }));
  await runAtomic(env, statements);
  return rowToAddress(await d1First(env, "SELECT * FROM directory_addresses WHERE id = ?1", id));
}

export async function listActiveContactsForOwner(env, { parishId, ownerType, ownerId }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const rows = await d1All(
    env,
    "SELECT * FROM directory_contact_methods WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND active = 1 ORDER BY is_primary DESC, created_at ASC",
    parishId, owner.ownerType, owner.ownerId
  );
  return rows.map(rowToContact);
}

export async function listActiveAddressesForOwner(env, { parishId, ownerType, ownerId }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const rows = await d1All(
    env,
    "SELECT * FROM directory_addresses WHERE parish_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND active = 1 ORDER BY is_primary DESC, created_at ASC",
    parishId, owner.ownerType, owner.ownerId
  );
  return rows.map(rowToAddress);
}
