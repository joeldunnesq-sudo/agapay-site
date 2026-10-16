// Generated from src/directory/skills-service-shared.ts by npm run build:server. Do not edit.
import { d1All, d1First, generateSecret } from '../lib/core.js';
import { householdVerificationStatus } from '../lib/household-verification.js';
import { DirectoryServiceError } from './foundation.js';
import { getDirectorySettings } from './settings.js';
import { getPersonPrivacyFlags } from './privacy.js';
import {
  assertParishActor,
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  nowMs,
  runAtomic,
  safeJson,
} from './shared.js';
const SKILL_POLICY_VERSION = 'phase5b-v1';
const SKILL_DISCLAIMER =
  'Skills and experience are self-reported. AGAPAY and the parish do not verify licenses, credentials, insurance, background checks, or suitability.';
const CATEGORIES = Object.freeze([
  'home_and_repairs',
  'transportation',
  'hospitality_and_food',
  'education_and_tutoring',
  'technology',
  'language_and_translation',
  'professional_knowledge',
  'care_and_assistance',
  'arts_and_media',
  'parish_service',
  'agriculture_and_outdoors',
  'other',
]);
const EXPERIENCE = Object.freeze(['willing_to_help', 'experienced', 'professional', 'retired_professional', 'other']);
const SERVICE_MODES = Object.freeze([
  'parish_projects',
  'informal_parishioner_help',
  'advice_or_guidance',
  'transportation',
  'teaching_or_tutoring',
  'emergency_assistance',
  'professional_services',
  'other',
]);
const CONTACT_PREFS = Object.freeze([
  'published_email',
  'published_phone',
  'parish_office',
  'ask_in_person',
  'no_direct_contact',
]);
const VISIBILITIES = Object.freeze(['private', 'parish_staff', 'directory_members']);
const STATUSES = Object.freeze(['draft', 'active', 'paused', 'hidden_by_parish', 'withdrawn', 'archived']);
const MANAGE_CAPS = [DIRECTORY_CAPABILITIES.skillsManage, DIRECTORY_CAPABILITIES.manage];
const VIEW_CAPS = [
  DIRECTORY_CAPABILITIES.skillsView,
  DIRECTORY_CAPABILITIES.skillsManage,
  DIRECTORY_CAPABILITIES.manage,
];
const CATALOG_CAPS = [
  DIRECTORY_CAPABILITIES.skillsCatalogManage,
  DIRECTORY_CAPABILITIES.skillsManage,
  DIRECTORY_CAPABILITIES.manage,
];
function parishIdFor(context) {
  return (
    context.parishId || context.activeParishContexts?.[0]?.parishId || context.manageableHouseholds?.[0]?.parishId || ''
  );
}
function actorFromContext(context, capabilities = []) {
  return {
    userId: context.user.id,
    actorType: context.actorType || 'platform_user',
    parishId: parishIdFor(context),
    personId: context.personId || context.currentPerson?.id || '',
    capabilities: context.capabilities || capabilities,
  };
}
function enumValue(value, allowed, field, fallback = '') {
  const cleaned = cleanText(value || fallback, { required: !fallback, max: 100, field });
  if (!allowed.includes(cleaned)) throw new DirectoryServiceError('validation_failed', `${field} is not supported.`);
  return cleaned;
}
function normalizeQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}
function limitFor(value) {
  return Math.max(1, Math.min(Number(value) || 24, 50));
}
function offsetFor(cursor = '') {
  const value = Number(String(cursor || '0').replace(/\D/g, ''));
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function nextCursor(offset, limit, count) {
  return count > limit ? String(offset + limit) : '';
}
function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function timestampSlug() {
  return /* @__PURE__ */ new Date().toISOString().replace(/[:.]/g, '-');
}
function skillDto(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || '',
    category: row.category,
    platformDefault: Number(row.is_platform_default || 0) === 1,
    parishId: row.parish_id || '',
    active: Number(row.is_active || 0) === 1,
    sortOrder: Number(row.sort_order || 100),
    version: String(row.version || 1),
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
    availabilityNote: row.availability_note || '',
    contactPreference: row.contact_preference,
    visibility: row.visibility,
    status: row.status,
    consentRecordedAt: Number(row.consent_recorded_at || 0),
    consentWithdrawnAt: Number(row.consent_withdrawn_at || 0),
    version: String(row.version || 1),
  };
  if (includePerson) {
    base.person = { id: row.person_id, displayName: row.preferred_name || 'Parish member' };
  }
  if (contact) base.contact = contact;
  if (includeAdmin) {
    base.parishHiddenReason = row.parish_hidden_reason || '';
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
    skillsContactFallback:
      settings.skillsContactFallback || 'Contact the parish office if a direct published contact is unavailable.',
    householdVerificationIntervalDays: Number(settings.householdVerificationIntervalDays || 365),
  };
}
async function assertFeatureEnabled(env, parishId, { activation = false, memberSearch = false } = {}) {
  const settings = await featureSettings(env, parishId);
  if (!settings.directoryEnabled || !settings.skillsDirectoryEnabled) {
    throw new DirectoryServiceError(
      'feature_disabled',
      'Skills & Service Directory is not enabled for this parish.',
      403
    );
  }
  if (activation && settings.skillsStaffOnlyMode) {
    throw new DirectoryServiceError('feature_disabled', 'Skills & Service Directory is currently staff-only.', 403);
  }
  if (
    memberSearch &&
    (!settings.ordinaryMemberAccessEnabled || !settings.skillsMemberSearchEnabled || settings.skillsStaffOnlyMode)
  ) {
    throw new DirectoryServiceError('not_found', 'Skills & Service Directory is not available.', 404);
  }
  return settings;
}
async function assertAdultSelf(context, env, parishId) {
  if (!context.claimed || !context.currentPerson?.id)
    throw new DirectoryServiceError('unclaimed', 'Claim a directory person before using skills.', 403);
  const personId = context.currentPerson.id;
  const flags = await getPersonPrivacyFlags(env, { parishId, personId });
  if (flags.isChild || flags.protectedPerson)
    throw new DirectoryServiceError('forbidden', 'This person cannot be listed in Skills & Service.', 403);
  const row = await d1First(env, 'SELECT date_of_birth FROM directory_people WHERE id = ?1 AND active = 1', personId);
  if (!row?.date_of_birth) {
    if ((context.manageableHouseholds || []).length) return personId;
    throw new DirectoryServiceError(
      'adult_evidence_required',
      'Adult status must be recorded before skills can be published.',
      403
    );
  }
  const birthday = Date.parse(`${row.date_of_birth}T00:00:00Z`);
  if (!Number.isFinite(birthday) || Date.now() - birthday < 18 * 365.2425 * 864e5) {
    throw new DirectoryServiceError('child_not_allowed', 'Children cannot be listed in Skills & Service.', 403);
  }
  return personId;
}
async function loadSkill(env, { parishId, skillId }) {
  const row = await d1First(
    env,
    'SELECT * FROM directory_skill_catalog WHERE id = ?1 AND (parish_id IS NULL OR parish_id = ?2)',
    cleanText(skillId, { required: true, max: 180, field: 'skillId' }),
    parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Skill was not found.', 404);
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
    cleanText(listingId, { required: true, max: 180, field: 'listingId' })
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Skill listing was not found.', 404);
  return row;
}
async function publishedContact(env, { parishId, personId, preference, fallback }) {
  if (preference === 'no_direct_contact') return { label: 'No direct contact', value: '', type: 'none' };
  if (preference === 'ask_in_person') return { label: 'Ask in person', value: '', type: 'in_person' };
  if (preference === 'parish_office') return { label: fallback, value: '', type: 'parish_office' };
  const contactType = preference === 'published_phone' ? 'phone' : 'email';
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
  if (!row) return { label: fallback, value: '', type: 'parish_office' };
  return { label: row.label || contactType, value: row.value, type: row.contact_type };
}
async function visibleSkillRows(env, context, { admin = false } = {}) {
  const settings = await assertFeatureEnabled(env, context.parishId, { memberSearch: !admin });
  const visibilityClause = admin
    ? "l.visibility IN ('parish_staff', 'directory_members', 'private')"
    : "l.visibility = 'directory_members'";
  const statusClause = admin
    ? "l.status IN ('active','paused','hidden_by_parish','withdrawn','draft')"
    : "l.status = 'active'";
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
  return {
    rows: rows.filter((row) => Number(row.is_child || 0) !== 1 && (admin || Number(row.protected_person || 0) !== 1)),
    settings,
  };
}
export {
  CATALOG_CAPS,
  CATEGORIES,
  CONTACT_PREFS,
  DIRECTORY_CAPABILITIES,
  DirectoryServiceError,
  EXPERIENCE,
  MANAGE_CAPS,
  SERVICE_MODES,
  SKILL_DISCLAIMER,
  SKILL_POLICY_VERSION,
  STATUSES,
  VIEW_CAPS,
  VISIBILITIES,
  actorFromContext,
  assertAdultSelf,
  assertFeatureEnabled,
  assertParishActor,
  auditStatement,
  cleanText,
  csvEscape,
  d1All,
  d1First,
  enumValue,
  featureSettings,
  generateSecret,
  getDirectorySettings,
  getPersonPrivacyFlags,
  householdVerificationStatus,
  limitFor,
  listingDto,
  listingRow,
  loadSkill,
  nextCursor,
  normalizeQuery,
  nowMs,
  offsetFor,
  parishIdFor,
  publishedContact,
  runAtomic,
  safeJson,
  skillDto,
  timestampSlug,
  visibleSkillRows,
};
