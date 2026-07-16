import { d1First } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import {
  assertParishActor,
  auditStatement,
  boolToInt,
  cleanText,
  DIRECTORY_CAPABILITIES,
  nowMs,
  runAtomic,
  assertVisibility,
  VISIBILITY_RANK
} from "./shared.js";

export const DEFAULT_DIRECTORY_SETTINGS = Object.freeze({
  directoryEnabled: false,
  publicationApprovalRequired: true,
  childNamesAllowed: false,
  childPhotosAllowed: false,
  addressMaxVisibility: "staff",
  contactMaxVisibility: "directory_members",
  ordinaryMemberAccessEnabled: false,
  clergyStaffAccessPolicy: "capability_required",
  reconfirmationIntervalDays: 365,
  defaultHouseholdPublicationStatus: "draft"
});

function rowToSettings(row, parishId) {
  if (!row) return { parishId, ...DEFAULT_DIRECTORY_SETTINGS, persisted: false };
  return {
    parishId: row.parish_id,
    directoryEnabled: Number(row.directory_enabled || 0) === 1,
    publicationApprovalRequired: Number(row.publication_approval_required || 0) === 1,
    childNamesAllowed: Number(row.child_names_allowed || 0) === 1,
    childPhotosAllowed: Number(row.child_photos_allowed || 0) === 1,
    addressMaxVisibility: row.address_max_visibility,
    contactMaxVisibility: row.contact_max_visibility,
    ordinaryMemberAccessEnabled: Number(row.ordinary_member_access_enabled || 0) === 1,
    clergyStaffAccessPolicy: row.clergy_staff_access_policy,
    reconfirmationIntervalDays: Number(row.reconfirmation_interval_days || 365),
    defaultHouseholdPublicationStatus: row.default_household_publication_status,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    persisted: true
  };
}

export async function getDirectorySettings(env, parishId) {
  const cleanedParishId = cleanText(parishId, { required: true, max: 160, field: "parishId" });
  const row = await d1First(env, "SELECT * FROM directory_parish_settings WHERE parish_id = ?1", cleanedParishId);
  return rowToSettings(row, cleanedParishId);
}

function normalizeSettingsPatch(patch = {}) {
  const out = {};
  if ("directoryEnabled" in patch) out.directoryEnabled = Boolean(patch.directoryEnabled);
  if ("publicationApprovalRequired" in patch) out.publicationApprovalRequired = patch.publicationApprovalRequired !== false;
  if ("childNamesAllowed" in patch) out.childNamesAllowed = false; // Platform safety: Phase 1B cannot weaken child defaults.
  if ("childPhotosAllowed" in patch) out.childPhotosAllowed = false;
  if ("ordinaryMemberAccessEnabled" in patch) out.ordinaryMemberAccessEnabled = Boolean(patch.ordinaryMemberAccessEnabled);
  if ("addressMaxVisibility" in patch) {
    const visibility = assertVisibility(patch.addressMaxVisibility);
    if (VISIBILITY_RANK[visibility] > VISIBILITY_RANK.staff) {
      throw new DirectoryServiceError("unsafe_setting", "Address maximum visibility cannot exceed staff in Phase 1B.", 400);
    }
    out.addressMaxVisibility = visibility;
  }
  if ("contactMaxVisibility" in patch) out.contactMaxVisibility = assertVisibility(patch.contactMaxVisibility);
  if ("reconfirmationIntervalDays" in patch) {
    out.reconfirmationIntervalDays = Math.max(30, Math.min(1095, Number(patch.reconfirmationIntervalDays) || 365));
  }
  if ("defaultHouseholdPublicationStatus" in patch) {
    const status = cleanText(patch.defaultHouseholdPublicationStatus, { required: true, max: 40, field: "defaultHouseholdPublicationStatus" });
    if (!["not_configured", "draft", "pending_approval"].includes(status)) {
      throw new DirectoryServiceError("validation_failed", "Default household publication status is not supported.");
    }
    out.defaultHouseholdPublicationStatus = status;
  }
  return out;
}

export async function updateDirectorySettings(env, { actor: actorInput, parishId, patch = {}, correlationId = "" }) {
  const cleanedParishId = cleanText(parishId || actorInput?.parishId, { required: true, max: 160, field: "parishId" });
  const actor = assertParishActor(actorInput, cleanedParishId, [DIRECTORY_CAPABILITIES.settingsManage, DIRECTORY_CAPABILITIES.manage]);
  const before = await getDirectorySettings(env, cleanedParishId);
  const normalized = normalizeSettingsPatch(patch);
  const next = { ...before, ...normalized, persisted: true };
  const timestamp = nowMs();

  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_parish_settings (
              parish_id, directory_enabled, publication_approval_required,
              child_names_allowed, child_photos_allowed, address_max_visibility,
              contact_max_visibility, ordinary_member_access_enabled,
              clergy_staff_access_policy, reconfirmation_interval_days,
              default_household_publication_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'capability_required', ?, ?, ?, ?)
            ON CONFLICT(parish_id) DO UPDATE SET
              directory_enabled = excluded.directory_enabled,
              publication_approval_required = excluded.publication_approval_required,
              child_names_allowed = excluded.child_names_allowed,
              child_photos_allowed = excluded.child_photos_allowed,
              address_max_visibility = excluded.address_max_visibility,
              contact_max_visibility = excluded.contact_max_visibility,
              ordinary_member_access_enabled = excluded.ordinary_member_access_enabled,
              reconfirmation_interval_days = excluded.reconfirmation_interval_days,
              default_household_publication_status = excluded.default_household_publication_status,
              updated_at = excluded.updated_at`,
      params: [
        cleanedParishId,
        boolToInt(next.directoryEnabled),
        boolToInt(next.publicationApprovalRequired, true),
        0,
        0,
        next.addressMaxVisibility,
        next.contactMaxVisibility,
        boolToInt(next.ordinaryMemberAccessEnabled),
        next.reconfirmationIntervalDays,
        next.defaultHouseholdPublicationStatus,
        timestamp,
        timestamp
      ]
    },
    auditStatement({
      action: "directory.parish_settings_changed",
      actor,
      parishId: cleanedParishId,
      targetType: "directory_parish_settings",
      targetId: cleanedParishId,
      before: {
        directoryEnabled: before.directoryEnabled,
        addressMaxVisibility: before.addressMaxVisibility,
        childNamesAllowed: before.childNamesAllowed
      },
      after: {
        directoryEnabled: next.directoryEnabled,
        addressMaxVisibility: next.addressMaxVisibility,
        childNamesAllowed: false
      },
      correlationId
    })
  ]);

  return getDirectorySettings(env, cleanedParishId);
}
