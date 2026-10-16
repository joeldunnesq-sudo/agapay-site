import type { SkillContext, SkillSqlRow, SkillInput } from './skills-service-contracts.js';
import {
  SKILL_POLICY_VERSION,
  parishIdFor,
  actorFromContext,
  featureSettings,
  d1First,
  householdVerificationStatus,
  DirectoryServiceError,
  assertParishActor,
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  nowMs,
  runAtomic,
} from './skills-service-shared.js';
import './skills-service.js';
import './skills-exports.js';

export async function updateSkillsSettings(
  env: Partial<Env>,
  { context, patch = {}, correlationId = '' }: { context: SkillContext; patch?: SkillInput; correlationId?: string }
) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), [
    DIRECTORY_CAPABILITIES.settingsManage,
    DIRECTORY_CAPABILITIES.skillsManage,
    DIRECTORY_CAPABILITIES.manage,
  ]);
  const parishId = parishIdFor(context);
  const before = await featureSettings(env, parishId);
  const next = {
    skillsDirectoryEnabled:
      'skillsDirectoryEnabled' in patch ? Boolean(patch.skillsDirectoryEnabled) : before.skillsDirectoryEnabled,
    skillsMemberSearchEnabled:
      'skillsMemberSearchEnabled' in patch
        ? Boolean(patch.skillsMemberSearchEnabled)
        : before.skillsMemberSearchEnabled,
    skillsStaffOnlyMode:
      'skillsStaffOnlyMode' in patch ? Boolean(patch.skillsStaffOnlyMode) : before.skillsStaffOnlyMode,
    skillsCustomEntriesEnabled:
      'skillsCustomEntriesEnabled' in patch
        ? Boolean(patch.skillsCustomEntriesEnabled)
        : before.skillsCustomEntriesEnabled,
    skillsDisclaimerText: cleanText(patch.skillsDisclaimerText ?? before.skillsDisclaimerText, {
      required: true,
      max: 700,
      field: 'skillsDisclaimerText',
    }),
    skillsContactFallback: cleanText(patch.skillsContactFallback ?? before.skillsContactFallback, {
      required: true,
      max: 240,
      field: 'skillsContactFallback',
    }),
    householdVerificationIntervalDays: Math.max(
      30,
      Math.min(1095, Number(patch.householdVerificationIntervalDays ?? before.householdVerificationIntervalDays) || 365)
    ),
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
      params: [
        parishId,
        next.skillsDirectoryEnabled ? 1 : 0,
        next.skillsMemberSearchEnabled ? 1 : 0,
        next.skillsStaffOnlyMode ? 1 : 0,
        next.skillsCustomEntriesEnabled ? 1 : 0,
        next.skillsDisclaimerText,
        next.skillsContactFallback,
        timestamp,
        next.householdVerificationIntervalDays,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.skills.settings_changed',
      actor,
      parishId,
      targetType: 'directory_parish_settings',
      targetId: parishId,
      before,
      after: next,
      correlationId,
    }),
  ]);
  return featureSettings(env, parishId);
}

export async function getHouseholdVerificationStatus(
  env: Partial<Env>,
  { context, householdId }: { context: SkillContext; householdId: unknown }
) {
  const household = context.manageableHouseholds?.find((item) => item.id === householdId);
  if (!household) throw new DirectoryServiceError('forbidden', 'You cannot verify this household.', 403);
  const settings = await featureSettings(env, household.parishId);
  const row = await d1First<SkillSqlRow>(
    env,
    'SELECT * FROM directory_household_verifications WHERE household_id = ?1 AND parish_id = ?2',
    householdId,
    household.parishId
  );
  const timestamp = nowMs();
  const dueAt = row?.verification_due_at || timestamp;
  const status = householdVerificationStatus(row, timestamp);
  return {
    householdId,
    parishId: household.parishId,
    status,
    dueAt: Number(dueAt),
    lastVerifiedAt: Number(row?.last_verified_at || 0),
    policyVersion: row?.verification_policy_version || SKILL_POLICY_VERSION,
    intervalDays: settings.householdVerificationIntervalDays,
  };
}

export async function completeHouseholdVerification(
  env: Partial<Env>,
  {
    context,
    householdId,
    reconfirmSkills = false,
    correlationId = '',
  }: { context: SkillContext; householdId: unknown; reconfirmSkills?: boolean; correlationId?: string }
) {
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
      params: [
        householdId,
        current.parishId,
        timestamp + interval * 86400000,
        timestamp,
        timestamp,
        context.user!.id,
        SKILL_POLICY_VERSION,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.household_verification.completed',
      actor,
      parishId: current.parishId,
      targetType: 'directory_household',
      targetId: householdId as string,
      metadata: { reconfirmSkills: Boolean(reconfirmSkills) },
      correlationId,
    }),
  ];
  if (reconfirmSkills && context.currentPerson?.id) {
    statements.push({
      sql: "UPDATE directory_person_skill_listings SET consent_recorded_at = ?1, updated_at = ?1, version = version + 1 WHERE parish_id = ?2 AND person_id = ?3 AND status = 'active'",
      params: [timestamp, current.parishId, context.currentPerson!.id],
    });
  }
  await runAtomic(env, statements);
  return getHouseholdVerificationStatus(env, { context, householdId });
}
