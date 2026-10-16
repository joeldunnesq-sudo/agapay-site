import type {
  SelfServiceSqlRow,
  SelfPrivacyFlags,
  SelfHousehold,
  SelfActorContext,
} from './self-service-composition-contracts.js';

import { generateSecret } from '../lib/core.js';

import '../lib/authorization.js';

import { DirectoryServiceError } from './foundation.js';

import { listActiveAddressesForOwner, listActiveContactsForOwner } from './contacts.js';

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
export const EDITABLE_PERSON_FIELDS = Object.freeze([
  'preferredName',
  'middleName',
  'suffix',
  'dateOfBirth',
  'birthdayVisibility',
]);
export const REVIEW_PERSON_FIELDS = Object.freeze(['legalName', 'biologicalSex', 'deceased', 'active', 'notes']);
export const EDITABLE_HOUSEHOLD_FIELDS = Object.freeze(['displayName', 'anniversaryDate', 'anniversaryVisibility']);
export const CHANGE_REQUEST_TYPES = Object.freeze([
  'person_profile_review',
  'household_membership_add',
  'household_membership_remove',
  'household_relationship_change',
  'household_move_request',
  'household_merge_review',
]);
export function toBool(value: unknown) {
  return Number(value || 0) === 1;
}
export function cleanDate(value: unknown, field: string) {
  const cleaned = cleanText(value, { max: 10, field });
  if (!cleaned) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new DirectoryServiceError('validation_failed', `${field} must use YYYY-MM-DD format.`);
  }
  return cleaned;
}
export function normalizeStarterParishId(value: unknown) {
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
export function normalizeStarterVisibility(value: unknown, fallback: string = 'private') {
  const cleaned = cleanText(value || fallback, { max: 40, field: 'visibility' }) || fallback;
  if (!['private', 'staff', 'directory_members'].includes(cleaned)) {
    throw new DirectoryServiceError('validation_failed', 'Choose a supported directory sharing option.', 422);
  }
  return cleaned;
}
export function personDto(row: SelfServiceSqlRow | null, flags: SelfPrivacyFlags = {}) {
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
export function householdDto(row: SelfServiceSqlRow): SelfHousehold;
export function householdDto(row: SelfServiceSqlRow | null): SelfHousehold | null;
export function householdDto(row: SelfServiceSqlRow | null) {
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
export function affiliationDto(row: SelfServiceSqlRow) {
  return {
    parishId: row.parish_id,
    status: row.status,
    active: toBool(row.active),
  };
}
export function memberDto(row: SelfServiceSqlRow) {
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
export function contactDto(row: Awaited<ReturnType<typeof listActiveContactsForOwner>>[number]) {
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
export function addressDto(row: Awaited<ReturnType<typeof listActiveAddressesForOwner>>[number]) {
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
export function requestDto(row: SelfServiceSqlRow) {
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
export function selfActor(context: SelfActorContext, parishId: unknown) {
  return {
    userId: context.user.id,
    parishId,
    personId: context.currentPerson?.id,
    capabilities: [DIRECTORY_CAPABILITIES.selfManage, 'directory.invitations.manage'],
  };
}
export function assertExpectedVersion(existingVersion: unknown, expectedVersion: unknown) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new DirectoryServiceError('stale_update_required', 'A current record version is required.', 409);
  }
  if (Number(expectedVersion) !== Number(existingVersion)) {
    throw new DirectoryServiceError('stale_update', 'This directory record changed before your update was saved.', 409);
  }
}
export function assertNoUnknownFields(
  patch: Record<string, unknown>,
  allowed: readonly string[],
  reviewable: readonly string[] = []
) {
  const known = new Set([...allowed, ...reviewable, 'expectedVersion']);
  const unknown = Object.keys(patch || {}).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new DirectoryServiceError('protected_field_denied', `This field cannot be changed here: ${unknown[0]}.`, 403);
  }
}
export async function notificationStatement({
  context,
  parishId,
  eventType,
  targetType,
  targetId,
  householdId = '',
  safeMessage,
  metadata = null,
}: {
  context: SelfActorContext;
  parishId: unknown;
  eventType: string;
  targetType: unknown;
  targetId: unknown;
  householdId?: unknown;
  safeMessage: string;
  metadata?: Record<string, unknown> | null;
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
