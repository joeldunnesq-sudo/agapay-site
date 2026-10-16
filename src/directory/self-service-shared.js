// Generated from src/directory/self-service-shared.ts by npm run build:server. Do not edit.
import { generateSecret } from '../lib/core.js';
import '../lib/authorization.js';
import { DirectoryServiceError } from './foundation.js';
import './invitations.js';
import './privacy.js';
import './publication.js';
import { cleanText, DIRECTORY_CAPABILITIES, maskValue, nowMs, safeJson } from './shared.js';
import './self-service-context.js';
import './self-service-profile.js';
import './self-service-namedays.js';
import './self-service-household-members.js';
import './self-service-contact-privacy.js';
import './self-service-requests.js';
import './self-service-invitations.js';
const EDITABLE_PERSON_FIELDS = Object.freeze([
  'preferredName',
  'middleName',
  'suffix',
  'dateOfBirth',
  'birthdayVisibility',
]);
const REVIEW_PERSON_FIELDS = Object.freeze(['legalName', 'biologicalSex', 'deceased', 'active', 'notes']);
const EDITABLE_HOUSEHOLD_FIELDS = Object.freeze(['displayName', 'anniversaryDate', 'anniversaryVisibility']);
const CHANGE_REQUEST_TYPES = Object.freeze([
  'person_profile_review',
  'household_membership_add',
  'household_membership_remove',
  'household_relationship_change',
  'household_move_request',
  'household_merge_review',
]);
function toBool(value) {
  return Number(value || 0) === 1;
}
function cleanDate(value, field) {
  const cleaned = cleanText(value, { max: 10, field });
  if (!cleaned) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new DirectoryServiceError('validation_failed', `${field} must use YYYY-MM-DD format.`);
  }
  return cleaned;
}
function normalizeStarterParishId(value) {
  const cleaned = cleanText(value, { required: true, max: 160, field: 'parishId' });
  if (!/^[a-z0-9][a-z0-9_.-]{1,159}$/i.test(cleaned)) {
    throw new DirectoryServiceError(
      'validation_failed',
      'Choose a parish before starting your directory profile.',
      422
    );
  }
  return cleaned;
}
function normalizeStarterVisibility(value, fallback = 'private') {
  const cleaned = cleanText(value || fallback, { max: 40, field: 'visibility' }) || fallback;
  if (!['private', 'staff', 'directory_members'].includes(cleaned)) {
    throw new DirectoryServiceError('validation_failed', 'Choose a supported directory sharing option.', 422);
  }
  return cleaned;
}
function personDto(row, flags = {}) {
  if (!row) return null;
  return {
    id: row.id,
    preferredName: row.preferred_name,
    legalName: row.legal_name || '',
    middleName: row.middle_name || '',
    suffix: row.suffix || '',
    dateOfBirth: row.date_of_birth || '',
    biologicalSex: row.biological_sex || 'unknown',
    active: toBool(row.active),
    protectedPerson: Boolean(flags.protectedPerson),
    child: Boolean(flags.isChild),
    version: Number(row.updated_at || 0),
  };
}
function householdDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    displayName: row.display_name,
    anniversaryDate: row.anniversary_date || '',
    anniversaryVisibility: row.anniversary_visibility || 'private',
    active: toBool(row.active),
    version: Number(row.updated_at || 0),
  };
}
function affiliationDto(row) {
  return {
    parishId: row.parish_id,
    status: row.status,
    active: toBool(row.active),
  };
}
function memberDto(row) {
  return {
    personId: row.person_id,
    preferredName: row.preferred_name,
    dateOfBirth: row.date_of_birth || '',
    relationship: row.relationship,
    child: toBool(row.is_child),
    protectedPerson: toBool(row.protected_person),
    accountLinked: toBool(row.account_linked),
    version: Number(row.person_updated_at || 0),
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
    version: row.updatedAt,
  };
}
function addressDto(row) {
  return {
    id: row.id,
    addressType: row.addressType,
    line1: row.protectedAddress ? '' : row.line1,
    line2: row.protectedAddress ? '' : row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.protectedAddress ? '' : row.postalCode,
    country: row.country,
    primary: row.primary,
    protectedAddress: row.protectedAddress,
    visibility: row.visibility,
    active: row.active,
    version: row.updatedAt,
  };
}
function requestDto(row) {
  return {
    id: row.id,
    parishId: row.parish_id,
    requestType: row.request_type,
    targetType: row.target_type,
    targetId: row.target_id,
    householdId: row.household_id || '',
    status: row.status,
    summary: row.summary,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}
function selfActor(context, parishId) {
  return {
    userId: context.user.id,
    parishId,
    personId: context.currentPerson?.id,
    capabilities: [DIRECTORY_CAPABILITIES.selfManage, 'directory.invitations.manage'],
  };
}
function assertExpectedVersion(existingVersion, expectedVersion) {
  if (expectedVersion === void 0 || expectedVersion === null) {
    throw new DirectoryServiceError('stale_update_required', 'A current record version is required.', 409);
  }
  if (Number(expectedVersion) !== Number(existingVersion)) {
    throw new DirectoryServiceError('stale_update', 'This directory record changed before your update was saved.', 409);
  }
}
function assertNoUnknownFields(patch, allowed, reviewable = []) {
  const known = /* @__PURE__ */ new Set([...allowed, ...reviewable, 'expectedVersion']);
  const unknown = Object.keys(patch || {}).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new DirectoryServiceError('protected_field_denied', `This field cannot be changed here: ${unknown[0]}.`, 403);
  }
}
async function notificationStatement({
  context,
  parishId,
  eventType,
  targetType,
  targetId,
  householdId = '',
  safeMessage,
  metadata = null,
}) {
  return {
    sql: `INSERT INTO directory_notification_events
            (id, parish_id, recipient_user_id, actor_user_id, event_type, target_type, target_id,
             household_id, safe_message, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      generateSecret('dir_note'),
      parishId,
      context.user.id,
      context.user.id,
      eventType,
      targetType,
      targetId,
      householdId || null,
      safeMessage,
      safeJson(metadata),
      nowMs(),
    ],
  };
}
export {
  CHANGE_REQUEST_TYPES,
  EDITABLE_HOUSEHOLD_FIELDS,
  EDITABLE_PERSON_FIELDS,
  REVIEW_PERSON_FIELDS,
  addressDto,
  affiliationDto,
  assertExpectedVersion,
  assertNoUnknownFields,
  cleanDate,
  contactDto,
  householdDto,
  memberDto,
  normalizeStarterParishId,
  normalizeStarterVisibility,
  notificationStatement,
  personDto,
  requestDto,
  selfActor,
  toBool,
};
